/**
 * Review of round sixty, server area: admission (admitVault, unadmit, Counters.fill/unfill) under concurrency, a Worker
 * killed mid-request, and the KV fallback without the Durable Object.
 *
 * REPRO tests FAIL on 21257b7; GUARD tests PASS.
 * Run: npx vitest run tests/unit/server--admission.test.ts   (lives in tests/unit/, uses helpers/fake-sync.ts)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { storeOnce, readMeta, writeMeta, admitVault, unadmit, resetRateLimits, resetMetaFlush, VaultFull } from '$lib/server/sync';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAYKEY = '2026-10-04';
const meta0 = (filled: boolean) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled });
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
const stored = (r2: FakeR2) => [...r2.objs.keys()].filter((k) => !k.endsWith('meta.json'));
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

describe('admission races (round sixty, B8)', () => {
  it("REPRO: two first uploads at once, one fails: its unadmit gives the place back while the other's object is landing, and the vault then holds an object, uncounted, for good", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    // Both requests read the meta before either admits (two devices' first sync, or the engine's batch and a photo).
    const mA = await meta(r2), mB = await meta(r2);
    let aDone!: () => void; const aSettled = new Promise<void>((r) => (aDone = r));
    let bWriting!: () => void; const bAtPut = new Promise<void>((r) => (bWriting = r));
    r2.hooks.beforePut = async (k) => {
      if (k === photo(1)) { await bAtPut; throw new Error('R2: we encountered an internal error'); } // A's write fails, once B is writing
      if (k === photo(2)) { bWriting(); await aSettled; } // B (admitted: 'already') is writing until A has given the place back
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = storeOnce(r2 as never, ID, mA, photo(1), new Uint8Array(100), PROOF, quota).catch((e) => e).finally(aDone);
    const b = storeOnce(r2 as never, ID, mB, photo(2), new Uint8Array(100), PROOF, quota);
    await a;
    expect(await b).toBe('stored');
    expect(stored(r2)).toEqual([photo(2)]);
    const vaults = counters.objects.get('vaults')!.m;
    // The vault holds an object. It should hold its place: `all` 1 and `f:<id>` kept (or, at least, a meta that says
    // unfilled so the next upload counts it). Today: all 0, f: gone, and B's flush wrote `filled: true` over A's
    // `filled: false`, so no later upload ever counts it.
    const now = await meta(r2);
    expect({ all: vaults.get('all'), f: vaults.has(`f:${ID}`) || now.filled === false }).toEqual({ all: 1, f: true });
  });

  it('GUARD: twenty first uploads at once, all landing, count the vault once (fill by id)', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const metas = await Promise.all(Array.from({ length: 20 }, () => meta(r2)));
    await Promise.all(metas.map((m, i) => storeOnce(r2 as never, ID, m, photo(10 + i), new Uint8Array(10), PROOF, quota)));
    const vaults = counters.objects.get('vaults')!.m;
    expect([vaults.get('all'), vaults.get(`day:${DAYKEY}`), stored(r2).length]).toEqual([1, 1, 20]);
  });

  it('GUARD: a first upload refused for room (VaultFull) gives the place and the day back; the next counts afresh', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    // A vault object that says the vault is already full today.
    counters.raw(`bytes:${ID}`).m.set('v', { bytes: 2 * 1024 ** 3, day: DAYKEY, rc: T });
    await expect(storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota)).rejects.toBeInstanceOf(VaultFull);
    const vaults = counters.objects.get('vaults')!.m;
    expect([vaults.get('all'), vaults.get(`day:${DAYKEY}`), vaults.has(`f:${ID}`), (await meta(r2)).filled]).toEqual([0, 0, false, false]);
  });

  it('REPRO (P3): a Worker killed after admission and before the write leaves the vault counted while it holds nothing, and nothing ever gives the place back', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    expect(await admitVault(r2 as never, ID, await meta(r2), quota)).toBe(true); // ...and the isolate dies here
    // The device gives up for good (the grower stops syncing). The vault holds nothing and keeps its place:
    const vaults = counters.objects.get('vaults')!.m;
    expect(stored(r2)).toEqual([]);
    // Expected by "a vault made and never used takes neither": the place is not held by an empty vault for good. Today
    // `filled: true` is in the meta, so no later request of this vault calls `fill` or `unfill` again.
    expect([vaults.get('all'), (await meta(r2)).filled]).toEqual([0, false]);
  });
});

describe('the KV fallback without the counter object', () => {
  it("REPRO (P3): unadmit gives `vaults:all` back but not the day's `vaults:all:<day>`, so a failed first upload spends a place of the day", async () => {
    const r2 = fakeR2(); const kv = fakeKV();
    const quota = { kv: kv as never, ip: '1.2.3.4', now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const m = await meta(r2);
    expect(await admitVault(r2 as never, ID, m, quota)).toBe(true);
    await unadmit(r2 as never, ID, m, quota); // its first write failed
    expect([kv.m.get('vaults:all'), kv.m.get(`vaults:all:${DAYKEY}`)]).toEqual(['0', '0']);
  });
  it('REPRO (P3): two first uploads that both read an unfilled meta count one vault twice', async () => {
    const r2 = fakeR2(); const kv = fakeKV();
    const quota = { kv: kv as never, ip: '1.2.3.4', now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const mA = await meta(r2), mB = await meta(r2);
    await storeOnce(r2 as never, ID, mA, photo(1), new Uint8Array(10), PROOF, quota);
    await storeOnce(r2 as never, ID, mB, photo(2), new Uint8Array(10), PROOF, quota);
    expect(kv.m.get('vaults:all')).toBe('1');
  });
});
