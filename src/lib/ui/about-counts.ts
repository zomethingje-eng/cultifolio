/**
 * The reference's counts on the about pages (round eighty-four; the reviews' S4 and A18: the pages quoted counts of a corpus
 * three uploads old). The page is prerendered, so its HTML carries the counts of a named day (`COUNTS_ON`), said as of
 * that day; once the page runs it asks `/api/counts`, which reads them from the corpus the Worker serves, and shows those
 * instead, said as the reference now. An answer that is not three whole counts in order is not shown.
 */
export interface Counts { species: number; genera: number; withClimate: number }

/** The counts of the live reference on 29 October 2026 (corpus e8885155673882ba): what the page says before, or without, an answer. */
export const COUNTS_ON: Counts & { on: string } = { species: 48_357, genera: 6_529, withClimate: 37_727, on: '29 October 2026' };

const whole = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** The answer read, or null when it is not counts: none of the three missing, none negative, the parts no larger than the whole. */
export function countsOf(x: unknown): Counts | null {
  if (!x || typeof x !== 'object') return null;
  const { species, genera, withClimate } = x as Record<string, unknown>;
  if (!whole(species) || !whole(genera) || !whole(withClimate) || species === 0) return null;
  if (genera > species || withClimate > species) return null;
  return { species, genera, withClimate };
}

/** Asks this site for the counts; null when it does not answer (offline, refused, or not counts). */
export async function liveCounts(f: typeof fetch = fetch): Promise<Counts | null> {
  try {
    const r = await f('/api/counts');
    if (!r.ok) return null;
    return countsOf(await r.json());
  } catch {
    return null;
  }
}

/** A count as the pages write it: 48,357. */
export const countText = (n: number) => n.toLocaleString('en-GB');
