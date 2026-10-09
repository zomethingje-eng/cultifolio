/**
 * Plant numbers in the order people read them (round sixty-three; the round-sixty grower review's finding 10). Numbers
 * are compared as text with their digit runs read as numbers, so a collection numbered A1 to A95 lists A95, A94, A77, A9
 * newest first, not A95, A94, A9, A77; and a search that is a plant's whole number lists that plant before the plants
 * whose numbers only end with it.
 */
const collator = new Intl.Collator('en', { numeric: true });

/** Newest first: the greater number first, digit runs read as numbers. */
export const byNumberNewest = (a: string, b: string): number => collator.compare(b, a);

/** Folded as the plants search folds its words: lower case, accents off, spaces at the ends dropped. */
const folded = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * The list with the records whose number is the whole search first, in the list's own order otherwise; the list itself
 * when no record's number is the search. "0001" found 2026-0001 and 2014-0001 above the plant numbered 0001.
 */
export function numberFirst<T>(list: T[], q: string, numberOf: (x: T) => string): T[] {
  const want = folded(q);
  if (!want) return list;
  const exact: T[] = [], rest: T[] = [];
  for (const x of list) (folded(numberOf(x)) === want ? exact : rest).push(x);
  return exact.length ? [...exact, ...rest] : list;
}
