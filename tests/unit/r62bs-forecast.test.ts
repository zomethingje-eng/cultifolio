/**
 * Round sixty-two, second pass, agent S (the words review, 18): a forecast whose NWS alerts were refused said "alerts not
 * checked" for an hour after the NWS recovered, since the edge kept it an hour and the device half an hour. Now both keep
 * it five minutes at most; any other answer as before.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits } from '$lib/server/sync';
import { fakeKV } from './helpers/fake-sync';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const T = Date.UTC(2026, 9, 4, 12, 0, 0);
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const metBody = () => JSON.stringify({ properties: { timeseries: [{ time: '2026-10-04T18:00:00Z', data: { instant: { details: { air_temperature: 3 } }, next_6_hours: { details: { air_temperature_min: 1, air_temperature_max: 6 } } } }, { time: '2026-10-05T00:00:00Z', data: { instant: { details: { air_temperature: 2 } }, next_6_hours: { details: { air_temperature_min: 0.5, air_temperature_max: 5 } } } }] } });

async function ask(nwsOk: boolean, hit?: Response) {
  const puts: Array<{ cc: string | null }> = [];
  const platform = { env: { QUEUE: fakeKV() }, caches: { default: { match: async () => hit?.clone(), put: async (_k: unknown, r: Response) => void puts.push({ cc: r.headers.get('cache-control') }) } }, context: { waitUntil: (p: Promise<unknown>) => void p } };
  const fetch = vi.fn(async (u: string) => (new URL(u).host === 'api.met.no' ? new Response(metBody(), { headers: { 'content-type': 'application/json' } }) : nwsOk ? new Response(JSON.stringify({ features: [] })) : new Response('busy', { status: 503 })));
  const { GET } = await import('../../src/routes/api/forecast/+server');
  const r = (await GET({ url: new URL('https://x/api/forecast?lat=40.44&lon=-79.99'), platform, fetch, getClientAddress: () => '198.51.100.7' } as never)) as Response;
  return { r, body: (await r.json()) as { alertsStatus: string }, puts };
}

describe('a forecast whose NWS alerts were refused', () => {
  it('is kept five minutes at the edge and in the browser, not an hour', async () => {
    const { r, body, puts } = await ask(false);
    expect(body.alertsStatus).toBe('refused');
    expect([r.headers.get('cache-control'), puts]).toEqual(['public, max-age=300', [{ cc: 'public, max-age=300' }]]);
  });
  it('read back from the edge, the browser is told only what is left of the five minutes', async () => {
    const stored = new Response(JSON.stringify({ lat: 40.44, lon: -79.99, forecast: { days: [{ date: '2026-10-05', tmin: 3, tmax: 9 }] }, alerts: [], alertsStatus: 'refused', attribution: [] }), { headers: { age: '200' } });
    const { r } = await ask(true, stored);
    expect(r.headers.get('cache-control')).toBe('public, max-age=100');
  });
  it('GUARD: an answer whose alerts were answered is kept the hour, as before', async () => {
    const { r, body, puts } = await ask(true);
    expect(body.alertsStatus).toBe('none');
    expect([r.headers.get('cache-control'), puts]).toEqual(['public, max-age=3600', [{ cc: 'public, max-age=3600' }]]);
  });
  it('the device keeps it five minutes, and any other answer thirty', async () => {
    let status = 'refused';
    let calls = 0;
    vi.stubGlobal('sessionStorage', (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; })());
    vi.stubGlobal('fetch', async () => { calls++; return new Response(JSON.stringify({ alertsStatus: status, risk: { level: 'none', text: 'x' } }), { headers: { 'content-type': 'application/json' } }); });
    const { getForecast } = await import('$lib/weather/client');
    await getForecast(40.44, -79.99, 'metric');
    vi.setSystemTime(T + 4 * 60_000);
    await getForecast(40.44, -79.99, 'metric');
    expect(calls).toBe(1);
    vi.setSystemTime(T + 5 * 60_000 + 1);
    status = 'none';
    await getForecast(40.44, -79.99, 'metric');
    expect(calls).toBe(2);
    vi.setSystemTime(T + 30 * 60_000);
    await getForecast(40.44, -79.99, 'metric');
    expect(calls).toBe(2);
  });
});
