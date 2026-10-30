/**
 * The builder of a page without a GBIF key (round seventy-nine, the owner's decision 1): a species Kew accepts, on the
 * species list, for which GBIF's backbone gives no one key (`$core/no-gbif`). It is never matched to GBIF by its name
 * (rule 3), so it is built from what names it without GBIF:
 *
 *   - **Kew's file** (`scripts/kew-species-load.ts`): the name and its author, the family, Kew's other names for it (its
 *     synonyms), the IPNI and POWO identifiers, the life form and climate class, and the range, each row read by the rule
 *     a page with a GBIF key reads Kew's rows by (`regionsOf`).
 *   - **Wikidata**, by Kew's identifiers, never by GBIF's key: the item carrying the species' IPNI identifier (P961) or POWO
 *     identifier (P5037), taken only when exactly one item does and it is a taxon (`kewItemUrl`, which the batches answer
 *     for many species a query). A GBIF key the item carries is not read: it would be a match the list refused.
 *   - **Wikipedia** through the item's English sitelink, as a page with a GBIF key reads it (`wm.summary`, its proofs).
 *   - **iNaturalist**: the item's taxon, checked with iNaturalist, else the name search; either is taken only when the
 *     taxon's name is one of the species' own (its name or one of Kew's names for it, in any spelling `isOwnName` reads)
 *     and no other species of the reference holds it (`kewInatTaxon`). The search's lenient clause for a taxon of another
 *     name, which a page with a GBIF key has judged at GBIF, is not applied: nothing here can be judged at GBIF.
 *   - **Commons**, as today, by the item's category or the name.
 *
 * GBIF's records are not asked by the species' name, and so neither is anything made from them: the points on the map,
 * the map marker, the habitat climate and GBIF's photographs. Each record of them says "not checked" with `NO_GBIF_WHY`
 * (rule 2), never "none"; the climate is `pending` with that reason, and the pages say it as not checked. Nor are GBIF's
 * species record, synonyms or common names asked: the names are Kew's.
 *
 * Its English common names (round eighty, the owner's decision) are its Wikidata item's taxon common names (P1843), read
 * from the item this route takes, by the rule of `wikidata-names.ts`, and said as Wikidata's (`upstream['wikidata.names']`).
 *
 * Except (round seventy-nine; the owner's decision on K's offer): where Kew's synonymy gives the species GBIF keys of its
 * own (`scripts/extra-keys-kew.txt`, round seventy-three's rule: a GBIF usage whose name and author Kew's file holds as
 * this plant, of its entry's own type, and that no other page of the reference holds or is filed under), the records
 * under those keys are read as any page's are (`readRecords`): the map, the marker, the habitat climate and the record
 * counts, each key named with Kew's reading of it. The page keeps no GBIF key of its own (`ids.gbif` absent); the sign
 * of the records read is `occurrences.keys` (`recordsUnchecked` in `$core/no-gbif`). GBIF's photographs are still not
 * asked for it.
 */
import type { JsonFetcher, FetchResult, SourceResult } from './fetch';
import type { GbifDistribution } from './sources/gbif';
import * as inat from './sources/inat';
import * as wm from './sources/wikimedia';
import * as commons from './sources/commons';
import { LITERATURE_OFF } from './sources/openalex';
import { slugify } from '$core/names';
import { kewPage } from '$core/page-id';
import { NO_GBIF_WHY, NO_GBIF_CLIMATE, noKeyWhy, uncheckedClimate, type Unread } from '$core/no-gbif';
import { viaSource, type RangeVia } from './range-via';
import { ownNames, isOwnName, type OwnNames } from './own-names';
import { canonicalOfKew } from './kew-rows';
import { kewItemUrl, kewAskable, kewItemsOf, entityUrl } from './batch';
import { regionsOf, readRecords, rangeTest, defaultWords, noPlacedWords, extraOccurrences, extraKeyWords, noClimate, INAT_LEFT_TO_FILL, INAT_SETS_LEFT, type BuildResult, type SkippableSource, type ClimateProvider } from './build';
import { institutionWords, type PlaceIndex } from './clean';
import type { ExtraKey, NoKeyLine } from './extra-keys';
import type { Climate } from './schema';
import { dedupePhotos } from './dedupe';
import { DOSSIER_V, parseDossier, setAsideExtremes, lapseSetAside, type Dossier, type Photo, type Upstream } from './schema';
import type { HeldNames } from './photo-kind';
import type { KewInfra } from './kew-infra';
import { statementsOfEntity, wikidataNames, wdNamesRecord, wdNamesNoItem, WD_NAMES, type WdNameStatement } from './wikidata-names';

/** One species of Kew's file as this route reads it (`scripts/kew-species-load.ts` gives it). */
export interface KewSpecies {
  /** Kew's plant_name_id: the page's id is `k<id>`. */
  id: string;
  /** Kew's taxon_name, as Kew writes it ("× Arsorbus thuringiaca"). */
  name: string;
  authors: string;
  family?: string;
  genus?: string;
  /** Kew's ipni_id and powo_id (an IPNI number such as 148218-1); either may be empty. */
  ipni?: string;
  powo?: string;
  lifeform?: string;
  climate?: string;
  /** Kew's other names for the species: every row filed under it, misapplied rows left out; `homotypic` where Kew says so. */
  synonyms: ReadonlyArray<{ name: string; authors: string; status: string; rank?: string; homotypic?: boolean }>;
  /** Its range, in the shape `WcvpIndex.rangeOf` gives (none when Kew states none). */
  range: readonly GbifDistribution[];
  /** The day of Kew's files. */
  file?: string;
}

export interface KewBuildOptions {
  fetcher: JsonFetcher;
  builtBy: 'node' | 'worker';
  now?: () => Date;
  /** Skip the slow sources, as `BuildOptions.quick`: Commons is not asked. */
  quick?: boolean;
  /** Sources left out of this build, recorded as skipped, as `BuildOptions.skip`. */
  skip?: SkippableSource[];
  /** The reference's names, as `BuildOptions.held`. */
  held?: HeldNames | null;
  /** Whether the reference holds a name as another of its species: such a taxon is never taken for this one. */
  heldElsewhere?: (name: string) => boolean;
  /** Kew's names below species, as `BuildOptions.kewInfra`. */
  kewInfra?: KewInfra;
  /** The GBIF keys Kew's synonymy gives this species (`scripts/extra-keys-kew.txt`, round seventy-nine): their records are read. */
  extraKeys?: readonly ExtraKey[];
  /**
   * Why the species reads no key, when Kew's synonymy gives it none (round eighty; `scripts/extra-keys-kew-none.txt`), and
   * the id here of each page GBIF files its names under: the page then says that reason, not the general one.
   */
  noKey?: { line: NoKeyLine; pageOf?: (gbifKey: number) => string | undefined };
  /** The habitat climate's grid, as `BuildOptions.climate`. */
  climate?: ClimateProvider;
  /** The botanic gardens, herbaria and zoos, as `BuildOptions.places`. */
  places?: PlaceIndex;
  /** The default points (round eighty, A), as for a page with a GBIF key. */
  defaults?: ReadonlySet<string>;
  /** The regions' shapes (round eighty, A), as for a page with a GBIF key. */
  regions?: import('./tdwg-shapes').RegionTester;
  /** The reference's genera, in lower case (`generaOf`): a Wikidata name that is one of them alone is refused (round eighty). */
  genera?: ReadonlySet<string>;
}

/** What a page without a GBIF key says of GBIF's records it read under the keys Kew's synonymy gives it. */
export const KEW_KEYS_WORDS = "this species has no GBIF key of its own; its records are read under GBIF's keys for the names Kew's file holds as this plant, never by a name matched";
/**
 * The same, true of the keys read (round eighty-four, the merge; agent E's report): a page whose only keys are those of
 * pages merged into it (Ferocactus hamatacanthus, under Bisnaga hamatacantha's key) reads no key for a name Kew's file
 * holds as this plant, so says whose keys it reads.
 */
export function kewKeysWords(keys: ReadonlyArray<{ slug?: string }>): string {
  // A merged page's key carries its old address (`slug`), and only such a key does.
  const merged = keys.filter((k) => !!k.slug).length;
  if (!merged || !keys.length) return KEW_KEYS_WORDS;
  if (merged === keys.length) return `this species has no GBIF key of its own; its records are read under the GBIF ${merged === 1 ? 'key of a page' : 'keys of pages'} merged into this one, never by a name matched`;
  return "this species has no GBIF key of its own; its records are read under GBIF's keys for the names Kew's file holds as this plant, and of the pages merged into this one, never by a name matched";
}

/**
 * What a page that reads no key records of why (round eighty): `occurrences.unread`, its words `noKeyWhy`'s, each page GBIF
 * files its names under named by its name and its id here. Built and filled (`--fill kew-why`) alike.
 */
export function unreadOf(line: NoKeyLine, pageOf?: (gbifKey: number) => string | undefined): Unread {
  const under = line.kind === 'lumped' ? (line.under ?? []).map((h) => { const page = pageOf?.(h.key); return { key: h.key, name: h.name ?? `GBIF key ${h.key}`, ...(page ? { page } : {}) }; }) : [];
  return { kind: line.kind, why: noKeyWhy(line), ...(under.length ? { under } : {}) };
}

/** "Abelia parvifolia Hemsl.": the entry as a record cites it. */
export const kewLabel = (k: Pick<KewSpecies, 'name' | 'authors'>) => `${k.name}${k.authors ? ` ${k.authors}` : ''}`;

/** The species' own names for iNaturalist and Commons: its name and Kew's names for it, a name another species of the reference holds left out. */
export function kewOwnNames(k: Pick<KewSpecies, 'name' | 'synonyms'>, heldElsewhere?: (name: string) => boolean): OwnNames {
  return ownNames({ scientific: canonicalOfKew(k.name), synonyms: k.synonyms.map((s) => ({ name: canonicalOfKew(s.name), status: s.status })), heldElsewhere });
}

/**
 * The species' Wikidata item by Kew's identifiers: exactly one taxon item carrying its IPNI or POWO identifier, else
 * none (no item, or two: two is said). A refusal or failure is the answer, so the page says "not checked".
 */
export async function kewItem(f: JsonFetcher, k: Pick<KewSpecies, 'ipni' | 'powo'>): Promise<SourceResult<wm.CrossIds & { names?: WdNameStatement[] }> & { by?: string }> {
  const ids = { ipni: k.ipni || undefined, powo: k.powo || undefined };
  if (!kewAskable(ids)) return { status: 'none', detail: "Kew's file gives no IPNI or POWO identifier to ask Wikidata by" };
  const r = await f<{ results?: { bindings?: Array<{ v?: { value?: string }; u?: { value?: string }; item?: { value?: string } }> } }>(kewItemUrl(ids), { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
  if (r.status !== 'ok' && r.status !== 'none') return r;
  const qs = r.status === 'ok' ? kewItemsOf(ids, r.data) : [];
  const by = `Kew's IPNI identifier ${ids.ipni ?? 'none'}, POWO ${ids.powo ?? 'none'}`;
  if (!qs.length) return { status: 'none', detail: `no item carries ${by}` };
  if (qs.length > 1) return { status: 'ambiguous', detail: `not taken: two items carry ${by} (${qs.join(', ')})` };
  const e = await wm.mwGet<{ entities?: Record<string, wm.Entity & { missing?: string }>; error?: unknown }>(f, entityUrl(qs[0]));
  if (e.status !== 'ok') return e.status === 'none' ? { status: 'none', detail: `the item ${qs[0]} was not served` } : e;
  const err = wm.mwError(e.data);
  if (err) return { status: 'error', detail: `wikidata ${err}` };
  const ent = e.data.entities?.[qs[0]];
  if (!ent || 'missing' in ent) return { status: 'none', detail: `the item ${qs[0]} was not served` };
  if (!wm.isTaxonItem(ent)) return { status: 'none', detail: `not taken: the item ${qs[0]}, which carries ${by}, is not a taxon` };
  // The item's GBIF key is not read: the list found no one GBIF key for this species, and an item's is no better a match.
  const x = wm.crossOf(qs[0], ent);
  delete x.gbif;
  // Its English common names (round eighty): the item's P1843 statements, with their ranks and references, from this read.
  return { status: 'ok', data: { ...x, names: statementsOfEntity(ent as { claims?: Record<string, unknown> }) }, detail: `found by ${by}` };
}

/**
 * iNaturalist's taxon for a page without a GBIF key: an id (the item's, or one kept) checked with iNaturalist, else the
 * name search; taken only when the taxon is active and its name is one of the species' own, and no other species of the
 * reference holds it. Anything else is not taken, and the answer says why.
 */
export async function kewInatTaxon(f: JsonFetcher, a: { scientific: string; own: OwnNames; id?: number; heldElsewhere?: (name: string) => boolean }): Promise<SourceResult<{ id: number; name: string }>> {
  const mine = (n?: string) => !!n && isOwnName(a.own, n) && !a.heldElsewhere?.(n);
  if (a.id) {
    const c = await inat.checkIds(f, [a.id]);
    if (c.status !== 'ok') return c.status === 'none' ? { status: 'none', detail: `iNaturalist's taxon ${a.id} not served` } : { status: c.status, detail: `iNaturalist's taxon ${a.id} not checked: ${c.detail}` };
    const got = c.data.get(a.id);
    if (got?.active && mine(got.name)) return { status: 'ok', data: { id: a.id, name: got.name! }, detail: `iNaturalist's taxon ${a.id} (${got.name}), as Wikidata gives it, is active and one of this species' names` };
    const was = `iNaturalist's taxon ${a.id}${got?.name ? ` (${got.name})` : ''} ${got?.active ? "is not one of this species' names" : 'is inactive'}; asked by name`;
    const t = await kewInatTaxon(f, { ...a, id: undefined });
    return t.status === 'ok' ? { ...t, detail: `${was}: ${t.detail ?? ''}`.replace(/: $/, '') } : { ...t, detail: [was, t.detail].filter(Boolean).join('; ') } as typeof t;
  }
  const t = await inat.taxon(f, a.scientific, a.heldElsewhere);
  if (t.status !== 'ok') return t;
  if (!mine(t.data.name)) return { status: 'none', detail: `not taken: iNaturalist files ${a.scientific} as ${t.data.name}, which is neither this species' name nor one of Kew's names for it` };
  return { status: 'ok', data: { id: t.data.id, name: t.data.name }, detail: t.detail ?? `iNaturalist's taxon ${t.data.id} (${t.data.name}), found by its name` };
}

export async function buildKewDossier(k: KewSpecies, o: KewBuildOptions): Promise<BuildResult> {
  const f = o.fetcher;
  const now = () => (o.now ? o.now() : new Date()).toISOString();
  const upstream: Record<string, Upstream> = {};
  const mark = (src: string, r: { status: Upstream['status']; detail?: string }) => {
    upstream[src] = { status: r.status, at: now(), detail: r.detail || undefined };
  };
  const skip = (s: SkippableSource) => !!o.skip?.includes(s);
  const skipped = (s: string, detail?: string) => (upstream[s] = { status: 'skipped', at: now(), ...(detail ? { detail } : {}) });
  const scientific = canonicalOfKew(k.name);
  const pageId = kewPage(k.id);
  const label = kewLabel(k);
  const file = k.file ? { asOf: k.file } : {};

  /* ---- 1. The name, from Kew's file ---- */
  upstream['kew.names'] = { status: 'ok', at: now(), detail: `Kew's entry ${label} (plant_name_id ${k.id}), read from Kew's names file`, ...file };
  // GBIF's own records of the species are not asked: there is no one key to ask them by.
  for (const s of ['gbif.species', 'gbif.synonyms', 'gbif.vernacular']) skipped(s, NO_GBIF_WHY);
  const keyList = o.extraKeys ?? [];
  // Round eighty: a species Kew's synonymy gives no key says why, for itself (`unreadOf`), else the general reason.
  const unread = !keyList.length && o.noKey ? unreadOf(o.noKey.line, o.noKey.pageOf) : undefined;
  const whyNot = unread?.why ?? NO_GBIF_WHY;
  if (!keyList.length) skipped('gbif.occurrences', whyNot);
  const synonyms = [...new Set(k.synonyms.map((s) => `${canonicalOfKew(s.name)}${s.authors ? ` ${s.authors}` : ''}`))];
  const own = kewOwnNames(k, o.heldElsewhere);

  /* ---- 2. The range, from Kew's file ---- */
  const { doubtful, native, introduced, reported, extinct, boxes } = regionsOf(k.range, true);
  const via: RangeVia = { kind: 'own', entry: label, name: k.name, ...(k.file ? { file: k.file } : {}) };
  upstream['wcvp.distribution'] = k.range.length ? { status: 'ok', at: now(), ...file } : { status: 'none', at: now(), detail: `Kew's entry ${label} states no range`, ...file };
  const kewDesc = k.lifeform || k.climate ? { ...(k.lifeform ? { lifeform: k.lifeform } : {}), ...(k.climate ? { climate: k.climate } : {}) } : undefined;

  /* ---- 3, 4. GBIF's records, the marker and the climate: only under the keys Kew's synonymy gives it ---- */
  const verified = native.length > 0;
  let occurrences: Dossier['occurrences'] = { open: [], nOpenInRange: 0, nRestrictedInRange: 0, nOutsideRange: 0, nVague: 0, rangeTested: false, restrictedShiftKm: null, thin: true, datasets: [] };
  let centroid: Dossier['centroid'] | undefined;
  let climate: Climate = { status: 'pending', detail: unread ? uncheckedClimate(whyNot) : NO_GBIF_CLIMATE };
  if (unread) occurrences.unread = unread;
  if (!keyList.length) upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
  else {
    const extra = await extraOccurrences(f, { status: 'none' }, keyList);
    const occ = extra.occ;
    mark('gbif.occurrences', occ);
    if (occ.status === 'ok' || occ.status === 'none') {
      const rows = occ.status === 'ok' ? occ.data : [];
      const doi = rows.find((r) => r.downloadDoi)?.downloadDoi;
      const day = rows.find((r) => r.downloadDay)?.downloadDay;
      upstream['gbif.occurrences'].detail = [kewKeysWords(extra.keys), ...(doi ? [`GBIF occurrence download https://doi.org/${doi}${day ? `, of ${day}` : ''}`] : []), ...extra.keys.map(extraKeyWords)].join('; ');
      if (doi && day && extra.keys.every((x) => x.from === 'download')) upstream['gbif.occurrences'].asOf = day;
    }
    // By the regions' shapes where the build has them (round eighty, A).
    const inside = rangeTest(native, o.regions);
    const r = readRecords(occ.status === 'ok' ? occ.data : [], boxes, verified, o.places, inside?.test, o.defaults);
    if (occ.status === 'ok' && r.nDefault) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, defaultWords(r.nDefault)].filter(Boolean).join('; ');
    if (occ.status === 'ok' && inside && boxes.length) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, inside.words].filter(Boolean).join('; ');
    if (occ.status === 'ok') {
      const instSaid = o.places ? institutionWords(r.nInstitution, r.institutionKinds, o.places.radiusM) : 'records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build';
      if (instSaid) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, instSaid].filter(Boolean).join('; ');
    }
    occurrences = {
      open: r.open,
      nOpenInRange: r.open.length,
      nRestrictedInRange: r.restrictedInRange.length,
      nOutsideRange: r.nOutside,
      nVague: r.nVague,
      rangeTested: boxes.length > 0,
      ...(inside?.rule && boxes.length ? { rangeRule: inside.rule } : {}),
      restrictedShiftKm: r.restrictedShiftKm,
      thin: r.allPts.length < 12,
      datasets: [...r.datasets.entries()].map(([key, d]) => ({ key, ...(d.title ? { title: d.title } : {}), licence: d.licence, n: d.n })),
      ...(extra.keys.length ? { keys: extra.keys } : {})
    };
    centroid = r.centroid;
    // As a page with a GBIF key reads it (`buildDossier`), its range Kew's own.
    if (occ.status === 'refused' || occ.status === 'error') climate = { status: 'refused', detail: `the occurrence source ${occ.status === 'refused' ? 'refused the request' : 'did not answer'} when this page was built` };
    else if (occ.status === 'skipped') climate = { status: 'pending', detail: 'the occurrence source was not asked when this page was built' };
    else if (!verified || !boxes.length) climate = { status: 'none', detail: !verified ? 'native range not verified: no WCVP distribution with native status for this name, so records cannot be told from cultivation and no habitat climate is derived' : 'native range is stated at country level only, with no region boxes to test records against' };
    else if (r.forClimate.length) climate = await (o.climate ?? noClimate).envelope(r.forClimate);
    else if (r.allPts.length) climate = { status: 'none', detail: noPlacedWords(r.nInRangeRecords, r.allPts.length) };
    else climate = { status: 'none', detail: 'no georeferenced record inside the range' };
    // Extremes beyond a lapse correction's reach, or whose nights and the habitat's months disagree, are set aside too, and the record says why (round eighty, A; round eighty-four's words, `lapseCause`).
    const lapseWhy = climate.status === 'ok' && !(climate.landFraction != null && climate.landFraction < 0.5) ? lapseSetAside(climate) : null;
    climate = setAsideExtremes(climate);
    if (climate.status === 'pending') upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
    else mark('climate', climate.status === 'ok' ? { status: 'ok' } : { status: climate.status, detail: climate.detail });
    if (climate.status === 'ok' && climate.extremesStatus) upstream['climate.extremes'] = { status: climate.extremesStatus === 'refused' ? (/^NASA POWER did not answer\b/.test(climate.src.extremes ?? '') ? 'error' : 'refused') : climate.extremesStatus === 'skipped' ? 'skipped' : climate.extremesStatus === 'none' || climate.extremesStatus === 'lapse' ? 'none' : 'ok', at: now(), ...(climate.src.extremes ? { detail: `${climate.src.extremes}${lapseWhy ? `; not used: ${lapseWhy}` : ''}` } : {}) };
  }

  /* ---- 5. Identifiers and the summary ---- */
  const ids: Dossier['ids'] = {};
  const links: Record<string, string> = {};
  if (k.ipni) { ids.ipni = k.ipni; links.ipni = `https://www.ipni.org/n/${k.ipni}`; }
  if (k.powo) { ids.powo = `urn:lsid:ipni.org:names:${k.powo}`; links.powo = `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${k.powo}`; }
  let x: SourceResult<wm.CrossIds & { names?: WdNameStatement[] }> = { status: 'skipped', detail: '' };
  if (skip('wikidata')) skipped('wikidata');
  else {
    x = await kewItem(f, k);
    mark('wikidata', x);
  }
  // Its English common names from the item (round eighty; `wikidata-names.ts`): none asked of GBIF, which holds no key for it.
  let vernacular: Dossier['name']['vernacular'] = [];
  if (x.status === 'ok') {
    const r = wikidataNames(x.data.names ?? [], { scientific, synonyms, genera: o.genera, heldElsewhere: o.heldElsewhere });
    vernacular = r.rows;
    upstream[WD_NAMES] = wdNamesRecord(x.data.wikidata, r, now());
  } else upstream[WD_NAMES] = wdNamesNoItem(upstream.wikidata, now());
  let enTitle = scientific;
  if (x.status === 'ok') {
    // Kew's IPNI and POWO numbers stand: they are the page's own, and the item was found by them.
    Object.assign(ids, { wikidata: x.data.wikidata, ...(x.data.wfo ? { wfo: x.data.wfo } : {}), ...(x.data.inat ? { inat: x.data.inat } : {}) });
    links.wikidata = `https://www.wikidata.org/wiki/${x.data.wikidata}`;
    if (x.data.wfo) links.wfo = `https://www.worldfloraonline.org/taxon/${x.data.wfo}`;
    if (x.data.enTitle) enTitle = x.data.enTitle;
  }
  let summary: Dossier['summary'];
  const titles = [scientific, ...synonyms.map((s) => s.split(' ').slice(0, 2).join(' '))];
  const w = skip('wikipedia') ? ({ status: 'skipped' } as const) : await wm.summary(f, enTitle, [enTitle, ...titles], { name: scientific, synonyms, item: ids.wikidata, ipni: ids.ipni, authorship: k.authors || undefined });
  if (w.status === 'skipped') skipped('wikipedia');
  else mark('wikipedia', w);
  if (w.status === 'ok') {
    summary = { text: w.data.text, source: 'wikipedia', url: w.data.url, licence: 'CC BY-SA 4.0', title: w.data.title, ...(w.data.cut ? { cut: true as const } : {}) };
    ids.wikipedia = w.data.title;
    links.wikipedia = w.data.url;
  }

  /* ---- 6. Photographs: iNaturalist, then Commons; GBIF's not asked ---- */
  const photos: Photo[] = [];
  if (skip('inat')) {
    // The item's id is kept unchecked, as a page with a GBIF key keeps it, for `--fill inat` to read; each row says why (round eighty).
    skipped('inat.taxon', ids.inat ? `not asked: this build left iNaturalist to the daily fill (--fill inat), which checks taxon ${ids.inat}, as Wikidata gives it, by this species' own and Kew's names` : INAT_LEFT_TO_FILL);
    skipped('inat.photos.wild', INAT_SETS_LEFT);
    skipped('inat.photos.cultivated', INAT_SETS_LEFT);
  } else {
    const t = await kewInatTaxon(f, { scientific, own, id: ids.inat, heldElsewhere: o.heldElsewhere });
    mark('inat.taxon', t);
    if (t.status === 'ok') ids.inat = t.data.id;
    else delete ids.inat;
    if (ids.inat) {
      links.inat = `https://www.inaturalist.org/taxa/${ids.inat}`;
      const owner = { key: pageId, held: o.held, kew: o.kewInfra ? (n: string) => o.kewInfra!.placedElsewhere(n, { scientific, synonyms, ipni: ids.ipni }) : null };
      const wild = await inat.photos(f, ids.inat, true, 24, owner);
      mark('inat.photos.wild', wild);
      if (wild.status === 'ok') photos.push(...wild.data);
      const cult = await inat.photos(f, ids.inat, false, 12, owner);
      mark('inat.photos.cultivated', cult.status === 'ok' || cult.status === 'none' ? { status: cult.status, detail: inat.CULTIVATED_RULE } : cult);
      if (cult.status === 'ok') photos.push(...cult.data);
    } else if (t.status === 'none' || t.status === 'ambiguous') {
      const why = t.detail ? `: ${t.detail}` : '';
      mark('inat.photos.wild', { status: 'none', detail: `no iNaturalist taxon taken for this species${why}` });
      mark('inat.photos.cultivated', { status: 'none', detail: `no iNaturalist taxon taken for this species, so none of its ${inat.CULTIVATED_RULE}` });
    } else {
      // The taxon was not checked (iNaturalist refused or did not answer): its photographs were not asked either.
      const why = `iNaturalist's taxon not checked${t.detail ? `: ${t.detail}` : ''}`;
      mark('inat.photos.wild', { status: t.status, detail: why });
      mark('inat.photos.cultivated', { status: t.status, detail: why });
    }
  }
  skipped('gbif.media', NO_GBIF_WHY);
  if (skip('commons')) skipped('commons');
  else if (!o.quick && photos.length < 12) {
    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
    const c: FetchResult<Photo[]> = await commons.commonsPhotos(f, cat, 12, { scientific, synonyms, key: pageId, held: o.held, authorship: k.authors || undefined });
    mark('commons', c);
    if (c.status === 'ok') photos.push(...c.data);
  }

  /* ---- 7. Literature: off ---- */
  upstream.openalex = { status: 'skipped', at: now(), detail: LITERATURE_OFF };

  const dossier: Dossier = {
    v: DOSSIER_V,
    key: pageId,
    slug: slugify(scientific),
    built: now(),
    builtBy: o.builtBy,
    name: {
      scientific,
      ...(k.authors ? { authorship: k.authors } : {}),
      rank: 'SPECIES',
      // Kew accepts it: the list holds only species Kew accepts.
      status: 'accepted',
      ...(k.family ? { family: k.family } : {}),
      ...(k.genus ? { genus: k.genus } : {}),
      classification: [...(k.family ? [{ rank: 'family', name: k.family }] : []), ...(k.genus ? [{ rank: 'genus', name: k.genus }] : [])],
      synonyms,
      vernacular,
      // Kew's names, as `--fill kew-names` writes them: the entry is the page's own, its synonyms Kew's.
      // Its species-rank names, as `kewNames` lists them; none is accepted elsewhere, since Kew files each under this entry.
      kew: { entry: k.id, synonyms: [...new Set(k.synonyms.filter((s) => !s.rank || s.rank === 'Species').map((s) => s.name).filter((n) => canonicalOfKew(n).toLowerCase() !== scientific.toLowerCase()))].sort(), acceptedElsewhere: [], file: k.file ?? '' }
    },
    ids,
    summary,
    distribution: { native, introduced, reported: reported.length ? reported : undefined, extinct: extinct.length ? extinct : undefined, doubtful: doubtful.length ? doubtful : undefined, kew: kewDesc, source: viaSource(via), boxes, verified: native.length > 0, via },
    occurrences,
    ...(centroid ? { centroid } : {}),
    climate,
    photos: dedupePhotos(photos),
    literature: [],
    links,
    upstream
  };
  return { ok: true, dossier: parseDossier(dossier, o.held) };
}

/**
 * `--fill kew-why` (round eighty, R): every stored page without a GBIF key that reads no key says why, for itself, from
 * `scripts/extra-keys-kew-none.txt` (`unreadOf`): `occurrences.unread`, the record of GBIF's records and the climate's
 * detail. A page the file does not name says the general reason (`NO_GBIF_WHY`) again. Nothing is asked; a page that reads
 * keys, or has a GBIF key, is passed by. The same words a build writes, so a rebuild changes nothing of them.
 */
export function fillKewWhy(store: { files(): string[]; read<T>(f: string): T; write(f: string, d: unknown): void }, lines: ReadonlyMap<string, NoKeyLine>, pageOf?: (gbifKey: number) => string | undefined): { read: number; changed: number; kinds: Map<string, number>; general: number } {
  const kinds = new Map<string, number>();
  let read = 0, changed = 0, general = 0;
  for (const file of store.files()) {
    if (!file.startsWith('k')) continue;
    let d: Dossier;
    try { d = store.read<Dossier>(file); } catch { continue; }
    if (d.ids?.gbif != null || d.occurrences?.keys?.length) continue;
    read++;
    const line = lines.get(d.key ?? file.replace(/\.json$/, ''));
    const unread = line ? unreadOf(line, pageOf) : undefined;
    const why = unread?.why ?? NO_GBIF_WHY;
    if (unread) kinds.set(unread.kind, (kinds.get(unread.kind) ?? 0) + 1);
    else general++;
    const before = JSON.stringify(d);
    const occ = { ...d.occurrences };
    if (unread) occ.unread = unread;
    else delete occ.unread;
    d.occurrences = occ;
    const up = d.upstream['gbif.occurrences'];
    if (up?.status === 'skipped') d.upstream['gbif.occurrences'] = { ...up, detail: why };
    const climateWhy = unread ? uncheckedClimate(why) : NO_GBIF_CLIMATE;
    if (d.climate?.status === 'pending') d.climate = { ...d.climate, detail: climateWhy };
    if (d.upstream.climate?.status === 'skipped') d.upstream.climate = { ...d.upstream.climate, detail: climateWhy };
    if (JSON.stringify(d) === before) continue;
    parseDossier(d); // a dossier the schema refuses is not written
    store.write(file, d);
    changed++;
  }
  return { read, changed, kinds, general };
}
