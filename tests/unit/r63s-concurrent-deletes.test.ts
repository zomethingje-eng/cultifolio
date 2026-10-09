/**
 * Round sixty-three, agent S (S4): "Two concurrent DELETEs undercounting" (round fifty-one, E6: "clamped at zero and
 * corrected by the daily recount; left"). Checked against round sixty-two's counting: a removal holds the photograph's
 * name, moves its pointer under R2's condition before it deletes, holds a lease of no bytes from before the delete to its
 * give-back, and gives back once under the object's receipt. These tests run the removals at once, through the real
 * counter class, and compare the vault's running total with a listing of the bucket afterwards.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush, recount, PhotoBusy } from '$lib/server/sync';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const MIN = 60_000;
const DAY = 86_400_000;
const name = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

async function stored(n: number, sizes: (i: number) => number, object = true) {
  const r2 = casR2(); const counters = countersNs(); const kv = fakeKV();
  await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
  const T0 = await clockOf(r2);
  for (let i = 0; i < n; i++) await storeOnce(r2 as never, ID, await meta(r2), name(i), new Uint8Array(sizes(i)).fill(i + 1), { drop: OWNER }, { kv: kv as never, ip: '1.2.3.4', ...(object ? { counters } : {}), now: T0 });
  return { r2, counters, kv, T0 };
}
const total = (counters: ReturnType<typeof countersNs>) => (counters.raw(`bytes:${ID}`).m.get('v') as { bytes: number }).bytes;

describe('concurrent removals and the vault total (round sixty-three; S4)', () => {
  it('ten DELETEs of one photograph at once take its bytes off once', async () => {
    const { r2, counters, kv, T0 } = await stored(3, (i) => 100 * (i + 1));
    const A = T0 + 11 * MIN;
    const answers = await Promise.all(Array.from({ length: 10 }, async () => deleteCounted(r2 as never, ID, await meta(r2), name(1), { kv: kv as never, ip: '1.2.3.4', counters, now: A }, OWNER, A - MIN)));
    expect(answers.filter((a) => a === true)).toHaveLength(1);
    expect(answers.every((a) => a === true || a === false || a instanceof PhotoBusy)).toBe(true);
    expect(total(counters)).toBe(await recount(r2 as never, ID, await meta(r2)));
    expect(total(counters)).toBe(100 + 300);
  });

  it('DELETEs of different photographs at once each take their own bytes off', async () => {
    const { r2, counters, kv, T0 } = await stored(10, (i) => 10 * (i + 1));
    const A = T0 + 11 * MIN;
    await Promise.all(Array.from({ length: 10 }, async (_, i) => deleteCounted(r2 as never, ID, await meta(r2), name(i), { kv: kv as never, ip: '1.2.3.4', counters, now: A }, OWNER, A - MIN)));
    expect({ total: total(counters), listed: await recount(r2 as never, ID, await meta(r2)) }).toEqual({ total: 0, listed: 0 });
  });

  it('on a day with no total yet (the removal recounts), DELETEs at once, of one photograph and of others, leave the listing\'s figure', async () => {
    const { r2, counters, kv, T0 } = await stored(4, (i) => 50 * (i + 1));
    const B = T0 + DAY + 11 * MIN; // the next day: no row for it, so each removal gives back by receipt and lists
    const q = { kv: kv as never, ip: '1.2.3.4', counters, now: B };
    await Promise.all([0, 0, 0, 1, 1, 2].map(async (i) => deleteCounted(r2 as never, ID, await meta(r2), name(i), q, OWNER, B - MIN).catch((e) => e)));
    const listed = await recount(r2 as never, ID, await meta(r2));
    expect(listed).toBe(200);
    const v = counters.raw(`bytes:${ID}`).m.get('v') as { bytes: number; day: string };
    // Either the day's total is the listing's figure, or none was kept (a crossed listing) and the next request lists.
    if (v.day === new Date(B).toISOString().slice(0, 10)) expect(v.bytes).toBe(listed);
  });

  it('without the counter object (the KV fallback), the pointer\'s condition still lets one of ten removals take the bytes off', async () => {
    const { r2, kv, T0 } = await stored(2, (i) => 100 * (i + 1), false);
    const A = T0 + 11 * MIN;
    const answers = await Promise.all(Array.from({ length: 10 }, async () => deleteCounted(r2 as never, ID, await meta(r2), name(0), { kv: kv as never, ip: '1.2.3.4', now: A }, OWNER, A - MIN)));
    expect(answers.filter((a) => a === true)).toHaveLength(1);
    expect(JSON.parse(kv.m.get(`bytes:${ID}`)!).bytes).toBe(await recount(r2 as never, ID, await meta(r2)));
  });

  it('without the counter object, a removal on a day with no total yet takes its bytes off once, not twice (found here)', async () => {
    const { r2, kv, T0 } = await stored(2, (i) => 100 * (i + 1), false);
    const B = T0 + DAY + 11 * MIN; // the next day: the total is put right from a listing first
    expect(await deleteCounted(r2 as never, ID, await meta(r2), name(0), { kv: kv as never, ip: '1.2.3.4', now: B }, OWNER, B - MIN)).toBe(true);
    expect(JSON.parse(kv.m.get(`bytes:${ID}`)!).bytes).toBe(await recount(r2 as never, ID, await meta(r2)));
  });
});
