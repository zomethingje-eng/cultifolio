/**
 * Round seventy, agent R: a freshly loaded tab does not put out of force a correction another tab has confirmed
 * (triage-69 R2; the self-review's D4). A load waits for a reading before a large correction is in force; when that tab
 * then followed any move of the device clock, it wrote the wait into the shared record (`out`), and every other tab took
 * it: a tab holding a confirmed three-day correction was put out of force by a two-hour sleep, which step 3 forbids. Two
 * tabs are two instances of `$core/hlc` over one localStorage, the storage events delivered by hand (r62bl-clock-tabs'
 * harness, the reviewer's zzd-clock-tabs). Each case marked "base" fails on 526ecaf.
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


describe('a short sleep with a confirmed tab and a freshly loaded tab (S-D4)', () => {
  it('base: the confirmed tab keeps the three days in force (step 3)', async () => {
    const SLOW = 3 * DAY;
    const T = Date.UTC(2026, 9, 2, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
    const B = await openTab('B');
    as(B, () => B.h.trustServerTime(T, Date.now()));
    vi.advanceTimersByTime(2 * MIN);
    as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
    expect(as(B, () => B.h.clockOffsetMs())).toBe(SLOW);
    vi.advanceTimersByTime(4 * DAY); // B open four days: a tab opened now waits for its own reading (round seventy, R5)
    const A = await openTab('A');
    queue.splice(0);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0);
    expect(as(B, () => B.h.clockOffsetMs())).toBe(SLOW);
    vi.setSystemTime(Date.now() + 2 * 3600_000); // the laptop sleeps two hours; the monotonic clock paused
    as(B, () => B.h.nowMs());
    as(A, () => A.h.nowMs());
    await settle();
    await deliver([A, B]);
    await settle();
    expect(as(B, () => B.h.clockOffsetMs())).toBe(SLOW);
  });
  it('base: the other order of the two follows', async () => {
    const SLOW = 3 * DAY;
    const T = Date.UTC(2026, 9, 2, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
    const B = await openTab('B');
    as(B, () => B.h.trustServerTime(T, Date.now()));
    vi.advanceTimersByTime(2 * MIN);
    as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
    vi.advanceTimersByTime(4 * DAY); // B open four days: a tab opened now waits for its own reading (round seventy, R5)
    const A = await openTab('A');
    queue.splice(0);
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    as(A, () => A.h.nowMs());
    await settle();
    await deliver([A, B]);
    as(B, () => B.h.nowMs());
    await settle();
    await deliver([A, B]);
    await settle();
    expect(as(B, () => B.h.clockOffsetMs())).toBe(SLOW);
  });
  it('guard: a reading in the confirmed tab brings the loaded tab\'s correction into force', async () => {
    const SLOW = 3 * DAY;
    const T = Date.UTC(2026, 9, 2, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
    const B = await openTab('B');
    as(B, () => B.h.trustServerTime(T, Date.now()));
    vi.advanceTimersByTime(2 * MIN);
    as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
    vi.advanceTimersByTime(4 * DAY); // B open four days: a tab opened now waits for its own reading (round seventy, R5)
    const A = await openTab('A');
    queue.splice(0);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0);
    vi.advanceTimersByTime(5 * MIN);
    as(B, () => B.h.trustServerTime(Date.now() + SLOW, Date.now()));
    await deliver([A, B]);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(SLOW);
  });
  it('guard: a move past the correction in the loaded tab still puts the confirmed tab out of force', async () => {
    const SLOW = 3 * DAY;
    const T = Date.UTC(2026, 9, 2, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
    const B = await openTab('B');
    as(B, () => B.h.trustServerTime(T, Date.now()));
    vi.advanceTimersByTime(2 * MIN);
    as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
    vi.advanceTimersByTime(4 * DAY); // B open four days: a tab opened now waits for its own reading (round seventy, R5)
    const A = await openTab('A');
    queue.splice(0);
    vi.setSystemTime(Date.now() + SLOW + 2 * 3600_000); // perhaps the clock set right during a sleep
    as(A, () => A.h.nowMs());
    await settle();
    await deliver([A, B]);
    expect(as(B, () => B.h.clockOffsetMs())).toBe(0);
  });
  it('base: a newly opened tab\'s first disagreeing reading does not take the confirmed tab out of force (R47-14, scenario 4)', async () => {
    const SLOW = 3 * DAY;
    const T = Date.UTC(2026, 9, 2, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T - SLOW });
    const B = await openTab('B');
    as(B, () => B.h.trustServerTime(T, Date.now()));
    vi.advanceTimersByTime(2 * MIN);
    as(B, () => B.h.trustServerTime(T + 2 * MIN, Date.now()));
    vi.advanceTimersByTime(4 * DAY); // B stays open; the next tab loads four days on, so it waits
    const A = await openTab('A');
    queue.splice(0);
    expect(as(A, () => A.h.clockOffsetMs())).toBe(0);
    as(A, () => A.h.trustServerTime(Date.now() + 10 * DAY, Date.now())); // one wrong reading
    await settle();
    await deliver([A, B]);
    expect(as(B, () => B.h.clockOffsetMs())).toBe(SLOW);
  });
});
