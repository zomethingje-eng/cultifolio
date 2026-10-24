/**
 * Round eighty-two (O): the care-group table (the independent review's 35).
 *
 * "Peperomia graveolens" was listed under `genus.arid`, a table keyed by genus: it was read as the genus Peperomia,
 * and `genus.tropical`, read after it, set Peperomia again, so the listing for the species was lost and nothing said so.
 * It is in `species` now, where a species apart from its genus belongs. And a genus sits in one list only, once (Maranta
 * was listed twice under `tropical`), a family likewise, and no genus the table never groups (`none`) is listed.
 *
 * No page's group changes: a listing stands only where Kew's lifeform agrees (round eighty-one), and Kew's file gives
 * Peperomia graveolens no lifeform, so it had no group and has none.
 *
 * On r82base: 1, 2 and 3 FAILED ("Peperomia graveolens" under genus.arid; Peperomia in two lists, Maranta twice; the
 * species read as the genus's tropical listing).
 */
import { describe, it, expect } from 'vitest';
import tables from '../../src/lib/core/arch-tables.json';
import { listedFor } from '$core/arch';

const genus = tables.genus as Record<string, string[]>;
const family = tables.family as Record<string, string[]>;

describe('r82o arch tables', () => {
  it('1: a genus list holds genera, one word each; a species apart from its genus is under `species`', () => {
    const spaced = Object.entries(genus).flatMap(([k, list]) => list.filter((g) => /\s/.test(g.trim())).map((g) => `${k}: ${g}`));
    expect(spaced).toEqual([]);
  });
  it('2: a genus sits in one list only, once; a family likewise; no genus of `none` is listed', () => {
    const where = new Map<string, string[]>();
    for (const [k, list] of Object.entries(genus)) for (const g of list) where.set(g.toLowerCase(), [...(where.get(g.toLowerCase()) ?? []), k]);
    expect([...where].filter(([, ks]) => ks.length > 1).map(([g, ks]) => `${g}: ${ks.join(', ')}`)).toEqual([]);
    const fam = new Map<string, string[]>();
    for (const [k, list] of Object.entries(family)) for (const f of list) fam.set(f.toLowerCase(), [...(fam.get(f.toLowerCase()) ?? []), k]);
    expect([...fam].filter(([, ks]) => ks.length > 1).map(([f, ks]) => `${f}: ${ks.join(', ')}`)).toEqual([]);
    expect(((tables as { none?: string[] }).none ?? []).filter((g) => where.has(g.toLowerCase()))).toEqual([]);
  });
  it('3: Peperomia graveolens is listed by name as a cactus or succulent; the rest of Peperomia stays tropical foliage', () => {
    expect(listedFor('Peperomia graveolens', 'Piperaceae')).toMatchObject({ tier: 'species', arch: { key: 'arid' } });
    expect(listedFor('Peperomia obtusifolia', 'Piperaceae')).toMatchObject({ tier: 'genus', arch: { key: 'tropical' } });
  });
});
