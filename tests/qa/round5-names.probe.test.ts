/**
 * Round-five probes of /api/names (the GBIF suggest proxy). Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-names.probe.test.ts
 * Finding 41 is fixed; these probes now pin the fixed behaviour (the unit
 * suite in tests/unit/names-api.test.ts covers it in full).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET } from '../../src/routes/api/names/+server';
import { resetRateLimits } from '$lib/server/sync';

const kv = new Map<string, string>();
function call(q: string, upstream: (url: string) => Promise<Response>, cache?: { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> }, ip = '1.2.3.4') {
  const url = new URL(`http://x/api/names?q=${encodeURIComponent(q)}`);
  const platform = { env: { QUEUE: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) } }, caches: cache ? { default: cache } : undefined, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  return GET({ url, platform, fetch: upstream as typeof fetch, getClientAddress: () => ip } as never);
}

describe('/api/names', () => {
  beforeEach(() => {
    resetRateLimits();
    kv.clear();
  });
  it('FIXED: a 200 from GBIF that is not JSON (an HTML error page behind a 200, a truncated body) is a 502 with no-store, like the other failure paths', async () => {
    const upstream = async () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const r = await call('copiapoa', upstream);
    expect(r.status).toBe(502);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('FIXED: a 200 whose JSON is not an array (GBIF error object) is a 502 too', async () => {
    const upstream = async () => new Response(JSON.stringify({ error: 'x' }), { status: 200 });
    expect((await call('copiapoa', upstream)).status).toBe(502);
  });
  it('the cache key folds case but the upstream query does not: the first spelling to arrive answers every other spelling for a day (correct because GBIF suggest is itself case-insensitive)', async () => {
    const asked: string[] = [];
    const store = new Map<string, Response>();
    const cache = { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) };
    const upstream = async (u: string) => {
      asked.push(new URL(u).searchParams.get('q')!);
      return new Response(JSON.stringify([{ key: 1, canonicalName: 'Copiapoa', extra: 'dropped' }]), { status: 200 });
    };
    const a = await call('Copiapoa', upstream, cache);
    expect(await a.json()).toEqual([{ key: 1, canonicalName: 'Copiapoa' }]);
    await new Promise((r) => setTimeout(r, 0));
    const b = await call('COPIAPOA', upstream, cache);
    expect(await b.json()).toEqual([{ key: 1, canonicalName: 'Copiapoa' }]);
    expect(asked).toEqual(['Copiapoa']);
    expect([...store.keys()]).toEqual(['https://cache.cultifolio/names?q=copiapoa']);
  });
  it('FIXED: only what looks like a name is forwarded (3 to 80 characters of letters, spaces, periods, apostrophes, hyphens, ×), and one address is bounded by a rate limit', async () => {
    const asked: string[] = [];
    const upstream = async (u: string) => {
      asked.push(new URL(u).searchParams.get('q')!);
      return new Response('[]', { status: 200 });
    };
    for (let i = 0; i < 5; i++) expect((await call(`zzz${Math.random().toString(36).slice(2, 12)}`, upstream)).status).toBe(400);
    expect((await call("'; DROP TABLE plants; --", upstream)).status).toBe(400);
    expect((await call('a'.repeat(200), upstream)).status).toBe(200);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(80);
    let status = 200;
    for (let i = 0; i < 400 && status === 200; i++) status = (await call(`Genus ${'a'.repeat(3 + (i % 70))}${String.fromCharCode(97 + Math.floor(i / 70))}`, upstream)).status;
    expect(status).toBe(429);
  });
});
