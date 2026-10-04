/**
 * Proposed by the round-59 harness review: each test fails under one mutation of a round-58/59 server fix that the
 * suite let through (ids from /tmp/review59/harness.md).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { storeOnce, deleteCounted, readMeta, writeMeta, readBody, resetRateLimits, resetMetaFlush, VaultsClosed, type CountersNs } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';

let clock = 1;
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; size: number; md: Record<string, string>; at: number }>();
  return {
    objs,
    async put(key: string, body: Uint8Array | string, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } }) {
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objs.has(key)) return null;
      const b = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      objs.set(key, { body: b, size: b.length, md: o?.customMetadata ?? {}, at: clock++ });
      return { key };
    },
    // R2's etag is the content's MD5: the same bytes re-uploaded have the same etag; only the upload time tells them apart.
    async head(key: string) { const o = objs.get(key); return o ? { size: o.size, customMetadata: o.md, etag: String(o.size), uploaded: new Date(o.at) } : null; },
    async get(key: string) { const o = objs.get(key); return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null; },
    async delete(key: string) { objs.delete(key); },
    async list(o: { prefix: string }) {
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      return { objects: keys.map((k) => ({ key: k, size: objs.get(k)!.size, uploaded: new Date(objs.get(k)!.at) })), truncated: false };
    }
  };
}
function fakeKV(failAll = false) {
  const m = new Map<string, string>();
  return { m, failAll, get: async function (this: { failAll: boolean }, k: string) { if (k === 'vaults:all' && this.failAll) throw new Error('KV unreadable'); return m.get(k) ?? null; }, put: async (k: string, v: string) => { m.set(k, v); } };
}
function storage() {
  const m = new Map<string, unknown>();
  return {
    m,
    async get(keys: string[]) { return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
    async put(e: Record<string, unknown>) { for (const [k, v] of Object.entries(e)) m.set(k, v); },
    async list(o: { prefix?: string; limit?: number } = {}) { return new Map([...m].filter(([k]) => k.startsWith(o.prefix ?? '')).slice(0, o.limit ?? Infinity)); },
    async delete(keys: string[]) { for (const k of keys) m.delete(k); },
    async getAlarm() { return null; }, async setAlarm() {}
  };
}
function countersNs() {
  const objects = new Map<string, { c: Counters; m: Map<string, unknown> }>();
  const ns = {
    objects,
    idFromName: (n: string) => n,
    get(name: string) {
      let o = objects.get(name);
      if (!o) { const s = storage(); o = { c: new Counters({ storage: s } as never, {} as never), m: s.m }; objects.set(name, o); }
      return o.c;
    }
  };
  return ns as typeof ns & CountersNs;
}
const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const make = () => { const s = storage(); return { c: new Counters({ storage: s } as never, {} as never), s }; };
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });

describe('admitVault (proposed)', () => {
  it('S05: an object that cannot be seeded leaves the vault unmarked, so the next upload counts it', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const kv = fakeKV(true);
    const quota = { kv: kv as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(10), PROOF, quota);
    expect((await readMeta(r2 as never, ID))!.filled).toBe(false);
    kv.failAll = false;
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(10), PROOF, quota);
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(1);
  });
  it('S07: without the counter object, the KV fallback still refuses a new vault past the ceiling', async () => {
    const r2 = fakeR2(); const kv = fakeKV(); kv.m.set('vaults:all', '1');
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });
    await expect(storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(10), PROOF, { kv: kv as never, ip: '1.2.3.4', max: 1 })).rejects.toBeInstanceOf(VaultsClosed);
    expect([...r2.objs.keys()].filter((k) => !k.endsWith('meta.json'))).toEqual([]);
  });
});

describe('the byte object (proposed)', () => {
  it('S13: a photograph removed, uploaded again under the same name with the same bytes, and removed again gives its bytes back both times', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters };
    await writeMeta(r2 as never, ID, { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const body = new Uint8Array(1000);
    for (let round = 0; round < 2; round++) {
      await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(0), body, PROOF, quota);
      await deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(0), quota, PROOF.drop);
    }
    expect((counters.objects.get(`bytes:${ID}`)!.m.get('v') as { bytes: number }).bytes).toBe(0);
  });
  it('S14: give tokens are swept with the day keys', async () => {
    const { c, s } = make();
    await c.setBytes(10, '2026-10-01');
    await c.give('vault', 1, '2026-10-01', 'k:e:1');
    expect(s.m.has('g:k:e:1')).toBe(true);
    await c.sweep(Date.parse('2026-10-04T01:00:00Z'));
    expect(s.m.has('g:k:e:1')).toBe(false);
  });
  it("S15: once today's row exists, a stale listing passed by a late request does not replace it", async () => {
    const { c } = make();
    const day = '2026-10-04';
    expect(await c.take('vault', 10, 100, day, 0)).toEqual({ ok: true, before: 0 });
    await c.release(10, true); // landed: no longer pending
    expect(await c.take('vault', 10, 100, day, 0)).toEqual({ ok: true, before: 10 }); // its listing was made before the first landed
    expect(await c.bytesToday(day)).toBe(20);
  });
  it("S16: a day's first listing has what is still in flight from the day before added to it", async () => {
    const { c } = make();
    await c.setBytes(0, '2026-10-03');
    await c.take('vault', 10, 100, '2026-10-03'); // in flight across midnight
    expect(await c.take('vault', 5, 100, '2026-10-04', 50)).toEqual({ ok: true, before: 60 });
  });
  it('S18: a second release of a failed upload gives nothing more back', async () => {
    const { c } = make();
    const day = '2026-10-04';
    await c.setBytes(50, day);
    await c.take('vault', 10, 100, day);
    await c.release(10, false);
    await c.release(10, false);
    expect(await c.bytesToday(day)).toBe(50);
  });
});

describe('readBody (proposed)', () => {
  it('S27: a declared length with no byte sent yet holds no buffer of that length', async () => {
    const N = 256 * 1024 * 1024;
    let pull!: (c: ReadableStreamDefaultController<Uint8Array>) => void;
    const started = new Promise<void>((r) => { pull = () => r(); });
    const body = new ReadableStream<Uint8Array>({ pull: (c) => { pull(c); return new Promise(() => {}); } });
    const req = new Request('https://x/api/sync/photo/p000001', { method: 'PUT', body, headers: { 'content-length': String(N) }, duplex: 'half' } as RequestInit);
    const before = process.memoryUsage().arrayBuffers;
    void readBody(req, N + 1, 'a photograph').catch(() => {});
    await started;
    await new Promise((r) => setTimeout(r, 20));
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(N / 2);
  });
});
