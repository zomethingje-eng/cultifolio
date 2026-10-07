/**
 * Round sixty, the sync server and its routes against the three reviews (the self-review's server area, A and B), with
 * the reviewers' proposed tests and reproductions turned round: leases that lapse, a listing crossed by a landing,
 * admission that fails closed (and before the body is read), the day's ceiling counted at a vault's first object, a
 * removal serialised with an upload of the same photograph, the body read as it grows, a vault open that lists at most
 * hourly, the /48 windows, the site's own cap on calls to other services, and the Cache API failing in two routes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, readBody, resetRateLimits, resetMetaFlush, vaultBytes, admitVault, limited, upstreamAllowed, upstreamCall, vaultIdFor, VaultsClosed, VaultUnchecked, PhotoBusy, RATE, NET_RATE_FACTOR, receipt, removedAt, rateLimit, networkKey, RATE_FLUSH_MS, type RateBucket } from '$lib/server/sync';
import { tokenHash } from '$lib/sync/crypto';
import { fakeR2, fakeKV, countersNs, type FakeR2 } from './helpers/fake-sync';

const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 4, 12);
const meta0 = (filled = true) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled });
const r2bytes = (r2: FakeR2) => [...r2.objs].filter(([k]) => !k.endsWith('meta.json')).reduce((s, [, o]) => s + o.size, 0);
const vrow = (c: ReturnType<typeof countersNs>) => c.objects.get(`bytes:${ID}`)!.m;
const vbytes = (c: ReturnType<typeof countersNs>) => (vrow(c).get('v') as { bytes: number }).bytes;
const meta = async (r2: FakeR2) => (await readMeta(r2 as never, ID))!;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());

describe('in-flight bytes are leases (round sixty; A18, B6)', () => {
  it("a release that throws is logged, and its lease lapses: the next days' totals equal the bucket (the review's reproduction, turned round)", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(1_000_000), PROOF, q(T));
    const obj = counters.raw(`bytes:${ID}`);
    const real = obj.c.release.bind(obj.c);
    (obj.c as { release: unknown }).release = async () => { (obj.c as { release: unknown }).release = real; throw new Error('Durable Object reset because its code was updated'); };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(1_000_000), PROOF, q(T));
    expect(logged.mock.calls.some((c) => /lease was not released/.test(String(c[0])))).toBe(true);
    expect([...vrow(counters).keys()].filter((k) => k.startsWith('p:'))).toHaveLength(1); // the stuck lease
    const seen: number[] = [];
    for (let d = 1; d <= 3; d++) {
      await storeOnce(r2 as never, ID, await meta(r2), photo(10 + d), new Uint8Array(10), PROOF, q(T + d * DAY));
      seen.push(vbytes(counters) - r2bytes(r2));
    }
    expect(seen).toEqual([0, 0, 0]);
  });
});

describe('admission fails closed (round sixty; A19, B8)', () => {
  it('a fill that throws refuses the upload with 503, Retry-After 60 and a sentence; nothing is stored uncounted', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, max: 2 };
    await writeMeta(r2 as never, ID, meta0(false));
    const vaults = counters.raw('vaults');
    const real = vaults.c.fill.bind(vaults.c);
    let failing = true;
    (vaults.c as { fill: unknown }).fill = async (...a: Parameters<typeof real>) => { if (failing) throw new Error('overloaded'); return real(...a); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) {
      const e = await storeOnce(r2 as never, ID, await meta(r2), photo(i), new Uint8Array(1000), PROOF, quota).catch((x) => x);
      expect(e).toBeInstanceOf(VaultUnchecked);
    }
    expect(r2bytes(r2)).toBe(0); // five refused, none stored (the review saw five stored uncounted)
    const res = new VaultUnchecked().response();
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as { error: string }).error).toBe('The site could not count this vault just now; try again in a minute.');
    // once the object answers, the vault is counted and stored; at the ceiling a vault that holds nothing is told so, truly
    failing = false;
    await storeOnce(r2 as never, ID, await meta(r2), photo(9), new Uint8Array(1000), PROOF, quota);
    expect(vaults.m.get('all')).toBe(1);
    expect(r2bytes(r2)).toBe(1000);
  });
  it("S05: a counter that cannot be seeded answers 'unavailable': refused (503), the vault unmarked, and counted at the next upload", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const kv = { ...fakeKV(), failAll: true } as ReturnType<typeof fakeKV> & { failAll: boolean };
    const get = kv.get.bind(kv);
    kv.get = async (k: string, t?: string) => { if (k === 'vaults:all' && kv.failAll) throw new Error('KV unreadable'); return get(k, t); };
    const quota = { kv: kv as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, meta0(false));
    await expect(storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota)).rejects.toBeInstanceOf(VaultUnchecked);
    expect((await meta(r2)).filled).toBe(false);
    expect(r2bytes(r2)).toBe(0);
    kv.failAll = false;
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(10), PROOF, quota);
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(1);
  });
  it('S07: without the counter object, the KV fallback still refuses a new vault past the ceiling', async () => {
    const r2 = fakeR2(); const kv = fakeKV(); kv.m.set('vaults:all', '1');
    await writeMeta(r2 as never, ID, meta0(false));
    await expect(storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', max: 1 })).rejects.toBeInstanceOf(VaultsClosed);
    expect([...r2.objs.keys()].filter((k) => !k.endsWith('meta.json'))).toEqual([]);
  });
  it("an admitted vault whose first write fails gives its place back, under the total and under the day (B8)", async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    r2.hooks.beforePut = async (k) => { if (k.includes('/photo/')) throw new Error('R2 internal error'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota)).rejects.toThrow(/R2 internal/);
    const v = counters.objects.get('vaults')!.m;
    expect([v.get('all'), v.get('day:2026-10-04'), v.has(`f:${ID}`)]).toEqual([0, 0, false]);
    expect((await meta(r2)).filled).toBe(false); // its next upload is counted
    r2.hooks.beforePut = undefined;
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(10), PROOF, quota);
    expect([v.get('all'), v.get('day:2026-10-04')]).toEqual([1, 1]);
  });
  it('a vault that already holds an object keeps its place when a later first-counted write fails', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0(false));
    // an object of the vault landed (another upload), but this request's meta still reads unfilled and its write fails
    const stale = await meta(r2);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota);
    await counters.get('vaults').unfill(ID); // as if this request were the one that counted it
    stale.filled = false;
    r2.hooks.beforePut = async (k) => { if (k === photo(2)) throw new Error('R2 internal error'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(storeOnce(r2 as never, ID, stale, photo(2), new Uint8Array(10), PROOF, quota)).rejects.toThrow();
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(1); // not given back: the vault holds photo 1
  });
});

describe("the day's ceiling of new vaults is counted at a vault's first object (round sixty; the self-review, 12)", () => {
  it('past it, a vault that holds nothing is refused until midnight UTC, with a sentence; a creation that stores nothing spends none of it', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    const now = Date.UTC(2026, 9, 4, 18);
    const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, perDay: 1, now };
    await writeMeta(r2 as never, 'OTHERVAULTZZZZZZZZZZZZZZZZ', meta0(false));
    await storeOnce(r2 as never, 'OTHERVAULTZZZZZZZZZZZZZZZZ', (await readMeta(r2 as never, 'OTHERVAULTZZZZZZZZZZZZZZZZ'))!, 'vault/OTHERVAULTZZZZZZZZZZZZZZZZ/photo/p000001.bin', new Uint8Array(10), PROOF, quota);
    await writeMeta(r2 as never, ID, meta0(false));
    const e = await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, quota).catch((x) => x);
    expect(e).toBeInstanceOf(VaultsClosed);
    const res = (e as VaultsClosed).response();
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe(String(6 * 3600));
    expect(((await res.json()) as { error: string }).error).toMatch(/all the new vaults it can today/);
    // the next day it is taken
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(10), PROOF, { ...quota, now: now + DAY });
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(2);
  });
  it('the KV fallback counts the day at the first object too', async () => {
    const r2 = fakeR2(); const kv = fakeKV();
    await writeMeta(r2 as never, ID, meta0(false));
    kv.m.set('vaults:all:2026-10-04', '200');
    await expect(admitVault(r2 as never, ID, await meta(r2), { kv: kv as never, ip: '1.2.3.4', now: T })).rejects.toMatchObject({ which: 'day' });
    kv.m.set('vaults:all:2026-10-04', '3');
    expect(await admitVault(r2 as never, ID, await meta(r2), { kv: kv as never, ip: '1.2.3.4', now: T })).toBe(true);
    expect([kv.m.get('vaults:all'), kv.m.get('vaults:all:2026-10-04')]).toEqual(['1', '4']);
  });
});

/** A vault with a real token, for the routes. */
async function routeVault(filled: boolean) {
  const token = 'c'.repeat(64);
  const id = await vaultIdFor(token);
  const r2 = fakeR2();
  await writeMeta(r2 as never, id, { tokenHash: await tokenHash(token), created: 'c', entitlement: 'open', bytes: 0, filled });
  return { token, id, r2 };
}
/** A body that says how much of it was asked for. */
function watchedBody(bytes: number) {
  let pulled = 0;
  // A high-water mark of nought: the stream is asked for a chunk only when the body is read.
  const stream = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(bytes)); c.close(); } }, { highWaterMark: 0 });
  return { stream, pulled: () => pulled };
}

describe('the ceiling is checked before the body is read (round sixty; A20)', () => {
  it('a refused photograph and a refused batch read none of their body', async () => {
    const { token, id, r2 } = await routeVault(false);
    const kv = fakeKV(); const counters = countersNs();
    const platform = { env: { STORE: r2, QUEUE: kv, COUNTERS: counters, SYNC_VAULTS_MAX: '0' } };
    const photoRoute = await import('../../src/routes/api/sync/photo/[id]/+server');
    const p = watchedBody(5_000_000);
    const req = new Request(`https://x/api/sync/photo/pabcdef1?vault=${id}`, { method: 'PUT', body: p.stream, headers: { authorization: `Bearer ${token}`, 'x-photo-drop': 'd'.repeat(64), 'content-length': '5000000' }, duplex: 'half' } as RequestInit);
    const r = await photoRoute.PUT({ request: req, url: new URL(req.url), params: { id: 'pabcdef1' }, platform, getClientAddress: () => '1.2.3.4' } as never);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect(p.pulled()).toBe(0);
    const logRoute = await import('../../src/routes/api/sync/log/+server');
    const b = watchedBody(5_000_000);
    const req2 = new Request(`https://x/api/sync/log?vault=${id}`, { method: 'POST', body: b.stream, headers: { authorization: `Bearer ${token}`, 'x-batch': '1759579200000-0000-dev1-0123456789ab', 'x-batch-plain': 'e'.repeat(64), 'x-device': 'dev1', 'content-length': '5000000' }, duplex: 'half' } as RequestInit);
    const r2res = await logRoute.POST({ request: req2, url: new URL(req2.url), platform, getClientAddress: () => '1.2.3.4' } as never);
    expect(r2res.status).toBe(503);
    expect(b.pulled()).toBe(0);
  });
});

describe('a removal and an upload of one photograph are serialised (round sixty; A12, B5)', () => {
  it("the review's interleaving: a PUT that arrives while a DELETE holds the name waits (503), and once stored it stays", async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(300).fill(3);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, PROOF, quota);
    let putTried!: () => void; const putDone = new Promise<void>((r) => (putTried = r));
    r2.hooks.beforeDelete = async () => { await putDone; };
    const del = deleteCounted(r2 as never, ID, await meta(r2), photo(1), quota, PROOF.drop);
    await new Promise((r) => setTimeout(r, 20)); // the DELETE holds the name and has looked
    const put = await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, PROOF, quota).catch((e) => e);
    putTried();
    expect(await del).toBe(true);
    expect(put).toBeInstanceOf(PhotoBusy); // not "already there" from an object about to be removed
    const res = (put as PhotoBusy).response();
    expect([res.status, Number(res.headers.get('retry-after')) > 0]).toEqual([503, true]);
    // the device tries again: now it stores, and the server holds it
    r2.hooks.beforeDelete = undefined;
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, PROOF, quota)).toBe('stored');
    expect(r2.objs.has(photo(1))).toBe(true);
    expect(vbytes(counters)).toBe(r2bytes(r2));
  });
  it('a DELETE made before a newer upload of the photograph (revived elsewhere) leaves it alone', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(300).fill(4);
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T });
    const removedAtMs = T + 1000; // device A removes it
    // device B revives it and pushes it again: "already there", a claim on the name after the removal
    expect(await storeOnce(r2 as never, ID, await meta(r2), photo(1), bytes, PROOF, { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 2000 })).toBe('same');
    // A's DELETE arrives later, saying when it removed it
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(1), { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 3000 }, PROOF.drop, removedAtMs)).toBe('newer');
    expect(r2.objs.has(photo(1))).toBe(true);
    // a DELETE made after the revival's claim removes it
    expect(await deleteCounted(r2 as never, ID, await meta(r2), photo(1), { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T + 5000 }, PROOF.drop, T + 4000)).toBe(true);
    expect(r2.objs.has(photo(1))).toBe(false);
  });
  it('the DELETE route answers a removal made before a later claim with 409, and reads the removal time it is sent', async () => {
    expect(removedAt(new Request('https://x', { headers: { 'x-photo-removed-at': '1759579200000' } }), T)).toBe(1759579200000);
    expect(removedAt(new Request('https://x', { headers: { 'x-photo-removed-at': String(T + 3_600_000) } }), T)).toBeNull(); // ahead of the server: not believed
    expect(removedAt(new Request('https://x', { headers: { 'x-photo-removed-at': 'soon' } }), T)).toBeNull();
    const { token, id, r2 } = await routeVault(true);
    const counters = countersNs(); const kv = fakeKV();
    const platform = { env: { STORE: r2, QUEUE: kv, COUNTERS: counters } };
    const key = `vault/${id}/photo/pabcdef1.bin`;
    // Claims alone decide since round sixty-one (the server review, 1; B9): an object with no claim on it is removed
    // whatever R2's own upload time, and one stored through the upload path claims its name.
    await r2.put(key, new Uint8Array(10), { customMetadata: { drop: 'd'.repeat(64) } });
    const route = await import('../../src/routes/api/sync/photo/[id]/+server');
    const unclaimed = new Request(`https://x/api/sync/photo/pabcdef1?vault=${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'x-photo-drop': 'd'.repeat(64), 'x-photo-removed-at': String(r2.objs.get(key)!.uploaded.getTime() - 60_000) } });
    expect((await route.DELETE({ request: unclaimed, url: new URL(unclaimed.url), params: { id: 'pabcdef1' }, platform, getClientAddress: () => '1.2.3.4' } as never)).status).toBe(200);
    await storeOnce(r2 as never, id, (await readMeta(r2 as never, id))!, key, new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', counters, now: Date.now() });
    const del = (at: number) => {
      const req = new Request(`https://x/api/sync/photo/pabcdef1?vault=${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'x-photo-drop': 'd'.repeat(64), 'x-photo-removed-at': String(at) } });
      return route.DELETE({ request: req, url: new URL(req.url), params: { id: 'pabcdef1' }, platform, getClientAddress: () => '1.2.3.4' } as never);
    };
    const old = await del(Date.now() - 60_000); // removed before this upload claimed the name
    expect(old.status).toBe(409);
    expect(r2.objs.has(key)).toBe(true);
    const now = await del(Date.now());
    expect(now.status).toBe(200);
    expect(r2.objs.has(key)).toBe(false);
  });
  it("concurrent removals of one photograph give its bytes back once, on a day with no row yet too (the review's finding 10, turned round)", async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, await meta(r2), photo(1), new Uint8Array(1000), PROOF, q(T));
    await storeOnce(r2 as never, ID, await meta(r2), photo(2), new Uint8Array(1000), PROOF, q(T));
    const rs = await Promise.all(Array.from({ length: 5 }, async () => deleteCounted(r2 as never, ID, await meta(r2), photo(1), q(T + DAY), PROOF.drop)));
    expect(rs.filter((r) => r === true)).toHaveLength(1);
    expect(rs.every((r) => r === true || r === false || r instanceof PhotoBusy)).toBe(true);
    expect(r2bytes(r2)).toBe(1000);
    expect(vbytes(counters)).toBe(1000);
  });
  it('S13 and receipts by version: the same bytes removed, uploaded again and removed again give back both times', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0());
    await storeOnce(r2 as never, ID, await meta(r2), photo(9), new Uint8Array(100), PROOF, quota);
    const body = new Uint8Array(500).fill(7);
    const etags: string[] = [];
    for (let round = 0; round < 2; round++) {
      await storeOnce(r2 as never, ID, await meta(r2), photo(0), body, PROOF, quota);
      etags.push(r2.objs.get(photo(0))!.etag);
      await deleteCounted(r2 as never, ID, await meta(r2), photo(0), quota, PROOF.drop);
    }
    expect(etags[0]).toBe(etags[1]); // R2's etag is the content's: it cannot tell the two uploads apart
    expect(vbytes(counters)).toBe(r2bytes(r2));
    const tokens = [...vrow(counters).keys()].filter((k) => k.startsWith('g:'));
    expect(tokens).toHaveLength(2);
    expect(tokens.every((k) => k.includes(':v:'))).toBe(true);
    expect(receipt('k', { etag: 'e', version: 'v1' })).not.toBe(receipt('k', { etag: 'e', version: 'v2' }));
  });
});

describe('readBody grows as the bytes arrive (round sixty; A21)', () => {
  it('a declared 12 MB with one byte sent holds about a megabyte, not twelve', async () => {
    let pull = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (pull++ === 0) c.enqueue(new Uint8Array(1)); } });
    const request = new Request('http://x/api/sync/photo/pabcdef', { method: 'PUT', body: stream, headers: { 'content-length': String(12 * 1024 * 1024) }, duplex: 'half' } as RequestInit);
    const before = process.memoryUsage().arrayBuffers;
    void readBody(request, 16 * 1024 * 1024, 'a photo').catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(3 * 1024 * 1024);
  });
  it('S27: a declared length with no byte sent yet holds no buffer of that length', async () => {
    const N = 256 * 1024 * 1024;
    let started!: () => void;
    const go = new Promise<void>((r) => (started = r));
    const body = new ReadableStream<Uint8Array>({ pull: () => { started(); return new Promise(() => {}); } });
    const req = new Request('https://x/api/sync/photo/p000001', { method: 'PUT', body, headers: { 'content-length': String(N) }, duplex: 'half' } as RequestInit);
    const before = process.memoryUsage().arrayBuffers;
    void readBody(req, N + 1, 'a photograph').catch(() => {});
    await go;
    await new Promise((r) => setTimeout(r, 20));
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(N / 2);
  });
  it('reads every byte of a body in many chunks, declared or not, and refuses one longer than declared', async () => {
    const chunks = (n: number, size: number) => { let i = 0; return new ReadableStream<Uint8Array>({ pull(c) { if (i < n) c.enqueue(new Uint8Array(size).fill(i++ % 251)); else c.close(); } }); };
    const make = (n: number, size: number, declared?: number) => new Request('https://x/', { method: 'PUT', body: chunks(n, size), headers: declared != null ? { 'content-length': String(declared) } : {}, duplex: 'half' } as RequestInit);
    const a = await readBody(make(40, 100_000, 4_000_000), 16_000_000, 'a photo');
    expect(a.length).toBe(4_000_000);
    expect([a[0], a[100_000], a[3_999_999]]).toEqual([0, 1, 39]);
    const b = await readBody(make(40, 100_000), 16_000_000, 'a photo');
    expect(b.length).toBe(4_000_000);
    expect(b[3_999_999]).toBe(39);
    await expect(readBody(make(40, 100_000, 3_000_000), 16_000_000, 'a photo')).rejects.toMatchObject({ status: 400 });
  });
});

describe('a vault open lists the vault at most hourly (round sixty; the server review, 4)', () => {
  it('with the counter object: a second open within the hour reads the row; past the hour it lists again', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    await r2.put(photo(1), new Uint8Array(10));
    const kv = fakeKV() as never;
    const q = { kv, ip: '1.2.3.4', counters };
    const m = await meta(r2);
    const lists0 = r2.lists();
    expect(await vaultBytes(r2 as never, kv, ID, m, T, true, q)).toBe(10);
    const lists1 = r2.lists();
    expect(lists1).toBeGreaterThan(lists0);
    expect(await vaultBytes(r2 as never, kv, ID, m, T + 30 * 60_000, true, q)).toBe(10);
    expect(r2.lists()).toBe(lists1);
    await vaultBytes(r2 as never, kv, ID, m, T + 61 * 60_000, true, q);
    expect(r2.lists()).toBeGreaterThan(lists1);
  });
  it("twenty joins from twenty /64s of one /48 walk the vault once, not twenty times (the review's reproduction, turned round)", async () => {
    resetRateLimits();
    const { POST } = await import('../../src/routes/api/sync/vault/+server');
    const token = 'b'.repeat(64); const id = await vaultIdFor(token);
    let lists = 0;
    const keys: string[] = [];
    for (let i = 0; i < 2_000; i++) keys.push(`vault/${id}/log/${String(1700000000000 + i * 3600000).padStart(13, '0')}-0000-dev-${i.toString(16).padStart(12, '0')}.bin`);
    const m = { tokenHash: await tokenHash(token), created: 'c', entitlement: 'open', bytes: 0, filled: true };
    const store = {
      get: async (k: string) => (k === `vault/${id}/meta.json` ? { json: async () => m } : null),
      put: async () => ({}),
      list: async (o: { prefix: string; limit?: number; cursor?: string }) => {
        lists++;
        const all = keys.filter((k) => k.startsWith(o.prefix));
        const start = o.cursor ? Number(o.cursor) : 0;
        const page = all.slice(start, start + (o.limit ?? 1000));
        const truncated = start + page.length < all.length;
        return { objects: page.map((k) => ({ key: k, size: 100, uploaded: new Date(1) })), truncated, cursor: truncated ? String(start + page.length) : undefined };
      }
    };
    const kvm = new Map<string, string>();
    const QUEUE = { get: async (k: string, t?: string) => { const v = kvm.get(k) ?? null; return t === 'json' && v ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kvm.set(k, v) };
    const platform = { env: { STORE: store, QUEUE, SYNC_OPEN: '1' } };
    for (let i = 0; i < 20; i++) {
      const request = new Request('http://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token, create: false }) });
      const r = await POST({ request, platform, getClientAddress: () => `2001:db8:7:${i.toString(16)}::1`, url: new URL(request.url) } as never);
      expect(r.status).toBe(200);
    }
    expect(lists).toBe(2 + 1); // two pages of the log and one of photographs, once
  });
});

describe('the /48 windows (round sixty; the server review, 4 and 9)', () => {
  it('every bucket that costs a call upstream or this Worker real work stops a /48 at four times one address', async () => {
    const buckets: RateBucket[] = ['forecast', 'names', 'match', 'search', 'searchmiss', 'reference', 'sync', 'syncobj', 'index', 'sheets', 'render'];
    vi.spyOn(Date, 'now').mockImplementation(() => T);
    for (const [n, bucket] of buckets.entries()) {
      resetRateLimits();
      const cap = RATE[bucket].limit * NET_RATE_FACTOR;
      const at = (i: number) => () => `2001:db8:${n + 10}:${i.toString(16)}::1`;
      if (cap <= 2400) {
        // one request from each of cap + 5 /64s: the /48 stops the rest
        let served = 0;
        for (let i = 0; i < cap + 5; i++) if (!(await limited(undefined, at(i), bucket))) served++;
        expect({ bucket, served }).toEqual({ bucket, served: cap });
      } else {
        // a bucket too large to walk /64 by /64 in memory (the isolate's window map is bounded): the /48's window spent
        // directly, then one request from a /64 never seen before is refused as the network's
        for (let i = 0; i < cap; i++) await rateLimit(undefined, bucket, networkKey(at(0)())!, T, RATE_FLUSH_MS, NET_RATE_FACTOR);
        const stop = await limited(undefined, at(99_999), bucket);
        expect({ bucket, status: stop?.status }).toEqual({ bucket, status: 429 });
        expect(await stop!.text()).toMatch(/network/);
      }
    }
  });
});

describe("the site's own calls to other services (round sixty; the server review, 16)", () => {
  it('are capped for every address together; past the cap the forecast says not asked (503) and asks MET nothing', async () => {
    vi.spyOn(Date, 'now').mockImplementation(() => T);
    let ok = 0;
    for (let i = 0; i < RATE.upstream.limit + 5; i++) if (await upstreamAllowed(undefined)) ok++;
    expect(ok).toBe(RATE.upstream.limit);
    // GBIF's share is spent; MET Norway's is its own (round sixty-one), spent here by the visitors of the minute
    for (let i = 0; i < RATE.upstream.limit; i++) expect((await upstreamCall(undefined, ['met'], null)).ok).toBe(true);
    const { GET } = await import('../../src/routes/api/forecast/+server');
    let asked = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { asked++; return new Response('{}'); });
    const url = new URL('http://x/api/forecast?lat=51.5&lon=-0.1');
    const r = await Promise.resolve(GET({ url, platform: { env: {} }, fetch: globalThis.fetch, getClientAddress: () => '9.9.9.9' } as never)).catch((e: { status?: number }) => e);
    expect((r as Response).status ?? (r as { status: number }).status).toBe(503);
    expect(await (r as Response).json()).toMatchObject({ error: "not asked: this site's calls are used up for this minute", held: true });
    expect(asked).toBe(0);
    fetchSpy.mockRestore();
  });
});

describe('the Cache API failing is a lookup, not a 500 (round sixty; the server review, 12)', () => {
  it('in the names route and the forecast route', async () => {
    const throwing = { match: async () => { throw new Error('cache unavailable'); }, put: async () => { throw new Error('cache unavailable'); } };
    const { GET: names } = await import('../../src/routes/api/names/+server');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('[]', { headers: { 'content-type': 'application/json' } }));
    const r = await names({ url: new URL('http://x/api/names?q=copiapoa'), platform: { caches: { default: throwing }, env: {}, context: { waitUntil: () => {} } }, fetch: globalThis.fetch, getClientAddress: () => '1.2.3.4' } as never);
    expect(r.status).toBe(200);
    const { GET: forecast } = await import('../../src/routes/api/forecast/+server');
    const f = await Promise.resolve(forecast({ url: new URL('http://x/api/forecast?lat=51.5&lon=-0.1'), platform: { caches: { default: throwing }, env: {}, context: { waitUntil: () => {} } }, fetch: globalThis.fetch, getClientAddress: () => '1.2.3.4' } as never)).catch((e: unknown) => e);
    expect([200, 502]).toContain((f as Response).status); // the stub's `{}` is not a forecast: "not checked", never a thrown 500
    fetchSpy.mockRestore();
  });
});
