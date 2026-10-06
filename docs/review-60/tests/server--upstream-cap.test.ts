/**
 * Review of round sixty, server area: the site-wide cap on calls to outside services (RATE.upstream, 600 a minute under
 * the one key `all`), behind the per-address and per-/48 windows.
 *
 * REPRO tests FAIL on 21257b7 (what every other visitor is told while one client spends the cap); GUARD tests PASS.
 * Run: npx vitest run tests/unit/server--upstream-cap.test.ts   (lives in tests/unit/, uses helpers/fake-sync.ts)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE } from '$lib/server/sync';
import { fakeKV } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0); // the start of a minute and of a ten-minute window: every address's windows turn here together
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const gbif = vi.fn(async () => new Response('[]', { headers: { 'content-type': 'application/json' } }));
async function names(platform: unknown, ip: string, q: string) {
  const route = await import('../../src/routes/api/names/+server');
  const url = new URL(`https://x/api/names?q=${encodeURIComponent(q)}`);
  return route.GET({ url, platform, fetch: gbif, getClientAddress: () => ip } as never) as Promise<Response>;
}
async function forecast(platform: unknown, ip: string, lat: number) {
  const route = await import('../../src/routes/api/forecast/+server');
  const url = new URL(`https://x/api/forecast?lat=${lat}&lon=10`);
  const met = vi.fn(async () => new Response(JSON.stringify({ properties: { timeseries: [] } })));
  return route.GET({ url, platform, fetch: met, getClientAddress: () => ip } as never) as Promise<Response>;
}
/** Distinct name-shaped queries: each a miss of the names cache, so each a call to GBIF. */
const word = (i: number) => 'q' + i.toString(26).replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]).padStart(4, 'a');

describe('the cap on outside calls is shared by every visitor (round sixty; the server review, 16)', () => {
  it('REPRO: one IPv6 /48 (four /64s) spends the whole minute in under a second, and every other visitor is told the source "did not answer"', async () => {
    const kv = fakeKV();
    const platform = { env: { QUEUE: kv } };
    let passed = 0;
    // Four /64s of one /48: the /48's window is four times one address's (NET_RATE_FACTOR), 1,200 names.
    for (let n = 0; n < 4 && passed < RATE.upstream.limit; n++)
      for (let i = 0; i < RATE.names.limit; i++) if ((await names(platform, `2001:db8:1:${n}::1`, word(n * 1000 + i))).status === 200) passed++;
    expect(passed).toBe(RATE.upstream.limit); // 600 calls in the first second of the minute, from one host
    // A grower anywhere else, this minute: the frost watch and the name picker.
    const f = await forecast(platform, '198.51.100.7', 51.5);
    const fBody = (await f.json()) as { error: string };
    const p = await names(platform, '198.51.100.7', 'Copiapoa');
    // Today: 502 "forecast source did not answer" (MET was never asked: the site refused itself), which the frost line shows
    // as "the forecast could not be reached just now"; the picker shows "The name service did not answer". Rule 2: a
    // refusal is said as a refusal. Expected: a status and words that say the site held the call back (a 503 with
    // Retry-After to the next minute, and "not asked: this site's calls to it are used up for this minute").
    expect({ status: f.status, error: fBody.error, retry: f.headers.get('retry-after') }).toEqual({ status: 503, error: expect.stringMatching(/not asked|held back|used up/), retry: expect.any(String) });
    expect(p.status).toBe(503);
  });

  it('GUARD: the arithmetic of the cap: what one address and one /48 can spend per ten-minute window, against the 6,000 the site allows in ten minutes', () => {
    const perAddress = RATE.names.limit + RATE.forecast.limit + RATE.match.limit; // 420 outside calls (a US forecast is two: MET and the NWS)
    const perNet = perAddress * 4; // 1,680
    const sitePerWindow = RATE.upstream.limit * (RATE.names.windowMs / RATE.upstream.windowMs); // 6,000
    // Windows are fixed and aligned for every address, so these can all be spent in the first second of a window.
    expect({ perAddress, perNet, sitePerWindow, ipv4ToHoldItShut: Math.ceil(sitePerWindow / perAddress), netsToHoldItShut: Math.ceil(sitePerWindow / perNet) }).toEqual({ perAddress: 420, perNet: 1680, sitePerWindow: 6000, ipv4ToHoldItShut: 15, netsToHoldItShut: 4 });
  });

  it('REPRO (read, shown here): two isolates that open the minute before either flushes each allow the whole 600', async () => {
    const kv = fakeKV();
    const isolate = async () => { vi.resetModules(); return (await import('$lib/server/sync')).upstreamAllowed; };
    const a = await isolate();
    const b = await isolate();
    const platform = { env: { QUEUE: kv } };
    let ok = 0;
    // Each isolate reads the KV window once when it first sees it (0 for both), counts in memory, and flushes once a
    // second or at the limit; KV's own reads are cached up to a minute per location, so a third isolate elsewhere reads 0 too.
    await a(platform as never); await b(platform as never);
    for (let i = 0; i < 700; i++) { if (await a(platform as never)) ok++; if (await b(platform as never)) ok++; }
    expect(ok + 2).toBeLessThanOrEqual(RATE.upstream.limit + 10); // today 1,200: "for the whole site" is per isolate
  });
});
