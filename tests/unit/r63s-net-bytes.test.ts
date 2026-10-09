/**
 * Round sixty-three, agent S (S5): the /48 total for an address's daily upload bytes, left in round fifty-nine ("one
 * address's cap is per /64; a /48 total would need a decision on its size"). The size is the rule every other /48 count
 * uses: four times one address's allowance, 12 GB a day. Before, a host holding a /48 had 65,536 /64s, each a fresh 3 GB.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, readMeta, writeMeta, resetRateLimits, resetMetaFlush, refusal, MAX_IP_BYTES_PER_DAY, NET_RATE_FACTOR, MAX_BYTES } from '$lib/server/sync';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
const NET = '2001:db8:7::/48';
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

async function setup() {
  const r2 = casR2(); const counters = countersNs();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const now = await clockOf(r2);
  // Earlier today, other /64s of this /48 stored nearly the /48's allowance.
  counters.raw(`ipbytes:${NET}`).m.set(`d:${dayOf(now)}`, MAX_IP_BYTES_PER_DAY * NET_RATE_FACTOR - 50);
  return { r2, counters, now, q: (ip: string) => ({ kv: fakeKV() as never, ip, counters, now }) };
}

describe('the /48 total for daily upload bytes (round sixty-three; S5)', () => {
  it('a fresh /64 of a /48 that has stored its 12 GB today is refused, 429 to midnight, said as the network\'s', async () => {
    const { r2, counters, now, q } = await setup();
    const e = await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000001.bin`, new Uint8Array(100).fill(1), { drop: OWNER }, q('2001:db8:7:99::/64')).catch((x) => x);
    const res = refusal(e)!;
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/this network/);
    expect(r2.objs.has(`vault/${ID}/photo/p000001.bin`)).toBe(false);
    // The /64's own count was given back: it stored nothing.
    expect(counters.raw('ipbytes:2001:db8:7:99::/64').m.get(`d:${dayOf(now)}`) ?? 0).toBe(0);
  });

  it('what fits is stored and counted to the /48 as well; an IPv4 address has no network total', async () => {
    const { r2, counters, now, q } = await setup();
    expect(await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000002.bin`, new Uint8Array(40).fill(1), { drop: OWNER }, q('2001:db8:7:1::/64'))).toBe('stored');
    expect(counters.raw(`ipbytes:${NET}`).m.get(`d:${dayOf(now)}`)).toBe(MAX_IP_BYTES_PER_DAY * NET_RATE_FACTOR - 10);
    expect(await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000003.bin`, new Uint8Array(40).fill(2), { drop: OWNER }, q('203.0.113.5'))).toBe('stored');
    expect([...counters.objects.keys()].filter((k) => k.startsWith('ipbytes:') && k.endsWith('/24'))).toEqual([]);
  });

  it('an upload refused by the vault gives its bytes back to the /48 too', async () => {
    const { r2, counters, now, q } = await setup();
    counters.raw(`ipbytes:${NET}`).m.set(`d:${dayOf(now)}`, 0);
    counters.raw(`bytes:${ID}`).m.set('v', { bytes: MAX_BYTES - 5, day: dayOf(now), rc: now });
    const e = await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000004.bin`, new Uint8Array(40).fill(3), { drop: OWNER }, q('2001:db8:7:1::/64')).catch((x) => x);
    expect(refusal(e)!.status).toBe(507);
    expect(counters.raw(`ipbytes:${NET}`).m.get(`d:${dayOf(now)}`)).toBe(0);
  });
});
