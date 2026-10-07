/**
 * The watering rhythms as a calendar file (round sixty; the product review's 9 and Part E 4.1, option B; the self-review's
 * experience item 6): something that brings the grower back without a server, an account or a push address. Made on the
 * device from the grower's own rules, handed to the browser as a download, imported by the grower into a calendar of
 * their choosing.
 *
 * One all-day event per place (and per plant with its own rhythm), repeating every n days (RRULE FREQ=DAILY;INTERVAL=n)
 * from its next due day, with a reminder at 09:00 on the day (VALARM, TRIGGER PT9H from the day's start): an all-day
 * event rings only if the calendar's default for all-day events is on, and Apple's is off (round sixty-one; the grower
 * review, "The .ics, validated"). Google ignores an imported alarm and keeps its own default.
 *
 * Dry months: a rhythm with dry months is a series per run of months it is watered in, each from the first day of its
 * run and ending (UNTIL) on the run's last day. Today lists every plant of a place as due on the first day after its dry
 * months; a cadence that ran on through them put the calendar's first day days after Today's (round sixty-one; the same
 * review). The runs reach two years ahead and the last one's description says to download the file again then; a rhythm
 * without dry months repeats with no end, and one dry in every month makes no event (the rhythms say which were left out).
 * RFC 5545: CRLF line ends, lines folded at 75 octets without splitting a character, TEXT escaped.
 */

export interface Rhythm {
  uid: string;
  /** What the rhythm is for, in words ("Greenhouse › Bench 1", "2026-0003 Lithops lesliei"), for the page to name it. */
  what?: string;
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

/** Whether a rhythm is dry in every month, and so has no day to water on: it makes no event. */
export const allDry = (r: Pick<Rhythm, 'dry'>): boolean => new Set(r.dry.filter((m) => m >= 1 && m <= 12)).size === 12;

/**
 * The runs of days a rhythm with dry months is watered in, from its first due day to the horizon: each run starts on its
 * first day not in a dry month (the rhythm's own first due day for the first run, when that is not dry) and ends on the
 * last day before the next dry month, or at the horizon.
 */
export function wetRuns(r: Rhythm, horizon: string = addDays(r.start, DRY_HORIZON_DAYS)): Array<{ from: string; to: string }> {
  const dry = (d: string) => r.dry.includes(Number(d.slice(5, 7)));
  const out: Array<{ from: string; to: string }> = [];
  let from: string | null = null;
  let last = r.start;
  for (let d = r.start; d <= horizon; d = addDays(d, 1)) {
    if (dry(d)) { if (from) out.push({ from, to: last }); from = null; }
    else { if (!from) from = d; last = d; }
  }
  if (from) out.push({ from, to: last });
  return out;
}

/** A later run's UID: the rhythm's own, marked with the run's first day, so each series is its own event. */
const runUid = (uid: string, from: string) => (uid.includes('@') ? uid.replace('@', `-from-${ymd(from)}@`) : `${uid}-from-${ymd(from)}`);

/** The reminder on the day: 09:00 from the all-day event's start, said as the event's summary. */
const alarm = (summary: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, 'TRIGGER:PT9H', 'END:VALARM'];

export function buildIcs(rhythms: Rhythm[], now: Date = new Date()): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cultifolio//Watering rhythms//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText('Cultifolio watering')}`];
  const event = (uid: string, r: Rhythm, start: string, until: string | null, note: string) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(start, 1))}`, `RRULE:FREQ=DAILY;INTERVAL=${r.every}${until ? `;UNTIL=${ymd(until)}` : ''}`);
    lines.push(`SUMMARY:${escapeText(r.summary)}`, `DESCRIPTION:${escapeText(r.description + note)}`, 'TRANSP:TRANSPARENT', ...alarm(r.summary), 'END:VEVENT');
  };
  for (const r of rhythms) {
    if (allDry(r)) continue;
    if (!r.dry.length) { event(r.uid, r, r.start, null, ''); continue; }
    const horizon = addDays(r.start, DRY_HORIZON_DAYS);
    const runs = wetRuns(r, horizon);
    runs.forEach((run, i) => {
      const lastRun = i === runs.length - 1;
      const note = lastRun ? ` The repeats stop on ${run.to}; download the calendar again before then.` : ` This series ends on ${run.to}, before the months kept dry; the next starts after them.`;
      event(i === 0 ? r.uid : runUid(r.uid, run.from), r, run.from, run.to, note);
    });
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
