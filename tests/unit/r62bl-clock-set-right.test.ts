/**
 * Adopted in the second pass of round sixty-two (agent L) from the self-review's N1 (`triage-self--clock-set-right`):
 * both cases FAILED on the first pass and pass with the rule that a move back is followed only as far as a negative
 * correction says the clock was fast, after undoing the moves forward kept since the last reading. The cases below them
 * are guards of the data review's suspected item "a reading in flight while the clock moves" (not reproduced).
 * Triage-self review of round sixty-two (found while re-running the clock review's finding 8 reproduction, whose set-up
 * no longer holds). A device clock that is wrong and then set right by hand, while a page is open, is "followed" by the
 * correction when this tab holds a stored reading and the move back is not exactly the last kept move forward: the clock
 * in force stays as wrong as it was, stamps are made a year ahead, and the wrong offset is stored for the next load.
 * Round sixty-one read the device clock directly in these cases (a fast clock set right lapsed at once).
 * FAILS on the round-sixty-two merge. Run: npx vitest run tests/unit/triage-self--clock-set-right.test.ts
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const DAY = 86_400_000;
const MIN = 60_000;
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
const PENDING_KEY = 'cultifolio.clockPending';
const store = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
});
afterEach(() => {
  vi.useRealTimers();
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});
/** The clock module as a fresh page load reads it. */
async function fresh() {
  vi.resetModules();
  return import('$core/hlc');
}
/** Both clocks advance together: time passes, and no clock was moved. */
const pass = (ms: number) => vi.advanceTimersByTime(ms);
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };


const YEAR = 365 * DAY;
describe('a wrong device clock set right by hand, with a page open', () => {
  it('a device that synced once (clock right), opened a year fast, then put right: the clock in force is right', async () => {
    const trueT = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: trueT - DAY });
    let h = await fresh();
    h.trustServerTime(Date.now(), Date.now()); // a reading a day ago: the clock was right
    expect(h.clockOffsetMs()).toBe(0);
    vi.setSystemTime(trueT + YEAR); // the next day the device clock reads a year ahead (set wrong while no page was open)
    h = await fresh(); // the page is opened
    expect(h.nowMs() - trueT).toBeGreaterThan(YEAR - DAY); // nothing here knows better yet: stamps a year ahead
    vi.setSystemTime(Date.now() - YEAR); // the grower notices, and sets the clock right (offline: no reading)
    const t = Date.now();
    const inTab = h.nowMs() - t;
    h = await fresh(); // and a reload, still offline
    expect({ inTab: Math.abs(inTab) < MIN, afterReload: Math.abs(h.nowMs() - Date.now()) < MIN }).toEqual({ inTab: true, afterReload: true }); // FAILS on both: the move back is "followed" (the clock in force stays a year ahead), and that offset is stored
  });
  it('a clock set a year forward by mistake in an open tab, a short sleep, then set back: the clock in force is right', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const h = await fresh();
    h.trustServerTime(Date.now(), Date.now()); // confirmed, no correction
    vi.setSystemTime(Date.now() + YEAR); // set a year ahead by mistake: kept, as a sleep would be
    expect(h.nowMs() - Date.now()).toBe(0);
    pass(10 * MIN);
    vi.setSystemTime(Date.now() + 5 * MIN); // a five-minute sleep on a platform that pauses performance.now
    h.nowMs();
    vi.setSystemTime(Date.now() - YEAR - 5 * MIN + 5 * MIN); // set right (true time includes the sleep)
    const t = Date.now();
    expect(Math.abs(h.nowMs() - t)).toBeLessThan(MIN); // FAILS: only the last kept move (the sleep) can be undone
  });
});

describe('a reading in flight while the device clock moves (the data review\'s suspected item: not reproduced)', () => {
  it('a clock right, set back ten minutes while the pull is in flight: the reading taken on the new scale puts it right', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 });
    const h = await fresh();
    h.trustServerTime(Date.now(), Date.now());
    pass(MIN);
    const asked = Date.now() + 0; // the request leaves
    vi.setSystemTime(Date.now() - 10 * MIN); // set back while it is in flight
    pass(2000);
    h.trustServerTime(asked + 1000); // the server's Date, read when the answer is handled (localMs: now, on the new scale)
    expect(Math.abs(h.nowMs() - (T0 + MIN + 2000))).toBeLessThan(2000);
  });
  it('a clock an hour fast, set right while the pull is in flight: one reading, the clock in force right, no second correction', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3600_000 });
    const h = await fresh();
    h.trustServerTime(T0, Date.now());
    const told: number[] = [];
    h.onClockOffsetChange((o) => told.push(o));
    pass(MIN);
    vi.setSystemTime(Date.now() - 3600_000);
    pass(2000);
    h.trustServerTime(T0 + MIN + 1000);
    await settle();
    expect(h.clockOffsetMs()).toBe(0);
    expect(Math.abs(h.nowMs() - (T0 + MIN + 2000))).toBeLessThan(2000);
    expect(told).toEqual([0]);
  });
});
