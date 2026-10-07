/**
 * Round sixty-one (agent L), decision 1: the stamp made past another and the correction's lapse, as rules.
 *  - `hlcPast` flags a stamp made past a field's stamp; the hold and the park never take a flagged stamp, with or without
 *    an arrival; a clock that observes a flagged stamp does not carry the flag into its own ticks.
 *  - A first reading that disagrees with the clock in force by more than two days unconfirms it (the clock review's 7).
 *  - Within a tab, a correction lapses when the device clock moves against the monotonic one; a correction of five
 *    minutes or less does not lapse when overtaken, so a device a minute slow does not flap.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { hlcEncode, hlcDecode, hlcPast, hlcAfter, hlcCompare, isPastStamp, PAST_BIT, MAX_COUNT, Clock, trustServerTime, clockChecked, clockOffsetMs, nowMs, onClockOffsetChange, _resetClockOffset } from '$core/hlc';
import { isParked, isHeld, PARK_MS } from '$core/log';

const DAY = 86_400_000;
afterEach(() => { vi.useRealTimers(); _resetClockOffset(); });

describe('a stamp made past another (hlcPast)', () => {
  const far = hlcEncode({ wall: Date.now() + 365 * DAY, count: 3, device: 'bbbbbbbbbbbbq0q0' });
  it('sorts just after the stamp it was made past, carries the flag, and keeps it when bumped again', () => {
    const p = hlcPast(far, 'aaaaaaaaaaaaz9z9');
    expect(hlcCompare(p, far)).toBe(1);
    expect(isPastStamp(p)).toBe(true);
    expect(isPastStamp(far)).toBe(false);
    expect(hlcDecode(p).wall).toBe(hlcDecode(far).wall);
    expect(hlcDecode(p).count).toBe(PAST_BIT | 4);
    const q = hlcPast(p, 'cccccccccccc0000'); // past a flagged stamp: still flagged, still after it
    expect(hlcCompare(q, p)).toBe(1);
    expect(isPastStamp(q)).toBe(true);
    expect(isPastStamp(hlcAfter(p, 'cccccccccccc0000'))).toBe(true); // a collision bump keeps the flag
    expect(isPastStamp(hlcAfter(far, 'cccccccccccc0000'))).toBe(false); // and does not add one
    const top = hlcEncode({ wall: 5, count: MAX_COUNT, device: 'd' });
    expect(hlcDecode(hlcPast(top, 'd'))).toEqual({ wall: 6, count: PAST_BIT, device: 'd' });
  });
  it('is never parked or held, by arrival or by clock; the same stamp unflagged is', () => {
    const now = Date.now();
    const unflagged = hlcEncode({ wall: now + 365 * DAY, count: 4, device: 'aaaaaaaaaaaaz9z9' });
    const flagged = hlcPast(far, 'aaaaaaaaaaaaz9z9');
    for (const hold of [{ now, arrival: now }, { now, clockChecked: true }, { now }]) {
      expect(isParked(flagged, hold)).toBe(false);
      expect(isHeld(flagged, hold)).toBe(false);
    }
    expect(isParked(unflagged, { now, arrival: now })).toBe(true);
    expect(isHeld(unflagged, { now })).toBe(true);
    // a stamp parked before (a stored verdict) stays parked, flagged or not
    expect(isParked(flagged, { now, parked: new Set([flagged]) })).toBe(true);
    expect(hlcDecode(flagged).wall - now).toBeGreaterThan(PARK_MS);
  });
  it('a clock that observes a flagged stamp at its own time ticks on unflagged, and after it', () => {
    const now = 1_790_000_000_000;
    const clock = new Clock('aaaaaaaaaaaa', () => now);
    const seen = hlcPast(hlcEncode({ wall: now, count: 0, device: 'bbbbbbbbbbbb' }), 'bbbbbbbbbbbb');
    clock.observe(seen);
    const next = clock.tick();
    expect(isPastStamp(next)).toBe(false);
    expect(hlcCompare(next, seen)).toBe(1);
  });
});

describe('the correction lapses when it no longer describes the clock (the clock review\'s 7)', () => {
  it('a first reading that disagrees with the clock in force by more than two days unconfirms it, and says so to the listeners', () => {
    const local = Date.now();
    trustServerTime(local + 1000, local); // agrees: the clock is confirmed
    expect(clockChecked()).toBe(true);
    const told: number[] = [];
    const off = onClockOffsetChange((o) => told.push(o));
    trustServerTime(local - 3 * DAY, local + 5000); // a first reading three days off: waits for a second, and no longer counts as confirmed
    off();
    expect(clockChecked()).toBe(false);
    expect(clockOffsetMs()).toBe(0);
    expect(told).toEqual([0]);
  });
  it('a first reading that differs from a large correction in force by less than two days does not unconfirm it', () => {
    const local = Date.now();
    trustServerTime(local + 10 * DAY, local);
    trustServerTime(local + 10 * DAY + 70_000, local + 70_000); // the second reading: taken
    expect(Math.round(clockOffsetMs() / DAY)).toBe(10);
    trustServerTime(local + 11 * DAY + 140_000, local + 140_000); // a day further off: pending, still confirmed
    expect(clockChecked()).toBe(true);
  });
  it('within a tab: a fast clock set back by hand drops a negative correction at once (the monotonic clock says the device clock moved)', () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 3 * DAY);
    trustServerTime(T0, Date.now());
    vi.setSystemTime(T0 + 3 * DAY + 70_000);
    trustServerTime(T0 + 70_000, Date.now());
    expect(Math.round(clockOffsetMs() / DAY)).toBe(-3);
    vi.setSystemTime(T0 + 80_000); // set right: the device clock jumps back three days, the monotonic clock does not
    expect(nowMs() - (T0 + 80_000)).toBeLessThan(60_000); // stamped by the device's own, right, clock
    expect(clockOffsetMs()).toBe(0);
    expect(clockChecked()).toBe(false);
  });
  it('a positive correction lapses once the device clock reaches the reading\'s server time; one of five minutes or less does not, so a device a minute slow does not flap', () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date', 'performance'], now: T0 - 60_000 }); // the monotonic clock moves with the device clock here: no drift
    trustServerTime(T0, Date.now());
    expect(clockOffsetMs()).toBe(60_000);
    vi.advanceTimersByTime(3 * 60_000); // the device clock is past the reading's server time
    expect(clockOffsetMs()).toBe(60_000);
    expect(clockChecked()).toBe(true);
    _resetClockOffset();
    trustServerTime(Date.now() + 10 * 60_000, Date.now()); // ten minutes slow
    expect(clockOffsetMs()).toBe(10 * 60_000);
    vi.advanceTimersByTime(9 * 60_000);
    expect(clockOffsetMs()).toBe(10 * 60_000); // not yet reached
    vi.advanceTimersByTime(2 * 60_000);
    expect(clockOffsetMs()).toBe(0); // reached: the correction no longer describes this clock, and a new reading is due
    expect(clockChecked()).toBe(false);
  });
});
