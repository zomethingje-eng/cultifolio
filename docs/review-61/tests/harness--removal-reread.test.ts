/**
 * Harness review of round sixty-one, mutation V7: a removal reads the object again after renewing its hold and leaves it
 * when it is no longer the one it looked at (`if (receipt(key, again) !== receipt(key, existing)) return 'newer'`,
 * src/lib/server/sync.ts deleteCounted). Deleting that line passed every server test (r61s-*, sync-server, counters,
 * r60-review-server, r60-proposed-server, server-r60, sync-accounting): the fenced case in r61s-photo-removal is caught
 * by the renewal itself, never by the second look.
 *
 * When the second look matters: an object changes under a live hold only through calls that lost their own holds. Here a
 * removal C stalls just before its delete and an upload B stalls just before its write, each past its hold; removal A
 * takes the name and looks at the photograph; C's delete and B's write then land. A's renewal succeeds (its hold is
 * live), and only the second look sees that the object is B's new upload, not the one A looked at.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Fakes as r61s-photo-removal.test.ts.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--removal-reread.test.ts`.
 */
import { it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, writeMeta, readMeta, resetRateLimits, resetMetaFlush } from '$lib/server/sync';
import { HOLD_MS } from '$lib/server/counters';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const KEY = `vault/${ID}/photo/p000001.bin`;
const MIN = 60_000;
const meta0 = () => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled: true });
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const gate = () => { let open!: () => void; let reached!: () => void; const at = new Promise<void>((r) => (reached = r)); const go = new Promise<void>((r) => (open = r)); return { at, go, open, reached }; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

it('a removal whose photograph was replaced under its live hold (by a stalled delete and a stalled upload) leaves the new upload', async () => {
  const r2 = fakeR2(); const counters = countersNs();
  await writeMeta(r2 as never, ID, meta0());
  await r2.put('probe', 'x'); const T0 = r2.objs.get('probe')!.uploaded.getTime() + 1; r2.objs.delete('probe');
  const v = counters.raw(`bytes:${ID}`);
  const B = gate(), C = gate(), A = gate();
  let stage: 'B' | 'D' | 'C' | 'A' = 'B';
  const tB = T0, tD = T0 + HOLD_MS + 1_000, tC = tD + 2 * MIN, tA = tC + HOLD_MS + 1_000;
  r2.hooks.beforePut = async (k) => { if (k === KEY && stage === 'B') { stage = 'D'; B.reached(); await B.go; } };
  r2.hooks.beforeDelete = async (k) => { if (k === KEY && stage === 'C') { stage = 'A'; C.reached(); await C.go; } };
  let lookedA = false;
  r2.hooks.afterHead = async (k) => { if (k === KEY && stage === 'A' && !lookedA && (v.m.get(`h:${KEY}`) as { at: number } | undefined)?.at === tA) { lookedA = true; A.reached(); await A.go; } };

  const pB = storeOnce(r2 as never, ID, await meta(r2), KEY, new Uint8Array(300).fill(2), { drop: OWNER }, q(counters, tB)); // B: the name is free, its write stalls
  await B.at;
  expect(await storeOnce(r2 as never, ID, await meta(r2), KEY, new Uint8Array(300).fill(1), { drop: OWNER }, q(counters, tD))).toBe('stored'); // D: B's hold lapsed
  stage = 'C';
  const pC = deleteCounted(r2 as never, ID, await meta(r2), KEY, q(counters, tC), OWNER, tD + MIN); // C: removes D's upload, its delete stalls
  await C.at;
  const pA = deleteCounted(r2 as never, ID, await meta(r2), KEY, q(counters, tA), OWNER, tA - MIN); // A: C's hold lapsed; looks at D's upload
  await A.at;
  C.open(); await pC; // C's stalled delete lands: D's upload is gone
  B.open(); expect(await pB).toBe('stored'); // B's stalled write lands: a new upload under the name
  A.open();
  const ra = await pA;
  expect(r2.objs.has(KEY)).toBe(true); // B's upload stays
  expect(ra).toBe('newer');
});
