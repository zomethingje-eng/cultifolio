/**
 * Round-five probes of /api/names (the GBIF suggest proxy). Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-names.probe.test.ts
 */
import { describe, it, expect } from 'vitest';
import { GET } from '../../src/routes/api/names/+server';

function call(q: string, upstream: (url: string) => Promise<Response>, cache?: { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> }) {
  const url = new URL(`http://x/api/names?q=${encodeURIComponent(q)}`);
  const platform = { caches: cache ? { default: cache } : undefined, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  return GET({ url, platform, fetch: upstream as typeof fetch } as never);
}

describe('/api/names', () => {
  it('FINDING: a 200 from GBIF that is not JSON (an HTML error page behind a 200, a truncated body) throws out of the handler: a 500 with no no-store header, instead of the 502 the other paths give', async () => {
    const upstream = async () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    await expect(call('copiapoa', upstream)).rejects.toThrow(/JSON/);
  });
  it('FINDING: a 200 whose JSON is not an array (GBIF error object) throws too', async () => {
    const upstream = async () => new Response(JSON.stringify({ error: 'x' }), { status: 200 });
    await expect(call('copiapoa', upstream)).rejects.toThrow(/map/);
  });
  it('the cache key folds case but the upstream query does not: the first spelling to arrive answers every other spelling for a day', async () => {
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
    expect(asked).toEqual(['Copiapoa']); // served from cache: correct only because GBIF suggest is itself case-insensitive
    expect([...store.keys()]).toEqual(['https://cache.cultifolio/names?q=copiapoa']);
  });
  it('anything from 3 to 80 characters is forwarded verbatim; there is no rate limit, no character class, and one caller can spend the cache and GBIF\'s goodwill with random strings', async () => {
    const asked: string[] = [];
    const upstream = async (u: string) => {
      asked.push(new URL(u).searchParams.get('q')!);
      return new Response('[]', { status: 200 });
    };
    for (let i = 0; i < 5; i++) await call(`zzz${Math.random().toString(36).slice(2, 12)}`, upstream);
    await call("'; DROP TABLE plants; --", upstream);
    await call('a'.repeat(200), upstream);
    expect(asked).toHaveLength(7);
    expect(asked[6]).toHaveLength(80);
  });
});
