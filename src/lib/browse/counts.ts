/**
 * The counts of the browse pages' indexes, each the number its own page lists (round eighty-seven, the review of stage 1,
 * B1): the TDWG level-3 regions with a species native to them (/region's "botanical countries"), the families
 * (/family's list), the genera with a page of their own (/genus's, two species or more), and the species whose
 * cultivated observations the species list does not count (`grown` -1 in the table: not counted, never 0, rule 2).
 *
 * The front page's Browse table showed "By region: on a map, 3 regions" on the fixture, where /region lists 14: its three
 * figures were the old catalogue's groupings (the origin groups, every genus) and no page of the browse engine's. These
 * are the engine's own, counted from the table once (`wholeCounts`), so the front page and the index pages say one number.
 *
 * Under a manifest that names `browse-counts.json` the front page reads them from that file (the build writes it beside
 * the table; `browseCounts`), never the table: a file written before these were in it has none, and the row then shows
 * no count rather than another grouping's.
 */
import { wholeCounts, GENUS_PAGE_MIN, type Prepared } from './engine';
import { regionOf } from './tdwg';

export interface EntranceCounts {
  /** TDWG level-3 regions with a species native to them: /region's "botanical countries". */
  regions: number;
  /** Families: /family's list. */
  families: number;
  /** Genera with two species or more here, each with its page: /genus's list. */
  genera: number;
  /** Species whose cultivated observations the species list does not count. */
  grownNotCounted: number;
}
export const ENTRANCE_KEYS = ['regions', 'families', 'genera', 'grownNotCounted'] as const;

/** How many species each genus has here, by the engine's genus number. */
export function genusSizes(p: Prepared): Int32Array {
  const count = new Int32Array(p.genera.length);
  for (let i = 0; i < p.t.n; i++) count[p.genus[i]]++;
  return count;
}
/** The level-3 regions of the whole counts that have a species: the number /region says. */
export const level3With = (w: ReturnType<typeof wholeCounts>): number => [...w.regions.keys()].filter((k) => regionOf(k)?.level === 3).length;

/** The four counts of a table, as its pages list them. Pure: the build may write them, the server counts them alike. */
export function entranceCountsOf(p: Prepared): EntranceCounts {
  const w = wholeCounts(p);
  let genera = 0;
  for (const n of genusSizes(p)) if (n >= GENUS_PAGE_MIN) genera++;
  let grownNotCounted = 0;
  for (const g of p.t.grown) if (g < 0) grownNotCounted++;
  return { regions: level3With(w), families: p.t.families.length, genera, grownNotCounted };
}

/** Those counts of a file read, each kept only where it is a whole number of none or more (a file of before has none). */
export function entranceCountsIn(x: unknown): Partial<EntranceCounts> {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: Partial<EntranceCounts> = {};
  for (const k of ENTRANCE_KEYS) { const v = o[k]; if (Number.isInteger(v) && (v as number) >= 0) out[k] = v as number; }
  return out;
}
