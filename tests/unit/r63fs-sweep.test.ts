/**
 * Round sixty-three, the fix pass, fixer S: the sweep of unnamed photograph bytes (S1), two findings of the server review
 * of the round.
 *
 * - R3 6: the sweep dated every hold of a run by the run's start, so on a slow bucket a hold taken a minute in was written
 *   already lapsed, and an upload or a removal of that photograph could run beside the sweep. Each hold is now dated by
 *   the time it is taken.
 * - R3 8: a mark the sweep kept because it could not read the photograph (an R2 fault that repeats for that key, a pointer
 *   it cannot read) woke the vault's object every midnight for good. Such a mark is now dropped after seven nights of it,
 *   its photograph's name logged; a night the name was held, or a generation too young to judge, is not counted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, photoObjectKey } from '$lib/server/sync';
import { MARK_FAULT_NIGHTS, HOLD_MS } from '$lib/server/counters';
import { fakeKV, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';
import { countersWithStore } from './helpers/r63s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const NAME = `vault/${ID}/photo/p000001.bin`;
const REF = `vault/${ID}/photoref/p000001.json`;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
type Ns = ReturnType<typeof countersWithStore>;
const q = (counters: Ns, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
const vaultObj = (ns: Ns) => ns.raw(`bytes:${ID}`);
const gens = (r2: FakeR2) => [...r2.objs.keys()].filter((k) => k.startsWith(`vault/${ID}/photo/`)).sort();
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => { vi.restoreAllMocks(); });

/** A photograph stored, removed, then stored again with its pointer write cut off: one unnamed generation, marked. */
async function cutOffRestore(r2: ReturnType<typeof casR2>, ns: Ns) {
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
  const A = T0 + 11 * MIN;
  expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN)).toBe(true);
  let cut = true;
  r2.cas.before = async (k) => { if (k === REF && cut && [...r2.objs.keys()].some((x) => /\.g[0-9a-z]+$/.test(x))) { cut = false; throw new Error('the Worker stopped'); } };
  await expect(storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN))).rejects.toThrow(/stopped/);
  r2.cas.before = undefined;
  expect(gens(r2)).toHaveLength(1);
  return { A };
}

describe('R3 6: each hold of the sweep is dated by when it is taken', () => {
  it('a slow listing two minutes long: the hold renewed before the delete still holds the name against an upload', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    const run = A + 12 * MIN;
    const real = Date.now();
    // The bucket's listing takes two minutes of the run.
    const list = r2.list.bind(r2);
    (r2 as unknown as { list: unknown }).list = async (o: unknown) => { vi.spyOn(Date, 'now').mockReturnValue(real + 2 * MIN); return list(o as never); };
    // Just before the delete, an upload of the same photograph asks for the name, at the run's own clock two minutes in.
    let asked: { ok: boolean } | null = null;
    const head = r2.head.bind(r2);
    (r2 as unknown as { head: unknown }).head = async (k: string) => {
      if (!asked && /\.g[0-9a-z]+$/.test(k)) asked = await vaultObj(ns).c.hold(NAME, run + 2 * MIN + 1000);
      return head(k);
    };
    await vaultObj(ns).c.tick(run);
    expect(2 * MIN + 1000).toBeGreaterThan(HOLD_MS); // dated by the run's start, the hold would have lapsed by then
    expect(asked).toMatchObject({ ok: false }); // the sweep still held it, so the upload waits its ten seconds
    expect(gens(r2)).toEqual([]);
  });
});

describe('R3 8: a mark the sweep cannot act on is not kept for good', () => {
  it('a photograph whose pointer cannot be read keeps its mark, nothing removed, for seven nights; at the eighth the mark goes, logged', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    // A pointer this code cannot read, every night.
    await r2.put(REF, '{"not a pointer"');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = vaultObj(ns).s;
    const NIGHTS = 7; // the decision of the fix pass: seven nights
    for (let night = 1; night <= NIGHTS; night++) {
      await vaultObj(ns).c.tick(A + night * DAY);
      await vaultObj(ns).c.tick(A + night * DAY + 1000); // a run again a second later is the same night
      expect({ night, mark: s.m.has(`u:${NAME}`), left: gens(r2).length }).toEqual({ night, mark: true, left: 1 });
    }
    expect([(s.m.get(`u:${NAME}`) as { n: number }).n, MARK_FAULT_NIGHTS]).toEqual([NIGHTS, NIGHTS]);
    await vaultObj(ns).c.tick(A + (NIGHTS + 1) * DAY);
    expect({ mark: s.m.has(`u:${NAME}`), left: gens(r2).length }).toEqual({ mark: false, left: 1 }); // nothing removed on an unread pointer
    expect(errors.mock.calls.some((c) => String(c[0]).includes(NAME) && String(c[0]).includes('mark is dropped'))).toBe(true);
    // With no mark left the object is not woken again for it.
    expect([...s.m.keys()].some((k) => k.startsWith('u:'))).toBe(false);
  });

  it('nights the name was held are not counted, and a new mark starts the count again', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    const { A } = await cutOffRestore(r2, ns);
    await r2.put(REF, '{"not a pointer"');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = vaultObj(ns).s;
    for (let night = 1; night <= 3; night++) await vaultObj(ns).c.tick(A + night * DAY);
    expect((s.m.get(`u:${NAME}`) as { n: number }).n).toBe(3);
    // Held on night four: not counted.
    expect((await vaultObj(ns).c.hold(NAME, A + 4 * DAY - 1000)).ok).toBe(true);
    await vaultObj(ns).c.tick(A + 4 * DAY);
    expect((s.m.get(`u:${NAME}`) as { n: number }).n).toBe(3);
    // A new step on the photograph marks it again: the count starts over.
    await vaultObj(ns).c.markUnnamed(NAME, A + 5 * DAY);
    expect((s.m.get(`u:${NAME}`) as { n?: number }).n).toBeUndefined();
  });

  it('GUARD: a revived photograph read whole on a later night keeps its live generation and its mark goes as done', async () => {
    const r2 = casR2(); const ns = countersWithStore(r2);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(ns, T0));
    const A = T0 + 11 * MIN;
    await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(ns, A), OWNER, A - MIN);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(700).fill(2), { drop: OWNER }, q(ns, A + MIN));
    const live = (await photoObjectKey(r2 as never, NAME))!;
    await vaultObj(ns).c.tick(A + DAY);
    expect({ live: r2.objs.has(live), mark: vaultObj(ns).s.m.has(`u:${NAME}`) }).toEqual({ live: true, mark: false });
  });
});
