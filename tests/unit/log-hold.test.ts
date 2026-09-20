/**
 * The fold's clock: a change stamped too far ahead of it is held, not applied,
 * and returned; without a clock (the default) everything is applied as before.
 */
import { describe, it, expect } from 'vitest';
import { apply, isHeld, dueAt, hlcWall, type Change, type State } from '$core/log';
import { hlcEncode, MAX_AHEAD_MS } from '$core/hlc';

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
