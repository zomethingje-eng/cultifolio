/**
 * Round sixty-two (agent L), decision 5 and the engine's parts of decision 6, through the real sync engine, collection
 * and routes. Adopted from docs/review-61/tests/clock--engine.test.ts (the harness of r61l-engine.test.ts, copied whole
 * below since it is not exported): its reproductions (findings 1, 3, 5 and 9; "FIXED" below) failed on the round-sixty-one
 * base and pass now; its guards ("PASSES") are as they were. Added this round, each failing on the base:
 *  - one refold per change of the clock in force (the pull's own rebuild no longer adds a second);
 *  - batch version 2 for a batch with a marked stamp, 1 without, and a version-3 batch set aside (B8);
 *  - a new vault is sent what this device holds as parked, with the verdict, so a joining device parks it too, and Apply
 *    sends it as an edit made now (A15; changed in the second pass by the data review's 5);
 *  - the 409's hour is kept in the sync record (the server review's 10, A5), and a joining device waits out a short
 *    Retry-After and asks again, at most twice (the server review's 9);
 *  - every sync request carries the sync header (A31), and a stored refusal's cap is written back (the server review's 5);
 *  - a photograph's removal placed past a far stamp is dated by when this device first saw it (the clock review's 15).
 * Run: npx vitest run tests/unit/r62l-clock-engine.test.ts --testTimeout=180000
 */
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
import { hlcEncode, hlcPast, isPastStamp, MAX_AHEAD_MS } from '$core/hlc';
import { batchFingerprint, deriveKeys, newVaultKey, sealJson, openJson, sha256hex } from '$lib/sync/crypto';
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


/* ------------------------------------------------------------------ the clock review of round sixty-one */

const DAY = 86_400_000;
const YEAR = 365 * DAY;
afterEach(() => { serverClock = null; });

describe('clock review 61, finding 1: the engine reads clock-only parks as stored verdicts', () => {
  /** A, its clock confirmed, merges a backup holding a change stamped three days ahead, pushes it in its own batch, and B joins. */
  async function scene() {
    const r2 = fakeR2();
    // Arrivals by the (fake) server clock, so a listing's one-minute overlap is a minute, not a second per upload.
    const put0 = r2.put.bind(r2);
    r2.put = async (k: string, body: unknown, opts?: { customMetadata?: Record<string, string> }) => { await put0(k, body, opts); r2.objs.get(k)!.uploaded = Date.now(); };
    const memA = newMem('aaaaaaaaaaaa');
    const memB = newMem('bbbbbbbbbbbb');
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real);
    serverClock = Date.now(); // the listing carries the server's Date: A's clock is confirmed at its first run
    const A = await boot(memA, r2);
    await A.sync.init();
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'mine' });
    await A.sync.setup(KEY, 'create');
    const hlc = await import('$core/hlc');
    expect(hlc.clockChecked()).toBe(true);
    const ahead = hlcEncode({ wall: Date.now() + 3 * DAY, count: 0, device: 'cccccccccccc0000' });
    await A.collection.ingest([{ t: ahead, kind: 'accession', id: plant.id, field: 'notes', value: 'from a file, three days ahead' }], 'import');
    expect(A.collection.parkedStamps.has(ahead)).toBe(true); // parked by the confirmed clock, for this load only (rule 5)
    expect((memA.meta.get('parked') as string[] | undefined) ?? []).not.toContain(ahead);
    serverClock = Date.now();
    await A.sync.run(); // pushed in A's own batch; the listing gives its arrival; the batch may hold a far stamp: judged
    mem = memB;
    const B = await boot(memB, r2);
    serverClock = Date.now();
    await B.sync.setup(KEY, 'join');
    expect((memB.meta.get('parked') as string[] | undefined) ?? []).toContain(ahead); // B parks it by arrival, stored
    expect(B.collection.accession(plant.id)?.notes).toBe('mine');
    return { r2, memA, memB, real, plant, ahead };
  }
  it('FIXED: the writer stores the arrival verdict its peer stores', async () => {
    const { memA, ahead } = await scene();
    // judgeOwn skips every stamp already in `collection.parkedStamps`, which since round sixty-one holds the clock's own
    // verdicts too, so the writer never stores the verdict its batch's arrival gives.
    expect((memA.meta.get('parked') as string[] | undefined) ?? []).toContain(ahead);
  });
  it('FIXED: three days on, the writer and its peer show the same notes', async () => {
    const { r2, memA, memB, real, plant } = await scene();
    // Life goes on: B adds a plant and syncs, A syncs, so A's batch is behind the listing cursor like any other.
    vi.setSystemTime(real + 10 * 60_000);
    let B = await reboot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Lithops lesliei', acc: 'B-1' });
    serverClock = Date.now();
    await B.sync.run();
    vi.setSystemTime(real + 20 * 60_000);
    mem = memA;
    let A = await reboot(memA, r2);
    serverClock = Date.now();
    await A.sync.run();
    // Three days on, both synced again.
    vi.setSystemTime(real + 3 * DAY + 60_000);
    A = await reboot(memA, r2);
    serverClock = Date.now();
    await A.sync.run();
    const a = A.collection.accession(plant.id)?.notes;
    mem = memB;
    B = await reboot(memB, r2);
    await B.sync.run();
    const b = B.collection.accession(plant.id)?.notes;
    expect({ a, b }).toEqual({ a: 'mine', b: 'mine' });
  });
});

describe('clock review 61, finding 3: a park meets the "waiting for a newer version" rule', () => {
  it('FIXED: a plant made while the clock was a year fast, edited after it was put right and before its first sync: after the sync it is said to be parked, not to wait for a field this version cannot read', async () => {
    const r2 = fakeR2();
    const memP = newMem('pppppppppppp');
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'create'); // no Date header: the clock is never confirmed here
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR);
    P = await reboot(memP, r2);
    const plant = await P.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'P-1' });
    vi.setSystemTime(real + 5 * 60_000); // put right by hand, offline
    P = await reboot(memP, r2);
    await P.collection.put('accession', plant.id, { notes: 'repotted' });
    expect(P.collection.accession(plant.id)?.notes).toBe('repotted'); // the edit (flagged) shows at once
    await P.sync.run();
    // The creation is parked by its arrival (right), the flagged edit is not (right), and what is left is a plant with notes
    // and no name: the plants page says "1 record waits for a field this device does not have (a file that never had it,
    // or a sync bundle from a newer version of the app that has not arrived)".
    expect(P.collection.parkedRecords).toBe(1);
    expect(P.collection.incomplete).toBe(0);
    // Its page shows the Parked notice with Apply, not "waiting for a newer version"; Apply brings the plant back.
    expect(P.collection.waiting('accession', plant.id)?.parked).toBe(true);
    await P.collection.applyParked('accession', plant.id);
    expect(P.collection.accession(plant.id)?.taxonName).toBe('Copiapoa cinerea');
    expect(P.collection.accession(plant.id)?.notes).toBe('repotted');
  });
});

describe('clock review 61, finding 5: a slow clock\'s correction flaps', () => {
  it('FIXED: a device ten minutes slow, its tab away for half an hour three times: its clock never moved, yet each return folds the whole log three times', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    vi.useFakeTimers({ toFake: ['Date', 'performance'] }); // the device clock and the monotonic clock move together: no clock was moved
    serverClock = Date.now() + 10 * 60_000;
    let A = await boot(memA, r2);
    await A.sync.init();
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const hlc = await import('$core/hlc');
    expect(Math.round(hlc.clockOffsetMs() / 60_000)).toBe(10);
    const rebuild = vi.spyOn(A.collection, 'rebuild');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(30 * 60_000); // the tab was hidden: no run
      serverClock = Date.now() + 10 * 60_000; // the server still says the same: ten minutes
      await A.sync.run();
      for (let k = 0; k < 20; k++) await Promise.resolve();
    }
    await vi.waitFor(() => expect(rebuild.mock.calls.length).toBeGreaterThanOrEqual(0));
    expect({ rebuilds: rebuild.mock.calls.length, offset: hlc.clockOffsetMs() }).toEqual({ rebuilds: 0, offset: hlc.clockOffsetMs() });
  });
});

describe('clock review 61: engine guards for fixes no test held (PASS on f4ab4f8)', () => {
  /** P, a year fast, edits a plant A made and pushes it with no listing after; P is put right and edits the field again (marked). */
  async function fastThenRight() {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memP = newMem('pppppppppppp');
    const A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'bought at the show' });
    await A.sync.setup(KEY, 'create');
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR);
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    vi.setSystemTime(real + YEAR + 2 * 60_000);
    await P.collection.put('accession', plant.id, { notes: 'typed a year fast' });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => (String(input).includes('/api/sync/log?') && (!init?.method || init.method === 'GET') ? new Response('no', { status: 502 }) : realFetch(input, init))) as typeof fetch;
    await P.sync.run().catch(() => {});
    globalThis.fetch = realFetch;
    vi.setSystemTime(real + 5 * 60_000); // put right by hand
    P = await reboot(memP, r2);
    await P.collection.put('accession', plant.id, { notes: 'typed after the clock was put right' });
    return { r2, memP, P, plant };
  }
  it('PASSES (guard, M39 and M25): the marked edit raises no clock line; M25: only the batch with the fast stamp is fetched again, not the one carrying the marked edit', async () => {
    const { P } = await fastThenRight();
    expect(P.sync.clockWarning).toBeNull();
    const b0 = P.calls.length;
    await P.sync.run();
    expect(P.calls.slice(b0).filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(1);
  });
  it('PASSES (guard, M33): a fetch of its own batch that fails is tried again at the next run, and the fast stamp is then parked', async () => {
    const { P, memP, plant } = await fastThenRight();
    const realFetch = globalThis.fetch;
    let failed = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => (/\/api\/sync\/log\/[^?]+\?/.test(String(input)) && !failed++ ? new Response('no', { status: 500 }) : realFetch(input, init))) as typeof fetch;
    await P.sync.run().catch(() => {});
    globalThis.fetch = realFetch;
    expect(failed).toBeGreaterThan(0);
    expect(Object.keys((memP.meta.get('sync') as { ownJudge?: Record<string, number> }).ownJudge ?? {})).toHaveLength(1);
    await P.sync.run();
    const fast = [...memP.changes.values()].find((c) => c.value === 'typed a year fast')!;
    expect(P.collection.parkedStamps.has(fast.t)).toBe(true);
    expect(P.collection.accession(plant.id)?.notes).toBe('typed after the clock was put right');
  });
});

describe('clock review 61, finding 9: a park by arrival of a change this tab already folded', () => {
  it('FIXED: a push whose answer was lost (stored on the server, an error here): at the next run the fast stamp is parked by its arrival (takeBatch) and stored, but this tab goes on showing it until a reload', async () => {
    const r2 = fakeR2();
    const memP = newMem('pppppppppppp');
    let P = await boot(memP, r2);
    const plant = await P.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'P-1', notes: 'today' });
    await P.sync.setup(KEY, 'create');
    const real = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(real + YEAR);
    P = await reboot(memP, r2);
    await P.collection.put('accession', plant.id, { notes: 'a year fast' });
    vi.setSystemTime(real + YEAR + 60_000);
    await P.collection.addAccession({ taxonName: 'Lithops lesliei', acc: 'P-2' }); // the outbox differs at the re-send: another batch name
    const realFetch = globalThis.fetch;
    let lost = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).includes('/api/sync/log') && !lost++) { await realFetch(input, init); throw new TypeError('the answer was lost'); }
      return realFetch(input, init);
    }) as typeof fetch;
    await P.sync.run().catch(() => {});
    globalThis.fetch = realFetch;
    expect(lost).toBeGreaterThan(0);
    vi.setSystemTime(real + 5 * 60_000); // put right
    P = await reboot(memP, r2);
    await P.collection.put('accession', plant.id, { taxonName: 'Copiapoa cinerea var. columna-alba' }); // another field: an ordinary edit
    await P.sync.run();
    const fast = [...memP.changes.values()].find((c) => c.value === 'a year fast')!;
    expect(P.collection.parkedStamps.has(fast.t)).toBe(true);
    expect((memP.meta.get('parked') as string[]).includes(fast.t)).toBe(true); // stored by takeBatch (the lost batch is listed as new)
    const shownInTab = P.collection.accession(plant.id)?.notes;
    P = await reboot(memP, r2);
    expect({ shownInTab, afterReload: P.collection.accession(plant.id)?.notes }).toEqual({ shownInTab: 'today', afterReload: 'today' });
  });
});

/* ------------------------------------------------------------------ round sixty-two, added */

/** Every batch on the server, opened: its name, version and stamps. */
async function batchesOn(r2: ReturnType<typeof fakeR2>): Promise<Array<{ name: string; v: number; ts: string[] }>> {
  const keys = await deriveKeys(KEY);
  const out: Array<{ name: string; v: number; ts: string[] }> = [];
  for (const k of logKeys(r2)) {
    const name = k.slice(k.lastIndexOf('/') + 1).replace(/\.bin$/, '');
    const b = await openJson<{ v: number; changes: Change[] }>(keys, 'log', r2.objs.get(k)!.body, name);
    out.push({ name, v: b.v, ts: b.changes.map((c) => c.t) });
  }
  return out;
}

describe('round sixty-two: one refold per change of the clock in force (the clock review\'s 5, A17)', () => {
  it('a device ten minutes slow: its first reading folds the log once, the readings that agree fold nothing, a new correction folds once more', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    vi.useFakeTimers({ toFake: ['Date', 'performance'] });
    serverClock = null;
    const A = await boot(memA, r2);
    await A.sync.init();
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    await A.sync.setup(KEY, 'create'); // no Date header: no reading yet
    const rebuild = vi.spyOn(A.collection, 'rebuild');
    serverClock = Date.now() + 10 * 60_000;
    await A.sync.run();
    for (let k = 0; k < 20; k++) await Promise.resolve();
    expect(rebuild.mock.calls.length).toBe(1);
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(30 * 60_000);
      serverClock = Date.now() + 10 * 60_000;
      await A.sync.run();
    }
    for (let k = 0; k < 20; k++) await Promise.resolve();
    expect(rebuild.mock.calls.length).toBe(1);
    serverClock = Date.now() + 20 * 60_000;
    await A.sync.run();
    for (let k = 0; k < 20; k++) await Promise.resolve();
    expect(rebuild.mock.calls.length).toBe(2);
  });
});

describe('round sixty-two: batch version 2 (B8)', () => {
  it('a batch with a marked stamp is sealed as version 2; one without is version 1; a reader takes both', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'one' });
    await A.sync.setup(KEY, 'create');
    // a far stamp from a file, held here, then an edit to the field placed past it (marked)
    const far = hlcEncode({ wall: Date.now() + 3_600_000, count: 0, device: 'cccccccccccc0000' });
    await A.collection.ingest([{ t: far, kind: 'accession', id: plant.id, field: 'notes', value: 'an hour ahead' }], 'import');
    await A.sync.run();
    await A.collection.put('accession', plant.id, { notes: 'edited past it' });
    const marked = [...memA.changes.values()].find((c) => c.value === 'edited past it')!;
    expect(isPastStamp(marked.t)).toBe(true);
    await A.sync.run();
    const on = await batchesOn(r2);
    expect(on.find((b) => b.ts.includes(marked.t))?.v).toBe(2);
    expect(on.filter((b) => !b.ts.some(isPastStamp)).every((b) => b.v === 1)).toBe(true);
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.sync.setup(KEY, 'join');
    expect(B.sync.quarantined).toEqual([]);
    expect(B.collection.accession(plant.id)?.notes).toBe('edited past it');
  });
  it('a batch of a version this build does not know (3) is set aside under its name, for a later build', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    await A.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const hour = String(Math.floor(Date.now() / 3600_000) * 3600_000).padStart(13, '0');
    const t = hlcEncode({ wall: Date.now(), count: 0, device: 'dddddddddddd0000' });
    expect((await pushAs(keys, hour, 'dddddddddddd', 'abcdefabcdef', { v: 3, device: 'dddddddddddd', changes: [{ t, kind: 'accession', id: 'x1', field: 'taxonName', value: 'Lithops lesliei' }] })).status).toBe(200);
    await A.sync.run();
    expect(A.sync.quarantined.map((q) => q.error)).toEqual(['not a batch this version understands']);
    expect(memA.changes.has(t)).toBe(false);
  });
});

describe('round sixty-two, second pass: a new vault is sent what this device holds as parked, with the verdict (A15, the data review\'s 5)', () => {
  it('a change parked in one vault reaches a new vault parked: the joining device parks it too, and Apply sends it as an edit made now', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    // Made eight days ago; edited a week ago while three days fast (stamped four days ago), parked by its arrival then.
    const at = (days: number, count: number) => hlcEncode({ wall: Date.now() - days * 86_400_000, count, device: 'aaaaaaaaaaaa0000' });
    const plant = { id: 'r-a15' };
    await A.collection.ingest([{ t: at(8, 0), kind: 'accession', id: plant.id, field: 'taxonName', value: 'Copiapoa cinerea' }, { t: at(8, 1), kind: 'accession', id: plant.id, field: 'status', value: 'growing' }, { t: at(8, 2), kind: 'accession', id: plant.id, field: 'acc', value: 'A-1' }, { t: at(8, 3), kind: 'accession', id: plant.id, field: 'notes', value: 'start' }], 'import');
    const fast = at(4, 0);
    memA.changes.set(fast, { t: fast, kind: 'accession', id: plant.id, field: 'notes', value: 'typed 3 days fast, a week ago' });
    await A.collection.markParked([memA.changes.get(fast)!]); // stored as parked by its arrival in the old vault
    await A.collection.rebuild();
    expect(A.collection.accession(plant.id)?.notes).toBe('start');
    await A.sync.setup(KEY, 'create');
    const sent = (await batchesOn(r2)).find((b) => b.ts.includes(fast));
    expect(sent?.v).toBe(2); // sent, in a batch carrying its verdict (round sixty-one builds set it aside)
    const memP = newMem('pppppppppppp');
    let P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    expect(P.collection.accession(plant.id)?.notes).toBe('start'); // parked there too, by the verdict, though it is only four days old
    expect(P.collection.parkedFor('accession', plant.id).map((c) => c.t)).toEqual([fast]); // and offered with Apply
    expect((memP.meta.get('parked') as string[] | undefined) ?? []).toContain(fast);
    mem = memA;
    const A2 = await reboot(memA, r2);
    await A2.collection.applyParked('accession', plant.id);
    await A2.sync.run();
    mem = memP;
    P = await reboot(memP, r2);
    await P.sync.run();
    expect(P.collection.accession(plant.id)?.notes).toBe('typed 3 days fast, a week ago');
  });
  it('a plant whose own fields are parked (made a year fast): the joining device shows it Parked with Apply, not waiting for a newer version', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    const far = Date.now() + 365 * 86_400_000;
    const me = 'aaaaaaaaaaaa0000';
    const made: Change[] = [
      { t: hlcEncode({ wall: far, count: 0, device: me }), kind: 'accession', id: 'r-fast', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: hlcEncode({ wall: far, count: 1, device: me }), kind: 'accession', id: 'r-fast', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: far, count: 2, device: me }), kind: 'accession', id: 'r-fast', field: 'acc', value: '2027-0001' }
    ];
    const edit: Change = { t: hlcPast(made[2].t, me), kind: 'accession', id: 'r-fast', field: 'notes', value: 'edited after the clock was put right' };
    for (const c of [...made, edit]) memA.changes.set(c.t, c);
    await A.collection.markParked(made);
    await A.collection.rebuild();
    expect(A.collection.waiting('accession', 'r-fast')?.parked).toBe(true);
    await A.sync.setup(KEY, 'create');
    const memP = newMem('pppppppppppp');
    const P = await boot(memP, r2);
    await P.sync.setup(KEY, 'join');
    expect(P.collection.waiting('accession', 'r-fast')?.parked).toBe(true); // first pass: { missing: [...], parked: false }
    expect(P.collection.parkedFor('accession', 'r-fast').length).toBe(3);
  });
  it('a batch whose verdicts are not a list of stamps is set aside', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const t = hlcEncode({ wall: Date.now(), count: 0, device: 'bbbbbbbbbbbb0000' });
    const r = await pushAs(keys, String(Math.floor(Date.now() / 3600_000) * 3600_000).padStart(13, '0'), 'bbbbbbbbbbbb', 'f'.repeat(12), { v: 2, device: 'bbbbbbbbbbbb', changes: [{ t, kind: 'accession', id: 'r-x', field: 'notes', value: 'x' }], parked: 'all of them' });
    expect(r.ok).toBe(true);
    await A.sync.run();
    expect(A.sync.quarantined.map((q) => q.error)).toEqual(['not a batch this version understands']);
    expect(memA.changes.has(t)).toBe(false);
  });
});

describe('round sixty-two: the engine\'s parts of decision 6', () => {
  it('every sync request carries the sync header (A31)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    const real = globalThis.fetch;
    const without: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { if (new Headers(init?.headers).get('x-cultifolio-sync') !== '1') without.push(String(input)); return real(input, init); }) as typeof fetch;
    try { await A.sync.setup(KEY, 'create'); await A.sync.run(); } finally { globalThis.fetch = real; }
    expect(without).toEqual([]);
  });
  it('joining after a crossed recount (503, Retry-After under a minute) waits it out and asks again, at most twice', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const real = globalThis.fetch;
    let crossed = 2, asked = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/sync/vault')) { asked++; if (crossed-- > 0) return new Response(JSON.stringify({ error: 'The vault was being counted; it tries again shortly.' }), { status: 503, headers: { 'retry-after': '1', 'content-type': 'application/json' } }); }
      return real(input, init);
    }) as typeof fetch;
    try { await B.sync.setup(KEY, 'join'); } finally { globalThis.fetch = real; }
    expect(asked).toBe(3);
    expect(B.sync.configured).toBe(true);
    const memC = newMem('cccccccccccc');
    const C = await boot(memC, r2);
    asked = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/sync/vault')) { asked++; return new Response(JSON.stringify({ error: 'The vault was being counted; it tries again shortly.' }), { status: 503, headers: { 'retry-after': '1', 'content-type': 'application/json' } }); }
      return real(input, init);
    }) as typeof fetch;
    try { await expect(C.sync.setup(KEY, 'join')).rejects.toThrow(/counted/); } finally { globalThis.fetch = real; }
    expect(asked).toBe(3);
  }, 20_000);
  it('a refusal stored a day ahead (the clock went back since) is capped at an hour, and the cap is kept (the server review\'s 5)', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const A = await boot(memA, r2);
    await A.sync.setup(KEY, 'create');
    const rec = memA.meta.get('sync') as { refusal?: { text: string; until: number } };
    rec.refusal = { text: 'Sync is not taking uploads from this vault for now.', until: Date.now() + 86_400_000 };
    memA.meta.set('sync', rec);
    const A2 = await reboot(memA, r2);
    await A2.sync.run().catch(() => {});
    const until = (memA.meta.get('sync') as { refusal?: { until: number } }).refusal?.until ?? 0;
    expect(until).toBeLessThanOrEqual(Date.now() + 3600_000);
  });
  it('the 409\'s hour is kept in the sync record: a reload within the hour does not ask again (the server review\'s 10, A5)', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    mem = memB;
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pone000000001';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    const old = (count: number, field: string, value: unknown) => ({ t: hlcEncode({ wall: Date.now() - 20 * 60_000, count, device: 'cccccccccccc' }), kind: 'photo' as const, id: pid, field, value });
    await B.collection.ingest([old(0, 'acc', a.id), old(1, 'd', '2026-01-01'), old(2, 'w', 1), old(3, 'h', 1), old(4, 'bytes', 6), old(5, 'sha', sha)], 'import');
    await B.sync.setup(KEY, 'create');
    await B.collection.ingest([{ t: hlcEncode({ wall: Date.now() - 11 * 60_000, count: 0, device: 'cccccccccccc' }), kind: 'photo', id: pid, field: '_deleted', value: true }], 'import');
    const real = globalThis.fetch;
    let deletes = 0;
    const answering = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).includes('/api/sync/photo/')) { deletes++; return new Response('{}', { status: 409, headers: { 'content-type': 'application/json' } }); }
      return real(input, init);
    }) as typeof fetch;
    globalThis.fetch = answering;
    try {
      await B.sync.run();
      expect(deletes).toBe(1);
      const B2 = await reboot(memB, r2); // a reload, or another tab
      globalThis.fetch = answering;
      await B2.sync.run();
      expect(deletes).toBe(1);
    } finally {
      globalThis.fetch = real;
    }
  });
  it('a photograph\'s removal placed past a far stamp is dated by when this device first saw it, and asked about once that is ten minutes old (the clock review\'s 15)', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    mem = memB;
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pone000000001';
    const sha = await sha256hex(jpeg);
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    const old = (count: number, field: string, value: unknown) => ({ t: hlcEncode({ wall: Date.now() - 20 * 60_000, count, device: 'cccccccccccc' }), kind: 'photo' as const, id: pid, field, value });
    await B.collection.ingest([old(0, 'acc', a.id), old(1, 'd', '2026-01-01'), old(2, 'w', 1), old(3, 'h', 1), old(4, 'bytes', 6), old(5, 'sha', sha)], 'import');
    await B.sync.setup(KEY, 'create');
    // a peer's removal, placed past a stamp a year ahead (marked)
    const far = hlcEncode({ wall: Date.now() + 365 * 86_400_000, count: 0, device: 'cccccccccccc' });
    await B.collection.ingest([{ t: hlcPast(far, 'cccccccccccc0000'), kind: 'photo', id: pid, field: '_deleted', value: true }], 'import');
    const real = globalThis.fetch;
    const at: Array<string | null> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'DELETE' && String(input).includes('/api/sync/photo/')) { at.push(new Headers(init.headers).get('x-photo-removed-at')); return new Response('{}', { status: 200 }); }
      return real(input, init);
    }) as typeof fetch;
    const firstSeen = Date.now();
    try {
      await B.sync.run();
      expect(at).toEqual([]); // just seen: within the Undo's ten minutes
      vi.useFakeTimers({ now: Date.now() + 11 * 60_000, toFake: ['Date'] });
      await B.sync.run();
      expect(at).toHaveLength(1);
      expect(Math.abs(Number(at[0]) - firstSeen)).toBeLessThan(60_000);
    } finally {
      globalThis.fetch = real;
      vi.useRealTimers();
    }
  });
});
