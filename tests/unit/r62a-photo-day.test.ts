/**
 * Round sixty-two, agent A: one clock and partial dates in the photo rule (outside review B4 and B5; records 9,
 * visitor-words 6). Today's "without a photograph in twelve months" line and the plants list's chip it opens are cut on the
 * shared day store's corrected day, which follows a clock correction at once; and a partial acquisition date ("2026",
 * "2026-04") proves six months only once its whole period is six months past. The stored date is never changed.
 *
 * Reproductions (fail on the base): the partial-date cases, the day store following a correction, and the source guard
 * that neither surface cuts its days from a raw `new Date()`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { photoDue, photoDueDays } from '$lib/ui/photo-due';

const src = (photos: Record<string, string[]> = {}, made: Record<string, string> = {}) => ({ photos: (id: string) => (photos[id] ?? []).map((d) => ({ d })), madeOn: (_k: 'accession', id: string) => made[id] ?? null });

describe('partial dates in the photo rule (B5, records 9, visitor-words 6)', () => {
  // 7 October 2026: the cut is 7 April 2026.
  const days = photoDueDays('2026-10-07');
  it('reads the cut from a calendar day', () => {
    expect(days).toEqual({ yearAgo: '2025-10-07', halfYearAgo: '2026-04-07' });
  });
  it('does not read "2026" or "2026-04" as the first day of the period (a plant imported last week)', () => {
    expect(photoDue({ id: 'r1', status: 'growing', acquired: '2026' }, src(), days)).toBe(false);
    expect(photoDue({ id: 'r2', status: 'growing', acquired: '2026-04' }, src(), days)).toBe(false);
  });
  it('a period that ended six months ago or more counts (the guard)', () => {
    expect(photoDue({ id: 'r3', status: 'growing', acquired: '2025' }, src(), days)).toBe(true);
    expect(photoDue({ id: 'r4', status: 'growing', acquired: '2026-03' }, src(), days)).toBe(true);
  });
  it('both ends of the cut: a month whose last day is the cut counts, a day later does not', () => {
    expect(photoDue({ id: 'm', status: 'growing', acquired: '2026-04' }, src(), photoDueDays('2026-10-30'))).toBe(true); // cut 30 April: April is all past
    expect(photoDue({ id: 'm', status: 'growing', acquired: '2026-04' }, src(), photoDueDays('2026-10-29'))).toBe(false); // cut 29 April: 30 April may be the day
    expect(photoDue({ id: 'm', status: 'growing', acquired: '2024-02' }, src(), photoDueDays('2024-08-29'))).toBe(true); // a leap February ends on the 29th
    expect(photoDue({ id: 'm', status: 'growing', acquired: '2024-02' }, src(), photoDueDays('2024-08-28'))).toBe(false);
  });
  it('both ends of the cut for a year: counted only once the whole year is six months past', () => {
    expect(photoDueDays('2026-07-01').halfYearAgo).toBe('2026-01-01');
    expect(photoDue({ id: 'y', status: 'growing', acquired: '2025' }, src(), photoDueDays('2026-07-01'))).toBe(true); // all of 2025 is past the cut
    expect(photoDueDays('2026-06-30').halfYearAgo).toBe('2025-12-30');
    expect(photoDue({ id: 'y', status: 'growing', acquired: '2025' }, src(), photoDueDays('2026-06-30'))).toBe(false); // 31 December 2025 may be the day
  });
  it('a full date is read as it is, and the stored date is never changed', () => {
    const a = { id: 'f', status: 'growing', acquired: '2026-04-07' };
    expect(photoDue(a, src(), days)).toBe(true);
    expect(photoDue({ ...a, acquired: '2026-04-08' }, src(), days)).toBe(false);
    const p = { id: 'p', status: 'growing', acquired: '2026-04' };
    photoDue(p, src(), days);
    expect(p.acquired).toBe('2026-04');
  });
  it('a photograph dated in the last twelve months still takes a plant off the list', () => {
    expect(photoDue({ id: 'x', status: 'growing', acquired: '2015' }, src({ x: ['2026-01-01'] }), days)).toBe(false);
  });
});

describe('one clock: the day store follows a correction at once (B4)', () => {
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });
  it('a phone a year fast, corrected by two agreeing readings, cuts the photo days on the corrected day', async () => {
    vi.resetModules();
    const real = Date.UTC(2026, 9, 7, 12);
    const YEAR = 365 * 86_400_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR); // the device clock reads October 2027
    const hlc = await import('$core/hlc');
    const { today } = await import('$lib/ui/day.svelte');
    const { photoDueDays: pdd } = await import('$lib/ui/photo-due');
    today.start();
    expect(today.current.slice(0, 4)).toBe('2027');
    hlc.trustServerTime(real, Date.now()); // the first reading of a large correction waits for a second
    vi.setSystemTime(real + YEAR + 5 * 60_000);
    hlc.trustServerTime(real + 5 * 60_000, Date.now()); // the second agrees: the correction is taken
    expect(hlc.clockOffsetMs()).toBeLessThan(-YEAR + 60_000);
    await Promise.resolve(); // listeners may be told after the caller's own work
    expect(today.current.slice(0, 4)).toBe('2026');
    expect(pdd(today.current)).toEqual({ yearAgo: '2025-10-07', halfYearAgo: '2026-04-07' });
    hlc.clearClockOffset();
  });
});

describe('neither surface cuts its days from a raw clock (B4, a guard on the source)', () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  it("Today's line and the plants list both read the day store", () => {
    for (const f of ['src/lib/ui/Today.svelte', 'src/routes/plants/+page.svelte']) {
      const s = read(f);
      expect(s, f).toMatch(/photoDueDays\(day\.current\)/);
      expect(s, f).not.toMatch(/new Date\(\)/);
    }
  });
});
