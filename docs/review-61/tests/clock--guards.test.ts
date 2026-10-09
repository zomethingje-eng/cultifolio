/**
 * Clock review of round sixty-one: guards for the round's clock fixes that no test held. Each kills a mutation that
 * survived the round's clock tests (the review's mutation run): the listeners told of a lapse (M9), the stored
 * correction dropped at load once overtaken (M11), a pending reading dated after the clock dropped (M12), an older
 * stored record read with its server time inferred (M13), a stamp placed past a full counter still marked (M2, M4).
 *
 * PASSES on f4ab4f8. Run: npx vitest run tests/unit/clock--guards.test.ts
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const DAY = 86_400_000;
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

describe('the lapse is told, so the fold is judged again (M9)', () => {
  it('a fast clock set right by hand within the tab: the listeners hear the correction go', async () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY });
    const hlc = await fresh();
    hlc.trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(70_000);
    hlc.trustServerTime(T0 + 70_000, Date.now());
    expect(Math.round(hlc.clockOffsetMs() / DAY)).toBe(-3);
    const told: number[] = [];
    hlc.onClockOffsetChange((o) => told.push(o));
    vi.setSystemTime(T0 + 80_000); // set right: the device clock jumps back, the monotonic clock does not
    hlc.nowMs();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(told).toEqual([0]);
  });
});

describe('the stored correction at load (M11, M12, M13)', () => {
  it('a correction for a clock ten minutes slow, overtaken since the reading, is not taken at load and leaves storage', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * 60_000, confirmedAt: now - 20 * 60_000, serverAt: now - 10 * 60_000 }));
    const hlc = await fresh();
    expect(hlc.clockOffsetMs()).toBe(0);
    expect(store.has(OFFSET_KEY)).toBe(false);
  });
  it('an older record without the server time is read as confirmedAt + offset, and lapses the same way', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * 60_000, confirmedAt: now - 20 * 60_000 }));
    const hlc = await fresh();
    expect(hlc.clockOffsetMs()).toBe(0);
    store.set(OFFSET_KEY, JSON.stringify({ offset: 10 * 60_000, confirmedAt: now - 5 * 60_000 })); // not yet overtaken: kept
    const again = await fresh();
    expect(again.clockOffsetMs()).toBe(10 * 60_000);
  });
  it('a pending reading dated after the clock (the clock was set back since) is dropped at load', async () => {
    const now = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now });
    store.set(PENDING_KEY, JSON.stringify({ delta: 3 * DAY, at: now + DAY }));
    await fresh();
    expect(store.has(PENDING_KEY)).toBe(false);
  });
});

describe('a stamp placed past a full counter (M2, M4)', () => {
  it('keeps the mark, and is neither held nor parked', async () => {
    const hlc = await fresh();
    const { isParked, isHeld } = await import('$core/log');
    const now = Date.now();
    const top = hlc.hlcEncode({ wall: now + 365 * DAY, count: hlc.MAX_COUNT, device: 'bbbbbbbbbbbb0000' });
    const past = hlc.hlcPast(top, 'aaaaaaaaaaaa0000');
    expect(hlc.isPastStamp(past)).toBe(true);
    expect(isParked(past, { now, arrival: now })).toBe(false);
    expect(isHeld(past, { now })).toBe(false);
    const markedTop = hlc.hlcEncode({ wall: now + 365 * DAY, count: hlc.MAX_COUNT, device: 'bbbbbbbbbbbb0000' });
    expect(hlc.isPastStamp(hlc.hlcAfter(markedTop, 'cccccccccccc0000'))).toBe(true); // a collision bump past a full marked counter stays marked
  });
});
