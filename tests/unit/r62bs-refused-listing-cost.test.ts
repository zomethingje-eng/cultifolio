/**
 * Server review, round sixty-two: a listing is refused while any lease is live, but the refusal is known only after the
 * listing was made. A request that needs a listing (a day's first upload, an upload after a stale mark, an open) while
 * another upload or a removal is in flight walks the vault's whole `log/` and `photo/` prefixes twice (up to 2 x 2 x 50
 * R2 list calls, Class A operations) and is then answered 503 RecountCrossed, although `generation()` could have said
 * at the start that no listing could be kept.
 *
 * Expected: no R2 listing is made while a lease is live (the request is refused at once, or waits). FAILS on the merged
 * code (four listings made, all thrown away).
 *
 * Run: cp /tmp/r62rev/out/tests/server--refused-listing-cost.test.ts tests/unit/ && npx vitest run tests/unit/server--refused-listing-cost.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, readMeta, writeMeta, resetRateLimits, resetMetaFlush, RecountCrossed, MAX_BYTES } from '$lib/server/sync';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const DAY = 86_400_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('a listing that could not be kept', () => {
  it('is not made while another upload of the vault is in flight', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const T = Date.UTC(2026, 9, 4, 12);
    const q = (now: number) => ({ kv: kv as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000001.bin`, new Uint8Array(10), { drop: OWNER }, q(T));
    // The next day: another device's upload has taken its lease and is still writing.
    const T2 = T + DAY;
    const v = counters.get(`bytes:${ID}`);
    const g = await v.generation!();
    const inflight = await v.take!('vault', 10, MAX_BYTES, new Date(T2).toISOString().slice(0, 10), 10, T2, g.gen);
    expect('lease' in inflight && inflight.lease).toBeTruthy();
    // Today's row is now written by that take, so make the row stale as a lapsed lease would.
    const row = counters.raw(`bytes:${ID}`).m.get('v') as Record<string, unknown>;
    counters.raw(`bytes:${ID}`).m.set('v', { ...row, day: 'stale' });
    const before = r2.lists();
    const e = await storeOnce(r2 as never, ID, await meta(r2), `vault/${ID}/photo/p000002.bin`, new Uint8Array(10), { drop: OWNER }, q(T2 + 1000)).catch((x) => x);
    expect(e).toBeInstanceOf(RecountCrossed);
    expect(r2.lists() - before).toBe(0);
  });
});
