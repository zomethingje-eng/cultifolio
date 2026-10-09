// Self-review of round sixty-one, corpus area: the common-name rule against what /about/how says it does.
// REPRODUCTIONS: the tests under "repro" FAIL on f4ab4f8 (4); those under "guard" PASS and pin the agreed behaviour.
// Run: npx vitest run tests/unit/corpus--common-name-rule.test.ts
import { describe, it, expect } from 'vitest';
import { englishNames, generaOf } from '$dossier/index-entry';
import { vernacular } from '$dossier/sources/gbif';

const eng = (name: string, extra: Record<string, unknown> = {}) => ({ name, lang: 'eng', ...extra });
const GENERA = generaOf(['Aloe vera', 'Gonialoe variegata', 'Hippeastrum puniceum', 'Amaryllis belladonna', 'Crassula ovata', 'Portulaca molokiniensis', 'Colchicum autumnale', 'Crocus sativus']);
const answer = (results: object[]) => (async () => ({ status: 'ok', data: { results } })) as never;

describe('repro', () => {
  it('of a name\'s spellings, the one more sources give is shown (/about/how): case-only spellings are merged in gbif.ts first, keeping the first row\'s', async () => {
    const r = await vernacular(answer([
      { vernacularName: 'japanese privet', language: 'eng', source: 'A' },
      { vernacularName: 'Japanese Privet', language: 'eng', source: 'B' },
      { vernacularName: 'Japanese Privet', language: 'eng', source: 'C' }
    ]), 1);
    if (r.status !== 'ok') throw new Error('fetch');
    expect(englishNames(r.data, { genus: 'Ligustrum japonicum', genera: GENERA }).common).toBe('Japanese Privet'); // f4ab4f8: "Japanese privet"
  });
  it('"the name more of GBIF\'s sources give": one source giving two spellings is one source, not two', () => {
    // Through gbif.ts each spelling row carries its own distinct-source count; englishNames adds the rows of a group.
    const v = [eng('Money tree', { sources: 2 }), eng('Jade plant', { source: 'X' }), eng('Jade-plant', { source: 'X' }), eng('Jade Plant', { source: 'X' })];
    expect(englishNames(v, { genus: 'Crassula ovata', genera: GENERA }).common).toBe('Money tree'); // f4ab4f8: "Jade plant" (counted 3)
  });
  it('a plural genus word is set back as the singular is ("Bitter aloes" in Gonialoe)', () => {
    expect(englishNames([eng('Bitter aloes'), eng('Kanniedood')], { genus: 'Gonialoe variegata', genera: GENERA }).common).toBe('Kanniedood'); // f4ab4f8: "Bitter aloes", while "Bitter aloe" is set back
  });
  it('the first letter is a capital past a leading ʻokina or apostrophe (Hawaiian Portulaca names)', () => {
    expect(englishNames([eng('ʻihi')], { genus: 'Portulaca molokiniensis', genera: GENERA }).common).toBe('ʻIhi'); // f4ab4f8: "ʻihi"
  });
});

describe('guard', () => {
  it('the source\'s inner capitals stay; the first letter is a capital', () => {
    expect(englishNames([eng('apple-of-Peru')]).common).toBe('Apple-of-Peru');
  });
  it('a genus homonym of the corpus sets the grower\'s own word back (by the stated rule): Hippeastrum\'s "Amaryllis", Colchicum\'s "Autumn crocus"', () => {
    expect(englishNames([eng('Amaryllis'), eng('Barbados lily')], { genus: 'Hippeastrum puniceum', genera: GENERA }).common).toBe('Barbados lily');
    expect(englishNames([eng('Autumn crocus'), eng('Meadow saffron')], { genus: 'Colchicum autumnale', genera: GENERA }).common).toBe('Meadow saffron');
  });
  it('"Lily" is no genus: not set back', () => {
    expect(englishNames([eng('Barbados lily'), eng('Knight\'s star')], { genus: 'Hippeastrum puniceum', genera: GENERA }).common).toBe('Barbados lily');
  });
  it('the page and the tile are given the same genera: generaOf of the genus keys equals generaOf of the full names, × included', () => {
    const names = ['× Gasteraloe beguinii', 'x Gasteraloe nowotnyi', 'Aloe vera', 'Gasteria batesiana'];
    const keys = ['Gasteraloe', 'Aloe', 'Gasteria'];
    expect([...generaOf(names)].sort()).toEqual([...generaOf(keys)].sort());
  });
});
