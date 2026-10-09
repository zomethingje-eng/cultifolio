/**
 * Round sixty-two, agent S (the triage, 6: admission on evidence; the server review, 2 and 11; A24; B11).
 *
 * A vault is reclaimed only when the evidence says so: the sweep marks its meta (`reclaimedAt`) and keeps a note of its
 * own, in one step with the give-back. A vault from before round fifty-eight (no `filled`) or first filled under round
 * fifty-eight (`filled`, no place entry) is adopted once, counted by the seed already; a reclaimed one is counted again.
 * A write to a reclaimed vault needs a checked place; reads never do.
 *
 * Reproductions (FAIL on r62base): the 5 → 4 → 3 drift, the 5 → 6 drift, the reclaimed vault stored unchecked, the meta
 * evidence, and the touch that never wakes the object.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Counters, RECLAIM_DAYS } from '$lib/server/counters';
import { storeOnce, readMeta, writeMeta, resetRateLimits, resetMetaFlush, VaultUnchecked, VaultsClosed, type VaultMeta } from '$lib/server/sync';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { pagedStorage } from './helpers/r61s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAY = 86_400_000;
const meta0 = (filled: boolean | undefined) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, ...(filled === undefined ? {} : { filled }) });
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

/** A site whose seed (the vaults counted before the object) is `seed`, with this vault among them, and the bucket bound to the counter object as it is in production. */
function site(seed: number) {
  const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
  kv.m.set('vaults:all', String(seed));
  const vaults = counters.raw('vaults');
  (vaults.c as unknown as { env: unknown }).env = { STORE: r2 };
  let n = 0;
  const upload = async (now: number, extra: Record<string, unknown> = {}) => { resetMetaFlush(); return storeOnce(r2 as never, ID, await meta(r2), photo(++n), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', counters, now, ...extra }); };
  return { r2, counters, kv, vaults, upload, all: () => vaults.m.get('all') };
}

describe('the drifts A24 describes', () => {
  it('a vault from before round fifty-eight (no `filled`): 5 stays 5 through two reclaims, not 5 → 4 → 3', async () => {
    const s = site(5);
    await writeMeta(s.r2 as never, ID, meta0(undefined));
    await s.upload(T);
    expect([s.all(), (await meta(s.r2)).filled]).toEqual([5, true]); // adopted, and the meta says so
    let t = T;
    for (const _ of [1, 2]) {
      t += (RECLAIM_DAYS + 2) * DAY;
      await s.vaults.c.sweep(t);
      expect(s.all()).toBe(4); // its place given back
      await s.upload(t + DAY);
      expect(s.all()).toBe(5); // and taken again, counted
    }
  });

  it('a vault first filled under round fifty-eight (`filled`, no place entry): adopted once, 5 stays 5, not 5 → 6', async () => {
    const s = site(5);
    await writeMeta(s.r2 as never, ID, meta0(true));
    await s.upload(T);
    expect([s.all(), s.vaults.m.has(`f:${ID}`)]).toEqual([5, true]);
    await s.upload(T + DAY);
    expect(s.all()).toBe(5);
  });

  it("the sweep writes the reclaim into the vault's meta, and the vault's next counted upload clears it", async () => {
    const s = site(1);
    await writeMeta(s.r2 as never, ID, meta0(true));
    await s.upload(T);
    await s.vaults.c.sweep(T + (RECLAIM_DAYS + 2) * DAY);
    expect(typeof (await meta(s.r2)).reclaimedAt).toBe('number');
    await s.upload(T + (RECLAIM_DAYS + 3) * DAY);
    expect([(await meta(s.r2)).reclaimedAt, s.all()]).toEqual([undefined, 1]);
  });
});

describe('a write to a reclaimed vault needs a checked place (B11)', () => {
  async function reclaimed() {
    const s = site(1);
    await writeMeta(s.r2 as never, ID, meta0(true));
    await s.upload(T);
    await s.vaults.c.sweep(T + (RECLAIM_DAYS + 2) * DAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return s;
  }
  it('a touch that throws refuses the write with VaultUnchecked, and nothing is stored', async () => {
    const s = await reclaimed();
    s.vaults.c.touch = (async () => { throw new Error('the object is overloaded'); }) as never;
    const e = await s.upload(T + (RECLAIM_DAYS + 3) * DAY).catch((x) => x);
    expect(e).toBeInstanceOf(VaultUnchecked);
    expect(s.r2.objs.has(photo(2))).toBe(false);
  });
  it('a touch that cannot answer (unavailable) refuses it too', async () => {
    const s = await reclaimed();
    s.vaults.c.touch = (async () => 'unavailable') as never;
    expect(await s.upload(T + (RECLAIM_DAYS + 3) * DAY).catch((x) => x)).toBeInstanceOf(VaultUnchecked);
  });
  it('GUARD: a vault that was never reclaimed still uploads while the counter cannot be asked', async () => {
    const s = site(1);
    await writeMeta(s.r2 as never, ID, meta0(true));
    await s.upload(T);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    s.vaults.c.touch = (async () => { throw new Error('the object is overloaded'); }) as never;
    expect(await s.upload(T + 2 * DAY)).toBe('stored');
  });
  it('GUARD: reads of a reclaimed vault are never refused (the routes that read do not admit)', async () => {
    const s = await reclaimed();
    s.vaults.c.touch = (async () => { throw new Error('the object is overloaded'); }) as never;
    const token = 'c'.repeat(64);
    const { tokenHash } = await import('$lib/sync/crypto');
    const m = await meta(s.r2);
    await writeMeta(s.r2 as never, ID, { ...m, tokenHash: await tokenHash(token) } as VaultMeta);
    const photoRoute = await import('../../src/routes/api/sync/photo/[id]/+server');
    const logRoute = await import('../../src/routes/api/sync/log/+server');
    const platform = { env: { STORE: s.r2, QUEUE: s.kv, COUNTERS: s.counters } };
    const req = (u: string) => { const request = new Request(u, { headers: { authorization: `Bearer ${token}` } }); return { request, url: new URL(u), params: { id: 'p000001' }, platform, getClientAddress: () => '1.2.3.4' } as never; };
    s.r2.get = (async (k: string) => { const o = s.r2.objs.get(k); return o ? { body: o.body, etag: o.etag, json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null; }) as never;
    expect((await photoRoute.GET(req(`https://x/api/sync/photo/p000001?vault=${ID}`))).status).toBe(200);
    expect((await logRoute.GET(req(`https://x/api/sync/log?vault=${ID}`))).status).toBe(200);
  });
});

describe('the reclaim refusal says what still works and when it is asked again', () => {
  it('the data stays, other devices still read it, reading keeps no place, and the device asks within the hour', async () => {
    const r = new VaultsClosed('total', T, true).response();
    const text = ((await r.json()) as { error: string }).error;
    expect(text).toMatch(/no upload for 90 days/);
    expect(text).toMatch(/stays/);
    expect(text).toMatch(/still receive|still read/);
    expect(text).toMatch(/only an upload/);
    expect(text).toMatch(/within the hour/);
    expect(text).not.toMatch(/—/);
    expect(Number(r.headers.get('retry-after'))).toBeLessThanOrEqual(3600);
  });
});

describe('touch wakes the vaults object (the server review, 11)', () => {
  it('a place recorded with no alarm set starts its 90 days: the touch sets the midnight alarm', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    storage.m.set('all', 1);
    storage.m.set(`f:${ID}`, '2026-06-01'); // a place from before round sixty-one, on an object with no alarm
    expect(await c.touch(ID, '2026-10-04', 2000, 0, false, T)).toBe('already');
    expect(storage.alarmAt()).not.toBeNull();
  });
});
