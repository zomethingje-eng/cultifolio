/**
 * Round sixty-two, second pass, agent S: the server review's findings 1, 2 and 5, beyond the reviewer's own reproductions
 * (`r62bs-stalled-pointer-claim`, `r62bs-orphan-after-pointer`, `r62bs-refused-listing-cost`, `r62bs-sweep-touch-race`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, recount, vaultBytes, photoObjectKey, PhotoBusy, RecountCrossed, MAX_BYTES } from '$lib/server/sync';
import { Counters, LEASE_MS } from '$lib/server/counters';
import { fakeKV, fakeR2, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const DAY = 86_400_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
const photoKeys = (r2: FakeR2) => [...r2.objs.keys()].filter((k) => k.startsWith(`vault/${ID}/photo/`));
async function setup() {
  const r2 = casR2(); const counters = countersNs();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  return { r2, counters, T0: await clockOf(r2) };
}
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('a removal cut off after its receipt (the server review, 2)', () => {
  it("of a revived generation: the device's retry deletes the generation the receipt names", async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(100).fill(1), { drop: OWNER }, q(counters, T0));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 11 * MIN), OWNER, T0 + 11 * MIN)).toBe(true);
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(200).fill(2), { drop: OWNER }, q(counters, T0 + 12 * MIN))).toBe('stored');
    const g = (await photoObjectKey(r2 as never, NAME))!;
    expect(g).not.toBe(NAME);
    let fail = true;
    r2.hooks.beforeDelete = async (k) => { if (k === g && fail) { fail = false; throw new Error('R2: 500 internal error'); } };
    const A = T0 + 30 * MIN;
    await expect(deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A)).rejects.toThrow(/R2/);
    expect(JSON.parse(new TextDecoder().decode(r2.objs.get(REF)!.body))).toMatchObject({ g: null, drop: OWNER, was: g.slice(g.lastIndexOf('.') + 1) });
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + MIN), OWNER, A)).toBe(true);
    expect({ keys: photoKeys(r2), listed: await recount(r2 as never, ID, await meta(r2)) }).toEqual({ keys: [], listed: 0 });
  });

  it('when the counter object throws before the delete: the retry finishes it, and the bytes are given back once', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(500).fill(1), { drop: OWNER }, q(counters, T0));
    const v = counters.raw(`bytes:${ID}`);
    const removing = v.c.removing.bind(v.c);
    let fail = true;
    (v.c as unknown as { removing: Counters['removing'] }).removing = async (t, n) => { if (fail) { fail = false; throw new Error('counter object reset'); } return removing(t, n); };
    const A = T0 + 11 * MIN;
    await expect(deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A)).rejects.toThrow(/reset/);
    expect(r2.objs.has(NAME)).toBe(true);
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + MIN), OWNER, A)).toBe(true);
    expect(r2.objs.has(NAME)).toBe(false);
    expect((v.m.get('v') as { bytes: number }).bytes).toBe(0);
    // and a third ask is answered 404, as before: nothing is left
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + 2 * MIN), OWNER, A)).toBe(false);
    expect((v.m.get('v') as { bytes: number }).bytes).toBe(0);
  });

  it('a retry without the removal\'s proof finishes nothing and learns nothing', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(50).fill(1), { drop: OWNER }, q(counters, T0));
    let fail = true;
    r2.hooks.beforeDelete = async (k) => { if (k === NAME && fail) { fail = false; throw new Error('R2: 500'); } };
    // Within ten minutes of the upload, so the stray rule (which needs no proof: the bytes are a removal already decided)
    // does not apply yet.
    const A = T0 + 3 * MIN;
    await expect(deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A)).rejects.toThrow();
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + 30_000), 'e'.repeat(64), A)).toBe(false);
    expect(r2.objs.has(NAME)).toBe(true);
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + MIN), OWNER, A)).toBe(true);
    expect(r2.objs.has(NAME)).toBe(false);
  });

  it('a receipt written before it named its generation: the first generation left behind goes at the next touch, once old', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(70).fill(1), { drop: OWNER }, q(counters, T0));
    await r2.put(REF, JSON.stringify({ g: null, drop: OWNER, at: T0, n: 'x' })); // the first pass's receipt, no `was`
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 11 * MIN), OWNER, T0)).toBe(false);
    expect(photoKeys(r2)).toEqual([]);
  });

  it('a removed name whose first generation is younger than ten minutes keeps it (it may be an upload still landing)', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(70).fill(1), { drop: OWNER }, q(counters, T0));
    await r2.put(REF, JSON.stringify({ g: null, drop: OWNER, at: T0, n: 'x' }));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 2 * MIN), OWNER, T0)).toBe(false);
    expect(photoKeys(r2)).toEqual([NAME]);
  });
});

describe('a claim moves the pointer (the server review, 1)', () => {
  it('names the first generation it found; the photograph reads as before', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0));
    expect(r2.objs.has(REF)).toBe(false); // a first store writes no pointer
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0 + MIN))).toBe('same');
    expect(JSON.parse(new TextDecoder().decode(r2.objs.get(REF)!.body))).toMatchObject({ g: 'bin' });
    expect(await photoObjectKey(r2 as never, NAME)).toBe(NAME);
    // and a removal after it still removes it
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 3 * DAY), OWNER, T0 + 3 * DAY)).toBe(true);
    expect([r2.objs.has(NAME), await photoObjectKey(r2 as never, NAME)]).toEqual([false, null]);
  });

  it('an upload without the proof moves nothing', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0));
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: 'e'.repeat(64) }, q(counters, T0 + MIN))).toBe('same');
    expect(r2.objs.has(REF)).toBe(false);
  });

  it('a claim whose pointer moved under it (a stalled removal landed) is asked to wait, and its retry stores the photograph anew', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0));
    let first = true;
    r2.cas.before = async (k) => {
      if (k !== REF || !first) return;
      first = false;
      // A removal that read no pointer lands its receipt and deletes the generation, just before this claim's write.
      await r2.put(REF, JSON.stringify({ g: null, drop: OWNER, at: T0, was: 'bin', n: 'stalled' }));
      r2.objs.delete(NAME);
    };
    const B = T0 + 11 * MIN;
    await expect(storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, B))).rejects.toBeInstanceOf(PhotoBusy);
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, B + 10_000))).toBe('stored');
    const k = (await photoObjectKey(r2 as never, NAME))!;
    expect(r2.objs.get(k)?.body[0]).toBe(1);
  });
});

describe('no listing while one could not be kept (the server review, 5)', () => {
  it('generation() says busy while a lease is live, and not once it lapsed', async () => {
    const c = new Counters({ storage: countersNs().raw('x').c['ctx' as never]['storage' as never] } as never, {} as never);
    const T = Date.UTC(2026, 9, 4, 12);
    await c.setBytes(0, '2026-10-04', null, T);
    const t = await c.take('vault', 10, MAX_BYTES, '2026-10-04', null, T);
    expect('lease' in t).toBe(true);
    expect((await c.generation(T + 1000)).busy).toBe(true);
    expect((await c.generation(T + LEASE_MS + 1)).busy).toBe(false);
  });

  it('an open with no total kept today is refused without listing; with one, it answers that total without listing', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T = Date.UTC(2026, 9, 4, 12);
    const v = counters.get(`bytes:${ID}`);
    await v.setBytes!(40, '2026-10-04', null, T - 2 * 3_600_000);
    await v.take!('vault', 10, MAX_BYTES, '2026-10-04', null, T);
    const quota = { kv: kv as never, ip: '1.2.3.4', counters, now: T };
    const before = r2.lists();
    expect(await vaultBytes(r2 as never, kv as never, ID, await meta(r2), T, true, quota)).toBe(50);
    counters.raw(`bytes:${ID}`).m.set('v', { bytes: 50, day: 'stale', rc: T });
    await expect(vaultBytes(r2 as never, kv as never, ID, await meta(r2), T, true, quota)).rejects.toBeInstanceOf(RecountCrossed);
    expect(r2.lists() - before).toBe(0);
  });

  it('ten first uploads of a day at once are still each counted (the live one puts the day right for the others)', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T = Date.UTC(2026, 9, 4, 12);
    const quota = { kv: kv as never, ip: '1.2.3.4', counters, now: T };
    const r = await Promise.all(Array.from({ length: 10 }, async (_, i) => storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p00000${i}.bin`, new Uint8Array(100), { drop: OWNER }, quota)));
    expect(r).toEqual(Array(10).fill('stored'));
    expect((counters.raw(`bytes:${ID}`).m.get('v') as { bytes: number }).bytes).toBe(1000);
  });
});
