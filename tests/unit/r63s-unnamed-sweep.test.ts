/**
 * Round sixty-three, agent S (S1): the sweep of unnamed photograph bytes. Round sixty-two removed a generation nothing
 * names only at the next touch of that photograph; a photograph never touched again kept such bytes for good, counted
 * against the vault's 2 GB. Now a removal and a store of a removed photograph first mark the photograph in the vault's
 * counter object (`u:<name>`), and that object's alarm removes what is unnamed and at least ten minutes old, giving its
 * bytes back, with no touch of the photograph at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, recount, PhotoBusy } from '$lib/server/sync';
import { PHOTO_SWEEP_PAGE } from '$lib/server/counters';
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
const vaultObj = (ns: Ns) => ns.raw(`bytes:${ID}`);
const total = (ns: Ns) => (vaultObj(ns).s.m.get('v') as { bytes: number } | undefined)?.bytes;
const gens = (r2: FakeR2) => [...r2.objs.keys()].filter((k) => k.startsWith(`vault/${ID}/photo/`)).sort();
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

/** A photograph stored, removed, then stored again with its pointer write cut off (the Worker stopped between the two writes). */
async function cutOffRestore(r2: ReturnType<typeof casR2>, ns: Ns) {
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
  const A = T0 + 11 * MIN;
  expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).toBe(true);
  // The revival stores generation two, then the Worker stops before the pointer names it.
  let cut = true;
  r2.cas.before = async (k) => { if (k === REF && cut && [...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x))) { cut = false; throw new Error('the Worker stopped'); } };
  await expect(storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN))).rejects.toThrow(/stopped/);
  r2.cas.before = undefined;
  return { T0, A };
}

describe('the sweep of unnamed photograph bytes (round sixty-three; S1)', () => {
  it('removes a generation an upload stored and never named, and gives its bytes back, with no later touch of the photograph', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    expect(gens(r2)).toHaveLength(1); // the unnamed generation two, counted
    expect(total(ns)).toBe(700);
    // Nobody touches the photograph again. The vault object's alarm runs past ten minutes on.
    await vaultObj(ns).c.tick(A + 12 * MIN);
    expect({ left: gens(r2), total: total(ns), listed: await recount(r2 as never, ID, await meta(r2)) }).toEqual({ left: [], total: 0, listed: 0 });
    // The mark is gone with the work, so the next run asks the bucket nothing.
    const lists = r2.lists();
    await vaultObj(ns).c.tick(A + 30 * MIN);
    expect(r2.lists()).toBe(lists);
    expect([...vaultObj(ns).s.m.keys()].filter((k) => k.startsWith('u:'))).toEqual([]);
  });

  it('removes what a removal cut off after its receipt left behind, when the device never asks again', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
    let fail = true;
    r2.hooks.beforeDelete = async (k) => { if (k === NAME && fail) { fail = false; throw new Error('R2: 500'); } };
    const A = T0 + 11 * MIN;
    await expect(deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).rejects.toThrow(/R2/);
    expect(gens(r2)).toEqual([NAME]);
    await vaultObj(ns).c.tick(A + 11 * MIN);
    expect({ left: gens(r2), total: total(ns) }).toEqual({ left: [], total: 0 });
  });

  it('never takes an upload in flight: a generation under ten minutes old is left and its mark kept, and taken at a later run', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    // Too soon after the mark: nothing is read.
    const lists = r2.lists();
    await vaultObj(ns).c.tick(A + 5 * MIN);
    expect({ left: gens(r2).length, lists: r2.lists() }).toEqual({ left: 1, lists });
    // The generation was written four minutes before the run (an upload could still be about to name it): left.
    r2.objs.get(gens(r2)[0])!.uploaded = new Date(A + 8 * MIN);
    await vaultObj(ns).c.tick(A + 12 * MIN);
    expect(gens(r2)).toHaveLength(1);
    expect([...vaultObj(ns).s.m.keys()].filter((k) => k.startsWith('u:'))).toEqual([`u:${NAME}`]);
    expect(vaultObj(ns).s.alarmAt()).not.toBeNull();
    await vaultObj(ns).c.tick(A + 19 * MIN);
    expect({ left: gens(r2), total: total(ns) }).toEqual({ left: [], total: 0 });
  });

  it('leaves a photograph whose name an upload or a removal holds, and keeps its mark', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    const held = await vaultObj(ns).c.hold(NAME, A + 12 * MIN);
    expect(held.ok).toBe(true);
    await vaultObj(ns).c.tick(A + 12 * MIN + 1000);
    expect(gens(r2)).toHaveLength(1);
    expect(vaultObj(ns).s.m.has(`u:${NAME}`)).toBe(true);
  });

  it('a run cut off between the delete and the give-back gives nothing twice, and the total is not believed until a listing', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    const s = vaultObj(ns).s;
    // The give-back's write fails (the object was evicted mid-run).
    s.arm((op, keys) => op === 'put' && keys.includes('gen'));
    await vaultObj(ns).c.tick(A + 12 * MIN).catch(() => {});
    s.arm(null);
    expect(gens(r2)).toEqual([]); // the bytes went from the bucket
    // The removal's lease is live, so no listing is believed meanwhile; once it lapses the total is marked stale.
    expect([...s.m.keys()].some((k) => k.startsWith('p:rm:'))).toBe(true);
    expect(s.m.has(`u:${NAME}`)).toBe(true); // the mark stays, so the next run looks again
    await vaultObj(ns).c.tick(A + 25 * MIN);
    expect(s.m.has(`u:${NAME}`)).toBe(false);
    expect((s.m.get('v') as { day: string }).day).toBe('stale'); // the lapsed lease: the next take lists the bucket again
    expect(await recount(r2 as never, ID, await meta(r2))).toBe(0);
  });

  it('a mark that cannot be written stops the step that could leave unnamed bytes: the removal is asked to wait', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
    vaultObj(ns).s.arm((op, keys) => op === 'put' && keys.some((k) => k.startsWith('u:')));
    const A = T0 + 11 * MIN;
    const r = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN);
    expect(r).toBeInstanceOf(PhotoBusy);
    expect({ left: gens(r2), pointer: r2.objs.has(REF) }).toEqual({ left: [NAME], pointer: false });
  });

  it('costs nothing for a vault with no removal or re-store, and a page of photographs a run otherwise', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    // Uploads alone mark nothing: the alarm asks the bucket nothing.
    for (let i = 0; i < 5; i++) await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p00000${i}.bin`, new Uint8Array(10).fill(i + 1), { drop: OWNER }, q(ns, T0));
    expect([...vaultObj(ns).s.m.keys()].filter((k) => k.startsWith('u:'))).toEqual([]);
    const before = { lists: r2.lists() };
    await vaultObj(ns).c.tick(T0 + 20 * MIN);
    expect(r2.lists()).toBe(before.lists);
    // Many marks: one page a run, and the run asks to be woken again a second later.
    const s = vaultObj(ns).s;
    for (let i = 0; i < PHOTO_SWEEP_PAGE + 20; i++) s.m.set(`u:vault/${ID}/photo/q${String(i).padStart(6, '0')}.bin`, { at: T0 });
    const now = T0 + 30 * MIN;
    await vaultObj(ns).c.tick(now);
    expect([...s.m.keys()].filter((k) => k.startsWith('u:')).length).toBe(20);
    expect(s.alarmAt()).toBe(now + 1000);
    await vaultObj(ns).c.tick(now + 1000);
    expect([...s.m.keys()].filter((k) => k.startsWith('u:')).length).toBe(0);
  });
});
