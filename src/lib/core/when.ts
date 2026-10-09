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

/** Whether `w` is a recorded time this build reads: a finite, positive whole number of milliseconds. */
export const isRecordedTime = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0 && Math.floor(w) === w;

/** The time to show for a change: its recorded time when its stamp is marked and it carries one, else its stamp's wall. */
export function shownTime(c: { t: string; w?: unknown }): number {
  return isPastStamp(c.t) && isRecordedTime(c.w) ? c.w : wallOf(c.t);
}
