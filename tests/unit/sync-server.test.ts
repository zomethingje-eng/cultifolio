import { describe, it, expect } from 'vitest';
import { listBatches, storeCounted, recount, MAX_BYTES, OVERLAP_MS, allowCreation, type VaultMeta } from '$lib/server/sync';

/** Just enough of R2 for the sync store: keys, bytes, upload times we control. */
function fakeR2(now = { t: 1_000_000 }) {
  const objs = new Map<string, { body: Uint8Array; uploaded: number }>();
  const r2 = {
    async put(key: string, body: unknown) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: now.t });
    },
    async head(key: string) {
      return objs.has(key) ? {} : null;
    },
    async get(key: string) {
      const o = objs.get(key);
      return o ? { json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null;
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
});

describe('storage accounting', () => {
  it('reserves before writing: a refused upload never lands and the total does not move', async () => {
    const r2 = fakeR2();
    const m = meta();
    m.bytes = MAX_BYTES - 1;
    await expect(storeCounted(r2 as never, 'v', m, 'vault/v/log/x.bin', new Uint8Array(2))).rejects.toMatchObject({ status: 413 });
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
