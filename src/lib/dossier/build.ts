/**
 * The dossier builder, run by the corpus script (scripts/build-dossiers.ts); no Worker route builds a dossier (round
 * sixty-nine; triage-68 M10, S-A7). Every upstream's answer is recorded as ok / none / refused / error / skipped /
 * ambiguous, and only "none" may ever be rendered as an absence.
 *
 * The builder never publishes a dossier if the taxonomy step failed; every
 * other section degrades independently and says so.
 */
import { fromWikidata, WD_NAMES } from './wikidata-names';
import { gbifThumb } from './md5';
import { dedupePhotos } from './dedupe';
export { dedupePhotos, inatPhotoId } from './dedupe';
import type { JsonFetcher, SourceResult, FetchResult } from './fetch';
import * as gbif from './sources/gbif';
import { citedWords, BINOMIAL } from './kew-names';
import { CULTIVATED_RE, synonymOfWords, type OccMedia } from './sources/gbif';
import { viaSource, viaDetail, wcvpBase, settleRange, withPage, homonymChecked } from './range-via';
import * as inat from './sources/inat';
import * as wm from './sources/wikimedia';
import * as commons from './sources/commons';
import { LITERATURE_OFF } from './sources/openalex';
import { tdwgCode, tdwgLabel, TDWG3 } from './tdwg';
import { licenceTag, isOpen, licenceLabel } from '$core/licence';
import { slugify, parseName } from '$core/names';
import { gbifView, headWithKew } from './kew-heading';
import { hybridLinks } from '$core/hybrids';
import { habitatCluster, habitatCentre, haversineKm, inBox, type Box } from '$core/geo';
import { grownBox, SHAPE_BUFFER_DEG, type RegionTester } from './tdwg-shapes';
import { ownNames, isOwnName, canonicalOf } from './own-names';
import { plainlyAnother, ownByAuthor } from './authors';
import type { Reference } from './reference';
import type { KewInfra } from './kew-infra';
import { DOSSIER_V, parseDossier, setAsideExtremes, lapseSetAside, type Dossier, type OccPoint, type Photo, type Climate, type Upstream } from './schema';
import type { HeldNames } from './photo-kind';
import { gbifPage, type PageId } from '../core/page-id';
import { extraWhy, type ExtraKey } from './extra-keys';
import { institutionWords, type InstitutionKind, type PlaceIndex } from './clean';

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
  /**
   * The previous build's name block for this key, so a re-derivation asks the backbone nothing: the name, its
   * synonyms and vernaculars are carried, and the upstream records say so. Only honoured when the build is by key
   * and the key matches; a build by name always asks the backbone.
   */
  taxon?: { key: number; name: Dossier['name']; accepted?: Upstream; builtOn?: string; species?: Upstream; wdNames?: Upstream };
  /**
   * The previous build's identifiers for this key. When Wikidata does not answer (its maxlag, a failure), the build keeps
   * them, above all iNaturalist's taxon id, which the photographs are asked by: a Wikidata outage had cost 113 species
   * every photograph in round sixty-seven's online rebuild (round sixty-eight). Never used when Wikidata answered.
   */
  prevIds?: Dossier['ids'];
  /**
   * The day (YYYY-MM-DD) of the build that read `prevIds` from Wikidata: the record names it, and identifiers older than
   * `CARRY_DAYS` are not carried (round sixty-nine; triage-68 M5, M8, S-A6, R46-13). Without it nothing is carried.
   */
  prevIdsOn?: string;
  /**
   * `prevIds` were themselves kept by a build that did not know their day, and `prevIdsOn` is the day that build first
   * kept them (round seventy-one; self-review 70 S-B9): the limit runs from there, and the record keeps saying the day
   * they were read is not known. Before, an unknown day was kept again by every lagged build, past any limit.
   */
  prevIdsDayUnknown?: boolean;
  /**
   * Whether the reference holds a name as another of its species (the previous index, by name): iNaturalist's taxon of
   * that name is never taken for this one (round sixty-nine; triage-68 M6, R46-14).
   */
  heldElsewhere?: (name: string) => boolean;
  /**
   * The reference's species by name, key, genus and epithet (`referenceOf`): an iNaturalist taxon whose name is not one of
   * this species' own is matched to GBIF and dropped when it is another of them (round seventy, second pass; triage-69 B5).
   */
  reference?: Reference;
  /**
   * The reference's names, accepted and older (`heldNamesOf` of the index on disk): what tells an uploader's slip in a
   * Commons title from another species, read where Commons answers and where the dossier is parsed before it is written,
   * as the Worker and the index read it (round seventy, a need of C; REVIEW-TRIAGE-69 C1, C4).
   */
  held?: HeldNames | null;
  /**
   * The id of the page for a GBIF key (round seventy-eight; `$core/page-id`), asked for the key the build ends on (a name
   * followed to its accepted key asks for that one): the builder gives the id of the page already on disk under that key,
   * else the id the rule gives a new page. Absent, or no answer: `g<key>`, which `--index` puts right by the rule.
   */
  pageIdOf?: (gbifKey: number) => PageId | undefined;
  /** Kew's names below species (`--bulk`; round seventy-two, C1): an iNaturalist observation of a taxon Kew places under another species is not taken. */
  kewInfra?: KewInfra;
  /**
   * The other GBIF keys whose records and photographs this page reads (`scripts/extra-keys.txt`, round seventy-three;
   * `extra-keys.ts` says the rule): each key's name and author is one Kew's file holds as this page's plant, and none is
   * another page's. A key with `merged` was another page here, merged into this one: its names join this page's too.
   */
  extraKeys?: readonly ExtraKey[];
  /**
   * The botanic gardens, herbaria and zoos of scripts/institutions.txt (round seventy-nine, Q; `clean.ts`): a record
   * within the radius of one is left out of the map, the marker and the climate, and counted. The corpus script always
   * gives it; without it no record is tested and the record of the occurrence source says so.
   */
  places?: PlaceIndex;
  /**
   * The regions' shapes (round eighty, A; `tdwg-shapes.ts`, `scripts/tdwg3-shapes.json`): a record is in the range when it
   * lies in a native region's shape, or that region's box where it has none. The corpus script gives them; without them
   * the boxes alone are read, as before.
   */
  regions?: RegionTester;
  /** The default points (round eighty, A; `default-points.ts`, `scripts/default-points.txt`): a record at one is left out. */
  defaults?: ReadonlySet<string>;
  /** The page's own Kew entry for a GBIF key (the list's plant_name_id; round eighty, A): such a page is matched on Wikidata by its identifiers alone. */
  kewEntryOf?: (gbifKey: number) => string | undefined;
}
/** The record's words for the records left out at default points (round eighty, A). */
export const defaultWords = (n: number) => `${n} record${n === 1 ? '' : 's'} at a dataset's default point left out (a coordinate where the records of 20 species or more of this reference lie, nearly all of them with no year, as the reference lists them; a record there its dataset states to within 10 km is kept)`;
/**
 * The test of a record against a page's native range by the regions' shapes (round eighty, A; review-w 5), and the words
 * the record of the occurrences says of it: how many of the native regions were tested by their shapes and how many by
 * their boxes. Undefined without the shapes (a test, the Worker): the boxes, as before.
 */
export function rangeTest(native: ReadonlyArray<{ code?: string; box?: Box }>, regions?: RegionTester): { test: (lat: number, lon: number) => boolean; words: string; rule?: string } | undefined {
  if (!regions) return undefined;
  const coded = native.filter((r) => r.code || r.box);
  const shaped = coded.filter((r) => r.code && regions.hasShape(r.code)).length;
  // Every record is tested, openly licensed or not (round eighty-four, A1 and B1: a restricted record is in no dossier, so
  // the page says it was tested too); a box takes the shapes' buffer, so the words say "and a margin" of both.
  const all = 'openly licensed and restricted alike';
  const rule = regions.rule ? `; shapes rule ${regions.rule}` : '';
  const words = shaped === coded.length ? `records tested against the native regions' shapes, ${all} (${regions.source}${rule})` : shaped ? `records tested against ${shaped} of the ${coded.length} native regions' shapes (${regions.source}${rule}) and the other ${coded.length - shaped} regions' bounding boxes, each with a margin of ${SHAPE_BUFFER_DEG}°, ${all}` : `records tested against the native regions' bounding boxes with a margin of ${SHAPE_BUFFER_DEG}°, ${all} (no region of this range has a shape here${rule})`;
  return { test: (lat, lon) => coded.some((r) => (r.code ? regions.inRegion(lat, lon, r.code) : !!r.box && inBox(lat, lon, grownBox(r.box, SHAPE_BUFFER_DEG)))), words, ...(regions.rule ? { rule: regions.rule } : {}) };
}
/**
 * The climate's reason when in-range records exist and none is placed well enough to read it (round eighty-four, A6f): the
 * records counted as records (Dionysia iranica's four, at two places, read "2 in-range records"), and the placing said as
 * the climate's rule reads it, not as a fact the datasets stated.
 */
export function noPlacedWords(records: number, places: number): string {
  return `${records} in-range record${records === 1 ? '' : 's'}${places < records ? ` at ${places} place${places === 1 ? '' : 's'}` : ''}, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or better, and none is a person's observation given to three decimals)`;
}
/** How long the previous build's identifiers may be carried through Wikidata not answering, in days (triage-68 M5). */
export const CARRY_DAYS = 90;
export type SkippableSource = 'openalex' | 'wikidata' | 'wikipedia' | 'inat' | 'commons' | 'gbif.media';
/** Everything that is not the backbone, the range, the records or the climate: what a re-derivation can carry over from the previous build. */
export const NETWORK_EXTRAS: SkippableSource[] = ['wikidata', 'wikipedia', 'inat', 'commons', 'gbif.media', 'openalex'];
/** Why a build that skips iNaturalist did not ask it (round eighty, agent I): the words its rows carry. */
export const INAT_LEFT_TO_FILL = 'not asked: this build left iNaturalist to the daily fill (--fill inat), which asks the taxon by name';
export const INAT_SETS_LEFT = "not asked: this build left iNaturalist to the daily fill (--fill inat), which asks for the photographs once the page's taxon is known";

export type BuildResult = { ok: true; dossier: Dossier } | { ok: false; reason: 'name-unresolved' | 'higher-rank-only' | 'backbone-refused'; detail?: string };

const u = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** A name search's answer after an id check that dropped an inactive id: both are said, the check first. */
function mergeNotes(before: Upstream | undefined, r: { status: Upstream['status']; detail?: string }): { status: Upstream['status']; detail?: string } {
  if (!before?.detail || before.status !== 'none') return r;
  return { ...r, detail: [before.detail, r.detail].filter(Boolean).join('; ') };
}

const countryNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (iso?: string): string | undefined => {
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return undefined;
  try {
    return countryNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
};

/**
 * GBIF media rows as dossier photographs, at most 24. iNaturalist's open-data bucket serves sizes by name; anything else
 * goes through GBIF's image cache by occurrence key and address hash, the one form the cache still answers (the bare
 * address form was refused from 2026-09: 1,351 front-page tiles showed "photograph did not load").
 */
export function photosFromMedia(rows: OccMedia[]): Photo[] {
  // A photograph under CC BY or CC BY-SA without an author cannot be credited as its licence requires, so it is not
  // published; CC0 asks for no name (round sixteen, 3).
  return rows.filter((im) => im.creator || im.rightsHolder || im.licence === 'cc0' || im.licence === 'pd').slice(0, 24).map((im) => {
    const inat = /^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/original\.(\w+)$/.exec(im.url);
    const thumb = inat ? im.url.replace(/original\.(\w+)$/, 'medium.$1') : gbifThumb(im.id.split(':')[0], im.url);
    return { src: 'gbif', id: im.id, url: im.url, thumb, licence: im.licence as Photo['licence'], attribution: `${im.creator || im.rightsHolder || 'author not stated'}, ${licenceLabel(im.licence as Photo['licence'])}, ${inat ? 'iNaturalist via GBIF' : 'via GBIF'}`, page: im.page, ...(im.specimen ? { specimen: true } : {}) };
  });
}

/**
 * A fresh GBIF media set merged into a dossier's photographs: iNaturalist and Commons keep their places in front, the
 * previous GBIF set is replaced. An empty fresh set keeps what was there: the download having nothing is not the API having had nothing.
 */
export function mergeGbifPhotos(prev: Photo[], fresh: Photo[]): Photo[] {
  if (!fresh.length) return prev;
  return dedupePhotos([...prev.filter((p) => p.src !== 'gbif'), ...fresh]);
}


/**
 * A range's rows as the page's regions (exported in round seventy-nine, so the route without a GBIF key reads Kew's rows
 * by the same rule; `build-kew.ts`). WCVP states native or introduced for every row. A national checklist that says
 * neither is a report of presence, not a native range: it is kept as such and never promoted to native. A region where
 * WCVP says the plant is extinct is part of its history, not its habitat. A region Kew records as doubtfully present is
 * listed apart, and never a range box (round seventy-two, B5).
 */
export function regionsOf(rows: readonly gbif.GbifDistribution[], fromWcvp: boolean): { doubtful: Dossier['distribution']['native']; native: Dossier['distribution']['native']; introduced: Dossier['distribution']['native']; reported: Dossier['distribution']['native']; extinct: Dossier['distribution']['native']; boxes: Box[] } {
  const doubtful: Dossier['distribution']['native'] = [];
  const native: Dossier['distribution']['native'] = [];
  const introduced: Dossier['distribution']['native'] = [];
  const reported: Dossier['distribution']['native'] = [];
  const extinct: Dossier['distribution']['native'] = [];
  const boxes: Box[] = [];
  for (const d of rows) {
    const code = fromWcvp ? tdwgCode(d.locationId, d.locality) : null;
    const region = { code: code ?? undefined, name: code ? tdwgLabel(code) : countryName(d.country) ?? d.locality ?? '?', box: code ? TDWG3[code] : undefined };
    const intro = CULTIVATED_RE.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`);
    const nativeSaid = /native|indigenous|endemic/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`);
    if (fromWcvp && d.establishmentMeans === 'DOUBTFUL') doubtful.push(region);
    else if (intro) introduced.push(region);
    else if (/extinct/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`)) extinct.push(region);
    else if (fromWcvp || nativeSaid) {
      native.push(region);
      if (region.box) boxes.push(region.box);
    } else reported.push(region);
  }
  return { doubtful, native, introduced, reported, extinct, boxes };
}

/**
 * The range's source as the page's "Range source" row says it. Kew's entry under an older name names the entry and the
 * older name it was reached by, never the accepted name alone, which no name of the species ever was (round sixty-nine;
 * triage-68 M2, S-A1: "under the name Lantana camara subsp. aculeata"); Kew holding the name with no range says so.
 */
export function rangeSource(dist: SourceResult<gbif.DistributionAnswer>): string {
  if (dist.status === 'ambiguous') return 'WCVP (Govaerts, RBG Kew): not taken, the older names lead to more than one entry';
  if (dist.status !== 'ok') return 'not available';
  if (dist.data.ambiguous) return 'WCVP (Govaerts, RBG Kew): homonyms, unresolved';
  if (dist.data.held) return `${wcvpBase(dist.data.kewFile)}: Kew holds ${dist.data.held}, with no native range`;
  if (!dist.data.wcvp) return 'national checklists via GBIF (presence reported, native status not stated; no WCVP entry for this name)';
  // Where the range comes from, said from the field, with the day of Kew's files (round seventy-two, B1, B3).
  if (dist.data.rangeVia) return viaSource(dist.data.rangeVia);
  if (dist.data.synonymOf) return `WCVP (Govaerts, RBG Kew): ${synonymOfWords(dist.data.synonymOf)}`;
  return dist.data.via ? `WCVP (Govaerts, RBG Kew): Kew's entry ${dist.data.entry}, reached by ${dist.data.via}` : 'WCVP (Govaerts, RBG Kew) via GBIF';
}

/** Whole days from a YYYY-MM-DD to an ISO time; NaN when the day does not read. */
const daysSince = (day: string | undefined, at: string) => (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? (Date.parse(at) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000 : NaN);

export async function buildDossier(nameOrKey: string | number, o: BuildOptions): Promise<BuildResult> {
  const f = o.fetcher;
  const now = () => (o.now ? o.now() : new Date()).toISOString();
  const upstream: Record<string, Upstream> = {};
  // A "none" keeps its reason only where the source gave one (a Wikipedia redirect, older names not asked): round sixty-nine; triage-68 M3, M8.
  const mark = (src: string, r: { status: Upstream['status']; detail?: string }) => {
    upstream[src] = { status: r.status, at: now(), detail: r.detail || undefined };
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
  // A carried taxon: the previous build's answer stands in for the backbone's, and every record says it was carried.
  // Its name as GBIF gives it for the key (round eighty-four, decision 1): a page Kew's accepted name heads is derived under
  // GBIF's name, as it was built, and headed again at the end (`headWithKew`), so the records' and sources' words do not move.
  const carried = o.taxon && typeof nameOrKey === 'number' && o.taxon.key === nameOrKey ? { ...o.taxon, name: gbifView(o.taxon.name) } : null;
  const carriedFrom = carried ? `carried from build of ${carried.builtOn?.slice(0, 10) ?? '?'} (offline re-derivation; the backbone was not asked)` : '';
  let sp: Awaited<ReturnType<typeof gbif.species>>;
  if (carried) {
    const n = carried.name;
    const cls = Object.fromEntries((n.classification ?? []).flatMap((c) => [[c.rank, c.name], [`${c.rank}Key`, c.key]]));
    sp = { status: 'ok', data: { key: carried.key, canonicalName: n.scientific, scientificName: n.scientific, authorship: n.authorship ?? undefined, rank: n.rank ?? undefined, taxonomicStatus: n.status === 'accepted' ? 'ACCEPTED' : n.status === 'synonym' ? 'SYNONYM' : n.status === 'doubtful' ? 'DOUBTFUL' : undefined, acceptedKey: n.acceptedKey ?? undefined, accepted: n.acceptedName ?? undefined, family: n.family ?? undefined, genus: n.genus ?? undefined, order: n.order ?? undefined, ...cls } as (typeof sp & { status: 'ok' })['data'] };
    upstream['gbif.species'] = { status: 'ok', at: now(), detail: carriedFrom };
    if (carried.accepted) upstream['gbif.accepted'] = { ...carried.accepted, detail: `${carried.accepted.detail ?? ''}; ${carriedFrom}`.replace(/^; /, '') };
  } else {
    sp = await gbif.species(f, key);
    mark('gbif.species', sp);
  }
  if (sp.status !== 'ok') return { ok: false, reason: sp.status === 'none' ? 'name-unresolved' : 'backbone-refused', detail: sp.status === 'none' ? undefined : sp.detail };
  // A name the backbone holds as a synonym is followed to the species it accepts: the records, the
  // range and the photographs are indexed under that name, and a page under the synonym would be
  // empty. The page says which name was asked for; the synonym stays in the synonym list.
  if (!carried && /synonym/i.test(sp.data.taxonomicStatus ?? '') && sp.data.acceptedKey && sp.data.acceptedKey !== key) {
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
  const pageId: PageId = o.pageIdOf?.(key) ?? gbifPage(key);
  // The other keys listed for the key this build ends on (a name followed to another key reads that key's list, if any).
  const extraList = (o.extraKeys ?? []).filter((x) => x.page === key);
  const status = /accepted/i.test(s.taxonomicStatus ?? '') ? 'accepted' : /synonym/i.test(s.taxonomicStatus ?? '') ? 'synonym' : /doubtful/i.test(s.taxonomicStatus ?? '') ? 'doubtful' : 'unknown';

  // Kew's identifiers for the name and author: the species on a homonym key (S-B2), and the IPNI and POWO links (S-B5).
  const kewAsk: { r?: Awaited<ReturnType<typeof gbif.kewIpni>>; checked?: string } = {};
  let name: KewName | null = null;
  let syn: Awaited<ReturnType<typeof gbif.synonyms>>, vern: Awaited<ReturnType<typeof gbif.vernacular>>;
  if (carried) {
    // A re-derivation keeps what the build before it said of a homonym key.
    if (o.taxon?.species?.detail && KEW_NAME.test(o.taxon.species.detail)) upstream['gbif.species'] = { ...upstream['gbif.species'], detail: `${upstream['gbif.species'].detail}; that build: ${o.taxon.species.detail.replace(/^carried from build of [^;]*; that build: /, '')}` };
    syn = { status: 'ok', data: carried.name.synonyms };
    // Names a `--fill wikidata-names --keyed` run took from Wikidata (round eighty) are carried with their record, or not at all.
    vern = { status: 'ok', data: carried.wdNames ? carried.name.vernacular : carried.name.vernacular.filter((v) => !fromWikidata(v)) };
    upstream['gbif.synonyms'] = { status: 'ok', at: now(), detail: carriedFrom };
    upstream['gbif.vernacular'] = { status: 'ok', at: now(), detail: carriedFrom };
    if (carried.wdNames) upstream[WD_NAMES] = { ...carried.wdNames, detail: [carried.wdNames.detail, carriedFrom].filter(Boolean).join('; ') };
  } else {
    [syn, vern] = await Promise.all([gbif.synonyms(f, key), gbif.vernacular(f, key)]);
    mark('gbif.synonyms', syn);
    mark('gbif.vernacular', vern);
    // A key that is an orphan usage of the words, whose author is plainly not Kew's accepted entry for them, while GBIF holds
    // the words by Kew's author under another key (round seventy-one; self-review 70 S-B2): GBIF matched the bare name to
    // "Rubus parviflorus Kük.", with no synonym and no common name, while the thimbleberry is GBIF's "Rubus parviflorus
    // Nutt.", filed under Rubus nutkanus. The page cites Kew's author, reads synonyms and common names from GBIF's usage by
    // it (and the taxon GBIF files it under, unless that is another species of this reference), and says so.
    const orphan = (syn.status === 'ok' && !syn.data.length) || syn.status === 'none';
    name = orphan ? await kewName(f, { key, scientific, authorship: u(s.authorship), family: u(s.family), reference: o.reference }, kewAsk) : null;
    if (name?.note) upstream['gbif.species'] = { ...upstream['gbif.species'], detail: [upstream['gbif.species']?.detail, name.note].filter(Boolean).join('; ') };
    // A homonym key read and found to be Kew citing the author otherwise is recorded, so `--list-rebuild` lists it no more (B9).
    else if (kewAsk.checked) upstream['gbif.species'] = { ...upstream['gbif.species'], detail: [upstream['gbif.species']?.detail, kewAsk.checked].filter(Boolean).join('; ') };
    if (name?.borrow && syn.status === 'ok' && (vern.status === 'ok' || vern.status === 'none')) {
      if (vern.status === 'none') vern = { status: 'ok', data: [] };
      const b = await borrowNames(f, name.borrow, scientific);
      if (b.status === 'ok') {
        const s0 = syn, v0 = vern;
        syn = { ...s0, data: [...s0.data, ...b.data.synonyms.filter((x) => !s0.data.includes(x))], rows: [...(s0.rows ?? []), ...b.data.rows.filter((r) => !(s0.rows ?? []).some((x) => x.key === r.key))] };
        vern = { ...v0, data: [...v0.data, ...b.data.vernacular.filter((v) => !v0.data.some((x) => x.name === v.name && x.lang === v.lang))] };
        const from = `read from GBIF's ${name.borrow.label}`;
        upstream['gbif.synonyms'] = { ...upstream['gbif.synonyms'], detail: [upstream['gbif.synonyms'].detail, `${b.data.rows.length} ${from}`].filter(Boolean).join('; ') };
        upstream['gbif.vernacular'] = { ...upstream['gbif.vernacular'], ...(b.data.vernacular.length ? { status: 'ok' } : {}), detail: [upstream['gbif.vernacular'].detail, `${b.data.vernacular.length} ${from}`].filter(Boolean).join('; ') };
      } else upstream['gbif.synonyms'] = { ...upstream['gbif.synonyms'], detail: [upstream['gbif.synonyms'].detail, `GBIF's ${name.borrow.label} not read: ${b.status}`].filter(Boolean).join('; ') };
    }
    // A list GBIF pages past the build's limit is kept as far as it was read, and said (round sixty-two; agent Q, corpus 7).
    if (vern.status === 'ok' && vern.truncated) upstream['gbif.vernacular'] = { status: 'ok', at: now(), detail: `truncated: the first ${vern.truncated} rows only` };
    if (syn.status === 'ok' && syn.truncated) upstream['gbif.synonyms'] = { status: 'ok', at: now(), detail: `truncated: the first ${syn.truncated} rows only` };
  }
  // A page merged here (round seventy-three): its name, its synonyms and its common names join this page's, so they still
  // find the plant. A carried name block has them already.
  if (extraList.length && !carried) [syn, vern] = await extraNames(f, extraList, scientific, syn, vern, upstream);
  const authorship = name?.authorship ?? u(s.authorship);
  // A common name that is another species' name in this reference ("Babiana odorata" on Babiana villosula) is not a common
  // name (round seventy-two, A8); `--fill kew-names` drops those Kew holds too.
  if (vern.status === 'ok' && o.reference) {
    const other = (n: string) => { const k = o.reference!.keyOf(n.trim()); return k !== undefined && k !== key; };
    const drop = vern.data.filter((v) => BINOMIAL.test(v.name.trim()) && other(v.name));
    if (drop.length) {
      vern = { ...vern, data: vern.data.filter((v) => !drop.includes(v)) };
      upstream['gbif.vernacular'] = { ...upstream['gbif.vernacular'], detail: [upstream['gbif.vernacular']?.detail, `${drop.map((v) => `"${v.name}"`).join(', ')} not shown: a scientific name Kew or this reference holds`].filter(Boolean).join('; ') };
    }
  }
  // The older names the fallbacks may ask under: none when GBIF's list was refused, failed or cut short, and the records
  // say the older names were not asked rather than "nothing to report" (round sixty-nine; triage-68 M4, M8, S-A6).
  const synRows = syn.status === 'ok' && !syn.truncated && 'rows' in syn ? (syn.rows ?? []) : null;
  const synWhy = syn.status !== 'ok' ? (syn.status === 'skipped' ? 'not asked' : syn.status) : syn.truncated ? `truncated at ${syn.truncated} rows` : 'carried without their records';
  const olderNotAsked = synRows ? undefined : `older names not asked: GBIF synonyms ${synWhy}`;

  /* ---- 2. Distribution (WCVP via GBIF) ---- */
  const dist = await gbif.distributions(f, key);
  mark('wcvp.distribution', dist);
  // Kew's entry reached by an older name names both (round sixty-nine; triage-68 M2, M8): "Kew's entry Erythrina afra Thunb., reached by Erythrina fissa C.Presl".
  // Kew's rows of the species' words by another author are another name, and the record says so (round seventy; triage-69 B4, S-B4).
  const otherAuthor = dist.status === 'ok' && dist.data.otherAuthor ? `; ${dist.data.otherAuthor}` : '';
  if (dist.status === 'ok' && dist.data.via) upstream['wcvp.distribution'].detail = `Kew's entry ${dist.data.entry}, reached by ${dist.data.via}${otherAuthor}`;
  else if (dist.status === 'ok' && dist.data.synonymOf) upstream['wcvp.distribution'].detail = `${synonymOfWords(dist.data.synonymOf)}${dist.data.held ? ', with no native range' : ''}`;
  else if (dist.status === 'ok' && dist.data.held) upstream['wcvp.distribution'].detail = `Kew holds this name (${dist.data.held}), with no native range`;
  else if (otherAuthor) upstream['wcvp.distribution'].detail = otherAuthor.slice(2);
  // Kew's entry by another author, Kew's spelling, an unplaced name (round seventy-two, B2, B7, B8); and the day of Kew's files (B1).
  const rangeVia = dist.status === 'ok' ? dist.data.rangeVia : undefined;
  const viaSaid = rangeVia && dist.status === 'ok' && !dist.data.held && rangeVia.kind !== 'synonym-of' && rangeVia.kind !== 'older-name' ? viaDetail(rangeVia, authorship) : undefined;
  if (viaSaid) upstream['wcvp.distribution'].detail = [viaSaid, otherAuthor.slice(2)].filter(Boolean).join('; ');
  if (dist.status === 'ok' && dist.data.kewFile) upstream['wcvp.distribution'].asOf = dist.data.kewFile;
  const fromWcvp = dist.status === 'ok' && dist.data.wcvp;
  const { doubtful, native, introduced, reported, extinct, boxes } = regionsOf(dist.status === 'ok' ? dist.data.rows : [], !!fromWcvp);
  const verified = fromWcvp && native.length > 0;
  const ambiguous = dist.status === 'ok' ? dist.data.ambiguous : undefined;
  const kew = dist.status === 'ok' && dist.data.kew && (dist.data.kew.lifeform || dist.data.kew.climate) ? dist.data.kew : undefined;

  /* ---- 3. Occurrences, licence-filtered, corroborated against the range ---- */
  const own = await gbif.occurrences(f, key);
  // The other keys' records with the page key's (round seventy-three), one record once; any key not answering is the
  // occurrence source not answering, and the build before's records stand (`gbif.occurrences` refused).
  const extra = await extraOccurrences(f, own, extraList);
  const occ = extra.occ;
  mark('gbif.occurrences', occ);
  // Records from a GBIF download are cited by its DOI; records from the search API by the API.
  if (occ.status === 'ok' || (occ.status === 'none' && extra.keys.length)) {
    const rows = own.status === 'ok' ? own.data : [];
    const doi = rows.find((r) => r.downloadDoi)?.downloadDoi;
    // The download's day, not the build's (round seventy-two, B1): the records are as GBIF held them when it made the download.
    const day = rows.find((r) => r.downloadDay)?.downloadDay;
    const base = own.status !== 'ok' ? `no record under GBIF's key ${key}` : doi ? `GBIF occurrence download https://doi.org/${doi}${day ? `, of ${day}` : ''}` : 'GBIF occurrence search API';
    upstream['gbif.occurrences'].detail = [base, ...extra.keys.map(extraKeyWords)].join('; ');
    // A file's day only where every record set came from it.
    if (doi && day && extra.keys.every((k) => k.from === 'download')) upstream['gbif.occurrences'].asOf = day;
  }
  const inside = rangeTest(native, o.regions);
  const { open, restrictedInRange, forClimate, nOutside, nVague, datasets, nInstitution, institutionKinds, allPts, restrictedShiftKm, centroid, nDefault, nInRangeRecords } = readRecords(occ.status === 'ok' ? occ.data : [], boxes, !!verified, o.places, inside?.test, o.defaults);
  if (occ.status === 'ok' && nDefault) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, defaultWords(nDefault)].filter(Boolean).join('; ');
  if (occ.status === 'ok' && inside && boxes.length) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, inside.words].filter(Boolean).join('; ');
  if (occ.status === 'ok') {
    // The record says what the institution rule left out, or that it was not applied (rule 2: not tested is not none).
    const instSaid = o.places ? institutionWords(nInstitution, institutionKinds, o.places.radiusM) : 'records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build';
    if (instSaid) upstream['gbif.occurrences'].detail = [upstream['gbif.occurrences'].detail, instSaid].filter(Boolean).join('; ');
  }
  let climate: Climate = { status: 'none', detail: 'no georeferenced record inside the range' };
  // A refusal said as a refusal, a failure as "did not answer" (round sixty-two; the grower review's 2, rule 2), each as a
  // full clause with its article and its time, as the page says it: the page still words the bare form of a dossier built
  // before (`detailSentence`, `climateDetail`), so both read the same (round sixty-three; review-60 visitor-words 16).
  if (occ.status === 'refused' || occ.status === 'error') climate = { status: 'refused', detail: `the occurrence source ${occ.status === 'refused' ? 'refused the request' : 'did not answer'} when this page was built` };
  else if (dist.status === 'refused' || dist.status === 'error') climate = { status: 'refused', detail: `the distribution source ${dist.status === 'refused' ? 'refused the request' : 'did not answer'} when this page was built, so the range could not be verified` };
  // A source the build did not ask (an offline re-derivation) refused nothing: the climate waits for a build that asks,
  // and the builder carries the previous build's range and climate where it has them (round sixty-seven; triage-66 N4).
  else if (occ.status === 'skipped') climate = { status: 'pending', detail: 'the occurrence source was not asked when this page was built' };
  else if (dist.status === 'skipped') climate = { status: 'pending', detail: 'the distribution source was not asked when this page was built, so the range could not be verified' };
  // No verified native range means no way to tell a habitat record from a garden one, so no habitat climate: the map stays, the advice does not.
  else if (ambiguous) climate = { status: 'none', detail: `native range not verified: ${ambiguous}` };
  else if (dist.status === 'ambiguous') climate = { status: 'none', detail: `native range not verified: ${dist.detail}` };
  else if (dist.status === 'ok' && dist.data.held) climate = { status: 'none', detail: 'native range not verified: Kew holds this name with no native range, so records cannot be told from cultivation and no habitat climate is derived' };
  else if (!verified || !boxes.length) climate = { status: 'none', detail: !verified ? 'native range not verified: no WCVP distribution with native status for this name, so records cannot be told from cultivation and no habitat climate is derived' : 'native range is stated at country level only, with no region boxes to test records against' };
  else if (forClimate.length) climate = await (o.climate ?? noClimate).envelope(forClimate);
  else if (allPts.length) climate = { status: 'none', detail: noPlacedWords(nInRangeRecords, allPts.length) };
  // Extremes read at a POWER cell that is mostly sea are set aside at the build, as the reader sets them aside (round
  // thirty-five, R1-11): a fresh file carries what the page will show, and every read-time mend is a no-op on it (round forty-one, R5).
  // Extremes beyond a lapse correction's reach, or whose nights and the habitat's months disagree, are set aside too, and the record says why (round eighty, A; round eighty-four's words, `lapseCause`).
  const lapseWhy = climate.status === 'ok' && !(climate.landFraction != null && climate.landFraction < 0.5) ? lapseSetAside(climate) : null;
  climate = setAsideExtremes(climate);
  if (climate.status === 'pending') upstream.climate = { status: 'skipped', at: now(), detail: climate.detail };
  else mark('climate', climate.status === 'ok' ? { status: 'ok' } : { status: climate.status, detail: climate.detail });
  // The daily extremes are their own upstream: a refusal here is a reason to build again, which `climate: ok` alone would hide (round sixteen, 7).
  // A failure is recorded as `error`, not `refused` (round sixty-nine; triage-68 W6, S-E7): the climate keeps one status for
  // both, which the page says as "not checked", and the provider's words say which it was ("did not answer" for a timeout
  // or a 5xx, "refused the request" for a refusal), so the record is read from them.
  if (climate.status === 'ok' && climate.extremesStatus) upstream['climate.extremes'] = { status: climate.extremesStatus === 'refused' ? (/^NASA POWER did not answer\b/.test(climate.src.extremes ?? '') ? 'error' : 'refused') : climate.extremesStatus === 'skipped' ? 'skipped' : climate.extremesStatus === 'none' || climate.extremesStatus === 'lapse' ? 'none' : 'ok', at: now(), ...(climate.src.extremes ? { detail: `${climate.src.extremes}${lapseWhy ? `; not used: ${lapseWhy}` : ''}` } : {}) };

  /* ---- 5. Identifiers, summary ---- */
  const ids: Dossier['ids'] = { gbif: key };
  const links: Record<string, string> = { gbif: `https://www.gbif.org/species/${key}` };
  const skip = (k: SkippableSource) => !!o.skip?.includes(k);
  const skipped = (k: string, detail?: string) => (upstream[k] = { status: 'skipped', at: now(), ...(detail ? { detail } : {}) });
  // The older names with the same type, by which Wikidata and iNaturalist may file the species (round sixty-eight, third part).
  const sameType = synRows ? gbif.sameTypeNames({ key, basionymKey: s.basionymKey }, synRows) : [];
  // Wikidata's lag is waited out in rounds by a corpus run, as the fills wait it (round seventy, the owner's run).
  // A page with a Kew id is matched on Wikidata by its GBIF key and Kew's identifiers alone, never by its label (round eighty, A),
  // wherever Kew gives its name and author an identifier; with none, its label is read and the item proved (round eighty-two).
  const askWd = () => wm.crossIds(f, scientific, key, sameType.map((r) => ({ key: r.key, name: r.name })), { authorship, family: u(s.family), kew: kewAsk, kewPage: pageId.startsWith('k') || !!o.kewEntryOf?.(key) });
  const x: wm.CrossResult = skip('wikidata') ? { status: 'skipped', detail: '' } : wm.mwWait.patient ? await wm.patiently(askWd, (y) => y.status === 'error' && y.by !== 'gbif' && wm.isLagged(y.detail)) : await askWd();
  if (x.status === 'skipped') skipped('wikidata');
  // GBIF not answering while it checks the item Wikidata gave is recorded as GBIF's, after Wikidata's answer (round
  // seventy; triage-69 B2, S-B6: the row read "Wikidata · refused" for a source that had answered).
  else if ((x.status === 'refused' || x.status === 'error') && x.by === 'gbif') mark('wikidata', { status: x.status, detail: `Wikidata answered; GBIF, asked to check the item it gave, ${x.status === 'refused' ? 'refused the request' : 'did not answer'} (${x.detail})` });
  // A "none" always says why (round eighty-two, F; review 1's 7: eight pages built on 2026-10-21 and 22 said none with no
  // reason): the older names not asked, or no item found by any route (`NO_ITEM`, the words `--fill wikidata` writes).
  else mark('wikidata', wikidataSaid(x, olderNotAsked));
  let enTitle = scientific;
  // The titles that are this species' article: the item's sitelink (or, when Wikidata did not answer, the title the
  // previous build kept, itself checked), the name and the older names (round sixty-nine; triage-68 M3).
  const titles = [scientific, ...(synRows ?? []).filter((r) => (r.rank ?? 'SPECIES').toUpperCase() === 'SPECIES').map((r) => r.name)];
  if ((x.status === 'error' || x.status === 'refused') && o.prevIds) keepPrevIds(o.prevIds);
  if (x.status === 'ok') {
    // IPNI and POWO by Kew's number for the name and author (S-B5): never an item's number Kew holds for another author.
    if (!kewAsk.r && (x.data.ipni || x.data.powo)) kewAsk.r = await gbif.kewIpni(f, scientific, authorship, u(s.family));
    if (kewAsk.r?.status === 'ok') {
      const k = gbif.kewLinks(x.data, kewAsk.r.data);
      if (k.changed) upstream.wikidata = { ...upstream.wikidata, detail: [upstream.wikidata.detail, gbif.kewLinksNote(kewAsk.r.data, k, `IPNI ${x.data.ipni ?? 'none'}, POWO ${x.data.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? 'none'}`)].filter(Boolean).join('; ') };
      x.data.ipni = k.ipni;
      x.data.powo = k.powo;
    }
    Object.assign(ids, { wikidata: x.data.wikidata, powo: x.data.powo, ipni: x.data.ipni, inat: x.data.inat, wfo: x.data.wfo });
    if (x.data.enTitle) enTitle = x.data.enTitle;
    if (x.data.powo) links.powo = `https://powo.science.kew.org/taxon/${x.data.powo}`;
    if (x.data.ipni) links.ipni = `https://www.ipni.org/n/${x.data.ipni}`;
    if (x.data.wfo) links.wfo = `https://www.worldfloraonline.org/taxon/${x.data.wfo}`;
    links.wikidata = `https://www.wikidata.org/wiki/${x.data.wikidata}`;
  }
  // No number from the item, or no item: Kew's number for the name and author is linked all the same (round
  // seventy-two, A: 138 pages Kew holds by their name and author linked neither POWO nor IPNI).
  // And with two items, or Wikidata not asked: IPNI and POWO are Kew's, from Kew's file, whatever Wikidata answered (round
  // eighty, A: Datura innoxia, two items labelled with its name, linked no IPNI and no POWO though Kew holds Datura innoxia Mill.).
  if (x.status !== 'refused' && x.status !== 'error' && !ids.ipni && !ids.powo) {
    kewAsk.r ??= await gbif.kewIpni(f, scientific, authorship, u(s.family));
    if (kewAsk.r.status === 'ok' && kewAsk.r.data.ids.length) {
      const k = gbif.kewLinks({}, kewAsk.r.data);
      if (k.ipni) { ids.ipni = k.ipni; links.ipni = `https://www.ipni.org/n/${k.ipni}`; }
      if (k.powo) { ids.powo = k.powo; links.powo = `https://powo.science.kew.org/taxon/${k.powo}`; }
      if (k.changed && upstream.wikidata) upstream.wikidata = { ...upstream.wikidata, detail: [upstream.wikidata?.detail, `IPNI and POWO linked by Kew's number${kewAsk.r.data.label ? ` for ${kewAsk.r.data.label}` : ''} (no item's number)`].filter(Boolean).join('; ') };
    }
  }
  // A hybrid of the list (round eighty-one, H; review-d 3): Kew's copy at GBIF writes its own row with the sign, which the
  // name asked above has not, so the row is never found by it (Fragaria × ananassa, Sarracenia × farnhamii linked neither).
  // Linked by the numbers of its Kew entry, the page's own id, as `$core/hybrids` holds them from Kew's file.
  if (!ids.ipni && !ids.powo) {
    const h = hybridLinks(pageId);
    if (h.ipni) { ids.ipni = h.ipni; links.ipni = `https://www.ipni.org/n/${h.ipni}`; }
    if (h.powo) { ids.powo = h.powo; links.powo = `https://powo.science.kew.org/taxon/${h.powo}`; }
  }
  // The name the page links is the name it cites (round seventy-two, A): Kew's row for the linked number, where it is
  // this species' words by another citation (Ixora coccinea L., not the backbone's "Comm. ex Lam.").
  const linkedNo = ids.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? ids.ipni;
  const linkedLabel = linkedNo && kewAsk.r?.status === 'ok' ? kewAsk.r.data.labels?.[linkedNo] : undefined;
  const citedAs = linkedLabel && linkedLabel.toLowerCase().startsWith(`${scientific.toLowerCase()} `) ? linkedLabel.slice(scientific.length).trim() : undefined;
  const shownAuthorship = citedAs && citedAs !== authorship?.trim() ? citedAs : authorship;
  if (shownAuthorship !== authorship) upstream['gbif.species'] = { ...upstream['gbif.species'], detail: [upstream['gbif.species']?.detail, citedWords(key, scientific, authorship ?? '', linkedLabel!)].filter(Boolean).join('; ') };
  // `name.cited` (FIX-BRIEF-72): the backbone's citation and Kew's row cited, here or by `kewName` on a homonym key.
  const citedRow = linkedNo && kewAsk.r?.status === 'ok' ? kewAsk.r.data.plantIds?.[linkedNo] : undefined;
  const cited = (shownAuthorship !== authorship || name) && citedRow && shownAuthorship !== u(s.authorship) ? { gbif: u(s.authorship) ?? '', kew: citedRow } : undefined;
  /**
   * Wikidata did not answer: the identifiers of the build that last read them stand, and the record names that build;
   * past `CARRY_DAYS` they are not carried (round sixty-eight; round sixty-nine, triage-68 M5, M8). With no day known they
   * are kept, and the record says so: a lag is not an answer, and dropping them took Pleiospilos simulans', Dorstenia
   * conceptionis', Avonia dinteri's and Hibiscus acetosella's item, POWO, IPNI and WFO (round seventy, the owner's run).
   */
  function keepPrevIds(p: NonNullable<BuildOptions['prevIds']>) {
    if (!p.wikidata && !p.inat) return;
    const age = daysSince(o.prevIdsOn, now());
    if (o.prevIdsOn && !(age <= CARRY_DAYS)) {
      const was = o.prevIdsDayUnknown ? `kept since ${o.prevIdsOn}, of a day not known` : `read by the build of ${o.prevIdsOn}`;
      upstream.wikidata = { ...upstream.wikidata, detail: `${upstream.wikidata.detail ?? ''}; the previous identifiers are not kept: ${was}, more than ${CARRY_DAYS} days ago`.replace(/^; /, '') };
      return;
    }
    Object.assign(ids, { wikidata: p.wikidata, powo: p.powo, ipni: p.ipni, inat: p.inat, wfo: p.wfo });
    if (p.powo) links.powo = `https://powo.science.kew.org/taxon/${p.powo}`;
    if (p.ipni) links.ipni = `https://www.ipni.org/n/${p.ipni}`;
    if (p.wfo) links.wfo = `https://www.worldfloraonline.org/taxon/${p.wfo}`;
    if (p.wikidata) links.wikidata = `https://www.wikidata.org/wiki/${p.wikidata}`;
    if (p.wikipedia) enTitle = p.wikipedia;
    upstream.wikidata = { ...upstream.wikidata, detail: `${upstream.wikidata.detail ?? ''}; ${o.prevIdsOn && !o.prevIdsDayUnknown ? `the identifiers of the build of ${o.prevIdsOn} are kept` : `the identifiers of an earlier build, of a day not known, are kept since ${o.prevIdsOn ?? now().slice(0, 10)}`}`.replace(/^; /, '') };
  }
  let summary: Dossier['summary'];
  // The proofs read the species' Wikidata item and its older names as stored, as `--fill summaries` reads them (round seventy, A1; S-A5),
  // and its IPNI identifier and cited author, for the IPNI proof (round seventy-one, A8: the fill's `whoOf` reads the same).
  const w = skip('wikipedia') ? ({ status: 'skipped' } as const) : await wm.summary(f, enTitle, [enTitle, ...titles], { name: scientific, synonyms: syn.status === 'ok' ? syn.data : [], item: ids.wikidata, ipni: ids.ipni, authorship });
  if (w.status === 'skipped') skipped('wikipedia');
  else mark('wikipedia', w);
  if (w.status === 'ok') {
    summary = { text: w.data.text, source: 'wikipedia', url: w.data.url, licence: 'CC BY-SA 4.0', title: w.data.title, ...(w.data.cut ? { cut: true as const } : {}) };
    ids.wikipedia = w.data.title;
    links.wikipedia = w.data.url;
  }

  /* ---- 6. Photographs: iNat (open licences only), then GBIF media, then Commons ---- */
  const photos: Photo[] = [];
  let inatId = ids.inat;
  // Where the id came from, for the record: Wikidata's item, or the identifiers of an earlier build kept.
  const inatFrom = x.status === 'ok' && x.data.inat === inatId ? 'as Wikidata gives it' : o.prevIdsOn && !o.prevIdsDayUnknown ? `kept from the build of ${o.prevIdsOn}` : 'kept from an earlier build';
  // The taxon an inactive id named and the rule refused: never taken by the name search either, which finds it by
  // iNaturalist's own synonymy (Mammillaria karwinskiana's search answers Mammillaria geminata; round seventy, triage-69 B1).
  const refused = new Set<number>();
  // This species' own names (`ownNames`; round seventy, second pass, triage-69 B7): the accepted name, the same-type
  // names, and the other synonyms GBIF holds under it that no species of this reference holds.
  const owned = ownNames({ scientific, sameType: sameType.map((r) => r.name), synonyms: synRows ?? [], heldElsewhere: o.heldElsewhere });
  // A taxon of another name is judged at GBIF (`judgeIdTaxon`; round seventy, the owner's run, R47's rule).
  const judgeFor: inat.JudgeFor = { key, scientific, authorship, family: u(s.family), own: owned, heldElsewhere: o.heldElsewhere, reference: o.reference };
  if (inatId && !skip('inat')) inatId = await checkedInatId(inatId);
  if (!inatId && !skip('inat')) {
    let t: SourceResult<inat.InatTaxon> = await inat.taxonFor(f, { scientific, key, family: u(s.family), own: owned, sameType: sameType.map((r) => r.name), heldElsewhere: o.heldElsewhere, reference: o.reference, refused });
    if (t.status === 'none' && olderNotAsked && !t.detail) t = { status: 'none', detail: olderNotAsked };
    mark('inat.taxon', mergeNotes(upstream['inat.taxon'], t));
    if (t.status === 'ok') inatId = ids.inat = t.data.id;
  }
  /**
   * An iNaturalist id from Wikidata or carried from the previous build, checked with iNaturalist itself (round sixty-nine;
   * triage-68 M5, R46-13). An active id is recorded as checked (round seventy; triage-69 S-B7). An inactive id is followed
   * to the one current taxon it names, and an active id of another name is kept, only when `judgeIdTaxon` takes it: one
   * of the species' own names in any spelling, or a name GBIF or Kew holds as this species, or this species' epithet in
   * a genus outside the reference; never another species of the reference (round seventy; triage-69 B1, S-B1: Pinguicula
   * chilensis took Pinguicula antarctica's 33 photographs; the owner's run: Zephyranthes formosissima is Sprekelia
   * formosissima). Otherwise it is dropped, saying which taxon it named and why, and the name is searched. A check
   * refused or failed keeps the id, and says it was not checked.
   */
  async function checkedInatId(id: number): Promise<number | undefined> {
    const notChecked = (c: { status: Upstream['status']; detail?: string } | { status: 'none' }, what: string) => {
      const why = 'detail' in c && c.detail ? `: ${c.detail}` : '';
      upstream['inat.taxon'] = { status: c.status, at: now(), detail: `${what} not checked${why}` };
      return id;
    };
    const c = await inat.checkIds(f, [id]);
    if (c.status !== 'ok') return notChecked(c, `iNaturalist taxon ${id}`);
    const got = c.data.get(id);
    if (got?.active) {
      const named = `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''}, ${inatFrom},`;
      if (!got.name || isOwnName(owned, got.name)) {
        upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${named} is active` };
        return id;
      }
      // A taxon of another name, judged at GBIF (round seventy; triage-69 B5 as the owner's run revised it).
      const g = await inat.judgeIdTaxon(f, id, got, judgeFor);
      if (g.status !== 'ok') return notChecked(g, `${named} is active; its name was`);
      if (!g.data.take) {
        refused.add(id);
        upstream['inat.taxon'] = { status: 'none', at: now(), detail: `${named} is not this species: ${g.data.why}; asked by name` };
        ids.inat = undefined;
        return undefined;
      }
      upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${named} is active: ${g.data.why}` };
      ids.inat = g.data.to;
      return g.data.to;
    }
    const was = `iNaturalist's taxon ${id}${got?.name ? ` (${got.name})` : ''} is inactive`;
    if (got?.current) {
      const n = await inat.checkIds(f, [got.current]);
      if (n.status !== 'ok') return notChecked(n, `${was}; its current taxon ${got.current}`);
      const cur = n.data.get(got.current);
      const named = `its current taxon ${got.current}${cur?.name ? ` (${cur.name})` : ''}`;
      const g = cur?.name && cur.active && isOwnName(owned, cur.name) ? ({ status: 'ok', data: { take: true, why: '', to: got.current } } as const) : await inat.judgeIdTaxon(f, got.current, cur, judgeFor);
      if (g.status !== 'ok') return notChecked(g, `${was}; ${named}`);
      if (g.data.take) {
        upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${was}; followed to ${named}${g.data.why ? `: ${g.data.why}` : ''}` };
        ids.inat = g.data.to;
        return g.data.to;
      }
      refused.add(got.current);
      upstream['inat.taxon'] = { status: 'none', at: now(), detail: `${was}; ${named} is not this species: ${g.data.why}; asked by name` };
      ids.inat = undefined;
      return undefined;
    }
    upstream['inat.taxon'] = { status: 'none', at: now(), detail: `${was}, with no single current taxon; asked by name` };
    ids.inat = undefined;
    return undefined;
  }
  if (skip('inat')) {
    // Not asked either: a rederive carries the previous answer forward only for keys marked skipped. Each says why (round
    // eighty, agent I: 7 of 36 sampled new pages said "not asked" with no reason): the build leaves iNaturalist to the
    // daily fill, which asks the taxon by name, or checks the id an item gave, before any photograph.
    skipped('inat.taxon', inatId ? `not asked: this build left iNaturalist to the daily fill (--fill inat), which checks taxon ${inatId}, ${inatFrom}, before its photographs` : INAT_LEFT_TO_FILL);
    skipped('inat.photos.wild', INAT_SETS_LEFT);
    skipped('inat.photos.cultivated', INAT_SETS_LEFT);
  } else if (inatId) {
    links.inat = `https://www.inaturalist.org/taxa/${inatId}`;
    const owner = { key: pageId, held: o.held, kew: o.kewInfra ? (t: string) => o.kewInfra!.placedElsewhere(t, { scientific, synonyms: syn.status === 'ok' ? syn.data : [], ipni: ids.ipni }) : null };
    const wild = await inat.photos(f, inatId, true, 24, owner);
    mark('inat.photos.wild', wild);
    if (wild.status === 'ok') photos.push(...wild.data);
    const cult = await inat.photos(f, inatId, false, 12, owner);
    // The record names the rule it was asked by (round seventy-eight), so `--fill inat` knows a record of the rule before.
    mark('inat.photos.cultivated', cult.status === 'ok' || cult.status === 'none' ? { status: cult.status, detail: inat.CULTIVATED_RULE } : cult);
    if (cult.status === 'ok') photos.push(...cult.data);
  }
  // GBIF's media before Commons, and only the photographs of the species' own sources count towards "fewer than six":
  // Commons was asked first, so a few of its files kept GBIF's observation photographs out and led the page (round
  // sixty-nine; triage-68 K5, S-B2, R46-16).
  if (skip('gbif.media')) skipped('gbif.media');
  else if (!o.quick && (o.mediaFirst || photos.length < 6)) {
    const m = await extraMedia(f, await gbif.media(f, key), extraList);
    mark('gbif.media', m);
    if (m.status === 'ok') photos.push(...photosFromMedia(m.data));
  }
  if (skip('commons')) skipped('commons');
  else if (!o.quick && photos.length < 12) {
    const cat = x.status === 'ok' && x.data.commonsCategory ? x.data.commonsCategory : scientific;
    // The species' own and older names, by which a file named as another species is left out (triage-68 K1).
    const c = await commons.commonsPhotos(f, cat, 12, { scientific, synonyms: syn.status === 'ok' ? syn.data : [], key: pageId, gbif: key, held: o.held, authorship });
    mark('commons', c);
    if (c.status === 'ok') photos.push(...c.data);
  }

  const photosOut = dedupePhotos(photos);

  /* ---- 7. Literature: off (round seventy-eight, the owner's decision 2) ---- */
  // The build asks OpenAlex nothing: a search a species is $54 or 54 free days at 54,000 species (docs/SCALE-STUDY.md
  // 3.2). The record says why, and the page says "not checked" with it, never "none"; a later round fills the papers
  // from OpenAlex's free snapshot. A previous build's papers are not carried into a page built now (`LITERATURE_OFF`).
  const papers: Dossier['literature'] = [];
  upstream.openalex = { status: 'skipped', at: now(), detail: LITERATURE_OFF };

  const classification = (['kingdom', 'phylum', 'class', 'order', 'family', 'genus'] as const)
    .filter((r) => s[r])
    .map((r) => ({ rank: r, name: s[r] as string, key: u(s[`${r}Key` as keyof typeof s] as number | null | undefined) }));

  const dossier: Dossier = {
    v: DOSSIER_V,
    key: pageId,
    slug: slugify(scientific),
    built: now(),
    builtBy: o.builtBy,
    name: {
      scientific,
      authorship: shownAuthorship,
      // A re-derivation keeps what Kew's names said: Kew's file has not changed under it (round seventy-two, A).
      ...(cited ? { cited } : carried?.name.cited ? { cited: carried.name.cited } : {}),
      ...(carried?.name.kew ? { kew: carried.name.kew } : {}),
      // The names GBIF files under the species' varieties (round eighty-four, A8), as `--fill gbif-infra` read them: carried.
      ...(carried?.name.infra?.length ? { infra: carried.name.infra } : {}),
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
    distribution: { native, introduced, reported: reported.length ? reported : undefined, extinct: extinct.length ? extinct : undefined, doubtful: doubtful.length ? doubtful : undefined, kew, ambiguous, source: rangeSource(dist), boxes, verified, ...(rangeVia ? { via: withPage(rangeVia, pageId, o.reference ? { keyOf: (n) => { const g = o.reference!.keyOf(n); return g == null ? undefined : (o.pageIdOf?.(g) ?? gbifPage(g)); } } : null) } : {}) },
    occurrences: {
      open,
      nOpenInRange: open.length,
      nRestrictedInRange: restrictedInRange.length,
      nOutsideRange: nOutside,
      nVague,
      rangeTested: boxes.length > 0,
      // The shapes' rule the records were tested by (round eighty-four; `--check-ranges` lists a page derived before it).
      ...(inside?.rule && boxes.length ? { rangeRule: inside.rule } : {}),
      restrictedShiftKm,
      thin: allPts.length < 12,
      datasets: [...datasets.entries()].map(([k, d]) => ({ key: k, title: u(d.title), licence: d.licence, n: d.n })),
      ...(extra.keys.length ? { keys: extra.keys } : {})
    },
    centroid,
    climate,
    photos: photosOut,
    literature: papers,
    links,
    upstream
  };
  // B2 after A1: Kew's entry by another author is said only while the page cites another name than the entry.
  settleRange(dossier);
  // Kew's accepted name heads a `k` page (round eighty-four, the owner's decision 1; `kew-heading.ts`), its id being Kew's
  // entry, which `--fill kew-names` stored; and no page's heading is malformed (an author cut short, a rank word left out).
  headWithKew(dossier as Parameters<typeof headWithKew>[0], pageId);
  // Never publish something the schema will refuse to serve.
  return { ok: true, dossier: parseDossier(dossier, o.held) };
}

/**
 * Whether a record is placed precisely enough to read climate at (round thirty; the words above `forClimate` in
 * `readRecords`): its dataset states an uncertainty of 10 km or less, or, stating none, it is a human observation with
 * coordinates to three decimals or better. The decimals are counted as the record wrote them: the download's text keeps
 * a trailing zero ("-33.120" is three) and the parser carries the count; a JSON number from the API has lost it, so the
 * count from the number is a floor, never an overstatement. A publisher's stated coordinatePrecision of 0.001° or finer
 * counts the same as three decimals.
 */
export function placedForClimate(r: Pick<gbif.GbifOccurrence, 'decimalLatitude' | 'decimalLongitude' | 'coordinateUncertaintyInMeters' | 'basisOfRecord' | 'coordDecimals' | 'coordinatePrecision'>): boolean {
  if (r.coordinateUncertaintyInMeters != null) return r.coordinateUncertaintyInMeters <= 10_000;
  const decimals = (x: number) => (String(x).split('.')[1] ?? '').replace(/e.*$/i, '').length;
  const written = r.coordDecimals ?? Math.min(decimals(r.decimalLatitude!), decimals(r.decimalLongitude!));
  return r.basisOfRecord === 'HUMAN_OBSERVATION' && (written >= 3 || (r.coordinatePrecision != null && r.coordinatePrecision <= 0.001));
}

/**
 * The records of a page read against its range (round seventy-nine, the merge: one reading for a page with a GBIF key
 * and a page without one, whose records come from the keys Kew's synonymy gives it): planted and garden records left
 * out, one record a three-decimal coordinate, each tested against the range's boxes, the open ones kept for the map, the
 * precise ones for the climate; then the map marker. Pure: the climate is read by the caller from `forClimate`.
 */
export function readRecords(data: readonly gbif.GbifOccurrence[], boxes: readonly Box[], verified: boolean, places?: PlaceIndex, inside?: (lat: number, lon: number) => boolean, defaults?: ReadonlySet<string>) {
  const open: OccPoint[] = [];
  const restrictedInRange: Array<[number, number]> = [];
  /** In-range coordinates precise enough to read climate at (uncertainty under 10 km, or unstated). */
  const forClimate: Array<[number, number]> = [];
  let nOutside = 0,
    nVague = 0;
  const datasets = new Map<string, { title?: string; licence: string; n: number }>();
  // Records at a botanic garden, a herbarium or a zoo (round seventy-nine, Q; `clean.ts`), counted by the kind of place.
  let nInstitution = 0;
  /** Records at a default point (round eighty, A). */
  let nDefault = 0;
  /** The in-range records, each counted (the coordinates above are one a place). */
  let nInRangeRecords = 0;
  const institutionKinds = new Map<InstitutionKind, number>();
  {
    // Same coordinate to three decimals is one place; when an open and a restricted record share it, the
    // open one is the one kept, so a licence never hides a record the map could show.
    const byCoord = new Map<string, gbif.GbifOccurrence>();
    // How many records each kept coordinate stands for (round eighty-four, A6f: the climate's reason counts records).
    const nAt = new Map<string, number>();
    for (const r of data) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) continue;
      if (r.basisOfRecord === 'LIVING_SPECIMEN') continue; // a plant somebody planted
      if (CULTIVATED_RE.test(`${r.establishmentMeans ?? ''} ${r.degreeOfEstablishment ?? ''}`)) continue;
      // A plant at a botanic garden, a herbarium or a zoo is a planted one, or a specimen placed at its keeper's address,
      // whatever its basis of record says: on round seventy-seven's corpus 20,701 kept points of 2,651 species lay within
      // 1 km of one (round seventy-nine, Q). Tested on the record's own coordinates, before they are rounded.
      const at = places?.near(r.decimalLatitude, r.decimalLongitude);
      if (at) {
        nInstitution++;
        institutionKinds.set(at.kind, (institutionKinds.get(at.kind) ?? 0) + 1);
        continue;
      }
      const dk = `${+r.decimalLatitude.toFixed(3)},${+r.decimalLongitude.toFixed(3)}`;
      // A dataset's default point, not where the plant was found (round eighty, A; `default-points.ts`): left out, counted.
      // A record there whose dataset states it placed to within 10 km, the climate's own line, is kept (round eighty-three,
      // C): at 48,357 species the list's 5,187 points are mostly survey plots and local floras that state where they are,
      // and a centroid's records state no such thing (Mexico's middle: GenBank's samples with no figure; French Guiana's:
      // 201 km). A record with no figure there is left out, whatever its decimals: a checklist placed at one point
      // writes them as a phone does.
      if (defaults?.has(dk) && !(r.coordinateUncertaintyInMeters != null && r.coordinateUncertaintyInMeters <= 10_000)) { nDefault++; continue; }
      nAt.set(dk, (nAt.get(dk) ?? 0) + 1);
      const held = byCoord.get(dk);
      // One record per three-decimal coordinate: an open one over a restricted one (what may be published), and among
      // the same licence class the more precisely placed one (what may enter the climate), so a 1 km record is not
      // discarded for a 100 km one that happened to come first.
      const unc = (x: typeof r) => x.coordinateUncertaintyInMeters ?? Infinity;
      const better = !held || (!isOpen(licenceTag(held.license)) && isOpen(licenceTag(r.license))) || (isOpen(licenceTag(held.license)) === isOpen(licenceTag(r.license)) && unc(r) < unc(held));
      if (better) byCoord.set(dk, r);
    }
    for (const r of byCoord.values()) {
      const lat = +r.decimalLatitude!.toFixed(3),
        lon = +r.decimalLongitude!.toFixed(3);
      const tag = licenceTag(r.license);
      const dsKey = r.datasetKey ?? '?';
      const ds = datasets.get(dsKey) ?? { title: r.datasetName ?? undefined, licence: tag ?? 'unstated', n: 0 };
      ds.n++;
      datasets.set(dsKey, ds);
      // No boxes (the range source refused, or a country-level range): nothing is tested and every record is kept; the
      // dossier says so (`rangeTested: false`) rather than publishing the count as records inside the range (round sixteen, 6).
      // By the regions' shapes where the build has them (round eighty, A; `tdwg-shapes.ts`), else their boxes.
      const inRange = boxes.length ? (inside ? inside(lat, lon) : boxes.some((b) => inBox(lat, lon, b))) : true;
      if (!inRange) {
        nOutside++;
        continue;
      }
      nInRangeRecords += nAt.get(`${lat},${lon}`) ?? 1;
      if (isOpen(tag)) open.push([lat, lon, r.year ?? null, r.countryCode ?? null, r.basisOfRecord ?? null, tag!]);
      else restrictedInRange.push([lat, lon]);
      // A record with no stated accuracy is not a precise one: it enters the climate figures only when it is a human
      // observation with coordinates to three decimals or better (about a hundred metres), the way a phone records them;
      // a herbarium sheet placed at a locality's centre with no figure stays out, as the de-duplication above already
      // treats it (round thirty, R2-11). Takes effect when the corpus is next built.
      // The decimals are counted as the record wrote them: the download's text keeps a trailing zero ("-33.120" is
      // three) and the parser carries the count; a JSON number from the API has lost it, so the count from the number
      // is a floor, never an overstatement (round thirty-three, 9; round thirty-five, R2-2). A publisher's stated
      // coordinatePrecision of 0.001° or finer counts the same as three decimals.
      if (placedForClimate(r)) forClimate.push([lat, lon]);
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
      // Says where the marker is and nothing about the climate: whether a climate was read is decided further down, and the page says which.
      how: `the map marker: ${at.snapped === 'open-record' ? 'the openly licensed record nearest the middle' : 'the centre of the tenth-degree cell nearest the middle (no openly licensed record lies in the population, so no record\'s coordinates are published)'} of the densest ${at.refined ? `1° population inside the densest ${cluster.cell}° block` : `${cluster.cell}° population`} of the ${allPts.length} in-range records; it decides nothing`
    };
  }
  return { open, restrictedInRange, forClimate, nOutside, nVague, datasets, nInstitution, institutionKinds, openPts, allPts, restrictedShiftKm, centroid, nDefault, nInRangeRecords };
}

/** The words a record of a species on a homonym key carries (`kewName`), by which a re-derivation keeps them. */
export const KEW_NAME = /is cited as Kew (?:accepts|cites) it/;

/** What `kewName` decides: Kew's author for the page, the usage to borrow names from, and the record's words. */
export type KewName = { authorship: string; note: string; borrow?: { usage: number; target: number; label: string } };

/**
 * A species on a homonym key (round seventy-one; self-review 70 S-B2): the key is an orphan usage (the caller asks only
 * for a key with no synonym at GBIF), its author is plainly another than the one entry Kew accepts under the words, and
 * GBIF holds the words by Kew's author once, under another key. The name is cited as Kew cites it; GBIF's one usage of the words by Kew's author
 * is where GBIF keeps the plant's synonyms and common names, and the taxon it files that usage under (when it is a
 * synonym) is read too, unless it is another species of this reference (Adenia gummifera's "(Harv.) Harms" is GBIF's
 * synonym of Adenia cissampeloides, a page here). Null when Kew agrees, or did not answer (nothing then changes).
 */
export async function kewName(f: JsonFetcher, sp: { key: number; scientific: string; authorship?: string; family?: string; reference?: Reference }, ask: { r?: Awaited<ReturnType<typeof gbif.kewIpni>>; checked?: string } = {}): Promise<KewName | null> {
  if (!sp.authorship) return null;
  ask.r ??= await gbif.kewIpni(f, sp.scientific, sp.authorship, sp.family);
  const k = ask.r;
  if (k.status !== 'ok' || !k.data.label?.toLowerCase().startsWith(`${sp.scientific.toLowerCase()} `)) return null;
  const kewAuthor = k.data.label.slice(sp.scientific.length).trim();
  if (!plainlyAnother(sp.authorship, kewAuthor)) return null;
  const first = ask.r;
  const base = `GBIF's key ${sp.key} is ${sp.scientific} ${sp.authorship}; Kew accepts ${k.data.label}, and the name is cited as Kew accepts it`;
  const us = await gbif.usages(f, sp.scientific);
  if (us.status !== 'ok') return null;
  const by = ownByAuthor(us.data.filter((x) => x.key !== sp.key), kewAuthor, (x) => x.authorship);
  // No one usage by Kew's author elsewhere, or one GBIF files under this very key: not a homonym key, but Kew citing the
  // author otherwise ("St.Hil." and "A.St.-Hil."), and nothing changes.
  if (by.length !== 1) { ask.r = first; ask.checked = homonymChecked(k.data.label); return null; }
  const usage = by[0];
  const target = /synonym/i.test(usage.taxonomicStatus ?? '') && usage.acceptedKey ? usage.acceptedKey : usage.key;
  if (target === sp.key) { ask.r = first; ask.checked = homonymChecked(k.data.label); return null; }
  const label = `${usage.scientificName} (${usage.key})${target !== usage.key ? `, which GBIF files under ${usage.accepted ?? `key ${target}`} (${target})` : ''}`;
  // Kew's identifiers are now those of its author's name, for the links and the item's proof.
  ask.r = await gbif.kewIpni(f, sp.scientific, kewAuthor, sp.family);
  if (target !== usage.key && sp.reference?.isSpecies(target)) return { authorship: kewAuthor, note: `${base}; GBIF files ${usage.scientificName} under ${usage.accepted ?? `key ${target}`}, another species of this reference, so nothing is read from it` };
  return { authorship: kewAuthor, note: `${base}; its synonyms and common names are read from GBIF's ${label} too`, borrow: { usage: usage.key, target, label } };
}

/**
 * The synonyms and common names of GBIF's usage by Kew's author and of the taxon it is filed under (`kewName`): the
 * taxon's own name joins the synonyms (Rubus nutkanus for Rubus parviflorus), and a row of the species' own words does not.
 */
export async function borrowNames(f: JsonFetcher, b: { usage: number; target: number }, scientific: string): Promise<FetchResult<{ synonyms: string[]; rows: gbif.SynonymRow[]; vernacular: gbif.VernacularRow[] }>> {
  const keys = [...new Set([b.target, b.usage])];
  const rows: gbif.SynonymRow[] = [];
  const names: string[] = [];
  const vernacular: gbif.VernacularRow[] = [];
  for (const k of keys) {
    const v = await gbif.vernacular(f, k);
    if (v.status !== 'ok' && v.status !== 'none') return v;
    if (v.status === 'ok') vernacular.push(...v.data.filter((x) => !vernacular.some((y) => y.name === x.name && y.lang === x.lang)));
  }
  if (b.target !== b.usage) {
    const t = await gbif.species(f, b.target);
    if (t.status !== 'ok' && t.status !== 'none') return t;
    if (t.status === 'ok' && t.data.canonicalName) { rows.push({ key: b.target, name: t.data.canonicalName, rank: t.data.rank, ...(t.data.authorship ? { authorship: t.data.authorship } : {}), status: 'ACCEPTED' }); names.push(t.data.scientificName ?? t.data.canonicalName); }
  }
  const sy = await gbif.synonyms(f, b.target);
  if (sy.status !== 'ok' && sy.status !== 'none') return sy;
  if (sy.status === 'ok') {
    const own = (n: string) => n.toLowerCase() === scientific.toLowerCase();
    for (const r of sy.rows ?? []) if (!own(r.name) && !rows.some((x) => x.key === r.key)) rows.push(r);
    for (const n of sy.data) if (!own(canonicalOf(n) ?? n) && !names.includes(n)) names.push(n);
  }
  return { status: 'ok', data: { synonyms: names, rows, vernacular } };
}

/**
 * Wikidata's answer as the build records it (round eighty-two, F; review 1's 7): a "none" always says why, the older names
 * not asked where GBIF's list was not read, else that no route found an item (`NO_ITEM`, the words `--fill wikidata` writes).
 */
export function wikidataSaid<X extends { status: string; detail?: string }>(x: X, olderNotAsked?: string): X | { status: 'none'; detail: string } {
  return x.status === 'none' && !x.detail ? { status: 'none', detail: olderNotAsked ?? wm.NO_ITEM } : x;
}

/** One other key's part in a page's records (`occurrences.keys`, round seventy-three). */
export type ExtraKeyRead = NonNullable<Dossier['occurrences']['keys']>[number];

/**
 * Whether a record (or a photograph's record) under another key is read: not one GBIF identifies as a name the key's
 * exceptions leave out, and, where it has exceptions, only one whose name is known (round seventy-three).
 */
const read = (x: ExtraKey, taxonKey?: number) => !x.except?.length || (taxonKey != null && !x.except.includes(taxonKey));

/** The record's words for one other key the page's records come from. */
export const extraKeyWords = (k: ExtraKeyRead) => `${k.n} record${k.n === 1 ? '' : 's'} of GBIF's key ${k.key}, ${k.name} (${k.kew}): ${k.from === 'download' ? 'the GBIF download' : 'GBIF occurrence search API'}`;

/**
 * The records of the page's other keys (round seventy-three), joined to its own key's, one record once (a key GBIF files
 * under another the page reads gives some records twice). Any key that did not answer makes the whole answer that
 * key's refusal, failure or skip: the sample is not the one asked for.
 */
export async function extraOccurrences(f: JsonFetcher, own: FetchResult<gbif.GbifOccurrence[]>, list: readonly ExtraKey[]): Promise<{ occ: FetchResult<gbif.GbifOccurrence[]>; keys: ExtraKeyRead[] }> {
  if (!list.length || (own.status !== 'ok' && own.status !== 'none')) return { occ: own, keys: [] };
  const rows = own.status === 'ok' ? [...own.data] : [];
  const seen = new Set(rows.map((r) => r.key));
  const keys: ExtraKeyRead[] = [];
  for (const x of list) {
    const r = await gbif.occurrences(f, x.key);
    if (r.status !== 'ok' && r.status !== 'none') return { occ: { status: r.status, detail: `GBIF's key ${x.key} (${x.label}), whose records this page reads too: ${r.detail}` }, keys: [] };
    const got = r.status === 'ok' ? r.data.filter((g) => !seen.has(g.key) && read(x, g.taxonKey)) : [];
    for (const g of got) { seen.add(g.key); rows.push(g); }
    keys.push({ key: x.key, name: x.label, kew: extraWhy(x), n: got.length, from: r.status === 'ok' && r.data.some((g) => g.downloadDoi) ? 'download' : 'api', ...(x.merged ? { slug: x.merged } : {}) });
  }
  return { occ: rows.length ? { status: 'ok', data: rows } : { status: 'none' }, keys };
}

/** The photographs of the page's other keys after its own key's (round seventy-three); a key not answering is said, as the records are. */
export async function extraMedia(f: JsonFetcher, own: FetchResult<OccMedia[]>, list: readonly ExtraKey[]): Promise<FetchResult<OccMedia[]>> {
  if (!list.length || (own.status !== 'ok' && own.status !== 'none')) return own;
  const rows = own.status === 'ok' ? [...own.data] : [];
  const from: string[] = [];
  for (const x of list) {
    const r = await gbif.media(f, x.key);
    if (r.status !== 'ok' && r.status !== 'none') return { status: r.status, detail: `GBIF's key ${x.key} (${x.label}), whose photographs this page reads too: ${r.detail}` };
    if (r.status === 'ok') { const ids = new Set(rows.map((m) => m.url)); const add = r.data.filter((m) => !ids.has(m.url) && read(x, m.taxonKey)); rows.push(...add); if (add.length) from.push(`${add.length} from GBIF's key ${x.key}`); }
  }
  return rows.length ? { status: 'ok', data: rows, ...(from.length ? { detail: `read from the page's key and its other keys: ${from.join(', ')}` } : {}) } : { status: 'none' };
}

/**
 * The names of a page merged here (round seventy-three; `ExtraKey.merged`): its own name joins the page's older names (Kew
 * holds it as this plant), and its synonyms and common names too (`borrowNames`), so its name and the names it answered
 * to still find the plant, and its old address redirects as an older name's does. Another key's name is not added: Kew's
 * names for the plant are `name.kew` already.
 */
export async function extraNames(f: JsonFetcher, list: readonly ExtraKey[], scientific: string, syn: Awaited<ReturnType<typeof gbif.synonyms>>, vern: Awaited<ReturnType<typeof gbif.vernacular>>, upstream: Record<string, Upstream>): Promise<[Awaited<ReturnType<typeof gbif.synonyms>>, Awaited<ReturnType<typeof gbif.vernacular>>]> {
  if (syn.status !== 'ok') return [syn, vern];
  const canon = (n: string) => (canonicalOf(n) ?? n).toLowerCase();
  const names = [...syn.data];
  const added: string[] = [];
  let vrows = vern.status === 'ok' ? [...vern.data] : null;
  for (const x of list) {
    if (!x.merged) continue;
    if (canon(x.label) !== scientific.toLowerCase() && !names.some((n) => canon(n) === canon(x.label))) { names.push(x.label); added.push(x.label); }
    const b = await borrowNames(f, { usage: x.key, target: x.key }, scientific);
    if (b.status !== 'ok') { upstream['gbif.synonyms'] = { ...upstream['gbif.synonyms'], detail: [upstream['gbif.synonyms']?.detail, `the names of GBIF's key ${x.key} (${x.label}), merged here, not read: ${b.status}`].filter(Boolean).join('; ') }; continue; }
    for (const n of b.data.synonyms) if (canon(n) !== scientific.toLowerCase() && !names.some((m) => canon(m) === canon(n))) { names.push(n); added.push(n); }
    if (vrows) { const before = vrows.length; for (const v of b.data.vernacular) if (!vrows.some((y) => y.name === v.name && y.lang === v.lang)) vrows.push(v); if (vrows.length > before) upstream['gbif.vernacular'] = { ...upstream['gbif.vernacular'], detail: [upstream['gbif.vernacular']?.detail, `${vrows.length - before} read from GBIF's key ${x.key} (${x.label}), merged here`].filter(Boolean).join('; ') }; }
  }
  if (added.length) upstream['gbif.synonyms'] = { ...upstream['gbif.synonyms'], detail: [upstream['gbif.synonyms']?.detail, `${added.length} read from GBIF's ${list.filter((x) => x.merged).map((x) => `key ${x.key} (${x.label})`).join(', ')}, a page merged here`].filter(Boolean).join('; ') };
  return [{ ...syn, data: names }, vrows ? { ...vern, data: vrows } as typeof vern : vern];
}
