/**
 * Round fifty-eight, the sync server against the server review: a write from another site, the byte count past the
 * listing bound, concurrent uploads counted in the counter object, two uploads of one name, a vault's place under the
 * ceiling in all taken at its first object, a body longer than it declared, and the /48 windows for the buckets that
 * call another service.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recount, vaultBytes, storeCounted, storeOnce, fillVault, readBody, limited, resetRateLimits, RATE, NET_RATE_FACTOR, MAX_LIST_PAGES, type VaultMeta, type CountersNs } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';
import { _foreignWrite } from '../../src/hooks.server';

function fakeR2() {
  const objs = new Map<string, { size: number; md: Record<string, string> }>();
  return {
    objs,
    async put(key: string, body: Uint8Array, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } }) {
      await new Promise((r) => setTimeout(r, 1));
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objs.has(key)) return null; // R2: the condition failed
      objs.set(key, { size: body.length ?? String(body).length, md: o?.customMetadata ?? {} });
      return { key };
    },
    async head(key: string) { const o = objs.get(key); return o ? { size: o.size, customMetadata: o.md } : null; },
    async get() { return null; },
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      const start = o.cursor ? Number(o.cursor) : 0;
      const page = keys.slice(start, start + (o.limit ?? 1000));
      const truncated = start + page.length < keys.length;
      return { objects: page.map((k) => ({ key: k, size: objs.get(k)!.size, uploaded: new Date(1) })), truncated, cursor: truncated ? String(start + page.length) : undefined };
    }
  };
}
function fakeKV() { const m = new Map<string, string>(); return { m, get: async (k: string, t?: string) => { const v = m.get(k) ?? null; return t === 'json' && v ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { await new Promise((r) => setTimeout(r, 1)); m.set(k, v); } }; }
/** The real counter class, one per name, each taking one request at a time as a Durable Object does. */
function countersNs() {
  const objects = new Map<string, { c: Counters; m: Map<string, unknown>; queue: Promise<unknown> }>();
  const storageOf = (m: Map<string, unknown>) => {
    let alarm: number | null = null;
    return {
      async get(keys: string[]) { await new Promise((r) => setTimeout(r, 1)); return new Map(keys.filter((k) => m.has(k)).map((k) => [k, m.get(k)])); },
      async put(e: Record<string, unknown>) { await new Promise((r) => setTimeout(r, 1)); for (const [k, v] of Object.entries(e)) m.set(k, v); },
      async list(o: { prefix?: string; limit?: number } = {}) { return new Map([...m].filter(([k]) => k.startsWith(o.prefix ?? '')).slice(0, o.limit ?? Infinity)); },
      async delete(keys: string[]) { for (const k of keys) m.delete(k); },
      async getAlarm() { return alarm; },
      async setAlarm(t: number) { alarm = t; }
    };
  };
  const ns = {
    objects,
    idFromName: (n: string) => n,
    get(name: string) {
      let o = objects.get(name);
      if (!o) { const m = new Map<string, unknown>(); o = { c: new Counters({ storage: storageOf(m) } as never, {} as never), m, queue: Promise.resolve() }; objects.set(name, o); }
      const one = o;
      return new Proxy({}, { get: (_, method: string) => (...args: unknown[]) => { const p = one.queue.then(() => (one.c as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](...args)); one.queue = p.catch(() => {}); return p; } });
    }
  };
  return ns as typeof ns & CountersNs;
}
const ID = 'ABCDEFGHJKMNPQRSTVWXYZ2346';
const fresh = (): VaultMeta => ({ tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0, filled: false });

beforeEach(() => resetRateLimits());

describe('a write to the sync routes from another site is refused (round fifty-eight)', () => {
  const at = (path: string, method: string, headers: Record<string, string> = {}) => _foreignWrite(new Request(`https://cultifolio.com${path}`, { method, headers, body: method === 'GET' ? undefined : 'x' }), new URL(`https://cultifolio.com${path}`));
  it('names another site in Origin or Sec-Fetch-Site: refused; the device\'s own, or none named: let through', () => {
    expect(at('/api/sync/vault', 'POST', { origin: 'https://evil.example' })).toBe(true);
    expect(at('/api/sync/log?vault=x', 'POST', { 'sec-fetch-site': 'cross-site' })).toBe(true);
    expect(at('/api/sync/photo/p1234567', 'PUT', { 'sec-fetch-site': 'same-site' })).toBe(true);
    expect(at('/api/sync/photo/p1234567', 'DELETE', { origin: 'https://cultifolio.com.evil.example' })).toBe(true);
    expect(at('/api/sync/vault', 'POST', { origin: 'https://cultifolio.com', 'sec-fetch-site': 'same-origin' })).toBe(false);
    expect(at('/api/sync/vault', 'POST')).toBe(false); // a script names no site, and can send anything anyway
    expect(at('/api/sync/log?vault=x', 'GET', { origin: 'https://evil.example' })).toBe(false); // a read needs the token, which another site does not have
    expect(at('/api/search', 'POST', { origin: 'https://evil.example' })).toBe(false);
  });
});

describe('the byte count (round fifty-eight; the server review\'s findings 2 and 3)', () => {
  it('a listing cut short by the bound never writes a smaller total over a larger one', async () => {
    const r2 = fakeR2();
    for (let i = 0; i < MAX_LIST_PAGES * 1000; i++) r2.objs.set(`vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`, { size: 1, md: {} });
    r2.objs.set(`vault/${ID}/photo/pzzzzzz.bin`, { size: 2_140_000_000, md: {} });
    const meta: VaultMeta = { ...fresh(), bytes: 2_140_050_000 };
    expect(await recount(r2 as never, ID, meta)).toBe(2_140_050_000);
    expect(meta.bytes).toBe(2_140_050_000);
    const kv = fakeKV();
    expect(await vaultBytes(r2 as never, kv as never, ID, meta, Date.now(), true)).toBe(2_140_050_000);
    await expect(storeCounted(r2 as never, ID, meta, `vault/${ID}/photo/pzzzzzy.bin`, new Uint8Array(12 * 1024 * 1024), 'x', { drop: 'd' }, { kv: kv as never, ip: '1.1.1.1' })).rejects.toMatchObject({ status: 507 });
  }, 60_000);
  it('ten photographs stored at once are counted ten times, in the vault and in the address\'s day, under the counter object', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    const counters = countersNs();
    const meta = fresh();
    const body = new Uint8Array(1_000_000);
    const quota = { kv: kv as never, ip: '5.5.5.5', counters };
    await Promise.all(Array.from({ length: 10 }, (_, i) => storeCounted(r2 as never, ID, meta, `vault/${ID}/photo/p00000${i}.bin`, body, 'x', { drop: 'd' }, quota)));
    const day = new Date().toISOString().slice(0, 10);
    expect((counters.objects.get(`bytes:${ID}`)!.m.get('v') as { bytes: number }).bytes).toBe(10_000_000);
    expect(counters.objects.get('ipbytes:5.5.5.5')!.m.get(`d:${day}`)).toBe(10_000_000);
    expect(await vaultBytes(r2 as never, kv as never, ID, meta, Date.now(), false, quota)).toBe(10_000_000);
    // a removal gives the bytes back in the same object
    expect(kv.m.size).toBe(0); // nothing of the bytes is in KV under the object
  });
  it('an upload that does not land gives its bytes back, in both objects', async () => {
    const r2 = fakeR2();
    const counters = countersNs();
    const meta = fresh();
    const failing = { ...r2, put: async () => { throw new Error('R2 did not answer'); } };
    await expect(storeCounted(failing as never, ID, meta, `vault/${ID}/photo/p0000001.bin`, new Uint8Array(500), 'x', { drop: 'd' }, { kv: fakeKV() as never, ip: '6.6.6.6', counters })).rejects.toThrow('R2 did not answer');
    const day = new Date().toISOString().slice(0, 10);
    expect((counters.objects.get(`bytes:${ID}`)!.m.get('v') as { bytes: number }).bytes).toBe(0);
    expect(counters.objects.get('ipbytes:6.6.6.6')!.m.get(`d:${day}`)).toBe(0);
  });
});

describe('two uploads of one name (round fifty-eight)', () => {
  it('the write is conditional: the second is judged against what the first stored, never written over it, never counted', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    const counters = countersNs();
    const meta = fresh();
    const quota = { kv: kv as never, ip: '7.7.7.7', counters };
    const key = `vault/${ID}/log/x.bin`;
    const [a, b] = await Promise.all([storeOnce(r2 as never, ID, meta, key, new Uint8Array([1, 2, 3]), { plain: 'p'.repeat(64), device: 'd1' }, quota), storeOnce(r2 as never, ID, meta, key, new Uint8Array([4, 5, 6]), { plain: 'q'.repeat(64), device: 'd2' }, quota)]);
    expect([a, b].sort()).toEqual(['different', 'stored']);
    expect((counters.objects.get(`bytes:${ID}`)!.m.get('v') as { bytes: number }).bytes).toBe(3);
    // the same batch re-sealed by its device is 'same', whichever reached the bucket first
    const [c, d] = await Promise.all([storeOnce(r2 as never, ID, meta, `vault/${ID}/log/y.bin`, new Uint8Array([7]), { plain: 'r'.repeat(64), device: 'd1' }, quota), storeOnce(r2 as never, ID, meta, `vault/${ID}/log/y.bin`, new Uint8Array([8]), { plain: 'r'.repeat(64), device: 'd1' }, quota)]);
    expect([c, d].sort()).toEqual(['same', 'stored']);
  });
});

describe('a vault takes its place under the ceiling in all at its first object (round fifty-eight)', () => {
  it('once, in the counter object, and the meta says so', async () => {
    const r2 = fakeR2();
    const counters = countersNs();
    const meta = fresh();
    const quota = { kv: fakeKV() as never, ip: '8.8.8.8', counters };
    await storeCounted(r2 as never, ID, meta, `vault/${ID}/log/a.bin`, new Uint8Array(3), 'x', {}, quota);
    await storeCounted(r2 as never, ID, meta, `vault/${ID}/log/b.bin`, new Uint8Array(3), 'x', {}, quota);
    expect(meta.filled).toBe(true);
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(1);
    // a vault from before the flag counted itself at its creation, and is not counted again
    const old: VaultMeta = { tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0 };
    await fillVault(r2 as never, ID, old, quota);
    expect(counters.objects.get('vaults')!.m.get('all')).toBe(1);
  });
  it('without the object, in KV', async () => {
    const kv = fakeKV();
    const meta = fresh();
    await storeCounted(fakeR2() as never, ID, meta, `vault/${ID}/log/a.bin`, new Uint8Array(3), 'x', {}, { kv: kv as never, ip: '8.8.4.4' });
    expect(kv.m.get('vaults:all')).toBe('1');
  });
});

describe('a body is held once, and never longer than it said (round fifty-eight)', () => {
  it('read into one buffer of the declared length; a body longer than declared is refused', async () => {
    const ok = await readBody(new Request('http://x', { method: 'POST', headers: { 'content-length': '5' }, body: new Uint8Array([1, 2, 3, 4, 5]) }), 100, 'a batch');
    expect([...ok]).toEqual([1, 2, 3, 4, 5]);
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); c.enqueue(new Uint8Array(4)); c.close(); } });
    const lying = new Request('http://x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    Object.defineProperty(lying, 'headers', { value: new Headers({ 'content-length': '5' }) });
    await expect(readBody(lying, 100, 'a batch')).rejects.toMatchObject({ status: 400 });
  });
});

describe('the buckets that call another service count an IPv6 /48 too (round fifty-eight)', () => {
  it('rotating /64s within one /48 meets the network\'s window at four times one address\'s', async () => {
    const limit = RATE.forecast.limit;
    let served = 0;
    for (let i = 0; i < limit * NET_RATE_FACTOR + 10; i++) {
      const r = await limited(undefined, () => `2001:db8:1:${i.toString(16)}::1`, 'forecast');
      if (!r) served++;
    }
    expect(served).toBe(limit * NET_RATE_FACTOR);
    // a bucket that calls no one else is counted by address alone
    for (let i = 0; i < 50; i++) expect(await limited(undefined, () => `2001:db8:2:${i.toString(16)}::1`, 'search')).toBeNull();
  });
});
