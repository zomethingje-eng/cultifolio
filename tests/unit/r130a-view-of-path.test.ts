/**
 * Round 130 (docs/REVIEW-ROUND-130.md): a space's lens view read from its path, the space first. A bench in a greenhouse
 * is under glass; a bench with its lamp set is under lights; a shelf alone, with no lamp, a windowsill (the hand-off's
 * table); a space of no kind under no space of a kind decides nothing.
 *
 * On 9176178: FAILED (no viewOfPath; a bench in a greenhouse read as a windowsill).
 */
import { describe, it, expect } from 'vitest';
import { viewOfPath } from '../../src/lib/climate/lens-spaces';

describe('a space\'s view from its path', () => {
  it('a bench, a tray and a shelf take the view of the space they stand in, or Under lights with a lamp', () => {
    expect(viewOfPath(['bench', 'greenhouse'], null)).toBe('greenhouse');
    expect(viewOfPath(['tray', 'bench', 'coldframe'], null)).toBe('greenhouse');
    expect(viewOfPath(['bench', 'greenhouse'], 14)).toBe('lights');
    expect(viewOfPath(['shelf', 'room'], null)).toBe('windowsill');
    expect(viewOfPath(['shelf'], 16)).toBe('lights');
    expect(viewOfPath([null, 'garden'], null)).toBe('outdoors');
    expect(viewOfPath(['windowsill', 'room'], 12)).toBe('windowsill');
    expect(viewOfPath([null, null], null)).toBeNull();
  });
});
