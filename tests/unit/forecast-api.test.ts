import { describe, it, expect } from 'vitest';
import { GET } from '../../src/routes/api/forecast/+server';

function call(upstream: (url: string) => Promise<Response>, query = 'lat=40.38&lon=-80.05', platform?: unknown) {
  const url = new URL(`http://x/api/forecast?${query}`);
  return GET({ url, platform, fetch: upstream as typeof fetch } as never);
}

/** A cold night in a two-step MET series, outside the US so no alerts call is made. */
const met = () =>
  new Response(
    JSON.stringify({ properties: { timeseries: [{ time: '2026-01-10T00:00:00Z', data: { instant: { details: { air_temperature: -2 } }, next_6_hours: { details: { air_temperature_min: -2, air_temperature_max: 4 } } } }, { time: '2026-01-10T06:00:00Z', data: { instant: { details: { air_temperature: 3 } }, next_6_hours: { details: { air_temperature_min: 1, air_temperature_max: 6 } } } }] } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

/** The edge cache as the Worker sees it: one entry per key, put after the response is sent. */
function fakeCache() {
  const store = new Map<string, Response>();
  const puts: Promise<unknown>[] = [];
  const cache = {
    match: async (k: Request) => store.get(k.url)?.clone(),
    put: async (k: Request, r: Response) => {
      store.set(k.url, r);
    }
  };
  return { platform: { caches: { default: cache }, context: { waitUntil: (p: Promise<unknown>) => puts.push(p) } }, settle: () => Promise.all(puts), store };
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

  it('absent or blank coordinates are a 400, never a forecast for 0,0', async () => {
    let calls = 0;
    const upstream = async () => {
      calls++;
      return met();
    };
    for (const q of ['', 'lat=&lon=', 'lat=40.38', 'lon=-80.05', 'lat=abc&lon=1']) {
      await expect(call(upstream, q)).rejects.toMatchObject({ status: 400 });
    }
    expect(calls).toBe(0);
  });

  it('the edge caches the raw forecast once per cell, and the verdict is worded in each request\'s units', async () => {
    let calls = 0;
    const upstream = async () => {
      calls++;
      return met();
    };
    type Body = { forecast: unknown; risk?: { level: string; text: string } };
    const c = fakeCache();
    const metric = (await (await call(upstream, 'lat=48.5&lon=2.2', c.platform)).json()) as Body;
    await c.settle();
    const us = (await (await call(upstream, 'lat=48.5&lon=2.2&units=us', c.platform)).json()) as Body;
    expect(calls).toBe(1);
    expect(metric.risk?.level).toBe('frost');
    expect(metric.risk?.text).toContain('-2.0 °C');
    expect(us.risk?.text).toContain('28.4 °F');
    expect(us.forecast).toEqual(metric.forecast);
    // what sits in the cache carries no verdict at all
    const cached = (await c.store.values().next().value!.clone().json()) as Body;
    expect(cached.risk).toBeUndefined();
  });
});
