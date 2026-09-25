/**
 * The calendar date where the reader is. `toISOString()` gives the UTC date,
 * which west of Greenwich is tomorrow from the evening on, so a plant potted
 * at 9 pm in Pittsburgh was dated the next day. Every date a grower enters or
 * an event is stamped with goes through here; the server's own stamps (sync
 * quotas, forecast reduction) stay UTC and say so where they are.
 */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The same day a year ago, on the local calendar (29 February becomes 1 March, as Date does). */
export function localDateYearAgo(d: Date = new Date()): string {
  return localDate(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
}

/** Whole days from a `YYYY-MM-DD` date to another (today by default), both read as calendar dates: a plant watered this evening was watered 0 days ago wherever the reader is, never 1 or -1. */
export function daysBetween(from: string, to: string = localDate()): number {
  const day = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, dd || 1) / 86_400_000; };
  return Math.floor(day(to) - day(from));
}

/** The local calendar date a record or event was made on, read from its id (`e`/`r`/`s` + wall time in base 36 + counter + device): the day the grower typed it, which is not the date they typed. Null for an id of another shape. */
export function madeOn(id: string): string | null {
  const wall = parseInt(id.slice(1, 9), 36);
  return Number.isFinite(wall) && wall > 1_000_000_000_000 && wall < 4_000_000_000_000 ? localDate(new Date(wall)) : null;
}
