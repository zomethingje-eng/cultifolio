/**
 * Round sixty-two, agent S (the triage, 6; the server review, 6 and suggestion 1).
 *
 * - (Second pass: the "only the NWS share spent" answer is gone, since no request reaches it (the server review, 4; see
 *   r62bs-nws-held-unreachable.test.ts); its test went with it, and the guard below stays.)
 * - A held answer carries its `retryAfter` to the page, which asks again then (the place page said "asked again in a few
 *   minutes" and never asked).
 *
 * The client's `retryAfter` test FAILS on r62base.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, upstreamCall, UPSTREAM_ADDRESS_PART } from '$lib/server/sync';
import { fakeKV, countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0);
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const SHARE = RATE.upstream.limit;
const PART = Math.floor(SHARE * UPSTREAM_ADDRESS_PART);
const metBody = () => JSON.stringify({ properties: { timeseries: [{ time: '2026-10-04T18:00:00Z', data: { instant: { details: { air_temperature: 3 } }, next_6_hours: { details: { air_temperature_min: 1, air_temperature_max: 6 } } } }, { time: '2026-10-05T00:00:00Z', data: { instant: { details: { air_temperature: 2 } }, next_6_hours: { details: { air_temperature_min: 0.5, air_temperature_max: 5 } } } }] } });

async function spendNws(platform: unknown) {
  let spent = 0;
  for (let a = 0; spent < SHARE && a < 100; a++) for (let i = 0; i < PART; i++) if ((await upstreamCall(platform as never, ['nws'], `192.0.2.${a}`)).ok) spent++;
  expect(spent).toBe(SHARE);
}

describe('a US forecast with a share spent', () => {
  it('GUARD: with MET spent too, it is held back whole, as before', async () => {
    const platform = { env: { QUEUE: fakeKV(), COUNTERS: countersNs() } };
    await spendNws(platform);
    let spent = 0;
    for (let a = 0; spent < SHARE && a < 100; a++) for (let i = 0; i < PART; i++) if ((await upstreamCall(platform as never, ['met'], `203.0.113.${a}`)).ok) spent++;
    const fetch = vi.fn(async () => new Response(metBody()));
    const { GET } = await import('../../src/routes/api/forecast/+server');
    const r = (await GET({ url: new URL('https://x/api/forecast?lat=40.44&lon=-79.99'), platform, fetch, getClientAddress: () => '198.51.100.7' } as never)) as Response;
    expect([r.status, fetch.mock.calls.length]).toEqual([503, 0]);
  });
});

describe('a held answer tells the page when to ask again', () => {
  it("the forecast client keeps the server's Retry-After with `held`", async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'not asked', held: true, service: 'met', retryAfter: 17 }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '17' } }));
    const { getForecast, reaskAfterMs } = (await import('$lib/weather/client')) as unknown as { getForecast: (a: number, b: number, u: string) => Promise<unknown>; reaskAfterMs: (r: unknown) => number | null };
    const r = await getForecast(51.5, -0.12, 'metric');
    expect(r).toMatchObject({ ok: false, status: 503, held: true, retryAfter: 17 });
    expect(reaskAfterMs(r)).toBe(17_000);
    expect(reaskAfterMs({ ok: false, status: 502 })).toBeNull(); // not held: asked again when the page is next opened, as it says
  });
});
