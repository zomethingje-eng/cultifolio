/**
 * Harness review of round sixty: the search's day-long Worker cache (src/routes/api/search/+server.ts). The round's test
 * ("the same query under the same corpus is answered from the cache: no posting read, no count against the address")
 * checks that no posting is read; nothing checks the "no count" half, or that a retried answer is still said to be a
 * retry when it comes from the cache. Two single-line mutations passed the suite:
 *   - the rate limit taken before the cache is read (a grower whose address spent its allowance gets 429 for a query
 *     the cache holds);
 *   - the cache keeping `{ hits }` only (the second asker of "Copiapoa cinerea var. columna-alba" is shown the retry's
 *     hits with no "Showing results for", which reads as an exact match: rule 2's sibling, a different species shown as
 *     if it were the one typed).
 * PASSES on round-sixty code; each test FAILS under its mutation.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--search-cache.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _forgetIndex } from '$lib/server/dossiers';
import { resetRateLimits, limited, RATE } from '$lib/server/sync';
import { md5 } from '$dossier/md5';

const mk = (names: string[]) => names.map((name, i) => ({ key: 1000 + i, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, open: 0, photos: 0, climate: 'ok' }));
const IDX = mk(['Copiapoa cinerea', 'Copiapoa humilis', 'Aloe vera', 'Lithops lesliei']);
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function platform() {
  const m = new Map([['s/v2/index.json', JSON.stringify(IDX)]]);
  const store = {
    get: async (k: string) => (m.has(k) ? { text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: md5(m.get(k)!) } : null),
    head: async (k: string) => (m.has(k) ? { etag: md5(m.get(k)!) } : null)
  };
  const kept = new Map<string, Response>();
  const caches = { default: { match: async (r: Request) => kept.get(r.url)?.clone(), put: async (r: Request, res: Response) => void kept.set(r.url, res) } };
  return { plat: { env: { STORE: store }, caches } as unknown as App.Platform, kept };
}
beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const Q = encodeURIComponent('Copiapoa cinerea var. columna-alba');

describe('the search cache (harness review)', () => {
  it('an answer from the retry is still said to be one when it comes from the cache, in both shapes', async () => {
    const { GET } = await import('../../src/routes/api/search/+server');
    const { plat, kept } = platform();
    const call = (qs: string) => GET({ url: new URL(`https://x/api/search?${qs}`), platform: plat, fetch: noStatic, getClientAddress: () => '1.2.3.4' } as never);
    const first = await call(`q=${Q}`);
    expect(decodeURIComponent(first.headers.get('x-search-relaxed') ?? '')).toBe('Copiapoa cinerea');
    expect(kept.size).toBe(1);
    const again = await call(`q=${Q}`); // from the cache
    expect(decodeURIComponent(again.headers.get('x-search-relaxed') ?? '')).toBe('Copiapoa cinerea');
    const shaped = (await (await call(`q=${Q}&shape=2`)).json()) as { relaxed?: { query: string } };
    expect(shaped.relaxed).toEqual({ query: 'Copiapoa cinerea' });
  });

  it('a query the cache holds is answered to an address whose allowance is spent; one it does not hold is refused', async () => {
    const { GET } = await import('../../src/routes/api/search/+server');
    const { plat } = platform();
    const call = (q: string, ip: string) => GET({ url: new URL(`https://x/api/search?q=${q}`), platform: plat, fetch: noStatic, getClientAddress: () => ip } as never);
    const warm = await call('aloe', '1.2.3.4');
    expect(warm.status).toBe(200);
    for (let i = 0; i < RATE.search.limit; i++) await limited(undefined, () => '9.9.9.9', 'search');
    expect((await call('lithops', '9.9.9.9')).status).toBe(429); // the allowance is spent
    const held = await call('aloe', '9.9.9.9');
    expect(held.status).toBe(200);
    expect(await held.json()).toEqual(await warm.json());
  });
});
