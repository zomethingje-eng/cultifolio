/**
 * Round eighty-five (K): a plant finds its page by its key when its name has none (review-c C4, review-s S2).
 *
 * The build files a copy of a page's sheet under GBIF's name for the page's key (`via: 'gbif'`, with the page's own
 * address in `page`). `sheetForNameOr` takes that copy for a plant of the page's own key, and for no other: a plant of
 * another key, or of none, under that name is not given the page. A merged page's old address (`via: 'merged'`, or no
 * mark, as round seventy-three wrote it) answers as before. And the products put GBIF's name in the sheets only, never in
 * the entries, which answer any plant by its name.
 *
 * FAILS on r85base: a plant of another key under GBIF's name is given the page (the copy is taken whatever the key), and
 * the entries carry GBIF's name too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bucketOf } from '$core/bucket';
import { buildProducts } from '$lib/dossier/products';
import type { IndexEntry } from '$lib/dossier/index-entry';

const sheet = (o: Record<string, unknown>) => ({ key: 'k506502', gbif: 9269454, slug: 'hoodia-alstonii', name: { scientific: 'Hoodia alstonii', family: 'Apocynaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' }, ...o });
let sheets: unknown[] = [];
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('fetch', async (u: string) => {
    if (u.startsWith('/api/corpus')) return new Response(JSON.stringify({ id: 'c1', buckets: 32 }), { headers: { 'content-type': 'application/json' } });
    if (u.startsWith('/api/sheets')) return new Response(JSON.stringify(sheets), { headers: { 'content-type': 'application/json' } });
    throw new Error(`unexpected ${u}`);
  });
});
afterEach(() => vi.unstubAllGlobals());
async function fresh() {
  vi.resetModules();
  return import('$lib/ui/index.svelte');
}

describe('a sheet under GBIF\'s name for a page\'s key', () => {
  it('answers a plant of that key', async () => {
    sheets = [sheet({ slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' })];
    const ix = await fresh();
    const s = await ix.sheetForNameOr('Ceropegia alstonii', 9269454);
    expect(s !== 'none' && !ix.isUnreached(s) && [s.name.scientific, s.page]).toEqual(['Hoodia alstonii', 'hoodia-alstonii']);
  });
  it('and no plant of another key, nor one of none', async () => {
    sheets = [sheet({ slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' })];
    const ix = await fresh();
    expect(await ix.sheetForNameOr('Ceropegia alstonii', 5525665)).toBe('none'); // base: Hoodia alstonii's sheet
    expect(await ix.sheetForNameOr('Ceropegia alstonii', null)).toBe('none'); // base: Hoodia alstonii's sheet
  });
  it('a merged page\'s old address answers as before', async () => {
    sheets = [sheet({ key: 'k2781125', gbif: undefined, slug: 'echeveria-peacockii', name: { scientific: 'Echeveria desmetiana' } })];
    const ix = await fresh();
    const s = await ix.sheetForNameOr('Echeveria peacockii', 3084000);
    expect(s !== 'none' && !ix.isUnreached(s) && s.name.scientific).toBe('Echeveria desmetiana');
  });
});

describe('the products', () => {
  it('put GBIF\'s name for a page\'s key in the sheets\' aliases only, never in the entries', () => {
    const e = (key: string, slug: string, name: string) => ({ key, slug, name, family: 'Apocynaceae', open: 1 }) as unknown as IndexEntry;
    const index = [e('k506502', 'hoodia-alstonii', 'Hoodia alstonii'), e('k2', 'huernia-zebrina', 'Huernia zebrina')];
    const p = buildProducts(index, JSON.stringify(index), () => new Map(), '2026-10-31T00:00:00Z', [{ slug: 'ceropegia-alstonii', key: 'k506502', via: 'gbif' }, { slug: 'huernia-confusa', key: 'k2' }]);
    const entries = [...p.files.entries()].filter(([n]) => n.startsWith('entries/')).flatMap(([, body]) => JSON.parse(body) as IndexEntry[]);
    expect(entries.map((x) => x.slug).sort()).toEqual(['hoodia-alstonii', 'huernia-confusa', 'huernia-zebrina']); // base: ceropegia-alstonii too
    expect(entries.find((x) => x.slug === 'huernia-confusa')?.key).toBe('k2');
    expect(bucketOf('ceropegia-alstonii', 32)).toMatch(/^[0-9a-f]{2}$/);
  });
});
