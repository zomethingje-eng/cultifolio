/**
 * Round sixty-three, agent S (S2): a distributed attack on the outside-call shares. Round sixty-one gave each of MET
 * Norway, the NWS and GBIF a share of 600 calls a minute, one address a tenth of it and an IPv6 /48 four tenths, so ten
 * IPv4 addresses (or three /48s) could spend a share and every other visitor was "not asked" for the rest of the minute
 * (deferred in the triage of round sixty-one). Now an IPv4 /24 counts as one network, as a /48 does, and the last quarter
 * of each share is kept for networks new to the minute: past three quarters, a network that has already made two calls
 * to that service in the minute is held back, and a new one may take two.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetRateLimits, RATE, upstreamCall, heldBack, HELD_BACK_RESERVE, HELD_BACK_NETWORK, UPSTREAM_ADDRESS_PART, NET_RATE_FACTOR, upstreamNetwork } from '$lib/server/sync';
import { UPSTREAM_RESERVE_PART, UPSTREAM_RESERVE_EACH } from '$lib/server/caps';
import { fakeKV, countersNs } from './helpers/fake-sync';

const T = Date.UTC(2026, 9, 4, 12, 0, 0);
beforeEach(() => { resetRateLimits(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T); });
afterEach(() => { vi.useRealTimers(); });

const SHARE = RATE.upstream.limit;
const PART = Math.floor(SHARE * UPSTREAM_ADDRESS_PART);
const RESERVE = Math.floor(SHARE * UPSTREAM_RESERVE_PART);
const platformDO = () => ({ env: { QUEUE: fakeKV(), COUNTERS: countersNs() } });
/** Up to `n` calls from one address; how many went. */
const take = async (platform: unknown, ip: string, n: number, services: Array<'met' | 'nws' | 'gbif'> = ['met']) => {
  let ok = 0;
  for (let i = 0; i < n; i++) if ((await upstreamCall(platform as never, services, ip)).ok) ok++;
  return ok;
};
/** An address in its own /24: `net(7)` is 10.0.7.1, `net(300)` 10.1.44.1. */
const net = (i: number, host = 1) => `10.${i >> 8}.${i & 255}.${host}`;

describe('the shares against many addresses (round sixty-three; S2)', () => {
  it('ten addresses no longer spend a share: a visitor new to the minute is still asked', async () => {
    const platform = platformDO();
    let spent = 0;
    for (let a = 0; a < 10; a++) spent += await take(platform, net(a), PART);
    // Seven and a half addresses spend the open part; the last two, new to the minute, take two each from the reserve.
    expect(spent).toBe(SHARE - RESERVE + 2 * UPSTREAM_RESERVE_EACH);
    expect((await upstreamCall(platform as never, ['met'], '198.51.100.7')).ok).toBe(true);
  });

  it('an IPv4 /24 counts as one network: ten addresses in it take four parts, not ten', async () => {
    const platform = platformDO();
    let spent = 0;
    for (let h = 1; h <= 10; h++) spent += await take(platform, `192.0.2.${h}`, PART);
    expect(spent).toBe(PART * NET_RATE_FACTOR);
    const r = await upstreamCall(platform as never, ['met'], '192.0.2.200');
    expect(r).toMatchObject({ ok: false, who: 'network' });
    expect(upstreamNetwork('192.0.2.200')).toBe('192.0.2.0/24');
    expect(upstreamNetwork('2001:db8:1:2::/64')).toBe('2001:db8:1::/48');
  });

  it('past three quarters, a network that has called is held back, said as the rest kept for others (503 "not asked"); a new one takes two', async () => {
    const platform = platformDO();
    for (let a = 0; a < 8; a++) await take(platform, net(a), PART);
    const old = await upstreamCall(platform as never, ['met'], net(0, 2)); // a second address in a network that has called
    // Its own words since the fix pass (R3 1): the site's calls are not used up, the rest is kept for networks new to the minute.
    expect(old).toMatchObject({ ok: false, who: 'reserve' });
    const res = heldBack(old as Extract<typeof old, { ok: false }>);
    expect([res.status, ((await res.json()) as { error: string; held: boolean }).error]).toEqual([503, HELD_BACK_RESERVE]);
    expect(await take(platform, net(100), 5)).toBe(UPSTREAM_RESERVE_EACH);
    // A /64 of a /48 is the /48 for the reserve as well.
    expect(await take(platform, '2001:db8:5:1::/64', 1) + (await take(platform, '2001:db8:5:2::/64', 5))).toBe(UPSTREAM_RESERVE_EACH);
  });

  it('spending a whole share in a minute takes at least 77 different networks', async () => {
    const platform = platformDO();
    // The cheapest way: the open part from as few networks as the network limit allows (four addresses each), then
    // the reserve two calls at a time from networks that have not called.
    let spent = 0, networks = 0;
    for (let a = 0; spent < SHARE - RESERVE; a++) {
      networks++;
      for (let h = 1; h <= NET_RATE_FACTOR; h++) spent += await take(platform, net(a, h), PART);
    }
    for (let a = 1000; spent < SHARE; a++) { networks++; spent += await take(platform, net(a), PART); }
    expect({ spent, networks }).toEqual({ spent: SHARE, networks: 77 });
    expect((await upstreamCall(platform as never, ['met'], net(5000))).ok).toBe(false);
    // The next minute it is all there again.
    vi.setSystemTime(T + 60_000);
    expect((await upstreamCall(platform as never, ['met'], net(0))).ok).toBe(true);
  });

  it('a US forecast takes from both shares or neither, under the reserve too', async () => {
    const platform = platformDO();
    for (let a = 0; a < 8; a++) await take(platform, net(a), PART, ['nws']);
    // The NWS's share is past three quarters and this network has called it: the whole forecast is held back, and MET's share is untouched.
    expect(await upstreamCall(platform as never, ['met', 'nws'], net(1, 9))).toMatchObject({ ok: false, who: 'reserve', service: 'nws' });
    expect(await take(platform, net(1, 9), 1, ['met'])).toBe(1);
  });

  it('the network limit is said as the network\'s, not the address\'s (429)', async () => {
    const r = heldBack({ ok: false, who: 'network', service: 'gbif', retryAfter: 9 });
    const body = (await r.json()) as { error: string; held: boolean };
    expect([r.status, body.error, body.held]).toEqual([429, HELD_BACK_NETWORK, true]);
  });

  it('GUARD: without the counter object, the /24 is counted in each isolate (the reserve is kept only by the object)', async () => {
    const platform = { env: { QUEUE: fakeKV() } };
    let spent = 0;
    for (let h = 1; h <= 10; h++) spent += await take(platform, `192.0.2.${h}`, PART);
    expect(spent).toBe(PART * NET_RATE_FACTOR);
  });
});
