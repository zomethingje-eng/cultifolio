/**
 * Round seventy-one, agent D: tests for the survivors of the self-review's mutation run in the clock (the self-review's
 * finding 7). Each held a rule of round seventy that no test held:
 *  - MH2, MH5: a tab's wait from its own load is ended by another tab's record only when that tab is in force, never by
 *    one that also waits from its load (`loaded`). Ended on any record, a tab loaded after the clock was set right put
 *    three days in force on the word of another freshly loaded tab, and stamped three days ahead, which parks;
 *  - MH8: a move of the device clock past a positive correction of more than a day (not two) waits for a reading;
 *  - MH7b: a correction of a day and a fifth, set right while closed, waits at the load (the threshold is a day);
 *  - MH3b: a load waits only once the clock has moved the correction, to the half minute, since the reading: one ten
 *    minutes short is a clock still slow, and keeps the correction in force.
 * Two tabs are two instances of `$core/hlc` over one localStorage, the storage events delivered by hand (r70r-clock-tabs'
 * harness). Each case passes on r71base and fails under its mutation (guards).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const DAY = 86_400_000;
const MIN = 60_000;
const OFFSET_KEY = 'cultifolio.clockOffsetMs';
const store = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const hadAdd = (globalThis as { addEventListener?: unknown }).addEventListener;
type Tab = { h: typeof import('$core/hlc'); onStorage: (e: { key: string }) => void; name: string };
let writer = '';
let queue: Array<{ from: string; key: string }> = [];
beforeEach(() => {
  store.clear();
  queue = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { if (store.get(k) !== v) queue.push({ from: writer, key: k }); store.set(k, v); },
      removeItem: (k: string) => { if (store.has(k)) queue.push({ from: writer, key: k }); store.delete(k); }
    }
  });
});
afterEach(() => {
  vi.useRealTimers();
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { addEventListener?: unknown }).addEventListener = hadAdd;
});
async function openTab(name: string): Promise<Tab> {
  vi.resetModules();
  let onStorage: (e: { key: string }) => void = () => {};
  (globalThis as { addEventListener?: unknown }).addEventListener = (type: string, fn: (e: { key: string }) => void) => { if (type === 'storage') onStorage = fn; };
  writer = name;
  const h = await import('$core/hlc');
  return { h, onStorage: (e) => onStorage(e), name };
}
/** Run `fn` as tab `t` (its writes are its own), then deliver the storage events to every other tab, until none are left. */
function as<T>(t: Tab, fn: () => T): T {
  writer = t.name;
  return fn();
}
async function deliver(tabs: Tab[]) {
  for (let round = 0; round < 5 && queue.length; round++) {
    const q = queue.splice(0);
    for (const ev of q) for (const t of tabs) if (t.name !== ev.from) { writer = t.name; t.onStorage({ key: ev.key }); }
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };


const SLOW = 3 * DAY;
const T = Date.UTC(2026, 9, 2, 12, 0, 0);
const HOUR = 3_600_000;
async function confirmed(name: string, offset: number) {
  vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - offset });
  const B = await openTab(name);
  as(B, () => B.h.trustServerTime(T, Date.now()));
  vi.advanceTimersByTime(2 * MIN);
  as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
  queue.splice(0);
  return B;
}

describe('guard (MH2, MH5): a load-wait is not ended by another tab that also waits from its load', () => {
  it('two tabs loaded after the clock was set right: one\'s record leaves the other waiting', async () => {
    await confirmed('B', SLOW);
    vi.setSystemTime(T + 2 * HOUR); // closed; the clock set right meanwhile: it now reads the true time
    const A = await openTab('A');
    const C = await openTab('C');
    queue.splice(0);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0);
    expect(as(C, () => C.h.clockOffsetMs())).toBe(0);
    vi.setSystemTime(Date.now() + HOUR); // a sleep C follows, and writes the record
    as(C, () => C.h.nowMs());
    await settle();
    await deliver([A, C]);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0); // three days in force here would stamp three days ahead
  });
});
describe('guard (MH8): a move past a correction of more than a day waits for a reading', () => {
  it('a day and a half slow, the clock moved a day and three fifths in a sleep', async () => {
    const B = await confirmed('B', 1.5 * DAY);
    expect(as(B, () => B.h.clockOffsetMs())).toBe(1.5 * DAY);
    vi.setSystemTime(Date.now() + 1.6 * DAY); // the monotonic clock paused: perhaps the clock set right during the sleep
    as(B, () => B.h.nowMs());
    expect(as(B, () => B.h.clockOffsetMs())).toBe(0);
  });
});
describe('guard (MH7b): a correction of a day and a fifth set right while closed waits at the load', () => {
  it('reloaded an hour after the clock was put right', async () => {
    await confirmed('B', 1.2 * DAY);
    vi.setSystemTime(T + HOUR);
    const A = await openTab('A');
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0);
  });
});
describe('guard (MH3b): a load ten minutes short of the correction keeps it in force', () => {
  it('three days slow, reloaded when the clock has moved three days less ten minutes since the reading', async () => {
    await confirmed('B', SLOW);
    vi.setSystemTime(T + 2 * MIN - SLOW + SLOW - 10 * MIN); // the device clock: the reading's time plus three days less ten minutes
    const A = await openTab('A');
    expect(as(A, () => A.h.clockOffsetMs())).toBe(SLOW);
  });
});
