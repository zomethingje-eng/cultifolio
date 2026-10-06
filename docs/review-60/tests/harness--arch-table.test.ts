/**
 * Harness review of round sixty: the archetype table's `none` list (never grouped) and its genus lists must not both
 * name a genus. Oxalis is in `none` and in `genus.geophyte`; `archFor` reads `none` first, so the geophyte entry is dead
 * and the table says two things (agent X's report says Oxalis was "taken out of tropical" into `none`; a bulb grower
 * would expect it among the geophytes). FAILS on round-sixty code (a reproduction): decide which, and take Oxalis out of
 * the other. Note: apart from Oxalis the `none` list only repeats what the tables already give (no `none` genus or its
 * family is in a table), so removing any other entry, or the `ungrouped` check itself, changes no answer and no test
 * can see it; this test keeps the two lists from drifting.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--arch-table.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import tables from '$core/arch-tables.json';

describe('harness review', () => {
  it('no genus is both never grouped and grouped', () => {
    const t = tables as unknown as { none: string[]; genus: Record<string, string[]> };
    const none = new Set(t.none.map((g) => g.toLowerCase()));
    const both = Object.entries(t.genus).flatMap(([k, list]) => list.filter((g) => none.has(g.split(' ')[0].toLowerCase())).map((g) => `${g} (${k})`));
    expect(both).toEqual([]);
  });
});
