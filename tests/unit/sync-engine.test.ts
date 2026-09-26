/**
 * The sync engine end to end: the vault is an in-memory fake; the collection
 * store, the engine and the real route handlers run unmodified, wired
 * together through a fake fetch and a fake R2, so the outbox → server → pull
 * path under test is the real one.
 */
import { hlcWall } from '$core/log';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, MAX_AHEAD_MS } from '$core/hlc';
import { batchFingerprint, deriveKeys, newVaultKey, sealJson, sha256hex } from '$lib/sync/crypto';
import { MAX_BYTES } from '$lib/server/sync';

/* ------------------------------------------------------------------ fakes */

/**
 * The vault fake has a failure path: `failAppend` and `failPutPhoto`, when set,
 * decide per write whether IndexedDB refuses it (a full phone), and a refused
 * write stores nothing, as the real one does.
 */
const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown>; photos: Map<string, { id: string; blob: Blob; thumb: Blob }>; failAppend?: (cs: Change[], fromServer: boolean) => boolean; failPutPhoto?: (id: string) => boolean };
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map(), photos: new Map() });
let mem: Mem = newMem('dev0');

vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[], fromServer = false) => {
    if (mem.failAppend?.(cs, fromServer)) throw quota();
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
  putPhotoBlobs: async (p: { id: string; blob: Blob; thumb: Blob }) => {
    if (mem.failPutPhoto?.(p.id)) throw quota();
    mem.photos.set(p.id, p);
  },
  getPhotoBlobs: async (id: string) => mem.photos.get(id),
  deletePhotoBlobs: async (id: string) => void mem.photos.delete(id),
  photoBlobIds: async () => [...mem.photos.keys()],
  wipeVault: async () => {
    mem.changes.clear();
    mem.outbox.clear();
    mem.photos.clear();
  }
};
  // The claiming write of the real vault, over the same in-memory log: `build` sees the numbers the caller knows.
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.announceSyncForgotten = () => {};
  return m;
});

/** Just enough of R2 for the routes: keys, bytes, upload times. */
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; uploaded: number; sha?: string; md?: Record<string, string> }>();
  let clock = 1_000_000;
  return {
    objs,
    async put(key: string, body: unknown, opts?: { customMetadata?: Record<string, string> }) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: (clock += 1000), sha: opts?.customMetadata?.sha, md: opts?.customMetadata });
    },
    async head(key: string) {
      const o = objs.get(key);
      return o ? { customMetadata: o.md ?? (o.sha ? { sha: o.sha } : {}) } : null;
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

let kv = new Map<string, string>();

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
  // A KV for the counters and the rate limit: without one the Worker refuses every creation (finding 39a).
  kv = new Map<string, string>();
  const kvm = kv;
  const QUEUE = { get: async (k: string, type?: string) => (type === 'json' ? JSON.parse(kvm.get(k) ?? 'null') : (kvm.get(k) ?? null)), put: async (k: string, v: string) => void kvm.set(k, v) };
  const platform = { env: { STORE: r2, QUEUE, SYNC_OPEN: '1' } } as unknown as App.Platform;
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
const post = (keys: Awaited<ReturnType<typeof deriveKeys>>, name: string, body: Uint8Array, extra: Record<string, string> = {}) => fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { authorization: `Bearer ${keys.token}`, 'x-batch': name, ...extra }, body: body as BodyInit });
const metaOf = async (r2: ReturnType<typeof fakeR2>) => JSON.parse(new TextDecoder().decode(r2.objs.get(`vault/${(await deriveKeys(KEY)).id}/meta.json`)!.body)) as { bytes: number };
/** Make the vault (nearly) full on the server, as photos from another device would. */
async function fillVault(r2: ReturnType<typeof fakeR2>, bytes = MAX_BYTES - 10) {
  const key = `vault/${(await deriveKeys(KEY)).id}/meta.json`;
  const meta = await metaOf(r2);
  meta.bytes = bytes;
  r2.objs.set(key, { body: new TextEncoder().encode(JSON.stringify(meta)), uploaded: 1 });
  // The live figure the Worker checks against is the KV counter; the meta is only its snapshot.
  kv.set(`bytes:${(await deriveKeys(KEY)).id}`, JSON.stringify({ bytes, day: new Date().toISOString().slice(0, 10) }));
}

/** A device that already holds a key, as the layout boots it: load, then init picks the key up. */
async function reboot(m: Mem, r2: ReturnType<typeof fakeR2>) {
  const X = await boot(m, r2);
  await X.sync.init();
  return X;
}

afterEach(() => vi.useRealTimers());

/**
 * Whether the collection's own fold passes the hold to apply() (the call-site
 * change in collection.svelte.ts that goes with the engine's held changes).
 * The two assertions below that need it are gated on this rather than failed,
 * so they switch on the moment that line lands.
 */
const collectionHolds = await (async () => {
  const m = newMem('zzzzzzzzzzzz');
  const t = hlcEncode({ wall: Date.now() + 86_400_000, count: 0, device: 'yyyyyyyyyyyy' });
  m.changes.set(t, { t, kind: 'accession', id: 'probe', field: 'taxonName', value: 'x' });
  const X = await boot(m, fakeR2());
  return X.collection.accession('probe') === undefined;
})();

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
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const name = logKeys(r2)[0].split('/log/')[1].slice(0, -4);
    const bytes = r2.objs.get(logKeys(r2)[0])!.body;
    // The name is the hour of the last edit, a fixed counter, the device, and twelve digits of a keyed fingerprint of the
    // changes as JSON: the server learns the hour and the device, never the millisecond, and holds no plain hash (round seven, 15).
    const changes = [...memB.changes.keys()].sort().map((t) => memB.changes.get(t));
    const plain = await batchFingerprint(keys, new TextEncoder().encode(JSON.stringify(changes)));
    expect(plain).not.toBe(await sha256hex(new TextEncoder().encode(JSON.stringify(changes))));
    const hour = Math.floor(hlcWall(changes[changes.length - 1]!.t) / 3600_000) * 3600_000;
    expect(name).toBe(`${hour}-0000-bbbbbbbbbbbb-${plain.slice(0, 12)}`);
    expect(r2.objs.get(logKeys(r2)[0])!.md).toMatchObject({ plain, device: 'bbbbbbbbbbbb' });
    let r = await post(keys, name, bytes);
    expect(await r.json()).toEqual({ stored: false, reason: 'already there' });
    r = await post(keys, name, new Uint8Array([1, 2, 3]));
    expect(r.status).toBe(409);
    // Fresh bytes with the plaintext hash from another device: still 409. From the same device: already there.
    expect((await post(keys, name, new Uint8Array([1, 2, 3]), { 'x-batch-plain': plain, 'x-device': 'cccccccccccc' })).status).toBe(409);
    expect(await (await post(keys, name, new Uint8Array([1, 2, 3]), { 'x-batch-plain': plain, 'x-device': 'bbbbbbbbbbbb' })).json()).toEqual({ stored: false, reason: 'already there' });
    expect(r2.objs.get(logKeys(r2)[0])!.body).toBe(bytes); // untouched
    // A batch written before hashes were kept (no metadata) is compared by its bytes.
    r2.objs.set(`vault/${keys.id}/log/1700000000000-0000-old.bin`, { body: new Uint8Array([9, 9]), uploaded: 5 });
    expect((await post(keys, '1700000000000-0000-old', new Uint8Array([9, 9]))).status).toBe(200);
    expect((await post(keys, '1700000000000-0000-old', new Uint8Array([9, 8]))).status).toBe(409);
    // The outbox re-filled and pushed again: a fresh seal (new IV, new bytes) under the SAME name; the server keeps the first and the changes are acked.
    const n = logKeys(r2).length;
    const before = (await metaOf(r2)).bytes;
    await (await import('$lib/db/vault')).outboxFill();
    await B.sync.run();
    expect(logKeys(r2).length).toBe(n);
    expect(r2.objs.get(logKeys(r2)[0])!.body).toBe(bytes);
    expect((await metaOf(r2)).bytes).toBe(before);
    expect(mem.outbox.size).toBe(0);
  });
  it('a re-push after a lost reply lands on the same key and is counted once against the allowance', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    // The server does the work; the reply never arrives.
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await real(input, init);
      if (init?.method === 'POST' && String(input).includes('/api/sync/log?')) throw new TypeError('Failed to fetch');
      return res;
    }) as typeof fetch;
    await expect(B.sync.setup(KEY, 'create')).rejects.toThrow(/Failed to fetch/);
    expect(logKeys(r2)).toHaveLength(1);
    expect(memB.outbox.size).toBeGreaterThan(0);
    globalThis.fetch = real;
    await B.sync.run();
    expect(logKeys(r2)).toHaveLength(1);
    expect(memB.outbox.size).toBe(0);
    expect((await metaOf(r2)).bytes).toBe(r2.objs.get(logKeys(r2)[0])!.body.length);
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

describe('a batch that cannot be STORED is not set aside: the run stops and it is fetched again', () => {
  it('a QuotaExceededError on the vault write during a pull ends the run with an error; the batch is not in `have`, the cursor stays before it, and the next run brings it', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    const plant = await B.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    let failed = 0;
    memD.failAppend = (_cs, fromServer) => fromServer && failed++ === 0; // the first write of server changes fails; the vault is otherwise fine
    const D = await boot(memD, r2);
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow(/quota/i);
    expect(D.sync.lastError).toMatch(/quota/i);
    expect(D.sync.quarantined).toEqual([]); // storage is not the batch's fault
    expect(D.collection.accession(plant.id)).toBeUndefined(); // nothing applied that was not stored
    expect(memD.changes.size).toBe(0);
    expect((memD.meta.get('sync') as { have: string[]; since: number }).have).toEqual([]);
    // The storage problem gone: the next run fetches the same batch again and the plant arrives.
    const D2 = await reboot(memD, r2);
    await D2.sync.run();
    expect(D2.sync.lastError).toBeNull();
    expect(D2.calls.filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(1);
    expect(D2.collection.accession(plant.id)).toBeDefined();
    expect(memD.changes.size).toBeGreaterThan(0);
    expect(D2.sync.quarantined).toEqual([]);
  });
  it('a photo whose pixels cannot be written is not quarantined; the run stops and the photo is fetched again', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pone000000001';
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6, sha: await sha256hex(jpeg) });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    let failed = 0;
    memD.failPutPhoto = () => failed++ === 0;
    const D = await boot(memD, r2);
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow(/quota/i);
    expect(D.sync.quarantined).toEqual([]);
    expect(memD.photos.size).toBe(0);
    expect((memD.meta.get('sync') as { photosPushed: string[] }).photosPushed).toEqual([]);
    await D.sync.run();
    expect(D.sync.lastError).toBeNull();
    expect(memD.photos.size).toBe(1);
    expect(D.calls.filter((c) => c === `GET /api/sync/photo/${pid}`)).toHaveLength(2);
  });
});

describe('a full vault is said, not split', () => {
  it('a 507 stops the push without bisecting, sets vaultFull, keeps the changes in the outbox, and the pull still runs; room again clears it', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    for (let i = 0; i < 8; i++) await B.collection.addEvent({ acc: 'r1', d: '2026-01-0' + (i + 1), t: 'water' });
    await B.sync.setup(KEY, 'create');
    expect(B.sync.vaultFull).toBeNull();
    await fillVault(r2);
    await B.collection.addEvent({ acc: 'r1', d: '2026-02-01', t: 'feed' });
    const before = B.calls.length;
    await B.sync.run();
    const calls = B.calls.slice(before);
    expect(calls.filter((c) => c === 'POST /api/sync/log')).toHaveLength(1); // one request, no halving
    expect(calls.filter((c) => c === 'GET /api/sync/log').length).toBeGreaterThan(0); // receiving carries on
    expect(B.sync.lastError).toBeNull();
    expect(B.sync.refused).toEqual([]);
    expect(B.sync.vaultFull).toEqual({ bytes: MAX_BYTES - 10, limit: MAX_BYTES });
    expect(B.sync.pending).toBeGreaterThan(0);
    expect(memB.outbox.size).toBeGreaterThan(0);
    // It is remembered across a reload, and tried once per run.
    const B2 = await reboot(memB, r2);
    expect(B2.sync.vaultFull).toEqual({ bytes: MAX_BYTES - 10, limit: MAX_BYTES });
    const again = B2.calls.length;
    await B2.sync.run();
    expect(B2.calls.slice(again).filter((c) => c === 'POST /api/sync/log')).toHaveLength(1);
    // Room again (photos deleted elsewhere): the push goes through and the state clears.
    await fillVault(r2, 0);
    await B2.sync.run();
    expect(B2.sync.vaultFull).toBeNull();
    expect(memB.outbox.size).toBe(0);
    expect((memB.meta.get('sync') as { vaultFull?: unknown }).vaultFull).toBeUndefined();
  });
  it('a photo whose first send landed but whose reply was lost is recognised on the retry, not refused (round seven, 7)', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const pid = 'pone000000001';
    memB.photos.set(pid, { id: pid, blob: new Blob([new Uint8Array([1, 2, 3, 4])]), thumb: new Blob([new Uint8Array([9])]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 4 });
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await real(input, init);
      if (init?.method === 'PUT' && String(input).includes('/api/sync/photo/')) throw new TypeError('Failed to fetch');
      return res;
    }) as typeof fetch;
    await expect(B.sync.run()).rejects.toThrow(/Failed to fetch/);
    const key = `vault/${(await deriveKeys(KEY)).id}/photo/${pid}.bin`;
    expect(r2.objs.has(key)).toBe(true); // the server did the work
    globalThis.fetch = real;
    await B.sync.run(); // the retry seals with a fresh nonce: different bytes, same pixels
    expect(B.sync.refused).toEqual([]);
    expect((memB.meta.get('sync') as { photosPushed: string[] }).photosPushed).toContain(pid);
  });
  it('a full vault refuses a photo with 507 too; a photo that is merely too big is still 413 and noted', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    await fillVault(r2);
    const pid = 'pone000000001';
    memB.photos.set(pid, { id: pid, blob: new Blob([new Uint8Array(100)]), thumb: new Blob([new Uint8Array(10)]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 100 });
    await B.sync.run();
    expect(B.sync.vaultFull).not.toBeNull();
    expect(B.sync.refused).toEqual([]);
    expect(r2.objs.has(`vault/${(await deriveKeys(KEY)).id}/photo/${pid}.bin`)).toBe(false);
    const big = await fetch(`/api/sync/photo/pbig000000001?vault=${(await deriveKeys(KEY)).id}`, { method: 'PUT', headers: { authorization: `Bearer ${(await deriveKeys(KEY)).token}`, 'content-length': String(13 * 1024 * 1024) }, body: new Uint8Array(3) as BodyInit });
    expect(big.status).toBe(413);
  });
});

describe('the pull cursor', () => {
  it('501 batches that arrived in the same second all arrive: the second page continues after the (arrival, key) pair', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const wall = 1700000000000;
    for (let i = 0; i < 501; i++) {
      const t = `${wall + i}-0000-bbbbbbbbbbbb`;
      const body = await sealJson(keys, 'log', { v: 1, device: 'bbbbbbbbbbbb', changes: [{ t, kind: 'accession', id: 'r' + i, field: 'taxonName', value: 'Plant ' + i }] });
      expect((await post(keys, `${t}-0123456789ab`, body)).status).toBe(200);
    }
    for (const k of logKeys(r2)) r2.objs.get(k)!.uploaded = 7_000_000; // one arrival time for all of them
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.sync.lastError).toBeNull();
    expect(D.collection.accessions).toHaveLength(501);
    const lists = D.calls.filter((c) => c === 'GET /api/sync/log');
    expect(lists).toHaveLength(2);
    // And a later run lists once, fetches nothing, and stays at 501.
    const n = D.calls.length;
    await D.sync.run();
    expect(D.calls.slice(n).filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(0);
    expect(D.collection.accessions).toHaveLength(501);
  });
});

describe('a peer whose clock is ahead', () => {
  it('its changes are stored but held out of the fold until this clock reaches them; the slow device\'s later edit shows on both; the count and the date are on the engine', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memB = newMem('bbbbbbbbbbbb');
    let A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'bought at the show' });
    await A.sync.setup(KEY, 'create');
    // B's phone is a day ahead. It joins and edits the notes.
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + 86_400_000);
    let B = await boot(memB, r2);
    await B.sync.setup(KEY, 'join');
    await B.collection.put('accession', plant.id, { notes: 'phone says: repot' });
    await B.sync.run();
    expect(B.sync.held).toBe(0); // its own stamps are never held on itself
    vi.setSystemTime(real);
    // A pulls: B's note is stored, not shown; A's own later edit wins now and after a reload.
    A = await reboot(memA, r2);
    await A.sync.run();
    expect(A.collection.accession(plant.id)?.notes).toBe('bought at the show');
    expect(A.sync.held).toBe(1);
    expect(A.sync.heldUntil).toBeGreaterThan(real + 86_400_000 - MAX_AHEAD_MS - 1000);
    expect(memA.changes.size).toBeGreaterThan(0);
    await A.collection.put('accession', plant.id, { notes: 'no: leave it until spring' });
    expect(A.collection.accession(plant.id)?.notes).toBe('no: leave it until spring');
    await A.sync.run();
    A = await reboot(memA, r2);
    if (collectionHolds) expect(A.collection.accession(plant.id)?.notes).toBe('no: leave it until spring'); // the load() fold skips the held change
    expect(A.sync.held).toBe(1);
    // When A's clock reaches B's stamp, the held change is folded in and, being the greater HLC, wins.
    vi.setSystemTime(real + 86_400_000);
    await A.sync.run();
    expect(A.sync.held).toBe(0);
    expect(A.sync.heldUntil).toBeNull();
    expect(A.collection.accession(plant.id)?.notes).toBe('phone says: repot');
    // B's phone, put right: its own past stamps are never held on itself, and it warns that its clock jumped back.
    vi.setSystemTime(real);
    B = await reboot(memB, r2);
    expect(B.collection.accession(plant.id)?.notes).toBe('phone says: repot');
    expect(B.sync.held).toBe(0);
    expect(B.sync.clockWarning).toMatch(/clock appears to have jumped back/);
    expect(A.sync.clockWarning).toBeNull();
  });
  it('a held change that arrives through a restore (an import) is held too, and re-folded when due', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1', notes: 'one' });
    await A.sync.setup(KEY, 'create');
    const ahead = hlcEncode({ wall: Date.now() + 3_600_000, count: 0, device: 'cccccccccccc' });
    await A.collection.ingest([{ t: ahead, kind: 'accession', id: plant.id, field: 'notes', value: 'from the future' }], 'import');
    expect(A.sync.held).toBe(1);
    if (collectionHolds) expect(A.collection.accession(plant.id)?.notes).toBe('one'); // the commit() fold skips it too
    await A.sync.run(); // pushed, since it came in through a restore
    expect(memA.outbox.size).toBe(0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 3_600_000);
    await A.sync.run();
    expect(A.sync.held).toBe(0);
    expect(A.collection.accession(plant.id)?.notes).toBe('from the future');
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
  it('a batch whose body breaks off mid-download is not set aside: the run stops, and the next run brings it whole (round twelve, 2)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    const p = await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const D = await boot(newMem('dddddddddddd'), r2);
    // The first GET of a batch body answers 200 and then the connection drops while the bytes are being read.
    const real = globalThis.fetch;
    let broke = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const r = await real(input, init);
      if (/\/api\/sync\/log\/[^?]+/.test(String(input)) && !broke++) return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.error(new TypeError('network error')); } }), { status: 200, headers: r.headers });
      return r;
    }) as typeof fetch;
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow();
    expect(D.sync.quarantined).toHaveLength(0); // bytes that never arrived are not a batch that could not be read
    expect(D.collection.accession(p.id)).toBeUndefined();
    await D.sync.run();
    expect(D.sync.lastError).toBeNull();
    expect(D.collection.accession(p.id)).toBeDefined(); // fetched again, whole
    expect(D.sync.quarantined).toHaveLength(0);
  });
  it('a 429 on one batch body is a wait, not a failure: the run stops with the server\'s Retry-After (round twelve, 2)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const D = await boot(newMem('dddddddddddd'), r2);
    const real = globalThis.fetch;
    let once = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (/\/api\/sync\/log\/[^?]+/.test(String(input)) && !once++) return new Response('{"error":"slow down"}', { status: 429, headers: { 'retry-after': '7' } });
      return real(input, init);
    }) as typeof fetch;
    const err = await D.sync.setup(KEY, 'join').catch((e: Error & { retryAfterMs?: number }) => e);
    expect((err as Error & { retryAfterMs?: number }).retryAfterMs).toBe(7000);
    expect(D.sync.quarantined).toHaveLength(0);
  });
  it('a batch set aside by one build is read again by the next (round twelve, 2)', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    expect((await post(keys, '1700000000000-0000-evil', crypto.getRandomValues(new Uint8Array(64)))).ok).toBe(true);
    await B.sync.run();
    expect(B.sync.quarantined).toHaveLength(1);
    // Another build opens the same vault: the entry is dropped from the quarantine and the batch fetched again (still garbage here, so it is set aside again, by this build).
    const m = mem;
    const q = (m.meta.get('sync') as { quarantined: Array<{ build?: string }> }).quarantined;
    q[0].build = 'older-build';
    const B2 = await reboot(m, r2);
    await B2.sync.run();
    expect(B2.calls.filter((c) => c.includes('/api/sync/log/1700000000000-0000-evil'))).toHaveLength(1);
    expect(B2.sync.quarantined).toHaveLength(1);
    expect((m.meta.get('sync') as { quarantined: Array<{ build?: string }> }).quarantined[0].build).not.toBe('older-build');
  });
  it('a readable batch that an earlier build set aside is fetched by key, folded, and leaves the quarantine, although no listing would show it again (round thirteen, 1)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    const p = await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const key = logKeys(r2)[0].split('/log/')[1].replace(/\.bin$/, '');
    // Device D: the batch is on file as set aside by an older build, not folded, and the cursor is a day past its arrival.
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.collection.accession(p.id)).toBeDefined();
    const m = mem;
    const meta = m.meta.get('sync') as { have: string[]; since: number; quarantined?: Array<{ key: string; error: string; at: string; build?: string }> };
    for (const t of [...m.changes.keys()]) m.changes.delete(t); // as if it had never folded
    meta.quarantined = [{ key, error: 'not a batch this version understands', at: new Date().toISOString(), build: 'older-build' }];
    meta.since += 86_400_000;
    m.meta.set('sync', meta);
    const D2 = await reboot(m, r2);
    expect(D2.collection.accession(p.id)).toBeUndefined();
    await D2.sync.run();
    expect(D2.calls.filter((c) => c.includes(`/api/sync/log/${key}`))).toHaveLength(1);
    expect(D2.collection.accession(p.id)).toBeDefined();
    expect(D2.sync.quarantined).toHaveLength(0);
    expect(D2.sync.lastError).toBeNull();
  });
  it('a transient failure while re-reading a set-aside batch leaves it set aside, to be tried next run, and does not end the run; it is not lost (round fourteen, 1; round fifteen)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    const p = await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const key = logKeys(r2)[0].split('/log/')[1].replace(/\.bin$/, '');
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    const m = mem;
    const meta = m.meta.get('sync') as { have: string[]; since: number; quarantined?: Array<{ key: string; error: string; at: string; build?: string }> };
    for (const t of [...m.changes.keys()]) m.changes.delete(t);
    meta.quarantined = [{ key, error: 'not a batch this version understands', at: new Date().toISOString(), build: 'older-build' }];
    meta.since += 86_400_000;
    m.meta.set('sync', meta);
    const D2 = await reboot(m, r2);
    const real = globalThis.fetch;
    let failed = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes(`/api/sync/log/${key}`) && !failed++) return new Response('{"error":"try later"}', { status: 503 });
      return real(input, init);
    }) as typeof fetch;
    await D2.sync.run(); // the failed re-read does not end the run (round fifteen, design note): the number repair and the photo pull still happen
    expect(D2.sync.lastError).toBeNull();
    expect(D2.sync.quarantined).toHaveLength(1); // still set aside, still on the page
    expect((m.meta.get('sync') as typeof meta).quarantined).toHaveLength(1); // and still on disk, whatever writes meta next
    await D2.collection.addAccession({ taxonName: 'Conophytum', acc: 'D-1' }); // a push writes meta too
    await D2.sync.run();
    expect(D2.collection.accession(p.id)).toBeDefined(); // fetched again, folded
    expect(D2.sync.quarantined).toHaveLength(0);
    expect(D2.sync.lastError).toBeNull();
  });
  it('a photograph set aside by an older build is not fetched as a batch, and does not end every run after a deploy (round fifteen, 6)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    const p = await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    const m = mem;
    const meta = m.meta.get('sync') as { quarantined?: Array<{ key: string; error: string; at: string; build?: string }> };
    meta.quarantined = [{ key: 'p1790000000000-0000-aaaaaaaaaaaa', error: 'photo: pixels do not match the record', at: new Date().toISOString(), build: 'older-build' }];
    m.meta.set('sync', meta);
    const D2 = await reboot(m, r2);
    await D2.sync.run(); // a new build: the entry is from another build, and is a photograph, not a batch
    expect(D2.sync.lastError).toBeNull();
    expect(D2.sync.lastSync).not.toBeNull();
    expect(D2.calls.some((c) => c.includes('/api/sync/log/p1790000000000'))).toBe(false); // never fetched as a batch
    expect(D2.collection.accession(p.id)).toBeDefined();
  });
  it('a push the server asks to wait on does not stop the pull: the other device\'s changes arrive and the wait is reported after (round fifteen, 7)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const A2 = await boot(memA, r2);
    await A2.sync.init();
    const p = await A2.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A2.sync.run(); // on the server now
    const D2 = await reboot(memD, r2);
    await D2.collection.addAccession({ taxonName: 'Conophytum', acc: 'D-1' }); // something pending here
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).includes('/api/sync/log')) return new Response('{"error":"day allowance spent"}', { status: 429, headers: { 'retry-after': '600' } });
      return real(input, init);
    }) as typeof fetch;
    const err = await D2.sync.run().catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^received; /);
    expect(D2.collection.accession(p.id)).toBeDefined(); // the pull ran
    expect(D2.sync.lastSync).not.toBeNull();
    expect(memD.outbox.size).toBeGreaterThan(0); // the change here still waits
  });
  it('"Stop syncing" during a run: the run cannot write the old key back (round fifteen, 2)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.run();
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const D2 = await reboot(memD, r2);
    memD.meta.set('sync', { ...(memD.meta.get('sync') as object), since: 0, have: [] }); // make the run fetch a batch
    const D3 = await reboot(memD, r2);
    // The listing answers, then the batch body takes a while; "Stop syncing" is pressed in the meantime.
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (/\/api\/sync\/log\/[^?]+/.test(String(input))) await gate;
      return real(input, init);
    }) as typeof fetch;
    const run = D3.sync.run().catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 50));
    await D3.sync.forget();
    release();
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect(memD.meta.get('sync')).toBeNull(); // the run did not write the old meta back
    const D4 = await reboot(memD, r2);
    expect(D4.sync.configured).toBe(false);
    void D2;
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
