/**
 * Round eighty-one, the merge (M): the needs settled between agents, each of which fails on r81base.
 * - H to S: the search's order reads a nothogenus past its "×" (`search.ts`, `sortKey`); on r81base "× Sorbaronia
 *   arsenii" sorted as "× sorbaronia arsenii", before every genus.
 * - H to S: the import checks a named nothospecies as a species is checked (`import/check.ts`); on r81base "Mentha ×
 *   piperita" was filed "hybrid" without asking, and a signed index name was not the exact match of the name asked.
 * - A and B (D4): one line under the name, B's "which the search finds and this page does not show" where none of
 *   Wikidata's names is shown, A's "as Wikidata spells them … not corrected here" where one is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepare } from '$core/search';
import { checkNames, readSearch, type Lookup } from '$lib/import/check';

describe('r81m: a nothogenus sorts past its sign (H to S)', () => {
  it('the sort key of "× Sorbaronia arsenii" is the genus without the sign', () => {
    const p = prepare([{ name: '× Sorbaronia arsenii', slug: 'sorbaronia-arsenii' }, { name: 'Mentha × piperita', slug: 'mentha-piperita' }] as never);
    expect(p.map((x) => x.sortKey)).toEqual(['sorbaronia arsenii', 'mentha piperita']);
  });
});

describe('r81m: the import checks a named nothospecies (H to S)', () => {
  const look = (names: Record<string, { name: string; gbif?: number }>): Lookup => ({
    entries: async (slugs) => new Map(slugs.filter((s) => names[s]).map((s) => [s, { slug: s, ...names[s] }])),
    search: async () => []
  });
  it('"Mentha × piperita" is found by its page, with its key, as a species is', async () => {
    const out = await checkNames(['Mentha × piperita', '× Sorbaronia arsenii'], look({ 'mentha-piperita': { name: 'Mentha × piperita', gbif: 5341345 }, 'sorbaronia-arsenii': { name: '× Sorbaronia arsenii' } }));
    expect(out.get('Mentha × piperita')).toEqual({ s: 'found', slug: 'mentha-piperita', refName: 'Mentha × piperita', key: 5341345 });
    expect(out.get('× Sorbaronia arsenii')).toEqual({ s: 'found', slug: 'sorbaronia-arsenii', refName: '× Sorbaronia arsenii', key: null });
  });
  it('a cross written out is still filed under its genus, unasked', async () => {
    const out = await checkNames(['Aloe aristata × Aloe humilis'], look({}));
    expect([...out.values()]).toEqual([{ s: 'hybrid' }]);
  });
  it('a search hit named with the sign is the exact match of the name asked', () => {
    expect(readSearch('Mentha × piperita', true, [{ slug: 'mentha-piperita', name: 'Mentha × piperita', gbif: 7 }])).toEqual({ s: 'found', slug: 'mentha-piperita', refName: 'Mentha × piperita', key: 7 });
    expect(readSearch('Mentha × piperitta', true, [{ slug: 'mentha-piperita', name: 'Mentha × piperita', gbif: 7 }])).toMatchObject({ s: 'near', why: 'spelling', suggestion: 'Mentha × piperita' });
  });
});

describe("r81m: the Wikidata names' line, A's and B's words (D4)", () => {
  const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
  it('says the names not shown where none is shown, and whose spelling it is where one is', () => {
    const line = page.split('\n').find((l) => l.includes('id="names-source"')) ?? '';
    expect(line).toContain('a search for it finds this page. It is not among the English names under the heading'); // round eighty-four (W12)
    expect(line).toContain('<b>English names</b> as Wikidata spells them');
    expect(line).toContain('not corrected here');
    expect(line).not.toContain('English names from Wikidata,');
    expect(page.match(/id="names-source"/g)?.length).toBe(3);
  });
});
