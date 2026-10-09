/**
 * Round sixty-two, decision 3: the common-name rule (`englishNames`) and GBIF's vernacular names (`gbif.vernacular`).
 * Adopted from docs/review-61/tests/corpus--common-name-rule.test.ts (the self-review's corpus 7 to 10), with A34's
 * five grower's words and review B's three live species. Each case FAILED on the base unless its describe says guard.
 * The review's "Bitter aloes" case is changed by the decision: a genus word in lower case is a grower's English noun,
 * so neither "Bitter aloe" nor "Bitter aloes" is set back now (the inconsistency it found is gone either way).
 */
import { describe, it, expect } from 'vitest';
import { englishNames, generaOf, type VernacularName } from '$dossier/index-entry';
import { vernacular } from '$dossier/sources/gbif';
import { Vernacular } from '$dossier/schema';
import * as v from 'valibot';

const eng = (name: string, extra: Record<string, unknown> = {}) => ({ name, lang: 'eng', ...extra }) as VernacularName;
const GENERA = generaOf(['Aloe vera', 'Aristaloe aristata', 'Gonialoe variegata', 'Hippeastrum puniceum', 'Amaryllis belladonna', 'Crassula ovata', 'Portulaca molokiniensis',
  'Colchicum autumnale', 'Crocus sativus', 'Peniocereus greggii', 'Cereus jamacaru', 'Selenicereus grandiflorus', 'Zantedeschia aethiopica', 'Arum italicum',
  'Haworthiopsis attenuata', 'Haworthia cooperi', 'Curio rowleyanus', 'Curio ficoides', 'Senecio vulgaris', 'Ligustrum japonicum', 'Sesuvium portulacastrum']);
const shown = (vs: VernacularName[], species: string) => englishNames(vs, { genus: species, genera: GENERA }).common;
type Row = { vernacularName: string; language?: string; source?: string; preferred?: boolean };
const pages = (rows: Row[], size = 2) => {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(url);
    const u = new URL(url);
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const limit = Math.min(size, Number(u.searchParams.get('limit') ?? size));
    return { status: 'ok', data: { results: rows.slice(offset, offset + limit), endOfRecords: offset + limit >= rows.length } };
  }) as never;
  return { f, asked };
};

describe('gbif.vernacular keeps each exact spelling with its own sources, and pages to the end (corpus 7, 8)', () => {
  it('the spelling more sources give is shown: "Japanese Privet" (two) over "japanese privet" (one)', async () => {
    const r = await vernacular(pages([
      { vernacularName: 'japanese privet', language: 'eng', source: 'A' },
      { vernacularName: 'Japanese Privet', language: 'eng', source: 'B' },
      { vernacularName: 'Japanese Privet', language: 'eng', source: 'C' }
    ], 50).f, 1);
    if (r.status !== 'ok') throw new Error('fetch');
    expect(shown(r.data, 'Ligustrum japonicum')).toBe('Japanese Privet'); // base: "Japanese privet"
  });
  it('pages until endOfRecords: a name past the first page is kept', async () => {
    const rows: Row[] = Array.from({ length: 7 }, (_, i) => ({ vernacularName: `Name ${String.fromCharCode(97 + i)}`, language: i % 2 ? 'eng' : 'fra', source: `S${i}` }));
    const { f, asked } = pages(rows, 2);
    const r = await vernacular(f, 1);
    if (r.status !== 'ok') throw new Error('fetch');
    expect(r.data.map((x) => x.name)).toEqual(rows.map((x) => x.vernacularName)); // base: limit=50 asked once
    expect(asked.length).toBeGreaterThan(1);
    expect('truncated' in r && r.truncated).toBeFalsy();
  });
  it('a list longer than the pages it may ask is kept as far as it was read and recorded "truncated"', async () => {
    const rows: Row[] = Array.from({ length: 5000 }, (_, i) => ({ vernacularName: `Name ${i}`, language: 'eng', source: 'S' }));
    const r = await vernacular(pages(rows, 1000).f, 1);
    if (r.status !== 'ok') throw new Error('fetch');
    expect((r as { truncated?: number }).truncated).toBe(r.data.length);
    expect(r.data.length).toBeLessThan(5000);
  });
  it('a page refused after the first is a refusal, never a shorter list', async () => {
    let n = 0;
    const f = (async () => (n++ === 0 ? { status: 'ok', data: { results: [{ vernacularName: 'A', language: 'eng' }], endOfRecords: false } } : { status: 'refused', detail: '429' })) as never;
    expect((await vernacular(f, 1)).status).toBe('refused');
  });
});

describe('englishNames counts distinct sources (corpus 8)', () => {
  it('one source giving three spellings is one source, not three', () => {
    const v = [eng('Money tree', { sources: 2 }), eng('Jade plant', { source: 'X' }), eng('Jade-plant', { source: 'X' }), eng('Jade Plant', { source: 'X' })];
    expect(shown(v, 'Crassula ovata')).toBe('Money tree'); // base: "Jade plant" (counted 3)
  });
  it('a stored row keeps its other sources through the schema, so the species page counts as the index does', () => {
    expect(v.parse(Vernacular, { name: 'Japanese Privet', lang: 'eng', source: 'B', sources: 2, alsoFrom: ['C'] })).toEqual({ name: 'Japanese Privet', lang: 'eng', source: 'B', sources: 2, alsoFrom: ['C'] }); // base: alsoFrom dropped
  });
  it('the same holds through gbif.vernacular\'s rows', async () => {
    const r = await vernacular(pages([
      { vernacularName: 'Jade plant', language: 'eng', source: 'X' }, { vernacularName: 'Jade-plant', language: 'eng', source: 'X' },
      { vernacularName: 'Money tree', language: 'eng', source: 'Y' }, { vernacularName: 'money tree', language: 'eng', source: 'Z' }
    ], 50).f, 1);
    if (r.status !== 'ok') throw new Error('fetch');
    expect(shown(r.data, 'Crassula ovata')).toBe('Money tree');
  });
});

describe('a name is set back for another genus only as a genus is written (A34, corpus 9)', () => {
  it.each([
    ['Aristaloe aristata', ['Torch plant', 'Lace aloe'], 'Lace aloe'],
    ['Peniocereus greggii', ['Arizona queen of the night', 'Night-blooming cereus'], 'Night-blooming cereus'],
    ['Colchicum autumnale', ['Meadow saffron', 'Autumn crocus'], 'Autumn crocus'],
    ['Zantedeschia aethiopica', ['Calla lily', 'Arum lily'], 'Arum lily'],
    ['Haworthiopsis attenuata', ['Zebra plant', 'Zebra haworthia'], 'Zebra haworthia']
  ])('%s keeps the grower\'s word', (species, names, kept) => {
    // Listed first, with no source counts: a name not set back is shown, since GBIF's order then decides.
    expect(shown([eng(kept), ...names.filter((n) => n !== kept).map((n) => eng(n))], species)).toBe(kept); // base: set back
  });
  it('a lower-case genus word and its plural are both kept (the review\'s "Bitter aloes", changed by the decision)', () => {
    expect(shown([eng('Bitter aloe'), eng('Kanniedood')], 'Gonialoe variegata')).toBe('Bitter aloe');
    expect(shown([eng('Bitter aloes'), eng('Kanniedood')], 'Gonialoe variegata')).toBe('Bitter aloes');
  });
  it('the first letter is a capital past a leading ʻokina or apostrophe (corpus 10a)', () => {
    expect(shown([eng('ʻihi')], 'Portulaca molokiniensis')).toBe('ʻIhi'); // base: "ʻihi"
    expect(shown([eng("'akulikuli")], 'Sesuvium portulacastrum')).toBe("'Akulikuli");
  });
  it('a former genus\'s binomial (the species\' own epithet) is set back; another genus as a capitalised word among lower-case ones is too', () => {
    expect(shown([eng('Senecio rowleyanus'), eng('String of pearls')], 'Curio rowleyanus')).toBe('String of pearls');
    expect(shown([eng('Aloe variegata'), eng('Kanniedood')], 'Gonialoe variegata')).toBe('Kanniedood');
    expect(shown([eng('Flatleaf Senecio'), eng('Blue chalkstick')], 'Curio ficoides')).toBe('Blue chalkstick');
  });
});

describe('review B\'s three live species keep what they show', () => {
  it('Curio rowleyanus: String-of-Pearls', () => {
    const v = [eng('String-Of-Beads Senecio', { source: 'ITIS' }), eng('String-of-Pearls', { source: 'USDA PLANTS' }), eng('String of pearls', { source: 'Wikipedia' }), eng('string of beads', { source: 'Catalogue of Life' })];
    expect(shown(v, 'Curio rowleyanus')).toBe('String-of-Pearls');
  });
  it('Gonialoe variegata: Partridge Breast Aloe, the Aloe alternatives kept', () => {
    const v = [eng('Partridge Breast Aloe', { source: 'ITIS' }), eng('Tiger Aloe', { source: 'ITIS' }), eng('Kanniedood aloe', { source: 'SANBI' })];
    const n = englishNames(v, { genus: 'Gonialoe variegata', genera: GENERA });
    expect(n.common).toBe('Partridge Breast Aloe');
    expect(n.commons).toContain('Tiger Aloe');
  });
  it('Curio ficoides: Blue Chalkstick, Flatleaf Senecio kept', () => {
    const v = [eng('Flatleaf Senecio', { source: 'ITIS' }), eng('Blue Chalkstick', { source: 'ITIS' }), eng('Big blue chalksticks', { source: 'x' })];
    const n = englishNames(v, { genus: 'Curio ficoides', genera: GENERA });
    expect(n.common).toBe('Blue Chalkstick');
    expect(n.commons).toContain('Flatleaf Senecio');
  });
});

describe('guard', () => {
  it('a comma list is still set back and never split; preferred, then sources, then GBIF\'s order', () => {
    expect(englishNames([eng('Living stones, pebble plants'), eng('Split rock')], { genus: 'Lithops', genera: GENERA })).toEqual({ common: 'Split rock', commons: ['Living stones, pebble plants'] });
    expect(shown([eng('Snake plant', { source: 'a' }), eng("Mother-in-law's tongue", { source: 'b', preferred: true })], 'Dracaena')).toBe("Mother-in-law's tongue");
    expect(shown([eng('Jade'), eng('Money plant', { sources: 3 })], 'Crassula ovata')).toBe('Money plant');
    expect(shown([eng('Jade'), eng('Money plant')], 'Crassula ovata')).toBe('Jade');
  });
  it('the page and the tile are given the same genera: generaOf of the genus keys equals generaOf of the full names, × included', () => {
    const names = ['× Gasteraloe beguinii', 'x Gasteraloe nowotnyi', 'Aloe vera', 'Gasteria batesiana'];
    expect([...generaOf(names)].sort()).toEqual([...generaOf(['Gasteraloe', 'Aloe', 'Gasteria'])].sort());
  });
});
