/**
 * Round sixty-two, agent S (the triage, 6: counting is crash-consistent; A24, B10; the server review, 4).
 *
 * - The sweep gives a place back and lowers `all` in one storage transaction with its cursor, so a write that fails
 *   between them loses nothing (B10's fault injection); an expired lease's deletion and the stale mark the same.
 * - A recount crossing an upload between its landing and its release, or a removal between its delete and its give-back,
 *   is retried, not believed (A24's double count and double subtraction).
 * - A landing whose lease had lapsed still bumps the generation and marks the total stale (the server review, 4).
 *
 * Each reproduction FAILS on the round's base (r62base) and passes with the fix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Counters, LEASE_MS, RECLAIM_DAYS } from '$lib/server/counters';
import { storeOnce, deleteCounted, readMeta, writeMeta, vaultBytes, resetRateLimits, resetMetaFlush, MAX_BYTES } from '$lib/server/sync';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { txStorage } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAY = 86_400_000;
const DAYKEY = '2026-10-04';
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now = T) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

describe('the sweep is crash-consistent (B10)', () => {
  it("a write that fails after a page's places were judged leaves the places and `all` as they were, and the next run reclaims them", async () => {
    const storage = txStorage();
    const c = new Counters({ storage } as never, {} as never);
    storage.m.set('all', 1);
    storage.m.set('f:V', { d: '2026-01-01', w: '2026-01-01' });
    const now = Date.UTC(2026, 0, 1) + (RECLAIM_DAYS + 2) * DAY;
    // the total's write fails, whichever step makes it
    storage.arm((op, keys) => op === 'put' && keys.includes('all'));
    await expect(c.sweep(now)).rejects.toThrow(/injected/);
    storage.arm(null);
    await c.sweep(now);
    expect([storage.m.get('all'), storage.m.has('f:V')]).toEqual([0, false]);
  });

  it('a lapsed lease whose stale mark fails is still there to be dropped and marked by the next request', async () => {
    const storage = txStorage();
    const c = new Counters({ storage } as never, {} as never);
    await c.setBytes(0, DAYKEY, null, T);
    await c.take('vault', 500, MAX_BYTES, DAYKEY, null, T); // never released: its Worker died
    storage.arm((op, keys, e) => op === 'put' && keys.includes('v') && (e?.v as { day?: string } | undefined)?.day === 'stale');
    await expect(c.take('vault', 10, MAX_BYTES, DAYKEY, null, T + LEASE_MS + 1)).rejects.toThrow(/injected/);
    storage.arm(null);
    // the lapsed bytes are not believed: the next take lists
    expect(await c.take('vault', 10, MAX_BYTES, DAYKEY, null, T + LEASE_MS + 2)).toEqual({ recount: true });
  });
});

describe('a recount crossing an upload or a removal is retried, not believed (A24)', () => {
  it('a listing made between an upload landing in R2 and its release does not count the upload twice', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes!(0, DAYKEY, null, T - 2 * 3_600_000); // today's total, put right two hours ago
    const put = r2.put.bind(r2);
    r2.put = (async (k: string, b: Uint8Array, o?: never) => {
      const r = await put(k, b, o);
      // landed, not yet released: a vault open lists now
      if (k === photo(1)) await vaultBytes(r2 as never, fakeKV() as never, ID, await meta(r2), T, true, q(counters)).catch(() => 0);
      return r;
    }) as typeof r2.put;
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(100), PROOF, q(counters))).toBe('stored');
    expect(await v.bytesToday!(DAYKEY)).toBe(100);
  });

  it('a listing made between a removal deleting from R2 and giving the bytes back does not take them off twice', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes!(0, DAYKEY, null, T - 2 * 3_600_000);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(100), PROOF, q(counters));
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(100), PROOF, q(counters));
    expect(await v.bytesToday!(DAYKEY)).toBe(200);
    const del = r2.delete.bind(r2);
    r2.delete = (async (k: string) => {
      await del(k);
      if (k.includes('/photo/p000001')) await vaultBytes(r2 as never, fakeKV() as never, ID, await meta(r2), T, true, q(counters)).catch(() => 0);
    }) as typeof r2.delete;
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters), PROOF.drop, null)).toBe(true);
    expect(await v.bytesToday!(DAYKEY)).toBe(100); // one photograph of 100 bytes is left
  });
});

describe('an open while uploads are live', () => {
  it("answers today's kept total when both its listings are refused, rather than a 503", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes!(40, DAYKEY, null, T - 2 * 3_600_000); // today's total, put right two hours ago
    await v.take!('vault', 10, MAX_BYTES, DAYKEY, null, T); // another device's upload, in flight throughout
    expect(await vaultBytes(r2 as never, fakeKV() as never, ID, await meta(r2), T, true, q(counters))).toBe(50);
  });
  it('GUARD: with no total kept today, two refused listings still answer RecountCrossed', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const v = counters.get(`bytes:${ID}`);
    await v.take!('vault', 10, MAX_BYTES, DAYKEY, 0, T - 60_000); // a lease live from yesterday's row... taken with a base
    await v.setBytes!(0, '2026-10-03', null, T - DAY); // and the row is yesterday's
    const e = await vaultBytes(r2 as never, fakeKV() as never, ID, await meta(r2), T, true, q(counters)).catch((x) => x);
    expect((e as Error).constructor.name).toBe('RecountCrossed');
  });
});

describe('a landing whose lease had lapsed (the server review, 4)', () => {
  // Adopted from docs/review-61/tests/server--review.test.ts (a reproduction).
  it('a listing crossed by a landing whose lease lapsed is refused', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    const a = await v.take!('vault', 100, MAX_BYTES, DAYKEY, 0, T);
    expect('lease' in a && a.lease).toBeTruthy();
    const later = T + LEASE_MS + 60_000;
    expect(await v.take!('vault', 50, MAX_BYTES, DAYKEY, null, later)).toEqual({ recount: true });
    const g = await v.generation!();
    await v.release!((a as { lease: string }).lease, true); // the slow upload lands now
    expect(await v.take!('vault', 50, MAX_BYTES, DAYKEY, 0, later, g.gen)).toEqual({ recount: true });
  });
  it('and the total it landed in is no longer believed', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    const a = await v.take!('vault', 100, MAX_BYTES, DAYKEY, 0, T);
    const later = T + LEASE_MS + 60_000;
    await v.setBytes!(0, DAYKEY, null, later); // a listing that could not see it, committed
    await v.release!((a as { lease: string }).lease, true);
    expect(await v.bytesToday!(DAYKEY)).toBeNull();
  });
});
