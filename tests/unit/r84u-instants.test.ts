/**
 * Round eighty-four, agent U: one rule for an instant against a local day (outside review A14 and A23).
 *
 * Today said "backup -1 d ago" after 8 pm in Pittsburgh: it compared `lastBackup.slice(0, 10)`, the UTC date of an
 * instant written with `toISOString()`, with the reader's own day. The same was done for "synced N d ago", and the backup
 * page counted "today" and "yesterday" in 24-hour spans. Now every instant is read on the reader's calendar through
 * `localDateOf` / `daysSince` (src/lib/core/dates.ts), and the scan below keeps a `slice(0, 10)` of an instant from coming
 * back into the device's code: each one left is listed with the reason it is a UTC day on purpose.
 *
 * On r84base: `daysSince` and `localDateOf` did not exist (the first describe fails on its import), and the scan found
 * Today.svelte's three and the backup page's `m.exported.slice(0, 10)`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as dates from '$core/dates';

const tz0 = process.env.TZ;
afterEach(() => {
  if (tz0 === undefined) delete process.env.TZ; else process.env.TZ = tz0;
  vi.useRealTimers();
});

describe('an instant against the reader\'s day', () => {
  it('a backup taken at 9 pm in Pittsburgh is today there until midnight, and yesterday after it', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    // 21:30 on 29 October in Pittsburgh is 01:30 on the 30th in UTC.
    vi.setSystemTime(Date.parse('2026-10-30T01:30:00Z'));
    const taken = new Date(Date.parse('2026-10-30T01:00:00Z')).toISOString();
    expect(taken.slice(0, 10)).toBe('2026-10-30'); // what the old code compared: tomorrow, here
    expect(dates.localDate()).toBe('2026-10-29');
    expect(dates.localDateOf(taken)).toBe('2026-10-29');
    expect(dates.daysSince(taken)).toBe(0); // r84base read daysBetween('2026-10-30') = -1
    expect(dates.daysBetween(taken.slice(0, 10))).toBe(-1); // the fault, kept in view
    // Half past midnight, the 30th in Pittsburgh: yesterday.
    vi.setSystemTime(Date.parse('2026-10-30T04:30:00Z'));
    expect(dates.daysSince(taken)).toBe(1);
  });
  it('east of Greenwich, the morning\'s backup is not dated the day before', () => {
    process.env.TZ = 'Pacific/Auckland';
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-10-29T20:00:00Z')); // 09:00 on the 30th in Auckland
    const taken = new Date(Date.parse('2026-10-29T19:00:00Z')).toISOString(); // 08:00 there, the 29th in UTC
    expect(dates.localDateOf(taken)).toBe('2026-10-30');
    expect(dates.daysSince(taken)).toBe(0); // the old rule said 1 d ago
  });
  it('takes a millisecond count and a Date, and says nothing for what is not an instant', () => {
    process.env.TZ = 'UTC';
    expect(dates.localDateOf(Date.parse('2026-03-01T12:00:00Z'))).toBe('2026-03-01');
    expect(dates.localDateOf(new Date('2026-03-01T12:00:00Z'))).toBe('2026-03-01');
    expect(dates.localDateOf('not a date')).toBeNull();
    expect(dates.daysSince('')).toBeNull();
    expect(dates.daysSince('2026-03-01T12:00:00Z', '2026-03-31')).toBe(30);
    // An instant ahead of the day (a clock set back since) is today, never "-3 d ago".
    expect(dates.daysSince('2026-04-03T12:00:00Z', '2026-03-31')).toBe(0);
  });
});

/**
 * The device's code: every `.slice(0, 10)`, `.substring(0, 10)` or `toISOString().slice` that cuts a day out of a string.
 * The server's and the reference build's code keep UTC days on purpose and are not scanned (src/lib/server, src/lib/dossier,
 * src/routes/api). Each line left is named here with why it is a UTC day, or not an instant at all.
 */
const ALLOWED: Array<{ file: string; has: string; why: string }> = [
  { file: 'src/lib/db/collection.svelte.ts', has: "d: when.toISOString().slice(0, 10)", why: 'the number repair\'s note: every device derives the same note from the same log, so its day is UTC (round eleven, 3)' },
  { file: 'src/lib/weather/forecast.ts', has: 'new Date(ms + offsetH * 3600_000).toISOString().slice(0, 10)', why: 'the site\'s solar day: the instant is shifted by the site\'s own offset first' },
  { file: 'src/lib/import/csv.ts', has: "Date.UTC(1899, 11, 30)", why: 'a spreadsheet\'s day number counted in UTC: a calendar date, not an instant' },
  { file: 'src/lib/ui/Provenance.svelte', has: 'dossier.built.slice(0, 10)', why: 'the reference page\'s build day, a UTC stamp the page states as such' },
  { file: 'src/lib/ui/Provenance.svelte', has: 'u.at.slice(0, 10)', why: 'the day a source was asked during the build, in UTC like the build' },
  { file: 'src/lib/ui/ref/upstream.ts', has: "(rec.at ?? '').slice(0, 10)", why: 'the reference build\'s own record of when a source was asked, in UTC' }
];
const SKIP = ['src/lib/server', 'src/lib/dossier', 'src/routes/api'];
function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n).replace(/\\/g, '/'); // a Windows path's separators, so the list's paths match (the owner's PC)
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|svelte|js)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe('no UTC day cut from an instant in the device\'s code (the grep rule)', () => {
  it('every slice of ten characters left is one of the listed UTC days', () => {
    const found: string[] = [];
    for (const f of files('src')) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\.(slice|substring)\(0,\s*10\)/.test(line)) return;
        if (ALLOWED.some((a) => a.file === f && line.includes(a.has))) return;
        found.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(found).toEqual([]);
  });
  it('the list names nothing that is no longer there', () => {
    for (const a of ALLOWED) expect(readFileSync(a.file, 'utf8'), `${a.file}: ${a.why}`).toContain(a.has);
  });
});
