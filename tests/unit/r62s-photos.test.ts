/**
 * Round sixty-two, agent S (the triage, 6 and 7): photographs.
 *
 * - A busy photograph is answered with one fixed short wait, as a removal is, so one photograph never stops a vault's
 *   uploads for a minute (A30).
 * - A claim is recorded whenever the proof matches, whatever the store answered (a re-sealed Undo; A23).
 * - A removed name keeps its removal receipt with its pointer, and a first store of it needs the removal's proof (A23).
 * - Generation-addressed objects: a revival is stored under a new generation and named by a pointer that only a
 *   conditional write moves, so a removal deletes only the generation it saw (decision 7). Objects stored before this
 *   round are their name's first generation, read where they are (read-through; nothing is moved).
 *
 * Reproductions (FAIL on r62base): the busy wait, the re-sealed Undo, the token-holder's re-store, the stalled delete.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, PhotoBusy, refusal } from '$lib/server/sync';
import * as sync from '$lib/server/sync';
import { HOLD_MS } from '$lib/server/counters';
import { tokenHash } from '$lib/sync/crypto';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const STRANGER = 'a'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
/** The key the name's bytes are under now, by the module's own reading (null: nothing). */
const current = async (r2: FakeR2) => (sync as unknown as { photoObjectKey: (r2: unknown, name: string) => Promise<string | null> }).photoObjectKey(r2, NAME);
const bytesAt = async (r2: FakeR2) => { const k = await current(r2); return k && r2.objs.has(k) ? r2.objs.get(k)!.body[0] : null; };
/** The fake bucket's own clock, so the server's "now" and the uploads agree. */
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
async function setup() {
  const r2 = casR2(); const counters = countersNs();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  return { r2, counters, T0: await clockOf(r2) };
}
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

describe('a busy photograph (A30)', () => {
  it('an upload that finds the name held is asked to wait one fixed short time, whatever is left on the hold', async () => {
    const { r2, counters, T0 } = await setup();
    const waits: number[] = [];
    for (const after of [1_000, 30_000]) {
      const h = await counters.get(`bytes:${ID}`).hold!(NAME, T0);
      if (!h.ok) throw new Error('not held');
      const e = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10), { drop: OWNER }, q(counters, T0 + after)).catch((x) => x);
      expect(e).toBeInstanceOf(PhotoBusy);
      waits.push(Number(refusal(e)!.headers.get('retry-after')));
      await counters.get(`bytes:${ID}`).unhold!(NAME, h.token);
    }
    expect(waits).toEqual([10, 10]); // under the engine's minute, so never kept as a refusal of the whole vault
  });
});

describe('claims and receipts (A23)', () => {
  it('a re-sealed Undo (different bytes, the right proof) claims the name, so a removal made before it leaves it', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: OWNER }, q(counters, T0));
    const R = T0 + 5 * MIN; // B removes the photograph
    // A undoes; its new seal makes different bytes: 409, which its engine takes as its own photograph
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(2), { drop: OWNER }, q(counters, T0 + 15 * MIN))).toBe('different');
    // B's DELETE, carrying R, comes after the claim: kept
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 20 * MIN), OWNER, R)).toBe('newer');
    expect(await bytesAt(r2)).toBe(1);
  });
  it('GUARD: different bytes with another proof claim nothing', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(1), { drop: OWNER }, q(counters, T0));
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(10).fill(2), { drop: STRANGER }, q(counters, T0 + 15 * MIN))).toBe('different');
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 20 * MIN), OWNER, T0 + 5 * MIN)).toBe(true);
  });
  it('a holder of the token alone cannot store a removed photograph again: the receipt asks for the removal proof (403)', async () => {
    const { r2, counters, T0 } = await setup();
    const token = 'c'.repeat(64);
    await writeMeta(r2 as never, ID, { tokenHash: await tokenHash(token), created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const cipher = new Uint8Array(40).fill(7);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, cipher, { drop: OWNER }, q(counters, T0));
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 11 * MIN), OWNER, T0 + MIN)).toBe(true);
    const { PUT } = await import('../../src/routes/api/sync/photo/[id]/+server');
    const put = (drop: string) => {
      const request = new Request(`https://x/api/sync/photo/${PID}?vault=${ID}`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'x-photo-drop': drop }, body: cipher });
      return PUT({ request, url: new URL(request.url), params: { id: PID }, platform: { env: { STORE: r2, QUEUE: fakeKV(), COUNTERS: counters } }, getClientAddress: () => '1.2.3.4' } as never);
    };
    const refused = await put(STRANGER);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toMatch(/removed/);
    expect(await current(r2)).toBeNull();
    // the key-holder's own device (an Undo after the removal) carries the proof, and stores it again
    expect((await put(OWNER)).status).toBe(200);
    expect(await bytesAt(r2)).toBe(7);
  });
});

describe('generation-addressed photographs (decision 7)', () => {
  /** A removal (A) whose step stalls past its hold, then a second removal (C) and a revival (B) stored after C. */
  async function interleave(stall: 'look' | 'delete') {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(300).fill(1), { drop: OWNER }, q(counters, T0));
    const A = T0 + 11 * MIN;
    const v = counters.raw(`bytes:${ID}`);
    let reached!: () => void; const atStall = new Promise<void>((r) => (reached = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    let stalled = false;
    const heldByA = () => (v.m.get(`h:${NAME}`) as { at: number } | undefined)?.at === A;
    if (stall === 'look') r2.hooks.afterHead = async (k) => { if (k === NAME && !stalled && heldByA()) { stalled = true; reached(); await gate; } };
    else r2.hooks.beforeDelete = async (k) => { if (k === NAME && !stalled) { stalled = true; reached(); await gate; } };
    const a = deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A - MIN);
    await atStall;
    const c = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + HOLD_MS + 1_000), OWNER, A + HOLD_MS);
    const b = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(300).fill(2), { drop: OWNER }, q(counters, A + HOLD_MS + 2_000));
    go();
    return { ra: await a, c, b, kept: await bytesAt(r2), r2, counters };
  }

  it('a removal whose R2 delete call stalls past its hold deletes only the generation it saw: the revival stays', async () => {
    const { ra, c, b, kept } = await interleave('delete');
    // C finds A's receipt with the generation it names still there, and finishes A's removal (round sixty-two, second
    // pass; the server review, 2): true, where it answered false (404) and relied on A's stalled delete.
    expect({ ra, c, b, kept }).toEqual({ ra: true, c: true, b: 'stored', kept: 2 });
  });

  it('a removal whose look stalled past its hold leaves the revival too (the fence, then the pointer)', async () => {
    const { ra, kept } = await interleave('look');
    expect(ra).toBeInstanceOf(PhotoBusy);
    expect(kept).toBe(2);
  });

  it('a removal whose pointer write stalls past its hold finds the pointer moved, and deletes nothing', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0));
    const A = T0 + 11 * MIN;
    let reached!: () => void; const atStall = new Promise<void>((r) => (reached = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    let first = true;
    // A's fence passed; its conditional write of the pointer reaches the bucket after the hold lapsed and another removal
    // and a revival went by.
    r2.cas.before = async (k) => { if (k === REF && first) { first = false; reached(); await gate; } };
    const a = deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A - MIN);
    await atStall;
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + HOLD_MS + 1_000), OWNER, A + HOLD_MS)).toBe(true);
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(3), { drop: OWNER }, q(counters, A + HOLD_MS + 2_000))).toBe('stored');
    go();
    expect(await a).toBe('newer');
    expect(await bytesAt(r2)).toBe(3);
  });

  it('an object stored before generations is read where it is, removed with a receipt, and its revival is a new generation', async () => {
    const { r2, counters, T0 } = await setup();
    await r2.put(NAME, new Uint8Array(50).fill(4), { customMetadata: { drop: OWNER, sha: 'x' } }); // stored by round sixty-one
    expect(await current(r2)).toBe(NAME);
    expect(await bytesAt(r2)).toBe(4);
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(50).fill(5), { drop: OWNER }, q(counters, T0))).toBe('different');
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 3 * 86_400_000), OWNER, T0 + 3 * 86_400_000 - MIN)).toBe(true);
    expect([r2.objs.has(NAME), await current(r2)]).toEqual([false, null]);
    expect(JSON.parse(new TextDecoder().decode(r2.objs.get(REF)!.body))).toMatchObject({ g: null, drop: OWNER });
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(50).fill(6), { drop: OWNER }, q(counters, T0 + 4 * 86_400_000))).toBe('stored');
    const k = await current(r2);
    expect(k).toMatch(new RegExp(`^vault/${ID}/photo/${PID}\\.g[0-9a-z]+$`));
    expect(await bytesAt(r2)).toBe(6);
    // and the generation is removed in turn, by the same rule
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 7 * 86_400_000), OWNER, T0 + 7 * 86_400_000 - MIN)).toBe(true);
    expect([r2.objs.has(k!), await current(r2)]).toEqual([false, null]);
  });

  it("a revival whose pointer moved before it could name its generation removes that generation and gives its bytes back", async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(20).fill(1), { drop: OWNER }, q(counters, T0));
    await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 11 * MIN), OWNER, T0 + MIN);
    const v = counters.raw(`bytes:${ID}`);
    const bytes = () => (v.m.get('v') as { bytes: number }).bytes;
    expect(bytes()).toBe(0);
    // another revival lands its pointer while this one's generation is being written (past a lapsed hold)
    r2.hooks.beforePut = async (k) => {
      if (/\.g[0-9a-z]+$/.test(k) && r2.hooks.beforePut) {
        r2.hooks.beforePut = undefined;
        await r2.put(`vault/${ID}/photo/${PID}.gother000000`, new Uint8Array(20).fill(9), { customMetadata: { drop: OWNER, sha: 'y' } });
        const ref = await r2.get(REF);
        await r2.put(REF, JSON.stringify({ g: 'gother000000', n: 'x' }), { onlyIf: { etagMatches: ref!.etag } } as never);
      }
    };
    expect(await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(20).fill(2), { drop: OWNER }, q(counters, T0 + 12 * MIN))).toBe('different');
    expect(await bytesAt(r2)).toBe(9);
    expect([...r2.objs.keys()].filter((k) => k.includes(`/photo/${PID}.`))).toEqual([`vault/${ID}/photo/${PID}.gother000000`]);
    expect(bytes()).toBe(0); // its own 20 bytes went back
  });

  it('a generation nothing names, left by an upload cut off between its two writes, is removed with the photograph once it is ten minutes old', async () => {
    const { r2, counters, T0 } = await setup();
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(20).fill(1), { drop: OWNER }, q(counters, T0));
    const stray = `vault/${ID}/photo/${PID}.gstray00000`;
    await r2.put(stray, new Uint8Array(15), { customMetadata: { drop: OWNER, sha: 'z' } });
    expect(await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, T0 + 11 * MIN), OWNER, T0 + MIN)).toBe(true);
    expect(r2.objs.has(stray)).toBe(false);
  });
});
