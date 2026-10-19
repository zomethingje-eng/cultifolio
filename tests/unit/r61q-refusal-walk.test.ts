/**
 * Corpus review of round sixty: every route that reads the reference, walked under each way the bucket can fail.
 * A guard, adopted in round sixty-one from docs/review-60/tests/corpus--refusal-walk.test.ts as it was (one type-only
 * change: a route's answer is wrapped in Promise.resolve for svelte-check). It passed on the base and passes now,
 * including finding 13's case, an `it.fails` until round sixty-two (the sheets of a species whose dossier is unreadable
 * were left out, which a device read as "not in the reference"); since round sixty-two the bucket is answered 503.
 *
 * The bucket can (A) hold a manifest this build refuses and no top-level index, (B) throw on every call, with nothing
 * held. Each route must answer 503 (a Kit error or a Response), never 200 with the fixture's species, never 404 or an
 * empty list ("nothing matches"; rule 2). The front page reads no species' dossier since round seventy-four, when its
 * one species shown whole went (the owner's decision), so no dossier's failure can touch it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _forgetIndex, corpusNow } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { dossierPath } from '$dossier/schema';
import { md5 } from '$dossier/md5';
import { resetRateLimits } from '$lib/server/sync';
import { readFileSync } from 'node:fs';
import { bucketOf } from '$core/bucket';

const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function bucket(init: Iterable<[string, string]> = [], throws = false) {
  const m = new Map(init);
  return {
    get: async (k: string) => { if (throws) throw new Error('R2 internal error'); return m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null; },
    head: async (k: string) => { if (throws) throw new Error('R2 internal error'); return m.has(k) ? { etag: md5(m.get(k)!) } : null; }
  };
}
const plat = (b: ReturnType<typeof bucket>) => ({ env: { STORE: b } }) as unknown as App.Platform;
const status = async (p: Promise<unknown>): Promise<number> => {
  try { const r = await p; return r instanceof Response ? r.status : 200; } catch (e) { return (e as { status?: number }).status ?? 500; }
};
const ev = (path: string, platform: App.Platform, extra: Record<string, unknown> = {}) => {
  const url = new URL(`https://cultifolio.com${path}`);
  return { url, platform, fetch: noStatic, request: new Request(url), getClientAddress: () => '9.9.9.9', setHeaders: () => {}, cookies: { get: () => undefined }, locals: {}, params: {}, isDataRequest: false, ...extra } as never;
};

/** Every route that reads the reference, as a request to make: its name and the call. */
async function routes(p: App.Platform) {
  const home = (await import('../../src/routes/+page.server')).load;
  const species = (await import('../../src/routes/species/[slug]/+page.server')).load;
  const compare = (await import('../../src/routes/compare/+page.server')).load;
  const search = (await import('../../src/routes/api/search/+server')).GET;
  const entries = (await import('../../src/routes/api/entries/+server')).GET;
  const sheets = (await import('../../src/routes/api/sheets/+server')).GET;
  const rows = (await import('../../src/routes/api/rows/+server')).GET;
  const dossier = (await import('../../src/routes/api/dossier/[key]/+server')).GET;
  const corpus = (await import('../../src/routes/api/corpus/+server')).GET;
  const index = (await import('../../src/routes/api/index/+server')).GET;
  const sitemap = (await import('../../src/routes/sitemap.xml/+server')).GET;
  const chunk = (await import('../../src/routes/sitemap-[n].xml/+server')).GET;
  return {
    home: () => home(ev('/', p)),
    species: () => species(ev('/species/welwitschia-mirabilis', p, { params: { slug: 'welwitschia-mirabilis' } })),
    compare: () => compare(ev('/compare?s=welwitschia-mirabilis', p)),
    search: () => search(ev('/api/search?q=welwitschia', p)),
    entries: () => entries(ev('/api/entries?b=00&n=32', p)),
    sheets: () => sheets(ev('/api/sheets?b=00&n=32', p)),
    rows: () => rows(ev('/api/rows?by=genus&at=0&n=10', p)),
    dossier: () => dossier(ev('/api/dossier/5411106', p, { params: { key: '5411106' } })),
    corpus: () => corpus(ev('/api/corpus', p)),
    index: () => index(ev('/api/index', p)),
    sitemap: () => sitemap(ev('/sitemap.xml', p)),
    sitemapChunk: () => chunk(ev('/sitemap-1.xml', p, { params: { n: '1' } }))
  };
}

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('a corpus that cannot be read is a 503 on every route (rule 2), never the fixture', () => {
  for (const [label, make] of [
    ['A: a refused manifest and no top-level index', () => bucket([[manifestPath(), '{"v":99}']])],
    ['B: R2 throws on every call, nothing held', () => bucket([], true)]
  ] as const) {
    it(label, async () => {
      const r = await routes(plat(make()));
      const got: Record<string, number> = {};
      for (const [name, call] of Object.entries(r)) { _forgetIndex(); got[name] = await status(Promise.resolve(call())); }
      expect(got).toEqual(Object.fromEntries(Object.keys(r).map((k) => [k, 503])));
    });
  }
});

describe('a dossier the index lists but cannot be read', () => {
  const W = { key: 5411106, slug: 'welwitschia-mirabilis', name: 'Welwitschia mirabilis', family: 'Welwitschiaceae', open: 900, photos: 20, climate: 'ok', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' };
  const idx = [W];
  const { manifest, files, stored } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  const withManifest = () => bucket([[manifestPath(), JSON.stringify(manifest)], ...[...files].map(([n, body]) => [productPath(manifest.files[n]), body] as [string, string]), ...[...stored].map(([h, b]) => [productPath(h), b] as [string, string])]);

  // Round seventy-four (the owner's decision 3): the front page's "This is what a species page with a habitat climate
  // shows" is gone, and with it the one dossier read the front page made. On r74base the load read the first strip
  // species' dossier and sent `feature`.
  it('the front page reads no species dossier and sends no feature, its strip whole either way', async () => {
    const { load } = await import('../../src/routes/+page.server');
    const b = bucket([[manifestPath(), JSON.stringify(manifest)], ...[...files].map(([n, body]) => [productPath(manifest.files[n]), body] as [string, string]), ...[...stored].map(([h, b]) => [productPath(h), b] as [string, string]), [dossierPath('k339841'), readFileSync('fixtures/dossiers/s/v3/k339841.json', 'utf8')]]);
    const asked: string[] = [];
    const get = b.get;
    b.get = async (k: string) => { asked.push(k); if (k === dossierPath('k339841')) throw new Error('R2 internal error'); return get(k); };
    _forgetIndex();
    const page = (await load(ev('/', plat(b)))) as Record<string, unknown> & { featured: unknown[] };
    expect(page.featured.length).toBe(1); // W is the pool: eight photographs or more, a thumbnail, a climate
    expect('feature' in page).toBe(false);
    expect(asked.filter((k) => k === dossierPath('k339841'))).toEqual([]);
  });
  it('without a manifest, a bucket whose species cannot be read is answered 503, never left without it (finding 13, fixed in round sixty-two)', async () => {
    const b = bucket([['s/v3/index.json', JSON.stringify(idx)]]);
    const c = await corpusNow(plat(b), noStatic);
    const { GET } = await import('../../src/routes/api/sheets/+server');
    const r = await GET(ev(`/api/sheets?b=${bucketOf(W.slug, c.buckets)}&n=${c.buckets}`, plat(b)));
    // A refusal should be a 503 for the bucket (or the species marked unreadable), never an answer without it.
    expect(r.status).toBe(503);
  });
});
