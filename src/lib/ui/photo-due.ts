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
import { nowMs } from '$core/hlc';

export interface PhotoDueSource {
  photos(id: string): ReadonlyArray<{ d: string }>;
  madeOn(kind: 'accession', id: string): string | null | undefined;
}
export interface PhotoDuePlant { id: string; status: string; acquired?: string | null }

/** The two days the rule reads, from the corrected clock, as every date in the app is. */
export function photoDueDays(now: Date = new Date(nowMs())): { yearAgo: string; halfYearAgo: string } {
  const h = new Date(now);
  h.setMonth(h.getMonth() - 6);
  return { yearAgo: localDateYearAgo(now), halfYearAgo: localDate(h) };
}

export function photoDue(a: PhotoDuePlant, c: PhotoDueSource, days: { yearAgo: string; halfYearAgo: string }): boolean {
  if (a.status !== 'growing') return false;
  const since = a.acquired ?? c.madeOn('accession', a.id) ?? localDate();
  if (since > days.halfYearAgo) return false;
  return !c.photos(a.id).some((p) => p.d >= days.yearAgo);
}
