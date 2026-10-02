/**
 * /api/search: the catalogue search answered by the server from the index it holds, with the same ranking the browser
 * ran over the whole index before (round thirty-nine). The index never comes to the browser whole.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GET, _MAX_HITS as MAX_HITS } from '../../src/routes/api/search/+server';
import { resetRateLimits, RATE } from '$lib/server/sync';

const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => void m.set(k, v) }; };
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
function call(q: string, ip = '1.2.3.4') {
  const url = new URL(`http://x/api/search?${q}`);
  const platform = { env: { QUEUE: kv() }, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
  return GET({ url, platform, fetch: noStatic, getClientAddress: () => ip } as never);
}
beforeEach(() => resetRateLimits());

describe('/api/search', () => {
  it('answers a name, a genus, a common name and an origin from the fixture index, ranked, cacheable under the corpus id', async () => {
    const r = await call('q=copiapoa&c=fixture');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('public, max-age=86400');
    const hits = (await r.json()) as Array<{ slug: string; name: string; key: number; thumb?: string; climate: string }>;
    expect(hits.map((h) => h.slug)).toEqual(['copiapoa-cinerea', 'copiapoa-humilis']);
    expect(hits[0]).toMatchObject({ key: 5384013, climate: 'ok' }); // the tile's fields come with it
    expect(((await (await call('q=welwit%20mirab&c=fixture')).json()) as Array<{ slug: string }>).map((h) => h.slug)).toEqual(['welwitschia-mirabilis']);
    expect(((await (await call('q=copiapao&c=fixture')).json()) as Array<{ slug: string }>).length).toBeGreaterThan(0); // one typing error forgiven, as before
    expect(((await (await call('q=namibia&c=fixture')).json()) as Array<{ slug: string }>).map((h) => h.slug)).toContain('welwitschia-mirabilis');
  });
  it('an empty search is nothing, punctuation is a space (an iPhone’s ’, a comma, a slash), a stale corpus id is no-store, and the limit is capped', async () => {
    expect(await (await call('q=&c=fixture')).json()).toEqual([]);
    expect(await (await call('q=%3C%3E%2F&c=fixture')).json()).toEqual([]); // nothing but symbols: an empty search, not a 400 (round forty, R1-1)
    for (const typed of ['copiapoa, cinerea', 'Copiapoa (cinerea)', 'copiapoa/cinerea', 'Copiapoa ’cinerea’', 'Copiapoa "cinerea"', 'copiapoa & cinerea']) {
      const r = await call(`q=${encodeURIComponent(typed)}&c=fixture`);
      expect(r.status, typed).toBe(200);
      expect(((await r.json()) as Array<{ slug: string }>).map((h) => h.slug), typed).toEqual(['copiapoa-cinerea']);
    }
    expect((await call('q=copiapoa&c=old')).headers.get('cache-control')).toBe('no-store');
    expect((await call('q=copiapoa')).headers.get('cache-control')).toBe('no-store');
    expect(((await (await call(`q=co&n=${MAX_HITS * 10}&c=fixture`)).json()) as unknown[]).length).toBeLessThanOrEqual(MAX_HITS);
    expect(((await (await call('q=copiapoa&n=1&c=fixture')).json()) as unknown[]).length).toBe(1);
  });
  it('is rate-limited per address', async () => {
    for (let i = 0; i < RATE.search.limit; i++) await call('q=a&c=fixture', '9.9.9.9');
    expect((await call('q=a&c=fixture', '9.9.9.9')).status).toBe(429);
    expect((await call('q=a&c=fixture', '9.9.9.8')).status).toBe(200);
  });
});

describe('/api/rows (round forty-seven, 1)', () => {
  it('answers a window of the catalogue rows, cacheable under the current corpus id, no-store under another, and the front page sends only its window', async () => {
    const { GET: rowsGET } = await import('../../src/routes/api/rows/+server');
    const { GET: corpusGET } = await import('../../src/routes/api/corpus/+server');
    const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
    const platform = { env: {} } as unknown as App.Platform;
    const corpus = ((await (await corpusGET({ platform, fetch: noStatic } as never)).json()) as { id: string }).id;
    const call = (q: string) => rowsGET({ url: new URL(`http://x/api/rows?${q}`), platform, fetch: noStatic } as never);
    const a = await call(`by=genus&chip=all&at=0&n=2&c=${corpus}`);
    expect(a.headers.get('cache-control')).toBe('public, max-age=86400');
    const body = (await a.json()) as { at: number; count: number; rows: Array<{ id: string; letter: string; items?: unknown }> };
    expect(body.at).toBe(0);
    expect(body.rows.length).toBeLessThanOrEqual(2);
    expect(body.count).toBeGreaterThan(0);
    expect(body.rows[0]).not.toHaveProperty('items'); // the species of a row come with the page that opens it, never here
    const b = await call('by=genus&chip=all&at=0&n=2&c=stale');
    expect(b.headers.get('cache-control')).toBe('no-store');
    const past = (await (await call(`by=genus&at=99999&n=5&c=${corpus}`)).json()) as { rows: unknown[] };
    expect(past.rows).toEqual([]);
    // the page's own load sends the window, the count and the letters, not every row
    const { load, _WINDOW } = await import('../../src/routes/+page.server');
    const page = (await load({ platform, fetch: noStatic, setHeaders: () => {}, url: new URL('http://x/'), cookies: { get: () => undefined }, request: new Request('http://x/') } as never)) as { rows: unknown[]; rowCount: number; letterAt: Record<string, number>; letters: string[] };
    expect(page.rows.length).toBeLessThanOrEqual(_WINDOW);
    expect(page.rowCount).toBe(body.count);
    expect(Object.keys(page.letterAt)).toEqual(page.letters);
  });
});
