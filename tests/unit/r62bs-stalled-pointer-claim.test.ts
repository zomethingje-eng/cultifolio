/**
 * Server review, round sixty-two: the generation design moves the stalled-call race, it does not close it.
 *
 * A removal (A) fences its hold, then its conditional pointer write stalls past HOLD_MS. Another device (B) undoes the
 * removal and uploads the photograph with the right proof. B finds the old generation still there (A has neither moved
 * the pointer nor deleted), answers 'same' or 'different' (both a claim since round sixty-two), and B's engine marks it
 * pushed. A's pointer write then lands (nothing moved the pointer, so its condition passes) and A deletes the generation
 * B just claimed. The server holds nothing; B believes it holds the photograph.
 *
 * Expected: A answers 'newer' (or busy) and the photograph stays. FAILS on the merged code.
 *
 * Run: cp /tmp/r62rev/out/tests/server--stalled-pointer-claim.test.ts tests/unit/ && npx vitest run tests/unit/server--stalled-pointer-claim.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, resetRateLimits, resetMetaFlush } from '$lib/server/sync';
import * as sync from '$lib/server/sync';
import { HOLD_MS } from '$lib/server/counters';
import { fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { casR2 } from './helpers/r62s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const OWNER = 'd'.repeat(64);
const PID = 'p000001';
const NAME = `vault/${ID}/photo/${PID}.bin`;
const REF = `vault/${ID}/photoref/${PID}.json`;
const MIN = 60_000;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const q = (counters: ReturnType<typeof countersNs>, now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
const current = async (r2: FakeR2) => (sync as unknown as { photoObjectKey: (r2: unknown, name: string) => Promise<string | null> }).photoObjectKey(r2, NAME);
const clockOf = async (r2: FakeR2) => { await r2.put('probe', 'x'); const t = r2.objs.get('probe')!.uploaded.getTime(); r2.objs.delete('probe'); return t + 1; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('a removal whose conditional pointer write stalls past its hold', () => {
  for (const revival of ['same bytes', 'a re-seal (different bytes)'] as const) {
    it(`leaves a revival that found the old generation (${revival}) and claimed it`, async () => {
      const r2 = casR2(); const counters = countersNs();
      await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
      const T0 = await clockOf(r2);
      await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(1), { drop: OWNER }, q(counters, T0));
      const A = T0 + 11 * MIN;
      let reached!: () => void; const atStall = new Promise<void>((r) => (reached = r));
      let go!: () => void; const gate = new Promise<void>((r) => (go = r));
      let first = true;
      r2.cas.before = async (k) => { if (k === REF && first) { first = false; reached(); await gate; } };
      const a = deleteCounted(r2 as never, ID, await meta(r2), NAME, q(counters, A), OWNER, A - MIN);
      await atStall; // A fenced and is writing the pointer; the call stalls
      // B, past A's lapsed hold: the Undo's upload, with the proof. It finds generation one and claims it.
      const b = await storeOnce(r2 as never, ID, await meta(r2), NAME, new Uint8Array(30).fill(revival === 'same bytes' ? 1 : 2), { drop: OWNER }, q(counters, A + HOLD_MS + 2_000));
      expect(['same', 'different']).toContain(b); // the engine takes either as its photograph being on the server
      go();
      const ra = await a;
      const k = await current(r2);
      // What B's device now believes (the server holds its photograph) must be true.
      expect({ ra, held: k != null && r2.objs.has(k) }).toEqual({ ra: 'newer', held: true });
    });
  }
});
