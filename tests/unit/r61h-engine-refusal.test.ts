/**
 * Adopted in round sixty-one from docs/review-60/tests (the harness review); "PASSES"/"FAILS" below describe round-sixty code.
 * Harness review of round sixty: the engine's 503 refusal (src/lib/sync/engine.svelte.ts refusedBy / waitRefusal).
 * The adopted test ("waits out its Retry-After instead of asking again") asserts the refusal lasts AT LEAST an hour and
 * that the next run sends nothing; its comment says "held to the engine's hour at most", which it does not check, and
 * nothing checks that receiving carries on meanwhile or that uploads resume once the time has passed. Single-line
 * mutations that passed: the cap raised to a day; the refusal never lapsing; the refusal's error losing its
 * retryAfterMs (so the run throws before the pull and nothing is received while refused).
 * PASSES on round-sixty code; FAILS under each of those mutations.
 * The harness below is r60-review-server-engine.test.ts's own, copied whole (it is not exported).
 * Adopted in round sixty-one (agent H; docs/review-60/harness.md). Run: `npx vitest run tests/unit/r61h-engine-refusal.test.ts`.
 */
// Adopted in round 60 from the round-59 reviews (server review, the engine's side of the vault ceiling; docs/review-59/tests).
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
  // Copies in and out, as IndexedDB gives: handing out the stored object made two tabs share one sync record, so a
  // run's reload of it did nothing in any test and a held list kept only in memory was never lost (round fifty-nine;
  // the harness review, 1).
  getMeta: async (k: string) => structuredClone(mem.meta.get(k)),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, structuredClone(v)),
  setMetaIfKey: async (k: string, v: unknown, key: string) => {
    const had = mem.meta.get(k) as { key?: string } | null | undefined;
    if (!had || had.key !== key) return false;
    mem.meta.set(k, structuredClone(v));
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
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(structuredClone(mem.meta.get(k))); mem.meta.set(k, structuredClone(next)); return next; };
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
const kvOf = new WeakMap<object, Map<string, string>>();

/** A fresh collection + engine (module singletons) for one "device", and the real route handlers behind global fetch. */
/**
 * One lock manager per simulated browser (per vault store), as `navigator.locks` is per browser: the devices in this
 * file share one process, and Node from 24 on has a `navigator.locks` of its own, which would make every device one
 * browser and every run after a deliberately stalled one find the lock taken (round fifty-eight, after the deploy run).
 * Only what the engine asks for: `ifAvailable`, exclusive.
 */
const browserLocks = new WeakMap<Mem, LockManager>();
function locksOf(m: Mem): LockManager {
  let l = browserLocks.get(m);
  if (!l) {
    const held = new Set<string>();
    l = {
      request: async (name: string, opts: LockOptions, cb: (lock: Lock | null) => Promise<unknown>) => {
        if (!opts?.ifAvailable) throw new Error('the engine only asks ifAvailable');
        if (held.has(name)) return cb(null);
        held.add(name);
        try { return await cb({ name, mode: 'exclusive' } as Lock); } finally { held.delete(name); }
      },
      query: async () => ({ held: [...held].map((name) => ({ name, mode: 'exclusive' as const })), pending: [] })
    } as unknown as LockManager;
    browserLocks.set(m, l);
  }
  return l;
}

async function boot(m: Mem, r2: ReturnType<typeof fakeR2>) {
  mem = m;
  vi.resetModules();
  const routes = {
    vault: await import('../../src/routes/api/sync/vault/+server'),
    log: await import('../../src/routes/api/sync/log/+server'),
    batch: await import('../../src/routes/api/sync/log/[key]/+server'),
    photo: await import('../../src/routes/api/sync/photo/[id]/+server')
  };
  // A KV for the counters and the rate limit: without one the Worker refuses every creation (finding 39a). One per
  // server (per bucket), kept across a device's reboot as the real one is: a fresh map at each boot forgot the vault's
  // counters, and a test of what a rebooted device reads from the server read a server that had forgotten (round fifty-nine).
  for (const s of booted) { const t = (s as unknown as { timer: ReturnType<typeof setTimeout> | null }).timer; if (t) clearTimeout(t); }
  kv = kvOf.get(r2) ?? new Map<string, string>();
  kvOf.set(r2, kv);
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
  sync.locks = locksOf(m);
  booted.push(sync);
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

/**
 * Every engine a test booted, retired when the test ends: a run an edit scheduled (2.5 s on a real timer) would otherwise
 * fire during a later test, against that test's store and server, since the stand-ins read whichever device is in play,
 * and under the one key every test shares it would take that device's sync record as its own (round fifty-eight).
 */
const booted: Array<{ configured: boolean }> = [];
afterEach(() => {
  vi.useRealTimers();
  for (const s of booted.splice(0)) {
    const t = (s as unknown as { timer: ReturnType<typeof setTimeout> | null }).timer;
    if (t) clearTimeout(t);
    s.configured = false;
  }
});

/**
 * Whether the collection's own fold passes the hold to apply(): asserted below, where it was a gate that would have
 * switched the two assertions off silently had the call site been lost (round fifty-nine; outside review).
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

/* ------------------------------------------------------------------ round 59 server review */

describe('harness review: a refusal of uploads', () => {
  it('is held to an hour at most, lets the device keep receiving, and lapses: uploads resume once its time has passed', async () => {
    const r2 = fakeR2();
    const A = await boot(newMem('aaaaaaaaaaaa'), r2);
    await A.sync.setup(KEY, 'create');
    kv.set('vaults:all', '2000'); // the ceiling is met by other growers meanwhile; the server says Retry-After: 86400
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    const t0 = Date.now();
    const b0 = A.calls.length;
    await A.sync.run().catch(() => {});
    expect(A.sync.refusal).not.toBeNull();
    expect(A.calls.slice(b0)).toContain('GET /api/sync/log'); // the refused run still received
    expect(A.sync.refusal!.until).toBeGreaterThanOrEqual(t0 + 3_600_000 - 1000);
    expect(A.sync.refusal!.until).toBeLessThanOrEqual(Date.now() + 3_600_000 + 1000); // the engine's hour, not the server's day
    // while refused, a run still lists and receives; it sends nothing
    const b1 = A.calls.length;
    await A.sync.run().catch(() => {});
    expect(A.calls.slice(b1)).toContain('GET /api/sync/log');
    expect(A.calls.slice(b1).filter((c) => c === 'POST /api/sync/log')).toHaveLength(0);
    // an hour on, with places free again, the upload goes and the refusal is gone
    kv.set('vaults:all', '0');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(t0 + 3_600_000 + 60_000);
    const b2 = A.calls.length;
    await A.sync.run().catch(() => {});
    expect(A.calls.slice(b2).filter((c) => c === 'POST /api/sync/log').length).toBeGreaterThan(0);
    expect(A.sync.refusal).toBeNull();
  });

  it('a photograph answered 503 (held by another device for a moment) is a short wait in the server\'s words: the run still receives, and the photo is sent next time', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const pid = 'pone000000002';
    memB.photos.set(pid, { id: pid, blob: new Blob([new Uint8Array([1, 2, 3, 4])]), thumb: new Blob([new Uint8Array([9])]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 4 });
    const real = globalThis.fetch;
    const busy = 'Another device is storing or removing this photograph just now; it will try again shortly.';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT' && String(input).includes('/api/sync/photo/')) { B.calls.push('PUT (busy)'); return new Response(JSON.stringify({ error: busy }), { status: 503, headers: { 'retry-after': '5', 'content-type': 'application/json' } }); }
      return real(input, init);
    }) as typeof fetch;
    const b0 = B.calls.length;
    const err = await B.sync.run().then(() => null, (e: Error) => e);
    globalThis.fetch = real;
    expect(B.calls.slice(b0)).toContain('PUT (busy)');
    expect(B.calls.slice(b0)).toContain('GET /api/sync/log'); // receiving carried on
    expect(err?.message ?? '').not.toMatch(/photo push failed/);
    expect(B.sync.lastError ?? '').not.toMatch(/photo push failed/);
    expect((err as (Error & { retryAfterMs?: number }) | null)?.retryAfterMs).toBe(5000);
    expect(B.sync.refusal).toBeNull(); // a few seconds' wait is not a refusal of the vault
    await B.sync.run();
    expect((memB.meta.get('sync') as { photosPushed: string[] }).photosPushed).toContain(pid);
  });
});
