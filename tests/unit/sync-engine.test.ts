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
import { accNo } from '$lib/db/types';

/* ------------------------------------------------------------------ fakes */

/**
 * The vault fake has a failure path: `failAppend` and `failPutPhoto`, when set,
 * decide per write whether IndexedDB refuses it (a full phone), and a refused
 * write stores nothing, as the real one does.
 */
const quota = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown>; photos: Map<string, { id: string; blob: Blob; thumb: Blob }>; failAppend?: (cs: Change[], fromServer: boolean) => boolean; failPutPhoto?: (id: string) => boolean };
/** What the listing's Date header says the server's clock is; null for no header. */
let serverClock: number | null = null;
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map(), photos: new Map() });
let mem: Mem = newMem('dev0');

vi.mock('$lib/db/vault', () => {
  class StoppedError extends Error {
    constructor() {
      super('syncing was stopped on this device while this run was under way');
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  StoppedError,
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[], fromServer = false, _strict = false, requireKey?: string) => {
    if (mem.failAppend?.(cs, fromServer)) throw quota();
    // the real vault checks the stored sync key inside the write's transaction (round seventeen, A1)
    if (requireKey !== undefined && (mem.meta.get('sync') as { key?: string } | null | undefined)?.key !== requireKey) throw new StoppedError();
    for (const c of cs) {
      mem.changes.set(c.t, c);
      if (!fromServer) mem.outbox.add(c.t);
    }
    return { kept: cs, replaced: [], seq: 0 };
  },
  outboxKeys: async () => [...mem.outbox],
  outboxAck: async (ts: string[], key?: string) => {
    if (key !== undefined && (mem.meta.get('sync') as { key?: string } | null | undefined)?.key !== key) throw new StoppedError();
    ts.forEach((t) => mem.outbox.delete(t));
  },
  outboxFill: async () => {
    for (const t of mem.changes.keys()) mem.outbox.add(t);
    return mem.changes.size;
  },
  outboxClear: async () => mem.outbox.clear(),
  changesByKeys: async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  setMetaIfKey: async (k: string, v: unknown, key: string) => {
    const had = mem.meta.get(k) as { key?: string } | null | undefined;
    if (!had || had.key !== key) return false;
    mem.meta.set(k, v);
    return true;
  },
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
  // No snapshot in memory: every load folds the whole log, as a first load does (the snapshot is tested on the real vault in fold-snapshot.test.ts).
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => { const had = (mem.meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem.meta.set('parked', out); return out; };
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...mem.changes.values()], seq: 0, gen: 0 });
  m.changeKeys = async () => [...mem.changes.keys()];
  if (!m.changesByKeys) m.changesByKeys = async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean);
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  if (!m.changesOf) m.changesOf = async (kind: string, id: string) => ([...mem.changes.values()] as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.announceSyncForgotten = () => {};
  return m;
});

/** Just enough of R2 for the routes: keys, bytes, upload times. */
function fakeR2() {
  const objs = new Map<string, { body: Uint8Array; uploaded: number; sha?: string; md?: Record<string, string> }>();
  // Arrivals by a clock near real time, a second apart: a batch's arrival is what the fold judges a broken-clock stamp
  // against (round fifty-two, 1), and arrivals in 1970 would park every real-time change.
  let clock = Date.now() - 3_600_000;
  return {
    objs,
    async put(key: string, body: unknown, opts?: { customMetadata?: Record<string, string> }) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: (clock += 1000), sha: opts?.customMetadata?.sha, md: opts?.customMetadata });
    },
    async head(key: string) {
      const o = objs.get(key);
      return o ? { customMetadata: o.md ?? (o.sha ? { sha: o.sha } : {}), size: o.body.length } : null;
    },
    async delete(key: string) {
      objs.delete(key);
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
  /** The server's clock as the Date header carries it: null leaves the header off, as a test harness without one did (round forty, R1-6). */
  const dated = (r: Response) => { if (serverClock == null) return r; const out = new Response(r.body, r); out.headers.set('date', new Date(serverClock).toUTCString()); return out; };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x');
    const request = new Request(url, init);
    calls.push(`${request.method} ${url.pathname}`);
    const ev = { request, url, platform, getClientAddress: () => '1.1.1.1', params: {} as Record<string, string> };
    try {
      let mm: RegExpExecArray | null;
      if (url.pathname === '/api/sync/vault') return await (routes.vault as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev);
      if (url.pathname === '/api/sync/log') return dated(await (routes.log as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev));
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
/** A raw push, with the headers every push carries (round fifty-seven): a fingerprint (a fixed one unless given) and the name's device. */
const post = (keys: Awaited<ReturnType<typeof deriveKeys>>, name: string, body: Uint8Array, extra: Record<string, string> = {}) => fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { authorization: `Bearer ${keys.token}`, 'x-batch': name, 'x-batch-plain': 'e'.repeat(64), 'x-device': name.split('-')[2] || 'dev', ...extra }, body: body as BodyInit });
/** A batch as a device writes one: sealed under its name, and named by the hour, the device and a fingerprint. */
const pushAs = async (keys: Awaited<ReturnType<typeof deriveKeys>>, hour: string, device: string, fp: string, payload: unknown) => { const name = `${hour}-0000-${device}-${fp}`; return post(keys, name, await sealJson(keys, 'log', payload, name)); };
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

/**
 * A gate a fake fetch holds a request at, and a promise that settles once a request has reached it. The tests that stop
 * syncing or set up another vault mid-run must do so with the run held at the gate; a fixed 50 ms wait assumed the run
 * had got there, and on a loaded machine it had not, so the stale run listed the vault after the stop and the test
 * failed on the author's deploy, once in forty-four rounds (round forty-four).
 */
function gated() {
  let release = () => {};
  let arrive = () => {};
  const open = new Promise<void>((r) => (release = r));
  const reached = new Promise<void>((r) => (arrive = r));
  const hold = async () => { arrive(); await open; };
  return { hold, reached, release: () => release() };
}

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
    // the names of earlier builds (a full HLC, no fingerprint) and a push without its headers are refused (round fifty-seven)
    expect((await post(keys, '1700000000000-0000-dev', new Uint8Array(3))).status).toBe(400);
    expect((await post(keys, '1700000000000-0001-dev-0123456789ab', new Uint8Array(3))).status).toBe(400);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { ...h, 'x-batch': '1700000000000-0000-dev-0123456789ac' }, body: new Uint8Array(3) as BodyInit })).status).toBe(400);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`, { headers: { authorization: `Bearer ${'0'.repeat(64)}` } })).status).toBe(403);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`)).status).toBe(401);
    expect((await fetch(`/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: keys.id, token: '1'.repeat(64), create: true }) })).status).toBe(403);
    expect([...r2.objs.keys()].every((k) => k.startsWith(`vault/${keys.id}/`))).toBe(true);
    // The creation route, which has no token to check first, stops reading a body at a kilobyte rather than buffering what a
    // stranger streams (round thirty-eight, R1-4): a chunked body that would carry megabytes is a 413 after a few chunks.
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled++; if (pulled > 64) throw new Error('read past the cap'); c.enqueue(new Uint8Array(512).fill(0x20)); } });
    const flood = await fetch(`/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: endless, duplex: 'half' } as RequestInit);
    expect(flood.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(4);
    expect((await fetch(`/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })).status).toBe(400); // a body that is not an object is still a plain 400
    expect((await fetch(`/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'application/json' }, })).status).toBe(400); // and no body at all
    // and a body of another type is refused before it is read: what a page on another site can send without a preflight (round fifty-eight)
    expect((await fetch(`/api/sync/vault`, { method: 'POST', body: new Blob([JSON.stringify({ id: keys.id, token: keys.token, create: true })]) })).status).toBe(415);
    expect((await fetch(`/api/sync/vault`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id: keys.id, token: keys.token, create: true }) })).status).toBe(415);
    // An oversize body is refused from its declared length.
    const big = await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { ...h, 'x-batch': '1700000000000-0000-dev-0123456789ad', 'x-batch-plain': 'e'.repeat(64), 'x-device': 'dev', 'content-length': String(17 * 1024 * 1024) }, body: new Uint8Array(3) as BodyInit });
    expect(big.status).toBe(413);
  });
});

describe('the pull cursor is judged against the server clock, not the device clock (round forty, R1-6)', () => {
  it('a device clock a day behind the server still advances its cursor, since the arrivals are near the Date header', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    // The server (and the batches' arrivals) sit a day ahead of this device's clock.
    for (const k of logKeys(r2)) r2.objs.get(k)!.uploaded = Date.now() + 86_400_000;
    serverClock = Date.now() + 86_400_000 + 5000;
    try {
      const memD = newMem('dddddddddddd');
      const D = await boot(memD, r2);
      await D.sync.setup(KEY, 'join');
      expect((memD.meta.get('sync') as { since: number }).since).toBeGreaterThan(Date.now() + 86_000_000); // advanced to the arrival
      expect(D.sync.clockAhead).toBeNull();
      expect(D.collection.accessions.map((a) => a.acc)).toEqual(['B-1']);
    } finally {
      serverClock = null;
    }
  });
});

describe('the pull cursor never runs ahead of the device clock (round thirty-eight, R1-5)', () => {
  it('a listing that dates a batch a day ahead moves the cursor only to now plus the slack, says so, and later batches still arrive', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    // The server's clock (or whoever shapes the listing) dates the one batch a day ahead.
    for (const k of logKeys(r2)) r2.objs.get(k)!.uploaded = Date.now() + 86_400_000;
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const since = (memD.meta.get('sync') as { since: number }).since;
    expect(since).toBeLessThanOrEqual(Date.now()); // the cursor did not move for it
    expect(D.collection.accessions.map((a) => a.acc)).toEqual(['B-1']); // the batch itself still folded
    expect(D.sync.clockAhead).toMatch(/ahead of its own clock/);
    expect(D.sync.refused).toEqual([]); // not a refusal of anything from this device
    // A batch dated normally afterwards is not behind a cursor parked a day ahead.
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-2' });
    await B.sync.run();
    await D.sync.run();
    expect(D.collection.accessions.map((a) => a.acc).sort()).toEqual(['B-1', 'B-2']);
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
    const big = await fetch(`/api/sync/photo/pbig000000001?vault=${(await deriveKeys(KEY)).id}`, { method: 'PUT', headers: { authorization: `Bearer ${(await deriveKeys(KEY)).token}`, 'x-photo-drop': 'a'.repeat(64), 'content-length': String(13 * 1024 * 1024) }, body: new Uint8Array(3) as BodyInit });
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
      const name = `${t}-0123456789ab`;
      const body = await sealJson(keys, 'log', { v: 1, device: 'bbbbbbbbbbbb', changes: [{ t, kind: 'accession', id: 'r' + i, field: 'taxonName', value: 'Plant ' + i }, { t: `${wall + i}-0001-bbbbbbbbbbbb`, kind: 'accession', id: 'r' + i, field: 'status', value: 'growing' }] }, name);
      expect((await post(keys, name, body)).status).toBe(200);
    }
    const oneSecond = Date.now() - 1000;
    for (const k of logKeys(r2)) r2.objs.get(k)!.uploaded = oneSecond; // one arrival time for all of them
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
    expect(A.sync.held).toBe(2); // the notes and the `notesBase` a notes edit carries since round twenty-five: two field changes, both held
    expect(A.sync.heldUntil).toBeGreaterThan(real + 86_400_000 - MAX_AHEAD_MS - 1000);
    expect(memA.changes.size).toBeGreaterThan(0);
    await A.collection.put('accession', plant.id, { notes: 'no: leave it until spring' });
    expect(A.collection.accession(plant.id)?.notes).toBe('no: leave it until spring');
    await A.sync.run();
    A = await reboot(memA, r2);
    if (collectionHolds) expect(A.collection.accession(plant.id)?.notes).toBe('no: leave it until spring'); // the load() fold skips the held change
    expect(A.sync.held).toBe(2);
    // When A's clock reaches B's stamp, the held change is folded in. A's edit, made while B's was held and within a day of
    // it, was stamped just past it (the grower saw the field as it was), so A's edit stands: since round fifty-eight the
    // held change reaches the fold's held list through the pull, and before that A's edit was stamped below it and lost
    // when it came due (the client review's finding 8).
    vi.setSystemTime(real + 86_400_000);
    await A.sync.run();
    expect(A.sync.held).toBe(0);
    expect(A.sync.heldUntil).toBeNull();
    expect(A.collection.accession(plant.id)?.notes).toBe('no: leave it until spring');
    // B's phone, put right and not yet synced: its own past stamps are never held on itself, and it warns that its clock jumped back.
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
    expect((await post(keys, '1700000000000-0000-evil-000000000000', crypto.getRandomValues(new Uint8Array(64)))).ok).toBe(true);
    const p = await B.collection.addAccession({ taxonName: 'Conophytum', acc: 'B-2' });
    await B.sync.run();
    expect(B.sync.quarantined.map((q) => q.key)).toEqual(['1700000000000-0000-evil-000000000000']);
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
    expect((await post(keys, '1700000000000-0000-evil-000000000000', crypto.getRandomValues(new Uint8Array(64)))).ok).toBe(true);
    await B.sync.run();
    expect(B.sync.quarantined).toHaveLength(1);
    // Another build opens the same vault: the entry is dropped from the quarantine and the batch fetched again (still garbage here, so it is set aside again, by this build).
    const m = mem;
    const q = (m.meta.get('sync') as { quarantined: Array<{ build?: string }> }).quarantined;
    q[0].build = 'older-build';
    const B2 = await reboot(m, r2);
    await B2.sync.run();
    expect(B2.calls.filter((c) => c.includes('/api/sync/log/1700000000000-0000-evil-000000000000'))).toHaveLength(1);
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
    const meta = m.meta.get('sync') as { quarantined?: Array<{ key: string; error: string; at: string; build?: string; kind?: string }> };
    meta.quarantined = [{ key: 'p1790000000000-0000-aaaaaaaaaaaa', error: 'photo: pixels do not match the record', at: new Date().toISOString(), build: 'older-build', kind: 'photo' }];
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
    expect((err as Error).message).toMatch(/^received 1 batch; /); // and said only because something arrived (round sixteen, design note)
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
    const gate = gated(); release = gate.release;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (/\/api\/sync\/log\/[^?]+/.test(String(input))) await gate.hold();
      return real(input, init);
    }) as typeof fetch;
    const run = D3.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await D3.sync.forget();
    release();
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect(memD.meta.get('sync')).toBeNull(); // the run did not write the old meta back
    const D4 = await reboot(memD, r2);
    expect(D4.sync.configured).toBe(false);
    void D2;
  });
  it('"Stop syncing" in ANOTHER tab during a run: the run sees the stored key gone and writes nothing back, and no batch is folded (round sixteen, 1)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.run();
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    memD.meta.set('sync', { ...(memD.meta.get('sync') as object), since: 0, have: [] }); // make the run fetch a batch
    const D3 = await reboot(memD, r2);
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (/\/api\/sync\/log\/[^?]+/.test(String(input))) await gate.hold();
      return real(input, init);
    }) as typeof fetch;
    const run = D3.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    memD.meta.set('sync', null); // the other tab's forget(): on disk only; this tab has not heard the broadcast
    memD.outbox.clear();
    const before = memD.changes.size;
    release();
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/stopped/);
    expect(memD.meta.get('sync')).toBeNull(); // not written back
    expect(memD.changes.size).toBe(before); // the batch in flight was not folded into a log that is no longer this vault's
    expect(D3.sync.configured).toBe(false); // and this tab dropped the vault on seeing it gone
  });
  it('a new vault set up while an old run is pushing: the old run acks nothing from the new outbox and leaves its status alone (round sixteen, 2)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    // The old vault's push is held at the POST; meanwhile the grower stops syncing and joins another vault.
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    let held = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) await gate.hold();
      return real(input, init);
    }) as typeof fetch;
    const old = A.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A.sync.forget();
    const KEY2 = newVaultKey();
    const setup = A.sync.setup(KEY2, 'create'); // refills the outbox with everything for the new vault
    await new Promise((r) => setTimeout(r, 20));
    release();
    const err = await old;
    await setup;
    expect(err).toBeInstanceOf(Error);
    expect(A.sync.lastError).toBeNull(); // the stale run's error did not land on the new vault's status
    expect(A.sync.busy).toBeNull();
    expect(A.sync.key).toBe(KEY2);
    // the new vault holds the plant: the stale run did not ack the new outbox, so the new vault's own push sent it
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY2, 'join');
    expect(B.collection.accessions.map((a) => a.taxonName)).toEqual(['Lithops']);
  });
  it('a push answered 429 after "Stop syncing" does not go on to pull: the stale run ends, sets no busy text, and a new vault set up meanwhile is not listed by it (round twenty, 2)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    // The old vault's push is held at the POST and then answered 429, which run() catches so the pull can still happen.
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    let held = 0;
    const gets: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) {
        await gate.hold();
        return new Response('{"error":"wait"}', { status: 429, headers: { 'retry-after': '30' } });
      }
      if ((!init?.method || init.method === 'GET') && /\/api\/sync\/log\?/.test(String(input))) gets.push(String(input));
      return real(input, init);
    }) as typeof fetch;
    const old = A.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A.sync.forget();
    expect(A.sync.busy).toBeNull();
    release();
    const err = await old;
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/stopped/);
    expect(A.sync.busy).toBeNull(); // the stale run did not set "Checking for changes…" on a device that has stopped
    expect(gets).toEqual([]); // and it listed nothing
    expect(A.sync.lastError).toBeNull();
    // the same with a new vault set up meanwhile: the stale run does not list the new vault, and the new vault's runs are not blocked by a busy flag it left
    const KEY2 = newVaultKey();
    globalThis.fetch = real;
    await A.sync.setup(KEY, 'create'); // back on the first vault; its plant is on the server already, so this run pushes nothing
    await A.collection.addAccession({ taxonName: 'Conophytum', acc: 'A-2' }); // something to push
    held = 0;
    const gate2 = gated(); release = gate2.release;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) {
        await gate2.hold();
        return new Response('{"error":"wait"}', { status: 429, headers: { 'retry-after': '30' } });
      }
      if ((!init?.method || init.method === 'GET') && /\/api\/sync\/log\?/.test(String(input))) gets.push(String(input));
      return real(input, init);
    }) as typeof fetch;
    const old2 = A.sync.run().catch((e: Error) => e);
    await gate2.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A.sync.forget();
    gets.length = 0;
    await A.sync.setup(KEY2, 'create'); // its own first run pushes and lists; the POST it makes is not the held one (held is past 0)
    const newId = (await deriveKeys(KEY2)).id;
    const listedByNew = gets.filter((u) => u.includes(newId)).length;
    expect(listedByNew).toBeGreaterThan(0);
    release();
    await old2;
    await new Promise((r) => setTimeout(r, 20));
    expect(gets.filter((u) => u.includes(newId)).length).toBe(listedByNew); // the stale run added no listing of the new vault
    expect(A.sync.busy).toBeNull();
    expect(A.sync.key).toBe(KEY2);
    globalThis.fetch = real;
  });
  it('a run stopped during its pull shows no sync time afterwards, and a set-aside batch whose re-read finds the run stale ends the run before the number repair (round twenty-one, 4)', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.run();
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // The stop is issued once the run is provably at the held request, not after a fixed wait: on a slow machine a
    // fifty-millisecond wait ended before the run reached it, and the held request itself was then counted as "after the stop" (round thirty, deploy).
    let reached: () => void = () => {};
    const reachedP = new Promise<void>((r) => (reached = r));
    let held = 0;
    const after: string[] = [];
    let stopped = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input);
      if (stopped) after.push(`${init?.method ?? 'GET'} ${new URL(u, 'http://x').pathname}`);
      if ((!init?.method || init.method === 'GET') && /\/api\/sync\/log\?/.test(u) && held++ === 0) { reached(); await gate; }
      return real(input, init);
    }) as typeof fetch;
    const run = A.sync.run().catch((e: Error) => e);
    await reachedP;
    await A.sync.forget();
    stopped = true;
    release();
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect(A.sync.lastSync).toBeNull(); // the stale run did not stamp a sync time on a device that has stopped
    expect(after.filter((x) => x.includes('/api/sync/photo'))).toEqual([]); // and did not go on to the photo pull
    // a set-aside batch from an older build: its re-read runs first in a run; a stop during it must end the run there
    globalThis.fetch = real;
    await A.sync.setup(KEY, 'join');
    const key = logKeys(r2)[0].split('/log/')[1].replace(/\.bin$/, '');
    const meta = mem.meta.get('sync') as { quarantined?: Array<{ key: string; error: string; at: string; build?: string }> };
    meta.quarantined = [{ key, error: 'not a batch this version understands', at: new Date().toISOString(), build: 'older-build' }];
    mem.meta.set('sync', meta);
    const B = await reboot(mem, r2); // reloads the meta with the entry
    const repair = vi.spyOn(B.collection, 'repairNumbers');
    held = 0;
    after.length = 0;
    stopped = false;
    const gate2 = new Promise<void>((r) => (release = r));
    let reached2: () => void = () => {};
    const reachedP2 = new Promise<void>((r) => (reached2 = r));
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input);
      if (stopped) after.push(`${init?.method ?? 'GET'} ${new URL(u, 'http://x').pathname}`); // judged as the request is made: the held one was made before the stop
      if (u.includes(`/api/sync/log/${key}`) && held++ === 0) { reached2(); await gate2; }
      return real(input, init);
    }) as typeof fetch;
    const run2 = B.sync.run().catch((e: Error) => e);
    await reachedP2;
    await B.sync.forget();
    stopped = true;
    release();
    expect(await run2).toBeInstanceOf(Error);
    expect(after).toEqual([]); // nothing more was asked for after the stop: no listing, no photo pull
    expect(repair).not.toHaveBeenCalled(); // and the number repair, which follows the set-aside loop, did not run for a vault this device has left
    globalThis.fetch = real;
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
    await pushAs(keys, '1700000000000', 'x', '000000000001', { v: 1, device: 'x', changes });
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.sync.quarantined[0]?.error).toMatch(/reserved/);
    expect(D.collection.accession('r1')).toBeUndefined();
    expect(mem.changes.size).toBe(0);
  });
  it('a batch with one value of a type its field never takes is set aside whole, so a later build can read it; a word this build does not know folds as it is (round thirty, 1)', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const bad = [
      { t: '1700000000000-0000-x', kind: 'accession', id: 'r1', field: 'taxonName', value: 'Aloe' },
      { t: '1700000000000-0001-x', kind: 'accession', id: 'r1', field: 'status', value: 'growing' },
      { t: '1700000000000-0002-x', kind: 'accession', id: 'r1', field: 'notes', value: { a: 1 } }
    ];
    await pushAs(keys, '1700000000000', 'x', '000000000002', { v: 1, device: 'x', changes: bad });
    const good = [
      { t: '1700000000010-0000-x', kind: 'accession', id: 'r2', field: 'taxonName', value: 'Lithops' },
      { t: '1700000000010-0001-x', kind: 'accession', id: 'r2', field: 'status', value: 'sold' }, // a status a newer build wrote
      { t: '1700000000010-0002-x', kind: 'sowing', id: 's1', field: 'taxonName', value: 'Haworthia' },
      { t: '1700000000010-0003-x', kind: 'sowing', id: 's1', field: 'method', value: 'tissue culture' }, // a method a newer build wrote
      { t: '1700000000010-0004-x', kind: 'sowing', id: 's1', field: 'provenance', value: 'wild' },
      { t: '1700000000010-0005-x', kind: 'sowing', id: 's1', field: 'sown', value: '2026-01-01' },
      { t: '1700000000010-0006-x', kind: 'sowing', id: 's1', field: 'count', value: 3 },
      { t: '1700000000010-0007-x', kind: 'sowing', id: 's1', field: 'status', value: 'active' }
    ];
    await pushAs(keys, '1700000000000', 'x', '000000000007', { v: 1, device: 'x', changes: good });
    const D = await boot(newMem('dddddddddddd'), r2);
    await D.sync.setup(KEY, 'join');
    expect(D.sync.quarantined).toHaveLength(1);
    expect(D.sync.quarantined[0]?.error).toMatch(/notes of a accession must be a string/);
    expect(D.collection.accession('r1')).toBeUndefined(); // nothing of the set-aside batch, not even its good changes
    expect(D.collection.accession('r2')?.status).toBe('sold');
    expect(D.collection.sowing('s1')?.method).toBe('tissue culture');
    expect(D.collection.sowing('s1')?.provenance).toBe('wild');
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

describe('the vault route on a body that is not an object (round sixteen, 16)', () => {
  it('answers 400, never 500, to a JSON null', async () => {
    const r2 = fakeR2();
    await boot(newMem('aaaaaaaaaaaa'), r2);
    for (const body of ['null', '7', '"x"', '']) {
      const r = await fetch('/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      expect(r.status).toBe(400);
    }
  });
});

describe('new vaults have a ceiling (improvements, 1)', () => {
  it('the server answers 503 with a plain sentence once the ceiling in all is met, and the sync page gets that sentence, not a number', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    kv.set('vaults:all', '2000');
    const k = await deriveKeys(KEY);
    const r = await fetch('/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, token: k.token, create: true }) });
    expect(r.status).toBe(503);
    expect(r.headers.get('cache-control')).toBe('no-store');
    await expect(A.sync.setup(KEY, 'create')).rejects.toThrow(/^Sync is not taking new vaults for now/);
    kv.set('vaults:all', '0');
    kv.set(`vaults:all:${new Date().toISOString().slice(0, 10)}`, '200');
    await expect(A.sync.setup(KEY, 'create')).rejects.toThrow(/^Sync has taken all the new vaults it can today/);
    kv.delete(`vaults:all:${new Date().toISOString().slice(0, 10)}`);
    expect(A.sync.configured).toBe(false);
    // the address's own limit is a different sentence
    kv.set('vaults:all', '0');
    kv.set(`vaults:1.1.1.1:${new Date().toISOString().slice(0, 10)}`, '5');
    await expect(A.sync.setup(KEY, 'create')).rejects.toThrow(/^Too many new vaults from this address today\.$/);
    // joining an existing vault is never refused by the ceiling
    kv.clear();
    await A.sync.setup(KEY, 'create');
    kv.set('vaults:all', '2000');
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await expect(B.sync.setup(KEY, 'join')).resolves.toBeUndefined();
  });
});

describe('the vault route under a runtime that gives no client address (round twenty-one, R1-1)', () => {
  it('creates the vault: the address counts as "unknown", never a 500', async () => {
    const r2 = fakeR2();
    await boot(newMem('aaaaaaaaaaaa'), r2);
    const real = globalThis.fetch;
    // the same routes, with getClientAddress answering null as a local runtime can
    const routes = await import('../../src/routes/api/sync/vault/+server');
    const QUEUE = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) };
    const k = await deriveKeys(KEY);
    const request = new Request('http://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, token: k.token, create: true }) });
    const r = await routes.POST({ request, url: new URL(request.url), platform: { env: { STORE: r2, QUEUE, SYNC_OPEN: '1' } }, getClientAddress: () => null as unknown as string, params: {} } as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ created: true });
    expect([...kv.keys()].some((x) => x.startsWith('vaults:unknown:'))).toBe(true);
    globalThis.fetch = real;
  });
});

describe('a creation counted and then not made (round twenty-two, 1)', () => {
  it('refunds the slot on the counter object when the vault write throws, and does not on a join', async () => {
    const r2 = fakeR2();
    await boot(newMem('aaaaaaaaaaaa'), r2);
    const routes = await import('../../src/routes/api/sync/vault/+server');
    const calls: string[] = [];
    const COUNTERS = { idFromName: (n: string) => n, get: () => ({ create: async () => { calls.push('create'); return 'ok' as const; }, refund: async () => { calls.push('refund'); } }) };
    const QUEUE = { get: async () => null, put: async () => {} };
    const k = await deriveKeys(KEY);
    const req = () => new Request('http://x/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: k.id, token: k.token, create: true }) });
    const ev = (request: Request) => ({ request, url: new URL(request.url), platform: { env: { STORE: r2, QUEUE, COUNTERS, SYNC_OPEN: '1' } }, getClientAddress: () => '1.1.1.1', params: {} }) as never;
    const realPut = r2.put.bind(r2);
    r2.put = async () => { throw new Error('r2: blip'); };
    await expect(routes.POST(ev(req()))).rejects.toThrow(/blip/);
    expect(calls).toEqual(['create', 'refund']);
    r2.put = realPut;
    calls.length = 0;
    expect((await routes.POST(ev(req()))).status).toBe(200);
    expect(calls).toEqual(['create']);
    calls.length = 0;
    expect((await routes.POST(ev(req()))).status).toBe(200); // a rejoin of the vault just made: neither counted nor refunded
    expect(calls).toEqual([]);
  });
});

describe('a run that outlives the vault it belongs to (round seventeen, A1 and 4)', () => {
  it('cannot ack the new vault\'s outbox: the key is checked inside the ack, after the old run has already passed every earlier check', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    let held = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const r = await real(input, init);
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) await gate.hold(); // the server has stored the batch; the answer is on its way
      return r;
    }) as typeof fetch;
    const old = A.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    // another tab: stop syncing, join vault B, refill the outbox for it; this tab's engine has heard nothing yet
    const KEY2 = newVaultKey();
    memA.meta.set('sync', { key: KEY2, since: 0, have: [], photosPushed: [], lastSync: null });
    memA.outbox.clear();
    for (const t of memA.changes.keys()) memA.outbox.add(t);
    const before = memA.outbox.size;
    release();
    const err = await old;
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/stopped/);
    expect(memA.outbox.size).toBe(before); // vault B's outbox is whole: the old run's ack was refused
  });
  it('cannot fold an old-vault batch into the new log: the key is checked inside the write', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.run();
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    memD.meta.set('sync', { ...(memD.meta.get('sync') as object), since: 0, have: [] });
    const D3 = await reboot(memD, r2);
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const r = await real(input, init);
      if (/\/api\/sync\/log\/[^?]+/.test(String(input))) await gate.hold(); // the batch body has arrived; the fold is next
      return r;
    }) as typeof fetch;
    const run = D3.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    memD.meta.set('sync', { key: newVaultKey(), since: 0, have: [], photosPushed: [], lastSync: null }); // another tab moved this device to vault B
    const before = memD.changes.size;
    release();
    const err = await run;
    expect(err).toBeInstanceOf(Error);
    expect(memD.changes.size).toBe(before); // nothing of vault A was written into B's log
  });
  it('a stale run that wakes after the new vault\'s first run leaves busy clear, so sync keeps running', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'create');
    await D.collection.addAccession({ taxonName: 'Lithops', acc: 'D-1' });
    await D.sync.run(); // a batch on vault A for the old run to receive
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'join');
    memA.meta.set('sync', { ...(memA.meta.get('sync') as object), since: 0, have: [] });
    const A2 = await reboot(memA, r2);
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    let held = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (!init?.method && /\/api\/sync\/log\?vault=/.test(String(input)) && held++ === 0) { const r = await real(input, init); await gate.hold(); return r; } // the old vault's listing takes a long time
      return real(input, init);
    }) as typeof fetch;
    const old = A2.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A2.sync.forget();
    await A2.sync.setup(newVaultKey(), 'create'); // its first run completes while the old listing is still pending
    const runsAfterSetup = A2.sync.runs;
    release();
    await old;
    expect(A2.sync.busy).toBeNull(); // the stale run did not leave "Receiving 1 of 1…" behind
    expect(A2.sync.lastError).toBeNull();
    await A2.sync.run(); // and a run still runs
    expect(A2.sync.runs).toBe(runsAfterSetup + 1);
  });
});

describe('a stale run\'s verdicts never land on the new vault (round eighteen, 4, 11, 12)', () => {
  it('a late 507 for the old vault does not mark the new vault full', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    let held = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) { await gate.hold(); return new Response('{"bytes":123,"limit":456}', { status: 507 }); }
      return real(input, init);
    }) as typeof fetch;
    const old = A.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A.sync.forget();
    await A.sync.setup(newVaultKey(), 'create'); // the new vault's first run completes
    release();
    await old;
    expect(A.sync.vaultFull).toBeNull(); // the old vault's 507 is not the new vault's
    expect((memA.meta.get('sync') as { vaultFull?: unknown }).vaultFull).toBeUndefined();
  });
  it('a late batch body for the old vault is not set aside in the new vault\'s quarantine', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa'), memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'create');
    await D.collection.addAccession({ taxonName: 'Lithops', acc: 'D-1' });
    await D.sync.run();
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'join');
    memA.meta.set('sync', { ...(memA.meta.get('sync') as object), since: 0, have: [] });
    const A2 = await reboot(memA, r2);
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = gated(); release = gate.release;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const r = await real(input, init);
      if (/\/api\/sync\/log\/[^?]+/.test(String(input))) await gate.hold(); // the batch body is in; the open comes next
      return r;
    }) as typeof fetch;
    const old = A2.sync.run().catch((e: Error) => e);
    await gate.reached; // the run is at the gate, however loaded the machine (round forty-four)
    await A2.sync.forget();
    await A2.sync.setup(newVaultKey(), 'create');
    release();
    const err = await old;
    expect(String((err as Error).message)).toMatch(/stopped/);
    expect(A2.sync.quarantined).toEqual([]);
    expect((memA.meta.get('sync') as { quarantined?: unknown[] }).quarantined ?? []).toEqual([]);
    expect(A2.sync.busy).toBeNull();
  });
  it('"Stop syncing" during a run clears the busy flag at once, so the icon stops', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && /\/api\/sync\/log\?/.test(String(input)) && held++ === 0) await gate;
      return real(input, init);
    }) as typeof fetch;
    const old = A.sync.run().catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 50));
    expect(A.sync.busy).not.toBeNull();
    await A.sync.forget();
    expect(A.sync.busy).toBeNull();
    release();
    await old;
    expect(A.sync.busy).toBeNull();
  });
  it('a device whose stored meta predates the arrival cursor runs on its first page load', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    await A.sync.run();
    const stored = memA.meta.get('sync') as { key: string; photosPushed: string[]; lastSync: string | null };
    memA.meta.set('sync', { key: stored.key, own: [], cursor: '', firstPushDone: true, photosPushed: stored.photosPushed, lastSync: stored.lastSync }); // the HLC-cursor engine's shape
    const A2 = await reboot(memA, r2);
    expect(A2.sync.configured).toBe(true);
    await A2.sync.run(); // did not throw "stopped"
    expect(A2.sync.lastError).toBeNull();
    expect(A2.sync.runs).toBe(1);
  });
});

describe('a removed photograph\'s pixels go from every device and from the server (round forty-nine, 1)', () => {
  it('the device that folds the removal drops its pixels; past ten minutes one device asks the server to drop the bytes, which leave the count, and the id leaves photosPushed', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pone000000001';
    const pid2 = 'ptwo000000002';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6, sha });
    // The second was taken twenty minutes ago on another device, and restored here from its file.
    memB.photos.set(pid2, { id: pid2, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    const old = (count: number, field: string, value: unknown) => ({ t: hlcEncode({ wall: Date.now() - 20 * 60_000, count, device: 'cccccccccccc' }), kind: 'photo' as const, id: pid2, field, value });
    await B.collection.ingest([old(0, 'acc', a.id), old(1, 'd', '2026-01-01'), old(2, 'w', 1), old(3, 'h', 1), old(4, 'bytes', 6), old(5, 'sha', sha)], 'import');
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    expect(memD.photos.size).toBe(2);
    const photoKeys = () => [...r2.objs.keys()].filter((k) => k.includes('/photo/'));
    expect(photoKeys()).toHaveLength(2);
    // B removes it, just now: the server keeps the bytes for the Undo's sake.
    mem = memB;
    await (await import('$lib/db/collection.svelte')).collection.load();
    const Bc = B.collection;
    await Bc.removePhoto(pid);
    expect(memB.photos.size).toBe(1);
    await B.sync.run();
    expect(photoKeys()).toHaveLength(2);
    expect(D.calls.filter((c) => c.startsWith('DELETE'))).toHaveLength(0);
    // D folds the removal: its pixels go.
    mem = memD;
    await D.sync.run();
    expect(memD.photos.size).toBe(1);
    expect(memD.photos.has(pid2)).toBe(true);
    // A removal eleven minutes old (one made on another device, say, arriving now): the server is asked.
    mem = memB;
    await Bc.ingest([{ t: hlcEncode({ wall: Date.now() - 11 * 60_000, count: 0, device: 'cccccccccccc' }), kind: 'photo', id: pid2, field: '_deleted', value: true }], 'import');
    await B.sync.run();
    // (global fetch is the last booted device's, so every call from here is in D's list)
    expect(D.calls.filter((c) => c === `DELETE /api/sync/photo/${pid2}`)).toHaveLength(1);
    expect(photoKeys()).toHaveLength(1);
    expect(memB.photos.size).toBe(0);
    const sm = memB.meta.get('sync') as { photosPushed: string[]; photosDropped?: string[] };
    expect(sm.photosPushed).not.toContain(pid2);
    expect(sm.photosDropped).toEqual([pid2]);
    await B.sync.run(); // asked once, not every run
    expect(D.calls.filter((c) => c === `DELETE /api/sync/photo/${pid2}`)).toHaveLength(1);
  });
  it('round fifty-one, 2: a photograph brought back after a peer had the server drop its bytes is sent again from the device that kept the pixels, and the removal carries a proof the token alone cannot make', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    mem = memB;
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pone000000001';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6, sha });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const photoKeys = () => [...r2.objs.keys()].filter((k) => k.includes('/photo/'));
    expect(photoKeys()).toHaveLength(1);
    expect(r2.objs.get(photoKeys()[0])!.md?.drop).toMatch(/^[0-9a-f]{64}$/); // the upload left its proof
    // B removes it; the removal reaches D, which drops its pixels. The removal is then old enough on D for the server to be asked.
    mem = memB;
    await (await import('$lib/db/collection.svelte')).collection.load();
    const undo = await B.collection.removePhoto(pid);
    await B.sync.run();
    mem = memD;
    await D.sync.run();
    expect(memD.photos.size).toBe(0);
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ['Date'] });
    try {
      await D.sync.run();
      expect(D.calls.filter((c) => c === `DELETE /api/sync/photo/${pid}`)).toHaveLength(1);
      expect(photoKeys()).toHaveLength(0); // gone from the server, with the proof
      // B, meanwhile offline, taps Undo: the pixels are back on B and the record is live. B's next run sends it again,
      // although `photosPushed` lists it, and D's next pull has it.
      mem = memB;
      await undo();
      expect(memB.photos.size).toBe(1);
      await B.sync.run();
      expect(photoKeys()).toHaveLength(1);
      mem = memD;
      await D.sync.run();
      expect(memD.photos.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('round fifty-two, 1: a change from a clock years ahead is parked, not held, and the device that made it converges once corrected', () => {
  it('peers park it by its arrival; the fast device, corrected, parks its own and stops stamping ahead; Apply re-writes it at real time everywhere', async () => {
    // The correction and its pending reading live in localStorage, which this Node lacks: a stand-in, so a reboot keeps them as a browser would.
    const store = new Map<string, string>();
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    // One store per device (keyed by the device whose vault is in play), as each browser has its own.
    const sk = (k: string) => `${mem.device}:${k}`;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(sk(k)) ?? null, setItem: (k: string, v: string) => void store.set(sk(k), v), removeItem: (k: string) => void store.delete(sk(k)) } });
    try {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memP = newMem('pppppppppppp');
    let A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'bought at the show' });
    await A.sync.setup(KEY, 'create');
    // P is five years ahead. Its join is one reading; its edit is stamped 2031.
    const real = Date.now();
    serverClock = real;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + 5 * 365 * 86_400_000);
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    await P.collection.put('accession', plant.id, { notes: 'from 2031' });
    await P.sync.run();
    expect(P.collection.accession(plant.id)?.notes).toBe('from 2031'); // its own, on its own screen, while it still believes its clock
    // A pulls: parked by arrival, not held; nothing comes due; the record's page lists it.
    vi.setSystemTime(real);
    A = await reboot(memA, r2);
    await A.sync.run();
    expect(A.collection.accession(plant.id)?.notes).toBe('bought at the show');
    expect(A.sync.held).toBe(0);
    expect(A.collection.parkedFor('accession', plant.id).map((c) => c.field).sort()).toEqual(['notes', 'notesBase']);
    expect(A.collection.parkedRecords).toBe(1);
    // A's own edit is stamped now and shows at once on a third, correct device.
    await A.collection.put('accession', plant.id, { notes: 'no: leave it until spring' });
    await A.sync.run();
    const C = await boot(newMem('cccccccccccc'), r2);
    await C.sync.setup(KEY, 'join');
    expect(C.collection.accession(plant.id)?.notes).toBe('no: leave it until spring');
    expect(C.collection.parkedRecords).toBe(1);
    // P syncs again a minute later: the second reading corrects it. Its 2031 stamps are parked here too, its view
    // converges, and its next edit is stamped by real time, not just past its 2031 stamp.
    vi.setSystemTime(real + 5 * 365 * 86_400_000 + 90_000);
    serverClock = real + 90_000;
    P = await reboot(memP, r2);
    await P.sync.run();
    expect(P.collection.accession(plant.id)?.notes).toBe('no: leave it until spring');
    expect(P.collection.parkedFor('accession', plant.id).length).toBeGreaterThan(0);
    await P.collection.put('accession', plant.id, { notes: 'P, corrected' });
    const mine = [...memP.changes.values()].find((c) => c.value === 'P, corrected')!;
    expect(hlcWall(mine.t)).toBeLessThan(real + 86_400_000); // real time, not 2031
    await P.sync.run();
    vi.setSystemTime(real + 120_000); // A and C are correct devices: the fake clock is theirs again
    serverClock = real + 120_000;
    await A.sync.run();
    expect(A.collection.accession(plant.id)?.notes).toBe('P, corrected');
    // Apply on A takes the parked values as an edit made now; the parked stamps stay parked everywhere.
    await A.collection.applyParked('accession', plant.id);
    expect(A.collection.accession(plant.id)?.notes).toBe('from 2031');
    expect(A.collection.parkedFor('accession', plant.id)).toHaveLength(0);
    await A.sync.run();
    await C.sync.run();
    expect(C.collection.accession(plant.id)?.notes).toBe('from 2031');
    expect(C.sync.held).toBe(0);
    } finally {
      vi.useRealTimers();
      serverClock = null;
      if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('round fifty-two, 2: a revived photograph is sent again whichever device revives it and whatever failed in between', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  it('the removing device pushed the removal but its pull failed; a peer had the bytes dropped; Undo here still re-sends', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    mem = memB;
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const pid = 'pone000000001';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6, sha });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const photoKeys = () => [...r2.objs.keys()].filter((k) => k.includes('/photo/'));
    expect(photoKeys()).toHaveLength(1);
    mem = memB;
    await (await import('$lib/db/collection.svelte')).collection.load();
    const undo = await B.collection.removePhoto(pid);
    // the push lands, the listing after it fails: no successful pull records the removal for the last-run rule
    const realFetch = globalThis.fetch;
    let failed = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { if (!failed && String(input).includes('/api/sync/log?') && (!init?.method || init.method === 'GET')) { failed = true; throw new TypeError('Failed to fetch'); } return realFetch(input, init); }) as typeof fetch;
    await B.sync.run().catch(() => {});
    globalThis.fetch = realFetch;
    expect(failed).toBe(true);
    mem = memD;
    await D.sync.run();
    expect(memD.photos.size).toBe(0);
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ['Date'] });
    try {
      await D.sync.run();
      expect(photoKeys()).toHaveLength(0);
      mem = memB;
      await undo();
      await B.sync.run();
      expect(photoKeys()).toHaveLength(1); // verified by HEAD, found gone, sent again
      mem = memD;
      await D.sync.run();
      expect(memD.photos.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a third device, offline through the removal and the drop, edits the caption; its pixels are sent when it syncs', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    mem = memB;
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const pid = 'pone000000001';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6, sha });
    await B.sync.setup(KEY, 'create');
    const memC = newMem('cccccccccccc');
    const C = await boot(memC, r2);
    await C.sync.setup(KEY, 'join');
    expect(memC.photos.size).toBe(1);
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    const photoKeys = () => [...r2.objs.keys()].filter((k) => k.includes('/photo/'));
    // B removes and pushes; D folds and, eleven minutes on, has the bytes dropped. C is offline the whole time.
    mem = memB;
    await (await import('$lib/db/collection.svelte')).collection.load();
    await B.collection.removePhoto(pid);
    await B.sync.run();
    mem = memD;
    await D.sync.run();
    vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ['Date'] });
    try {
      await D.sync.run();
      expect(photoKeys()).toHaveLength(0);
      // C, still offline, captions the photograph: an edit after a removal revives the record. Then it syncs.
      mem = memC;
      await (await import('$lib/db/collection.svelte')).collection.load();
      await C.collection.put('photo', pid, { caption: 'the first flower' });
      await C.sync.run();
      expect(C.collection.photo(pid)).toBeDefined();
      expect(photoKeys()).toHaveLength(1); // C saw the removal fold as it pulled, asked the server, and sent its pixels
      mem = memD;
      await D.sync.run();
      expect(memD.photos.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a sync run that receives nothing writes nothing (round fifty-eight; the client review\'s finding 9)', () => {
  it('opening the app with sync on and two plants under one number: neither the load nor a run that folds nothing repairs it; a pull that brings the number does', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    let A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    const now = Date.now() - 60_000;
    const put = (id: string, wall: number, acc: string) => [
      { t: hlcEncode({ wall, count: 0, device: 'aaaaaaaaaaaaq1q1' }), kind: 'accession' as const, id, field: 'taxonName', value: 'Lithops' },
      { t: hlcEncode({ wall, count: 1, device: 'aaaaaaaaaaaaq1q1' }), kind: 'accession' as const, id, field: 'status', value: 'growing' },
      { t: hlcEncode({ wall, count: 2, device: 'aaaaaaaaaaaaq1q1' }), kind: 'accession' as const, id, field: 'acc', value: acc }
    ];
    for (const c of [...put('r1', now, '2026-0007'), ...put('r2', now + 1, '2026-0007')]) memA.changes.set(c.t, c);
    memA.outbox.clear();
    A = await reboot(memA, r2);
    const before = memA.changes.size;
    expect(A.collection.sharesNumber('accession', 'r2')).toEqual(['r1']);
    await A.sync.run(); // the focus listener or the five-minute timer
    expect(memA.changes.size).toBe(before); // rule 5: a run that merged nothing wrote nothing
    expect(A.collection.sharesNumber('accession', 'r2')).toEqual(['r1']); // the page still offers the repair
    // another device's plant arrives under the same number: the pull that folds it repairs that number
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.sync.setup(KEY, 'join');
    await B.collection.ingest([
      { t: hlcEncode({ wall: now + 5000, count: 0, device: 'bbbbbbbbbbbbq2q2' }), kind: 'accession', id: 'r9', field: 'taxonName', value: 'Aloe' },
      { t: hlcEncode({ wall: now + 5000, count: 1, device: 'bbbbbbbbbbbbq2q2' }), kind: 'accession', id: 'r9', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: now + 5000, count: 2, device: 'bbbbbbbbbbbbq2q2' }), kind: 'accession', id: 'r9', field: 'acc', value: '2026-0007' }
    ], 'import', { repair: false });
    await B.sync.run();
    await A.sync.run();
    expect(A.collection.accessions.filter((x) => accNo(x) === '2026-0007').map((x) => x.id)).toEqual(['r1']); // made first, keeps it
    expect(A.collection.sharesNumber('accession', 'r1')).toEqual([]);
  });
});
