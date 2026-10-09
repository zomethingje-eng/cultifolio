/**
 * Round sixty-two (agent L), decision 5: the correction is never lapsed by time passing (the clock review's 4 and 5, the
 * outside reviews' A17 and B9). Within a tab the device clock is read against the monotonic clock: a move back is
 * followed, a move forward by about a positive correction is a slow clock set right and is followed too, any other move
 * forward (a sleep that paused `performance.now`, or the clock set forward) keeps the correction; either way it is
 * unconfirmed and a reading is asked for at once. Across a reload the stored correction is kept, unconfirmed. A reading
 * that agrees confirms with no refold; one that disagrees replaces it, told once.
 *
 * Also the counter (the harness review's 7, A32): a clock never ticks onto the mark by counting on from a peer's counter.
 * Adopted from docs/review-61/tests/clock--lapse.test.ts (both reproductions, as they were), clock--guards.test.ts (the
 * M9, M12 and M2/M4 guards as they were; M11 and M13 inverted: a correction is no longer dropped at load for being
 * "overtaken") and harness--counter-reaches-flag.test.ts. Each reproduction failed on the round-sixty-one base.
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

describe('time passing never lapses a correction (B9, A17, the clock review\'s 5)', () => {
  it('six minutes slow, corrected at 23:59 true time: at 00:05 the local date is the new day', async () => {
    const trueAt = new Date(2026, 9, 4, 23, 59, 0).getTime(); // local time, as the date is read
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: trueAt - 6 * MIN });
    const h = await fresh();
    const { localDate } = await import('$core/dates');
    h.trustServerTime(trueAt, Date.now());
    expect(h.clockOffsetMs()).toBe(6 * MIN);
    pass(6 * MIN);
    expect(h.clockOffsetMs()).toBe(6 * MIN);
    expect(h.clockChecked()).toBe(true);
    expect(localDate()).toBe('2026-10-05');
  });
  it('an hour slow, 61 minutes with no reading: still corrected by the hour, and still confirmed', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const h = await fresh();
    h.trustServerTime(Date.now() + 3600_000, Date.now());
    pass(61 * MIN);
    expect(h.clockOffsetMs()).toBe(3600_000);
    expect(h.clockChecked()).toBe(true);
    expect(h.nowMs() - Date.now()).toBe(3600_000);
  });
  it('(clock--lapse 2) ten minutes slow, away half an hour between syncs eight times: the listeners are never told', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const h = await fresh();
    const told: number[] = [];
    h.trustServerTime(Date.now() + 10 * MIN, Date.now());
    const off = h.onClockOffsetChange((o) => told.push(o));
    for (let i = 0; i < 8; i++) {
      pass(30 * MIN);
      h.nowMs();
      await settle();
      h.trustServerTime(Date.now() + 10 * MIN, Date.now()); // the server says the same ten minutes: it confirms, with no refold
    }
    off();
    expect(told).toEqual([]);
  });
});

describe('a sleep that pauses the monotonic clock (the clock review\'s 4)', () => {
  it('(clock--lapse 1) three days fast, corrected, an hour asleep: the next stamp is still right, and a reading is asked for', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY });
    const h = await fresh();
    const { isParked, hlcWall } = await import('$core/log');
    h.trustServerTime(T0, Date.now());
    pass(70_000);
    h.trustServerTime(T0 + 70_000, Date.now());
    expect(Math.round(h.clockOffsetMs() / DAY)).toBe(-3);
    let wanted = 0;
    h.onReadingWanted(() => wanted++);
    const perf0 = performance.now();
    vi.setSystemTime(Date.now() + 3600_000); // asleep: the wall clock moves on, the monotonic clock does not
    expect(performance.now()).toBe(perf0);
    const trueNow = T0 + 70_000 + 3600_000;
    const t = new h.Clock('aaaaaaaaaaaa0000').tick();
    expect(Math.round((hlcWall(t) - trueNow) / MIN)).toBe(0);
    expect(isParked(t, { now: trueNow, arrival: trueNow })).toBe(false);
    expect(h.clockUnsure()).toBe(true);
    await settle();
    expect(wanted).toBe(1);
  });
  it('a two-minute sleep: the correction is kept, unconfirmed; the next reading agrees and confirms it with no refold', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY });
    const h = await fresh();
    h.trustServerTime(T0, Date.now());
    pass(70_000);
    h.trustServerTime(T0 + 70_000, Date.now());
    const told: number[] = [];
    h.onClockOffsetChange((o) => told.push(o));
    vi.setSystemTime(Date.now() + 2 * MIN); // two minutes asleep
    expect(h.nowMs()).toBe(T0 + 70_000 + 2 * MIN);
    expect(h.clockUnsure()).toBe(true);
    expect(h.clockChecked()).toBe(true); // being unconfirmed holds and parks nothing that being confirmed did not
    pass(10_000);
    h.trustServerTime(T0 + 70_000 + 2 * MIN + 10_000, Date.now());
    await settle();
    expect(h.clockUnsure()).toBe(false);
    expect(told).toEqual([]);
  });
});

describe('the clock set right while offline', () => {
  it('a fast clock set back by hand within the tab: the correction follows it, so stamps stay right with no reading, and nothing is told but the offset', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY });
    const h = await fresh();
    h.trustServerTime(T0, Date.now());
    pass(70_000);
    h.trustServerTime(T0 + 70_000, Date.now());
    const told: number[] = [];
    h.onClockOffsetChange((o) => told.push(o));
    pass(MIN);
    vi.setSystemTime(Date.now() - 3 * DAY); // set right, offline: the device clock goes back three days
    expect(h.clockOffsetMs()).toBe(0);
    expect(h.nowMs()).toBe(T0 + 70_000 + MIN);
    expect(h.clockChecked()).toBe(true); // the clock in force never moved: the reading still confirms it
    await settle();
    expect(told).toEqual([0]); // one change of the offset, told once
  });
  it('a slow clock set forward by about its correction within the tab is a clock set right: the correction follows it to nothing', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 - 3 * DAY });
    const h = await fresh();
    h.trustServerTime(T0, Date.now());
    pass(70_000);
    h.trustServerTime(T0 + 70_000, Date.now());
    expect(Math.round(h.clockOffsetMs() / DAY)).toBe(3);
    pass(MIN);
    vi.setSystemTime(Date.now() + 3 * DAY + 10_000); // set right by hand, ten seconds off true
    expect(h.clockOffsetMs()).toBe(0);
    expect(Math.abs(h.nowMs() - (T0 + 70_000 + MIN))).toBeLessThanOrEqual(10_000);
  });
  it('a clock set a year ahead by mistake and put back before any reading: the move back undoes the move forward, and the correction is as it was', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const h = await fresh();
    h.trustServerTime(Date.now(), Date.now()); // confirmed, right
    pass(MIN);
    vi.setSystemTime(Date.now() + 365 * DAY);
    expect(h.clockOffsetMs()).toBe(0); // kept: a sleep or a clock set forward, a reading is asked for
    pass(MIN);
    vi.setSystemTime(Date.now() - 365 * DAY);
    expect(h.clockOffsetMs()).toBe(0);
    expect(h.nowMs()).toBe(Date.UTC(2026, 9, 4, 12, 2, 0));
  });
  it('a clock nudged by under half a minute is not a move: nothing changes and nothing is asked', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const h = await fresh();
    h.trustServerTime(Date.now() + 10 * MIN, Date.now());
    vi.setSystemTime(Date.now() - 20_000);
    expect(h.clockOffsetMs()).toBe(10 * MIN);
    expect(h.clockUnsure()).toBe(false);
  });
});

describe('across a reload', () => {
  it('the stored correction is kept, however old, unconfirmed; a week-old one no longer counts as confirmed', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * MIN, confirmedAt: now - 20 * MIN, serverAt: now - 10 * MIN }));
    let h = await fresh();
    expect(h.clockOffsetMs()).toBe(10 * MIN);
    expect(h.clockChecked()).toBe(true);
    expect(h.clockUnsure()).toBe(true);
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * MIN, confirmedAt: now - 8 * DAY }));
    h = await fresh();
    expect(h.clockOffsetMs()).toBe(10 * MIN);
    expect(h.clockChecked()).toBe(false);
  });
  it('(clock--guards M13, inverted) an older record without the server time is kept too', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * MIN, confirmedAt: now - 20 * MIN }));
    const h = await fresh();
    expect(h.clockOffsetMs()).toBe(10 * MIN);
  });
  it('a reading dated after the device clock (the clock was set back since) is not used: no correction, unconfirmed', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: -3 * DAY, confirmedAt: now + 3 * DAY }));
    const h = await fresh();
    expect(h.clockOffsetMs()).toBe(0);
    expect(h.clockChecked()).toBe(false);
    expect(store.has(OFFSET_KEY)).toBe(false);
  });
  it('(clock--guards M12) a pending reading dated after the clock is dropped at load', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(PENDING_KEY, JSON.stringify({ delta: 3 * DAY, at: now + DAY }));
    await fresh();
    expect(store.has(PENDING_KEY)).toBe(false);
  });
  it('the first reading after the load: one that agrees confirms with no refold; one that disagrees replaces the offset, told once', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * MIN, confirmedAt: now - 20 * MIN, serverAt: now - 10 * MIN }));
    let h = await fresh();
    let told: number[] = [];
    h.onClockOffsetChange((o) => told.push(o));
    h.trustServerTime(Date.now() + 10 * MIN + 5000, Date.now());
    expect([h.clockOffsetMs(), h.clockUnsure(), told]).toEqual([10 * MIN, false, []]);
    h = await fresh();
    told = [];
    h.onClockOffsetChange((o) => told.push(o));
    h.trustServerTime(Date.now() + 20 * MIN, Date.now());
    expect([h.clockOffsetMs(), h.clockUnsure(), told]).toEqual([20 * MIN, false, [20 * MIN]]);
  });
});

describe('(clock--guards) the guards that stand', () => {
  it('(M9) the listeners hear a change of the offset the tab follows', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY });
    const hlc = await fresh();
    hlc.trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(70_000);
    hlc.trustServerTime(T0 + 70_000, Date.now());
    const told: number[] = [];
    hlc.onClockOffsetChange((o) => told.push(o));
    vi.setSystemTime(T0 + 80_000); // set right: the device clock jumps back, the monotonic clock does not
    hlc.nowMs();
    await settle();
    expect(told).toEqual([0]);
  });
  it('(M2, M4) a stamp placed past a full counter keeps the mark, and is neither held nor parked', async () => {
    const hlc = await fresh();
    const { isParked, isHeld } = await import('$core/log');
    const now = Date.now();
    const top = hlc.hlcEncode({ wall: now + 365 * DAY, count: hlc.MAX_COUNT, device: 'bbbbbbbbbbbb0000' });
    const past = hlc.hlcPast(top, 'aaaaaaaaaaaa0000');
    expect(hlc.isPastStamp(past)).toBe(true);
    expect(isParked(past, { now, arrival: now })).toBe(false);
    expect(isHeld(past, { now })).toBe(false);
    expect(hlc.isPastStamp(hlc.hlcAfter(top, 'cccccccccccc0000'))).toBe(true);
  });
});

describe('a clock never counts onto the mark (the harness review\'s 7, A32)', () => {
  it('a clock that follows a peer\'s unmarked counter one short of the mark never ticks a marked stamp of its own', async () => {
    const { Clock, hlcEncode, isPastStamp, PAST_BIT, hlcCompare } = await fresh();
    let now = 1_900_000_000_000;
    const clock = new Clock('aaaaaaaaaaaaz9z9', () => now);
    const peer = hlcEncode({ wall: now + 60_000, count: PAST_BIT - 1, device: 'bbbbbbbbbbbbq0q0' });
    expect(isPastStamp(peer)).toBe(false);
    clock.observe(peer);
    now += 1_000;
    const own = clock.tick();
    expect(isPastStamp(own)).toBe(false);
    expect(hlcCompare(own, peer)).toBe(1);
  });
  it('a collision bump of an unmarked stamp never lands on the mark, and still sorts after it', async () => {
    const { hlcAfter, hlcEncode, isPastStamp, PAST_BIT, hlcCompare } = await fresh();
    const plain = hlcEncode({ wall: 1_900_000_000_000, count: PAST_BIT - 1, device: 'aaaaaaaaaaaaz9z9' });
    const next = hlcAfter(plain, 'aaaaaaaaaaaaz9z9');
    expect(isPastStamp(next)).toBe(false);
    expect(hlcCompare(next, plain)).toBe(1);
  });
});
