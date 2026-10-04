/**
 * Proposed by the round-59 harness review: tests that fail under mutations of the corpus, page-cache and species-page
 * fixes that the suite let through (ids from /tmp/review59/harness.md).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { handle } from '../../src/hooks.server';
import { _forgetIndex, corpusNow, searchAnswer } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { dossierPath } from '$dossier/schema';
import { prepare, search } from '$core/search';
import { clip } from '$core/text';

const mk = (names: string[], keys: Record<string, number> = {}) => names.map((name, i) => ({ key: keys[name] ?? 1000 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0 }));
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `"${h.toString(16)}"`; };
function products(idx: object[]) {
  const { manifest, files } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  return { manifest, blobs: new Map([...files].map(([name, body]) => [productPath(manifest.files[name]), body])) };
}
/** A bucket whose etag is the content's own hash, as R2's is: the manifest-refused test's etag (path and length) let two different manifests of one length look the same. */
function bucket(m: Map<string, string>) {
  const reads: string[] = [];
  return {
    reads,
    get: async (k: string) => { reads.push(k); return m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: hash(m.get(k)!) } : null; },
    head: async (k: string) => (m.has(k) ? { etag: hash(m.get(k)!) } : null)
  };
}
afterEach(() => vi.restoreAllMocks());

describe('one corpus per request, through the real loads (proposed)', () => {
  const A = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei'], { 'Copiapoa cinerea': 5384013 });
  const B = mk(['Adenia globosa', 'Aloe vera', 'Lithops lesliei', 'Welwitschia mirabilis']);
  function setup() {
    _forgetIndex();
    const a = products(A), b = products(B);
    const m = new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    m.set(dossierPath(5384013), readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8'));
    const T0 = Date.UTC(2026, 9, 4, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    const flip = () => { for (const [k, v] of b.blobs) m.set(k, v); m.set(manifestPath(), JSON.stringify(b.manifest)); vi.spyOn(Date, 'now').mockImplementation(() => T0 + 61_000); };
    const kept = new Map<string, Response>();
    const platform = { env: { STORE: bucket(m) }, caches: { default: { match: async () => undefined, put: async (r: Request, res: Response) => { kept.set(r.url, res); } } }, context: { waitUntil: () => {} } };
    return { a, b, platform, flip, kept };
  }
  it('S37/S38/S40: B lands right after the hook loads A: the key, the home query and the home page all read A', async () => {
    const { a, platform, flip, kept } = setup();
    // the refresh lands the moment the hook has stored its load
    const locals = new Proxy({} as App.Locals, { set: (t, k, v) => { (t as Record<string, unknown>)[k as string] = v; if (k === 'corpus') flip(); return true; } });
    const url = new URL('https://cultifolio.com/?by=genus&open=adenia');
    const event = { url, request: new Request(url), cookies: { get: () => undefined }, platform, fetch: noStatic, isDataRequest: false, locals };
    const { load } = await import('../../src/routes/+page.server');
    const r = await handle({
      event: event as never,
      resolve: async (e: typeof event) => {
        const page = (await load({ ...e, setHeaders: () => {} } as never)) as { rows: Array<{ id: string }> };
        return new Response(`<p>${page.rows.map((x) => x.id).join(',')}</p>`, { headers: { 'content-type': 'text/html' } });
      }
    } as never);
    expect(await r.text()).not.toContain('adenia');
    const [key] = [...kept.keys()];
    expect(new URL(key).searchParams.get('c')).toBe(a.manifest.id);
    expect(new URL(key).searchParams.get('q')).not.toContain('adenia');
  });
  it('S39/S41: the species page renders from the corpus the hook holds, even when the current one has dropped the species', async () => {
    const { a, platform, flip } = setup();
    const held = await corpusNow(platform as never, noStatic);
    expect(held.corpus).toBe(a.manifest.id);
    flip();
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const url = new URL('https://cultifolio.com/species/copiapoa-cinerea');
    const page = (await load({ params: { slug: 'copiapoa-cinerea' }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus: held } } as never)) as { d: { slug: string } };
    expect(page.d.slug).toBe('copiapoa-cinerea');
  });
});

describe('the species 404 that could not ask GBIF (proposed)', () => {
  it('S57: is not cached', async () => {
    _forgetIndex();
    const headers: Record<string, string> = {};
    const { load } = await import('../../src/routes/species/[slug]/+page.server');
    const url = new URL('https://cultifolio.com/species/nonsensia-fakeii');
    const down = (async (u: string) => (String(u).includes('api.gbif.org') ? new Response('busy', { status: 503 }) : new Response('', { status: 404 }))) as unknown as typeof fetch;
    await expect(load({ params: { slug: 'nonsensia-fakeii' }, platform: undefined, fetch: down, setHeaders: (h: Record<string, string>) => Object.assign(headers, h), cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.5', locals: {} } as never)).rejects.toMatchObject({ status: 404 });
    expect(headers['cache-control']).toBe('no-store');
  });
});

describe('the corpus load (proposed)', () => {
  const X = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
  const Y = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
  it('S50/S52: a valid manifest naming an index of another length is refused, and not fetched again each minute', async () => {
    _forgetIndex();
    const a = products(X), b = products(Y);
    const m = new Map<string, string>([...a.blobs, [manifestPath(), JSON.stringify(a.manifest)]]);
    const store = bucket(m);
    const platform = { env: { STORE: store } } as unknown as App.Platform;
    const T0 = Date.UTC(2026, 9, 3, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    expect((await corpusNow(platform, noStatic)).corpus).toBe(a.manifest.id);
    for (const [k, v] of b.blobs) m.set(k, v);
    m.set(manifestPath(), JSON.stringify({ ...b.manifest, files: { ...b.manifest.files, 'index.json': a.manifest.files['index.json'] } }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockImplementation(() => T0 + 61_000);
    store.reads.length = 0;
    const after = await corpusNow(platform, noStatic);
    expect(store.reads).toContain(manifestPath()); // the new manifest was read: the test is not vacuous
    expect({ corpus: after.corpus, species: after.idx.length }).toEqual({ corpus: a.manifest.id, species: X.length });
    store.reads.length = 0;
    for (let i = 2; i <= 4; i++) { vi.spyOn(Date, 'now').mockImplementation(() => T0 + i * 61_000); expect((await corpusNow(platform, noStatic)).corpus).toBe(a.manifest.id); }
    expect(store.reads).toEqual([]);
  });
  it('S46: a short.json whose positions are not this index\'s is not used', async () => {
    _forgetIndex();
    const idx = mk(['Aloe vera', 'Aloe ferox', 'Agave americana', 'Copiapoa cinerea']);
    const p = products(idx);
    p.blobs.set(productPath(p.manifest.files['short.json']!), JSON.stringify({ a: [99999, 5] }));
    const m = new Map<string, string>([...p.blobs, [manifestPath(), JSON.stringify(p.manifest)]]);
    const platform = { env: { STORE: bucket(m) } } as unknown as App.Platform;
    const got = await searchAnswer(platform, noStatic, 'a', 60, async () => null);
    if ('stop' in got) throw new Error('stopped');
    expect(got.hits.map((h) => h.key)).toEqual(search(prepare(idx), 'a', 60).map((h) => h.key));
  });
});

describe('/api/dossier (proposed)', () => {
  it('S53: public only when asked under the current corpus id', async () => {
    _forgetIndex();
    await corpusNow(undefined, noStatic); // warm: getDossier serves the fixtures only once the fixture corpus is loaded
    const { GET } = await import('../../src/routes/api/dossier/[key]/+server');
    const ask = async (q: string) => (await GET({ params: { key: '5384013' }, platform: undefined, fetch: noStatic, getClientAddress: () => '1.2.3.6', url: new URL(`https://x/api/dossier/5384013${q}`) } as never)).headers.get('cache-control');
    expect(await ask('')).toBe('no-store');
    expect(await ask('?c=someoldcorpus')).toBe('no-store');
    expect(await ask('?c=fixture')).toBe('public, max-age=3600');
  });
});

describe('clip (proposed)', () => {
  it('S58: cuts at the last space, never inside a word', () => {
    expect(clip('abcdefghijklmn opqrstuvwxyz', 20)).toBe('abcdefghijklmn…');
    const w = 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch, who described it in 1859.';
    for (const n of [40, 77, 101, 155]) {
      const c = clip(w, n).slice(0, -1);
      expect(/[\s,.;:]/.test(w[c.length] ?? ' '), `${n}: ${c}`).toBe(true);
    }
  });
});
