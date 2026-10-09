/**
 * Round sixty-one (agent L): the sync engine's halves of decisions 1, 5, 6 and 10, end to end through the real routes.
 *  - Decision 1: a device's own batches are judged by the arrival the listing gives, as a peer's are; an edit stamped past
 *    a far-ahead stamp (flagged) is never parked; a device that pushed before this round lists the vault once for them.
 *  - Decision 6: the 503 refusal is kept in the sync record, so a reload or another tab respects it; a short 503 (a
 *    recount that crossed a landing, a photograph held a moment) is no refusal, and the next run tries again.
 *  - Decision 10: in the sample collection the engine's setup refuses and its run does nothing.
 * The harness is r60-review-server-engine.test.ts's own, copied whole (it is not exported), as the harness review's
 * harness--engine-refusal.test.ts did.
 */
// Adopted in round 60 from the round-59 reviews (server review, the engine's side of the vault ceiling; docs/review-59/tests).
/**
 * The sync engine end to end: the vault is an in-memory fake; the collection
 * store, the engine and the real route handlers run unmodified, wired
 * together through a fake fetch and a fake R2, so the outbox → server → pull
 * path under test is the real one.
 */
import { hlcWall } from '$core/log';
import { describe, it, expect, vi, afterEach, beforeEach, afterAll } from 'vitest';
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

const ss = new Map<string, string>();
const hadSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const lsStore = new Map<string, string>();
const hadLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  ss.clear();
  lsStore.clear();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, v), removeItem: (k: string) => void ss.delete(k) } });
  // One store per device (keyed by the device whose vault is in play), as each browser has its own.
  const sk = (k: string) => `${mem.device}:${k}`;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => lsStore.get(sk(k)) ?? null, setItem: (k: string, v: string) => void lsStore.set(sk(k), v), removeItem: (k: string) => void lsStore.delete(sk(k)) } });
});
afterAll(() => {
  if (hadSession) Object.defineProperty(globalThis, 'sessionStorage', hadSession); else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  if (hadLocal) Object.defineProperty(globalThis, 'localStorage', hadLocal); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('decision 6: the refusal is kept in the sync record', () => {
  it('a reload, and another tab of the same browser, respect it: no upload until it lapses, and receiving carries on', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    let A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    kv.set('vaults:all', '2000'); // the ceiling is met meanwhile: the server refuses with Retry-After: 86400
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    await A.sync.run().catch(() => {});
    expect(A.sync.refusal).not.toBeNull();
    const kept = (memA.meta.get('sync') as { refusal?: { until: number } }).refusal;
    expect(kept?.until).toBe(A.sync.refusal!.until); // in the sync record, not only this tab's memory (round 60: memory only)
    expect(kept!.until).toBeLessThanOrEqual(Date.now() + 3_600_000 + 1000); // the engine's hour, not the server's day
    // A reload (or another tab: the same browser's record, a new engine): the refusal stands, and the run sends nothing.
    A = await reboot(memA, r2);
    expect(A.sync.refusal?.until).toBe(kept!.until);
    const b0 = A.calls.length;
    await A.sync.run().catch(() => {});
    expect(A.calls.slice(b0)).toContain('GET /api/sync/log');
    expect(A.calls.slice(b0).filter((c) => c === 'POST /api/sync/log')).toHaveLength(0);
    // An hour on, with places free again, the upload goes, and the record no longer carries the refusal.
    kv.set('vaults:all', '0');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(kept!.until + 60_000);
    A = await reboot(memA, r2);
    const b1 = A.calls.length;
    await A.sync.run().catch(() => {});
    expect(A.calls.slice(b1).filter((c) => c === 'POST /api/sync/log').length).toBeGreaterThan(0);
    expect(A.sync.refusal).toBeNull();
    expect((memA.meta.get('sync') as { refusal?: unknown }).refusal).toBeUndefined();
  });
  // Harness review of round sixty-one, mutation E2.
  it('a refusal read back from the record after the clock was set back is held to an hour from now, not to the stored time', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    let A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    kv.set('vaults:all', '2000');
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    await A.sync.run().catch(() => {});
    const rec = memA.meta.get('sync') as { refusal?: { until: number; text: string } };
    expect(rec.refusal).toBeDefined();
    rec.refusal!.until = Date.now() + 10 * 3_600_000; // stored an hour ahead by a clock nine hours fast, since set right
    A = await reboot(memA, r2);
    expect(A.sync.refusal).not.toBeNull();
    expect(A.sync.refusal!.until).toBeLessThanOrEqual(Date.now() + 3_600_000 + 1000);
    kv.set('vaults:all', '0');
  });
  it('a 503 asking for a few seconds (a recount that crossed a landing) is no refusal: nothing is kept, and the next run sends', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    const real = globalThis.fetch;
    let crossed = true;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (crossed && init?.method === 'POST' && String(input).includes('/api/sync/log')) { crossed = false; return new Response(JSON.stringify({ error: 'The site could not count this vault just now; try again in a moment.' }), { status: 503, headers: { 'retry-after': '5', 'content-type': 'application/json' } }); }
      return real(input, init);
    }) as typeof fetch;
    try {
      const err = await A.sync.run().then(() => null, (e: Error & { retryAfterMs?: number }) => e);
      expect(err?.retryAfterMs).toBe(5000); // rescheduled for then
      expect(A.sync.refusal).toBeNull();
      expect((memA.meta.get('sync') as { refusal?: unknown }).refusal).toBeUndefined();
      const b0 = A.calls.length;
      await A.sync.run();
      expect(A.calls.slice(b0).filter((c) => c === 'POST /api/sync/log').length).toBeGreaterThan(0);
      expect(A.sync.pending).toBe(0);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('decision 10: no sync in the sample collection, whatever the page shows', () => {
  it('setup refuses and a run asks the server nothing', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    ss.set('cultifolio.demo', '1');
    await expect(A.sync.setup(KEY, 'create')).rejects.toThrow(/sample collection/);
    expect(A.calls).toEqual([]);
    expect(memA.meta.get('sync')).toBeUndefined();
    // a device that had a key before the tab entered the sample: its run does nothing while the sample is open
    ss.delete('cultifolio.demo');
    await A.sync.setup(KEY, 'create');
    ss.set('cultifolio.demo', '1');
    await A.collection.addAccession({ taxonName: 'Lithops', acc: 'A-1' });
    const b0 = A.calls.length;
    await A.sync.run();
    expect(A.calls.slice(b0)).toEqual([]);
  });
});

describe('decision 1: this device\'s own changes judged by their arrival, through the real engine', () => {
  const DAY = 86_400_000;
  const YEAR = 365 * DAY;
  it('a device a year fast, put right offline, edits a field it wrote then: the edit (flagged) shows on it at once and on the peer after the sync; the old stamp is parked on both', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memP = newMem('pppppppppppp');
    let A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'bought at the show' });
    await A.sync.setup(KEY, 'create');
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR);
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    vi.setSystemTime(real + YEAR + 2 * 60_000);
    await P.collection.put('accession', plant.id, { notes: 'typed a year fast' });
    // Pushed with no listing after it this run: the server's Date answers nothing here (no header), and the pull fails.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => (String(input).includes('/api/sync/log?') && (!init?.method || init.method === 'GET') ? new Response('no', { status: 502 }) : realFetch(input, init))) as typeof fetch;
    await P.sync.run().catch(() => {});
    globalThis.fetch = realFetch;
    expect(P.sync.pending).toBe(0); // it reached the server
    vi.setSystemTime(real + 5 * 60_000); // put right by hand
    P = await reboot(memP, r2);
    expect(P.collection.accession(plant.id)?.notes).toBe('typed a year fast'); // its own, not yet judged
    await P.collection.put('accession', plant.id, { notes: 'typed after the clock was put right' });
    expect(P.collection.accession(plant.id)?.notes).toBe('typed after the clock was put right');
    const edit = [...memP.changes.values()].find((c) => c.value === 'typed after the clock was put right')!;
    const fast = [...memP.changes.values()].find((c) => c.value === 'typed a year fast')!;
    expect(hlcWall(edit.t) - real).toBeGreaterThan(YEAR - DAY);
    const { isPastStamp } = await import('$core/hlc');
    expect(isPastStamp(edit.t)).toBe(true);
    const c0 = P.calls.length;
    await P.sync.run();
    expect(P.collection.parkedStamps.has(fast.t)).toBe(true); // parked by its own batch's arrival, from the listing
    // Only the batch pushed while fast is fetched again to be judged: the edit's batch holds no stamp a clock gave (its one
    // stamp is flagged), so `ownMax` leaves it out and it is never fetched (harness review of round sixty-one, mutation C8).
    expect(P.calls.slice(c0).filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(1);
    expect(P.collection.accession(plant.id)?.notes).toBe('typed after the clock was put right');
    expect(P.collection.parkedFor('accession', plant.id)).toEqual([]); // the replaced text is not offered back
    mem = memA;
    A = await reboot(memA, r2);
    await A.sync.run();
    expect(A.collection.accession(plant.id)?.notes).toBe('typed after the clock was put right');
    expect(A.collection.parkedStamps.has(fast.t)).toBe(true);
    // and a correct device's next edit shows on both
    await A.collection.put('accession', plant.id, { notes: 'A, later' });
    await A.sync.run();
    mem = memP;
    P = await reboot(memP, r2);
    await P.sync.run();
    expect(P.collection.accession(plant.id)?.notes).toBe('A, later');
  });
  it('five rounds, one field, the real engine: a correct device\'s edits show on the formerly fast device every round (the clock review\'s five-round test; round sixty: never)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memP = newMem('pppppppppppp');
    let A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'made on A' });
    await A.sync.setup(KEY, 'create');
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR);
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    await P.collection.put('accession', plant.id, { notes: 'P while a year fast' });
    await P.sync.run();
    vi.setSystemTime(real + 60_000); // P put right
    const rows: string[] = [];
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(real + i * 120_000);
      mem = memA; A = await reboot(memA, r2);
      await A.collection.put('accession', plant.id, { notes: `A round ${i}` });
      await A.sync.run();
      mem = memP; P = await reboot(memP, r2);
      await P.sync.run();
      rows.push(`${i}: A=${A.collection.accession(plant.id)?.notes} P=${P.collection.accession(plant.id)?.notes}`);
    }
    expect(rows).toEqual([1, 2, 3, 4, 5].map((i) => `${i}: A=A round ${i} P=A round ${i}`));
    expect(P.collection.parkedRecords).toBe(1); // P's year-ahead edit, listed with Apply on P as on A
  });
  it('a device that pushed a far-ahead batch before this round lists the vault once and parks it by its arrival; a later run lists as usual', async () => {
    const r2 = fakeR2();
    const memP = newMem('pppppppppppp');
    let P = await boot(memP, r2);
    const plant = await P.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'P-1', notes: 'today' });
    await P.sync.setup(KEY, 'create');
    // A batch of P's own, pushed by a build that did not judge its own batches: three days ahead of its arrival.
    const keys = await deriveKeys(KEY);
    const wall = Date.now() + 3 * DAY;
    const t = hlcEncode({ wall, count: 0, device: 'pppppppppppptab0' });
    const far: Change = { t, kind: 'accession', id: plant.id, field: 'notes', value: 'three days fast' };
    const name = `${String(Math.floor(wall / 3_600_000) * 3_600_000).padStart(13, '0')}-0000-pppppppppppp-000000000abc`;
    expect((await post(keys, name, await sealJson(keys, 'log', { v: 1, device: 'pppppppppppp', changes: [far] }, name))).status).toBe(200);
    memP.changes.set(t, far);
    const sm = memP.meta.get('sync') as { have: string[]; since: number; ownListed?: boolean; ownMax?: Record<string, number> };
    sm.have.push(name);
    sm.since = Date.now() + 60_000; // the cursor is past it: no listing would show it again
    delete sm.ownListed;
    delete sm.ownMax;
    P = await reboot(memP, r2);
    expect(P.collection.accession(plant.id)?.notes).toBe('three days fast'); // folded as its own, as round sixty did
    const b0 = P.calls.length;
    await P.sync.run();
    expect(P.calls.slice(b0).filter((c) => c === 'GET /api/sync/log').length).toBeGreaterThanOrEqual(2); // the run's listing, and the one listing of the whole vault
    expect(P.calls.slice(b0)).toContain(`GET /api/sync/log/${name}`);
    expect(P.collection.accession(plant.id)?.notes).toBe('today');
    expect(P.collection.parkedRecords).toBe(1);
    expect((memP.meta.get('sync') as { ownListed?: boolean }).ownListed).toBe(true);
    const b1 = P.calls.length;
    await P.sync.run();
    expect(P.calls.slice(b1).filter((c) => c === 'GET /api/sync/log')).toHaveLength(1);
    expect(P.calls.slice(b1).filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(0);
  });
});

describe('the engine\'s clock listener (the clock review\'s 10; P3)', () => {
  it('a reading that first confirms the clock makes the tab judge its holds again: a peer change three days ahead, held while the clock was unchecked, is parked for this load, not stored, and leaves the held count', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.init(); // as the layout does on every page, before any vault: the listener is hooked here
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'mine' });
    await A.sync.setup(KEY, 'create'); // the harness's listing carries no Date header: no reading, the clock unchecked
    const hlc = await import('$core/hlc'); // the module the engine and the collection were booted with
    expect(hlc.clockChecked()).toBe(false);
    const ahead = hlcEncode({ wall: Date.now() + 3 * 86_400_000, count: 0, device: 'cccccccccccc' });
    await A.collection.ingest([{ t: ahead, kind: 'accession', id: plant.id, field: 'notes', value: 'from a file, three days ahead' }], 'import');
    expect(A.collection.heldWaiting).toBe(1);
    await vi.waitFor(() => expect(A.sync.held).toBe(1));
    hlc.trustServerTime(Date.now()); // a sync reading agrees: the clock is confirmed, and the listener runs
    await vi.waitFor(() => expect(A.collection.parkedRecords).toBe(1));
    await vi.waitFor(() => expect(A.sync.held).toBe(0));
    expect(A.collection.heldWaiting).toBe(0);
    expect(A.collection.accession(plant.id)?.notes).toBe('mine');
    expect((memA.meta.get('parked') as string[] | undefined) ?? []).toEqual([]); // a verdict of the clock alone is not stored (rule 5)
  });
});
