/**
 * The watering rhythms as a calendar file (round sixty; the product review's 9 and Part E 4.1, option B; the self-review's
 * experience item 6): something that brings the grower back without a server, an account or a push address. Made on the
 * device from the grower's own rules, handed to the browser as a download, imported by the grower into a calendar of
 * their choosing.
 *
 * One all-day event per place (and per plant with its own rhythm), repeating every n days (RRULE FREQ=DAILY;INTERVAL=n)
 * from its next due day. Dry months are honoured with EXDATE: every repeat that falls in a month the place is kept dry is
 * listed as an exception. EXDATE can only list days, so a rhythm with dry months runs for two years (UNTIL) and the
 * event's description says to download the file again then; a rhythm without dry months repeats with no end.
 * RFC 5545: CRLF line ends, lines folded at 75 octets without splitting a character, TEXT escaped.
 */

export interface Rhythm {
  uid: string;
  summary: string;
  description: string;
  /** First due day, YYYY-MM-DD. */
  start: string;
  every: number;
  /** Months 1 to 12 kept dry: repeats in them are excepted. */
  dry: number[];
}

/** How long a rhythm with dry months runs, in days, before the file must be downloaded again. */
export const DRY_HORIZON_DAYS = 730;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const ymd = (d: string) => d.replaceAll('-', '');
export const addDays = (d: string, n: number): string => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const stamp = (now: Date) => `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

/** TEXT as RFC 5545 §3.3.11 writes it. */
export const escapeText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** One content line folded at 75 octets (§3.1): each further piece starts with a space; a UTF-8 character is never split. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // the leading space takes one octet of the next line's 75
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** The repeats of a rhythm that fall in its dry months, up to its end. */
export function dryDates(r: Rhythm, until: string): string[] {
  if (!r.dry.length) return [];
  const out: string[] = [];
  for (let d = r.start; d <= until; d = addDays(d, r.every)) if (r.dry.includes(Number(d.slice(5, 7)))) out.push(d);
  return out;
}

export function buildIcs(rhythms: Rhythm[], now: Date = new Date()): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cultifolio//Watering rhythms//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText('Cultifolio watering')}`];
  for (const r of rhythms) {
    const until = r.dry.length ? addDays(r.start, DRY_HORIZON_DAYS) : null;
    lines.push('BEGIN:VEVENT', `UID:${r.uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(r.start)}`, `DTEND;VALUE=DATE:${ymd(addDays(r.start, 1))}`, `RRULE:FREQ=DAILY;INTERVAL=${r.every}${until ? `;UNTIL=${ymd(until)}` : ''}`);
    const ex = until ? dryDates(r, until) : [];
    // Several EXDATE lines rather than one of hundreds of dates: each stays short, and every reader takes the union.
    for (let i = 0; i < ex.length; i += 20) lines.push(`EXDATE;VALUE=DATE:${ex.slice(i, i + 20).map(ymd).join(',')}`);
    lines.push(`SUMMARY:${escapeText(r.summary)}`, `DESCRIPTION:${escapeText(r.description + (until ? ` The repeats stop on ${until}; download the calendar again before then.` : ''))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
