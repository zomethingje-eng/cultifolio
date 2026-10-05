/**
 * Round sixty, the hook: the page cache read by the decoded path (A30) and answering HEAD (the server review, 6), uncached
 * renders under a rate bucket of their own, the security headers on every answer (the server review, 14), the private
 * pages sent `noindex` (the corpus review, P3), a same-origin form post believed by `Sec-Fetch-Site` (the server review,
 * 13), and a failure never kept.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handle, _foreignWrite } from '../../src/hooks.server';
import { resetRateLimits, RATE } from '$lib/server/sync';

function world() {
  const store = new Map<string, Response>();
  const cache = { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res); } };
  const waited: Promise<unknown>[] = [];
  const platform = { caches: { default: cache }, context: { waitUntil: (p: Promise<unknown>) => { waited.push(p); } } };
  let renders = 0;
  const event = (path: string, o: { method?: string; isDataRequest?: boolean; headers?: Record<string, string> } = {}) => ({
    url: new URL('http://x' + path),
    request: new Request('http://x' + path, { method: o.method ?? 'GET', headers: o.headers ?? {} }),
    cookies: { get: () => undefined },
    platform,
    fetch: async () => new Response('', { status: 404 }), // the fixture corpus
    isDataRequest: o.isDataRequest ?? false,
    getClientAddress: () => '198.51.100.7',
    locals: {} as App.Locals
  });
  const page = async (status = 200) => { renders++; return new Response(`<p>render ${renders}</p>`, { status, headers: { 'content-type': 'text/html', 'cache-control': 'private, max-age=60' } }); };
  return { store, waited, event, page, renders: () => renders };
}
beforeEach(() => resetRateLimits());

describe('the page cache (round sixty)', () => {
  it('reads the path decoded: `/%73pecies/x` is the species page, held and sharing its copy (A30)', async () => {
    const w = world();
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    await Promise.all(w.waited);
    const b = await handle({ event: w.event('/%73pecies/copiapoa-cinerea'), resolve: () => w.page() } as never);
    expect(b.headers.get('x-cultifolio-page')).toBe('held');
    expect(w.renders()).toBe(1);
  });
  it('answers HEAD from the copy, headers only, as it answers GET (the server review, 6)', async () => {
    const w = world();
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    await Promise.all(w.waited);
    const h = await handle({ event: w.event('/species/copiapoa-cinerea', { method: 'HEAD' }), resolve: () => w.page() } as never);
    expect(h.headers.get('x-cultifolio-page')).toBe('held');
    expect(h.headers.get('content-type')).toBe('text/html');
    expect(await h.text()).toBe('');
    expect(w.renders()).toBe(1);
    // and the front page
    await handle({ event: w.event('/'), resolve: () => w.page() } as never);
    await Promise.all(w.waited);
    const hh = await handle({ event: w.event('/', { method: 'HEAD' }), resolve: () => w.page() } as never);
    expect(hh.headers.get('x-cultifolio-page')).toBe('held');
    expect(w.renders()).toBe(2);
  });
  it('a HEAD the copy cannot answer is rendered, not stored', async () => {
    const w = world();
    const h = await handle({ event: w.event('/species/welwitschia-mirabilis', { method: 'HEAD' }), resolve: () => w.page() } as never);
    expect(h.status).toBe(200);
    await Promise.all(w.waited);
    expect(w.store.size).toBe(0);
  });
  it('renders the cache cannot hold (a data request, `?was=`, an uncached HEAD) are counted under `render`; a GET that is held once rendered is not', async () => {
    const w = world();
    let refused = 0;
    for (let i = 0; i < RATE.render.limit + 3; i++) {
      const r = await handle({ event: w.event('/species/copiapoa-cinerea', { isDataRequest: true }), resolve: () => w.page() } as never);
      if (r.status === 429) refused++;
    }
    expect(refused).toBe(3);
    const was = await handle({ event: w.event('/species/copiapoa-cinerea?was=Copiapoa%20x'), resolve: () => w.page() } as never);
    expect(was.status).toBe(429);
    expect(was.headers.get('retry-after')).toBeTruthy();
    // the held GET is not refused: it is answered from the copy or rendered once and kept
    const g = await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    expect(g.status).toBe(200);
  });
  it('a failure is never kept, and says no-store', async () => {
    const w = world();
    const r = await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page(503) } as never);
    await Promise.all(w.waited);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(w.store.size).toBe(0);
  });
});

describe('headers on every answer (round sixty)', () => {
  const run = async (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    handle({ event: { url: new URL('http://x' + path), request: new Request('http://x' + path, init), isDataRequest: false, locals: {}, cookies: { get: () => undefined } } as never, resolve: async () => new Response('x', { headers: { 'content-type': 'text/html' } }) } as never);
  it('nosniff, a permissions policy that allows only location and the camera, for this site alone, and HSTS for a year (the server review, 14)', async () => {
    for (const path of ['/', '/species/copiapoa-cinerea', '/plants', '/api/corpus']) {
      const r = await run(path);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('permissions-policy')).toBe('geolocation=(self), camera=(self), microphone=(), payment=(), usb=()');
      expect(r.headers.get('strict-transport-security')).toBe('max-age=31536000');
    }
    const refused = await run('/api/sync/vault', { method: 'POST', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } });
    expect(refused.status).toBe(403);
    expect(refused.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('the private pages say noindex; the reference does not (the corpus review, P3)', async () => {
    for (const path of ['/plants', '/plants/2026-0001', '/places', '/today', '/propagation/new', '/labels', '/settings', '/sync', '/backup', '/offline', '/%70lants']) {
      expect({ path, tag: (await run(path)).headers.get('x-robots-tag') }).toEqual({ path, tag: 'noindex' });
    }
    for (const path of ['/', '/species/copiapoa-cinerea', '/about/how', '/compare', '/plantsx', '/api/search']) {
      expect({ path, tag: (await run(path)).headers.get('x-robots-tag') }).toEqual({ path, tag: null });
    }
  });
});

describe('a write from this site (round sixty; the server review, 13)', () => {
  const req = (h: Record<string, string>) => new Request('https://cultifolio.com/api/sync/vault', { method: 'POST', headers: h });
  const url = new URL('https://cultifolio.com/api/sync/vault');
  it('Sec-Fetch-Site same-origin is believed even when Origin is null (a form post under no-referrer)', () => {
    expect(_foreignWrite(req({ origin: 'null', 'sec-fetch-site': 'same-origin' }), url)).toBe(false);
    expect(_foreignWrite(req({ 'sec-fetch-site': 'none' }), url)).toBe(false);
    expect(_foreignWrite(req({ origin: 'https://cultifolio.com', 'sec-fetch-site': 'cross-site' }), url)).toBe(true);
    expect(_foreignWrite(req({ origin: 'null', 'sec-fetch-site': 'same-site' }), url)).toBe(true);
    // without the header, Origin decides as before
    expect(_foreignWrite(req({ origin: 'https://evil.example' }), url)).toBe(true);
    expect(_foreignWrite(req({ origin: 'https://cultifolio.com' }), url)).toBe(false);
  });
});
