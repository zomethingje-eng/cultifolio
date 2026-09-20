import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listBatches, parseAfter, storeCounted, storeOnce, batchMeta, readBody, batchKey, recount, vaultBytes, vaultIdFor, ensureVault, MAX_BYTES, MAX_IP_BYTES_PER_DAY, MAX_LIST_PAGES, META_FLUSH_BYTES, META_FLUSH_MS, OVERLAP_MS, allowCreation, rateLimit, resetRateLimits, resetMetaFlush, resetKvWarning, tooMany, VaultFull, DayQuota, type VaultMeta } from '$lib/server/sync';
import { deriveKeys, newVaultKey } from '$lib/sync/crypto';

/** Just enough of R2 for the sync store: keys, bytes, upload times we control. */
function fakeR2(now = { t: 1_000_000 }) {
  const objs = new Map<string, { body: Uint8Array; uploaded: number; sha?: string; md?: Record<string, string> }>();
  const r2 = {
    async put(key: string, body: unknown, opts?: { customMetadata?: Record<string, string> }) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: now.t, sha: opts?.customMetadata?.sha, md: opts?.customMetadata });
    },
    async head(key: string) {
      const o = objs.get(key);
      return o ? { customMetadata: o.md ?? (o.sha ? { sha: o.sha } : {}) } : null;
    },
    async get(key: string) {
      const o = objs.get(key);
      return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)), arrayBuffer: async () => o.body.slice().buffer } : null;
    },
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      const start = o.cursor ? Number(o.cursor) : 0;
      const page = keys.slice(start, start + (o.limit ?? 1000));
      const truncated = start + page.length < keys.length;
      return { objects: page.map((k) => ({ key: k, uploaded: new Date(objs.get(k)!.uploaded), size: objs.get(k)!.body.length })), truncated, cursor: truncated ? String(start + page.length) : undefined };
    },
    objs
  };
  return r2;
}
const meta = (): VaultMeta => ({ tokenHash: 'h', created: 'c', entitlement: 'open', bytes: 0 });

/** Just enough of KV: strings (and 'json' reads), a put we can make fail, every write counted. */
function fakeKV() {
  const m = new Map<string, string>();
  const kv = {
    puts: 0,
    fail: false,
    async get(k: string, type?: string) {
      const v = m.get(k) ?? null;
      return type === 'json' && v != null ? JSON.parse(v) : v;
    },
    async put(k: string, v: string) {
      kv.puts++;
      if (kv.fail) throw new Error('kv: too many writes');
      m.set(k, v);
    },
    m
  };
  return kv;
}
const T0 = Date.UTC(2026, 8, 20, 12, 0, 0);

describe('batch listing is by arrival, not by name', () => {
  it('a batch with an older HLC that arrives later is still handed out', async () => {
    const now = { t: 1000 };
    const r2 = fakeR2(now);
    // Device A pushes t2 at arrival 1000; a client pulls and moves its cursor to 1000.
    await r2.put('vault/v/log/2000-0000-a.bin', new Uint8Array(3));
    let l = await listBatches(r2 as never, 'v', null);
    expect(l.batches.map((b) => b.key)).toEqual(['2000-0000-a']);
    const cursor = l.batches[0].at;
    // Device B, which edited offline at t1 (an older HLC), uploads later at arrival 1000 + 5 min.
    now.t = 1000 + 300_000;
    await r2.put('vault/v/log/1000-0000-b.bin', new Uint8Array(3));
    l = await listBatches(r2 as never, 'v', cursor);
    expect(l.batches.map((b) => b.key)).toContain('1000-0000-b');
  });
  it('re-reads a minute of overlap so a put that committed late is not missed, and pages by arrival', async () => {
    const now = { t: 10_000_000 };
    const r2 = fakeR2(now);
    for (let i = 0; i < 5; i++) {
      now.t = 10_000_000 + i * 1000;
      await r2.put(`vault/v/log/${9000 - i}-0000-x.bin`, new Uint8Array(1)); // names descend while arrivals ascend
    }
    const l = await listBatches(r2 as never, 'v', null, 3);
    expect(l.batches.map((b) => b.key)).toEqual(['9000-0000-x', '8999-0000-x', '8998-0000-x']);
    expect(l.more).toBe(true);
    const later = await listBatches(r2 as never, 'v', 10_000_000 + 4000 + OVERLAP_MS - 1);
    expect(later.batches.map((b) => b.key)).toEqual(['8996-0000-x']); // the one inside the overlap window
  });
  it('501 batches that arrived in the same millisecond: the cursor is (arrival, key), so the second page is the one left over, not the same 500 again', async () => {
    const now = { t: 5_000_000 };
    const r2 = fakeR2(now);
    for (let i = 0; i < 501; i++) await r2.put(`vault/v/log/${String(1700000000000 + i)}-0000-x.bin`, new Uint8Array(1));
    const p1 = await listBatches(r2 as never, 'v', null);
    expect(p1.batches).toHaveLength(500);
    expect(p1.more).toBe(true);
    expect(p1.next).toEqual({ at: 5_000_000, key: '1700000000499-0000-x' });
    // The old client's move, a timestamp alone, would list the same 500 for ever.
    const stuck = await listBatches(r2 as never, 'v', p1.batches[499].at);
    expect(stuck.batches[0].key).toBe('1700000000000-0000-x');
    // The new one continues from the pair.
    const p2 = await listBatches(r2 as never, 'v', null, 500, p1.next!);
    expect(p2.batches.map((b) => b.key)).toEqual(['1700000000500-0000-x']);
    expect(p2.more).toBe(false);
    expect(p2.next).toBeUndefined();
    // `after` applies no overlap: a batch that arrived earlier than the pair is not re-listed.
    now.t = 4_000_000;
    await r2.put('vault/v/log/1600000000000-0000-y.bin', new Uint8Array(1));
    expect((await listBatches(r2 as never, 'v', null, 500, p1.next!)).batches.map((b) => b.key)).toEqual(['1700000000500-0000-x']);
    // The same arrival, a later key, is listed; the same arrival, an earlier key, is not.
    now.t = 5_000_000;
    await r2.put('vault/v/log/1700000000499-0001-x.bin', new Uint8Array(1));
    await r2.put('vault/v/log/1700000000498-0009-x.bin', new Uint8Array(1));
    expect((await listBatches(r2 as never, 'v', null, 500, p1.next!)).batches.map((b) => b.key)).toEqual(['1700000000499-0001-x', '1700000000500-0000-x']);
  });
  it('parseAfter: absent is null, well-formed is the pair, anything else is 400', () => {
    expect(parseAfter(null)).toBeNull();
    expect(parseAfter('')).toBeNull();
    expect(parseAfter('5000000:1700000000499-0000-x')).toEqual({ at: 5_000_000, key: '1700000000499-0000-x' });
    for (const bad of ['5000000', 'x:y', '5000000:', ':abc', '5000000:a b']) expect(() => parseAfter(bad)).toThrow();
  });
});

describe('storage accounting', () => {
  it('reserves before writing: a full vault is refused as 507 with what it holds and the limit; nothing lands and the total does not move', async () => {
    const r2 = fakeR2();
    const m = meta();
    m.bytes = MAX_BYTES - 1;
    const p = storeCounted(r2 as never, 'v', m, 'vault/v/log/x.bin', new Uint8Array(2));
    await expect(p).rejects.toBeInstanceOf(VaultFull);
    await expect(p).rejects.toMatchObject({ status: 507, bytes: MAX_BYTES - 1, limit: MAX_BYTES });
    const res = (await p.then(() => null, (e: VaultFull) => e))!.response();
    expect(res.status).toBe(507);
    expect(await res.json()).toEqual({ error: 'vault full', bytes: MAX_BYTES - 1, limit: MAX_BYTES });
    expect(r2.objs.has('vault/v/log/x.bin')).toBe(false);
    expect(m.bytes).toBe(MAX_BYTES - 1);
  });
  it('releases the reservation if the write fails', async () => {
    const r2 = fakeR2();
    const m = meta();
    // The reservation (a meta write) succeeds; the object put fails.
    const orig = r2.put.bind(r2);
    r2.put = async (k: string, b: unknown) => {
      if (k.endsWith('/log/y.bin')) throw new Error('r2 down');
      return orig(k, b);
    };
    await expect(storeCounted(r2 as never, 'v', m, 'vault/v/log/y.bin', new Uint8Array(10))).rejects.toThrow(/r2 down/);
    expect(m.bytes).toBe(0);
    expect(r2.objs.has('vault/v/log/y.bin')).toBe(false);
  });
  it('recount puts a drifted total right from the listing', async () => {
    const r2 = fakeR2();
    const m = meta();
    await r2.put('vault/v/log/a.bin', new Uint8Array(7));
    await r2.put('vault/v/photo/p1.bin', new Uint8Array(5));
    m.bytes = 3; // drifted
    expect(await recount(r2 as never, 'v', m)).toBe(12);
    expect(m.bytes).toBe(12);
    expect(r2.objs.has('vault/v/meta.json')).toBe(true);
  });
});

describe('vault creation is bounded per address', () => {
  beforeEach(() => resetKvWarning());
  it('allows the cap and refuses the next', async () => {
    const kv = fakeKV();
    let ok = 0;
    for (let i = 0; i < 25; i++) if (await allowCreation(kv as never, '1.2.3.4')) ok++;
    expect(ok).toBe(20);
    expect(await allowCreation(kv as never, '5.6.7.8')).toBe(true);
  });
  it('FAILS CLOSED: no KV bound refuses every creation and logs once; a KV that throws refuses too', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await allowCreation(undefined, '1.2.3.4')).toBe(false);
    expect(await allowCreation(undefined, '1.2.3.4')).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
    const kv = fakeKV();
    kv.fail = true;
    expect(await allowCreation(kv as never, '9.9.9.9')).toBe(false);
    err.mockRestore();
  });
  it('the id must be the one the token derives, exactly as the client derives it', async () => {
    const keys = await deriveKeys(newVaultKey());
    expect(await vaultIdFor(keys.token)).toBe(keys.id);
    const r2 = fakeR2();
    await expect(ensureVault(r2 as never, keys.id, keys.token, true)).resolves.toMatchObject({ created: true });
    const other = await deriveKeys(newVaultKey());
    // An existing vault with a token that is not its own: 403, as ever (the client has words for it).
    await expect(ensureVault(r2 as never, keys.id, other.token, true)).rejects.toMatchObject({ status: 403 });
    // A new name with a token that does not derive it: 400, and nothing is written.
    await expect(ensureVault(r2 as never, other.id, keys.token, true)).rejects.toMatchObject({ status: 400 });
    expect(r2.objs.has(`vault/${other.id}/meta.json`)).toBe(false);
    // The right pair again: opened, not remade.
    await expect(ensureVault(r2 as never, keys.id, keys.token, true)).resolves.toMatchObject({ created: false });
  });
});

describe('the live byte counter in KV', () => {
  beforeEach(() => resetMetaFlush());
  const q = (kv: ReturnType<typeof fakeKV>, ip = '1.2.3.4', now = T0) => ({ kv: kv as never, ip, now });
  it('counts each stored object and refuses at the limit with 507; the meta snapshot is not written per object', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    const m = meta();
    await storeCounted(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array(10), undefined, {}, q(kv));
    expect(await kv.get('bytes:v', 'json')).toEqual({ bytes: 10, day: '2026-09-20' });
    const metaWrites = () => [...r2.objs.keys()].filter((k) => k.endsWith('meta.json')).length;
    // The first object flushes the snapshot (nothing flushed yet this isolate); the next ones inside 30 s and 16 MB do not.
    expect(metaWrites()).toBe(1);
    r2.objs.delete('vault/v/meta.json');
    for (let i = 0; i < 5; i++) await storeCounted(r2 as never, 'v', m, `vault/v/log/b${i}.bin`, new Uint8Array(10), undefined, {}, q(kv, '1.2.3.4', T0 + 1000 * i));
    expect(metaWrites()).toBe(0);
    expect(await kv.get('bytes:v', 'json')).toEqual({ bytes: 60, day: '2026-09-20' });
    expect(m.bytes).toBe(60); // in memory it follows; the snapshot lags
    // Past 30 s, or across a 16 MB step, it is flushed.
    await storeCounted(r2 as never, 'v', m, 'vault/v/log/c.bin', new Uint8Array(10), undefined, {}, q(kv, '1.2.3.4', T0 + META_FLUSH_MS));
    expect(metaWrites()).toBe(1);
    expect(JSON.parse(new TextDecoder().decode(r2.objs.get('vault/v/meta.json')!.body)).bytes).toBe(70);
    r2.objs.delete('vault/v/meta.json');
    kv.m.set('bytes:v', JSON.stringify({ bytes: META_FLUSH_BYTES - 5, day: '2026-09-20' }));
    await storeCounted(r2 as never, 'v', m, 'vault/v/log/d.bin', new Uint8Array(10), undefined, {}, q(kv, '1.2.3.4', T0 + META_FLUSH_MS + 1));
    expect(metaWrites()).toBe(1);
    // At the limit: 507 with the live figure; nothing lands, the counter does not move.
    kv.m.set('bytes:v', JSON.stringify({ bytes: MAX_BYTES - 1, day: '2026-09-20' }));
    const p = storeCounted(r2 as never, 'v', m, 'vault/v/log/e.bin', new Uint8Array(2), undefined, {}, q(kv));
    await expect(p).rejects.toBeInstanceOf(VaultFull);
    await expect(p).rejects.toMatchObject({ status: 507, bytes: MAX_BYTES - 1, limit: MAX_BYTES });
    expect(r2.objs.has('vault/v/log/e.bin')).toBe(false);
    expect(await kv.get('bytes:v', 'json')).toEqual({ bytes: MAX_BYTES - 1, day: '2026-09-20' });
  });
  it('a failed write puts the counter back; a KV write that fails does not stop the store (the day\'s listing puts it right)', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    const m = meta();
    const orig = r2.put.bind(r2);
    r2.put = async (k: string, b: unknown, o?: never) => {
      if (k.endsWith('/log/y.bin')) throw new Error('r2 down');
      return orig(k, b, o);
    };
    await expect(storeCounted(r2 as never, 'v', m, 'vault/v/log/y.bin', new Uint8Array(10), undefined, {}, q(kv))).rejects.toThrow(/r2 down/);
    expect(await kv.get('bytes:v', 'json')).toEqual({ bytes: 0, day: '2026-09-20' });
    kv.fail = true;
    await storeCounted(r2 as never, 'v', m, 'vault/v/log/z.bin', new Uint8Array(10), undefined, {}, q(kv));
    expect(r2.objs.has('vault/v/log/z.bin')).toBe(true);
  });
  it('the counter is put right from the R2 listing when absent, on another day, and on a vault open', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    const m = meta();
    await r2.put('vault/v/log/a.bin', new Uint8Array(7));
    await r2.put('vault/v/photo/p1.bin', new Uint8Array(5));
    expect(await vaultBytes(r2 as never, kv as never, 'v', m, T0)).toBe(12); // absent: listed
    expect(m.bytes).toBe(12);
    kv.m.set('bytes:v', JSON.stringify({ bytes: 999, day: '2026-09-20' }));
    expect(await vaultBytes(r2 as never, kv as never, 'v', m, T0)).toBe(999); // same day: trusted
    expect(await vaultBytes(r2 as never, kv as never, 'v', m, T0 + 86_400_000)).toBe(12); // next day: listed again
    kv.m.set('bytes:v', JSON.stringify({ bytes: 999, day: '2026-09-21' }));
    expect(await vaultBytes(r2 as never, kv as never, 'v', m, T0 + 86_400_000, true)).toBe(12); // vault open: forced
  });
  it('an address has a day\'s allowance across its vaults: 429 with Retry-After to midnight UTC, nothing stored', async () => {
    const r2 = fakeR2();
    const kv = fakeKV();
    kv.m.set('ipbytes:1.2.3.4:2026-09-20', String(MAX_IP_BYTES_PER_DAY - 5));
    await storeCounted(r2 as never, 'v', meta(), 'vault/v/log/a.bin', new Uint8Array(5), undefined, {}, q(kv));
    expect(kv.m.get('ipbytes:1.2.3.4:2026-09-20')).toBe(String(MAX_IP_BYTES_PER_DAY));
    const p = storeCounted(r2 as never, 'w', meta(), 'vault/w/log/a.bin', new Uint8Array(1), undefined, {}, q(kv));
    await expect(p).rejects.toBeInstanceOf(DayQuota);
    const res = (await p.then(() => null, (e: DayQuota) => e))!.response();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(12 * 3600));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/allowance/), bytes: MAX_IP_BYTES_PER_DAY, limit: MAX_IP_BYTES_PER_DAY });
    expect(r2.objs.has('vault/w/log/a.bin')).toBe(false);
    // Another address is unaffected.
    await storeCounted(r2 as never, 'w', meta(), 'vault/w/log/a.bin', new Uint8Array(1), undefined, {}, q(kv, '5.6.7.8'));
  });
  it('a listing walks at most MAX_LIST_PAGES pages: a vault past that is refused with 503, not listed short', async () => {
    const r2 = fakeR2();
    const pages: number[] = [];
    const orig = r2.list.bind(r2);
    let n = 0;
    r2.list = async (o: { prefix: string; limit?: number; cursor?: string }) => {
      pages.push(++n);
      const r = await orig(o);
      return { ...r, truncated: true, cursor: 'x' }; // never ends
    };
    await expect(listBatches(r2 as never, 'v', null)).rejects.toMatchObject({ status: 503 });
    expect(pages).toHaveLength(MAX_LIST_PAGES);
  });
});

describe('the rate limit', () => {
  beforeEach(() => {
    resetRateLimits();
    resetKvWarning();
  });
  it('trips at the limit with Retry-After to the end of the window, and recovers in the next window', async () => {
    const kv = fakeKV();
    let ok = 0;
    for (let i = 0; i < 305; i++) if ((await rateLimit(kv as never, 'names', '1.2.3.4', T0 + i)).ok) ok++;
    expect(ok).toBe(300);
    const r = await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 1000);
    expect(r).toEqual({ ok: false, retryAfter: 599 });
    expect((await rateLimit(kv as never, 'names', '5.6.7.8', T0 + 1000)).ok).toBe(true);
    expect((await rateLimit(kv as never, 'sync', '1.2.3.4', T0 + 1000)).ok).toBe(true); // another bucket
    expect((await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 600_000)).ok).toBe(true); // next window
    // The count reached KV at the limit, so a fresh isolate refuses at once.
    resetRateLimits();
    expect((await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 2000)).ok).toBe(false);
  });
  it('folds into KV every few seconds, not per request, and reads what another isolate wrote', async () => {
    const kv = fakeKV();
    for (let i = 0; i < 50; i++) await rateLimit(kv as never, 'names', '1.2.3.4', T0 + i);
    expect(kv.puts).toBe(0);
    await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 5000);
    expect(kv.puts).toBe(1);
    expect(kv.m.get(`rl:names:1.2.3.4:${Math.floor(T0 / 600_000)}`)).toBe('51');
    kv.m.set(`rl:names:1.2.3.4:${Math.floor(T0 / 600_000)}`, '299');
    resetRateLimits();
    expect((await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 6000)).ok).toBe(true);
    expect((await rateLimit(kv as never, 'names', '1.2.3.4', T0 + 6000)).ok).toBe(false);
  });
  it('fails open without KV (counting in memory alone) and on a KV error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await rateLimit(undefined, 'sync', '1.2.3.4', T0)).ok).toBe(true);
    const kv = fakeKV();
    kv.fail = true;
    for (let i = 0; i < 10; i++) expect((await rateLimit(kv as never, 'sync', '1.2.3.4', T0 + i * 5000)).ok).toBe(true);
    err.mockRestore();
  });
  it('tooMany is plain JSON with Retry-After and no-store', async () => {
    const r = tooMany('too many', 42);
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('42');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ error: 'too many', retryAfter: 42 });
  });
});

describe('a name stands for one content', () => {
  it('storeOnce: stored, then same, then different; an old object without a recorded hash is compared by bytes', async () => {
    const r2 = fakeR2();
    const m = meta();
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([1, 2]))).toBe('stored');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([1, 2]))).toBe('same');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([1, 3]))).toBe('different');
    expect(r2.objs.get('vault/v/log/a.bin')!.body).toEqual(new Uint8Array([1, 2]));
    expect(m.bytes).toBe(2);
    r2.objs.set('vault/v/log/old.bin', { body: new Uint8Array([7]), uploaded: 1 });
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/old.bin', new Uint8Array([7]))).toBe('same');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/old.bin', new Uint8Array([8]))).toBe('different');
  });
  it('a re-seal of the same batch (same plaintext hash, same device) is "same"; a different device, a different plaintext, or a batch stored without the hash is "different"', async () => {
    const r2 = fakeR2();
    const m = meta();
    const plain = 'a'.repeat(64), other = 'b'.repeat(64);
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([1, 2]), { plain, device: 'dev1' })).toBe('stored');
    expect(r2.objs.get('vault/v/log/a.bin')!.body).toEqual(new Uint8Array([1, 2]));
    // Fresh bytes (a new IV), same plaintext, same device: already there; the first copy is kept and nothing is counted twice.
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([3, 4]), { plain, device: 'dev1' })).toBe('same');
    expect(r2.objs.get('vault/v/log/a.bin')!.body).toEqual(new Uint8Array([1, 2]));
    expect(m.bytes).toBe(2);
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([3, 4]), { plain, device: 'dev2' })).toBe('different');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([3, 4]), { plain: other, device: 'dev1' })).toBe('different');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/a.bin', new Uint8Array([3, 4]))).toBe('different'); // an older client: bytes only
    // Stored by an older client (no plaintext hash kept): a new client's re-seal cannot match it.
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/b.bin', new Uint8Array([5]))).toBe('stored');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/b.bin', new Uint8Array([6]), { plain, device: 'dev1' })).toBe('different');
    expect(await storeOnce(r2 as never, 'v', m, 'vault/v/log/b.bin', new Uint8Array([5]), { plain, device: 'dev1' })).toBe('same');
  });
  it('the push headers: absent is fine, malformed is 400', () => {
    const req = (h: Record<string, string>) => new Request('http://x/', { headers: h });
    expect(batchMeta(req({}))).toEqual({ plain: undefined, device: undefined });
    expect(batchMeta(req({ 'x-batch-plain': 'f'.repeat(64), 'x-device': 'abc123' }))).toEqual({ plain: 'f'.repeat(64), device: 'abc123' });
    expect(() => batchMeta(req({ 'x-batch-plain': 'zz' }))).toThrow();
    expect(() => batchMeta(req({ 'x-device': 'Not-A-Device' }))).toThrow();
  });
  it('batch names: an HLC, with or without a 12-hex content hash; the counter may be four to six digits', () => {
    expect(batchKey('v', '1700000000000-0000-dev')).toBe('vault/v/log/1700000000000-0000-dev.bin');
    expect(batchKey('v', '1700000000000-0f0000-dev-0123456789ab')).toMatch(/dev-0123456789ab\.bin$/);
    for (const bad of ['1700000000000-000-dev', '1700000000000-0000-dev-0123', '1700000000000-0000-dev-0123456789abc', '../x', '1700000000000-0000-Dev']) expect(() => batchKey('v', bad)).toThrow();
  });
  it('readBody refuses an oversize body from its declared length, and an empty one', async () => {
    const req = (len: string | null, body: Uint8Array) => new Request('http://x/', { method: 'POST', headers: len ? { 'content-length': len } : {}, body: body as BodyInit });
    await expect(readBody(req(String(10 * 1024 * 1024), new Uint8Array(1)), 1024, 'a batch')).rejects.toMatchObject({ status: 413 });
    await expect(readBody(req(null, new Uint8Array(0)), 1024, 'a batch')).rejects.toMatchObject({ status: 400 });
    await expect(readBody(req(null, new Uint8Array(2000)), 1024, 'a batch')).rejects.toMatchObject({ status: 413 });
    expect((await readBody(req(null, new Uint8Array(3)), 1024, 'a batch')).length).toBe(3);
  });
});
