/**
 * Adopted from reviewer "data", round sixty-two (`data--clock-tabs.test.ts`, its findings 1, 2, 3 and 7), with cases
 * added in the second pass for a negative correction, where the stored record of kept moves decides (agent L). The first
 * case's device is now an hour fast and set right: since the self-review's N1 a move back with no negative correction
 * is kept, not followed, so the reviewer's set-back of a right clock changes nothing to be told.
 * Reviewer "data", round sixty-two: the clock correction across two tabs sharing localStorage, and across a reload after
 * one disagreeing large reading. Two tabs are two instances of `$core/hlc`; the browser's `storage` event is delivered by
 * hand to the other tab after each write, as a browser does (only to the other tabs, only when the value changed).
 * Run: npx vitest run tests/unit/data--clock-tabs.test.ts
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

describe('two tabs, one device clock an hour fast set back an hour', () => {
  it('each tab is told of the new offset once (one refold per tab), and both end on the same clock', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3600_000 });
    const A = await openTab('A');
    as(A, () => A.h.trustServerTime(T0, Date.now())); // an hour fast: the correction is minus an hour, stored
    const B = await openTab('B'); // loads the stored correction
    await deliver([A, B]);
    const toldA: number[] = [], toldB: number[] = [];
    A.h.onClockOffsetChange((o) => toldA.push(o));
    B.h.onClockOffsetChange((o) => toldB.push(o));
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 3600_000); // a time sync, or the grower, sets the device clock back an hour
    as(A, () => A.h.nowMs()); // tab A stamps something first
    await settle();
    await deliver([A, B]); // tab B hears the storage event before it has read the clock itself
    await settle();
    expect(as(A, () => A.h.nowMs())).toBe(as(B, () => B.h.nowMs()));
    expect(as(A, () => A.h.nowMs()) - (T0 + MIN)).toBe(0); // and that clock is right
    expect(toldA).toEqual([0]);
    expect(toldB).toEqual([0]); // was told twice: the handler tells, and the follow inside it told again
  });
});

describe('one disagreeing large reading (an intercepting proxy\'s Date)', () => {
  it('the stored correction is not dropped while this tab keeps it: a reload, or another tab, stays on the same clock', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 - 3 * DAY }); // three days slow
    const A = await openTab('A');
    A.h.trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(70_000);
    A.h.trustServerTime(T0 + 70_000, Date.now());
    expect(Math.round(A.h.clockOffsetMs() / DAY)).toBe(3);
    const stored = () => Math.round((JSON.parse(store.get(OFFSET_KEY) ?? '{}').offset ?? 0) / DAY);
    // Round sixty-seven (triage-66 R2): a positive correction past two days is not in force while unconfirmed, so a tab
    // opened now (unconfirmed until its own reading) stamps by the raw clock, behind, which parks nothing. It is kept.
    const B = await openTab('B');
    expect(B.h.clockOffsetMs()).toBe(0);
    expect(stored()).toBe(3);
    queue = [];
    vi.advanceTimersByTime(MIN);
    as(A, () => A.h.trustServerTime(T0 + 130_000 + 10 * DAY, Date.now())); // one wrong reading, ten days out: waits for a second
    await deliver([A, B]);
    // Every tab and a reload stamp alike (the raw clock, while unconfirmed), and the correction stays stored.
    expect(A.h.clockOffsetMs()).toBe(B.h.clockOffsetMs());
    const C = await openTab('C'); // a reload
    expect(C.h.clockOffsetMs()).toBe(A.h.clockOffsetMs());
    expect(stored()).toBe(3); // round sixty-two: was removed
    // The next run's reading confirms the three days: in force again.
    vi.advanceTimersByTime(2 * MIN);
    as(A, () => A.h.trustServerTime(Date.now() + 3 * DAY, Date.now()));
    expect(Math.round(A.h.clockOffsetMs() / DAY)).toBe(3);
    await deliver([A, B, C]);
    expect(Math.round(B.h.clockOffsetMs() / DAY)).toBe(3);
    expect(Math.round(C.h.clockOffsetMs() / DAY)).toBe(3);
  });
});

describe('a clock set a year ahead by mistake, the page reloaded, then the clock put back (offline)', () => {
  it('the move back undoes the move forward across the reload too, as it does within one tab', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 });
    const A = await openTab('A');
    A.h.trustServerTime(Date.now(), Date.now()); // confirmed right
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() + 365 * DAY); // set a year ahead by mistake
    A.h.nowMs(); // kept: a sleep or a clock set forward
    const R = await openTab('R'); // the page is reloaded (or the browser restarted) before the clock is put back
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 365 * DAY); // put back, still offline
    const trueNow = T0 + 2 * MIN;
    expect(Math.round((R.h.nowMs() - trueNow) / DAY)).toBe(0); // actual: 365, every edit is stamped a year ahead and parked at the next sync
  });
});

describe('a clock set a year ahead by mistake while one tab is open, a second tab opened, then the clock put back', () => {
  it('both tabs end on the right clock', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 });
    const A = await openTab('A');
    as(A, () => A.h.trustServerTime(Date.now(), Date.now()));
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() + 365 * DAY);
    as(A, () => A.h.nowMs()); // tab A keeps the correction across the move (a sleep or a clock set forward)
    await deliver([A]);
    const B = await openTab('B'); // a second tab, opened while the clock is a year ahead
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 365 * DAY); // put back, offline
    as(A, () => A.h.nowMs()); // tab A: the move back undoes the move forward
    as(B, () => B.h.nowMs()); // tab B never saw the move forward: it follows the move back
    await deliver([A, B]);
    const trueNow = T0 + 2 * MIN;
    expect([Math.round((as(A, () => A.h.nowMs()) - trueNow) / DAY), Math.round((as(B, () => B.h.nowMs()) - trueNow) / DAY)]).toEqual([0, 0]); // actual: [365, 365]: tab B follows the move back, and tab A takes B's correction from storage
  });
});

describe('a device an hour fast (correction minus an hour): the kept move forward is shared (second pass)', () => {
  it('set a year ahead in one tab, the page reloaded, then put back offline: the reload undoes it and stays right', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3600_000 });
    const A = await openTab('A');
    A.h.trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() + 365 * DAY);
    A.h.nowMs(); // kept: a sleep or a clock set forward, stored with the correction
    const R = await openTab('R');
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 365 * DAY); // put back to an hour fast, offline
    expect(Math.round((R.h.nowMs() - (T0 + 2 * MIN)) / MIN)).toBe(0); // the move back undoes the kept move: still minus an hour
    const R2 = await openTab('R2'); // and a reload after it
    expect(Math.round((R2.h.nowMs() - (T0 + 2 * MIN)) / MIN)).toBe(0);
  });
  it('two tabs: one keeps the move forward, both undo the move back, the move is counted once', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3600_000 });
    const A = await openTab('A');
    as(A, () => A.h.trustServerTime(T0, Date.now()));
    const B = await openTab('B');
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() + 365 * DAY);
    as(A, () => A.h.nowMs()); // A measures the move and stores it
    await deliver([A, B]); // B takes A's record, and does not measure the move again
    expect(JSON.parse(store.get(OFFSET_KEY) as string).jumped).toBe(365 * DAY);
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 365 * DAY);
    as(B, () => B.h.nowMs()); // B this time
    await deliver([A, B]);
    const trueNow = T0 + 2 * MIN;
    expect([Math.round((as(A, () => A.h.nowMs()) - trueNow) / MIN), Math.round((as(B, () => B.h.nowMs()) - trueNow) / MIN)]).toEqual([0, 0]);
    expect(JSON.parse(store.get(OFFSET_KEY) as string).jumped ?? 0).toBe(0);
  });
  it('a fast clock set right offline is followed, and a move back past it is kept (stamps behind, never ahead)', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3600_000 });
    const A = await openTab('A');
    A.h.trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(MIN);
    vi.setSystemTime(Date.now() - 3 * 3600_000); // set back three hours: one hour puts it right, two more are a mistake
    expect(A.h.clockOffsetMs()).toBe(0);
    expect(A.h.nowMs() - (T0 + MIN)).toBe(-2 * 3600_000); // two hours behind, until a reading
    expect(A.h.clockUnsure()).toBe(true);
  });
});
