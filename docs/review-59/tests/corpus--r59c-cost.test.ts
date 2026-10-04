/** Round 59 corpus reviewer: per-request CPU and memory of the heavy reference paths at 9,000 species, in Node. */
import { describe, it, expect } from 'vitest';
import { corpusNow, _forgetIndex, searchAnswer, searchWhole, entriesIn } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { sitemapUrls, sitemapChunk } from '$lib/server/sitemap';
import { load as homeLoad } from '../../src/routes/+page.server';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';
import { synthIndex, reseed, rnd } from './r59c-synth';
import { readFileSync, writeFileSync } from 'node:fs';
import { bucketOf } from '$core/bucket';
import { genusOf, slugify } from '$core/names';

const gc = () => { (globalThis as { gc?: () => void }).gc?.(); };
const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed; };
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const MB = (b: number) => Math.round(b / 1e5) / 10;

async function time<T>(f: () => Promise<T> | T, runs = 5): Promise<{ ms: number; max: number; v: T }> {
  let v!: T; const xs: number[] = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); v = await f(); xs.push(performance.now() - t); }
  xs.sort((a, b) => a - b);
  return { ms: Math.round(xs[Math.floor(xs.length / 2)] * 10) / 10, max: Math.round(xs[xs.length - 1] * 10) / 10, v };
}

describe('cost at 9,000 species', () => {
  it('measures', async () => {
    reseed(99);
    const { idx } = synthIndex(9000);
    for (const e of idx) { e.thumb = `https://inaturalist-open-data.s3.amazonaws.com/photos/${100000 + rnd(9e6)}/medium.jpg`; e.near = Array.from({ length: 6 }, () => idx[rnd(idx.length)].key); }
    const text = JSON.stringify(idx, null, 1);
    const t0 = performance.now();
    const { manifest, files } = buildProducts(idx as never, text, () => new Map());
    const buildMs = performance.now() - t0;
    const blobs = new Map<string, string>();
    blobs.set(manifestPath(), JSON.stringify(manifest));
    for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
    const fixture = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8'));
    const aloe = idx.find((e) => e.name.startsWith('Aloe ') && !e.name.includes('×'))!;
    blobs.set(`s/v2/${aloe.key}.json`, JSON.stringify({ ...fixture, key: aloe.key, slug: aloe.slug, name: { ...fixture.name, scientific: aloe.name } }));
    const sizes: Record<string, number> = {};
    for (const [name, body] of files) { const k = name.split('/')[0]; sizes[k] = (sizes[k] ?? 0) + body.length; }
    const store = { get: async (k: string) => (blobs.has(k) ? { text: async () => blobs.get(k)!, json: async () => JSON.parse(blobs.get(k)!), etag: `"${k}"` } : null), head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
    const platform = { env: { STORE: store } } as unknown as App.Platform;
    const res: Record<string, unknown> = { indexBytes: text.length, buildProductsMs: Math.round(buildMs), productBytes: sizes, gcAvailable: typeof (globalThis as { gc?: unknown }).gc === 'function' };

    // cold corpus load (a fresh isolate's first request)
    _forgetIndex();
    let h0 = heap();
    const cold = await time(async () => { _forgetIndex(); return corpusNow(platform, noStatic); }, 3);
    const c = cold.v;
    res.coldCorpusLoad = { ms: cold.ms, max: cold.max, heldMB: MB(heap() - h0) };

    // search paths (warm products after the first)
    const sq = async (q: string) => { let charged = 0; const r = await time(async () => searchAnswer(platform, noStatic, q, 60, async () => { charged++; return null; }, c)); return { ...r, charged, v: undefined, hits: 'hits' in r.v ? r.v.hits.length : -1 }; };
    res.search = {} as Record<string, unknown>;
    for (const q of ['a', 'co', 'aloe', 'aloe vera', 'cop cin', 'a e', 'c m', 'ca ch', 'xact', 'kcactus', 'zaloe', 'xmam', 'cactaceae', 'cactaceea', 'living stones', 'mexico', 'mexcio', 'cape prov'])
      (res.search as Record<string, unknown>)[q] = await sq(q);
    h0 = heap();
    const w = await time(async () => searchWhole(c), 3);
    res.wholeFallbackPrepare = { ms: w.ms, max: w.max };
    // peak while held
    const held = await (async () => { const p = searchWhole(c); const prepared = await p; const m = heap() - h0; return { m, n: prepared.length }; })();
    res.wholePreparedMB = MB(held.m);

    // the no-manifest corpus (S4 / S2 cold): the whole prepared index held per isolate
    {
      const bare = { get: async (k: string) => (k === 's/v2/index.json' ? { text: async () => text, json: async () => JSON.parse(text), etag: '"bare"' } : null), head: async (k: string) => (k === 's/v2/index.json' ? { etag: '"bare"' } : null) };
      _forgetIndex();
      const hb = heap();
      const t = await time(async () => { _forgetIndex(); return corpusNow({ env: { STORE: bare } } as unknown as App.Platform, noStatic); }, 2);
      res.noManifestCorpusLoad = { ms: t.ms, heldMB: MB(heap() - hb) };
      const q = await time(async () => searchAnswer({ env: { STORE: bare } } as unknown as App.Platform, noStatic, 'a', 60, async () => null));
      res.noManifestSearchA = { ms: q.ms, max: q.max };
      _forgetIndex();
    }
    const c2 = await corpusNow(platform, noStatic);

    // home page loads
    const ev = (u: string) => ({ platform, fetch: noStatic, setHeaders: () => {}, url: new URL(u), cookies: { get: () => undefined }, request: new Request(u), locals: { corpus: c2 } });
    res.home = {} as Record<string, unknown>;
    const genusRow = slugify(genusOf(aloe.name));
    for (const u of ['https://x/', `https://x/?by=genus&open=${genusRow}`, 'https://x/?by=origin&open=cape-provinces', 'https://x/?by=origin&open=cape-provinces&part=240', 'https://x/?by=family&open=cactaceae', 'https://x/?by=genus&chip=climate&from=S']) {
      const t = await time(async () => homeLoad(ev(u) as never));
      const data = t.v as { rows: unknown[] };
      (res.home as Record<string, unknown>)[u.slice(8) || '/'] = { ms: t.ms, max: t.max, dataKB: Math.round(JSON.stringify(data).length / 1024) };
    }
    // species page load (server part only; the render is measured against the dev server)
    {
      const e = { ...ev(`https://x/species/${aloe.slug}`), params: { slug: aloe.slug }, getClientAddress: () => '1.2.3.4' };
      const t = await time(async () => speciesLoad(e as never));
      res.speciesLoad = { ms: t.ms, max: t.max, dataKB: Math.round(JSON.stringify(t.v).length / 1024) };
    }
    // sitemap
    { _forgetIndex(); const c3 = await corpusNow(platform, noStatic); const t = await time(() => sitemapChunk(sitemapUrls(c3.idx), 1)); res.sitemap = { ms: t.ms, max: t.max, KB: Math.round(t.v.length / 1024), urls: sitemapUrls(c3.idx).length, emptyGenusRows: sitemapUrls(c3.idx).filter((u) => /open=$/.test(u)).length }; }
    // entries derived (a missing entries file)
    { const b = bucketOf(aloe.slug, c2.buckets); const t = await time(async () => entriesIn({ ...c2, manifest: null }, platform, noStatic, b)); res.entriesDerived = { ms: t.ms }; }
    writeFileSync('/tmp/review59/corpus/cost.json', JSON.stringify(res, null, 1));
    expect(true).toBe(true);
  }, 600_000);
});
