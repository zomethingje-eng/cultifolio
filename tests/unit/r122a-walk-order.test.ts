/**
 * Round 122 (MYPLANTS 29): the walking order of spaces, kept as each space's `sort` among its siblings.
 *
 * On aa450b2: FAILED (no $core/walk-order).
 */
import { describe, it, expect } from 'vitest';
import { reorder, sortWrites } from '../../src/lib/core/walk-order';

const s = (id: string, sort?: number) => ({ id, sort });
describe('r122a walking order', () => {
  it('moves one sibling and keeps the rest in their order', () => {
    expect(reorder([s('a'), s('b'), s('c')], 2, 0).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(reorder([s('a'), s('b'), s('c')], 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(reorder([s('a'), s('b')], 5, 0).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('writes 1, 2, 3 only where a sort changes', () => {
    expect(sortWrites([s('c', 3), s('a', 1), s('b', 2)])).toEqual([{ id: 'c', sort: 1 }, { id: 'a', sort: 2 }, { id: 'b', sort: 3 }]);
    expect(sortWrites([s('a', 1), s('b', 2)])).toEqual([]);
    expect(sortWrites([s('a'), s('b')])).toEqual([{ id: 'a', sort: 1 }, { id: 'b', sort: 2 }]);
  });
});
