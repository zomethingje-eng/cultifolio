/**
 * The sync engine end to end: the vault is an in-memory fake; the collection
 * store, the engine and the real route handlers run unmodified, wired
 * together through a fake fetch and a fake R2, so the outbox → server → pull
 * path under test is the real one.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode } from '$core/hlc';
import { deriveKeys, newVaultKey, sealJson, sha256hex } from '$lib/sync/crypto';

/* ------------------------------------------------------------------ fakes */

type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown>; photos: Map<string, { id: string; blob: Blob; thumb: Blob }> };
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map(), photos: new Map() });
let mem: Mem = newMem('dev0');

vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[], fromServer = false) => {
    for (const c of cs) {
      mem.changes.set(c.t, c);
      if (!fromServer) mem.outbox.add(c.t);
    }
  },
  outboxKeys: async () => [...mem.outbox],
  outboxAck: async (ts: string[]) => void ts.forEach((t) => mem.outbox.delete(t)),
  outboxFill: async () => {
    for (const t of mem.changes.keys()) mem.outbox.add(t);
    return mem.changes.size;
  },
  outboxClear: async () => mem.outbox.clear(),
  changesByKeys: async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => mem.device,
  requestPersistence: async () => true,
  putPhotoBlobs: async (p: { id: string; blob: Blob; thumb: Blob }) => void mem.photos.set(p.id, p),
  getPhotoBlobs: async (id: string) => mem.photos.get(id),
  deletePhotoBlobs: async (id: string) => void mem.photos.delete(id),
  photoBlobIds: async () => [...mem.photos.keys()],
  wipeVault: async () => {
    mem.changes.clear();
    mem.outbox.clear();
    mem.photos.clear();
  }
}));

/** Just enough of R2 for the routes: keys, bytes, upload times. */
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; uploaded: number; sha?: string }>();
  let clock = 1_000_000;
  return {
    objs,
    async put(key: string, body: unknown, opts?: { customMetadata?: Record<string, string> }) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: (clock += 1000), sha: opts?.customMetadata?.sha });
    },
    async head(key: string) {
      const o = objs.get(key);
      return o ? { customMetadata: o.sha ? { sha: o.sha } : {} } : null;
    },
    async get(key: string) {
      const o = objs.get(key);
      return o ? { body: o.body, json: async () => JSON.parse(new TextDecoder().decode(o.body)), arrayBuffer: async () => o.body.slice().buffer } : null;
    },
    async list(o: { prefix: string; limit?: number; cursor?: string }) {
      const keys = [...objs.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      const start = o.cursor ? Number(o.cursor) : 0;
      const page = keys.slice(start, start + (o.limit ?? 1000));
      const truncated = start + page.length < keys.length;
      return { objects: page.map((k) => ({ key: k, uploaded: new Date(objs.get(k)!.uploaded), size: objs.get(k)!.body.length })), truncated, cursor: truncated ? String(start + page.length) : undefined };
    }
  };
}

/** A fresh collection + engine (module singletons) for one "device", and the real route handlers behind global fetch. */
async function boot(m: Mem, r2: ReturnType<typeof fakeR2>) {
  mem = m;
  vi.resetModules();
  const routes = {
    vault: await import('../../src/routes/api/sync/vault/+server'),
    log: await import('../../src/routes/api/sync/log/+server'),
    batch: await import('../../src/routes/api/sync/log/[key]/+server'),
    photo: await import('../../src/routes/api/sync/photo/[id]/+server')
  };
  const platform = { env: { STORE: r2, SYNC_OPEN: '1' } } as unknown as App.Platform;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x');
    const request = new Request(url, init);
    calls.push(`${request.method} ${url.pathname}`);
    const ev = { request, url, platform, getClientAddress: () => '1.1.1.1', params: {} as Record<string, string> };
    try {
      let mm: RegExpExecArray | null;
      if (url.pathname === '/api/sync/vault') return await (routes.vault as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev);
      if (url.pathname === '/api/sync/log') return await (routes.log as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev);
      if ((mm = /^\/api\/sync\/log\/([^/]+)$/.exec(url.pathname))) return await routes.batch.GET({ ...ev, params: { key: mm[1] } } as never);
      if ((mm = /^\/api\/sync\/photo\/([^/]+)$/.exec(url.pathname))) return await (routes.photo as never as Record<string, (e: unknown) => Promise<Response>>)[request.method]({ ...ev, params: { id: mm[1] } });
      return new Response('nope', { status: 404 });
    } catch (e) {
      const err = e as { status?: number; body?: { message?: string } };
      if (err.status) return new Response(JSON.stringify(err.body ?? {}), { status: err.status });
      throw e;
    }
  }) as typeof fetch;
  const { collection } = await import('$lib/db/collection.svelte');
  const { sync } = await import('$lib/sync/engine.svelte');
  await collection.load();
  return { collection, sync, calls };
}

const KEY = newVaultKey();
const logKeys = (r2: ReturnType<typeof fakeR2>) => [...r2.objs.keys()].filter((k) => k.includes('/log/'));
const post = (keys: Awaited<ReturnType<typeof deriveKeys>>, name: string, body: Uint8Array) => fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { authorization: `Bearer ${keys.token}`, 'x-batch': name }, body: body as BodyInit });



describe('batches are named by content and acked only when the server holds those bytes', () => {
  it('an offline edit restored alongside synced changes still reaches every device', async () => {
    const r2 = fakeR2();
    // Device A edits offline (no sync yet): its change has the oldest HLC.
    const memA = newMem('aaaaaaaaaaaa');
    let A = await boot(memA, r2);
    const plantA = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    // Device B, later, makes changes and syncs; its last HLC leads the batch name.
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Ariocarpus fissuratus', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    expect(logKeys(r2)).toHaveLength(1);
    expect(logKeys(r2)[0]).toMatch(/\/log\/\d{13}-[0-9a-f]{4}-bbbbbbbbbbbb-[0-9a-f]{12}\.bin$/);
    // A restores B's backup (merge), then joins. Its outbox ends with B's last HLC, but the content differs, so the name differs.
    A = await boot(memA, r2);
    await A.collection.ingest([...memB.changes.values()]);
    await A.sync.setup(KEY, 'join');
    expect(memA.outbox.size).toBe(0);
    expect(logKeys(r2)).toHaveLength(2);
    const C = await boot(newMem('cccccccccccc'), r2);
    await C.sync.setup(KEY, 'join');
    expect(C.collection.accession(plantA.id)).toBeDefined();
  });
  it('the same batch pushed twice lands once; different bytes under a held name are refused with 409', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const name = logKeys(r2)[0].split('/log/')[1].slice(0, -4);
    const bytes = r2.objs.get(logKeys(r2)[0])!.body;
    let r = await post(keys, name, bytes);
    expect(await r.json()).toEqual({ stored: false, reason: 'already there' });
    r = await post(keys, name, new Uint8Array([1, 2, 3]));
    expect(r.status).toBe(409);
    expect(r2.objs.get(logKeys(r2)[0])!.body).toBe(bytes); // untouched
    // A batch written before hashes were kept (no metadata) is compared by its bytes.
    r2.objs.set(`vault/${keys.id}/log/1700000000000-0000-old.bin`, { body: new Uint8Array([9, 9]), uploaded: 5 });
    expect((await post(keys, '1700000000000-0000-old', new Uint8Array([9, 9]))).status).toBe(200);
    expect((await post(keys, '1700000000000-0000-old', new Uint8Array([9, 8]))).status).toBe(409);
    // The outbox re-filled and pushed again: a fresh seal is new bytes under a new name (the merge makes it harmless), and it is acked once stored.
    const n = logKeys(r2).length;
    await (await import('$lib/db/vault')).outboxFill();
    await B.sync.run();
    expect(logKeys(r2).length).toBe(n + 1);
    expect(mem.outbox.size).toBe(0);
  });
  it('the Worker refuses names that are not batch names, bad photo ids and wrong tokens before touching R2', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const h = { authorization: `Bearer ${keys.token}` };
    expect((await fetch(`/api/sync/log/..%2F..%2Fmeta.json?vault=${keys.id}`, { headers: h })).status).toBe(400);
    expect((await fetch(`/api/sync/photo/x?vault=${keys.id}`, { headers: h })).status).toBe(400);
    expect((await post(keys, '../x', new Uint8Array(3))).status).toBe(400);
    expect((await post(keys, '1700000000000-0000-dev-0123456789ab', new Uint8Array(3))).status).toBe(200);
    expect((await post(keys, '1700000000000-0000-dev-0123456789abc', new Uint8Array(3))).status).toBe(400);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`, { headers: { authorization: `Bearer ${'0'.repeat(64)}` } })).status).toBe(403);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`)).status).toBe(401);
    expect((await fetch(`/api/sync/vault`, { method: 'POST', body: JSON.stringify({ id: keys.id, token: '1'.repeat(64), create: true }) })).status).toBe(403);
    expect([...r2.objs.keys()].every((k) => k.startsWith(`vault/${keys.id}/`))).toBe(true);
    // An oversize body is refused from its declared length.
    const big = await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { ...h, 'x-batch': '1700000000000-0000-dev', 'content-length': String(17 * 1024 * 1024) }, body: new Uint8Array(3) as BodyInit });
    expect(big.status).toBe(413);
  });
});

describe('a batch that cannot be read is set aside, not a wall', () => {
  it('garbage bytes under a valid name (a token holder without the key) are quarantined and the good batch behind them arrives', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    expect((await post(keys, '1700000000000-0000-evil', crypto.getRandomValues(new Uint8Array(64)))).ok).toBe(true);
    const p = await B.collection.addAccession({ taxonName: 'Conophytum', acc: 'B-2' });
    await B.sync.run();
    expect(B.sync.quarantined.map((q) => q.key)).toEqual(['1700000000000-0000-evil']);
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.collection.accession(p.id)).toBeDefined();
    expect(D.sync.quarantined).toHaveLength(1);
    expect(D.sync.lastError).toBeNull();
    await D.sync.run(); // listed again inside the overlap window: still skipped, still one entry
    expect(D.sync.quarantined).toHaveLength(1);
  });
  it('a batch with a reserved field is refused whole: nothing of it is applied', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const changes = [
      { t: '1700000000000-0000-x', kind: 'accession', id: 'r1', field: 'taxonName', value: 'Sneaky' },
      { t: '1700000000000-0001-x', kind: 'accession', id: 'r1', field: 'id', value: 'r2' }
    ];
    await post(keys, '1700000000000-0001-x', await sealJson(keys, 'log', { v: 1, device: 'x', changes }));
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.sync.quarantined[0]?.error).toMatch(/reserved/);
    expect(D.collection.accession('r1')).toBeUndefined();
    expect(mem.changes.size).toBe(0);
  });
});

describe('what the server refuses from this device does not stop it receiving', () => {
  it('an oversize photo blob is noted and skipped; pull still runs', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    const p = await B.collection.addAccession({ taxonName: 'Aloe polyphylla', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    const big = new Blob([new Uint8Array(13 * 1024 * 1024)], { type: 'image/jpeg' });
    const pid = 'pabcdef123456';
    memD.photos.set(pid, { id: pid, blob: big, thumb: big.slice(0, 10) });
    const own = await D.collection.addAccession({ taxonName: 'Aloe', acc: 'D-1' });
    await D.collection.put('photo', pid, { acc: own.id, d: '2026-01-01', w: 1, h: 1, bytes: 13 });
    await D.sync.setup(KEY, 'join');
    expect(D.sync.refused.map((r) => r.key)).toEqual([pid]);
    expect(D.calls.filter((c) => c === 'GET /api/sync/log').length).toBeGreaterThan(0);
    expect(D.collection.accession(p.id)).toBeDefined();
    expect(D.sync.lastError).toBeNull();
  });
  it('a batch the server answers 400 to is halved down to the change at fault, which is noted; the outbox keeps only that', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    // Wedge a change with a name the server will not take.
    memB.changes.set('bogus', { t: 'bogus', kind: 'accession', id: 'r9', field: 'notes', value: 'x' });
    memB.outbox.add('bogus');
    await B.sync.setup(KEY, 'create');
    expect(B.sync.refused).toHaveLength(1);
    expect(memB.outbox.has('bogus')).toBe(true);
    expect(memB.outbox.size).toBe(1); // everything else went
    expect(B.calls.filter((c) => c === 'GET /api/sync/log').length).toBeGreaterThan(0);
  });
});

describe('photos', () => {
  it('a photo is bound to its id and its record: one served under another id, or with other pixels, is set aside', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, ...new Array(n).fill(n)]);
    for (const [id, n] of [['pone000000001', 1], ['ptwo000000002', 2]] as const) {
      memB.photos.set(id, { id, blob: new Blob([jpeg(n)]), thumb: new Blob([jpeg(3)]) });
      await B.collection.put('photo', id, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 4, sha: await sha256hex(jpeg(n)) });
    }
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    // The server swaps the two photos.
    const k1 = `vault/${keys.id}/photo/pone000000001.bin`, k2 = `vault/${keys.id}/photo/ptwo000000002.bin`;
    const o1 = r2.objs.get(k1)!, o2 = r2.objs.get(k2)!;
    r2.objs.set(k1, o2);
    r2.objs.set(k2, o1);
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    expect(memD.photos.size).toBe(0);
    expect(D.sync.quarantined.map((q) => q.key).sort()).toEqual(['pone000000001', 'ptwo000000002']);
    // Put back: they arrive, and the sha is checked against the record.
    r2.objs.set(k1, o1);
    r2.objs.set(k2, o2);
    D.sync['meta']!.quarantined = [];
    await D.sync.run();
    expect(memD.photos.size).toBe(2);
  });
});
