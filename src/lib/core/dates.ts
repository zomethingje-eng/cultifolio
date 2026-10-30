/**
 * The calendar date where the reader is. `toISOString()` gives the UTC date,
 * which west of Greenwich is tomorrow from the evening on, so a plant potted
 * at 9 pm in Pittsburgh was dated the next day. Every date a grower enters or
 * an event is stamped with goes through here; the server's own stamps (sync
 * quotas, forecast reduction) stay UTC and say so where they are.
 */
import { nowMs } from './hlc';

/** Today where the reader is, by the corrected clock: a phone set to 2031 dated its waterings 2031 while its stamps were being corrected (round fifty-one, 1). */
export function localDate(d: Date = new Date(nowMs())): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The same day a year ago, on the local calendar (29 February becomes 1 March, as Date does). */
export function localDateYearAgo(d: Date = new Date(nowMs())): string {
  return localDate(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
}

/** Whole days from a `YYYY-MM-DD` date to another (today by default), both read as calendar dates: a plant watered this evening was watered 0 days ago wherever the reader is, never 1 or -1. */
export function daysBetween(from: string, to: string = localDate()): number {
  const day = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, dd || 1) / 86_400_000; };
  return Math.floor(day(to) - day(from));
}

/**
 * The one rule for an instant against a local day (round eighty-four; outside review A14 and A23). An instant (an ISO
 * string with a time, `toISOString()`'s, or a millisecond count) is read on the reader's own calendar before it is
 * compared with a day: its first ten characters are the UTC date, which in Pittsburgh after 8 pm is tomorrow, and Today
 * said "backup -1 d ago". Null for something that is not an instant.
 */
export function localDateOf(instant: string | number | Date): string | null {
  const ms = instant instanceof Date ? instant.getTime() : typeof instant === 'number' ? instant : Date.parse(instant);
  return Number.isFinite(ms) ? localDate(new Date(ms)) : null;
}

/** Whole days on the reader's calendar from an instant to a day (today by default): 0 the same day, 1 the day before, never negative, so a backup taken at 9 pm is "today" until midnight here. Null for something that is not an instant. */
export function daysSince(instant: string | number | Date, to: string = localDate()): number | null {
  const d = localDateOf(instant);
  return d == null ? null : Math.max(0, daysBetween(d, to));
}

/** The local calendar date a record or event was made on, read from its id (`e`/`r`/`s` + wall time in base 36 + counter + device): the day the grower typed it, which is not the date they typed. Null for an id of another shape. */
export function madeOn(id: string): string | null {
  const wall = parseInt(id.slice(1, 9), 36);
  return Number.isFinite(wall) && wall > 1_000_000_000_000 && wall < 4_000_000_000_000 ? localDate(new Date(wall)) : null;
}
