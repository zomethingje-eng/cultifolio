/**
 * Round sixty-one, agent S (decision 6, the outside-call cap): counted in the counter object, one share a minute each for
 * MET Norway, the NWS and GBIF, one address at most a tenth of a share (a /48 four tenths), the NWS call counted (a US
 * forecast is two calls), and a call held back said as held back: 503 "not asked", never "did not answer".
 *
 * Adopted from docs/review-60/tests/server--upstream-cap.test.ts, turned to the decision: the reproductions (one host
 * spends the minute; two isolates pass twice the cap) now assert the fix, and the arithmetic guard is restated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, upstreamCall, heldBack, HELD_BACK, UPSTREAM_ADDRESS_PART, NET_RATE_FACTOR } from '$lib/server/sync';
/** GBIF by the site's share alone, as the old `upstreamAllowed` asked (it went in round sixty-two). */
const gbifAllowed = async (platform: unknown) => (await upstreamCall(platform as never, ['gbif'], null)).ok;
import { forecastRefusal } from '$lib/weather/client';
import { fakeKV, countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0); // the start of a minute
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const SHARE = RATE.upstream.limit;
const PART = Math.floor(SHARE * UPSTREAM_ADDRESS_PART);
const platformDO = () => ({ env: { QUEUE: fakeKV(), COUNTERS: countersNs() } });
async function forecast(platform: unknown, ip: string, lat: number, lon = 10) {
  const route = await import('../../src/routes/api/forecast/+server');
  const url = new URL(`https://x/api/forecast?lat=${lat}&lon=${lon}`);
  let asked = 0;
  const met = vi.fn(async () => { asked++; return new Response(JSON.stringify({ properties: { timeseries: [] } })); });
  const r = (await route.GET({ url, platform, fetch: met, getClientAddress: () => ip } as never)) as Response;
  return { r, asked: () => asked };
}
const take = async (platform: unknown, services: Array<'met' | 'nws' | 'gbif'>, ip: string | null, n: number) => {
  let ok = 0;
  for (let i = 0; i < n; i++) if ((await upstreamCall(platform as never, services, ip)).ok) ok++;
  return ok;
};

describe('the cap on outside calls (round sixty-one; the server review, 4; B13)', () => {
  it('one address takes at most a tenth of a share in a minute, and a /48 four tenths', async () => {
    const platform = platformDO();
    expect(await take(platform, ['met'], '203.0.113.9', SHARE)).toBe(PART);
    const r = await upstreamCall(platform as never, ['met'], '203.0.113.9');
    expect(r).toMatchObject({ ok: false, who: 'address' });
    let net = 0;
    for (let n = 0; n < 8; n++) net += await take(platform, ['met'], `2001:db8:1:${n}::/64`, PART);
    expect(net).toBe(PART * NET_RATE_FACTOR);
    // what is left of the share is there for everyone else
    expect((await upstreamCall(platform as never, ['met'], '198.51.100.7')).ok).toBe(true);
  });

  it("once the share is spent by many addresses, another visitor's forecast is 503 \"not asked\" with Retry-After to the next minute, and MET is not asked", async () => {
    const platform = platformDO();
    let spent = 0;
    for (let a = 0; spent < SHARE && a < 100; a++) spent += await take(platform, ['met'], `192.0.${a}.2`, PART); // each address in its own /24, which the shares count as one network since round sixty-three (S2)
    const { r, asked } = await forecast(platform, '198.51.100.7', 51.5);
    const body = (await r.json()) as { error: string; held: boolean };
    expect({ status: r.status, error: body.error, held: body.held, asked: asked() }).toEqual({ status: 503, error: HELD_BACK, held: true, asked: 0 });
    const wait = Number(r.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    expect(r.headers.get('cache-control')).toBe('no-store');
    // the next minute it is asked
    vi.setSystemTime(T + 60_000);
    expect((await forecast(platform, '198.51.100.7', 51.5)).asked()).toBe(1);
  });

  it("a US forecast is two calls: when the NWS's share is spent, it is held back whole, and one elsewhere still goes", async () => {
    const platform = platformDO();
    let spent = 0;
    for (let a = 0; spent < SHARE && a < 100; a++) spent += await take(platform, ['nws'], `192.0.${a}.2`, PART); // each address in its own /24, which the shares count as one network since round sixty-three (S2)
    // Pittsburgh: held back whole. No route spends the NWS's share alone (every NWS call is taken with a MET call), so the
    // first pass's "MET alone, alerts not asked" answer was removed in the second (round sixty-two; the server review, 4).
    expect((await forecast(platform, '198.51.100.7', 40.4, -80)).asked()).toBe(0);
    expect((await forecast(platform, '198.51.100.7', 51.5, -0.1)).asked()).toBe(1); // London: MET alone
  });

  it('the services have shares of their own: GBIF spent leaves MET and the NWS', async () => {
    const platform = platformDO();
    for (let i = 0; i < SHARE; i++) await gbifAllowed(platform);
    expect(await gbifAllowed(platform)).toBe(false);
    expect((await upstreamCall(platform as never, ['met', 'nws'], '198.51.100.7')).ok).toBe(true);
  });

  it('with the counter object bound, two isolates share one count: together they pass one share, not two', async () => {
    const platform = platformDO();
    const isolate = async () => { vi.resetModules(); const m = await import('$lib/server/sync'); return async (p: never) => (await m.upstreamCall(p, ['gbif'], null)).ok; };
    const a = await isolate();
    const b = await isolate();
    let ok = 0;
    for (let i = 0; i < SHARE; i++) { if (await a(platform as never)) ok++; if (await b(platform as never)) ok++; }
    expect(ok).toBe(SHARE);
  });

  it('GUARD: without the counter object, one isolate still holds to the share, and says the rest is held back', async () => {
    const platform = { env: { QUEUE: fakeKV() } };
    expect(await take(platform, ['met'], null, SHARE + 5)).toBe(SHARE);
    const r = await upstreamCall(platform as never, ['met'], null);
    expect(r).toMatchObject({ ok: false, who: 'site' });
  });

  it('GUARD: the arithmetic: one address may now spend a tenth of a share a minute, so it takes ten addresses (or three /48s) to spend one', () => {
    const perAddress = PART, perNet = PART * NET_RATE_FACTOR;
    expect({ perAddress, perNet, addressesToSpend: Math.ceil(SHARE / perAddress), netsToSpend: Math.ceil(SHARE / perNet) }).toEqual({ perAddress: 60, perNet: 240, addressesToSpend: 10, netsToSpend: 3 });
  });
});

describe('a call held back is said as held back (rule 2)', () => {
  it("the server's words: 503 for the site's share, 429 for an address's part, both `held`", async () => {
    const site = heldBack({ ok: false, who: 'site', service: 'met', retryAfter: 12 });
    expect([site.status, site.headers.get('retry-after'), ((await site.json()) as { error: string }).error]).toEqual([503, '12', "not asked: this site's calls are used up for this minute"]);
    const one = heldBack({ ok: false, who: 'address', service: 'gbif', retryAfter: 12 });
    expect([one.status, ((await one.json()) as { held: boolean }).held]).toEqual([429, true]);
  });
  it("the frost line says the site held the call back, not that the forecast could not be reached; a bare 503 reads as before", () => {
    const held = forecastRefusal({ status: 503, held: true }, 'Frost');
    expect(held).toMatch(/used up for this minute/);
    expect(held).toMatch(/not an all-clear/);
    expect(held).not.toMatch(/could not be reached/);
    expect(forecastRefusal(503, 'Frost')).toMatch(/could not be reached/);
    expect(forecastRefusal({ status: 429 })).toBe(forecastRefusal(429));
  });
});
