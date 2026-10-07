/**
 * Round sixty-one, agent S (decision 6, admission and places): `unadmit` keeps the place while another upload is landing,
 * the meta says `filled` only once an object lands, the KV fallback counts per vault and gives back the day, and a place is
 * reclaimed after 90 days without an upload and taken again by a later upload.
 *
 * Adopted from docs/review-60/tests/server--admission.test.ts: its guards as they are, its reproductions turned to the
 * decision (the killed Worker's place now goes at the 90-day sweep, not at once).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { storeOnce, readMeta, writeMeta, admitVault, unadmit, resetRateLimits, resetMetaFlush, VaultFull, VaultsClosed } from '$lib/server/sync';
import { RECLAIM_DAYS } from '$lib/server/counters';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';
import { fakeKVd } from './helpers/r61s-fake';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number, id = ID) => `vault/${id}/photo/p${String(i).padStart(6, '0')}.bin`;
const T = Date.UTC(2026, 9, 4, 12);
const DAY = 86_400_000;
const DAYKEY = '2026-10-04';
const meta0 = (filled: boolean | undefined) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, ...(filled === undefined ? {} : { filled }) });
const meta = async (r2: FakeR2, id = ID) => (await readMeta(r2 as never, id))!;
const stored = (r2: FakeR2) => [...r2.objs.keys()].filter((k) => !k.endsWith('meta.json'));
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

describe('admission races (round sixty-one; the server review, 5 and 6)', () => {
  it('two first uploads at once, one fails: the place stands while the other is landing, and the vault ends counted once', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const mA = await meta(r2), mB = await meta(r2);
    let aDone!: () => void; const aSettled = new Promise<void>((r) => (aDone = r));
    let bWriting!: () => void; const bAtPut = new Promise<void>((r) => (bWriting = r));
    r2.hooks.beforePut = async (k) => {
      if (k === photo(1)) { await bAtPut; throw new Error('R2: we encountered an internal error'); }
      if (k === photo(2)) { bWriting(); await aSettled; }
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = storeOnce(r2 as never, ID, mA, photo(1), new Uint8Array(100), PROOF, quota).catch((e) => e).finally(aDone);
    const b = storeOnce(r2 as never, ID, mB, photo(2), new Uint8Array(100), PROOF, quota);
    await a;
    expect(await b).toBe('stored');
    expect(stored(r2)).toEqual([photo(2)]);
    const vaults = counters.objects.get('vaults')!.m;
    expect({ all: vaults.get('all'), f: vaults.has(`f:${ID}`), filled: (await meta(r2)).filled }).toEqual({ all: 1, f: true, filled: true });
  });

  it('the same race with B still reading its body when A gives the place back: B takes it again as it lands', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const mA = await meta(r2), mB = await meta(r2);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // B admitted ('already') before A failed, and holds no lease yet (its body is still arriving).
    expect(await admitVault(r2 as never, ID, mA, quota)).toBe(true);
    expect(await admitVault(r2 as never, ID, mB, quota)).toBe(false);
    await unadmit(r2 as never, ID, mA, quota); // A's write failed
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(0);
    expect(await storeOnce(r2 as never, ID, mB, photo(2), new Uint8Array(100), PROOF, quota)).toBe('stored');
    expect([counters.objects.get('vaults')!.m.get('all'), counters.objects.get('vaults')!.m.has(`f:${ID}`), (await meta(r2)).filled]).toEqual([1, true, true]);
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
    counters.raw(`bytes:${ID}`).m.set('v', { bytes: 2 * 1024 ** 3, day: DAYKEY, rc: T });
    await expect(storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota)).rejects.toBeInstanceOf(VaultFull);
    const vaults = counters.objects.get('vaults')!.m;
    expect([vaults.get('all'), vaults.get(`day:${DAYKEY}`), vaults.has(`f:${ID}`), (await meta(r2)).filled]).toEqual([0, 0, false, false]);
  });

  it('a Worker killed after admission leaves the meta unfilled, so the next upload is checked; and the 90-day sweep gives the place back', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    expect(await admitVault(r2 as never, ID, await meta(r2), quota)).toBe(true); // ...and the isolate dies here
    const vaults = counters.objects.get('vaults')!;
    expect([stored(r2), vaults.m.get('all'), (await meta(r2)).filled]).toEqual([[], 1, false]);
    await vaults.c.sweep(T + RECLAIM_DAYS * DAY);
    expect(vaults.m.get('all')).toBe(1); // the ninetieth day after: kept
    await vaults.c.sweep(T + (RECLAIM_DAYS + 1) * DAY);
    expect([vaults.m.get('all'), vaults.m.has(`f:${ID}`)]).toEqual([0, false]);
  });
});

describe('the KV fallback without the counter object (round sixty-one; the server review, 7)', () => {
  it("unadmit gives back `vaults:all`, the day's `vaults:all:<day>` and the vault's own key", async () => {
    const r2 = fakeR2(); const kv = fakeKVd();
    const quota = { kv: kv as never, ip: '1.2.3.4', now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const m = await meta(r2);
    expect(await admitVault(r2 as never, ID, m, quota)).toBe(true);
    await unadmit(r2 as never, ID, m, quota);
    expect([kv.m.get('vaults:all'), kv.m.get(`vaults:all:${DAYKEY}`), kv.m.has(`vaultplace:${ID}`)]).toEqual(['0', '0', false]);
  });
  it('two first uploads that both read an unfilled meta count one vault once', async () => {
    const r2 = fakeR2(); const kv = fakeKVd();
    const quota = { kv: kv as never, ip: '1.2.3.4', now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    const mA = await meta(r2), mB = await meta(r2);
    await storeOnce(r2 as never, ID, mA, photo(1), new Uint8Array(10), PROOF, quota);
    await storeOnce(r2 as never, ID, mB, photo(2), new Uint8Array(10), PROOF, quota);
    expect([kv.m.get('vaults:all'), kv.m.get(`vaults:all:${DAYKEY}`)]).toEqual(['1', '1']);
  });
});

describe('a place is reclaimed after 90 days without an upload (round sixty-one; the triage, 3)', () => {
  async function filledVault(counters: ReturnType<typeof countersNs>, r2: FakeR2, id: string, now: number) {
    await writeMeta(r2 as never, id, meta0(false));
    await storeOnce(r2 as never, id, await meta(r2, id), photo(1, id), new Uint8Array(10), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
  }
  it('the sweep gives back the place of a vault idle for 90 days, keeps one with a later upload, and a later upload takes a place again', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const IDLE = 'IDLEVAULTZZZZZZZZZZZZZZZZZ', BUSY = 'BUSYVAULTZZZZZZZZZZZZZZZZZ';
    await filledVault(counters, r2, IDLE, T);
    await filledVault(counters, r2, BUSY, T);
    const vaults = counters.objects.get('vaults')!;
    expect(vaults.m.get('all')).toBe(2);
    // BUSY uploads again on day 60; IDLE never does
    resetMetaFlush();
    await storeOnce(r2 as never, BUSY, await meta(r2, BUSY), photo(2, BUSY), new Uint8Array(10), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 60 * DAY });
    await vaults.c.sweep(T + (RECLAIM_DAYS + 1) * DAY);
    expect([vaults.m.get('all'), vaults.m.has(`f:${IDLE}`), vaults.m.has(`f:${BUSY}`)]).toEqual([1, false, true]);
    // IDLE comes back: its upload takes a place again, and what it holds was never touched
    resetMetaFlush();
    expect(await storeOnce(r2 as never, IDLE, await meta(r2, IDLE), photo(3, IDLE), new Uint8Array(10), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 100 * DAY })).toBe('stored');
    expect([vaults.m.get('all'), vaults.m.has(`f:${IDLE}`), r2.objs.has(photo(1, IDLE))]).toEqual([2, true, true]);
  });
  it('a reclaimed vault refused at the ceiling is told it holds what it holds, not "holds nothing yet"', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const IDLE = 'IDLEVAULTZZZZZZZZZZZZZZZZZ';
    await filledVault(counters, r2, IDLE, T);
    const vaults = counters.objects.get('vaults')!;
    await vaults.c.sweep(T + (RECLAIM_DAYS + 1) * DAY);
    resetMetaFlush();
    const e = await storeOnce(r2 as never, IDLE, await meta(r2, IDLE), photo(2, IDLE), new Uint8Array(10), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 100 * DAY, max: 0 }).catch((x) => x);
    expect(e).toBeInstanceOf(VaultsClosed);
    const text = ((await (e as VaultsClosed).response().json()) as { error: string }).error;
    expect(text).toMatch(/no upload for 90 days/);
    expect(text).not.toMatch(/holds nothing/);
  });
  it('a vault counted at its creation before round fifty-eight (no `filled`) is recorded at its next upload, not counted twice', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const kv = fakeKV(); kv.m.set('vaults:all', '7'); // the seed: the old vaults, this one among them
    await writeMeta(r2 as never, ID, meta0(undefined));
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', counters, now: T });
    const vaults = counters.objects.get('vaults')!.m;
    expect([vaults.get('all'), vaults.has(`f:${ID}`)]).toEqual([7, true]);
  });
  it('a vault with a place is looked at once a day per isolate, not on every upload', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await filledVault(counters, r2, ID, T);
    const touch = vi.spyOn(counters.raw('vaults').c, 'touch');
    for (let i = 0; i < 5; i++) await storeOnce(r2 as never, ID, await meta(r2), photo(10 + i), new Uint8Array(10), PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + DAY });
    expect(touch).toHaveBeenCalledTimes(1);
  });
});
