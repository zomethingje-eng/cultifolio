/**
 * GBIF's occurrence download requests, as `scripts/bulk-fetch.ts` sends them (round seventy-nine, agent D). Pure: no
 * network, no files, so the tests read the exact bodies the owner's PC sends.
 *
 * Three requests, one rule for the records:
 *
 *   - the Darwin Core Archive (`dwcaRequest`): the records and their photographs (occurrence.txt, multimedia.txt);
 *   - GBIF's SQL download (`sqlRequest`, format SQL_TSV_ZIP): the same records in the columns the build reads
 *     (`SQL_SELECT` in src/lib/dossier/bulk.ts), with no photographs;
 *   - the images' download (`mediaRequest`): a DWCA of the same records that carry a still image and are human
 *     observations, the only records the build takes photographs from, for beside an SQL download.
 *
 * The records' filter is the same in each: the species' keys (TAXON_KEY: a record whose backbone classification holds
 * the key, its subspecies and its synonyms' records among them), with coordinates, no geospatial issue, and present.
 * GBIF's own conversion of that predicate to SQL (`POST /v1/occurrence/download/request/sql`, asked 2026-10-20) gave
 * `ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY(…))` and the three flags, which round seventy-nine sent;
 * since round eighty the keys are asked as GBIF's data analyst advised (`taxonFilter`), the same records by another form. Nothing else the build applies can be applied by GBIF without changing the dossiers: the build keeps a
 * uniform sample of each species' records (2,000, by a hash of the record's id) and judges each kept record after
 * (its licence, its basis, its establishment, its uncertainty, its place); a record left out by GBIF would change which
 * records are in the sample. SQL cannot take the sample itself: no sub-queries, HAVING or QUALIFY
 * (https://techdocs.gbif.org/en/data-use/api-sql-downloads, "Supported SQL").
 */
import { SQL_SELECT } from '../src/lib/dossier/bulk';

/**
 * GBIF's limit on a download predicate: "A download predicate may contain a maximum of 101,000 items (taxon keys, kingdom
 * keys, phylum keys, catalogue numbers, occurrence ids and so on)" (the Occurrence API reference, "Occurrence Download
 * Limits": https://techdocs.gbif.org/en/openapi/v1/occurrence#limits). The SQL page states no limit of its own; GBIF's
 * validation (`POST /v1/occurrence/download/request/validate`) accepted the list's 46,041 keys in one query on 2026-10-20.
 */
export const PREDICATE_ITEMS_MAX = 101_000;
/** iNaturalist Research-grade Observations, GBIF's dataset: its photographs are iNaturalist's open data's too (agent P). */
export const INAT_DATASET = '50c9509d-22c7-4a22-a47d-8c48425ef4a7';

export type Who = { creator?: string; email?: string };
type Predicate = { type: string; key?: string; value?: string; values?: string[]; predicate?: Predicate; predicates?: Predicate[] };

/** The records' filter, as the DWCA route has always asked it. */
export function recordsPredicate(keys: readonly number[]): Predicate {
  return {
    type: 'and',
    predicates: [
      { type: 'in', key: 'TAXON_KEY', values: keys.map(String) },
      { type: 'equals', key: 'HAS_COORDINATE', value: 'true' },
      { type: 'equals', key: 'HAS_GEOSPATIAL_ISSUE', value: 'false' },
      { type: 'equals', key: 'OCCURRENCE_STATUS', value: 'PRESENT' }
    ]
  };
}

/** The items a predicate holds, as GBIF counts them against its limit: each value of an `in`, each `equals`. */
export function predicateItems(p: Predicate): number {
  return (p.values?.length ?? (p.value != null ? 1 : 0)) + (p.predicates ?? []).reduce((n, x) => n + predicateItems(x), 0) + (p.predicate ? predicateItems(p.predicate) : 0);
}

const people = (who: Who) => ({ ...(who.creator ? { creator: who.creator } : {}), ...(who.email ? { notificationAddresses: [who.email] } : {}), sendNotification: false });

/** The DWCA request: the records with their photographs. No checklistKey, so GBIF writes the backbone's keys, which the build reads. */
export function dwcaRequest(keys: readonly number[], who: Who = {}) {
  return { ...people(who), format: 'DWCA', predicate: recordsPredicate(keys) };
}

/**
 * The species' keys as the SQL query filters by them, in the pattern GBIF's data analyst gave on 2026-10-21 (round eighty):
 * `EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN (…))`, where round seventy-nine sent GBIF's
 * own conversion of the DWCA's predicate, `ARRAYS_OVERLAP(occurrence.gbif_classification.taxonkeys, ARRAY(…))`. The two
 * select the same records (a record whose backbone classification holds any of the keys); GBIF's download of the list's
 * 46,022 keys by ARRAYS_OVERLAP ran 23 hours and was cancelled, and the analyst advised this form, which GBIF runs as a
 * filter on each record's array rather than as an overlap of two arrays. The keys are strings, as `taxonkeys` holds them.
 */
export function taxonFilter(keys: readonly number[]): string {
  return `EXISTS(occurrence.gbif_classification.taxonkeys, taxonkey -> taxonkey IN (${keys.map((k) => `'${k}'`).join(', ')}))`;
}

/**
 * The SQL query: one SELECT on `occurrence` of the columns the build reads, under the names it reads them by, filtered as
 * the DWCA is. No comment lines (GBIF's parser refuses them), single quotes for strings, `"year"` quoted (a keyword).
 */
export function sqlQuery(keys: readonly number[]): string {
  const cols = SQL_SELECT.map(([e, a]) => (e === a || e === `"${a}"` ? e : `${e} AS ${a}`)).join(', ');
  return `SELECT ${cols} FROM occurrence WHERE occurrence.hascoordinate = TRUE AND occurrence.hasgeospatialissues = FALSE AND occurrence.occurrencestatus = 'PRESENT' AND ${taxonFilter(keys)}`;
}

/** The SQL download request (format SQL_TSV_ZIP, the only one GBIF offers). */
export function sqlRequest(keys: readonly number[], who: Who = {}) {
  return { ...people(who), format: 'SQL_TSV_ZIP', sql: sqlQuery(keys) };
}

/**
 * The images' download, for beside an SQL download: a DWCA of the same records that have a still image and are human
 * observations, which are the only records whose photographs the build takes (`OccIndex.addMedia`). `inat: false`
 * leaves iNaturalist's dataset out, its photographs coming from iNaturalist's open data instead; then a page's GBIF
 * photographs are drawn from the other datasets alone, so they differ from the DWCA route's (which draws from all).
 */
export function mediaRequest(keys: readonly number[], who: Who = {}, o: { inat?: boolean } = {}) {
  const p = recordsPredicate(keys);
  p.predicates!.push({ type: 'equals', key: 'MEDIA_TYPE', value: 'StillImage' }, { type: 'equals', key: 'BASIS_OF_RECORD', value: 'HUMAN_OBSERVATION' });
  if (o.inat === false) p.predicates!.push({ type: 'not', predicate: { type: 'equals', key: 'DATASET_KEY', value: INAT_DATASET } });
  return { ...people(who), format: 'DWCA', predicate: p };
}

/** Keys in `n` parts of nearly equal size, in their order (`--parts`): each part one request, each read by the build. */
export function splitKeys<T>(keys: readonly T[], n: number): T[][] {
  const parts = Math.max(1, Math.min(Math.floor(n) || 1, keys.length || 1));
  const size = Math.ceil(keys.length / parts);
  const out: T[][] = [];
  for (let i = 0; i < keys.length; i += size) out.push(keys.slice(i, i + size));
  return out.length ? out : [[]];
}

/** The fewest parts a predicate request of these keys needs under GBIF's limit (four more items each: the three flags and the `in`'s own). */
export function partsNeeded(keys: number, extraItems = 3): number {
  return Math.max(1, Math.ceil(keys / (PREDICATE_ITEMS_MAX - extraItems)));
}

/**
 * The count API for a batch of keys under the records' filter (`limit=0`: the count alone), with an optional facet. GBIF's
 * occurrence search takes the same filter as the download; 200 keys a request keeps the address short.
 */
export function countUrl(keys: readonly number[], o: { media?: boolean; facet?: string; facetLimit?: number } = {}): string {
  const media = o.media ? '&mediaType=StillImage&basisOfRecord=HUMAN_OBSERVATION' : '';
  const facet = o.facet ? `&facet=${o.facet}&facetLimit=${o.facetLimit ?? keys.length * 2}` : '';
  return `https://api.gbif.org/v1/occurrence/search?${keys.map((k) => `taxonKey=${k}`).join('&')}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT${media}&limit=0${facet}`;
}

/**
 * The size of each download, estimated from its record count by measured bytes a record (each an estimate until GBIF
 * makes it): the DWCA at 456 bytes a record (round seventy-two's real download: 12,749,146,096 bytes for 27,941,930
 * records, multimedia.txt and verbatim.txt included); the SQL download at the bytes a row measured on a sample in its
 * own shape (`sqlBytesPerRow`, from scripts/dev/scale/r79d-sql-proof.ts).
 */
export const DWCA_BYTES_PER_RECORD = 456;
export function sizes(records: number, mediaRecords: number, sqlBytesPerRow: number) {
  return { dwca: records * DWCA_BYTES_PER_RECORD, sql: records * sqlBytesPerRow, media: mediaRecords * DWCA_BYTES_PER_RECORD };
}
