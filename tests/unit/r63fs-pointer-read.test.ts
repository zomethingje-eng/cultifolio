/**
 * Round sixty-three, the fix pass, fixer S (the server review of the round, R3 2; its reproduction adopted): a pointer
 * read that fails mid-body (R2's get answers, its json() rejects) was read as "names nothing", and the midnight sweep then
 * removed the photograph's live generation, which nobody touched. Now a pointer that is there and cannot be read, or has
 * a shape this code does not know, is unreadable: the sweep keeps its mark and removes nothing, and a removal that meets
 * it is asked to wait, not told the photograph is already gone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, photoObjectKey, PhotoBusy } from '$lib/server/sync';
import { photoRef, unnamedGenerations, PointerUnreadable } from '$lib/server/photogen';
import { fakeKV, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';
import { countersWithStore } from './helpers/r63s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
type Ns = ReturnType<typeof countersWithStore>;
const q = (counters: Ns, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

/** Stored, removed, and stored again (an Undo on another device): the pointer names a later generation, the live one. */
async function revived(r2: ReturnType<typeof casR2>, ns: Ns) {
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
  const A = T0 + 11 * MIN;
  expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).toBe(true);
  expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN))).toBe('stored');
  const live = await photoObjectKey(r2 as never, NAME);
  expect(live && r2.objs.has(live)).toBe(true);
  return { A, live: live! };
}
/** The pointer's body read fails `times` times (a reset stream). */
function failPointerReads(r2: ReturnType<typeof casR2>, times: number) {
  const realGet = r2.get.bind(r2);
  let left = times;
  (r2 as unknown as { get: (k: string) => Promise<unknown> }).get = async (k: string) => {
    const o = await realGet(k);
    if (k === REF && left > 0 && o) { left--; return { ...o, json: async () => { throw new Error('stream reset'); } }; }
    return o;
  };
  return () => { (r2 as unknown as { get: unknown }).get = realGet; };
}

describe('R3 2: a pointer that cannot be read is never read as naming nothing', () => {
  it('the sweep keeps a revived photograph whose pointer could not be read this once, and its mark', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A, live } = await revived(r2, ns);
    const restore = failPointerReads(r2, 1);
    await ns.raw(`bytes:${ID}`).c.tick(A + 30 * MIN);
    restore();
    expect(r2.objs.has(live)).toBe(true);
    expect(ns.raw(`bytes:${ID}`).s.m.has(`u:${NAME}`)).toBe(true); // kept, so the next night looks again
    // The next night reads it whole: the live generation is named, and stays; the mark goes.
    await ns.raw(`bytes:${ID}`).c.tick(A + 24 * 60 * MIN);
    expect({ live: r2.objs.has(live), mark: ns.raw(`bytes:${ID}`).s.m.has(`u:${NAME}`) }).toEqual({ live: true, mark: false });
  });

  it('a pointer of a shape this code does not know names nothing it can be taken at its word for: unnamedGenerations throws', async () => {
    const r2 = casR2();
    await r2.put(REF, JSON.stringify({ g: 'later-round-shape', n: 'x' }));
    expect((await photoRef(r2 as never, NAME)).unreadable).toBe(true);
    await expect(unnamedGenerations(r2 as never, NAME, Date.now())).rejects.toBeInstanceOf(PointerUnreadable);
    // A removal's receipt is a known shape.
    await r2.put(REF, JSON.stringify({ g: null, drop: OWNER, at: 1, n: 'y' }));
    expect((await photoRef(r2 as never, NAME)).unreadable).toBeUndefined();
  });

  it('a removal that cannot read the pointer is asked to wait, not told the photograph is gone; asked again, it removes it', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A, live } = await revived(r2, ns);
    const restore = failPointerReads(r2, 2); // both looks of this removal
    const r = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A + 2 * MIN), OWNER, A + 2 * MIN);
    restore();
    expect(r).toBeInstanceOf(PhotoBusy);
    expect(r2.objs.has(live)).toBe(true);
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A + 3 * MIN), OWNER, A + 3 * MIN)).toBe(true);
    expect(r2.objs.has(live)).toBe(false);
  });
});
