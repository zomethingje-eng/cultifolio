/**
 * When a change was made, as far as the log can say (round sixty-three; outside review B9, decision L1).
 *
 * A stamp read from a clock says when the change was made, by the writer's corrected clock. A stamp made past another
 * (`isPastStamp`: an edit placed after a field's stamp that was ahead of the clock, or a repair placed past such a stamp)
 * says only where the change sits in the order; its wall is that other stamp's, which may be a year ahead. Since round
 * sixty-three every change a device writes carries, beside its stamp, the writer's corrected clock at writing (`w`, ms):
 * information only, which no fold reads. Wherever the app shows a change's time, a marked change is dated by its `w` when
 * it has one; a change without one (written before round sixty-three, or by a build that does not write it) reads as before.
 */
import { isPastStamp } from './hlc';

/** The wall-clock millisecond of a stamp (as `hlcWall` in log.ts, kept here so this module does not take the fold's). */
const wallOf = (t: string) => Number(t.slice(0, 13));

/** The earliest recorded time read: 2020-01-01, before any build that writes one. */
export const W_MIN = Date.UTC(2020, 0, 1);
/** The latest a Date can hold. */
export const W_MAX = 8.64e15;
/** How far past its stamp's wall a recorded time may be: written beside the stamp, it is never later than it by more than the clock's own drift during one write. */
const W_PAST_WALL = 86_400_000;
/**
 * Whether `w` is a recorded time this build reads: a whole number of milliseconds from 2020 to the last date a Date
 * holds, and, given its stamp, not more than a day past the stamp's wall (round sixty-seven; triage-66 R9, the outside
 * review's 22). A bogus `w` of 1 showed 1970 and sent a removed photograph's delete at once, skipping the ten minutes of
 * Undo; one of 1e300 showed "NaN-NaN-NaN" at the top of a timeline. A recorded time earlier than its stamp's wall is
 * what a marked stamp carries (its wall is the stamp it was placed past, perhaps a year ahead), so no bound is set there
 * but the year.
 */
export const isRecordedTime = (w: unknown, t?: string): w is number =>
  typeof w === 'number' && Number.isFinite(w) && Math.floor(w) === w && w >= W_MIN && w <= W_MAX && (t === undefined || w <= wallOf(t) + W_PAST_WALL);

/** The time to show for a change: its recorded time when its stamp is marked and it carries one, else its stamp's wall. */
export function shownTime(c: { t: string; w?: unknown }): number {
  return isPastStamp(c.t) && isRecordedTime(c.w, c.t) ? c.w : wallOf(c.t);
}
