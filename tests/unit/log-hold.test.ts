/**
 * The fold's clock: a change stamped too far ahead of it is held, not applied,
 * and returned; without a clock (the default) everything is applied as before.
 */
import { describe, it, expect } from 'vitest';
import { apply, isHeld, dueAt, hlcWall, type Change, type State } from '$core/log';
import { hlcEncode, hlcDecode, MAX_AHEAD_MS, Clock, nowMs, trustServerTime, clockOffsetMs, TRUST_SERVER_PAST_MS, _resetClockOffset } from '$core/hlc';
import { afterEach } from 'vitest';

const NOW = 1_800_000_000_000;
const at = (offset: number, device = 'peer', count = 0) => hlcEncode({ wall: NOW + offset, count, device });
const c = (t: string, value: unknown, field = 'notes'): Change => ({ t, kind: 'accession', id: 'r1', field, value });

describe('apply() with a hold', () => {
  it('holds a change stamped more than MAX_AHEAD_MS ahead, applies one inside the margin, and returns the held ones', () => {
    const state: State = new Map();
    const held = apply(state, [c(at(0), 'now'), c(at(MAX_AHEAD_MS), 'edge'), c(at(MAX_AHEAD_MS + 1), 'ahead')], undefined, { now: NOW });
    expect(state.get('accession:r1')?.notes).toBe('edge');
    expect(held.map((h) => h.value)).toEqual(['ahead']);
  });
  it('without a hold everything is applied and nothing is returned (the old behaviour)', () => {
    const state: State = new Map();
    expect(apply(state, [c(at(0), 'now'), c(at(86_400_000), 'ahead')])).toEqual([]);
    expect(state.get('accession:r1')?.notes).toBe('ahead');
  });
  it('never holds this device\'s own changes: its screen shows its own edits even when its clock has jumped back', () => {
    const state: State = new Map();
    const held = apply(state, [c(at(86_400_000, 'me'), 'mine'), c(at(86_400_000, 'peer'), 'theirs')], undefined, { now: NOW, except: 'me' });
    expect(state.get('accession:r1')?.notes).toBe('mine');
    expect(held.map((h) => h.value)).toEqual(['theirs']);
  });
  it('a held change is not in `seen`, so it applies cleanly when it comes due and then wins by HLC', () => {
    const state: State = new Map();
    const seen = new Map<string, string>();
    const ahead = c(at(3_600_000), 'future');
    apply(state, [c(at(0), 'now'), ahead], seen, { now: NOW });
    apply(state, [c(at(1000), 'later')], seen, { now: NOW + 1000 });
    expect(state.get('accession:r1')?.notes).toBe('later');
    expect(apply(state, [ahead], seen, { now: dueAt(ahead.t) })).toEqual([]);
    expect(state.get('accession:r1')?.notes).toBe('future');
  });
  it('a held delete does not tombstone the record until due', () => {
    const state: State = new Map();
    const seen = new Map<string, string>();
    apply(state, [c(at(0), 'x')], seen, { now: NOW });
    const held = apply(state, [c(at(3_600_000), true, '_deleted')], seen, { now: NOW });
    expect(held).toHaveLength(1);
    expect(state.get('accession:r1')?._deleted).toBe(false);
  });
  it('isHeld, dueAt and hlcWall agree with the fold', () => {
    const t = at(3_600_000);
    expect(hlcWall(t)).toBe(NOW + 3_600_000);
    expect(isHeld(t, { now: NOW })).toBe(true);
    expect(isHeld(t, { now: dueAt(t) })).toBe(false);
    expect(isHeld(t, { now: dueAt(t) - 1 })).toBe(true);
    expect(isHeld(t, { now: NOW, except: 'peer' })).toBe(false);
    expect(dueAt(t)).toBe(NOW + 3_600_000 - MAX_AHEAD_MS);
  });
});

describe('the clock holds are judged by follows the server past half a minute of disagreement (round forty-nine, 1)', () => {
  afterEach(() => _resetClockOffset());
  it('a device years ahead stamps by the server\'s time once two readings agree, and its holds are judged by it', () => {
    const local = NOW + 6 * 365 * 86_400_000; // the phone says 2031
    expect(trustServerTime(NOW, local)).toBe(0); // a correction of days or more waits for a second reading (round fifty-one, 1)
    expect(trustServerTime(NOW + 1_000, local + 1_000)).toBe(NOW - local);
    expect(nowMs() + (local - Date.now())).toBeCloseTo(NOW, -3); // nowMs is the real clock plus the offset: the real clock stands in for `local` here
    const clock = new Clock('me'); // the default `now` is the corrected one
    expect(hlcDecode(clock.tick()).wall).toBeLessThan(Date.now() + MAX_AHEAD_MS);
    expect(clockOffsetMs()).toBe(NOW - local);
  });
  it('a disagreement under the threshold leaves the device clock alone, and a return to agreement drops the offset', () => {
    expect(trustServerTime(NOW, NOW - TRUST_SERVER_PAST_MS)).toBe(0);
    trustServerTime(NOW, NOW - 86_400_000);
    expect(clockOffsetMs()).toBe(86_400_000);
    expect(trustServerTime(NOW, NOW + 5_000)).toBe(0);
    expect(trustServerTime(NaN, NOW)).toBe(0); // a missing Date header changes nothing
  });
  it('round fifty-one, 1: a correction holds at the edge instead of flapping, a lone reading of days does not move the clock, and the correction is kept for the next load', () => {
    // A stand-in for the browser's storage: a Node with a `localStorage` global of its own (newer Nodes, behind a flag) must not be written to, so the property is replaced for this test and put back after (the round-forty-nine lesson about browser globals that differ between Nodes).
    const store = new Map<string, string>();
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } });
    try {
    // 31 s off: taken; 29 s off next time: kept (not dropped at the threshold); 14 s: dropped
    expect(trustServerTime(NOW, NOW - 31_000)).toBe(31_000);
    expect(trustServerTime(NOW, NOW - 29_000)).toBe(31_000);
    expect(trustServerTime(NOW, NOW - 14_000)).toBe(0);
    // one reading of a 3-day disagreement (a captive portal's Date) moves nothing; two that agree do
    expect(trustServerTime(NOW, NOW - 3 * 86_400_000)).toBe(0);
    expect(trustServerTime(NOW, NOW - 10 * 86_400_000)).toBe(0); // a different lone reading replaces the pending one
    expect(trustServerTime(NOW + 5_000, NOW + 5_000 - 10 * 86_400_000)).toBe(10 * 86_400_000);
    expect(store.get('cultifolio.clockOffsetMs')).toBe(String(10 * 86_400_000));
    _resetClockOffset();
    expect(store.has('cultifolio.clockOffsetMs')).toBe(false);
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it('round fifty-one, 1: event dates come from the corrected clock, not the device\'s', async () => {
    const { localDate } = await import('$core/dates');
    const before = localDate();
    trustServerTime(NOW - 400 * 86_400_000, NOW); // the server says the device is 400 days fast
    trustServerTime(NOW - 400 * 86_400_000 + 2_000, NOW + 2_000); // and says so again
    expect(localDate()).not.toBe(before);
    expect(localDate()).toBe(localDate(new Date(nowMs())));
  });
});
