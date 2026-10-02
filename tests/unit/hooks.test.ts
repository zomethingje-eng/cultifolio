/**
 * The headers hook against a response whose headers cannot be changed, which is what a Workers edge-cache hit is
 * (round seventeen, 1: the names route returned its hit as it was, the hook's `set` threw, and every repeated lookup
 * was a 500 on the live site while both suites stayed green).
 */
import { describe, it, expect } from 'vitest';
import { handle } from '../../src/hooks.server';

class FrozenHeaders extends Headers {
  override set(): void {
    throw new TypeError("Can't modify immutable headers.");
  }
}
class CacheHit extends Response {
  override get headers(): Headers {
    return new FrozenHeaders({ 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' });
  }
}

describe('hooks.server handle', () => {
  it('adds the policy headers to a response whose own headers are immutable, keeping its body and headers', async () => {
    const r = await handle({ event: { url: new URL('http://x/api/names?q=a') } as never, resolve: async () => new CacheHit('[{"key":1}]') } as never);
    expect(r.status).toBe(200);
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await r.text()).toBe('[{"key":1}]');
  });
  it('leaves an x-frame-options a route set', async () => {
    const r = await handle({ event: { url: new URL('http://x/api/names?q=a') } as never, resolve: async () => new Response('x', { headers: { 'x-frame-options': 'SAMEORIGIN' } }) } as never);
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
  it('sends the renamed sections\' old paths to the new ones, query kept, and nothing else (improvements, 3)', async () => {
    const at = async (path: string) => {
      try {
        await handle({ event: { url: new URL('http://x' + path) } as never, resolve: async () => new Response('page') } as never);
        return null;
      } catch (e) {
        return e as { status: number; location: string };
      }
    };
    expect(await at('/benches')).toMatchObject({ status: 301, location: '/places' });
    expect(await at('/sowings/new?loc=k1')).toMatchObject({ status: 301, location: '/propagation/new?loc=k1' });
    expect(await at('/benchesx')).toBeNull();
    expect(await at('/plants/2026-0001')).toBeNull();
  });
});

/** The Worker's own cache of rendered species pages, keyed by the page, the units and the hemisphere (round forty-three, 3). */
describe('the species page cache (round forty-three, 3)', () => {
  function world() {
    const store = new Map<string, Response>();
    const cache = { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res); } };
    const waited: Promise<unknown>[] = [];
    const platform = { caches: { default: cache }, context: { waitUntil: (p: Promise<unknown>) => { waited.push(p); } } };
    let renders = 0;
    const event = (path: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}, isDataRequest = false) => ({
      url: new URL('http://x' + path),
      request: new Request('http://x' + path, { headers }),
      cookies: { get: (k: string) => cookies[k] },
      platform,
      isDataRequest
    });
    const page = async (status = 200, type = 'text/html', extra: Record<string, string> = {}) => { renders++; return new Response(`<p>render ${renders}</p>`, { status, headers: { 'content-type': type, 'cache-control': 'private, max-age=60', vary: 'accept-language, cookie', ...extra } }); };
    return { store, waited, event, page, renders: () => renders };
  }
  it('renders a species page once per minute per location and answers the next reader in the same units from the copy', async () => {
    const w = world();
    const a = await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    expect(a.headers.get('x-cultifolio-page')).toBe('rendered');
    expect(a.headers.get('cache-control')).toBe('private, max-age=60'); // the reader's copy keeps its private header
    expect(await a.text()).toBe('<p>render 1</p>');
    await Promise.all(w.waited);
    expect([...w.store.keys()]).toEqual(['https://cache.cultifolio/page?p=%2Fspecies%2Fcopiapoa-cinerea&q=&u=metric&h=']);
    expect(w.store.values().next().value?.headers.get('cache-control')).toBe('public, max-age=60'); // the stored copy, under the Worker's own key
    const b = await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    expect(b.headers.get('x-cultifolio-page')).toBe('held');
    expect(b.headers.get('cache-control')).toBe('private, max-age=60');
    expect(b.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await b.text()).toBe('<p>render 1</p>');
    expect(w.renders()).toBe(1);
  });
  it('a reader in other units, or another hemisphere, or on another address, is rendered for', async () => {
    const w = world();
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    await handle({ event: w.event('/species/copiapoa-cinerea', { 'cultifolio.units': 'us' }), resolve: () => w.page() } as never);
    await handle({ event: w.event('/species/copiapoa-cinerea', { 'cultifolio.hemi': 's' }), resolve: () => w.page() } as never);
    await handle({ event: w.event('/species/copiapoa-cinerea?was=Copiapoa%20x'), resolve: () => w.page() } as never);
    // a browser language is read into the units before the key is made, so en-US is the `us` copy above, not a sixth
    const us = await handle({ event: w.event('/species/copiapoa-cinerea', {}, { 'accept-language': 'en-US' }), resolve: () => w.page() } as never);
    expect(us.headers.get('x-cultifolio-page')).toBe('held');
    // a query the page never reads, and a hemisphere cookie that is neither value, share the plain copy rather than minting one
    const x = await handle({ event: w.event('/species/copiapoa-cinerea?x=1&check=5'), resolve: () => w.page() } as never);
    expect(x.headers.get('x-cultifolio-page')).toBe('held');
    const odd = await handle({ event: w.event('/species/copiapoa-cinerea', { 'cultifolio.hemi': 'x&u=us' }), resolve: () => w.page() } as never);
    expect(odd.headers.get('x-cultifolio-page')).toBe('held');
    expect(w.renders()).toBe(4);
    await Promise.all(w.waited);
    expect(w.store.size).toBe(4);
  });
  it('a 404, a non-HTML answer, a response that sets a cookie, and any other page are not stored', async () => {
    const w = world();
    await handle({ event: w.event('/species/nonsensia-fakeii'), resolve: () => w.page(404) } as never);
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page(200, 'application/json') } as never);
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page(200, 'text/html', { 'set-cookie': 'a=b' }) } as never);
    await handle({ event: w.event('/plants/2026-0001'), resolve: () => w.page() } as never);
    await handle({ event: w.event('/about/how'), resolve: () => w.page() } as never);
    await Promise.all(w.waited);
    expect(w.store.size).toBe(0);
    expect(w.renders()).toBe(5);
  });
  it('a data request (a client-side navigation asking for the page\'s data under its URL) is neither answered from the copy nor stored (round forty-six, 3)', async () => {
    const w = world();
    await handle({ event: w.event('/species/copiapoa-cinerea'), resolve: () => w.page() } as never);
    await Promise.all(w.waited);
    const data = await handle({ event: w.event('/species/copiapoa-cinerea?x-sveltekit-invalidated=01', {}, {}, true), resolve: () => w.page(200, 'application/json') } as never);
    expect(data.headers.get('x-cultifolio-page')).toBeNull();
    expect(data.headers.get('content-type')).toBe('application/json');
    const home = await handle({ event: w.event('/?x-sveltekit-trailing-slash=1', {}, {}, true), resolve: () => w.page(200, 'application/json') } as never);
    expect(home.headers.get('x-cultifolio-page')).toBeNull();
    expect(w.renders()).toBe(3);
    expect(w.store.size).toBe(1);
  });
  it('the home page is held too, by the queries it reads and not by the search typed into it (round forty-six, 2)', async () => {
    const w = world();
    await handle({ event: w.event('/'), resolve: () => w.page() } as never);
    const again = await handle({ event: w.event('/?q=copiapoa'), resolve: () => w.page() } as never); // the search is the client's; the HTML is the same
    expect(again.headers.get('x-cultifolio-page')).toBe('held');
    await handle({ event: w.event('/?by=family'), resolve: () => w.page() } as never);
    await handle({ event: w.event('/?by=family&open=cactaceae'), resolve: () => w.page() } as never);
    await handle({ event: w.event('/?chip=climate'), resolve: () => w.page() } as never);
    const hemi = await handle({ event: w.event('/', { 'cultifolio.hemi': 's' }), resolve: () => w.page() } as never); // the home page does not read it
    expect(hemi.headers.get('x-cultifolio-page')).toBe('held');
    expect(w.renders()).toBe(4);
    await Promise.all(w.waited);
    expect(w.store.size).toBe(4);
  });
});
