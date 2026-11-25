/**
 * Round 120 (MYPLANTS 28): "looked at, left dry" and "you have watered it about every N days", by the hand-off's figures.
 *
 * - A plant left dry on a 14-day rhythm is next listed after 7 days; on a 4-day rhythm, after 3 (never fewer than three).
 * - The median gap for waterings on 15 October, 25 October, 4 November and 14 November is 10 days; with two gaps, none.
 * - The event is a word older builds fold and show as it is (docs/PLAN-RECORD-FORMAT.md 1): it is in EVENT_LABEL.
 *
 * On 19ec7a8: FAILED (no $core/watering, no `dry` label).
 */
import { describe, it, expect } from 'vitest';
import { dryHold, wateringGap } from '../../src/lib/core/watering';
import { EVENT_LABEL } from '../../src/lib/db/types';

describe('r120a left dry', () => {
  it('half the rhythm, at least three days', () => {
    expect(dryHold(14)).toBe(7);
    expect(dryHold(4)).toBe(3);
    expect(dryHold(21)).toBe(11);
    expect(dryHold(1)).toBe(3);
  });
  it('is a log entry with its own words', () => {
    expect(EVENT_LABEL.dry).toBe('Looked at, left dry');
  });
});

describe('r120a the median gap', () => {
  it('the hand-off\'s four waterings: 10 days', () => {
    expect(wateringGap(['2026-10-15', '2026-10-25', '2026-11-04', '2026-11-14'])).toBe(10);
  });
  it('two gaps: nothing', () => {
    expect(wateringGap(['2026-10-25', '2026-11-04', '2026-11-14'])).toBeNull();
  });
  it('the last six gaps only, a day counted once', () => {
    const d = ['2026-01-01', '2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29', '2026-04-05', '2026-04-12', '2026-04-12'];
    expect(wateringGap(d)).toBe(7);
  });
});
