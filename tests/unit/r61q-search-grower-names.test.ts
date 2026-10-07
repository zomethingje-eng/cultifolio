/**
 * Corpus review of round sixty: how the search reads names growers type, on an index of real species and their real
 * English names. Adopted in round sixty-one (decision 7) from docs/review-60/tests/corpus--search-grower-names.test.ts:
 * each `it` but the last describe's was a reproduction that FAILED on the base and PASSES with the round's search fix
 * (src/lib/core/search.ts); the last describe is the review's guards, as they were.
 *
 * The answer is computed exactly as `searchAnswer` computes it without a manifest (the whole index, then the retry on
 * `relaxedQuery` when nothing matched); the postings path is equal to it (fuzzed in corpus--fuzz-grower.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { prepare, search, relaxedQuery } from '$core/search';

const E = (key: number, name: string, common?: string, commons?: string[], syn?: string[]) => ({ key, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, common, commons, syn, family: 'X', origin: [] as string[] });
const idx = [
  E(1, 'Curio rowleyanus', 'String-Of-Beads Senecio', ['String-of-Pearls', 'String of pearls']),
  E(2, 'Ceropegia woodii', 'String of hearts', ['Rosary vine']),
  E(3, 'Curio radicans', 'String of bananas'),
  E(4, 'Crassula perforata', 'String of buttons'),
  E(5, 'Echeveria lilacina', 'Ghost echeveria'),
  E(6, 'Echeveria elegans', 'Mexican snowball'),
  E(7, 'Gonialoe variegata', 'Tiger aloe', undefined, ['Aloe variegata']),
  E(8, 'Aloe vera', 'Barbados aloe'),
  E(9, 'Aloe aristata', 'Lace aloe'),
  E(10, 'Agave victoriae-reginae', 'Queen Victoria agave'),
  E(11, 'Kalanchoe daigremontiana', 'Mother of thousands'),
  E(12, 'Kalanchoe delagoensis', 'Mother of millions'),
  E(13, 'Graptopetalum paraguayense', 'Mother of pearl plant'),
  E(14, 'Opuntia ficus-indica', 'Prickly pear'),
  E(15, 'Aloe nobilis')
];
const P = prepare(idx);
/** What /api/search answers: the hits' names and the query the retry searched, if it did. */
function answer(q: string): { names: string[]; relaxed: string | null } {
  let hits = search(P, q, 60);
  let relaxed: string | null = null;
  if (!hits.length) {
    const r = relaxedQuery(q);
    if (r) { const again = search(P, r, 60); if (again.length) { hits = again; relaxed = r; } }
  }
  return { names: hits.map((h) => h.name), relaxed };
}

describe('a common name typed in title case loses its last words as an "author" (finding 1)', () => {
  it('"String of Pearls" answers String of pearls first, as "string of pearls" does', () => {
    // Today: Ceropegia woodii | Crassula perforata | Curio radicans | Curio rowleyanus ("Pearls" read as an author after "of")
    expect(answer('String of Pearls').names[0]).toBe('Curio rowleyanus');
    expect(answer('String of Pearls')).toEqual(answer('string of pearls'));
  });
  it('"Mother of Thousands" is one species, as "mother of thousands" is', () => {
    expect(answer('Mother of Thousands').names).toEqual(['Kalanchoe daigremontiana']);
  });
  it('"Mother of Pearl Plant" is Graptopetalum paraguayense alone', () => {
    expect(answer('Mother of Pearl Plant').names).toEqual(['Graptopetalum paraguayense']);
  });
});

describe('a hybrid formula is answered as one of its parents, with no "Showing results for" (finding 2)', () => {
  it('"Aloe vera x Gasteria" is not answered as plain Aloe vera', () => {
    // Today: { names: ['Aloe vera'], relaxed: null }: "Gasteria" is read as an author of "vera"
    const a = answer('Aloe vera x Gasteria');
    expect(a.names.length === 1 && a.names[0] === 'Aloe vera' && a.relaxed === null).toBe(false);
  });
  it('"Aloe aristata x Aloe vera" is not answered as plain Aloe aristata', () => {
    const a = answer('Aloe aristata x Aloe vera');
    expect(a.names.length === 1 && a.names[0] === 'Aloe aristata' && a.relaxed === null).toBe(false);
  });
});

describe('a quoted cultivar picks a species by its spelling, and the retry never fires (finding 3)', () => {
  it("\"Echeveria 'Lola'\" is not Echeveria lilacina alone (the near pass: lola ≈ lila-)", () => {
    expect(answer("Echeveria 'Lola'").names).toContain('Echeveria elegans');
  });
  it("\"Echeveria ‘Lola’\" (a phone's quotes) likewise", () => {
    expect(answer('Echeveria ‘Lola’').names).toContain('Echeveria elegans');
  });
});

describe('the retry names a hyphenated epithet by its first half (finding 6)', () => {
  it('"Agave victoriae-reginae cv. Compacta" is shown as results for "Agave victoriae-reginae", not "Agave victoriae"', () => {
    expect(relaxedQuery('Agave victoriae-reginae cv. Compacta')).toBe('Agave victoriae-reginae');
    expect(relaxedQuery('Opuntia ficus-indica var. burbankii')).toBe('Opuntia ficus-indica');
  });
});

describe('two spellings of one name, two answers (finding 7)', () => {
  it('"Aloe ×nobilis Baker" is answered as "Aloe × nobilis Baker" is: directly, not as a retry', () => {
    expect(answer('Aloe ×nobilis Baker')).toEqual(answer('Aloe × nobilis Baker'));
  });
});

describe('an author pasted in lower case is searched as a word, and can answer another species (finding 4)', () => {
  // The case the fuzz found ("orbea humilis l." answered Hechtia humilis alone), as small as it goes: a species of
  // another genus that lists the typed genus among its older names and has a word beginning "l".
  const Q = prepare([
    { key: 1, slug: 'orbea-humilis', name: 'Orbea humilis', origin: ['Kenya'] },
    { key: 2, slug: 'hechtia-humilis', name: 'Hechtia humilis', origin: ['Lesotho'], syn: ['Orbea lutea'] }
  ]);
  it('"orbea humilis l." answers Orbea humilis first, as "Orbea humilis L." does', () => {
    // Adopted with one change (round sixty-one): "Orbea humilis L." answers Hechtia humilis too, second, through its older
    // name Orbea lutea (both words are in that species' entry), so the review's "alone" did not hold even for the
    // capitalised spelling. What the finding is about holds: both spellings give one answer, Orbea humilis first.
    const capital = search(Q, 'Orbea humilis L.', 60).map((h) => h.name);
    expect(capital[0]).toBe('Orbea humilis');
    expect(search(Q, 'orbea humilis l.', 60).map((h) => h.name)).toEqual(capital); // base: ['Hechtia humilis'] alone
  });
});

describe('guards: what the search gets right (PASS today)', () => {
  it('title case with every word capitalised, a hyphenated common name and a lower-case one agree', () => {
    for (const q of ['String Of Pearls', 'String-of-Pearls', 'string of pearls']) expect(answer(q).names).toEqual(['Curio rowleyanus']);
  });
  it('an author pasted from POWO, with brackets and "f.", is dropped and the answer is direct', () => {
    expect(answer('Aloe vera (L.) Burm.f.')).toEqual({ names: ['Aloe vera'], relaxed: null });
  });
  it('a variety the reference files under its species is a labelled retry', () => {
    expect(answer('Agave victoriae-reginae var. compacta').names).toEqual(['Agave victoriae-reginae']);
    expect(answer('Agave victoriae-reginae var. compacta').relaxed).not.toBeNull();
  });
  it('a cross written with "x" between a genus and its epithet is the named hybrid', () => {
    expect(answer('Aloe x nobilis')).toEqual({ names: ['Aloe nobilis'], relaxed: null });
    expect(answer('Aloe × nobilis')).toEqual({ names: ['Aloe nobilis'], relaxed: null });
  });
});
