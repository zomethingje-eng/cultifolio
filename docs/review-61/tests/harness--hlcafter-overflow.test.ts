/**
 * Harness review of round sixty-one, mutation C5: `hlcAfter` keeps a stamp's "made past another" flag when the counter
 * overflows into the next millisecond (`count: p.count >= PAST_BIT ? PAST_BIT : 0`). Reverting that to `count: 0` passed
 * every clock test (r61l-clock-*, r61l-engine, collection-store, log-hold, clock-park, r60-clock-review, rule5, ...):
 * r61l-clock-rules checks the flag on a bump and on hlcPast's own overflow, never on hlcAfter's.
 *
 * Why it matters: the store bumps a stamp with hlcAfter when two changes of one commit collide (collection.svelte.ts,
 * `while (given.has(c.t) || this.applied.has(c.t)) c.t = hlcAfter(c.t, this.writer)`). A flagged stamp that lost its flag
 * there would be judged as a clock running ahead: held, or parked by its arrival, on every device.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Run: copy to tests/unit/ and
 * `npx vitest run tests/unit/harness--hlcafter-overflow.test.ts`.
 */
import { it, expect } from 'vitest';
import { hlcAfter, hlcCompare, hlcDecode, hlcEncode, isPastStamp, MAX_COUNT, PAST_BIT } from '$core/hlc';

it('hlcAfter at the top of the counter moves to the next millisecond and keeps the flag of a flagged stamp', () => {
  const flaggedTop = hlcEncode({ wall: 1_900_000_000_000, count: MAX_COUNT, device: 'aaaaaaaaaaaaz9z9' });
  expect(isPastStamp(flaggedTop)).toBe(true); // 0xffffff carries the bit
  const next = hlcAfter(flaggedTop, 'aaaaaaaaaaaaz9z9');
  expect(hlcCompare(next, flaggedTop)).toBe(1);
  expect(hlcDecode(next)).toEqual({ wall: 1_900_000_000_001, count: PAST_BIT, device: 'aaaaaaaaaaaaz9z9' });
  expect(isPastStamp(next)).toBe(true);
});
