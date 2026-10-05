/**
 * Round fifty-nine: the sync server's counting, from the three reviews' reproductions (the server reviewer's scratch
 * tests, turned round). A vault takes its place under the ceiling in all exactly once, whatever meta a request read and
 * however many first uploads race, is tried again after a count that failed, and is refused past the ceiling; a removed
 * object gives its bytes back once; the day's first uploads are all counted; a recount keeps what is in flight; and two
 * creations of one vault at once answer "created" once. A counter object per name, its calls queued as a Durable
 * Object's are, over a fake R2 whose calls yield at random.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, storeCounted, deleteCounted, readMeta, writeMeta, ensureVault, vaultIdFor, resetRateLimits, resetMetaFlush, VaultsClosed, VaultUnchecked, type CountersNs } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';
import { createHash, randomUUID } from 'node:crypto';

const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
let clock = Date.UTC(2026, 9, 4, 12);
/**
 * R2 as it answers (round sixty; the harness review): the etag is the MD5 of the bytes, so the same bytes uploaded again
 * have the same etag; `uploaded` is each put's own time and `version` each put's own id. Before, every object of one
 * size shared an etag and every upload one time, so a give-back token of the key alone passed.
 */
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; size: number; md: Record<string, string>; etag: string; uploaded: Date; version: string }>();
  return {
    objs,
    async put(key: string, body: Uint8Array | string, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } }) {
      await tick();
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objs.has(key)) return null;
      const b = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      objs.set(key, { body: b, size: b.length, md: o?.customMetadata ?? {}, etag: createHash('md5').update(b).digest('hex'), uploaded: new Date(clock++), version: randomUUID() });
      return { key };
    },
    async head(key: string) { await tick(); const o = objs.get(key); return o ? { size: o.size, customMetadata: o.md, etag: o.etag, uploaded: o.uploaded, version: o.version } : null; },
    async get(key: string) { await tick(); const o = objs.get(key); return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null; },
    async delete(key: string) { await tick(); objs.delete(key); },
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      await tick();
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort().slice(0, o.limit ?? Infinity);
      return { objects: keys.map((k) => ({ key: k, size: objs.get(k)!.size, uploaded: objs.get(k)!.uploaded })), truncated: false };
    }
  };
}
function fakeKV() { const m = new Map<string, string>(); return { m, get: async (k: string, t?: string) => { const v = m.get(k) ?? null; return t === 'json' && v ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { m.set(k, v); } }; }
function countersNs() {
  const objects = new Map<string, { c: Counters; m: Map<string, unknown>; queue: Promise<unknown> }>();
  const storageOf = (m: Map<string, unknown>) => ({
    async get(keys: string[]) { return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
    async put(e: Record<string, unknown>) { for (const [k, v] of Object.entries(e)) m.set(k, v); },
    async list(o: { prefix?: string; limit?: number } = {}) { return new Map([...m].filter(([k]) => k.startsWith(o.prefix ?? '')).slice(0, o.limit ?? Infinity)); },
    async delete(keys: string[]) { for (const k of keys) m.delete(k); },
    async getAlarm() { return null; }, async setAlarm() {}
  });
  const ns = {
    objects,
    idFromName: (n: string) => n,
    get(name: string) {
      let o = objects.get(name);
      if (!o) { const m = new Map<string, unknown>(); o = { c: new Counters({ storage: storageOf(m) } as never, {} as never), m, queue: Promise.resolve() }; objects.set(name, o); }
      const one = o;
      return new Proxy({}, { get: (_, method: string) => (...args: unknown[]) => { const p = one.queue.then(() => (one.c as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args)); one.queue = p.catch(() => {}); return p; } }) as unknown as Counters;
    }
  };
  return ns as typeof ns & CountersNs;
}
const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const vbytes = (c: ReturnType<typeof countersNs>) => (c.objects.get(`bytes:${ID}`)!.m.get('v') as { bytes: number }).bytes;
const r2bytes = (r2: ReturnType<typeof fakeR2>) => [...r2.objs].filter(([k]) => !k.endsWith('meta.json')).reduce((s, [, o]) => s + o.size, 0);
const all = (c: ReturnType<typeof countersNs>) => c.objects.get('vaults')?.m.get('all');
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('a vault is counted once under the ceiling in all (round fifty-nine)', () => {
  it('twenty first uploads at once, each request with its own read of the meta, count it once', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    await Promise.all(Array.from({ length: 20 }, async (_, i) => storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(i), new Uint8Array(10), PROOF, quota)));
    expect(all(counters)).toBe(1);
  });
  it('a request that wrote back a meta read before the fill does not get the vault counted again', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    const stale = (await readMeta(r2 as never, ID))!;
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(10), PROOF, quota);
    await deleteCounted(r2 as never, ID, stale, photo(1), quota, PROOF.drop); // writes filled:false back
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(10), PROOF, quota);
    expect(all(counters)).toBe(1);
  });
  it('a count that did not land refuses the upload (it is not stored uncounted), and the next upload is counted (round sixty: fails closed)', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    const vaults = counters.objects.get('vaults') ?? (counters.get('vaults'), counters.objects.get('vaults')!);
    const real = vaults.c.fill.bind(vaults.c);
    let fail = true;
    (vaults.c as { fill: unknown }).fill = async (...a: Parameters<typeof real>) => { if (fail) { fail = false; throw new Error('the object did not answer'); } return real(...a); };
    await expect(storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(10), PROOF, quota)).rejects.toBeInstanceOf(VaultUnchecked);
    expect(r2bytes(r2)).toBe(0);
    expect(all(counters) ?? 0).toBe(0);
    expect((await readMeta(r2 as never, ID))!.filled).toBe(false); // not marked: the next upload asks again
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(10), PROOF, quota);
    expect(all(counters)).toBe(1);
    expect((await readMeta(r2 as never, ID))!.filled).toBe(true);
  });
  it('past the ceiling a vault that holds nothing is refused, and its reservation goes back; one already counted is not', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, max: 1 };
    await counters.get('vaults').fill('ANOTHERVAULTZZZZZZZZZZZZZZ', 1, 0);
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    await expect(storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(10), PROOF, quota)).rejects.toBeInstanceOf(VaultsClosed);
    expect(r2bytes(r2)).toBe(0);
    expect(counters.objects.get(`ipbytes:1.2.3.4`)?.m.get(`d:${new Date().toISOString().slice(0, 10)}`) ?? 0).toBe(0);
    expect(all(counters)).toBe(1);
  });
});

describe('the byte totals are exact under concurrency (round fifty-nine)', () => {
  it('ten removals of one photograph at once give its bytes back once', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    for (let i = 0; i < 10; i++) await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(i), new Uint8Array(1_000_000), PROOF, quota);
    expect(vbytes(counters)).toBe(10_000_000);
    await Promise.all(Array.from({ length: 10 }, async () => deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(0), quota, PROOF.drop)));
    expect(vbytes(counters)).toBe(r2bytes(r2));
  });
  it('the day\'s first ten uploads at once are all counted', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    await Promise.all(Array.from({ length: 10 }, async (_, i) => storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(i), new Uint8Array(1_000_000), PROOF, quota)));
    expect(vbytes(counters)).toBe(r2bytes(r2));
  });
  it('a recount while an upload is in flight keeps it: the cap cannot be passed by opening the vault mid-burst', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    const day = '2026-10-04';
    await v.setBytes(90, day);
    const a = await v.take('vault', 10, 100, day); // upload A, in flight
    expect(a).toMatchObject({ ok: true, before: 90 });
    await v.setBytes(90, day); // a forced recount lists only what landed
    expect(await v.take('vault', 10, 100, day)).toEqual({ ok: false, before: 100 }); // B does not fit: A is still counted
    await v.release((a as { lease: string }).lease, true); // A landed
    await v.setBytes(100, day); // and the listing now sees it
    expect(await v.bytesToday(day)).toBe(100);
  });
  it('an upload that fails gives back only what it took, and a second release is nothing', async () => {
    const counters = countersNs();
    const v = counters.get(`bytes:${ID}`);
    const day = '2026-10-04';
    await v.setBytes(0, day);
    const a = (await v.take('vault', 10, 100, day)) as { lease: string };
    await v.take('vault', 10, 100, day); // another, still in flight
    await v.release(a.lease, false);
    await v.release(a.lease, false);
    expect(await v.bytesToday(day)).toBe(10);
  });
});

describe('two creations of one vault at once (round fifty-nine)', () => {
  it('answer "created" once, so the other is refunded', async () => {
    const r2 = fakeR2(); const token = 'a'.repeat(64); const id = await vaultIdFor(token);
    const rs = await Promise.all([ensureVault(r2 as never, id, token, true), ensureVault(r2 as never, id, token, true)]);
    expect(rs.filter((r) => r.created).length).toBe(1);
  });
});

describe('the address gets its bytes back whatever stops the vault\'s step (round fifty-nine)', () => {
  it('a listing that throws leaves the address\'s day as it was', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    r2.list = async () => { throw new Error('the listing failed'); };
    await expect(storeCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(70), 'x', PROOF, quota)).rejects.toThrow(/listing/);
    expect(counters.objects.get('ipbytes:1.2.3.4')!.m.get(`d:${new Date().toISOString().slice(0, 10)}`)).toBe(0);
  });
});
