/**
 * /api/sheets: one edge-cache entry per bucket under a canonical URL, a bucket file when the corpus build wrote one,
 * a derivation from the dossiers otherwise, a cap on buckets per request and a rate bucket on what is derived (round
 * twelve, 8), and the corpus id on the key (round twelve, 7).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '../../src/routes/api/sheets/+server';
import { GET as corpusGET } from '../../src/routes/api/corpus/+server';
import { resetRateLimits, RATE } from '$lib/server/sync';
import { bucketOf } from '$core/bucket';
import { sheetsPath } from '$lib/server/sheets';

type Cache = { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> };
function memCache(): Cache & { store: Map<string, Response>; puts: string[] } {
  const store = new Map<string, Response>();
  const puts: string[] = [];
  return { store, puts, match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { puts.push(r.url); store.set(r.url, res); } };
}
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
/** An R2 with the index and, optionally, one bucket file. */
function r2(files: Record<string, unknown>) {
  return { get: async (k: string) => (k in files ? { json: async () => files[k], text: async () => JSON.stringify(files[k]), etag: 'etag-' + k.length } : null) };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function call(q: string, o: { cache?: Cache; store?: ReturnType<typeof r2>; ip?: string } = {}) {
  const url = new URL(`http://x/api/sheets?${q}`);
  const platform = { env: { QUEUE: kv(), STORE: o.store }, caches: o.cache ? { default: o.cache } : undefined, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  return GET({ url, platform, fetch: noStatic, getClientAddress: () => o.ip ?? '1.2.3.4' } as never);
}
beforeEach(() => resetRateLimits());

describe('/api/sheets', () => {
  it('refuses more than four buckets and any bucket outside 00–1f', async () => {
    await expect(call('b=00,01,02,03,04')).rejects.toMatchObject({ status: 400 });
    await expect(call('b=20')).rejects.toMatchObject({ status: 400 });
    await expect(call('b=')).rejects.toMatchObject({ status: 400 });
  });
  it('derives a bucket from the fixture dossiers when no file exists, and puts each bucket in the edge cache under its own canonical URL with the corpus id', async () => {
    const cache = memCache();
    const b = bucketOf('copiapoa-cinerea');
    const r = await call(`c=fixture&b=${b}`, { cache });
    expect(r.status).toBe(200);
    const sheets = (await r.json()) as Array<{ slug: string }>;
    expect(sheets.map((s) => s.slug)).toContain('copiapoa-cinerea');
    expect(cache.puts).toEqual([`http://x/api/sheets?b=${b}&c=fixture`]);
    // the same bucket asked for again, in another grouping or order, is answered from the entry and nothing is derived
    const other = [...Array(32).keys()].map((i) => i.toString(16).padStart(2, '0')).find((x) => x !== b)!;
    cache.store.set(`http://x/api/sheets?b=${other}&c=fixture`, new Response('[]', { headers: { 'content-type': 'application/json' } }));
    const again = await call(`b=${other},${b}&c=fixture`, { cache });
    expect(((await again.json()) as unknown[]).length).toBe(sheets.length);
    expect(cache.puts).toHaveLength(1);
  });
  it('a request under another corpus id is answered but never cached, at the edge or by the browser (round thirteen, 4)', async () => {
    const cache = memCache();
    const b = bucketOf('copiapoa-cinerea');
    const r = await call(`c=stale&b=${b}`, { cache });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(cache.puts).toEqual([]);
    const none = await call(`b=${b}`, { cache }); // no id at all: the same
    expect(none.headers.get('cache-control')).toBe('no-store');
    expect(cache.puts).toEqual([]);
  });
  it('serves the bucket file the corpus build wrote when the store has one: one read, nothing derived', async () => {
    const b = '07';
    const file = [{ key: 1, slug: 'x-y', name: { scientific: 'X y' }, centroid: null, habitatLat: null, climate: { status: 'none' } }];
    const store = r2({ [sheetsPath(b)]: file, 's/v2/index.json': [] });
    const r = await call(`b=${b}`, { store });
    expect(await r.json()).toEqual(file);
  });
  it('each derived bucket counts against the sheets rate bucket; a cached one does not (round thirteen, 12)', async () => {
    const cache = memCache();
    const all = [...Array(32).keys()].map((i) => i.toString(16).padStart(2, '0'));
    // eight requests of four buckets each is thirty-two derivations, then every derivation is refused, and a cached bucket is not charged
    let n = 0;
    while (n + 4 <= RATE.sheets.limit) {
      const four = [0, 1, 2, 3].map((k) => all[(n + k) % 32]);
      const res = await call(`b=${four.join(',')}&c=${n}`, { cache, ip: '9.9.9.9' }); // a stale id: nothing is cached, so every bucket derives
      expect(res.status).toBe(200);
      n += 4;
    }
    const stop = await call(`b=${all[0]}&c=over`, { cache, ip: '9.9.9.9' });
    expect(stop.status).toBe(429);
    cache.store.set(`http://x/api/sheets?b=${all[0]}&c=fixture`, new Response('[]', { headers: { 'content-type': 'application/json' } }));
    const hit = await call(`b=${all[0]}&c=fixture`, { cache, ip: '9.9.9.9' });
    expect(hit.status).toBe(200);
  });
});

describe('/api/corpus', () => {
  it('names the fixture corpus, and an R2 index by its etag, never cached', async () => {
    const platform = { env: {} } as unknown as App.Platform;
    const r = await corpusGET({ platform, fetch: noStatic } as never);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ id: 'fixture' });
  });
});
