import { describe, it, expect } from 'vitest';
import { listBatches, parseAfter, storeCounted, storeOnce, batchMeta, readBody, batchKey, recount, MAX_BYTES, OVERLAP_MS, allowCreation, VaultFull, type VaultMeta } from '$lib/server/sync';

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
  it('allows the cap and refuses the next', async () => {
    const kv = new Map<string, string>();
    const fake = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) };
    let ok = 0;
    for (let i = 0; i < 25; i++) if (await allowCreation(fake as never, '1.2.3.4')) ok++;
    expect(ok).toBe(20);
    expect(await allowCreation(fake as never, '5.6.7.8')).toBe(true);
    expect(await allowCreation(undefined, '1.2.3.4')).toBe(true); // no KV bound: no cap
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
