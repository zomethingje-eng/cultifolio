/**
 * Round-five probes of sync end to end: the real collection store, engine and
 * route handlers behind a fake fetch and a fake R2 (the harness is the one in
 * tests/unit/sync-engine.test.ts). A probe whose assertion is marked FINDING
 * demonstrates a defect by passing. Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-sync.probe.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Change } from '$core/log';
import { deriveKeys, newVaultKey, tokenHash } from '$lib/sync/crypto';
import { MAX_BYTES } from '$lib/server/sync';

type Mem = { device: string; changes: Map<string, Change>; outbox: Set<string>; meta: Map<string, unknown>; photos: Map<string, { id: string; blob: Blob; thumb: Blob }>; failAppend?: (cs: Change[], fromServer: boolean) => boolean };
const newMem = (device: string): Mem => ({ device, changes: new Map(), outbox: new Set(), meta: new Map(), photos: new Map() });
let mem: Mem = newMem('dev0');

vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[], fromServer = false) => {
    if (mem.failAppend?.(cs, fromServer)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
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

type Net = { calls: string[]; dropNext?: (method: string, path: string) => boolean };

async function boot(m: Mem, r2: ReturnType<typeof fakeR2>, net: Net = { calls: [] }) {
  mem = m;
  vi.resetModules();
  const routes = {
    vault: await import('../../src/routes/api/sync/vault/+server'),
    log: await import('../../src/routes/api/sync/log/+server'),
    batch: await import('../../src/routes/api/sync/log/[key]/+server'),
    photo: await import('../../src/routes/api/sync/photo/[id]/+server')
  };
  const platform = { env: { STORE: r2, SYNC_OPEN: '1' } } as unknown as App.Platform;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x');
    const request = new Request(url, init);
    net.calls.push(`${request.method} ${url.pathname}`);
    const ev = { request, url, platform, getClientAddress: () => '1.1.1.1', params: {} as Record<string, string> };
    try {
      let mm: RegExpExecArray | null;
      let res: Response;
      if (url.pathname === '/api/sync/vault') res = await (routes.vault as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev);
      else if (url.pathname === '/api/sync/log') res = await (routes.log as never as Record<string, (e: unknown) => Promise<Response>>)[request.method](ev);
      else if ((mm = /^\/api\/sync\/log\/([^/]+)$/.exec(url.pathname))) res = await routes.batch.GET({ ...ev, params: { key: mm[1] } } as never);
      else if ((mm = /^\/api\/sync\/photo\/([^/]+)$/.exec(url.pathname))) res = await (routes.photo as never as Record<string, (e: unknown) => Promise<Response>>)[request.method]({ ...ev, params: { id: mm[1] } });
      else res = new Response('nope', { status: 404 });
      if (net.dropNext?.(request.method, url.pathname)) throw new TypeError('Failed to fetch'); // the server did the work; the reply never arrived
      return res;
    } catch (e) {
      const err = e as { status?: number; body?: { message?: string } };
      if (err.status) return new Response(JSON.stringify(err.body ?? {}), { status: err.status });
      throw e;
    }
  }) as typeof fetch;
  const { collection } = await import('$lib/db/collection.svelte');
  const { sync } = await import('$lib/sync/engine.svelte');
  await collection.load();
  await sync.init(); // picks up a stored key, as the layout does on page load
  return { collection, sync, calls: net.calls };
}

const KEY = newVaultKey();
const logKeys = (r2: ReturnType<typeof fakeR2>) => [...r2.objs.keys()].filter((k) => k.includes('/log/'));

afterEach(() => vi.useRealTimers());

describe('quarantine (engine.svelte.ts:402-411): "a batch that cannot be opened or applied is quarantined by name"', () => {
  it('FINDING: a good batch whose IndexedDB write fails (QuotaExceededError) is quarantined for ever; after a reload the changes are gone and the batch is never fetched again', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    const plant = await B.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const memD = newMem('dddddddddddd');
    // The phone is nearly full: the first write of server changes fails; the vault is otherwise fine.
    let failed = 0;
    memD.failAppend = (_cs, fromServer) => fromServer && failed++ === 0;
    const D = await boot(memD, r2);
    await D.sync.setup(KEY, 'join');
    expect(D.sync.lastError).toBeNull(); // the sync "succeeded"
    expect(D.sync.quarantined.map((q) => q.error)).toEqual(['The quota has been exceeded.']); // FINDING: a storage error, filed as a bad batch
    expect(D.collection.accession(plant.id)).toBeDefined(); // in memory, this session...
    expect(memD.changes.size).toBe(0); // ...but not in the vault
    // Reload with the storage problem gone: the batch is in `have`, so it is skipped for good.
    const D2 = await boot(memD, r2);
    await D2.sync.run();
    expect(D2.collection.accession(plant.id)).toBeUndefined(); // FINDING: the plant never arrives
    expect(D2.calls.filter((c) => c.startsWith('GET /api/sync/log/'))).toHaveLength(0);
  });
});

describe('the 4xx bisect (engine.svelte.ts:375-383) against a full vault', () => {
  it('FINDING: a 413 for "over its storage allowance" is bisected down to every single change, one request each, on every run', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    for (let i = 0; i < 8; i++) await B.collection.addEvent({ acc: 'r1', d: '2026-01-0' + (i + 1), t: 'water' });
    const n = memB.changes.size;
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    // The vault fills up (say from photos on another device).
    const metaKey = `vault/${keys.id}/meta.json`;
    const meta = JSON.parse(new TextDecoder().decode(r2.objs.get(metaKey)!.body));
    meta.bytes = MAX_BYTES - 10;
    r2.objs.set(metaKey, { body: new TextEncoder().encode(JSON.stringify(meta)), uploaded: 1 });
    await B.collection.addEvent({ acc: 'r1', d: '2026-02-01', t: 'feed' });
    const before = B.calls.length;
    await B.sync.run();
    const posts = B.calls.slice(before).filter((c) => c === 'POST /api/sync/log').length;
    expect(posts).toBeGreaterThanOrEqual(2 * 3 - 1); // three changes → the batch, two halves, then singles: 5 or more
    expect(B.sync.refused.length).toBe(3); // one "refused" entry per change, each saying "(413)" with no hint that the vault is full
    expect(B.sync.refused[0].error).toMatch(/413/);
    // And again next run, for as long as the vault is full: nothing remembers.
    const again = B.calls.length;
    await B.sync.run();
    expect(B.calls.slice(again).filter((c) => c === 'POST /api/sync/log').length).toBe(posts);
    expect(n).toBeGreaterThan(0);
  });
});

describe('formats page: "the same batch pushed twice lands on the same key (the server compares the bytes and says so)"', () => {
  it('FINDING: a re-push after a lost reply is a fresh seal (random IV) under a fresh name: the vault holds the batch twice and both count against the allowance', async () => {
    const r2 = fakeR2();
    const net: Net = { calls: [] };
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2, net);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    net.dropNext = (m, p) => m === 'POST' && p === '/api/sync/log';
    await expect(B.sync.setup(KEY, 'create')).rejects.toThrow(/Failed to fetch/);
    expect(logKeys(r2)).toHaveLength(1); // the server stored it
    expect(memB.outbox.size).toBeGreaterThan(0); // the client does not know
    net.dropNext = undefined;
    await B.sync.run();
    expect(logKeys(r2)).toHaveLength(2); // FINDING: same changes, second object
    const [a, b] = logKeys(r2).map((k) => k.split('/log/')[1].slice(0, -4));
    expect(a.slice(0, -13)).toBe(b.slice(0, -13)); // same last HLC...
    expect(a).not.toBe(b); // ...different hash, so the byte-compare never fires for a client's own retry
    expect(net.calls.filter((c) => c === 'POST /api/sync/log')).toHaveLength(2);
    const keys = await deriveKeys(KEY);
    const meta = JSON.parse(new TextDecoder().decode(r2.objs.get(`vault/${keys.id}/meta.json`)!.body));
    expect(meta.bytes).toBe(r2.objs.get(logKeys(r2)[0])!.body.length + r2.objs.get(logKeys(r2)[1])!.body.length);
  });
});

describe('two devices, one with a fast clock (hlc.ts MAX_AHEAD_MS; formats page: "one phone set to the wrong year cannot become every device\'s clock")', () => {
  it('FINDING: the fast device does not become the clock, but its edits win for as long as it is ahead; the other device\'s edits to the same field are stored, pushed, and shown nowhere', async () => {
    const r2 = fakeR2();
    const memA = newMem('aaaaaaaaaaaa');
    const memB = newMem('bbbbbbbbbbbb');
    // A, correct clock, makes the plant and shares it.
    let A = await boot(memA, r2);
    const plant = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1', notes: 'bought at the show' });
    await A.sync.setup(KEY, 'create');
    // B's phone is a day ahead. It joins and edits the notes.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 86_400_000);
    let B = await boot(memB, r2);
    await B.sync.setup(KEY, 'join');
    await B.collection.put('accession', plant.id, { notes: 'phone says: repot' });
    await B.sync.run();
    vi.useRealTimers();
    // A pulls, sees B's note (fine), then corrects it. A's clock is not dragged forward: the guard holds.
    A = await boot(memA, r2);
    await A.sync.run();
    expect(A.collection.accession(plant.id)?.notes).toBe('phone says: repot');
    await A.collection.put('accession', plant.id, { notes: 'no: leave it until spring' });
    expect(A.collection.accession(plant.id)?.notes).toBe('phone says: repot'); // FINDING: A's own edit is invisible on A
    await A.sync.run();
    expect(memA.outbox.size).toBe(0); // it was pushed
    B = await boot(memB, r2);
    await B.sync.run();
    expect(B.collection.accession(plant.id)?.notes).toBe('phone says: repot'); // FINDING: and invisible on B; both agree, both wrong, no one is told
  });
});

describe('what a server operator learns (formats page: "the server sees a vault id, a token ... and ciphertext")', () => {
  it('the object names and request log carry each device id, the wall-clock time of every editing session, every photo id (with its device and creation time) and every size', async () => {
    const r2 = fakeR2();
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    const a = await B.collection.addAccession({ taxonName: 'Aloe', acc: 'B-1' });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const pid = 'pmu9xxxxxx01bbbbbbbbbbbb';
    memB.photos.set(pid, { id: pid, blob: new Blob([jpeg]), thumb: new Blob([jpeg]) });
    await B.collection.put('photo', pid, { acc: a.id, d: '2026-01-01', w: 1, h: 1, bytes: 6 });
    await B.sync.setup(KEY, 'create');
    const names = [...r2.objs.keys()];
    expect(names.some((k) => /\/log\/\d{13}-[0-9a-f]{4}-bbbbbbbbbbbb-[0-9a-f]{12}\.bin$/.test(k))).toBe(true); // device id and edit time, in the clear
    expect(names.some((k) => k.endsWith(`/photo/${pid}.bin`))).toBe(true); // photo id: 'p' + base36 wall time + counter + device id
    expect(B.calls.some((c) => c.includes(pid))).toBe(true); // and in the URL of every request, so in the Worker's request logs (observability is on in wrangler.jsonc)
  });
  it('vault creation binds nothing: any 26-symbol id can be registered with any token (the id is not checked against SHA-256("id:"+token))', async () => {
    const r2 = fakeR2();
    await boot(newMem('bbbbbbbbbbbb'), r2);
    const id = 'ABCDEFGHJKMNPQRSTVWXYZ2345';
    const token = 'a'.repeat(64);
    const r = await fetch('/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, token, create: true }) });
    expect(r.status).toBe(200);
    expect(r2.objs.has(`vault/${id}/meta.json`)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(r2.objs.get(`vault/${id}/meta.json`)!.body)).tokenHash).toBe(await tokenHash(token));
  });
  it('a client without the key learns whether a vault id exists (404 vs 403) but nothing else; without any token, 401', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const wrong = { authorization: `Bearer ${'0'.repeat(64)}` };
    expect((await fetch(`/api/sync/vault?vault=${keys.id}`, { headers: wrong })).status).toBe(403);
    expect((await fetch(`/api/sync/vault?vault=${'ABCDEFGHJKMNPQRSTVWXYZ2345'}`, { headers: wrong })).status).toBe(404);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`)).status).toBe(401);
  });
});
