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
  /** The envelope across every in-range record's grid cell: what a species page carries. */
  envelope(points: Array<[number, number]>): Promise<Climate>;
  /** One point's cell (a bench, a garden): median and percentiles coincide. */
  at(lat: number, lon: number): Promise<Climate>;
}

const pending = async (): Promise<Climate> => ({ status: 'pending', detail: 'climate provider not configured' });
export const noClimate: ClimateProvider = { envelope: pending, at: pending };

export interface BuildOptions {
  fetcher: JsonFetcher;
  climate?: ClimateProvider;
  builtBy: 'node' | 'worker';
  now?: () => Date;
  /** Skip slow, non-load-bearing sources (literature, commons) for a quick first pass. */
  quick?: boolean;
  /** Sources to leave out of this build, recorded as skipped so a later pass (or a carry from the previous build) can fill them. */
  skip?: SkippableSource[];
  /** GBIF's media (the photographs on occurrence records) is asked for first, not only when other sources gave under six: set when a download supplies it at no cost. */
  mediaFirst?: boolean;
}
export type SkippableSource = 'openalex' | 'wikidata' | 'wikipedia' | 'inat' | 'commons' | 'gbif.media';
/** Everything that is not the backbone, the range, the records or the climate: what a re-derivation can carry over from the previous build. */
export const NETWORK_EXTRAS: SkippableSource[] = ['wikidata', 'wikipedia', 'inat', 'commons', 'gbif.media', 'openalex'];

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
  let sp = await gbif.species(f, key);
  mark('gbif.species', sp);
  if (sp.status !== 'ok') return { ok: false, reason: sp.status === 'none' ? 'name-unresolved' : 'backbone-refused', detail: sp.status === 'none' ? undefined : sp.detail };
  // A name the backbone holds as a synonym is followed to the species it accepts: the records, the
  // range and the photographs are indexed under that name, and a page under the synonym would be
  // empty. The page says which name was asked for; the synonym stays in the synonym list.
  if (/synonym/i.test(sp.data.taxonomicStatus ?? '') && sp.data.acceptedKey && sp.data.acceptedKey !== key) {
    const from = sp.data.canonicalName ?? sp.data.scientificName;
    let acc = await gbif.species(f, sp.data.acceptedKey);
    if (acc.status === 'refused' || acc.status === 'error') return { ok: false, reason: 'backbone-refused', detail: acc.detail };
    // The accepted taxon may be a subspecies or variety (Epilobium angustifolium → Chamaenerion angustifolium subsp.
    // angustifolium): the page is the species', so go one more step up.
    let via = '';
    if (acc.status === 'ok' && !/^species$/i.test(acc.data.rank ?? '') && acc.data.speciesKey && acc.data.speciesKey !== acc.data.key) {
      via = `, a synonym of ${acc.data.canonicalName ?? acc.data.scientificName}`;
      acc = await gbif.species(f, acc.data.speciesKey);
      if (acc.status === 'refused' || acc.status === 'error') return { ok: false, reason: 'backbone-refused', detail: acc.detail };
    }
    if (acc.status === 'ok' && /^species$/i.test(acc.data.rank ?? '')) {
      upstream['gbif.accepted'] = { status: 'ok', at: now(), detail: `followed from ${from}, which the backbone holds as a synonym${via}` };
      key = acc.data.key;
      sp = acc;
    } else if (acc.status === 'none') {
      // The backbone points at an accepted taxon it then cannot serve: no page can be built under the synonym either.
      return { ok: false, reason: 'name-unresolved', detail: `${from} is a synonym of backbone key ${sp.data.acceptedKey}, which the backbone did not serve` };
    } else if (acc.status === 'ok') {
      upstream['gbif.accepted'] = { status: 'none', at: now(), detail: `${from} is a synonym of ${acc.data.canonicalName ?? acc.data.scientificName} (${acc.data.rank?.toLowerCase() ?? 'rank unknown'}), which is not a species; the page stays under the synonym` };
    }
  }
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
  const reported: Dossier['distribution']['native'] = [];
  const extinct: Dossier['distribution']['native'] = [];
  const boxes: Box[] = [];
  const fromWcvp = dist.status === 'ok' && dist.data.wcvp;
  if (dist.status === 'ok') {
    for (const d of dist.data.rows) {
      const code = fromWcvp ? tdwgCode(d.locationId, d.locality) : null;
      const region = { code: code ?? undefined, name: code ? tdwgLabel(code) : countryName(d.country) ?? d.locality ?? '?', box: code ? TDWG3[code] : undefined };
      const intro = /introduced|naturali[sz]ed|cultivated|invasive|managed/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`);
      const nativeSaid = /native|indigenous|endemic/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`);
      // WCVP states native or introduced for every row. A national checklist that says neither is a
      // report of presence, not a native range: it is kept as such and never promoted to native.
      // A region where WCVP says the plant is extinct is part of its history, not its habitat.
      if (intro) introduced.push(region);
      else if (/extinct/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`)) extinct.push(region);
      else if (fromWcvp || nativeSaid) {
        native.push(region);
        if (region.box) boxes.push(region.box);
      } else reported.push(region);
    }
  }
  const verified = fromWcvp && native.length > 0;
  const ambiguous = dist.status === 'ok' ? dist.data.ambiguous : undefined;
  const kew = dist.status === 'ok' && dist.data.kew && (dist.data.kew.lifeform || dist.data.kew.climate) ? dist.data.kew : undefined;

  /* ---- 3. Occurrences, licence-filtered, corroborated against the range ---- */
  const occ = await gbif.occurrences(f, key);
  mark('gbif.occurrences', occ);
  // Records from a GBIF download are cited by its DOI; records from the search API by the API.
  if (occ.status === 'ok') {
    const doi = occ.data.find((r) => r.downloadDoi)?.downloadDoi;
    upstream['gbif.occurrences'].detail = doi ? `GBIF occurrence download https://doi.org/${doi}` : 'GBIF occurrence search API';
  }
  const open: OccPoint[] = [];
  const restrictedInRange: Array<[number, number]> = [];
  /** In-range coordinates precise enough to read climate at (uncertainty under 10 km, or unstated). */
  const forClimate: Array<[number, number]> = [];
  let nOutside = 0,
    nVague = 0;
  const datasets = new Map<string, { title?: string; licence: string; n: number }>();
  if (occ.status === 'ok') {
    // Same coordinate to three decimals is one place; when an open and a restricted record share it, the
    // open one is the one kept, so a licence never hides a record the map could show.
    const byCoord = new Map<string, (typeof occ.data)[number]>();
    for (const r of occ.data) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) continue;
      if (r.basisOfRecord === 'LIVING_SPECIMEN') continue; // a plant somebody planted
      if (/introduced|managed|cultivated/i.test(`${r.establishmentMeans ?? ''} ${r.degreeOfEstablishment ?? ''}`)) continue;
      const dk = `${+r.decimalLatitude.toFixed(3)},${+r.decimalLongitude.toFixed(3)}`;
      const held = byCoord.get(dk);
      if (!held || (!isOpen(licenceTag(held.license)) && isOpen(licenceTag(r.license)))) byCoord.set(dk, r);
    }
    for (const r of byCoord.values()) {
      const lat = +r.decimalLatitude!.toFixed(3),
        lon = +r.decimalLongitude!.toFixed(3);
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
      if ((r.coordinateUncertaintyInMeters ?? 0) <= 10_000) forClimate.push([lat, lon]);
      else nVague++;
    }
  }
  // The envelope and the map marker are derived numbers, so every in-range coordinate may inform them,
  // whatever its licence; only the open records themselves are published (on the map and in the dossier).
  const openPts = open.map((p) => [p[0], p[1]] as [number, number]);
  const allPts = [...openPts, ...restrictedInRange];
  const cluster = habitatCluster(allPts);
  const openCluster = cluster && openPts.length ? habitatCluster(openPts, [cluster.cell]) : null;
  const restrictedShiftKm = cluster && openCluster && restrictedInRange.length ? Math.round(haversineKm(openCluster.lat, openCluster.lon, cluster.lat, cluster.lon)) : null;

  /* ---- 4. The map marker, and the climate envelope ---- */
  // The marker is where the records are densest: a place to put the pin, nothing more. The climate is
  // read across every in-range record's cell, so no single population decides it.
  let centroid: Dossier['centroid'] | undefined;
  // Without a verified range the records cannot be told from cultivation, so there is no population to mark either.
  if (cluster && cluster.n >= 3 && verified && boxes.length) {
    const at = habitatCentre(cluster, openPts);
    centroid = {
      lat: at.lat,
      lon: at.lon,
      n: cluster.n,
      share: +cluster.share.toFixed(2),
      how: `the map marker: ${at.snapped === 'open-record' ? 'the openly licensed record nearest' : 'the centre of the tenth-degree cell nearest (no openly licensed record lies in the population, so no record\'s coordinates are published)'} the middle of the densest ${at.refined ? `1° population inside the densest ${cluster.cell}° block` : `${cluster.cell}° population`} of the ${allPts.length} in-range records; the climate is not read here but across every record's cell`
    };
  }
  let climate: Climate = { status: 'none', detail: 'no georeferenced record inside the range' };
  if (occ.status === 'refused' || occ.status === 'error') climate = { status: 'refused', detail: 'occurrence source did not answer' };
  else if (dist.status === 'refused' || dist.status === 'error') climate = { status: 'refused', detail: 'distribution source did not answer, so the range could not be verified' };
  // No verified native range means no way to tell a habitat record from a garden one, so no habitat climate: the map stays, the advice does not.
  else if (ambiguous) climate = { status: 'none', detail: `native range not verified: ${ambiguous}` };
  else if (!verified || !boxes.length) climate = { status: 'none', detail: !verified ? 'native range not verified: no WCVP distribution with native status for this name, so records cannot be told from cultivation and no habitat climate is derived' : 'native range is stated at country level only, with no region boxes to test records against' };
  else if (forClimate.length) climate = await (o.climate ?? noClimate).envelope(forClimate);
  else if (allPts.length) climate = { status: 'none', detail: `${allPts.length} in-range record${allPts.length === 1 ? '' : 's'}, none placed to within 10 km` };
  if (climate.status === 'pending') upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
  else mark('climate', climate.status === 'ok' ? { status: 'ok' } : { status: climate.status, detail: climate.detail });

  /* ---- 5. Identifiers, summary ---- */
  const ids: Dossier['ids'] = { gbif: key };
  const links: Record<string, string> = { gbif: `https://www.gbif.org/species/${key}` };
  const skip = (k: SkippableSource) => !!o.skip?.includes(k);
  const skipped = (k: string) => (upstream[k] = { status: 'skipped', at: now() });
  const x = skip('wikidata') ? ({ status: 'skipped' } as const) : await wm.crossIds(f, scientific, key);
  if (x.status === 'skipped') skipped('wikidata');
  else mark('wikidata', x);
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
  const w = skip('wikipedia') ? ({ status: 'skipped' } as const) : await wm.summary(f, enTitle);
  if (w.status === 'skipped') skipped('wikipedia');
  else mark('wikipedia', w);
  if (w.status === 'ok') {
    summary = { text: w.data.text, source: 'wikipedia', url: w.data.url, licence: 'CC BY-SA 4.0', title: w.data.title };
    ids.wikipedia = w.data.title;
    links.wikipedia = w.data.url;
  }

  /* ---- 6. Photographs: iNat (open licences only), then Commons, then GBIF media ---- */
  const photos: Photo[] = [];
  let inatId = ids.inat;
  if (!inatId && !skip('inat')) {
    const t = await inat.taxon(f, scientific);
    mark('inat.taxon', t);
    if (t.status === 'ok') inatId = ids.inat = t.data.id;
  }
  if (skip('inat')) {
    skipped('inat.photos.wild');
    skipped('inat.photos.cultivated');
  } else if (inatId) {
    links.inat = `https://www.inaturalist.org/taxa/${inatId}`;
    const wild = await inat.photos(f, inatId, true, 24);
    mark('inat.photos.wild', wild);
    if (wild.status === 'ok') photos.push(...wild.data);
    const cult = await inat.photos(f, inatId, false, 12);
    mark('inat.photos.cultivated', cult);
    if (cult.status === 'ok') photos.push(...cult.data);
  }
  if (skip('commons')) skipped('commons');
  else if (!o.quick && photos.length < 12) {
    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
    const c = await wm.commonsPhotos(f, cat, 12);
    mark('commons', c);
    if (c.status === 'ok') photos.push(...c.data);
  }
  if (skip('gbif.media')) skipped('gbif.media');
  else if (!o.quick && (o.mediaFirst || photos.length < 6)) {
    const m = await gbif.media(f, key);
    mark('gbif.media', m);
    if (m.status === 'ok')
      for (const im of m.data.slice(0, 24)) {
        // iNaturalist's open-data bucket serves sizes by name; anything else goes through GBIF's image cache.
        const inat = /^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/original\.(\w+)$/.exec(im.url);
        const thumb = inat ? im.url.replace(/original\.(\w+)$/, 'medium.$1') : `https://api.gbif.org/v1/image/cache/fit-in/400x/${encodeURIComponent(im.url)}`;
        photos.push({ src: 'gbif', id: im.id, url: im.url, thumb, licence: im.licence as Photo['licence'], attribution: `${im.creator ?? im.rightsHolder ?? 'unknown'}, ${im.licence.toUpperCase()}, ${inat ? 'iNaturalist via GBIF' : 'via GBIF'}`, page: im.page });
      }
  }

  /* ---- 7. Literature (not load-bearing) ---- */
  let papers: Dossier['literature'] = [];
  if (!o.quick && !skip('openalex')) {
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
    distribution: { native, introduced, reported: reported.length ? reported : undefined, extinct: extinct.length ? extinct : undefined, kew, ambiguous, source: dist.status !== 'ok' ? 'not available' : ambiguous ? 'WCVP (Govaerts, RBG Kew): homonyms, unresolved' : fromWcvp ? 'WCVP (Govaerts, RBG Kew) via GBIF' : 'national checklists via GBIF (presence reported, native status not stated; no WCVP entry for this name)', boxes, verified },
    occurrences: {
      open,
      nOpenInRange: open.length,
      nRestrictedInRange: restrictedInRange.length,
      nOutsideRange: nOutside,
      nVague,
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
