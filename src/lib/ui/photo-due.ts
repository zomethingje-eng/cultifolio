/**
 * One rule for "no photograph in twelve months", read by Today's line and by the plants list's chip the line opens, so the
 * two say the same number (round sixty-one; the grower review, 11: Today said 33 of 300 and its link listed 297).
 *
 * A growing plant counts when no photograph of it is dated in the last twelve months and it has been in the collection six
 * months or more, by the date it was acquired, else the day its record was made. A plant recorded this spring is not a
 * plant left unphotographed for a year; one the grower has had since 2015 and never photographed is the plant this is for
 * (round forty-nine, 3; kept in round fifty-four). A reading of the log: nothing is written.
 */
import { localDate, localDateYearAgo } from '$core/dates';

export interface PhotoDueSource {
  photos(id: string): ReadonlyArray<{ d: string }>;
  madeOn(kind: 'accession', id: string): string | null | undefined;
}
export interface PhotoDuePlant { id: string; status: string; acquired?: string | null }

/**
 * The two days the rule reads, from a calendar day: the shared day store's (`today.current`, which follows the corrected
 * clock, its changes and midnight), so Today's line and the list it opens are cut on the same day (round sixty-two;
 * outside review B4: Today passed the raw device clock and the list the corrected one, and a phone a year fast said
 * 21 of 21 over a list of 10). A `Date` is read as its local day; the default is the corrected clock's today.
 */
export function photoDueDays(day: string | Date = localDate()): { yearAgo: string; halfYearAgo: string } {
  const [y, m, d] = (typeof day === 'string' ? day : localDate(day)).split('-').map(Number);
  const now = new Date(y, (m || 1) - 1, d || 1, 12);
  const h = new Date(now);
  h.setMonth(h.getMonth() - 6);
  return { yearAgo: localDateYearAgo(now), halfYearAgo: localDate(h) };
}

/**
 * The latest day a stored date can mean: "2026" may be 31 December and "2026-04" 30 April. A partial date proves six
 * months only once its whole period is six months past; its first day would be a guess the record does not make (round
 * sixty-two; records 9, visitor-words 6, outside review B5; rule 3). The stored date is read, never changed.
 */
export function latestDay(date: string): string {
  if (/^\d{4}$/.test(date)) return `${date}-12-31`;
  const ym = /^(\d{4})-(\d{2})$/.exec(date);
  if (ym) {
    const last = new Date(Date.UTC(Number(ym[1]), Number(ym[2]), 0)).getUTCDate(); // day 0 of the next month
    return `${date}-${String(last).padStart(2, '0')}`;
  }
  return date;
}

export function photoDue(a: PhotoDuePlant, c: PhotoDueSource, days: { yearAgo: string; halfYearAgo: string }): boolean {
  if (a.status !== 'growing') return false;
  const since = a.acquired ?? c.madeOn('accession', a.id) ?? localDate();
  if (latestDay(since) > days.halfYearAgo) return false;
  return !c.photos(a.id).some((p) => p.d >= days.yearAgo);
}
