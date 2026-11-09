/**
 * The browse table (round eighty-seven, C1): every species of the index, by its place in the index, with what the
 * browse pages filter, count, list and export, and nothing else. No photograph: a page's tiles read their entries for
 * that (the show blocks, or the index held whole), and nothing of the table goes to the browser.
 *
 * Under a manifest that names `browse.json`, the build's product is read (the corpus build writes it with
 * `browseTableOf`, in the same pass as the index, so its places are the index's); otherwise the server derives it from
 * the index it holds (the fixture's, a static corpus's) once per index. A manifest that names no `browse.json` and no
 * index the Worker may read is said as such by the page (`BROWSE_UNBUILT`), never shown as no species.
 *
 * Columns, not rows, so the file is about 4 MB for 48,375 species rather than 7, and parsed in one pass.
 */
import { slugify, genusOf } from '$core/names';
import type { IndexEntry } from '$dossier/index-entry';

export interface BrowseTable {
  v: 1;
  /** How many species: every column's length. */
  n: number;
  name: string[];
  /** The page id: a number for Kew's `k<plant_name_id>`, the id itself otherwise. */
  key: Array<number | string>;
  /** The page's own GBIF key, 0 where it has none. */
  gbif: number[];
  /** The address, by place, only where it is not `slugify(name)`. */
  slug: Record<string, string>;
  /** The headline English name, '' for none. */
  common: string[];
  families: string[];
  /** Index into `families`, -1 for none. */
  family: number[];
  /** Every origin name the index writes (TDWG level-3 names, and the few wider ones). */
  origins: string[];
  /** Each species' origins, as indexes into `origins`. */
  origin: number[][];
  /** One letter a species: `o` habitat climate known, `n` none, `p` pending, `r` refused, `?` anything else. */
  climate: string;
  /** iNaturalist's observations marked captive or cultivated (`IndexEntry.grown`), -1 where the list does not count it. */
  grown: number[];
  /** The day the page last changed in substance, as days since 1970 (`IndexEntry.changed`), 0 where the index has none. */
  changed: number[];
  /**
   * The record low, °C to one decimal (`IndexEntry.low`; round eighty-seven, derived agent, C5), null where the index has
   * none (no record low shown, or an index built before). Absent in a table written before: read as none known.
   */
  low?: Array<number | null>;
  /*
   * No `first` column (round eighty-seven's review of stage 2): the day a page was first seen was written here as
   * days since 1970 and read by nothing, +526 kB of browse.json's growth; the index keeps it (`IndexEntry.first`). A
   * table written with it is still a table (the column is not read).
   */
}

export const BROWSE_FILE = 'browse.json';
/** The page's words when a corpus is read through its files and its manifest names no browse table. */
export const BROWSE_UNBUILT = 'This build of the reference has no browse table yet. Search and the species pages work as before.';

const CLIMATE: Record<string, string> = { ok: 'o', none: 'n', pending: 'p', refused: 'r' };
export const climateOfLetter = (c: string): string => ({ o: 'ok', n: 'none', p: 'pending', r: 'refused' })[c] ?? '';

/** The table of an index, in its order. Pure: the build and the Worker write the same table of the same index. */
export function browseTableOf(index: ReadonlyArray<Pick<IndexEntry, 'key' | 'gbif' | 'slug' | 'name' | 'common' | 'family' | 'origin' | 'climate' | 'grown' | 'changed' | 'low'>>): BrowseTable {
  const families: string[] = [], famAt = new Map<string, number>();
  const origins: string[] = [], orAt = new Map<string, number>();
  const t: BrowseTable = { v: 1, n: index.length, name: [], key: [], gbif: [], slug: {}, common: [], families, family: [], origins, origin: [], climate: '', grown: [], changed: [], low: [] };
  let climate = '';
  index.forEach((e, i) => {
    t.name.push(e.name);
    t.key.push(/^k[1-9]\d{0,9}$/.test(e.key) ? Number(e.key.slice(1)) : e.key);
    t.gbif.push(typeof e.gbif === 'number' && e.gbif > 0 ? e.gbif : 0);
    if (e.slug !== slugify(e.name)) t.slug[i] = e.slug;
    t.common.push(e.common ?? '');
    if (e.family) { let f = famAt.get(e.family); if (f === undefined) { famAt.set(e.family, (f = families.length)); families.push(e.family); } t.family.push(f); } else t.family.push(-1);
    t.origin.push([...new Set(e.origin ?? [])].map((o) => { let k = orAt.get(o); if (k === undefined) { orAt.set(o, (k = origins.length)); origins.push(o); } return k; }));
    climate += CLIMATE[e.climate] ?? '?';
    t.grown.push(typeof e.grown === 'number' && Number.isFinite(e.grown) && e.grown >= 0 ? e.grown : -1);
    t.changed.push(typeof e.changed === 'number' && Number.isInteger(e.changed) && e.changed > 0 ? e.changed : 0);
    t.low!.push(typeof e.low === 'number' && Number.isFinite(e.low) ? Math.round(e.low * 10) / 10 : null);
  });
  t.climate = climate;
  return t;
}

/**
 * The front page's count of the browse pages' "grown" filter (round eighty-seven, the integration): the species with
 * observations in cultivation on iNaturalist, as /browse?grown=1 counts them; null where the table counts none at all
 * (an index whose entries carry no such count: not counted, never "none grown"). Written by the build beside the table
 * (`BROWSE_COUNTS_FILE`), so the front page reads a file of a few bytes and never the table.
 */
export const BROWSE_COUNTS_FILE = 'browse-counts.json';
export interface BrowseCounts { grown: number | null }
export function browseCountsOf(t: Pick<BrowseTable, 'grown'>): BrowseCounts {
  let counted = false, grown = 0;
  for (const g of t.grown) { if (g >= 0) counted = true; if (g > 0) grown++; }
  return { grown: counted ? grown : null };
}

/**
 * What `--index` says of the two files (round eighty-seven's review, the stage-1 plan): the table's species, which are
 * the index's, and the count beside it, as read back from what was written; a file that does not parse as one is said so.
 */
export function browseWords(table: string | undefined, counts: string | undefined, how = 'written'): string {
  let t: unknown = null, c: unknown = null;
  try { t = table ? JSON.parse(table) : null; } catch { /* said below */ }
  try { c = counts ? JSON.parse(counts) : null; } catch { /* said below */ }
  const tw = isBrowseTable(t) ? `${BROWSE_FILE} ${how} with ${t.n} species` : `${BROWSE_FILE} NOT ${how}: ${table ? 'it is not a browse table' : 'the manifest names none'}`;
  const g = (c as BrowseCounts | null)?.grown;
  const cw = c && typeof c === 'object' && (g === null || (typeof g === 'number' && Number.isInteger(g))) ? `${BROWSE_COUNTS_FILE} ${how} (${g === null ? 'grown: not counted' : `grown by someone: ${g} species`})` : `${BROWSE_COUNTS_FILE} NOT ${how}: ${counts ? 'it is not a count' : 'the manifest names none'}`;
  return `${tw}, ${cw}`;
}

const isInts = (x: unknown, n: number) => Array.isArray(x) && x.length === n && x.every((v) => Number.isInteger(v));
/** Whether a file read is a browse table of `species` species, every column whole (a short column would shift every place after it). */
export function isBrowseTable(x: unknown, species?: number): x is BrowseTable {
  const t = x as BrowseTable;
  if (!t || typeof t !== 'object' || t.v !== 1 || !Number.isInteger(t.n) || (species !== undefined && t.n !== species)) return false;
  const n = t.n;
  return Array.isArray(t.name) && t.name.length === n && t.name.every((s) => typeof s === 'string')
    && Array.isArray(t.key) && t.key.length === n
    && isInts(t.gbif, n) && isInts(t.family, n) && isInts(t.grown, n) && isInts(t.changed, n)
    && Array.isArray(t.common) && t.common.length === n
    && Array.isArray(t.families) && Array.isArray(t.origins)
    && Array.isArray(t.origin) && t.origin.length === n && t.origin.every((o) => Array.isArray(o))
    && typeof t.climate === 'string' && t.climate.length === n
    && !!t.slug && typeof t.slug === 'object'
    // Round eighty-seven (C5): the column is optional, a table written before has none; one present is whole.
    && (t.low === undefined || (Array.isArray(t.low) && t.low.length === n && t.low.every((x) => x === null || (typeof x === 'number' && Number.isFinite(x)))));
}

/** A species' record low as the table holds it (°C, one decimal), or null where none is known (round eighty-seven, C5). */
export const lowAt = (t: BrowseTable, i: number): number | null => t.low?.[i] ?? null;

/** A species' page id and address as the table holds them. */
export const keyAt = (t: BrowseTable, i: number): string => (typeof t.key[i] === 'number' ? `k${t.key[i]}` : String(t.key[i]));
export const slugAt = (t: BrowseTable, i: number): string => t.slug[i] ?? slugify(t.name[i]);
export const genusAt = (t: BrowseTable, i: number): string => genusOf(t.name[i]);
