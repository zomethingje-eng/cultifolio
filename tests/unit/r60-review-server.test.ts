// Adopted in round 60 from the round-59 reviews (server review reproductions, docs/review-59/tests), turned round to state the fixed behaviour.
/**
 * Round 59 review (server area): reproductions, now guards of the round-60 fixes. Harness copied from sync-accounting.test.ts, with an R2 stand-in whose
 * head gives a content etag and a per-upload time, as R2's does.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { storeOnce, deleteCounted, readMeta, writeMeta, vaultIdFor, resetRateLimits, resetMetaFlush, VaultsClosed, VaultUnchecked, PhotoBusy, type CountersNs } from '$lib/server/sync';
import { limited, RATE, NET_RATE_FACTOR, photoObjectKey } from '$lib/server/sync';
import { Counters } from '$lib/server/counters';
import { corpusNow, _forgetIndex, UNREADABLE } from '$lib/server/dossiers';
import { createHash } from 'node:crypto';

const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
let clock = Date.UTC(2026, 9, 4, 12);
/** R2-like: etag is the MD5 of the bytes (single-part), uploaded is the moment of each put. Hooks let a test order calls. */
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; size: number; md: Record<string, string>; etag: string; uploaded: Date }>();
  const hooks: { beforeDelete?: (k: string) => Promise<void>; afterHead?: (k: string) => Promise<void> } = {};
  return {
    objs, hooks,
    async put(key: string, body: Uint8Array | string, o?: { customMetadata?: Record<string, string>; onlyIf?: { etagDoesNotMatch?: string } }) {
      await tick();
      if (o?.onlyIf?.etagDoesNotMatch === '*' && objs.has(key)) return null;
      const b = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      objs.set(key, { body: b, size: b.length, md: o?.customMetadata ?? {}, etag: createHash('md5').update(b).digest('hex'), uploaded: new Date(clock++) });
      return { key };
    },
    async head(key: string) { await tick(); const o = objs.get(key); const r = o ? { size: o.size, customMetadata: o.md, etag: o.etag, uploaded: o.uploaded } : null; await hooks.afterHead?.(key); return r; },
    async get(key: string) { await tick(); const o = objs.get(key); return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null; },
    async delete(key: string) { await hooks.beforeDelete?.(key); await tick(); objs.delete(key); },
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      await tick();
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort();
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
const ID ='ABCDEFGHJKMNPQRSTVWXYZ2346';
const vrow = (c: ReturnType<typeof countersNs>) => c.objects.get(`bytes:${ID}`)!.m;
const r2bytes = (r2: ReturnType<typeof fakeR2>) => [...r2.objs].filter(([k]) => !k.endsWith('.json')) /* the meta and, since round sixty-two, photographs' pointers: not counted */.reduce((s, [, o]) => s + o.size, 0);
const PROOF = { drop: 'd'.repeat(64) };
const photo = (i: number) => `vault/${ID}/photo/p${String(i).padStart(6, '0')}.bin`;
const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 4, 12);
beforeEach(() => { resetRateLimits(); resetMetaFlush(); });
afterEach(() => vi.restoreAllMocks());
const leaseKeys = (c: ReturnType<typeof countersNs>) => [...vrow(c).keys()].filter((k) => k.startsWith('p:'));
/** The same counter objects with the photograph's hold taken away, as an object deployed before round sixty answers: the receipt is then the only guard. */
const withoutHold = (c: ReturnType<typeof countersNs>) => ({ ...c, get: (n: string) => new Proxy(c.get(n) as object, { get: (t, k) => (k === 'hold' || k === 'unhold' ? undefined : (t as Record<string | symbol, unknown>)[k]) }) }) as unknown as CountersNs;
const meta0 = (filled = true) => ({ tokenHash: 'h', created: 'c', entitlement: 'open' as const, bytes: 0, filled });

describe('in-flight bytes whose release never came', () => {
  it("a release that throws leaves a lease that lapses after ten minutes, so a later day's recount does not add it back", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(1_000_000), PROOF, q(T));
    const obj = counters.objects.get(`bytes:${ID}`)!;
    const real = obj.c.release.bind(obj.c);
    (obj.c as { release: unknown }).release = async () => { (obj.c as { release: unknown }).release = real; throw new Error('Durable Object reset because its code was updated'); };
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(1_000_000), PROOF, q(T));
    expect(r2bytes(r2)).toBe(2_000_000);
    expect(leaseKeys(counters).length).toBe(1); // the lease the failed release left
    const seen: number[] = [];
    for (let d = 1; d <= 3; d++) {
      // a new day: the first upload recounts from the listing, and adds only the leases still live
      await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(10 + d), new Uint8Array(10), PROOF, q(T + d * DAY));
      seen.push((vrow(counters).get('v') as { bytes: number }).bytes - r2bytes(r2));
    }
    expect(seen).toEqual([0, 0, 0]); // counted for ten minutes at most, never for good
    expect(leaseKeys(counters)).toEqual([]);
  });
  it('stuck reservations count while live, and a listing weeks later drops them, so a vault with room is not refused', async () => {
    const counters = countersNs(); const v = counters.get(`bytes:${ID}`);
    const limit = 100;
    await v.setBytes(0, '2026-10-04', null, T);
    for (let i = 0; i < 9; i++) await v.take('vault', 10, limit, '2026-10-04', null, T); // nine uploads taken, none released (Workers that died)
    expect(await v.setBytes(0, '2026-10-04', null, T + 5 * 60_000)).toBe(90); // within ten minutes a listing adds them back
    await v.setBytes(0, '2026-10-30', null, T + 26 * DAY); // weeks later: the bucket holds nothing, and the leases have lapsed
    expect(await v.take('vault', 20, limit, '2026-10-30', null, T + 26 * DAY)).toMatchObject({ ok: true, before: 0 });
  });
});

describe('a vault whose first count fails', () => {
  it('is refused for a minute (503) while fill fails, stores nothing uncounted, and at the ceiling is truly told it "holds nothing yet"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, max: 2 };
    await writeMeta(r2 as never, ID, meta0(false));
    counters.get('vaults');
    const vaults = counters.objects.get('vaults')!;
    const real = vaults.c.fill.bind(vaults.c);
    let failing = true;
    (vaults.c as { fill: unknown }).fill = async (...a: Parameters<typeof real>) => { if (failing) throw new Error('overloaded'); return real(...a); };
    for (let i = 0; i < 5; i++) {
      const e = await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(i), new Uint8Array(1000), PROOF, quota).catch((x) => x);
      expect(e).toBeInstanceOf(VaultUnchecked);
      expect((e as VaultUnchecked).response().headers.get('retry-after')).toBe('60');
    }
    expect(r2bytes(r2)).toBe(0); // nothing stored uncounted
    expect(vaults.m.get('all') ?? 0).toBe(0);
    expect((await readMeta(r2 as never, ID))!.filled).toBe(false);
    failing = false;
    await counters.get('vaults').fill('OTHERVAULT1ZZZZZZZZZZZZZZZ', 2, 0);
    await counters.get('vaults').fill('OTHERVAULT2ZZZZZZZZZZZZZZZ', 2, 0);
    const e = await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(9), new Uint8Array(1000), PROOF, quota).catch((x) => x);
    expect(e).toBeInstanceOf(VaultsClosed);
    const body = (await (e as VaultsClosed).response().json()) as { error: string };
    expect(body.error).toMatch(/this vault holds nothing yet/);
    expect(r2bytes(r2)).toBe(0); // and it does hold nothing
  });
});

describe('the give token', () => {
  it('a remove and re-upload of the same bytes under the same name gets a new receipt (without a version, the upload time differs), so both removals give back', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(500).fill(7);
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(100), PROOF, quota);
    for (let i = 0; i < 2; i++) {
      await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), bytes, PROOF, quota);
      await deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), quota, PROOF.drop);
    }
    expect((vrow(counters).get('v') as { bytes: number }).bytes).toBe(r2bytes(r2));
    expect([...vrow(counters).keys()].filter((k) => k.startsWith('g:')).length).toBe(2);
  });
  it('two removals at once: the second is answered busy while the first holds the name, and the bytes come off once', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(1000), PROOF, q(T));
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(1000), PROOF, q(T));
    let n = 0; let aHeaded!: () => void; const aHead = new Promise<void>((r) => (aHeaded = r));
    let go!: () => void; const gate = new Promise<void>((r) => (go = r));
    // A's second head is its look under the hold (the first, unheld, checks the proof since round sixty-one).
    r2.hooks.afterHead = async (k) => { if (k === photo(1) && ++n === 2) { aHeaded(); await gate; } };
    const a = deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), q(T + DAY), PROOF.drop);
    await aHead; // A holds the name and has looked
    const b = await deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), q(T + DAY), PROOF.drop);
    expect(b).toBeInstanceOf(PhotoBusy);
    expect((b as PhotoBusy).response().status).toBe(503);
    go();
    expect(await a).toBe(true);
    expect(await deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), q(T + DAY), PROOF.drop)).toBe(false); // B's retry: nothing there
    expect(r2bytes(r2)).toBe(1000);
    expect((vrow(counters).get('v') as { bytes: number }).bytes).toBe(1000);
  });
  it('without the hold, two removals on a day with no row yet: the first records its receipt before it recounts, so the second gives nothing back again', async () => {
    const r2 = fakeR2(); const counters = countersNs();
    await writeMeta(r2 as never, ID, meta0());
    const q = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters, now });
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), new Uint8Array(1000), PROOF, q(T));
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(2), new Uint8Array(1000), PROOF, q(T));
    const bare = withoutHold(counters);
    const qb = (now: number) => ({ kv: fakeKV() as never, ip: '1.2.3.4', counters: bare, now });
    // The next day. A and B both look before either deletes; A then finishes (delete, no row today, recount); then B.
    let n = 0; let bHeaded!: () => void; const bHead = new Promise<void>((r) => (bHeaded = r));
    let aHeaded!: () => void; const aHead = new Promise<void>((r) => (aHeaded = r));
    let aDone!: () => void; const aFinished = new Promise<void>((r) => (aDone = r));
    // Each removal heads twice before its look is done (the proof, unheld, then the look: round sixty-one).
    r2.hooks.afterHead = async (k) => { if (k !== photo(1)) return; n++; if (n === 2) { aHeaded(); await bHead; } else if (n === 4) { bHeaded(); await aFinished; } };
    const mA = (await readMeta(r2 as never, ID))!, mB = (await readMeta(r2 as never, ID))!;
    const a = deleteCounted(r2 as never, ID, mA, photo(1), qb(T + DAY), PROOF.drop).then((x) => { aDone(); return x; });
    await aHead;
    const b = deleteCounted(r2 as never, ID, mB, photo(1), qb(T + DAY), PROOF.drop);
    // B reads the object again just before its delete (round sixty-one; B10) and finds it gone: nothing there (404).
    expect(await Promise.all([a, b])).toEqual([true, false]);
    expect(r2bytes(r2)).toBe(1000);
    expect((vrow(counters).get('v') as { bytes: number }).bytes).toBe(1000); // taken off once, not twice
  });
});

describe('a DELETE racing a PUT of one name', () => {
  it('the PUT that comes while the DELETE holds the name is answered busy (503), its retry stores, and the server keeps the photograph', async () => {
    const r2 = fakeR2(); const counters = countersNs(); const quota = { kv: fakeKV() as never, ip: '1.2.3.4', counters, now: T };
    await writeMeta(r2 as never, ID, meta0());
    const bytes = new Uint8Array(300).fill(3);
    await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), bytes, PROOF, quota);
    let reached!: () => void; const atDelete = new Promise<void>((r) => (reached = r));
    let putSaw!: () => void; const putDone = new Promise<void>((r) => (putSaw = r));
    r2.hooks.beforeDelete = async () => { reached(); await putDone; };
    const del = deleteCounted(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), quota, PROOF.drop);
    await atDelete; // the DELETE has looked and holds the name
    const put = await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), bytes, PROOF, quota).catch((x) => x);
    putSaw();
    expect(await del).toBe(true);
    expect(put).toBeInstanceOf(PhotoBusy); // not "already there" from the object the DELETE then removed
    expect(await storeOnce(r2 as never, ID, (await readMeta(r2 as never, ID))!, photo(1), bytes, PROOF, quota)).toBe('stored');
    const at = await photoObjectKey(r2 as never, photo(1)); // a new generation since round sixty-two
    expect(!!at && r2.objs.has(at)).toBe(true);
  });
});

describe('rate buckets and the /48', () => {
  const at = (ip: string) => () => ip;
  it('"index" (megabytes per answer) is counted per /48 too: one /48 rotating its /64s is stopped at four times one address\'s allowance', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let stopped = 0;
    for (let i = 0; i < 200; i++) if (await limited(undefined, at(`2001:db8:1:${i.toString(16)}::1`), 'index')) stopped++;
    expect(RATE.index.limit).toBe(6);
    expect(stopped).toBe(200 - RATE.index.limit * NET_RATE_FACTOR); // 24 whole-index answers in one window from one /48
    let s2 = 0;
    for (let i = 0; i < 200; i++) if (await limited(undefined, at(`2001:db8:2:${i.toString(16)}::1`), 'search')) s2++;
    expect(s2).toBe(0); // search is /48-counted at 4 x 3000, so 200 is under it
  });
});

describe('the corpus when R2 blips at the minute check', () => {
  it('the held corpus is served while R2 fails, asked about again after ten seconds, and a cold isolate answers 503, never the fixture', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    _forgetIndex();
    const idx = [{ key: 1, slug: 'aloe-vera', name: 'Aloe vera', open: 0 }, { key: 2, slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', open: 0 }];
    let down = false; let asked = 0;
    const store = {
      get: async (k: string) => { asked++; if (down) throw new Error('R2 internal error'); return k === 's/v2/index.json' ? { text: async () => JSON.stringify(idx), json: async () => idx, etag: '"e1"' } : null; },
      head: async (k: string) => { asked++; if (down) throw new Error('R2 internal error'); return k === 's/v2/index.json' ? { etag: '"e1"' } : null; }
    };
    const platform = { env: { STORE: store } } as unknown as App.Platform;
    const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
    let now = Date.UTC(2026, 9, 4, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const first = await corpusNow(platform, noStatic);
    expect(first.idx.length).toBe(2);
    down = true; now += 61_000; asked = 0;
    expect((await corpusNow(platform, noStatic)).idx.length).toBe(2); // the two-species corpus the isolate holds stands
    expect(asked).toBeGreaterThan(0);
    asked = 0; now += 5_000;
    expect((await corpusNow(platform, noStatic)).idx.length).toBe(2);
    expect(asked).toBe(0); // not asked again on every request
    now += 6_000;
    expect((await corpusNow(platform, noStatic)).idx.length).toBe(2);
    expect(asked).toBeGreaterThan(0); // asked again after ten seconds
    down = false; now += 11_000;
    expect((await corpusNow(platform, noStatic)).corpus).toBe(first.corpus);
    _forgetIndex(); down = true;
    const e = await corpusNow(platform, noStatic).then(() => null, (x) => x);
    expect(e).toMatchObject({ status: 503, body: { message: UNREADABLE } });
  });
});

describe('opening a vault lists it at most once an hour', () => {
  it('twenty joins in an hour walk the listing once, and "sync" is counted per /48 too', async () => {
    resetRateLimits();
    const { POST } = await import('../../src/routes/api/sync/vault/+server');
    const token = 'b'.repeat(64); const id = await vaultIdFor(token);
    let lists = 0;
    const keys: string[] = [];
    for (let i = 0; i < 20_000; i++) keys.push(`vault/${id}/log/${String(1700000000000 + i * 3600000).padStart(13, '0')}-0000-dev-${i.toString(16).padStart(12, '0')}.bin`);
    const meta = JSON.stringify({ tokenHash: '', created: 'c', entitlement: 'open', bytes: 0, filled: true });
    const { tokenHash } = await import('$lib/sync/crypto');
    const m = JSON.parse(meta); m.tokenHash = await tokenHash(token);
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
    // A KV that reads JSON when asked, as Workers KV does (the review's stand-in did not, so every open looked like the first).
    const kvm = new Map<string, string>();
    const QUEUE = { get: async (k: string, t?: string) => { const v = kvm.get(k) ?? null; return t === 'json' && v != null ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kvm.set(k, v) };
    const platform = { env: { STORE: store, QUEUE, SYNC_OPEN: '1' } };
    let now = Date.UTC(2026, 9, 4, 12, 0, 1);
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const join = async (ip: string) => {
      const request = new Request('http://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token, create: false }) });
      return (await POST({ request, platform, getClientAddress: () => ip, url: new URL(request.url) } as never)).status;
    };
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) { statuses.push(await join(`2001:db8:7:${i.toString(16)}::1`)); now += 60_000; }
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(lists).toBe(20 + 1); // 20 pages of the log and one of photos, once
    now += 3_600_000;
    expect(await join('2001:db8:7:99::1')).toBe(200);
    expect(lists).toBe(2 * (20 + 1)); // over an hour later: listed again
    // The /48's window: one at four times the address's allowance, shared by all its /64s.
    resetRateLimits();
    kvm.set(`rl:sync:2001:db8:7::/48:${Math.floor(now / RATE.sync.windowMs)}`, String(RATE.sync.limit * NET_RATE_FACTOR));
    expect(await join('2001:db8:7:aa::1')).toBe(429);
  });
});

describe('readBody and a body that stalls after one byte', () => {
  it('holds about a megabyte, not the whole declared length, once a single byte has arrived', async () => {
    const { readBody } = await import('$lib/server/sync');
    let pull = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (pull++ === 0) c.enqueue(new Uint8Array(1)); /* then nothing: the client holds the connection */ } });
    const request = new Request('http://x/api/sync/photo/pabcdef', { method: 'PUT', body: stream, headers: { 'content-length': String(12 * 1024 * 1024) }, duplex: 'half' } as RequestInit);
    const before = process.memoryUsage().arrayBuffers;
    void readBody(request, 12 * 1024 * 1024, 'a photo').catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    const held = process.memoryUsage().arrayBuffers - before;
    expect(held).toBeLessThan(6 * 1024 * 1024); // the buffer starts at a megabyte and doubles as bytes arrive
  });
});

describe('the counter objects', () => {
  it('f: keys stop at the ceiling: storage for "vaults" is bounded by SYNC_VAULTS_MAX', async () => {
    const counters = countersNs(); const v = counters.get('vaults');
    for (let i = 0; i < 50; i++) await v.fill(`V${i}`, 10, 0);
    expect([...counters.objects.get('vaults')!.m.keys()].filter((k) => k.startsWith('f:')).length).toBe(10);
  });
  it("the day's ceiling (200) is not spent by empty vaults from 40 addresses or 10 IPv6 /48s: it is counted at a vault's first object", async () => {
    const counters = countersNs(); const v = counters.get('vaults');
    const day = '2026-10-04';
    let ok = 0;
    for (let a = 0; a < 40; a++) for (let i = 0; i < 5; i++) if ((await v.create(`198.51.100.${a}`, day, 5, 200, 2000, 0)) === 'ok') ok++;
    expect(ok).toBe(200);
    expect(counters.objects.get('vaults')!.m.get(`day:${day}`) ?? 0).toBe(0);
    expect(await v.create('203.0.113.9', day, 5, 200, 2000, 0)).toBe('ok'); // a real grower still makes a vault
    // The day's first objects spend it: the 201st vault to store something is refused, and so is a creation after that.
    for (let i = 0; i < 200; i++) expect(await v.fill(`FILLED${i}`, 2000, 0, day, 200)).toBe('counted');
    expect(await v.fill('FILLED200', 2000, 0, day, 200)).toBe('day');
    expect(await v.create('203.0.113.10', day, 5, 200, 2000, 0)).toBe('day');
    const c2 = countersNs(); const v2 = c2.get('vaults'); let ok6 = 0;
    for (let n = 0; n < 10; n++) for (let s = 0; s < 20; s++) if ((await v2.create(`2001:db8:${n}:${s}::/64`, day, 5, 200, 2000, 0, Date.now(), `2001:db8:${n}::/48`)) === 'ok') ok6++;
    expect(ok6).toBe(200); // each /48 makes four times one address's allowance
    expect(await v2.create('2001:db8:0:99::/64', day, 5, 200, 2000, 0, Date.now(), '2001:db8:0::/48')).toBe('address');
    expect(await v2.create('2001:db8:99:0::/64', day, 5, 200, 2000, 0, Date.now(), '2001:db8:99::/48')).toBe('ok');
  });
});

describe('the names route when the edge cache throws', () => {
  it('answers with a lookup rather than a 500', async () => {
    const { GET } = await import('../../src/routes/api/names/+server');
    const platform = { caches: { default: { match: async () => { throw new Error('cache unavailable'); }, put: async () => {} } }, env: {} };
    const url = new URL('http://x/api/names?q=copiapoa');
    const r = await Promise.resolve(GET({ url, platform, fetch: (async () => new Response('[]')) as typeof fetch, getClientAddress: () => '1.2.3.4' } as never)).then((res: Response) => res.status, (e: unknown) => String(e));
    expect(r).toBe(200);
  });
});
