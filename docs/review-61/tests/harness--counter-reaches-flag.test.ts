/**
 * Harness review of round sixty-one: a clock's own counter can reach the "made past another" bit (0x800000) by counting
 * on from a peer's stamp, so this device's next stamps are flagged and are never held or parked anywhere.
 *
 * `Clock.observe` normalises a flagged remote stamp (count >= PAST_BIT) to the next millisecond, but an unflagged one
 * whose counter is just below the bit (0x7fffff, which the stamp regex allows and no honest build writes) is followed
 * and bumped: `bump(wall, 0x7fffff)` gives 0x800000. Every tick of this device until its clock passes that millisecond
 * counts on from there, each one flagged. A peer that writes such a stamp a few minutes ahead (inside MAX_AHEAD_MS, so
 * it is followed) turns this device's own edits into stamps that escape the hold and the park. The same holds for
 * `hlcAfter` (a collision bump of 0x7fffff gives 0x800000).
 *
 * FAILS on f4ab4f8. The smallest fix: in `observe`, treat any remote counter at or above PAST_BIT - 1 (or above a sane
 * ceiling such as 0xffff, far beyond any real burst) as a stamp to follow from the next millisecond; and in `bump` and
 * `hlcAfter`, never step an unflagged counter onto the bit (move to wall + 1, count 0, instead).
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--counter-reaches-flag.test.ts`.
 */
import { it, expect } from 'vitest';
import { Clock, hlcAfter, hlcEncode, isPastStamp, PAST_BIT } from '$core/hlc';

it("a clock that follows a peer's unflagged counter just below the bit never ticks a flagged stamp of its own", () => {
  let now = 1_900_000_000_000;
  const clock = new Clock('aaaaaaaaaaaaz9z9', () => now);
  const peer = hlcEncode({ wall: now + 60_000, count: PAST_BIT - 1, device: 'bbbbbbbbbbbbq0q0' }); // a minute ahead: followed
  expect(isPastStamp(peer)).toBe(false);
  clock.observe(peer);
  now += 1_000;
  const own = clock.tick(); // an edit made here, by this clock
  expect(isPastStamp(own)).toBe(false);
});

it('a collision bump of an unflagged stamp never lands on the bit', () => {
  const plain = hlcEncode({ wall: 1_900_000_000_000, count: PAST_BIT - 1, device: 'aaaaaaaaaaaaz9z9' });
  expect(isPastStamp(hlcAfter(plain, 'aaaaaaaaaaaaz9z9'))).toBe(false);
});
