/**
 * Clock review of round sixty-one: the correction's lapse within a tab (hlc.ts `lapse`, `overtaken`).
 *
 * FAILS on f4ab4f8 (both tests are reproductions). Run: npx vitest run tests/unit/clock--lapse.test.ts
 *
 *  1. (Finding 4.) Sleep on a platform whose monotonic clock pauses (Chrome on macOS, among others): the device clock moves on by the
 *     length of the sleep and `performance.now()` does not, so the monotonic rule reads a moved clock and drops the
 *     correction. A device three days fast that syncs (corrected, confirmed) stamps its first edits after waking three
 *     days ahead until two readings a minute apart confirm it again, and those edits are parked by their arrival on
 *     every device, the writer included.
 *  2. (Finding 5.) A correction for a clock more than five minutes slow lapses once the device clock reaches the reading's server
 *     time, that is, as soon as that much time has passed without a reading, though the clock never moved. Each lapse and
 *     each re-confirmation tells the listeners (the engine refolds the whole log for each).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { trustServerTime, clockOffsetMs, clockChecked, nowMs, onClockOffsetChange, _resetClockOffset, Clock } from '$core/hlc';
import { isParked, hlcWall } from '$core/log';

const DAY = 86_400_000;
afterEach(() => { vi.useRealTimers(); _resetClockOffset(); });

describe('the correction across a sleep', () => {
  it('a device three days fast, corrected, sleeps an hour with the monotonic clock paused: its next stamp is still right', () => {
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 + 3 * DAY }); // the device clock is three days fast
    trustServerTime(T0, Date.now());
    vi.advanceTimersByTime(70_000); // both clocks move together
    trustServerTime(T0 + 70_000, Date.now()); // the second reading: the correction is taken
    expect(Math.round(clockOffsetMs() / DAY)).toBe(-3);
    expect(clockChecked()).toBe(true);
    // An hour asleep: the wall clock moves on, the monotonic clock does not (setSystemTime leaves performance.now alone).
    const perf0 = performance.now();
    vi.setSystemTime(Date.now() + 3600_000);
    expect(performance.now()).toBe(perf0);
    const trueNow = T0 + 70_000 + 3600_000;
    const t = new Clock('aaaaaaaaaaaa0000').tick();
    // The stamp the grower's first edit after waking gets, against the server's time.
    expect(Math.round((hlcWall(t) - trueNow) / DAY)).toBe(0);
    // and so it is not parked when its batch arrives now
    expect(isParked(t, { now: trueNow, arrival: trueNow })).toBe(false);
  });
});

describe('a slow clock\'s correction, with no clock moved', () => {
  it('a device ten minutes slow, away half an hour between syncs eight times: the clock in force never flips', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: Date.UTC(2026, 9, 4, 12, 0, 0) });
    const told: number[] = [];
    const off = onClockOffsetChange((o) => told.push(o));
    trustServerTime(Date.now() + 10 * 60_000, Date.now());
    const first = told.length; // the first confirmation is told, rightly
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(30 * 60_000); // no clock moved: both advance together
      nowMs(); // anything that stamps or folds
      await Promise.resolve();
      trustServerTime(Date.now() + 10 * 60_000, Date.now()); // the server says the same ten minutes
    }
    off();
    expect(told.length - first).toBe(0);
  });
});
