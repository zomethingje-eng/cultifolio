/**
 * Round 133 (SPECIES 23 with HANDOFF round 8; docs/PLAN-133.md): literature by the name in the title, with a DOI.
 *
 * - The three asks: the name as a phrase in the title, the four work types, a DOI; the most cited, the newest, the years.
 * - A dataset is never listed; a work without a DOI is never listed; a work whose title does not name the species is not.
 * - The two lists share no paper; the decade counts sum to "All N".
 * - A book chapter or a preprint says so; "free to read" only where OpenAlex says the work is.
 * - The key goes in the query only when one is given, and the dossier's papers never hold it.
 *
 * On fa85be4: FAILED (no titleLiterature; the build asked OpenAlex nothing).
 */
import { describe, it, expect } from 'vitest';
import { titleLiterature, titleQuery, titlePaper, decadesOf } from '../../src/lib/dossier/sources/openalex';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

const W = (o: Record<string, unknown>) => ({ title: 'Welwitschia mirabilis growth', doi: 'https://doi.org/10.1/x', publication_year: 2020, type: 'article', cited_by_count: 5, authorships: [{ author: { display_name: 'A. Author' } }], primary_location: { source: { display_name: 'A Journal' } }, ...o });

function fetcher(cited: unknown[], newest: unknown[], years: Array<{ key: string; count: number }>, count = 7): { f: JsonFetcher; asked: string[] } {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(url);
    if (url.includes('group_by=')) return { status: 'ok', data: { group_by: years } };
    if (url.includes('per-page=200')) return { status: 'ok', data: { meta: { count }, results: cited } };
    return { status: 'ok', data: { results: newest } };
  }) as unknown as JsonFetcher;
  return { f, asked };
}

describe('literature by the name in the title', () => {
  it('asks the name as a phrase in the title, the four types, with a DOI; the key only when given', () => {
    const q = titleQuery('Welwitschia mirabilis', 'all');
    expect(q).toContain('filter=title.search:%22Welwitschia%20mirabilis%22,type:article|review|book-chapter|preprint,has_doi:true');
    expect(q).toContain('sort=cited_by_count:desc&per-page=200');
    expect(q).not.toContain('api_key');
    expect(titleQuery('Welwitschia mirabilis', 'newest', 'K')).toContain('sort=publication_date:desc');
    expect(titleQuery('Welwitschia mirabilis', 'years', 'K')).toMatch(/group_by=publication_year&api_key=K$/);
  });
  it('never lists a dataset, a work without a DOI, a specimen, or a work whose title does not name it', () => {
    const n = 'Welwitschia mirabilis';
    expect(titlePaper(W({ doi: null }), n, 'cited')).toBeNull();
    expect(titlePaper(W({ doi: 'https://doi.org/10.15468/dl.abc' }), n, 'cited')).toBeNull();
    expect(titlePaper(W({ type: 'dataset' }), n, 'cited')).toBeNull();
    expect(titlePaper(W({ title: 'Herbarium specimen of Welwitschia mirabilis' }), n, 'cited')).toBeNull();
    expect(titlePaper(W({ title: 'Desert plants of Namibia' }), n, 'cited')).toBeNull();
    const p = titlePaper(W({ type: 'book-chapter', open_access: { is_oa: true } }), n, 'cited')!;
    expect(p).toMatchObject({ doi: '10.1/x', url: 'https://doi.org/10.1/x', kind: 'book chapter', free: true, cited: 5, venue: 'A Journal', list: 'cited' });
    expect(titlePaper(W({ open_access: { is_oa: false } }), n, 'cited')!.free).toBeUndefined();
  });
  it('a page of 200 works or fewer: one ask; the three most cited and the three newest share no paper; the decades sum to All N', async () => {
    const all = [
      ...[1, 2, 3].map((i) => W({ doi: `https://doi.org/10.1/c${i}`, cited_by_count: 100 - i, publication_year: 1990 + i })),
      ...[1, 2, 3].map((i) => W({ doi: `https://doi.org/10.1/n${i}`, cited_by_count: 10 - i, publication_year: 2026 - i })),
      W({ doi: 'https://doi.org/10.1/old', cited_by_count: 0, publication_year: 1863 }),
      W({ doi: null, cited_by_count: 50, publication_year: 2000 }) // counted by OpenAlex, never listed
    ];
    const { f, asked } = fetcher(all, [], [], all.length);
    const r = await titleLiterature(f, 'Welwitschia mirabilis', undefined);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(asked).toHaveLength(1);
    expect(r.data.papers.filter((p) => p.list === 'cited').map((p) => p.doi)).toEqual(['10.1/c1', '10.1/c2', '10.1/c3']);
    expect(r.data.papers.filter((p) => p.list === 'newest').map((p) => p.doi)).toEqual(['10.1/n1', '10.1/n2', '10.1/n3']);
    expect(r.data.decades).toEqual([[1860, 1], [1990, 3], [2000, 1], [2020, 3]]);
    expect(r.data.total).toBe(8);
    expect(JSON.stringify(r.data)).not.toContain('api_key');
  });
  it('a page of more than 200 works asks for its newest and its years too', async () => {
    const cited = [1, 2, 3, 4].map((i) => W({ doi: `https://doi.org/10.1/c${i}`, cited_by_count: 100 - i }));
    const newest = [W({ doi: 'https://doi.org/10.1/c1' }), ...[1, 2, 3].map((i) => W({ doi: `https://doi.org/10.1/n${i}` }))];
    const { f, asked } = fetcher(cited, newest, [{ key: '2019', count: 150 }, { key: '2024', count: 100 }], 250);
    const r = await titleLiterature(f, 'Welwitschia mirabilis', undefined);
    expect(asked).toHaveLength(3);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.data.papers.filter((p) => p.list === 'newest').map((p) => p.doi)).toEqual(['10.1/n1', '10.1/n2', '10.1/n3']);
    expect(r.data.total).toBe(250);
  });
  it('no work under the rule: none, after one ask', async () => {
    const { f, asked } = fetcher([], [], [], 0);
    expect((await titleLiterature(f, 'Ignota ignota', undefined)).status).toBe('none');
    expect(asked).toHaveLength(1);
  });
  it('decades fold years, oldest first, and leave out a year that is not one', () => {
    expect(decadesOf([{ key: '2001', count: 2 }, { key: '1999', count: 1 }, { key: 'unknown', count: 9 }])).toEqual([[1990, 1], [2000, 2]]);
  });
});

describe('the Literature section, as rendered', () => {
  it('the most cited and the newest, each DOI in full, "free to read" and a kind where they hold, the decades and All N', async () => {
    const { render } = await import('svelte/server');
    const Literature = (await import('$lib/ui/ref/Literature.svelte')).default;
    const p = (o: Record<string, unknown>) => ({ title: 'Welwitschia mirabilis growth', authors: ['A. Author'], venue: 'A Journal', year: 2020, doi: '10.1/x', url: 'https://doi.org/10.1/x', ...o });
    const papers = [p({ list: 'cited', doi: '10.1/c1', cited: 133, free: true }), p({ list: 'newest', doi: '10.1/n1', year: 2026, kind: 'preprint' })];
    const html = render(Literature, { props: { name: 'Welwitschia mirabilis', papers, counts: { total: 113, decades: [[1860, 1], [2010, 60], [2020, 52]] }, at: '2026-11-27T10:00:00Z' } as never }).body;
    const t = html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('Literature');
    expect(t).toContain('Most cited');
    expect(t).toContain('doi:10.1/c1');
    expect(t).toContain('cited 133 times');
    expect(t).toContain('free to read');
    expect(t).not.toMatch(/open access/i);
    expect(t).toContain('A Journal · preprint');
    expect(t).toContain('Papers by decade');
    expect(t).toContain('All 113 papers since the 1860s, on OpenAlex.');
    expect(t).toContain('nothing here is summarised');
    expect(html.match(/<span class="dec[ "]/g)).toHaveLength(3); // a bar for each decade
  });
});
