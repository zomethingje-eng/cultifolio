/**
 * Round seventy-seven (C; docs/review-77/C.md): the CPU and memory of a species page the Worker's cache does not hold.
 *
 * 1. A species page reads its address and its card, and its near species' cards, from small card files (`cards/<h>.json`),
 *    and never the files of accepted and older names (`older/<h>.json`), which an address that is no page's reads.
 *    Round seventy-six read one name file of 113 KB (at 8,947 species) for each, two thirds of it older names.
 * 2. A manifest of round seventy-six's layout (`names/`, no `cards/`) is read through the index, as any corpus built
 *    before the lookup files: the same page either way, so deploy and upload may come in either order.
 * 3. The page carries the open records' places (`points`) and the count of their datasets, never the records, the
 *    dataset list or the two maps drawn: the page draws the maps from what it carries (proved page for page on the real
 *    corpus by scripts/dev/scale/r77c-page-proof.mjs).
 * 4. The parsed products an isolate holds stay under twelve megabytes of text, not twenty-four.
 *
 * FAILS on r77base: there are no card files (the page read `names/`), the page data held `worldSvg`, `regionSvg` and
 * every open record, and the products held reached 24 MB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as dossiers from '$lib/server/dossiers';
import { corpusNow, _forgetIndex, fromFiles, product, type IndexEntry, type Loaded } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, type Manifest } from '$dossier/manifest';
import { cardFilesFor, olderFilesFor } from '$dossier/lookups';
import { dossierPath } from '$dossier/schema';
import { before77 } from './helpers/before-r77';
import { slugify, genusOf } from '$core/names';
import { resetRateLimits } from '$lib/server/sync';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';

const e = (key: number, name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key, slug: slugify(name), name, family: 'Asphodelaceae', origin: ['Cape Provinces'], photos: 9, open: key % 97, climate: 'ok', thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${key}/medium.jpg`, credit: 'CC BY, someone', changed: 20_000, ...o });
const IDX: IndexEntry[] = [
  e(11, 'Aloe arborescens', { syn: ['Aloe fruticosa'], near: [12, 13, 31] }),
  e(12, 'Aloe ferox', { syn: ['Aloe horrida'], common: 'Bitter aloe' }),
  e(13, 'Aloe vera', { syn: ['Aloe barbadensis'], climate: 'none' }),
  e(31, 'Gasteria carinata', { syn: ['Aloe carinata'] })
];
const template = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8'));
const dossierOf = (x: IndexEntry) => JSON.stringify({ ...template, key: x.key, slug: x.slug, name: { ...template.name, scientific: x.name, genus: genusOf(x.name), synonyms: x.syn ?? [] } });

function bucket(m: Map<string, string>) {
  const reads: string[] = [];
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { m, reads, get: async (k: string) => { reads.push(k); return m.has(k) ? obj(k) : null; }, head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
/** The corpus as the build writes it, or (`r76`) under round seventy-six's layout: one `names/` product where this round writes `cards/` and `older/`, and no search files. */
function corpus(r76 = false) {
  const p = buildProducts(IDX, JSON.stringify(IDX), () => new Map(), '2026-10-18T00:00:00Z', [], (k) => IDX.find((x) => x.key === k)?.syn);
  let manifest: Manifest = p.manifest;
  // The search's key files (K, round seventy-seven), stored by hash and named by its directories, not the manifest.
  const files = new Map([...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string]), ...[...p.stored].map(([h, body]) => [productPath(h), body] as [string, string])]);
  if (r76) {
    // Round seventy-six's manifest named neither this round's card files nor its search files.
    const rest = Object.entries(before77(manifest).files).filter(([n]) => !/^(cards|older)\//.test(n));
    const names = Array.from({ length: 64 }, (_, i) => [`names/${i}.json`, `${'0'.repeat(30)}${String(i).padStart(2, '0')}`] as [string, string]);
    for (const [, h] of names) files.set(productPath(h), '{}');
    manifest = { ...manifest, id: 'r76layout000000', files: Object.fromEntries([...rest, ...names]) };
  }
  const m = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)], ...files, ...IDX.map((x) => [dossierPath(x.key), dossierOf(x)] as [string, string])]);
  return { manifest, store: bucket(m) };
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const platformOf = (store: ReturnType<typeof bucket>) => ({ env: { STORE: store } }) as unknown as App.Platform;
const speciesEvent = (c: Loaded, platform: App.Platform, slug: string) => {
  const url = new URL(`https://cultifolio.com/species/${slug}`);
  return { params: { slug }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.7', locals: { corpus: c } } as never;
};
const settle = async <T,>(p: Promise<T> | T) => { try { return { ok: JSON.parse(JSON.stringify(await p)) }; } catch (x) { const y = x as { status?: number; location?: string }; return { status: y.status, location: y.location }; } };
/** The products a request read, by the name the manifest gives each. */
const namesRead = (store: ReturnType<typeof bucket>, manifest: Manifest) => { const by = new Map(Object.entries(manifest.files).map(([n, h]) => [productPath(h), n])); return store.reads.map((k) => by.get(k) ?? k); };

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('a species page the cache does not hold (round seventy-seven)', () => {
  it('reads its address, its card and its near species from the card files, and no file of names', async () => {
    const { store, manifest } = corpus();
    expect(Object.keys(manifest.files).filter((n) => n.startsWith('cards/')).length).toBe(cardFilesFor(IDX.length));
    expect(Object.keys(manifest.files).filter((n) => n.startsWith('older/')).length).toBe(olderFilesFor(IDX.length));
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    expect(fromFiles(c)).toBe(true);
    store.reads.length = 0;
    const page = await settle(speciesLoad(speciesEvent(c, platform, 'aloe-arborescens')));
    expect(page.ok?.d.name.scientific).toBe('Aloe arborescens');
    // the near species with a derived climate, from their own cards
    expect(page.ok.near.map((x: { slug: string }) => x.slug)).toEqual(['aloe-ferox', 'gasteria-carinata']);
    const read = namesRead(store, manifest);
    expect(read.some((n) => n.startsWith('cards/'))).toBe(true);
    expect(read.filter((n) => /^(older|names)\/|^index\.json$/.test(n))).toEqual([]);
    // an older name's address reads the files of names, and moves to its species
    store.reads.length = 0;
    expect(await settle(speciesLoad(speciesEvent(c, platform, 'aloe-fruticosa')))).toMatchObject({ status: 302, location: '/species/aloe-arborescens?was=Aloe%20fruticosa' });
    expect(namesRead(store, manifest).some((n) => n.startsWith('older/'))).toBe(true);
    // An address that is no page's (the merge of K and C): a 404 whose suggestions come from the search's files (without
    // them the search answers 503 and the 404 suggests nothing), and no postings read. (This index of four species is
    // byte for byte its one show block, so the two share a hash and a read of it cannot be told from the block's here;
    // r77k-search-files proves the index is never read.)
    store.reads.length = 0;
    const miss = await Promise.resolve(speciesLoad(speciesEvent(c, platform, 'aloe-arborescen'))).then(() => null, (x: { status?: number; body?: { species?: { suggest?: { slug: string }[] } } }) => x);
    expect(miss?.status).toBe(404);
    expect(miss?.body?.species?.suggest?.map((x) => x.slug)).toContain('aloe-arborescens');
    expect(namesRead(store, manifest).filter((n) => /^postings\/|^short\.json$/.test(n))).toEqual([]);
  });

  it("a manifest of round seventy-six's layout is read through its index, and the page is the same", async () => {
    const now = corpus();
    const c1 = await corpusNow(platformOf(now.store), noStatic);
    const a = await settle(speciesLoad(speciesEvent(c1, platformOf(now.store), 'aloe-arborescens')));
    _forgetIndex();
    const then = corpus(true);
    const c2 = await corpusNow(platformOf(then.store), noStatic);
    expect(fromFiles(c2)).toBe(false);
    expect(c2.idx?.length).toBe(IDX.length);
    const b = await settle(speciesLoad(speciesEvent(c2, platformOf(then.store), 'aloe-arborescens')));
    expect(b).toEqual(a);
    expect(namesRead(then.store, then.manifest).filter((n) => n.startsWith('names/'))).toEqual([]);
  });

  it('carries the points and the count of datasets, never the open records, the datasets or the maps drawn', async () => {
    const { store } = corpus();
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    const page = (await settle(speciesLoad(speciesEvent(c, platform, 'aloe-ferox')))).ok;
    expect(page).not.toHaveProperty('worldSvg');
    expect(page).not.toHaveProperty('regionSvg');
    expect(page.d.occurrences).not.toHaveProperty('open');
    expect(page.d.occurrences).not.toHaveProperty('datasets');
    expect(page.points).toEqual(template.occurrences.open.map((p: number[]) => [p[0], p[1]]));
    expect(page.points.length).toBe(52);
    expect(page.datasets).toBe(template.occurrences.datasets.length);
    expect(page.d.occurrences.nOpenInRange).toBe(template.occurrences.nOpenInRange);
  });
});

describe('the parsed products an isolate holds (round seventy-seven)', () => {
  it('stay under twelve megabytes of text, however many are read', async () => {
    const files: Record<string, string> = {};
    const m = new Map<string, string>();
    for (let i = 0; i < 30; i++) {
      const h = `${'a'.repeat(28)}${String(i).padStart(4, '0')}`;
      files[`catalogue/x-${i}.json`] = h;
      m.set(productPath(h), JSON.stringify({ i, pad: 'x'.repeat(1024 * 1024) }));
    }
    const store = bucket(m);
    const c = { at: Date.now(), idx: null, bySlug: null, corpus: 'test', etag: null, fromStore: true, manifest: { v: 2, id: 'test', built: '', species: 1, buckets: 32, postings: 64, files } as Manifest, buckets: 32 } as Loaded;
    for (let i = 0; i < 30; i++) expect(((await product<{ i: number }>(c, platformOf(store), noStatic, `catalogue/x-${i}.json`)) ?? { i: -1 }).i).toBe(i);
    const held = dossiers._productsHeld();
    expect(dossiers._PRODUCTS_BYTES).toBe(12 * 1024 * 1024);
    expect(held.chars).toBeLessThanOrEqual(12 * 1024 * 1024);
    expect(held.count).toBeGreaterThanOrEqual(10);
  });
});
