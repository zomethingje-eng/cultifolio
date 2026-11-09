/**
 * The browse pages' alphabet (round eighty-seven, stage 2): one collator for every name a browse page orders, the
 * species, the genera, the families, the regions and the countries, so "Æthionema" files under A beside "Aethionema",
 * "Échinopsis" beside "Echinopsis" and "Zaïre" under Z, as a reader expects, and "Aloe 10-…" before "Aloe 9-…" is not
 * a question. Stage 1 compared the names' letters folded to plain lower case, byte by byte, for the species, and
 * `localeCompare` with the runtime's own locale elsewhere, so two lists of one page could be in two orders.
 *
 * English rules at the base strength (accents and case are not differences; two names that differ only so keep the
 * order they had), numbers read as numbers. The hybrid sign is set aside by the caller (`withoutSign`), as a checklist
 * orders names.
 */
const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true, usage: 'sort' });

/** The browse pages' comparison of two names. */
export const nameOrder = (a: string, b: string): number => COLLATOR.compare(a, b);

/**
 * The places 0..n-1 in the collator's order of `names`, ties kept in place order: sorted first by the names folded as the
 * collator reads letters at its base strength (accents dropped, a ligature as its letters: Æ is "ae", ß "ss"), which is
 * the collator's order for all but a few pairs (spaces against hyphens, digits as numbers), then put right with the
 * collator: each name after its neighbour in order is kept, each other is placed by a binary search among the names
 * already placed. A collator's comparison once a pair of a sort was about 150 ms of a cold isolate's 48,375 names (stage
 * 1's measure); this is one comparison a name and a few more for each out of place.
 */
const LIGATURES: Record<string, string> = { 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'þ': 'th', 'ı': 'i' };
export const foldName = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[æœßøđðłþı]/g, (c) => LIGATURES[c]);
export function collatedOrder(names: readonly string[]): number[] {
  const bare = names.map(foldName);
  const first = Array.from({ length: names.length }, (_, i) => i).sort((a, b) => (bare[a] < bare[b] ? -1 : bare[a] > bare[b] ? 1 : a - b));
  const cmp = (a: number, b: number) => COLLATOR.compare(names[a], names[b]) || a - b;
  const out: number[] = [];
  for (const x of first) {
    if (!out.length || cmp(out[out.length - 1], x) <= 0) { out.push(x); continue; }
    let lo = 0, hi = out.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(out[mid], x) <= 0) lo = mid + 1; else hi = mid; }
    out.splice(lo, 0, x);
  }
  return out;
}
