import { describe, it, expect } from 'vitest';
import { fillBefore } from '$lib/ui/fill';

describe('the catalogue\'s upward fill runs only while the reader is within the rows (round forty-nine, 2)', () => {
  const edge = 44 + 52; // the pinned search row on a phone
  it('runs with the first row above or just under the pinned bar (as after a jump to a letter), not from the chips above the rows (as after A–Z)', () => {
    expect(fillBefore(-3000, edge)).toBe(true); // scrolled well into the rows
    expect(fillBefore(edge - 1, edge)).toBe(true);
    expect(fillBefore(edge + 4 + 36, edge)).toBe(true); // the heading placed under the bar, the row under the heading
    expect(fillBefore(edge + 180, edge)).toBe(false); // the chips and the letter index in view above the rows
    expect(fillBefore(Infinity, edge)).toBe(false); // no rows loaded
  });
});
