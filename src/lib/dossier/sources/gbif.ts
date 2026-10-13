import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import { licenceTag, isOpen, type LicenceTag } from '$core/licence';
import { sameNameAuthor } from '../authors';

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
  /** The name this one was first published under, when it has been moved (Bisnaga glaucescens: Echinocactus glaucescens). */
  basionymKey?: number;
}

export const species = (f: JsonFetcher, key: number) => f<GbifSpecies>(`${GBIF}/species/${key}`);

/**
 * One of GBIF's synonyms as the builder keeps it beside the names: its own record, the name it was first published under,
 * its author (Kew's range under an older name is taken only when the authors agree) and GBIF's status for it (a pro
 * parte synonym is skipped there: round sixty-nine; triage-68 M2).
 */
export type SynonymRow = { key: number; name: string; rank?: string; basionymKey?: number; authorship?: string; status?: string };
/** GBIF's synonyms of a species: the names as written, the rows, and `truncated` (the rows read) when the list ran past the pages asked. */
export type Synonyms = FetchResult<string[]> & { rows?: SynonymRow[]; truncated?: number };
/** How many synonyms are asked for at a time, and how many pages at most: past them, the list is recorded truncated. */
export const SYNONYM_PAGE = 100;
export const SYNONYM_PAGES = 10;

type SynonymAnswer = { key?: number; scientificName: string; canonicalName?: string; rank?: string; basionymKey?: number; authorship?: string; taxonomicStatus?: string };

/**
 * GBIF's synonyms, page by page until it says `endOfRecords` (round sixty-nine; triage-68 M4, S-A3, IND-2). One page of
 * fifty was read as the whole list: Portulaca oleracea has 65, and Portulaca retusa and P. terraereginae, past the
 * fiftieth, were found by no search; the "exactly one" and "same type" rules were judged on part of the list. Past
 * `SYNONYM_PAGES` pages the rows read are kept and the answer carries `truncated`, which the build records and which
 * counts as no answer for the older-name fallbacks; a page refused after the first is a refusal, never a shorter list
 * taken as the whole. The builder and the bulk fetcher both read the list here, so the two cannot disagree.
 */
export async function synonyms(f: JsonFetcher, key: number): Promise<Synonyms> {
  const raw: SynonymAnswer[] = [];
  let ended = false;
  for (let p = 0; p < SYNONYM_PAGES && !ended; p++) {
    const r = await f<{ results: SynonymAnswer[]; endOfRecords?: boolean }>(`${GBIF}/species/${key}/synonyms?limit=${SYNONYM_PAGE}&offset=${raw.length}`);
    if (r.status !== 'ok') {
      if (p > 0 && r.status === 'none') { ended = true; break; } // nothing past the end
      return r;
    }
    const got = Array.isArray(r.data.results) ? r.data.results : [];
    raw.push(...got);
    // An answer that does not say it ended, but has no rows, has ended: nothing past it can be asked for.
    ended = r.data.endOfRecords !== false || !got.length;
  }
  const rows: SynonymRow[] = raw.flatMap((s) => (typeof s.key === 'number' && s.canonicalName ? [{ key: s.key, name: s.canonicalName, rank: s.rank, basionymKey: s.basionymKey, ...(s.authorship ? { authorship: s.authorship } : {}), ...(s.taxonomicStatus ? { status: s.taxonomicStatus } : {}) }] : []));
  const data = raw.map((s) => s.scientificName).filter((n): n is string => typeof n === 'string');
  return ended ? { status: 'ok', data, rows } : { status: 'ok', data, rows, truncated: raw.length };
}

/**
 * The older names that share the species' type (round sixty-eight, third part): its basionym, and every synonym published
 * on that basionym (Bisnaga glaucescens: Echinocactus glaucescens, Ferocactus glaucescens, Parrycactus glaucescens).
 * They name the same plant moved between genera, so another source's record under one of them is this species'. A
 * synonym on another type (Neoporteria mammillarioides, lumped into it) is a different plant to some sources, and is
 * never used to find this one. A species with no basionym recorded has only the synonyms published on itself.
 */
export function sameTypeNames(sp: { key: number; basionymKey?: number }, rows: readonly SynonymRow[] = []): SynonymRow[] {
  const type = sp.basionymKey ?? sp.key;
  return rows.filter((r) => (r.rank ?? 'SPECIES').toUpperCase() === 'SPECIES' && (r.key === type || r.basionymKey === type));
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

/** What the distribution step read: the rows, whether they are Kew's, and what the record says of how Kew's entry was found. */
export interface DistributionAnswer {
  rows: GbifDistribution[];
  wcvp: boolean;
  kew?: KewDescription;
  /** WCVP lists the name more than once and authorship did not decide. */
  ambiguous?: string;
  /** Kew's entry under an older name, with its authors ("Erythrina afra Thunb."), and the older name it was reached by ("Erythrina fissa C.Presl"). */
  entry?: string;
  via?: string;
  /** Kew holds the name ("Lantana × strigocamara R.W.Sanders") and states no range for it. */
  held?: string;
  /** Kew holds the species' words only under another author, which is another name (round seventy; triage-69 B4). */
  otherAuthor?: string;
}

/**
 * WCVP rows as republished through GBIF (the checklist Kew's POWO runs on), or served from Kew's own files by the bulk
 * path. The bulk path's two answers that are not rows are said as they are (round sixty-nine; triage-68 M2, M8): Kew
 * holding the name with no range is Kew's answer, with no rows; older names that lead to two Kew entries are `ambiguous`.
 */
export async function distributions(f: JsonFetcher, key: number): Promise<SourceResult<DistributionAnswer>> {
  const r = await f<{ results: GbifDistribution[]; kew?: KewDescription; ambiguous?: string; entry?: string; via?: string; held?: string; olderAmbiguous?: string; otherAuthor?: string }>(`${GBIF}/species/${key}/distributions?limit=200`);
  if (r.status !== 'ok') return r;
  // Kew's rows of the species' words by another author, which are another name (round seventy; triage-69 B4): said in the record.
  const other = r.data.otherAuthor ? { otherAuthor: r.data.otherAuthor } : {};
  if (r.data.ambiguous) return { status: 'ok', data: { rows: [], wcvp: false, ambiguous: r.data.ambiguous } };
  if (r.data.olderAmbiguous) return { status: 'ambiguous', detail: `${r.data.otherAuthor ? `${r.data.otherAuthor}; ` : 'Kew holds no entry under this name, and '}${r.data.olderAmbiguous}: not taken` };
  if (r.data.held) return { status: 'ok', data: { rows: [], wcvp: true, kew: r.data.kew, held: r.data.held } };
  const wcvp = (r.data.results ?? []).filter(isWcvpRow);
  if (wcvp.length) return { status: 'ok', data: { rows: wcvp, wcvp: true, kew: r.data.kew, ...(r.data.via ? { entry: r.data.entry, via: r.data.via } : {}), ...other } };
  // No WCVP entry: fall back to whatever national checklists GBIF holds, one row per country and status.
  const seen = new Map<string, GbifDistribution>();
  for (const d of r.data.results ?? []) {
    const k = `${d.country ?? d.locality ?? '?'}|${CULTIVATED_RE.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`) ? 'i' : 'n'}`;
    if (!seen.has(k)) seen.set(k, d);
  }
  return seen.size ? { status: 'ok', data: { rows: [...seen.values()], wcvp: false, ...other } } : r.data.otherAuthor ? { status: 'none', detail: r.data.otherAuthor } : { status: 'none' };
}

/** A distribution row from Kew's WCVP, as GBIF republishes it or the bulk path serves it. */
export const isWcvpRow = (d: GbifDistribution) => /wcvp|world checklist|plants of the world|kew/i.test(d.source ?? '');

/** GBIF's copy of Kew's World Checklist of Vascular Plants (the dataset the API path's ranges come from). */
export const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';

/**
 * Kew's identifiers for the species' own name (round seventy; triage-69 B2, S-B2, IND-3): the rows of GBIF's copy of WCVP
 * under exactly its words (`/species?datasetKey=…&name=`, one request), misapplied names aside, whose publishing author
 * is the backbone's (`sameNameAuthor`), or, with none, the one row Kew accepts, as the bulk path reads Kew's files
 * (`WcvpIndex.ownRows`); each with the IPNI identifier of its POWO address. `label` cites the name as Kew does ("Agave
 * variegata Jacobi"); `ids` is empty when Kew holds the words only under other authors and accepts none of them, or not
 * at all, and then nothing can be checked against Kew. A refusal is the answer.
 */
export async function kewIpni(f: JsonFetcher, name: string, authorship?: string): Promise<FetchResult<{ ids: string[]; label?: string; others?: Array<{ id: string; label: string }> }>> {
  const r = await f<{ results?: Array<{ key: number; scientificName: string; canonicalName?: string; authorship?: string; taxonomicStatus?: string; references?: string }> }>(`${GBIF}/species?datasetKey=${WCVP_DATASET}&name=${encodeURIComponent(name)}&limit=50`);
  if (r.status === 'none') return { status: 'ok', data: { ids: [] } };
  if (r.status !== 'ok') return r;
  const words = (r.data.results ?? []).filter((x) => (x.canonicalName ?? '').toLowerCase() === name.toLowerCase() && !/misapplied/i.test(x.taxonomicStatus ?? ''));
  const own = words.filter((x) => sameNameAuthor(authorship, x.authorship));
  // With no row by the backbone's author, the one entry Kew accepts under the words, as the bulk path reads Kew's files.
  const accepted = words.filter((x) => /^accepted$/i.test(x.taxonomicStatus ?? ''));
  const rows = own.length ? own : authorship?.trim() && accepted.length === 1 ? accepted : [];
  const ipni = (x: { references?: string }) => /urn:lsid:ipni\.org:names:([\w-]+)$/.exec(x.references ?? '')?.[1];
  const ids = [...new Set(rows.flatMap((x) => ipni(x) ?? []))];
  // The words' other rows, another author's names (round seventy, second pass; triage-69 B6, R47-5): an item that carries
  // one of their identifiers is that homonym's item (Albuca longifolia's 527398-1 is Baker's).
  const others = words.filter((x) => !rows.includes(x)).flatMap((x) => { const id = ipni(x); return id && !ids.includes(id) ? [{ id, label: x.scientificName }] : []; });
  return { status: 'ok', data: { ids, ...(rows.length ? { label: rows[0].scientificName } : {}), ...(others.length ? { others } : {}) } };
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
  /** The record is a preserved specimen (its basisOfRecord): a herbarium sheet or a museum's fruit, which ranks below Commons as a lead (round seventy, a need of C; REVIEW-TRIAGE-69 C7, R47-10). */
  specimen?: boolean;
}

/** Still images attached to occurrences, already filtered to open licences. */
export async function media(f: JsonFetcher, key: number): Promise<FetchResult<OccMedia[]>> {
  // Not preserved specimens: a herbarium sheet's scan is not a photograph of the plant growing (round thirty, R2-12); the bulk path already leaves them out.
  // Only records under an open licence (GBIF's CC0 and CC BY; it files CC BY-SA under CC BY): most observation photographs
  // are CC BY-NC, and the first 100 records with an image, read whatever their licence, held no open photograph for 104
  // of the species round sixty-seven's rebuild left without one, Sprekelia formosissima among them (round sixty-eight).
  // Each photograph's own licence is still read below: a record's licence is not its photograph's, and a photograph that
  // states none is not published under its record's (round sixty-nine; triage-68 M1, S-B6: an ALA sighting's photograph
  // went out as "Michael Sim, CC BY, via GBIF" on the record's licence). The download path reads the same way (bulk.ts).
  const r = await f<OccPage>(`${GBIF}/occurrence/search?taxonKey=${key}&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=OBSERVATION&basisOfRecord=MACHINE_OBSERVATION&limit=100`);
  if (r.status !== 'ok') return r;
  const out: OccMedia[] = [];
  for (const o of r.data.results) {
    // iNaturalist images reach GBIF through a CC-BY-NC dataset; the per-photo licence is what counts, and it is on the media object.
    for (const m of o.media ?? []) {
      if (!m.identifier || (m.type && !/still/i.test(m.type))) continue;
      const tag = licenceTag(m.license);
      if (!isOpen(tag)) continue;
      out.push({ id: `${o.key}:${out.length}`, url: m.identifier, licence: tag!, creator: m.creator, rightsHolder: m.rightsHolder, page: m.references ?? `https://www.gbif.org/occurrence/${o.key}`, datasetKey: o.datasetKey, ...(o.basisOfRecord === 'PRESERVED_SPECIMEN' ? { specimen: true } : {}) });
    }
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

/** One occurrence record with its media, as GBIF serves it: `--fill gbif-licence` reads each stored photograph's own licence from it. */
export const occurrence = (f: JsonFetcher, key: number) => f<GbifOccurrence>(`${GBIF}/occurrence/${key}`);

export async function suggest(f: JsonFetcher, q: string): Promise<FetchResult<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>> {
  const r = await f<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>(
    `${GBIF}/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&rank=SPECIES&rank=SUBSPECIES&rank=VARIETY&rank=FORM&limit=12&q=${encodeURIComponent(q)}`
  );
  return r;
}
