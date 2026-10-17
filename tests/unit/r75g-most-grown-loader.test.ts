/**
 * Round seventy-five, agent G: the loader of the most-grown genera (`scripts/most-grown-genera-lib.ts`), on recorded
 * answers and never the network. iNaturalist's rows are trimmed from its real answers of 17 October 2026
 * (`fixtures/r75g-inat.json`); the tests add filler genera to make a full page of the listing, and one constructed
 * homonym. What it checks: the names are resolved by rule 3 (one active genus in Plantae of exactly that name, a homonym
 * or no match refused with its reason), the count is the tree's `descendant_obs_count`, a genus the tree does not name is
 * asked on its own, and a request that failed is "not checked", never 0, in the file and as the app reads it back.
 * On r75base the modules do not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mostGrown, formatList, resolveGenus, generaByName, readTree, taxaUrl, countUrl, TREE_URL, TAXA_PAGE, type Fetch, type TaxonRow, type TreeRow } from '../../scripts/most-grown-genera-lib';
import { parseMostGrown } from '$lib/ui/ref/most-grown-rule';
import type { FetchResult } from '$dossier/fetch';

const rec = JSON.parse(readFileSync('tests/unit/fixtures/r75g-inat.json', 'utf8')) as { taxa: TaxonRow[]; tree: TreeRow[]; copiapoaTotal: number };
/** Filler genera, so the listing runs to a second page as the real one does (ids below the real ones, names no reference genus has). */
const filler = (n: number): TaxonRow[] => Array.from({ length: n }, (_, i) => ({ id: 1000 + i, name: `Fillera${i}`, rank: 'genus', is_active: true, ancestor_ids: [48460, 47126, 1000 + i] }));
/** A constructed homonym: a second active genus in Plantae named Melaleuca. */
const twin: TaxonRow = { id: 9_000_001, name: 'Melaleuca', rank: 'genus', is_active: true, ancestor_ids: [48460, 47126, 9_000_001] };
/** An animal genus of a reference genus's name: not in Plantae, so no homonym. */
const animal: TaxonRow = { id: 9_000_002, name: 'Rosa', rank: 'genus', is_active: true, ancestor_ids: [48460, 1, 9_000_002] };

type Answers = Record<string, FetchResult<unknown>>;
function served(answers: Answers): { f: Fetch; asked: string[] } {
  const asked: string[] = [];
  const f: Fetch = async <T>(url: string) => {
    asked.push(url);
    const a = answers[url];
    if (!a) throw new Error(`not recorded: ${url}`);
    return a as FetchResult<T>;
  };
  return { f, asked };
}
const ok = (data: unknown): FetchResult<unknown> => ({ status: 'ok', data });

/** The listing in two pages, paged by id as the script asks it. */
function listing(rows: TaxonRow[]): Answers {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const first = sorted.slice(0, TAXA_PAGE), second = sorted.slice(TAXA_PAGE);
  return { [taxaUrl(0)]: ok({ total_results: rows.length, results: first }), [taxaUrl(first[first.length - 1].id)]: ok({ total_results: second.length, results: second }) };
}
const GENERA = ['Rosa', 'Welwitschia', 'Copiapoa', 'Allium', 'Callistemon', 'Mahonia', 'Melaleuca', 'Refusia'];

describe('round seventy-five: the most-grown genera, read from iNaturalist', () => {
  it('resolves by rule 3 and counts each genus with every taxon under it; a genus the tree does not name is asked on its own', async () => {
    const rows = [...rec.taxa, ...filler(TAXA_PAGE), twin, animal];
    const { f, asked } = served({ ...listing(rows), [TREE_URL]: ok({ size: rec.tree.length, results: rec.tree }), [countUrl(357923)]: ok({ total_results: rec.copiapoaTotal, results: [] }) });
    const r = await mostGrown({ fetchJson: f, genera: GENERA });
    const by = new Map(r.lines.map((l) => [l.name, l]));
    expect(by.get('Rosa')).toEqual({ kind: 'genus', name: 'Rosa', id: 53438, count: 232508 }); // the animal Rosa is not in Plantae
    expect(by.get('Allium')).toEqual({ kind: 'genus', name: 'Allium', id: 47357, count: 53397 }); // the inactive Allium (960090) is not taken
    expect(by.get('Welwitschia')).toEqual({ kind: 'genus', name: 'Welwitschia', id: 53818, count: 263 });
    expect(by.get('Copiapoa')).toEqual({ kind: 'genus', name: 'Copiapoa', id: 357923, count: 140 });
    expect(by.get('Melaleuca')).toEqual({ kind: 'refused', name: 'Melaleuca', why: 'homonym: 2 active genera in Plantae are named Melaleuca (taxa 72232, 9000001)' });
    expect(by.get('Callistemon')).toEqual({ kind: 'refused', name: 'Callistemon', why: 'no active genus in Plantae is named Callistemon; iNaturalist holds it only as an inactive taxon (82467)' });
    expect(by.get('Refusia')).toEqual({ kind: 'refused', name: 'Refusia', why: 'no active genus in Plantae is named Refusia' });
    // Two pages of names, the tree, and Copiapoa alone: nothing else asked.
    expect(asked).toEqual([taxaUrl(0), taxaUrl(rows.filter((x) => x.id < 53438).sort((a, b) => a.id - b.id)[TAXA_PAGE - 1].id), TREE_URL, countUrl(357923)]);
    expect(r.names).toBe(rows.length);
  });

  it('a request that failed is "not checked", never 0; the file says so and the app reads no count from it', async () => {
    const rows = [...rec.taxa, ...filler(TAXA_PAGE)];
    // The tree refused: every resolved genus is asked on its own; Rosa's answers, Welwitschia's errs.
    const { f } = served({ ...listing(rows), [TREE_URL]: { status: 'refused', detail: 'api.inaturalist.org 503' }, [countUrl(53438)]: ok({ total_results: 232507, results: [] }), [countUrl(53818)]: { status: 'error', detail: 'api.inaturalist.org timeout' }, [countUrl(357923)]: ok({ total_results: 0, results: [] }), [countUrl(47357)]: ok({ total_results: 53397, results: [] }), [countUrl(72232)]: ok({ total_results: 67631, results: [] }) });
    const r = await mostGrown({ fetchJson: f, genera: GENERA });
    const text = formatList(r, { day: '2026-10-17', species: 9, genera: GENERA.length });
    expect(text).toContain('genus\tRosa\t53438\t232507\n');
    expect(text).toContain('genus\tWelwitschia\t53818\tnot checked\tthe count did not answer (error api.inaturalist.org timeout)\n');
    expect(text).toContain('genus\tCopiapoa\t357923\t0\n'); // an answer of none, asked on its own
    expect(text).toContain('refused\tCallistemon\tno active genus in Plantae is named Callistemon\n'); // without the tree, no inactive id to name
    expect(text).toMatch(/^day\t2026-10-17$/m);
    expect(text).toMatch(/^terms\t.*Terms of Use \(https:\/\/www\.inaturalist\.org\/pages\/terms\)/m);
    expect(text).toMatch(/^query\thttps:\/\/api\.inaturalist\.org\/v1\/observations\/taxonomy\?captive=true&taxon_id=47126 /m);
    const m = parseMostGrown(text);
    expect(m.day).toBe('2026-10-17');
    expect(m.counts.get('Rosa')).toEqual({ id: 53438, n: 232507 });
    expect(m.counts.get('Copiapoa')).toEqual({ id: 357923, n: 0 });
    expect(m.counts.has('Welwitschia')).toBe(false);
    expect(m.notChecked.has('Welwitschia')).toBe(true);
    expect(m.refused.get('Refusia')).toBe('no active genus in Plantae is named Refusia');
    // The lines are in order: counted most observed first, then not checked, then refused.
    const kinds = text.split('\n').filter((l) => /^(genus|refused)\t/.test(l)).map((l) => (l.startsWith('refused') ? 'r' : l.includes('not checked') ? 'n' : 'c')).join('');
    expect(kinds).toMatch(/^c+n+r+$/);
  });

  it('a listing that does not add up, or a page that failed, resolves nothing: every genus is "not checked", none refused', async () => {
    const rows = [...rec.taxa, ...filler(TAXA_PAGE)];
    const short = listing(rows);
    const first = Object.keys(short)[0];
    (short[first] as { data: { total_results: number } }).data.total_results = rows.length + 1; // a genus more than the pages give
    const { f } = served({ ...short, [TREE_URL]: ok({ size: rec.tree.length, results: rec.tree }) });
    const r = await mostGrown({ fetchJson: f, genera: GENERA });
    expect(r.lines.every((l) => l.kind === 'genus' && l.count === null)).toBe(true);
    expect(formatList(r, { day: '2026-10-17', species: 9, genera: 8 })).toContain("genus\tRosa\t-\tnot checked\tiNaturalist's list of genera was not read\n");
    const { f: g } = served({ [taxaUrl(0)]: { status: 'refused', detail: 'api.inaturalist.org 429' }, [TREE_URL]: ok({ size: 0, results: [] }) });
    const r2 = await mostGrown({ fetchJson: g, genera: GENERA });
    expect(r2.lines.filter((l) => l.kind === 'refused')).toEqual([]);
    expect(parseMostGrown(formatList(r2, { day: '2026-10-17', species: 9, genera: 8 })).counts.size).toBe(0);
  });

  it('a tree cut short is not read as counts of none', () => {
    expect(readTree({ size: rec.tree.length + 5, results: rec.tree })).toBeNull();
    expect(readTree({ size: rec.tree.length, results: rec.tree })?.counts.get(53438)).toBe(232508);
  });

  it('rule 3 on its own: exactly one active Plantae genus of exactly that name', () => {
    const by = generaByName([...rec.taxa, twin, animal, { id: 5, name: 'Rosa', rank: 'species', is_active: true, ancestor_ids: [47126] }, { id: 6, name: 'Copiapoa', rank: 'genus', is_active: false, ancestor_ids: [47126] }]);
    expect(resolveGenus('Rosa', by)).toEqual({ id: 53438 });
    expect(resolveGenus('Copiapoa', by)).toEqual({ id: 357923 });
    expect(resolveGenus('rosa', by)).toEqual({ why: 'no active genus in Plantae is named rosa' }); // exactly that name
    expect('why' in resolveGenus('Melaleuca', by)).toBe(true);
  });
});
