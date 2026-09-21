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
