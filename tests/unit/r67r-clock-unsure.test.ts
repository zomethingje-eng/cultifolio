/**
 * Round sixty-seven, triage-66 R2 (the outside review's 14): a device three days slow, corrected by two readings, whose
 * clock is set right while the tab is closed. Round sixty-two kept the correction across the load, so every edit made
 * offline was stamped three days ahead, and its arrival parked it on every device, the writer included. While the
 * correction is unconfirmed, a positive one past two days is not in force: the device stamps by its raw clock until the
 * next reading. Each case marked "base" failed on the round-sixty-six base (the stamp was three days ahead).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const DAY = 86_400_000;
const MIN = 60_000;
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
async function fresh() {
  vi.resetModules();
  return import('$core/hlc');
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** A device `slow` behind true time, corrected by two agreeing readings a few minutes apart. */
async function corrected(T: number, slow: number) {
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - slow });
  const h = await fresh();
  h.trustServerTime(T, Date.now());
  vi.advanceTimersByTime(2 * MIN);
  h.trustServerTime(T + 2 * MIN, Date.now());
  expect(h.clockOffsetMs()).toBe(slow);
  expect(h.nowMs() - Date.now()).toBe(slow);
  return h;
}

describe('a slow clock set right while the tab is closed (R2)', () => {
  const T = Date.UTC(2026, 9, 4, 12, 0, 0);
  it('base: after the reload the device stamps by its raw clock, not three days ahead', async () => {
    await corrected(T, 3 * DAY);
    // Closed; the clock is set right (and an hour passes). The next load:
    vi.setSystemTime(T + 3600_000);
    const h = await fresh();
    expect(h.clockUnsure()).toBe(true);
    expect(h.nowMs()).toBe(Date.now());
    const c = new h.Clock('dev1');
    expect(h.hlcDecode(c.tick()).wall).toBe(Date.now());
    // The first reading agrees with the raw clock: the correction is dropped, and stamps stay right.
    h.trustServerTime(Date.now(), Date.now());
    expect(h.clockOffsetMs()).toBe(0);
    expect(h.nowMs()).toBe(Date.now());
  });
  it('still slow after the reload: raw clock until a reading confirms the three days, which comes into force then, told once', async () => {
    await corrected(T, 3 * DAY);
    vi.advanceTimersByTime(3600_000); // closed for an hour, still slow
    const h = await fresh();
    expect(h.nowMs()).toBe(Date.now()); // behind: parks nothing
    const told: number[] = [];
    const off = h.onClockOffsetChange((o) => told.push(o));
    expect(h.trustServerTime(Date.now() + 3 * DAY, Date.now())).toBe(3 * DAY);
    await settle();
    off();
    expect(told).toEqual([3 * DAY]);
    expect(h.clockUnsure()).toBe(false);
    expect(h.nowMs() - Date.now()).toBe(3 * DAY);
  });
  it('a correction of two days or less stays in force while unsure, as before', async () => {
    await corrected(T, 1 * DAY);
    vi.advanceTimersByTime(3600_000);
    const h = await fresh();
    expect(h.clockUnsure()).toBe(true);
    expect(h.nowMs() - Date.now()).toBe(1 * DAY);
  });
  it('a negative correction stays in force while unsure (its errors stamp behind)', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T + 3 * DAY });
    let h = await fresh();
    h.trustServerTime(T, Date.now());
    vi.advanceTimersByTime(2 * MIN);
    h.trustServerTime(T + 2 * MIN, Date.now());
    expect(h.clockOffsetMs()).toBe(-3 * DAY);
    h = await fresh();
    expect(h.nowMs() - Date.now()).toBe(-3 * DAY);
  });
  it('within a tab, a move forward the correction cannot account for takes a large positive correction out of force until a reading', async () => {
    const h = await corrected(T, 3 * DAY);
    const told: number[] = [];
    const off = h.onClockOffsetChange((o) => told.push(o));
    vi.setSystemTime(Date.now() + 10 * DAY); // the device clock moved ten days forward under the tab
    expect(h.nowMs()).toBe(Date.now());
    await settle();
    off();
    expect(told).toEqual([0]);
  });
  it('a stored large correction is kept for the reading to confirm: storage still holds it while unsure', async () => {
    await corrected(T, 3 * DAY);
    const h = await fresh();
    h.nowMs();
    const v = JSON.parse(store.get('cultifolio.clockOffsetMs') ?? '{}');
    expect(v.offset).toBe(3 * DAY);
  });
});
