/**
 * Round eighty-two (O): the server's limits and routes (the independent review's 9, 31 and 32).
 *
 * 1. The whole index and the sync routes count an IPv4 address's /24 too, at four times one address's allowance, as the
 *    shares of outside calls do: 254 addresses of one /24 each had six whole indexes (37 MB each) per ten minutes. The
 *    other request windows still count an IPv6 /48 alone.
 * 2. `GET /api/sync/vault` (a vault's status, answered with no cache-control, in no list of the endpoints, called by
 *    nothing) is gone: the route answers POST alone, and the open's answer is `no-store`.
 * 3. Every render of /compare is counted under the render bucket, its data included: it read three dossiers a request,
 *    with no limit and no cache.
 *
 * On r82base: 1 FAILED (25 of 25 index requests from one /24 passed); 2 FAILED (the route exported GET); 3 FAILED
 * (the 1,201st render of /compare passed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { limited, RATE, NET_RATE_FACTOR, resetRateLimits } from '$lib/server/sync';
import * as vaultRoute from '../../src/routes/api/sync/vault/+server';
import { handle } from '../../src/hooks.server';

beforeEach(() => { resetRateLimits(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
const at = (ip: string) => () => ip;

describe('r82o limits 1: an IPv4 /24 is one network for the index and sync', () => {
  it('the index: one /24 is stopped at four times one address\'s allowance, said as the network\'s', async () => {
    const said: string[] = [];
    let passed = 0;
    for (let i = 1; i <= 30; i++) {
      const r = await limited(undefined, at(`198.51.100.${i}`), 'index');
      if (r) said.push(((await r.json()) as { error: string }).error); else passed++;
    }
    expect(passed).toBe(RATE.index.limit * NET_RATE_FACTOR); // 24
    expect(new Set(said)).toEqual(new Set(['too many requests from this network; wait and try again']));
    // Another /24 is another network.
    expect(await limited(undefined, at('198.51.101.1'), 'index')).toBeNull();
  });
  it('sync and its batches and photographs too', async () => {
    for (const bucket of ['sync', 'syncobj'] as const) {
      resetRateLimits();
      const per = RATE[bucket].limit;
      let stopped = 0;
      // Five addresses of one /24, each under its own allowance, together past the network's.
      for (let a = 1; a <= 5; a++) for (let i = 0; i < per; i++) if (await limited(undefined, at(`203.0.113.${a}`), bucket)) stopped++;
      expect(stopped, bucket).toBe(5 * per - per * NET_RATE_FACTOR);
    }
  });
  it('a search from one /24 is counted by address alone, as before', async () => {
    let stopped = 0;
    for (let i = 1; i <= 200; i++) if (await limited(undefined, at(`192.0.2.${i}`), 'search')) stopped++;
    expect(stopped).toBe(0);
  });
});

describe('r82o limits 2: no GET on the vault route', () => {
  it('the route answers POST alone', () => {
    expect(Object.keys(vaultRoute).sort()).toEqual(['POST']);
  });
});

describe('r82o limits 3: Compare is counted under the render bucket', () => {
  it('past the bucket\'s allowance from one address, /compare and its data are 429, and a page outside the bucket still answers', async () => {
    const platform = {};
    const call = (path: string, isDataRequest = false) => handle({
      event: { url: new URL('http://x' + path), request: new Request('http://x' + path), cookies: { get: () => undefined }, platform, locals: {}, isDataRequest, getClientAddress: () => '198.51.100.7', fetch } as never,
      resolve: async () => new Response('page', { headers: { 'content-type': 'text/html' } })
    } as never) as Promise<Response>;
    let ok = 0;
    for (let i = 0; i < RATE.render.limit; i++) if ((await call('/compare?s=aloe-vera,copiapoa-cinerea')).status === 200) ok++;
    expect(ok).toBe(RATE.render.limit);
    const r = await call('/compare?s=aloe-vera');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await call('/compare', true)).status).toBe(429);
    // Another page that is not rendered under the bucket still answers.
    expect((await call('/about/how')).status).toBe(200);
  });
});
