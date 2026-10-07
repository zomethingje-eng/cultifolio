/**
 * Round sixty-one, decision 7: the search reads the names growers type (the corpus review, 1 to 8 and 12), and the
 * species picker neither offers a retried answer as a match nor drops the rank typed after a species (5). Each case
 * below failed on the base (shown before the fix) unless it says it is a guard.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanQuery, relaxedQuery, prepare, search } from '$core/search';
import { pickedName } from '$lib/ui/picked-name';

const E = (key: number, name: string, common?: string, commons?: string[]) => ({ key, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, common, commons, family: 'X', origin: [] as string[] });
const P = prepare([
  E(1, 'Curio rowleyanus', 'String of pearls'),
  E(2, 'Ceropegia woodii', 'String of hearts'),
  E(3, 'Aloe vera', 'Barbados aloe'),
  E(4, 'Echeveria elegans', 'Mexican snowball'),
  E(5, 'Echinocactus grusonii', 'Golden barrel'),
  E(6, 'Kalanchoe daigremontiana', 'Mother of thousands'),
  E(7, 'Opuntia ficus-indica', 'Prickly pear')
]);
function answer(q: string) {
  let hits = search(P, q, 60), relaxed: string | null = null;
  if (!hits.length) { const r = relaxedQuery(q); if (r) { const again = search(P, r, 60); if (again.length) { hits = again; relaxed = r; } } }
  return { names: hits.map((h) => h.name), relaxed };
}

describe('author citations (corpus 1 and 4)', () => {
  it('a capitalised word after a little word is not an author: "Mother of Thousands", "String of Pearls"', () => {
    expect(cleanQuery('String of Pearls')).toEqual(['String', 'of', 'Pearls']);
    expect(answer('Mother of Thousands')).toEqual({ names: ['Kalanchoe daigremontiana'], relaxed: null });
    expect(answer('String of Pearls').names).toEqual(['Curio rowleyanus']);
  });
  it('after an epithet of four letters or more, a capitalised word still starts the citation (a guard)', () => {
    expect(cleanQuery('Aloe vera Burm.')).toEqual(['Aloe', 'vera']);
    expect(cleanQuery('Copiapoa cinerea Britton & Rose')).toEqual(['Copiapoa', 'cinerea']);
  });
  it('a word ending in "." once the name is complete starts a citation in any case', () => {
    expect(cleanQuery('opuntia truncata mill.')).toEqual(['opuntia', 'truncata']);
    expect(cleanQuery('echinocereus dinteri hort. ex lem.')).toEqual(['echinocereus', 'dinteri']);
    expect(answer('aloe vera l.')).toEqual({ names: ['Aloe vera'], relaxed: null });
  });
  it('a rank marker ending in "." is not a citation, and the epithet after it is kept, its own citation dropped', () => {
    expect(cleanQuery('copiapoa cinerea var. columna-alba')).toEqual(['copiapoa', 'cinerea', 'var.', 'columna-alba']);
    expect(cleanQuery('aloe vera f. alba mill.')).toEqual(['aloe', 'vera', 'f.', 'alba']);
  });
  it('a genus abbreviation is not a citation: the name is not complete yet (a guard)', () => {
    expect(cleanQuery('e. elegans')).toEqual(['e.', 'elegans']);
  });
});

describe('hybrids and cultivars (corpus 2, 3, 6, 7)', () => {
  it('after "x" or "×" the name starts again: the other parent\'s genus is kept, so the cross is not answered as a parent', () => {
    expect(cleanQuery('Aloe vera x Gasteria')).toEqual(['Aloe', 'vera', 'x', 'Gasteria']);
    expect(cleanQuery('Aloe vera × Gasteria')).toEqual(['Aloe', 'vera', '×', 'Gasteria']);
    expect(answer('Aloe vera x Gasteria')).toEqual({ names: ['Aloe vera'], relaxed: 'Aloe vera' });
  });
  it('"×epithet" is read past its sign: "Aloe ×nobilis Baker" drops Baker as "Aloe × nobilis Baker" does', () => {
    expect(cleanQuery('Aloe ×nobilis Baker')).toEqual(['Aloe', '×nobilis']);
  });
  it('a quoted text beginning with a capital is a cultivar in the first search; a phone\'s quotes round an epithet are not', () => {
    expect(cleanQuery("Echeveria 'Lola'")).toEqual(['Echeveria']);
    expect(cleanQuery('Echeveria “Black Prince')).toEqual(['Echeveria']); // unclosed, still being typed
    expect(cleanQuery('Copiapoa ’cinerea’')).toEqual(['Copiapoa', '’cinerea’']);
    expect(answer("Echeveria 'Lola'").names).toEqual(['Echeveria elegans']);
  });
  it('the retry counts a hyphenated epithet as one word', () => {
    expect(relaxedQuery('Opuntia ficus-indica var. burbankii')).toBe('Opuntia ficus-indica');
    expect(answer('Opuntia ficus-indica var. burbankii')).toEqual({ names: ['Opuntia ficus-indica'], relaxed: 'Opuntia ficus-indica' });
  });
  it('the retry is never a single letter (corpus 8): "E. cv. Perle" is not answered as every genus beginning with E', () => {
    expect(relaxedQuery('E. cv. Perle')).toBeNull();
    expect(answer('E. cv. Perle').names).toEqual([]);
    expect(relaxedQuery('Ec. cv. Perle')).toBe('Ec'); // two letters are a beginning, as the search box treats them
  });
});

describe('the picker keeps the rank and epithet typed after a species (corpus 5)', () => {
  it('a species picked for a variety keeps the variety', () => {
    expect(pickedName('Copiapoa cinerea var. columna-alba', { name: 'Copiapoa cinerea' })).toBe('Copiapoa cinerea var. columna-alba');
    expect(pickedName('Copiapoa cinerea var. columna-alba', { name: 'Copiapoa cinerea', rank: 'SPECIES' })).toBe('Copiapoa cinerea var. columna-alba');
  });
  it('a misspelt species corrected by the pick keeps the variety too', () => {
    expect(pickedName('copiapoa cineria var. columna-alba', { name: 'Copiapoa cinerea' })).toBe('Copiapoa cinerea var. columna-alba');
  });
  it('a suggestion below species rank is its own whole name; a cultivar and a cross are kept as before (guards)', () => {
    expect(pickedName('Copiapoa cinerea var. col', { name: 'Copiapoa cinerea var. columna-alba', rank: 'VARIETY' })).toBe('Copiapoa cinerea var. columna-alba');
    expect(pickedName("Haworthia truncata 'Lime Green'", { name: 'Haworthia truncata' })).toBe("Haworthia truncata 'Lime Green'");
    expect(pickedName('Copiapoa cinerea', { name: 'Copiapoa cinerea' })).toBe('Copiapoa cinerea');
    expect(pickedName('Ariocarpus retusus x trigonus', { name: 'Ariocarpus', rank: 'GENUS' })).toBe('Ariocarpus retusus × Ariocarpus trigonus');
  });
});

describe('searchCatalogue cuts by code point (corpus 12)', () => {
  const real = globalThis.fetch;
  afterEach(() => { globalThis.fetch = real; vi.resetModules(); });
  it('an emoji across the 80th unit is kept whole or dropped, never halved, and the search is asked', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const u = String(input);
      if (u.startsWith('/api/corpus')) return new Response(JSON.stringify({ id: 'c1', buckets: 32 }), { headers: { 'content-type': 'application/json' } });
      if (u.startsWith('/api/search')) { asked.push(u); return new Response('[]', { headers: { 'content-type': 'application/json' } }); }
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const { searchCatalogue } = await import('$lib/ui/index.svelte');
    const q = 'a'.repeat(79) + '🌵 cactus';
    const r = await searchCatalogue(q); // base: the cut left a lone surrogate, encodeURIComponent threw, and the answer was null ("not reached")
    expect(r).toEqual([]);
    expect(asked).toHaveLength(1);
    expect(decodeURIComponent(new URL(asked[0], 'https://x').searchParams.get('q')!)).toBe('a'.repeat(79) + '🌵');
  });
});
