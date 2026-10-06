/**
 * Harness review of round sixty: an author citation joined by "ex" ("Aloe vera (L.) Burm.f." is covered by its bracket;
 * "Gasteria carinata ex Haw." is not). The citation rule lists "ex" (search.ts AUTHOR), and dropping it passed the suite:
 * the round's tests paste citations with a bracket, "&" or a dotted abbreviation only. Without it "ex" is read as a word
 * of the name, nothing matches, and the page shows the relaxed retry ("Showing results for …") for a name the index has.
 * PASSES on round-sixty code; FAILS under the mutation.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--search-citation.test.ts`.
 */
import { it, expect } from 'vitest';
import { cleanQuery, prepare, search, relaxedQuery } from '$core/search';

const idx = ['Gasteria carinata', 'Gasteria excelsa', 'Aloe vera'].map((name, i) => ({ key: 1 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0, photos: 0, climate: 'ok' }));

it('a citation joined by "ex" is dropped like any other (harness review)', () => {
  expect(cleanQuery('Gasteria carinata ex Haw.')).toEqual(['Gasteria', 'carinata']);
  expect(cleanQuery('Gasteria carinata Mill. ex Duval')).toEqual(['Gasteria', 'carinata']);
  const hits = search(prepare(idx as never), 'Gasteria carinata ex Haw.', 10);
  expect(hits.map((h) => h.name)[0]).toBe('Gasteria carinata');
  expect(relaxedQuery('Gasteria carinata ex Haw.')).toBeNull(); // nothing to retry: the query as cleaned is the name
});
