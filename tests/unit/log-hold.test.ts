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
  it('a device years ahead stamps by the server\'s time once it has synced, and its holds are judged by it', () => {
    const local = NOW + 6 * 365 * 86_400_000; // the phone says 2031
    expect(trustServerTime(NOW, local)).toBe(NOW - local);
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
});
