/**
 * Round sixty-one, agent S (decision 6, recounts and leases): the recount's second listing keeps its generation check, two
 * crossed listings ask the device to try again (503), and a lease that lapsed marks the vault's total stale so the next
 * request lists (the second outside review, B11 and B14).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeOnce, readMeta, writeMeta, vaultBytes, resetRateLimits, resetMetaFlush, RecountCrossed, refusal, vaultIdFor } from '$lib/server/sync';
import { LEASE_MS } from '$lib/server/counters';
import { tokenHash } from '$lib/sync/crypto';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number, id = ID) => `vault/${id}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAYKEY = '2026-10-04';
const meta0 = () => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled: true });
const meta = async (r2: FakeR2, id = ID) => (await readMeta(r2 as never, id))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

/** Every listing of the vault's photographs is crossed by a change (a removal's receipt bumps the generation), `n` times. */
function crossListings(r2: FakeR2, counters: ReturnType<typeof countersNs>, n: number, id = ID) {
  const list = r2.list.bind(r2);
  let left = n;
  r2.list = async (o) => {
    if (o.prefix === `vault/${id}/photo/` && left > 0) { left--; await counters.get(`bytes:${id}`).give('vault', 0, DAYKEY, `crossing-${left}`); }
    return list(o);
  };
}

describe('the recount keeps its generation check on the second try (round sixty-one; B11)', () => {
  it('a vault read whose two listings are both crossed commits neither and throws RecountCrossed', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, meta0());
    await r2.put(photo(1), new Uint8Array(10));
    crossListings(r2, counters, 2);
    await expect(vaultBytes(r2 as never, kv as never, ID, await meta(r2), T, false, { kv: kv as never, ip: '1.2.3.4', counters })).rejects.toBeInstanceOf(RecountCrossed);
    expect(counters.objects.get(`bytes:${ID}`)!.m.get('v')).toBeUndefined(); // nothing written over the crossing change
  });
  it('one crossing: the second listing is committed', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, meta0());
    await r2.put(photo(1), new Uint8Array(10));
    crossListings(r2, counters, 1);
    expect(await vaultBytes(r2 as never, kv as never, ID, await meta(r2), T, false, { kv: kv as never, ip: '1.2.3.4', counters })).toBe(10);
  });
  it("a day's first upload whose two listings are crossed is refused with 503 and Retry-After, stores nothing and gives the address's bytes back", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    crossListings(r2, counters, 2);
    const e = await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(100), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T }).catch((x) => x);
    expect(e).toBeInstanceOf(RecountCrossed);
    const res = refusal(e)!;
    expect([res.status, Number(res.headers.get('retry-after')) > 0, res.headers.get('cache-control')]).toEqual([503, true, 'no-store']);
    expect(r2.objs.has(photo(2))).toBe(false);
    expect(counters.objects.get('ipbytes:1.2.3.4')!.m.get(`d:${DAYKEY}`)).toBe(0);
  });
  it('the vault route answers a crossed recount with 503, not a 500', async () => {
    const token = 'c'.repeat(64);
    const id = await vaultIdFor(token);
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, id, { tokenHash: await tokenHash(token), created: 'c', entitlement: 'open', bytes: 0, filled: true });
    crossListings(r2, counters, 2, id);
    const { GET } = await import('../../src/routes/api/sync/vault/+server');
    const request = new Request(`https://x/api/sync/vault?vault=${id}`, { headers: { authorization: `Bearer ${token}` } });
    const r = await GET({ request, url: new URL(request.url), platform: { env: { STORE: r2, QUEUE: kv, COUNTERS: counters } }, getClientAddress: () => '1.2.3.4' } as never);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBeTruthy();
  });
});

describe('a lapsed lease marks the total stale (round sixty-one; B14)', () => {
  it('the next take after a lease lapsed lists the bucket, so the lapsed bytes are not kept counted for up to an hour', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes(0, DAYKEY, null, T);
    const t = await v.take('vault', 1_000_000, 2 ** 31, DAYKEY, null, T);
    expect(t).toMatchObject({ ok: true }); // ...and its upload never lands, nor is it released
    expect(await v.take('vault', 10, 2 ** 31, DAYKEY, null, T + LEASE_MS + 1)).toEqual({ recount: true });
    expect(await v.bytesToday(DAYKEY)).toBeNull();
    // the caller lists (the bucket holds nothing) and the total is put right
    const kv = fakeKV();
    expect(await vaultBytes(r2 as never, kv as never, ID, await meta(r2), T + LEASE_MS + 2, false, { kv: kv as never, ip: '1.2.3.4', counters })).toBe(0);
  });
  it('the midnight sweep that drops a lapsed lease marks the total stale too', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes(0, DAYKEY, null, T);
    await v.take('vault', 500, 2 ** 31, DAYKEY, null, T);
    await counters.raw(`bytes:${ID}`).c.sweep(T + LEASE_MS + 1);
    expect(await v.bytesToday(DAYKEY)).toBeNull();
  });
  it('a lease still live leaves the total believed', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes(0, DAYKEY, null, T);
    await v.take('vault', 500, 2 ** 31, DAYKEY, null, T);
    expect(await v.take('vault', 10, 2 ** 31, DAYKEY, null, T + LEASE_MS - 1)).toMatchObject({ ok: true, before: 500 });
  });
});
