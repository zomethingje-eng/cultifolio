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
 *
 * A file downloaded again replaces its events rather than adding beside them, where the calendar honours it (round
 * sixty-two; the outside review's A27, still open from round forty-three's 36): every UID carries the collection's tag, so
 * two collections never share one ("water-place-none" was the same in every file); a series after a dry season is named
 * by the first day of its watered months, the same in every download, where the first series in the file took the plain
 * UID and a later download gave that UID to another series; each event carries a SEQUENCE that grows with the download's
 * time; and a rhythm that is not a whole number of days from 1 to 365 is written at the default, since `INTERVAL=7.5`
 * made calendars refuse the whole file. When any series stops at the horizon, one more event, on the day the first stops,
 * says to download the calendar again.
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
/** The rhythm written for one that is not a whole number of days: the collection's own default (DUE_DAYS, three weeks). */
export const DEFAULT_EVERY = 21;
/** A rhythm the calendar can write: a whole number of days from 1 to 365, else `fallback` (round sixty-two; A27). */
export const wholeDays = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 365 ? n : fallback);
/**
 * The event's SEQUENCE: minutes from the start of 2026 to the download, so a later download's copy of an event is the
 * newer revision of it, whatever the calendar kept of the last.
 */
export const sequenceAt = (now: Date): number => Math.max(0, Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000));

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

/** A run's UID: the rhythm's own, marked with the first day of the watered months the run is in, so each series is its own event. */
const runUid = (uid: string, from: string) => (uid.includes('@') ? uid.replace('@', `-from-${ymd(from)}@`) : `${uid}-from-${ymd(from)}`);
/**
 * The first day of the watered months a day falls in: the day after the last dry day before it. A run that starts on its
 * rhythm's next due day, mid-season, is named by its season's first day, so a later download names that season's series
 * the same (round sixty-two; A27). A rhythm with no dry day in the year before is named by the day itself.
 */
export function seasonStart(r: Pick<Rhythm, 'dry'>, day: string): string {
  const dry = (d: string) => r.dry.includes(Number(d.slice(5, 7)));
  let d = day;
  for (let i = 0; i < 366; i++) {
    const prev = addDays(d, -1);
    if (dry(prev)) return d;
    d = prev;
  }
  return day;
}

/** The reminder on the day: 09:00 from the all-day event's start, said as the event's summary. */
const alarm = (summary: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, 'TRIGGER:PT9H', 'END:VALARM'];

/** The UID of the one event that says to download the calendar again, for a collection: one per collection, moved by each download. */
export const againUid = (tag: string) => `download-again.${tag}@cultifolio`;

/**
 * `collection`: the collection's tag, carried by every UID (the rhythms' own UIDs carry it already when `rhythmsOf` made
 * them; the reminder to download again takes it from here).
 */
export function buildIcs(rhythms: Rhythm[], now: Date = new Date(), collection = 'cultifolio'): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cultifolio//Watering rhythms//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText('Cultifolio watering')}`];
  const seq = sequenceAt(now);
  const event = (uid: string, r: Rhythm, start: string, until: string | null, note: string) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(start, 1))}`, `RRULE:FREQ=DAILY;INTERVAL=${wholeDays(r.every, DEFAULT_EVERY)}${until ? `;UNTIL=${ymd(until)}` : ''}`);
    lines.push(`SUMMARY:${escapeText(r.summary)}`, `DESCRIPTION:${escapeText(r.description + note)}`, 'TRANSP:TRANSPARENT', ...alarm(r.summary), 'END:VEVENT');
  };
  let stops: string | null = null; // the first day a series stops at the horizon
  const ends: Array<{ what: string; to: string }> = []; // each rhythm's last stop, to name the ones that stop that day
  let endless = false; // a rhythm with no dry months repeats without end in the same file
  for (const r of rhythms) {
    if (allDry(r)) continue;
    if (!r.dry.length) { event(r.uid, r, r.start, null, ''); endless = true; continue; }
    const horizon = addDays(r.start, DRY_HORIZON_DAYS);
    const runs = wetRuns(r, horizon);
    runs.forEach((run, i) => {
      const lastRun = i === runs.length - 1;
      const note = lastRun ? ` The repeats stop on ${run.to}; download the calendar again before then.` : ` This series ends on ${run.to}, before the months kept dry; the next starts after them.`;
      event(runUid(r.uid, seasonStart(r, run.from)), r, run.from, run.to, note);
      if (lastRun && (!stops || run.to < stops)) stops = run.to;
      if (lastRun) ends.push({ what: r.what ?? r.summary, to: run.to });
    });
  }
  if (stops) {
    // The last word in the file: on the day the first series stops, a plain event that says so, with its own reminder, so
    // the reminders do not end in silence two years on (round sixty-two; the grower review, 11; A27).
    const summary = 'Cultifolio: download the watering calendar again';
    lines.push('BEGIN:VEVENT', `UID:${againUid(collection)}`, `SEQUENCE:${seq}`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${ymd(stops)}`, `DTEND;VALUE=DATE:${ymd(addDays(stops, 1))}`);
    // Which repeats stop, when not all of them do: "The watering repeats in this file stop" was said over a place with no
    // dry months, which repeats without end (round sixty-two; the verification review's grower, smaller).
    const stopping = ends.filter((e) => e.to === stops).map((e) => e.what);
    const later = ends.some((e) => e.to !== stops);
    const which = !endless && !later
      ? `The watering repeats in this file stop from today, ${stops}.`
      : `Some of the watering repeats in this file stop from today, ${stops}: ${stopping.join('; ')}. The others ${endless && later ? 'stop later or repeat without end' : endless ? 'repeat without end' : 'stop later'}.`;
    lines.push(`SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(`${which} Download the calendar again from Today in Cultifolio, and delete these events first.`)}`, 'TRANSP:TRANSPARENT', ...alarm(summary), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
