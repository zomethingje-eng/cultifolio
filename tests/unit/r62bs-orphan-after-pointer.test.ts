/**
 * Server review, round sixty-two: a removal moves the pointer to its receipt BEFORE it deletes the bytes. When the R2
 * delete fails (or the Worker is stopped between the two), the device's retry finds the pointer already a receipt and is
 * answered 404 ("done"), and nothing ever deletes the bytes: the first generation (`.bin`) is never a "stray" (the
 * stray rule takes only `.g…` keys), and a later generation is only swept at a later removal or revival of that same
 * photograph, which a removed photograph does not get. The ciphertext the grower removed stays on the server and counts
 * against the vault's 2 GB for good (every recount lists it).
 *
 * Expected: the retried removal deletes what the receipt left behind, and the vault's count drops. FAILS on the merged code.
 *
 * Run: cp /tmp/r62rev/out/tests/server--orphan-after-pointer.test.ts tests/unit/ && npx vitest run tests/unit/server--orphan-after-pointer.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, recount } from '$lib/server/sync';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const MIN = 60_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('a removal whose R2 delete fails after the pointer moved', () => {
  it('is finished by the device asking again, not answered 404 with the bytes left for good', async () => {
    const r2 = casR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T0 = await clockOf(r2);
    await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(1000).fill(1), { drop: OWNER }, q(counters, T0));
    let fail = true;
    r2.hooks.beforeDelete = async (k) => { if (k === NAME && fail) { fail = false; throw new Error('R2: 500 internal error'); } };
    const A = T0 + 11 * MIN;
    await expect(deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A - MIN)).rejects.toThrow(/R2/);
    // The device was answered 500 and asks again a minute later.
    const again = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + 2 * MIN), OWNER, A - MIN);
    // Days later, a removal of the same photograph from another device, and the day's recount.
    const later = await deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A + 3 * 86_400_000), OWNER, A);
    const listed = await recount(r2 as never, ID, await meta(r2));
    expect({ left: r2.objs.has(NAME), listed, answers: [again, later] }).toMatchObject({ left: false, listed: 0 });
  });
});
