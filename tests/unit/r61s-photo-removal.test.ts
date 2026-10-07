/**
 * Round sixty-one, agent S (decision 5, the server half): a photograph's removal decided by claims alone, a claim only for
 * an upload that carries the matching proof, the proof checked first, and the hold fenced just before the delete.
 *
 * Adopted from docs/review-60/tests/server--photo-removal.test.ts (its three reproductions, which assert the fixed
 * behaviour, and its guard), with B10's interleaving added: the fenced case passes now, and the residual one (a delete
 * call that itself stalls past the hold) is `it.fails` until generation-addressed photo objects land in round sixty-two.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, PhotoBusy } from '$lib/server/sync';
import { HOLD_MS } from '$lib/server/counters';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64); // the drop proof a key-holder's device makes for this photograph
const STRANGER = 'a'.repeat(64); // any 64 hex digits: what a holder of the bearer token alone can send
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const MIN = 60_000;
const meta0 = () => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled: true });
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());
/** The fake bucket's own clock (its `uploaded` times): the server's "now" in these tests, so a claim and an upload agree. */
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };

describe('the newer-upload rule judged by claims alone (round sixty-one; the server review, 1 to 3; B9)', () => {
  it('a photograph whose first upload lands after another device removed its record is removed once its claim is swept', async () => {
    // Device A added the photograph offline; online, it pushes its batches first and its photographs after. Device B pulls
    // the batch, the grower removes the (still blank) photograph on B at R, and A's upload of it lands at U > R.
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(400).fill(1), { drop: OWNER }, q(counters, await clockOf(r2)));
    const U = r2.objs.get(photo(1))!.uploaded.getTime();
    const R = U - 20_000;
    // Ten minutes later B asks for the bytes to go, with R: the upload's claim is after R, so 409, which the device asks
    // again after (the lead's engine change); once the claim is swept (two days), the removal goes through.
    const first = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, U + 11 * MIN), OWNER, R);
    await counters.raw(`bytes:${ID}`).c.sweep(U + 3 * 86_400_000);
    const later = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, U + 3 * 86_400_000), OWNER, R);
    expect({ first, later, held: r2.objs.has(photo(1)) }).toEqual({ first: 'newer', later: true, held: false });
  });

  it("an object with no claim on it is removed whatever R2's own upload time says", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    await r2.put(photo(5), new Uint8Array(10), { customMetadata: { drop: OWNER } });
    const U = r2.objs.get(photo(5))!.uploaded.getTime();
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(5), q(counters, U + MIN), OWNER, U - MIN)).toBe(true);
  });

  it('a holder of the bearer token alone (no key, no drop proof) cannot make a removed photograph undeletable', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(400).fill(2);
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), bytes, { drop: OWNER }, q(counters, T0));
    const R = T0 + MIN; // the grower removes it
    // The token-holder PUTs the same bytes back with any proof: "already there", and no claim, since the proof differs.
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(2), bytes, { drop: STRANGER }, q(counters, T0 + 5 * MIN))).toBe('same');
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(2), q(counters, T0 + 11 * MIN), OWNER, R)).toBe(true);
  });

  it('an honest re-PUT (a lost reply) with the matching proof still claims the name', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(6), new Uint8Array(10), { drop: OWNER }, q(counters, T0));
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(6), new Uint8Array(10), { drop: OWNER }, q(counters, T0 + 5 * MIN))).toBe('same');
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(6), q(counters, T0 + 6 * MIN), OWNER, T0 + MIN)).toBe('newer');
  });

  it('without the drop proof, the answer is the same whatever removal time is sent, and the name is never held', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    await storeOnce(r2 as never, ID, await meta(r2), photo(3), new Uint8Array(10), { drop: OWNER }, q(counters, await clockOf(r2)));
    const truth = r2.objs.get(photo(3))!.uploaded.getTime();
    const v = counters.raw(`bytes:${ID}`);
    const hold = vi.spyOn(v.c, 'hold');
    let lo = truth - 86_400_000, hi = truth + 1, asks = 0;
    const answers = new Set<unknown>();
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await deleteCounted(r2 as never, ID, await meta(r2), photo(3), q(counters, truth + 11 * MIN), STRANGER, mid);
      answers.add(r);
      asks++;
      if (r === 'newer') lo = mid; else hi = mid;
    }
    expect({ answers: [...answers], held: hold.mock.calls.length }).toEqual({ answers: ['noproof'], held: 0 });
    expect(asks).toBeGreaterThan(20);
  });

  it("a removal that finds the name busy is told one fixed wait, not the time left on another request's hold", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(7), new Uint8Array(10), { drop: OWNER }, q(counters, T0));
    const waits: number[] = [];
    for (const after of [1_000, 30_000, 55_000]) {
      const h = await counters.get(`bytes:${ID}`).hold(photo(7), T0 + MIN);
      if (!h.ok) throw new Error('not held');
      const r = await deleteCounted(r2 as never, ID, await meta(r2), photo(7), q(counters, T0 + MIN + after), OWNER);
      expect(r).toBeInstanceOf(PhotoBusy);
      waits.push(Number((r as PhotoBusy).response().headers.get('retry-after')));
      await counters.get(`bytes:${ID}`).unhold(photo(7), h.token);
    }
    expect(new Set(waits).size).toBe(1);
  });

  it('GUARD: a key-holder can always remove (header omitted): the rule protects honest devices only, by design', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(4), new Uint8Array(10), { drop: OWNER }, q(counters, T0));
    await storeOnce(r2 as never, ID, await meta(r2), photo(4), new Uint8Array(10), { drop: OWNER }, q(counters, T0 + 9 * MIN));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(4), q(counters, T0 + 10 * MIN), OWNER, null)).toBe(true);
    expect(((counters.objects.get(`bytes:${ID}`)!.m.get('v')) as { bytes: number }).bytes).toBe(0);
  });
});

describe("the hold is fenced just before the delete (round sixty-one; B10)", () => {
  /** A removal (A) whose step stalls past its hold, a second removal (C) once the hold lapsed, and a revival (B) stored after C. */
  async function interleave(stall: 'look' | 'delete') {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(300).fill(1), { drop: OWNER }, q(counters, T0));
    const A = T0 + 11 * MIN;
    const v = counters.raw(`bytes:${ID}`);
    let reached!: () => void; const atStall = new Promise<void>((r) => (reached = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    let stalled = false;
    const heldByA = () => (v.m.get(`h:${photo(1)}`) as { at: number } | undefined)?.at === A;
    if (stall === 'look') r2.hooks.afterHead = async (k) => { if (k === photo(1) && !stalled && heldByA()) { stalled = true; reached(); await gate; } };
    else r2.hooks.beforeDelete = async (k) => { if (k === photo(1) && !stalled) { stalled = true; reached(); await gate; } };
    const a = deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, A), OWNER, A - MIN);
    await atStall;
    // A's hold lapses; C removes the photograph, and B revives it (stores it again) after that.
    const c = await deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(counters, A + HOLD_MS + 1_000), OWNER, A + HOLD_MS);
    expect(c).toBe(true);
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(300).fill(2), { drop: OWNER }, q(counters, A + HOLD_MS + 2_000))).toBe('stored');
    go();
    const ra = await a;
    return { ra, kept: r2.objs.has(photo(1)) };
  }

  it("a removal whose look stalled past its hold does not delete the revival stored meanwhile", async () => {
    const { ra, kept } = await interleave('look');
    expect(kept).toBe(true);
    expect(ra).toBeInstanceOf(PhotoBusy); // its hold is gone: the device asks again, and then the revival's claim keeps it
  });

  // The residual race, stated on /about/formats: the fence is a renewal and a second look, and the R2 delete call that
  // follows can itself stall past the hold. Generation-addressed photo objects with a fenced pointer close it; they are
  // the data-model work of round sixty-two. Until then this interleaving loses the revival, and this test fails.
  it.fails('a removal whose R2 delete call itself stalls past its hold still deletes the revival (until round sixty-two)', async () => {
    const { kept } = await interleave('delete');
    expect(kept).toBe(true);
  });
});
