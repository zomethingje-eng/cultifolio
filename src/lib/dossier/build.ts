/**
 * The dossier builder. Runs unchanged in Node (offline corpus) and in the
 * Worker (tail builds). Every upstream's answer is recorded as ok / none /
 * refused / error, and only "none" may ever be rendered as an absence.
 *
 * The builder never publishes a dossier if the taxonomy step failed; every
 * other section degrades independently and says so.
 */
import type { JsonFetcher } from './fetch';
import * as gbif from './sources/gbif';
import * as inat from './sources/inat';
import * as wm from './sources/wikimedia';
import { literature } from './sources/openalex';
import { tdwgCode, tdwgLabel, TDWG3 } from './tdwg';
import { licenceTag, isOpen } from '$core/licence';
import { slugify, parseName } from '$core/names';
import { habitatCluster, habitatCentre, haversineKm, inBox, type Box } from '$core/geo';
import { DOSSIER_V, parseDossier, type Dossier, type OccPoint, type Photo, type Climate, type Upstream } from './schema';

export interface ClimateProvider {
  /** Given a habitat centroid, return climate or a pending/none/refused state. */
  at(lat: number, lon: number): Promise<Climate>;
}

export const noClimate: ClimateProvider = { at: async () => ({ status: 'pending', detail: 'climate provider not configured' }) };

export interface BuildOptions {
  fetcher: JsonFetcher;
  climate?: ClimateProvider;
  builtBy: 'node' | 'worker';
  now?: () => Date;
  /** Skip slow, non-load-bearing sources (literature, commons) for a quick first pass. */
  quick?: boolean;
  /** Sources to leave out of this build, recorded as skipped so a later pass can fill them. */
  skip?: Array<'openalex'>;
}

export type BuildResult = { ok: true; dossier: Dossier } | { ok: false; reason: 'name-unresolved' | 'higher-rank-only' | 'backbone-refused'; detail?: string };

const u = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const countryNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (iso?: string): string | undefined => {
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return undefined;
  try {
    return countryNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
};

export async function buildDossier(nameOrKey: string | number, o: BuildOptions): Promise<BuildResult> {
  const f = o.fetcher;
  const now = () => (o.now ? o.now() : new Date()).toISOString();
  const upstream: Record<string, Upstream> = {};
  const mark = (src: string, r: { status: 'ok' | 'none' | 'refused' | 'error'; detail?: string }) => {
    upstream[src] = { status: r.status, at: now(), detail: r.status === 'ok' || r.status === 'none' ? undefined : r.detail };
  };

  /* ---- 1. Taxonomy (load-bearing) ---- */
  let key: number;
  if (typeof nameOrKey === 'number') key = nameOrKey;
  else {
    const m = await gbif.matchName(f, nameOrKey);
    mark('gbif.match', m);
    if (m.status === 'none') return { ok: false, reason: 'name-unresolved' };
    if (m.status !== 'ok') return { ok: false, reason: 'backbone-refused', detail: m.detail };
    // GBIF quietly falls back to the species when it cannot place an infraspecific name, and to the genus when it cannot place a species. Refuse both rather than build the wrong page.
    const asked = parseName(nameOrKey);
    const askedInfra = /\b(subsp\.|var\.|f\.)\s/.test(asked.scientific);
    const got = (m.data.canonicalName ?? m.data.scientificName ?? '').toLowerCase();
    if (m.data.matchType === 'HIGHERRANK' || (askedInfra && !/subsp|var|f\.|subspecies|variety|form/i.test(m.data.rank ?? '')) || (!askedInfra && asked.epithet && !got.includes(asked.epithet)))
      return { ok: false, reason: 'higher-rank-only', detail: `backbone offered ${m.data.canonicalName ?? m.data.scientificName} (${m.data.rank?.toLowerCase() ?? '?'})` };
    key = m.data.usageKey;
  }
  const sp = await gbif.species(f, key);
  mark('gbif.species', sp);
  if (sp.status !== 'ok') return { ok: false, reason: sp.status === 'none' ? 'name-unresolved' : 'backbone-refused', detail: sp.status === 'none' ? undefined : sp.detail };
  const s = sp.data;
  const scientific = s.canonicalName ?? s.scientificName;
  const status = /accepted/i.test(s.taxonomicStatus ?? '') ? 'accepted' : /synonym/i.test(s.taxonomicStatus ?? '') ? 'synonym' : /doubtful/i.test(s.taxonomicStatus ?? '') ? 'doubtful' : 'unknown';

  const [syn, vern] = await Promise.all([gbif.synonyms(f, key), gbif.vernacular(f, key)]);
  mark('gbif.synonyms', syn);
  mark('gbif.vernacular', vern);

  /* ---- 2. Distribution (WCVP via GBIF) ---- */
  const dist = await gbif.distributions(f, key);
  mark('wcvp.distribution', dist);
  const native: Dossier['distribution']['native'] = [];
  const introduced: Dossier['distribution']['native'] = [];
  const boxes: Box[] = [];
  const fromWcvp = dist.status === 'ok' && dist.data.wcvp;
  if (dist.status === 'ok') {
    for (const d of dist.data.rows) {
      const code = fromWcvp ? tdwgCode(d.locationId, d.locality) : null;
      const region = { code: code ?? undefined, name: code ? tdwgLabel(code) : countryName(d.country) ?? d.locality ?? '?', box: code ? TDWG3[code] : undefined };
      const intro = /introduced|naturali[sz]ed|cultivated|invasive|managed/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`);
      (intro ? introduced : native).push(region);
      if (!intro && region.box) boxes.push(region.box);
    }
  }

  /* ---- 3. Occurrences, licence-filtered, corroborated against the range ---- */
  const occ = await gbif.occurrences(f, key);
  mark('gbif.occurrences', occ);
  const open: OccPoint[] = [];
  const restrictedInRange: Array<[number, number]> = [];
  let nOutside = 0;
  const datasets = new Map<string, { title?: string; licence: string; n: number }>();
  if (occ.status === 'ok') {
    const seen = new Set<string>();
    for (const r of occ.data) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) continue;
      if (r.basisOfRecord === 'LIVING_SPECIMEN') continue; // a plant somebody planted
      if (/introduced|managed|cultivated/i.test(`${r.establishmentMeans ?? ''} ${r.degreeOfEstablishment ?? ''}`)) continue;
      const lat = +r.decimalLatitude.toFixed(3),
        lon = +r.decimalLongitude.toFixed(3);
      const dk = `${lat},${lon}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      const tag = licenceTag(r.license);
      const dsKey = r.datasetKey ?? '?';
      const ds = datasets.get(dsKey) ?? { title: r.datasetName ?? undefined, licence: tag ?? 'unstated', n: 0 };
      ds.n++;
      datasets.set(dsKey, ds);
      const inRange = boxes.length ? boxes.some((b) => inBox(lat, lon, b)) : true;
      if (!inRange) {
        nOutside++;
        continue;
      }
      if (isOpen(tag)) open.push([lat, lon, r.year ?? null, r.countryCode ?? null, r.basisOfRecord ?? null, tag!]);
      else restrictedInRange.push([lat, lon]);
    }
  }
  // The habitat centre is a derived number, so every in-range coordinate may inform it, whatever its
  // licence; only the open records themselves are published (on the map and in the dossier).
  const openPts = open.map((p) => [p[0], p[1]] as [number, number]);
  const allPts = [...openPts, ...restrictedInRange];
  const cluster = habitatCluster(allPts);
  const openCluster = cluster && openPts.length ? habitatCluster(openPts, [cluster.cell]) : null;
  const restrictedShiftKm = cluster && openCluster && restrictedInRange.length ? Math.round(haversineKm(openCluster.lat, openCluster.lon, cluster.lat, cluster.lon)) : null;

  /* ---- 4. Centroid and climate ---- */
  let centroid: Dossier['centroid'] | undefined;
  let climate: Climate = { status: 'none', detail: 'no habitat centroid' };
  if (occ.status === 'refused' || occ.status === 'error') climate = { status: 'refused', detail: 'occurrence source did not answer' };
  // Three agreeing records are enough to place a habitat centre for a narrow endemic; the page says how thin the evidence is.
  else if (cluster && cluster.dominant && allPts.length >= 3) {
    const at = habitatCentre(cluster);
    centroid = {
      lat: +at.lat.toFixed(3),
      lon: +at.lon.toFixed(3),
      n: cluster.n,
      share: +cluster.share.toFixed(2),
      how: `the record nearest the middle of the densest ${at.refined ? `1° population inside the densest ${cluster.cell}° block` : `${cluster.cell}° cluster`} of all ${allPts.length} in-range records ${boxes.length ? 'inside the stated native range' : '(no stated range to test against)'}`
    };
    climate = await (o.climate ?? noClimate).at(centroid.lat, centroid.lon);
  } else if (cluster && !cluster.dominant && allPts.length >= 3) climate = { status: 'none', detail: 'records form disjunct populations; no cluster dominates even at 4°' };
  else if (allPts.length && allPts.length < 3) climate = { status: 'none', detail: `only ${allPts.length} georeferenced record${allPts.length === 1 ? '' : 's'} inside the range` };
  if (climate.status === 'pending') upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
  else mark('climate', climate.status === 'ok' ? { status: 'ok' } : { status: climate.status, detail: climate.detail });

  /* ---- 5. Identifiers, summary ---- */
  const ids: Dossier['ids'] = { gbif: key };
  const links: Record<string, string> = { gbif: `https://www.gbif.org/species/${key}` };
  const x = await wm.crossIds(f, scientific);
  mark('wikidata', x);
  let enTitle = scientific;
  if (x.status === 'ok') {
    Object.assign(ids, { wikidata: x.data.wikidata, powo: x.data.powo, ipni: x.data.ipni, inat: x.data.inat, wfo: x.data.wfo });
    if (x.data.enTitle) enTitle = x.data.enTitle;
    if (x.data.powo) links.powo = `https://powo.science.kew.org/taxon/${x.data.powo}`;
    if (x.data.ipni) links.ipni = `https://www.ipni.org/n/${x.data.ipni}`;
    if (x.data.wfo) links.wfo = `https://www.worldfloraonline.org/taxon/${x.data.wfo}`;
    links.wikidata = `https://www.wikidata.org/wiki/${x.data.wikidata}`;
  }
  let summary: Dossier['summary'];
  const w = await wm.summary(f, enTitle);
  mark('wikipedia', w);
  if (w.status === 'ok') {
    summary = { text: w.data.text, source: 'wikipedia', url: w.data.url, licence: 'CC BY-SA 4.0', title: w.data.title };
    ids.wikipedia = w.data.title;
    links.wikipedia = w.data.url;
  }

  /* ---- 6. Photographs: iNat (open licences only), then Commons, then GBIF media ---- */
  const photos: Photo[] = [];
  let inatId = ids.inat;
  if (!inatId) {
    const t = await inat.taxon(f, scientific);
    mark('inat.taxon', t);
    if (t.status === 'ok') inatId = ids.inat = t.data.id;
  }
  if (inatId) {
    links.inat = `https://www.inaturalist.org/taxa/${inatId}`;
    const wild = await inat.photos(f, inatId, true, 24);
    mark('inat.photos.wild', wild);
    if (wild.status === 'ok') photos.push(...wild.data);
    const cult = await inat.photos(f, inatId, false, 12);
    mark('inat.photos.cultivated', cult);
    if (cult.status === 'ok') photos.push(...cult.data);
  }
  if (!o.quick && photos.length < 12) {
    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
    const c = await wm.commonsPhotos(f, cat, 12);
    mark('commons', c);
    if (c.status === 'ok') photos.push(...c.data);
  }
  if (!o.quick && photos.length < 6) {
    const m = await gbif.media(f, key);
    mark('gbif.media', m);
    if (m.status === 'ok')
      for (const im of m.data)
        photos.push({ src: 'gbif', id: im.id, url: im.url, thumb: `https://api.gbif.org/v1/image/cache/fit-in/400x/${encodeURIComponent(im.url)}`, licence: im.licence as Photo['licence'], attribution: `${im.creator ?? im.rightsHolder ?? 'unknown'}, ${im.licence.toUpperCase()} via GBIF`, page: im.page });
  }

  /* ---- 7. Literature (not load-bearing) ---- */
  let papers: Dossier['literature'] = [];
  if (!o.quick && !o.skip?.includes('openalex')) {
    const l = await literature(f, scientific);
    mark('openalex', l);
    if (l.status === 'ok') papers = l.data;
  } else upstream.openalex = { status: 'skipped', at: now() };

  const classification = (['kingdom', 'phylum', 'class', 'order', 'family', 'genus'] as const)
    .filter((r) => s[r])
    .map((r) => ({ rank: r, name: s[r] as string, key: u(s[`${r}Key` as keyof typeof s] as number | null | undefined) }));

  const dossier: Dossier = {
    v: DOSSIER_V,
    key,
    slug: slugify(scientific),
    built: now(),
    builtBy: o.builtBy,
    name: {
      scientific,
      authorship: u(s.authorship),
      rank: u(s.rank),
      status,
      acceptedKey: u(s.acceptedKey),
      acceptedName: u(s.accepted),
      family: u(s.family),
      genus: u(s.genus),
      order: u(s.order),
      classification,
      synonyms: syn.status === 'ok' ? syn.data : [],
      vernacular: vern.status === 'ok' ? vern.data : []
    },
    ids,
    summary,
    distribution: { native, introduced, source: dist.status !== 'ok' ? 'not available' : fromWcvp ? 'WCVP (Govaerts, RBG Kew) via GBIF' : 'national checklists via GBIF (country level; no WCVP entry for this name)', boxes },
    occurrences: {
      open,
      nOpenInRange: open.length,
      nRestrictedInRange: restrictedInRange.length,
      nOutsideRange: nOutside,
      restrictedShiftKm,
      thin: allPts.length < 12,
      datasets: [...datasets.entries()].map(([k, d]) => ({ key: k, title: u(d.title), licence: d.licence, n: d.n }))
    },
    centroid,
    climate,
    photos,
    literature: papers,
    links,
    upstream
  };
  // Never publish something the schema will refuse to serve.
  return { ok: true, dossier: parseDossier(dossier) };
}
