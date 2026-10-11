import type { JsonFetcher, FetchResult } from '../fetch';
import { licenceTag, isOpen, type LicenceTag } from '$core/licence';

export const GBIF = 'https://api.gbif.org/v1';

export interface GbifMatch {
  usageKey: number;
  acceptedUsageKey?: number;
  scientificName: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
  matchType?: string;
  confidence?: number;
  family?: string;
  genus?: string;
  order?: string;
  kingdom?: string;
  synonym?: boolean;
}

export async function matchName(f: JsonFetcher, name: string): Promise<FetchResult<GbifMatch>> {
  const r = await f<GbifMatch & { matchType?: string }>(`${GBIF}/species/match?strict=false&name=${encodeURIComponent(name)}`);
  if (r.status !== 'ok') return r;
  if (!r.data.usageKey || r.data.matchType === 'NONE') return { status: 'none' };
  return r;
}

export interface GbifSpecies {
  key: number;
  nubKey?: number;
  scientificName: string;
  canonicalName?: string;
  authorship?: string;
  rank?: string;
  taxonomicStatus?: string;
  acceptedKey?: number;
  accepted?: string;
  /** For an infraspecific taxon: the species it belongs to. */
  speciesKey?: number;
  species?: string;
  family?: string;
  genus?: string;
  order?: string;
  class?: string;
  phylum?: string;
  kingdom?: string;
  familyKey?: number;
  genusKey?: number;
  orderKey?: number;
  classKey?: number;
  phylumKey?: number;
  kingdomKey?: number;
}

export const species = (f: JsonFetcher, key: number) => f<GbifSpecies>(`${GBIF}/species/${key}`);

export async function synonyms(f: JsonFetcher, key: number): Promise<FetchResult<string[]>> {
  const r = await f<{ results: Array<{ scientificName: string }> }>(`${GBIF}/species/${key}/synonyms?limit=50`);
  if (r.status !== 'ok') return r;
  return { status: 'ok', data: r.data.results.map((s) => s.scientificName).filter((n): n is string => typeof n === 'string') };
}

/** One vernacular name as `vernacular` gives it: an exact spelling in a language, with its own sources. */
export type VernacularRow = { name: string; lang?: string; source?: string; preferred?: boolean; sources?: number; alsoFrom?: string[] };
/** How many rows of GBIF's vernacular names are asked for at a time, and how many pages at most: past them, the list is recorded truncated. */
export const VERNACULAR_PAGE = 1000;
export const VERNACULAR_PAGES = 4;

/**
 * GBIF's vernacular names: one row per exact spelling and language, in GBIF's order (round sixty-two; the corpus review,
 * 7 and 8). Each keeps its own sources: `source` (the first that gives it), `alsoFrom` (the other named sources that
 * give that exact spelling), `sources` (how many sources give it, a row with no source counting as its own, written
 * when more than one), and GBIF's `preferred` flag (true if any of its rows is). Spellings that differ only in case are
 * kept apart, so `englishNames` can show the one more sources give: one row per name whatever its case kept the first
 * row's spelling, and "japanese privet" (one source) was shown over "Japanese Privet" (two).
 *
 * The list is asked for page by page until GBIF says `endOfRecords`: one page of fifty rows across every language
 * stopped short of the English names of the most widely named species. Past `VERNACULAR_PAGES` pages the rows read
 * are kept and the answer carries `truncated` (how many were read), which the build records; a page refused after
 * the first is a refusal, never a shorter list taken as the whole.
 */
export async function vernacular(f: JsonFetcher, key: number): Promise<FetchResult<VernacularRow[]> & { truncated?: number }> {
  const rows: Array<{ vernacularName: string; language?: string; source?: string; preferred?: boolean }> = [];
  let ended = false;
  for (let p = 0; p < VERNACULAR_PAGES && !ended; p++) {
    // From the rows read so far: a server that gives fewer than asked per page loses none between pages.
    const r = await f<{ results: Array<{ vernacularName: string; language?: string; source?: string; preferred?: boolean }>; endOfRecords?: boolean }>(`${GBIF}/species/${key}/vernacularNames?limit=${VERNACULAR_PAGE}&offset=${rows.length}`);
    if (r.status !== 'ok') {
      if (p > 0 && r.status === 'none') { ended = true; break; } // nothing past the end
      return r;
    }
    const got = Array.isArray(r.data.results) ? r.data.results : [];
    rows.push(...got);
    // An answer that does not say it ended, but has no rows, has ended: nothing past it can be asked for.
    ended = r.data.endOfRecords !== false || !got.length;
  }
  const bySpelling = new Map<string, { row: VernacularRow; named: Set<string>; anonymous: number }>();
  rows.forEach((x) => {
    if (typeof x.vernacularName !== 'string') return;
    const k = x.vernacularName + '|' + (x.language ?? '');
    let e = bySpelling.get(k);
    if (!e) {
      e = { row: { name: x.vernacularName, lang: x.language ?? undefined }, named: new Set(), anonymous: 0 };
      bySpelling.set(k, e);
    }
    const src = typeof x.source === 'string' ? x.source.trim() : '';
    if (src) e.named.add(src);
    else e.anonymous++;
    if (x.preferred === true) e.row.preferred = true;
  });
  const out = [...bySpelling.values()].map(({ row, named, anonymous }) => {
    const [first, ...also] = [...named];
    const n = named.size + anonymous;
    return { ...row, ...(first ? { source: first } : {}), ...(n > 1 ? { sources: n } : {}), ...(also.length ? { alsoFrom: also } : {}) };
  });
  return ended ? { status: 'ok', data: out } : { status: 'ok', data: out, truncated: rows.length };
}

export interface GbifDistribution {
  locationId?: string;
  locality?: string;
  country?: string;
  establishmentMeans?: string;
  status?: string;
  source?: string;
}

/** Kew's own one-line descriptions of a species, carried on the distribution answer (by the API or the bulk path). */
export interface KewDescription {
  lifeform?: string;
  climate?: string;
}

/**
 * The one test for "not a wild native population": a distribution row's establishment means or status, or an occurrence
 * record's establishmentMeans plus degreeOfEstablishment, that says the plant was introduced, naturalised, cultivated,
 * invasive or managed. Used for the range (here and in build.ts) and for the records (build.ts).
 */
export const CULTIVATED_RE = /introduced|naturali[sz]ed|cultivated|invasive|managed/i;

/** WCVP rows as republished through GBIF (the checklist Kew's POWO runs on), or served from Kew's own files by the bulk path. */
export async function distributions(f: JsonFetcher, key: number): Promise<FetchResult<{ rows: GbifDistribution[]; wcvp: boolean; kew?: KewDescription; ambiguous?: string; via?: string }>> {
  const r = await f<{ results: GbifDistribution[]; kew?: KewDescription; ambiguous?: string; via?: string }>(`${GBIF}/species/${key}/distributions?limit=200`);
  if (r.status !== 'ok') return r;
  if (r.data.ambiguous) return { status: 'ok', data: { rows: [], wcvp: false, ambiguous: r.data.ambiguous } };
  const wcvp = r.data.results.filter((d) => /wcvp|world checklist|plants of the world|kew/i.test(d.source ?? ''));
  if (wcvp.length) return { status: 'ok', data: { rows: wcvp, wcvp: true, kew: r.data.kew, via: r.data.via } };
  // No WCVP entry: fall back to whatever national checklists GBIF holds, one row per country and status.
  const seen = new Map<string, GbifDistribution>();
  for (const d of r.data.results) {
    const k = `${d.country ?? d.locality ?? '?'}|${CULTIVATED_RE.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`) ? 'i' : 'n'}`;
    if (!seen.has(k)) seen.set(k, d);
  }
  return seen.size ? { status: 'ok', data: { rows: [...seen.values()], wcvp: false } } : { status: 'none' };
}

export interface GbifOccurrence {
  key: number;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  countryCode?: string;
  basisOfRecord?: string;
  license?: string;
  datasetKey?: string;
  datasetName?: string;
  establishmentMeans?: string;
  degreeOfEstablishment?: string;
  /** Metres; a record vaguer than the climate grid (5 km) is kept on the map but not read for climate. */
  coordinateUncertaintyInMeters?: number;
  /** GBIF's stated precision of the coordinates, in degrees (0.001 is three decimals), when the publisher gave one. */
  coordinatePrecision?: number;
  /** The decimal places the coordinates were written with, the fewer of the two, read from the download's text (a JSON number loses a trailing zero: round thirty-five, R2-2). */
  coordDecimals?: number;
  /** Set on records served from a GBIF occurrence download: its DOI, which the dossier cites. */
  downloadDoi?: string;
  /** DWCA downloads: 'StillImage' when the record carries images (their rows are in multimedia.txt). */
  mediaType?: string;
  media?: Array<{ type?: string; identifier?: string; license?: string; rightsHolder?: string; creator?: string; references?: string }>;
}

export interface OccPage {
  results: GbifOccurrence[];
  endOfRecords: boolean;
  count: number;
}

/**
 * Up to `pages` × 300 georeferenced records with licence and dataset on each.
 * A page that is refused after an earlier one succeeded is a refusal: the
 * sample is not the one asked for, and a climate read from it would say
 * nothing about what was not fetched.
 */
export async function occurrences(f: JsonFetcher, key: number, pages = 3): Promise<FetchResult<GbifOccurrence[]>> {
  const out: GbifOccurrence[] = [];
  for (let p = 0; p < pages; p++) {
    const url =
      `${GBIF}/occurrence/search?taxonKey=${key}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT` +
      `&limit=300&offset=${p * 300}`;
    const r = await f<OccPage>(url);
    if (r.status === 'refused' || r.status === 'error' || r.status === 'skipped') return { status: r.status, detail: `${r.detail}${out.length ? ` (after ${out.length} records: partial, not used)` : ''}` };
    if (r.status !== 'ok') break;
    out.push(...r.data.results);
    if (r.data.endOfRecords) break;
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

export interface OccMedia {
  id: string;
  url: string;
  licence: LicenceTag;
  creator?: string;
  rightsHolder?: string;
  page?: string;
  datasetKey?: string;
}

/** Still images attached to occurrences, already filtered to open licences. */
export async function media(f: JsonFetcher, key: number): Promise<FetchResult<OccMedia[]>> {
  // Not preserved specimens: a herbarium sheet's scan is not a photograph of the plant growing (round thirty, R2-12); the bulk path already leaves them out.
  // Only records under an open licence (GBIF's CC0 and CC BY; it files CC BY-SA under CC BY): most observation photographs
  // are CC BY-NC, and the first 100 records with an image, read whatever their licence, held no open photograph for 104
  // of the species round sixty-seven's rebuild left without one, Sprekelia formosissima among them (round sixty-eight).
  // Each photograph's own licence is still read below: a record's licence is not its photograph's.
  const r = await f<OccPage>(`${GBIF}/occurrence/search?taxonKey=${key}&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=OBSERVATION&basisOfRecord=MACHINE_OBSERVATION&limit=100`);
  if (r.status !== 'ok') return r;
  const out: OccMedia[] = [];
  for (const o of r.data.results) {
    // iNaturalist images reach GBIF through a CC-BY-NC dataset; the per-photo licence is what counts, and it is on the media object.
    for (const m of o.media ?? []) {
      if (!m.identifier || (m.type && !/still/i.test(m.type))) continue;
      const tag = licenceTag(m.license ?? o.license);
      if (!isOpen(tag)) continue;
      out.push({ id: `${o.key}:${out.length}`, url: m.identifier, licence: tag!, creator: m.creator, rightsHolder: m.rightsHolder, page: m.references ?? `https://www.gbif.org/occurrence/${o.key}`, datasetKey: o.datasetKey });
    }
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

export async function suggest(f: JsonFetcher, q: string): Promise<FetchResult<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>> {
  const r = await f<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>(
    `${GBIF}/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&rank=SPECIES&rank=SUBSPECIES&rank=VARIETY&rank=FORM&limit=12&q=${encodeURIComponent(q)}`
  );
  return r;
}
