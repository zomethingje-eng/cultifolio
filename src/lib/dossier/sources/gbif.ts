import type { RangeVia } from '../range-via';
import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import { licenceTag, isOpen, type LicenceTag } from '$core/licence';
import { ownByAuthor, plainlyAnother, inFamily } from '../authors';

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
/**
 * The species' own row Kew files under an entry of another name, whose range the page shows (round seventy-one;
 * self-review 70 S-B4): "Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.". About 480
 * pages showed such a range with no word of it, five of them another reference species' (Ceropegia melanops, C. nigra's).
 */
export type SynonymOf = { row: string; status: string; entry: string; entryName: string };
/** The words a page's range source says for a `SynonymOf`: "Kew holds X as a synonym of Y; the range is Y's". */
export const synonymOfWords = (s: SynonymOf) => `Kew holds ${s.row} ${/^synonym$/i.test(s.status) ? 'as a synonym of' : `(${s.status.toLowerCase()}) under`} ${s.entry}; the range is ${s.entryName}'s`;

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
  /** Kew files the species' own row under an entry of another name, whose range this is (round seventy-one; S-B4). */
  synonymOf?: SynonymOf;
  /** Where the range comes from (round seventy-two, B3), and the day of Kew's files it was read from (B1). */
  rangeVia?: RangeVia;
  kewFile?: string;
}

/**
 * WCVP rows as republished through GBIF (the checklist Kew's POWO runs on), or served from Kew's own files by the bulk
 * path. The bulk path's two answers that are not rows are said as they are (round sixty-nine; triage-68 M2, M8): Kew
 * holding the name with no range is Kew's answer, with no rows; older names that lead to two Kew entries are `ambiguous`.
 */
export async function distributions(f: JsonFetcher, key: number): Promise<SourceResult<DistributionAnswer>> {
  const r = await f<{ results: GbifDistribution[]; kew?: KewDescription; ambiguous?: string; entry?: string; via?: string; held?: string; olderAmbiguous?: string; otherAuthor?: string; synonymOf?: DistributionAnswer['synonymOf']; rangeVia?: RangeVia; kewFile?: string }>(`${GBIF}/species/${key}/distributions?limit=200`);
  if (r.status !== 'ok') return r;
  // Kew's rows of the species' words by another author, which are another name (round seventy; triage-69 B4): said in the record.
  const other = r.data.otherAuthor ? { otherAuthor: r.data.otherAuthor } : {};
  if (r.data.ambiguous) return { status: 'ok', data: { rows: [], wcvp: false, ambiguous: r.data.ambiguous } };
  if (r.data.olderAmbiguous) return { status: 'ambiguous', detail: `${r.data.otherAuthor ? `${r.data.otherAuthor}; ` : 'Kew holds no entry under this name, and '}${r.data.olderAmbiguous}: not taken` };
  const syn = { ...(r.data.synonymOf ? { synonymOf: r.data.synonymOf } : {}), ...(r.data.rangeVia ? { rangeVia: r.data.rangeVia } : {}), ...(r.data.kewFile ? { kewFile: r.data.kewFile } : {}) };
  if (r.data.held) return { status: 'ok', data: { rows: [], wcvp: true, kew: r.data.kew, held: r.data.held, ...syn } };
  const wcvp = (r.data.results ?? []).filter(isWcvpRow);
  if (wcvp.length) return { status: 'ok', data: { rows: wcvp, wcvp: true, kew: r.data.kew, ...(r.data.via ? { entry: r.data.entry, via: r.data.via } : {}), ...syn, ...other } };
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
export async function kewIpni(f: JsonFetcher, name: string, authorship?: string, family?: string): Promise<FetchResult<KewIds>> {
  const r = await f<{ results?: Array<{ key: number; scientificName: string; canonicalName?: string; authorship?: string; taxonomicStatus?: string; references?: string; acceptedKey?: number; accepted?: string; family?: string; taxonID?: string | number }> }>(`${GBIF}/species?datasetKey=${WCVP_DATASET}&name=${encodeURIComponent(name)}&limit=50`);
  if (r.status === 'none') return { status: 'ok', data: { ids: [] } };
  if (r.status !== 'ok') return r;
  // A hybrid's row is another name, though GBIF's canonical form drops the sign (Kew's "Rubus ×parviflorus Sudre" for
  // Rubus parviflorus Nutt.; round seventy, the owner's second run).
  const words = (r.data.results ?? []).filter((x) => (x.canonicalName ?? '').toLowerCase() === name.toLowerCase() && !/misapplied/i.test(x.taxonomicStatus ?? '') && !(/×/.test(x.scientificName) && !/×/.test(name)));
  // The backbone's author read as the bulk path reads it (`ownByAuthor`; round seventy, the owner's run).
  const own = ownByAuthor(words, authorship, (x) => x.authorship);
  // With no row by the backbone's author, the one entry Kew accepts under the words, as the bulk path reads Kew's files.
  const accepted = words.filter((x) => /^accepted$/i.test(x.taxonomicStatus ?? ''));
  // In the species' family (`inFamily`): Ixora coccinea "Comm. ex Lam." is Kew's synonym of Embothrium coccineum.
  const rows = inFamily(own.length ? own : authorship?.trim() && accepted.length === 1 ? accepted : [], words, family);
  const ipni = (x: { references?: string }) => /urn:lsid:ipni\.org:names:([\w-]+)$/.exec(x.references ?? '')?.[1];
  // Kew files the own row under an entry of these very words: that entry is this plant too, whoever published it
  // (round seventy, the owner's second run: Fragaria virginiana Duchesne is Kew's synonym of Fragaria virginiana subsp.
  // virginiana, Miller's species, and the item Q978247 carries Miller's 318974-2).
  const under = new Set(rows.flatMap((x) => (/synonym/i.test(x.taxonomicStatus ?? '') && x.accepted ? [x.accepted.split(/\s+/).slice(0, 2).join(' ').toLowerCase()] : [])));
  const plant = [...rows, ...(under.has(name.toLowerCase()) ? accepted.filter((x) => !rows.includes(x)) : [])];
  const ids = [...new Set(plant.flatMap((x) => ipni(x) ?? []))];
  // The words' other rows, another author's names (round seventy, second pass; triage-69 B6, R47-5): an item that carries
  // one of their identifiers is that homonym's item (Albuca longifolia's 527398-1 is Baker's).
  // Only a row plainly by another author counts (`plainlyAnother`): Kew's "Welw. ex Hiern" for GBIF's "Welw. ex Ficalho"
  // is one manuscript name, not a homonym (Hibiscus acetosella; round seventy, the owner's run).
  const others = words.filter((x) => !plant.includes(x) && plainlyAnother(authorship, x.authorship)).flatMap((x) => { const id = ipni(x); return id && !ids.includes(id) ? [{ id, label: x.scientificName }] : []; });
  // The entries Kew accepts where it holds the name as a synonym: their identifiers tell two items apart (round seventy,
  // the owner's run: Parrycactus flavovirens is Kew's synonym of Ferocactus flavovirens; `kewEntryIpni`).
  const acceptedKeys = [...new Set(rows.flatMap((x) => (/synonym/i.test(x.taxonomicStatus ?? '') && x.acceptedKey ? [x.acceptedKey] : [])))];
  const acceptedId = plant.filter((x) => /^accepted$/i.test(x.taxonomicStatus ?? '')).flatMap((x) => ipni(x) ?? [])[0];
  // Each number's own name and author, so a page that links a number can cite the name it links (round seventy-two, A:
  // Ixora coccinea linked Kew's 753844-1, "Ixora coccinea L.", and cited the backbone's "Comm. ex Lam.").
  const labels = Object.fromEntries(plant.flatMap((x) => { const id = ipni(x); return id ? [[id, x.scientificName] as const] : []; }));
  // And each number's row in Kew's own file (GBIF's copy keeps WCVP's plant_name_id as its taxonID), for `name.cited`.
  const plantIds = Object.fromEntries(plant.flatMap((x) => { const id = ipni(x); return id && x.taxonID ? [[id, String(x.taxonID)] as const] : []; }));
  return { status: 'ok', data: { ids, ...(rows.length ? { label: rows[0].scientificName } : {}), ...(ids.length ? { labels } : {}), ...(Object.keys(plantIds).length ? { plantIds } : {}), ...(others.length ? { others } : {}), ...(acceptedKeys.length ? { acceptedKeys } : {}), ...(acceptedId ? { acceptedId } : {}) } };
}

/** Kew's identifiers for a name and author, as `kewIpni` answers. */
export type KewIds = { ids: string[]; label?: string; labels?: Record<string, string>; plantIds?: Record<string, string>; others?: Array<{ id: string; label: string }>; acceptedKeys?: number[]; acceptedId?: string };

/**
 * The IPNI and POWO numbers a page links (round seventy-one; self-review 70 S-B5, triage-70): Kew's number for the name
 * and author, which a POWO address is too, never an item's number Kew holds for another author's name. Of Kew's numbers,
 * the item's when it carries one, else the entry Kew accepts, else the first. Where Kew holds no number for the name and
 * author, the item's stand unless Kew holds them for another author. 568 of the 594 dossiers whose two numbers disagreed
 * linked an IPNI duplicate; Colchicum neapolitanum, Lachenalia pusilla, Ceropegia spiralis, Talinum lineare and
 * Mammillaria schiedeana linked another author's invalid or illegitimate name, and Mammillaria magnifica's POWO Sencke's.
 */
export function kewLinks(item: { ipni?: string; powo?: string }, k: KewIds): { ipni?: string; powo?: string; changed: boolean } {
  const powoNum = item.powo?.replace(/^urn:lsid:ipni\.org:names:/, '');
  const pick = (k.ids.length ? [item.ipni, powoNum, k.acceptedId, k.ids[0]].find((n) => !!n && k.ids.includes(n)) : undefined);
  const other = new Set((k.others ?? []).map((o) => o.id));
  // A number ending "-4" is Kew's own, for a name IPNI does not hold: a POWO address, never an IPNI one (round
  // seventy-two, A: Echinocereus marksianus linked https://www.ipni.org/n/2782687-4 in place of its item's 87937-2).
  const kept = item.ipni && !other.has(item.ipni) ? item.ipni : undefined;
  const ipni = pick && !WCVP_ONLY.test(pick) ? pick : kept && !WCVP_ONLY.test(kept) ? kept : undefined;
  const powo = pick ? `urn:lsid:ipni.org:names:${pick}` : powoNum && !other.has(powoNum) ? item.powo : undefined;
  return { ipni, powo, changed: ipni !== item.ipni || powo !== item.powo };
}

/**
 * The record's words for a relinking (`kewLinks`): "IPNI and POWO linked by Kew's number for X (the item's: …)", and where
 * no number is left because Kew holds the words only under another author, that (round seventy-two, A: Ceropegia
 * macrocarpa (Sprenger) Bruyns, whose item gave Kew's number for J.N.Haage & E.Schmidt's unplaced homonym).
 */
export function kewLinksNote(k: KewIds, l: { ipni?: string; powo?: string }, was: string): string {
  if (!l.ipni && !l.powo && !k.ids.length && k.others?.length) return `Kew holds this name only under another author (${k.others.map((o) => o.label).join('; ')}); no POWO link (the item's: ${was})`;
  return `IPNI and POWO linked by Kew's number${k.label ? ` for ${k.label}` : ''}${l.ipni ? '' : ', none'} (the item's: ${was})`;
}

/** Kew's number for a name IPNI does not hold (WCVP's own, "-4"): it opens a POWO page but no IPNI record. */
export const WCVP_ONLY = /-4$/;

/** GBIF's backbone, whose usages of a name `usages` reads. */
export const BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c';
/** A usage of a name in GBIF's backbone: one name by one author, accepted, a synonym of another, or doubtful. */
export type Usage = { key: number; scientificName: string; authorship?: string; taxonomicStatus?: string; acceptedKey?: number; accepted?: string; rank?: string };
/** Every usage of a binomial in GBIF's backbone at species rank, by its words (one request); homonyms are several. */
export async function usages(f: JsonFetcher, name: string): Promise<FetchResult<Usage[]>> {
  const r = await f<{ results?: Array<Usage & { canonicalName?: string }> }>(`${GBIF}/species?datasetKey=${BACKBONE}&name=${encodeURIComponent(name)}&limit=50`);
  if (r.status === 'none') return { status: 'ok', data: [] };
  if (r.status !== 'ok') return r;
  return { status: 'ok', data: (r.data.results ?? []).filter((x) => (x.canonicalName ?? '').toLowerCase() === name.toLowerCase() && (x.rank ?? 'SPECIES').toUpperCase() === 'SPECIES').map(({ key, scientificName, authorship, taxonomicStatus, acceptedKey, accepted, rank }) => ({ key, scientificName, authorship, taxonomicStatus, acceptedKey, accepted, rank })) };
}

/** The IPNI identifiers of Kew's entries by their keys in GBIF's copy of WCVP, one request each; a refusal is the answer. */
export async function kewEntryIpni(f: JsonFetcher, keys: readonly number[]): Promise<FetchResult<Array<{ id: string; label: string }>>> {
  const out: Array<{ id: string; label: string }> = [];
  for (const k of keys) {
    const r = await f<{ scientificName?: string; references?: string }>(`${GBIF}/species/${k}`);
    if (r.status === 'none') continue;
    if (r.status !== 'ok') return r;
    const id = /urn:lsid:ipni\.org:names:([\w-]+)$/.exec(r.data.references ?? '')?.[1];
    if (id) out.push({ id, label: r.data.scientificName ?? '' });
  }
  return { status: 'ok', data: out };
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
  /** The day GBIF made that download (round seventy-two, B1). */
  downloadDay?: string;
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
  /** The record is not a human observation (its basisOfRecord): a herbarium sheet, a museum's fruit or a machine's scan, which ranks below Commons as a lead (round seventy, a need of C; REVIEW-TRIAGE-69 C7, R47-10; round seventy-one, C4: set whenever GBIF answers a record of another basis). */
  specimen?: boolean;
}

/** Still images attached to occurrences, already filtered to open licences. */
export async function media(f: JsonFetcher, key: number): Promise<FetchResult<OccMedia[]>> {
  // Not preserved specimens: a herbarium sheet's scan is not a photograph of the plant growing (round thirty, R2-12); the bulk path already leaves them out.
  // Human observations only, as the bulk path reads the download (round seventy-one; self-review 70 C4): MACHINE_OBSERVATION
  // brought Meise's herbarium scans (18 of 100 GBIF-led tiles), an NMNH line drawing (Adenia lobata's lead) and pollen
  // micrographs (Talinella grevei's only two), and OBSERVATION is no one's photograph of the plant either.
  // Only records under an open licence (GBIF's CC0 and CC BY; it files CC BY-SA under CC BY): most observation photographs
  // are CC BY-NC, and the first 100 records with an image, read whatever their licence, held no open photograph for 104
  // of the species round sixty-seven's rebuild left without one, Sprekelia formosissima among them (round sixty-eight).
  // Each photograph's own licence is still read below: a record's licence is not its photograph's, and a photograph that
  // states none is not published under its record's (round sixty-nine; triage-68 M1, S-B6: an ALA sighting's photograph
  // went out as "Michael Sim, CC BY, via GBIF" on the record's licence). The download path reads the same way (bulk.ts).
  const r = await f<OccPage>(`${GBIF}/occurrence/search?taxonKey=${key}&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&limit=100`);
  if (r.status !== 'ok') return r;
  const out: OccMedia[] = [];
  for (const o of r.data.results) {
    // iNaturalist images reach GBIF through a CC-BY-NC dataset; the per-photo licence is what counts, and it is on the media object.
    for (const m of o.media ?? []) {
      if (!m.identifier || (m.type && !/still/i.test(m.type))) continue;
      const tag = licenceTag(m.license);
      if (!isOpen(tag)) continue;
      out.push({ id: `${o.key}:${out.length}`, url: m.identifier, licence: tag!, creator: m.creator, rightsHolder: m.rightsHolder, page: m.references ?? `https://www.gbif.org/occurrence/${o.key}`, datasetKey: o.datasetKey, ...(o.basisOfRecord && o.basisOfRecord !== 'HUMAN_OBSERVATION' ? { specimen: true } : {}) });
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
