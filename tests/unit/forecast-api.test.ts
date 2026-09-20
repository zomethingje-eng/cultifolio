import { describe, it, expect } from 'vitest';
import { GET } from '../../src/routes/api/forecast/+server';

function call(upstream: (url: string) => Promise<Response>) {
  const url = new URL('http://x/api/forecast?lat=40.38&lon=-80.05');
  return GET({ url, platform: undefined, fetch: upstream as typeof fetch } as never);
}

describe('/api/forecast', () => {
  it('an unreachable, a non-2xx, and a non-JSON forecast source are one plain 502 with no-store, never a raw status', async () => {
    for (const upstream of [
      async () => {
        throw new Error('net');
      },
      async () => new Response('', { status: 500 }),
      async () => new Response('', { status: 429 }),
      async () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    ]) {
      const r = await call(upstream);
      expect(r.status).toBe(502);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(await r.json()).toEqual({ error: 'forecast source did not answer' });
    }
  });
});
