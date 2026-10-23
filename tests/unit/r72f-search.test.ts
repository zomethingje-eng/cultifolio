/**
 * Round seventy-two, reviewer F (triage F9): a generic noun is never a headline, and an exact match on one does not
 * outrank a fuller name. "cactus" answered Copiapoa cinerascens and C. serpentisulcata ("Cactus", their only English name)
 * before every named cactus, on the live site.
 */
import { describe, it, expect } from 'vitest';
import { englishNames, indexNames } from '$dossier/index-entry';
import { prepare, search } from '$core/search';

describe('r72f F9: generic headlines', () => {
  it('a species whose only English name is "Cactus" has no headline, and the noun stays searchable as a spelling', () => {
    const v = [{ name: 'Cactus', lang: 'eng', source: 'Some list' }];
    expect(englishNames(v, { genus: 'Copiapoa cinerascens' })).toEqual({});
    expect(indexNames(v, { genus: 'Copiapoa cinerascens' })).toEqual({ spellings: ['Cactus'] });
  });
  it('a fuller name heads, and a generic noun beside it is searched, not shown (guard; round eighty-one, review D5)', () => {
    const v = [{ name: 'Cactus', lang: 'eng' }, { name: 'Golden barrel cactus', lang: 'eng' }];
    const r = englishNames(v, { genus: 'Echinocactus grusonii' });
    expect(r.common).toBe('Golden barrel cactus');
    expect(r.commons).toBeUndefined(); // it stood among the names until round eighty-one
    expect(indexNames(v, { genus: 'Echinocactus grusonii' })).toEqual({ common: 'Golden barrel cactus', spellings: ['Cactus'] });
  });
  it('"cactus" answers the named cacti before a species a source calls only "Cactus"', () => {
    const p = prepare([
      { name: 'Copiapoa cinerascens', family: 'Cactaceae', spellings: ['Cactus'], photos: 90 },
      { name: 'Copiapoa serpentisulcata', family: 'Cactaceae', common: 'Cactus', photos: 80 },
      { name: 'Acanthocereus tetragonus', family: 'Cactaceae', common: 'Triangle cactus', photos: 10 },
      { name: 'Pereskia grandifolia', family: 'Cactaceae', common: 'Rose cactus', photos: 5 }
    ]);
    const names = search(p, 'cactus').map((x) => x.name);
    expect(names.slice(0, 2).sort()).toEqual(['Acanthocereus tetragonus', 'Pereskia grandifolia']);
    expect(names).toContain('Copiapoa cinerascens');
  });
  it('a fuller name typed exactly still comes first (guard: "jade plant")', () => {
    const p = prepare([
      { name: 'Crassula arborescens', common: 'Silver jade plant', photos: 50 },
      { name: 'Crassula ovata', common: 'Jade plant', photos: 40 }
    ]);
    expect(search(p, 'jade plant')[0].name).toBe('Crassula ovata');
  });
});
