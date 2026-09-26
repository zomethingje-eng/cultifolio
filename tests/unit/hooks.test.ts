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
    const r = await handle({ event: {} as never, resolve: async () => new CacheHit('[{"key":1}]') } as never);
    expect(r.status).toBe(200);
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(await r.text()).toBe('[{"key":1}]');
  });
  it('leaves an x-frame-options a route set', async () => {
    const r = await handle({ event: {} as never, resolve: async () => new Response('x', { headers: { 'x-frame-options': 'SAMEORIGIN' } }) } as never);
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});
