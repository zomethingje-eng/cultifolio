/**
 * Round eighty, agent O (review C 6): without the counter object (the KV fallback), two removals of one photograph could
 * both take its bytes off. The first had written its receipt and not yet deleted; the second read that receipt, found the
 * bytes still there, took it for a removal cut off, and finished it. The KV total then fell below what the bucket holds
 * until the day's recount, and `r63s-concurrent-deletes` failed about one run in ten, as the fake bucket's random delays
 * happened to order the two. Here the order is staged: the first removal is stopped at its delete while the second runs.
 *
 * On r80f the second removal answers true and the total is 100 below the listing's figure.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, recount, PhotoBusy } from '$lib/server/sync';
import { RECEIPT_HELD_MS } from '$lib/server/photogen';
import { HOLD_MS } from '$lib/server/counters';
import { fakeKV } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const MIN = 60_000;
const name = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const meta = async (r2: ReturnType<typeof casR2>) => (await readMeta(r2 as never, ID))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

async function stored() {
  const r2 = casR2(); const kv = fakeKV();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  await r2.put('probe', 'x'); const T0 = r2.objs.get('probe')!.uploaded.getTime() + 1; r2.objs.delete('probe');
  for (let i = 0; i < 2; i++) await storeOnce(r2 as never, ID, await meta(r2), name(i), new Uint8Array(100 * (i + 1)).fill(i + 1), { drop: OWNER }, { kv: kv as never, ip: '1.2.3.4', now: T0 });
  return { r2, kv, T0 };
}
const kvBytes = (kv: ReturnType<typeof fakeKV>) => JSON.parse(kv.m.get(`bytes:${ID}`)!).bytes as number;

/** Stop the first delete of photograph 0's bytes until `go()`; `reached` resolves when it is stopped. */
function stopAtDelete(r2: ReturnType<typeof casR2>) {
  let go!: () => void;
  let reached!: () => void;
  const atDelete = new Promise<void>((r) => (reached = r));
  const release = new Promise<void>((r) => (go = r));
  let stopped = false;
  r2.hooks.beforeDelete = async (k) => {
    if (stopped || !k.startsWith(`vault/${ID}/photo/p000000`)) return;
    stopped = true;
    reached();
    await release;
  };
  return { atDelete, go };
}

describe('the KV fallback: a removal between its receipt and its delete is left to finish (round eighty; review C 6)', () => {
  it('a second removal that finds the fresh receipt waits, and the bytes come off once', async () => {
    const { r2, kv, T0 } = await stored();
    const A = T0 + 11 * MIN;
    const q = { kv: kv as never, ip: '1.2.3.4', now: A };
    const stop = stopAtDelete(r2);
    const first = deleteCounted(r2 as never, ID, await meta(r2), name(0), q, OWNER, A - MIN);
    await stop.atDelete;
    const second = await deleteCounted(r2 as never, ID, await meta(r2), name(0), q, OWNER, A - MIN);
    expect(second).toBeInstanceOf(PhotoBusy);
    stop.go();
    expect(await first).toBe(true);
    expect(kvBytes(kv)).toBe(await recount(r2 as never, ID, await meta(r2)));
    expect(kvBytes(kv)).toBe(200);
  });

  it('a receipt older than a hold is a removal cut off, and the device asking again finishes it', async () => {
    const { r2, kv, T0 } = await stored();
    const A = T0 + 11 * MIN;
    // The first removal stops for good at its delete (the Worker was stopped): its receipt stays, and so do the bytes.
    const stop = stopAtDelete(r2);
    void deleteCounted(r2 as never, ID, await meta(r2), name(0), { kv: kv as never, ip: '1.2.3.4', now: A }, OWNER, A - MIN);
    await stop.atDelete;
    r2.hooks.beforeDelete = undefined;
    const soon = await deleteCounted(r2 as never, ID, await meta(r2), name(0), { kv: kv as never, ip: '1.2.3.4', now: A + RECEIPT_HELD_MS - 1 }, OWNER, A - MIN);
    expect(soon).toBeInstanceOf(PhotoBusy);
    const later = await deleteCounted(r2 as never, ID, await meta(r2), name(0), { kv: kv as never, ip: '1.2.3.4', now: A + RECEIPT_HELD_MS }, OWNER, A - MIN);
    expect(later).toBe(true);
    expect(kvBytes(kv)).toBe(await recount(r2 as never, ID, await meta(r2)));
    expect(kvBytes(kv)).toBe(200);
  });

  it("a receipt is taken as its writer's for exactly the counter object's hold", () => {
    expect(RECEIPT_HELD_MS).toBe(HOLD_MS);
  });
});
