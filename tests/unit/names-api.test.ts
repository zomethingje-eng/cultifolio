import { describe, it, expect, beforeEach } from 'vitest';
import { GET, _NAME_QUERY as NAME_QUERY } from '../../src/routes/api/names/+server';
import { resetRateLimits, RATE } from '$lib/server/sync';

type Cache = { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> };
function memCache(): Cache & { store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return { store, match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => void store.set(r.url, res) };
}
function kvFake() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) };
}
function call(q: string, upstream: (url: string) => Promise<Response>, o: { cache?: Cache; ip?: string; kv?: boolean } = {}) {
  const url = new URL(`http://x/api/names?q=${encodeURIComponent(q)}`);
  const platform = { env: { QUEUE: o.kv === false ? undefined : kv }, caches: o.cache ? { default: o.cache } : undefined, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  return GET({ url, platform, fetch: upstream as typeof fetch, getClientAddress: () => o.ip ?? '1.2.3.4' } as never);
}
let kv = kvFake();
const ok = (rows: unknown) => async () => new Response(JSON.stringify(rows), { status: 200 });

describe('/api/names', () => {
  beforeEach(() => {
    resetRateLimits();
    kv = kvFake();
  });
  it('a 200 from GBIF that is not JSON is a 502 with plain JSON and no-store, never cached', async () => {
    const cache = memCache();
    const r = await call('copiapoa', async () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } }), { cache });
    expect(r.status).toBe(502);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: expect.stringMatching(/JSON/) });
    await new Promise((res) => setTimeout(res, 0));
    expect(cache.store.size).toBe(0);
  });
  it('JSON that is not a list is a 502 too; an unreachable or non-2xx backbone as before', async () => {
    expect((await call('copiapoa', ok({ error: 'x' }))).status).toBe(502);
    expect((await call('copiapoa', async () => new Response('', { status: 503 }))).status).toBe(502);
    const r = await call('copiapoa', async () => {
      throw new Error('net');
    });
    expect(r.status).toBe(502);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('a good answer is trimmed to the picker\'s fields and cached for a day under the lower-cased query', async () => {
    const cache = memCache();
    const asked: string[] = [];
    const upstream = async (u: string) => {
      asked.push(new URL(u).searchParams.get('q')!);
      return new Response(JSON.stringify([{ key: 1, canonicalName: 'Copiapoa', extra: 'dropped' }, null, 'junk']), { status: 200 });
    };
    const a = await call('Copiapoa', upstream, { cache });
    expect(a.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await a.json()).toEqual([{ key: 1, canonicalName: 'Copiapoa' }, {}, {}]);
    await new Promise((res) => setTimeout(res, 0));
    const b = await call('COPIAPOA', upstream, { cache });
    expect(await b.json()).toEqual([{ key: 1, canonicalName: 'Copiapoa' }, {}, {}]);
    expect(asked).toEqual(['Copiapoa']);
    expect([...cache.store.keys()]).toEqual(['https://cache.cultifolio/names?q=copiapoa']);
  });
  it('the query must look like a name: letters of any script, spaces, periods, apostrophes, hyphens and ×; anything else is 400 and never reaches GBIF', async () => {
    for (const good of ['Copiapoa cinerea var. columna-alba', "Echinopsis 'Flying Saucer'", 'Ariocarpus × Lophophora', 'Ægagropila', 'Ботаника', '日本の植物']) expect(NAME_QUERY.test(good)).toBe(true);
    for (const bad of ["'; DROP TABLE plants; --", 'zzz9k2j1', 'a'.repeat(81), '<script>', 'x', 'name?q=1']) expect(NAME_QUERY.test(bad)).toBe(false);
    const asked: string[] = [];
    const upstream = async (u: string) => {
      asked.push(u);
      return new Response('[]', { status: 200 });
    };
    const r = await call("'; DROP TABLE plants; --", upstream);
    expect(r.status).toBe(400);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: expect.any(String) });
    expect((await call('a'.repeat(200), upstream)).status).toBe(200); // cut to 80 first, still a name
    expect(asked).toHaveLength(1);
    expect((await call('ab', upstream)).status).toBe(200); // too short: an empty list, not an error
    expect(await (await call('ab', upstream)).json()).toEqual([]);
  });
  it('a flood from one address is 429 with Retry-After and plain JSON; a cache hit is never counted; another address goes on', async () => {
    const cache = memCache();
    let asked = 0;
    const upstream = async () => {
      asked++;
      return new Response('[]', { status: 200 });
    };
    let last: Response | undefined;
    for (let i = 0; i <= RATE.names.limit; i++) last = await call(`Genus species${String.fromCharCode(97 + (i % 26))}${'a'.repeat(Math.floor(i / 26))}`, upstream, { cache });
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(last!.headers.get('cache-control')).toBe('no-store');
    expect(await last!.json()).toMatchObject({ error: expect.stringMatching(/too many/), retryAfter: expect.any(Number) });
    expect(asked).toBe(RATE.names.limit);
    await new Promise((res) => setTimeout(res, 0));
    expect((await call('Genus speciesa', upstream, { cache })).status).toBe(200); // cached: not limited
    expect((await call('Copiapoa', upstream, { cache, ip: '5.6.7.8' })).status).toBe(200);
  });
});
