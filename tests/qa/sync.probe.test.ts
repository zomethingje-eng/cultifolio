/**
 * Adversarial probes for the change log, the outbox/sync engine, the Worker
 * endpoints, the vault and backups. Each `it` either fails on current code
 * (a finding) or documents something checked and found sound.
 *
 * The vault is an in-memory fake; the collection store, the sync engine and
 * the real route handlers run unmodified, wired together through a fake
 * fetch and a fake R2, so the outbox → server → pull path is the real one.
 */
import { describe, it, expect, vi } from 'vitest';
import { apply, materialise, type Change } from '$core/log';
import { Clock, hlcEncode, hlcDecode, hlcCompare } from '$core/hlc';
import { deriveKeys, newVaultKey, openJson, sealJson } from '$lib/sync/crypto';
import { importV2 } from '$lib/import/v2';

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
  const objs = new Map<string, { body: Uint8Array; uploaded: number }>();
  let clock = 1_000_000;
  return {
    objs,
    async put(key: string, body: unknown) {
      const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(String(body));
      objs.set(key, { body: bytes, uploaded: (clock += 1000) });
    },
    async head(key: string) {
      return objs.has(key) ? {} : null;
    },
    async get(key: string) {
      const o = objs.get(key);
      return o ? { body: o.body, json: async () => JSON.parse(new TextDecoder().decode(o.body)) } : null;
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

/* ------------------------------------------------------------- findings */

describe('FINDING: a batch is named by its last HLC, and "already there" acks the whole outbox batch', () => {
  it('an offline edit restored alongside synced changes never reaches the server', async () => {
    const r2 = fakeR2();
    // Device A edits offline (no sync yet): its change has the oldest HLC.
    const memA = newMem('aaaaaaaaaaaa');
    let A = await boot(memA, r2);
    const plantA = await A.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: 'A-1' });
    // Device B, later, makes changes and syncs; its last HLC names the batch.
    const memB = newMem('bbbbbbbbbbbb');
    const B = await boot(memB, r2);
    await B.collection.addAccession({ taxonName: 'Ariocarpus fissuratus', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    expect([...r2.objs.keys()].filter((k) => k.includes('/log/'))).toHaveLength(1);
    // A restores B's backup (merge), then joins the vault. Its outbox: a1 + B's changes, sorted → last is B's key.
    A = await boot(memA, r2);
    await A.collection.ingest([...memB.changes.values()]);
    await A.sync.setup(KEY, 'join');
    // The server answered "already there" for B's key, the engine acked A's outbox (memA.outbox is empty), and nothing new was stored.
    const logs = [...r2.objs.keys()].filter((k) => k.includes('/log/'));
    expect(memA.outbox.size === 0 && logs.length === 1).toBe(true); // the wrong state, so that the next line is the assertion that matters
    // A third device joins: it should learn of A's plant. FAILS: it never will, and A thinks it is pushed.
    const C = await boot(newMem('cccccccccccc'), r2);
    await C.sync.setup(KEY, 'join');
    expect(C.collection.accession(plantA.id)).toBeDefined();
  });
});

describe('FINDING: any 4xx on push wedges sync for good, and pull never runs', () => {
  it('one oversize photo blob (e.g. from a restored zip) stops a device receiving anything', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    const p = await B.collection.addAccession({ taxonName: 'Aloe polyphylla', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    // Device D has a live photo record whose pixels are 13 MB (a restore copies zip entries verbatim: no size check).
    const memD = newMem('dddddddddddd');
    const D = await boot(memD, r2);
    const big = new Blob([new Uint8Array(13 * 1024 * 1024)], { type: 'image/jpeg' });
    const pid = 'p' + 'abcdef123456';
    memD.photos.set(pid, { id: pid, blob: big, thumb: big.slice(0, 10) });
    const own = await D.collection.addAccession({ taxonName: 'Aloe', acc: 'D-1' });
    await D.collection.put('photo', pid, { acc: own.id, d: '2026-01-01', w: 1, h: 1, bytes: 13 });
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow(/photo push failed: 400/);
    await expect(D.sync.run()).rejects.toThrow(/photo push failed: 400/); // and again, forever
    // A refused photo should not stop the device receiving. FAILS: pull is never reached (no GET /api/sync/log), B's plant never arrives.
    expect(D.calls.filter((c) => c === 'GET /api/sync/log').length).toBeGreaterThan(0);
    expect(D.collection.accession(p.id)).toBeDefined();
  });
});

describe('FINDING: one undecryptable or malformed batch on the server wedges every device forever', () => {
  it('a token holder (no key) can put garbage; nothing is ever deleted, so pull throws on it every run', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    // The token alone is enough to POST: 64 random bytes under a well-formed HLC name.
    const r = await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { authorization: `Bearer ${keys.token}`, 'x-batch': '1700000000000-0000-evil' }, body: crypto.getRandomValues(new Uint8Array(64)) });
    expect(r.ok).toBe(true);
    // A good batch arrives after it.
    const p = await B.collection.addAccession({ taxonName: 'Conophytum', acc: 'B-2' });
    await expect(B.sync.run()).rejects.toThrow(/sealed blob|could not decrypt/); // B itself is wedged too (its push went through first)
    const D = await boot(newMem('dddddddddddd'), r2);
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow(/sealed blob|could not decrypt/);
    await expect(D.sync.run()).rejects.toThrow(/sealed blob|could not decrypt/);
    expect(D.collection.accession(p.id)).toBeDefined(); // FAILS: the good batch behind the poison one is never reached
  });
  it('with the key, a batch carrying a reserved field does the same through assertField()', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const body = await sealJson(keys, 'log', { v: 1, device: 'x', changes: [{ t: '1700000000000-0000-x', kind: 'accession', id: 'r1', field: 'id', value: 'r2' }] });
    await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { authorization: `Bearer ${keys.token}`, 'x-batch': '1700000000000-0000-x' }, body });
    const D = await boot(newMem('dddddddddddd'), r2);
    await expect(D.sync.setup(KEY, 'join')).rejects.toThrow(/reserved/);
    await expect(D.sync.run()).rejects.toThrow(/reserved/);
  });
});

describe('FINDING: the HLC counter has no bound and no drift guard', () => {
  it('after 65,536 ticks at one wall time the HLC no longer parses and sorts before its predecessor', () => {
    const c = new Clock('dev1', () => 1_700_000_000_000); // a stalled wall clock, or a vault whose clock was pushed into the future
    let last = '';
    for (let i = 0; i <= 0xffff; i++) last = c.tick();
    const next = c.tick(); // count 0x10000
    expect(() => hlcDecode(next)).toThrow(/bad hlc/); // collection.load() calls observe() on every change: the app cannot start
    expect(hlcCompare(next, last)).toBeGreaterThan(0); // FAILS: '10000' < 'ffff' as strings, so the newer change loses LWW
  });
  it('one peer with a future clock moves every device to that wall time for good', () => {
    let now = 1_700_000_000_000;
    const c = new Clock('dev1', () => now);
    c.observe('1900000000000-0000-badclock'); // a device six years ahead pushed once
    now += 3600_000;
    const t = hlcDecode(c.tick());
    expect(t.wall).toBe(1_700_000_000_000 + 3600_000); // FAILS: it is stuck at 1900000000000; nothing edited on any device wins against it, and the counter now only grows (see above)
  });
  it('a v2 import of 65,536 field values produces HLCs the server and the clock reject', () => {
    const accessions: Record<string, unknown> = {};
    for (let i = 0; i < 700; i++) accessions[`2020-${i}`] = { acc: `2020-${i}`, taxonId: 'x', status: 'growing', events: Array.from({ length: 20 }, (_, j) => ({ id: 'e' + j, d: '2020-01-01', t: 'water' })) };
    const { changes } = importV2({ collection: { accessions } });
    expect(changes.length).toBeGreaterThan(0xffff);
    const bad = changes.filter((c) => !/^\d{13}-[0-9a-f]{4}-[a-z0-9]{1,16}$/.test(c.t));
    expect(bad).toHaveLength(0); // FAILS
  });
});

describe('FINDING: removing a place orphans sowings and plants moved there concurrently', () => {
  it('sowings in a removed place keep pointing at a deleted node', async () => {
    const { collection } = await boot(newMem('aaaaaaaaaaaa'), fakeR2());
    const room = await collection.addLocation({ name: 'Room', parentId: null, type: 'room' });
    const shelf = await collection.addLocation({ name: 'Shelf', parentId: room.id, type: 'shelf' });
    const s = await collection.addSowing({ taxonName: 'Copiapoa', method: 'seed', sown: '2026-03-01', count: 10, locationId: shelf.id });
    await collection.removeLocation(shelf.id);
    const after = collection.sowing(s.id)!;
    expect(collection.location(after.locationId!)).toBeDefined(); // FAILS: "nothing is orphaned" holds for plants, not sowings
  });
  it('a plant moved into a place by an offline device after that place was removed vanishes from every bench', async () => {
    const { collection } = await boot(newMem('aaaaaaaaaaaa'), fakeR2());
    const room = await collection.addLocation({ name: 'Room', parentId: null, type: 'room' });
    const shelf = await collection.addLocation({ name: 'Shelf', parentId: room.id, type: 'shelf' });
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'A-1', locationId: room.id });
    await collection.removeLocation(shelf.id);
    // The other device's move, stamped after the removal, arrives through a pull.
    await collection.ingest([{ t: hlcEncode({ wall: Date.now() + 5000, count: 0, device: 'bbbbbbbbbbbb' }), kind: 'accession', id: a.id, field: 'locationId', value: shelf.id }], 'server');
    const found = collection.plantsAt(room.id).some((p) => p.id === a.id);
    expect(found || collection.location(shelf.id)).toBeTruthy(); // FAILS: the plant is in a deleted place and on no bench page
  });
});

describe('FINDING (low): the fold keeps its bookkeeping in the same map as field names', () => {
  it('a change to a field literally named "_deleted=" or "*" resurrects or immortalises a record', () => {
    const t = (n: number) => `${String(1700000000000 + n).padStart(13, '0')}-0000-x`;
    const st = materialise([
      { t: t(1), kind: 'accession', id: 'r1', field: 'taxonName', value: 'X' },
      { t: t(2), kind: 'accession', id: 'r1', field: '_deleted', value: true },
      { t: t(3), kind: 'accession', id: 'r1', field: '_deleted=', value: 'hello' } // passes assertField and the backup schema
    ]).state;
    expect(st.get('accession:r1')?._deleted).toBe(true); // FAILS: visible again
    const st2 = materialise([
      { t: t(1), kind: 'accession', id: 'r2', field: '*', value: 1 },
      { t: t(9), kind: 'accession', id: 'r2', field: '_deleted', value: true }
    ]).state;
    expect(st2.get('accession:r2')?._deleted).toBe(true);
    const later = { t: t(99), kind: 'accession', id: 'r2', field: '*', value: 1 } as Change;
    apply(st2, [later]);
    expect(st2.get('accession:r2')?._deleted).toBe(true); // FAILS: the "*" edit outranks any future delete
  });
});

/* ---------------------------------------------------------------- sound */

describe('checked and sound', () => {
  it('the fold is order-independent for delete/edit/restore interleavings with skewed clocks', () => {
    const t = (n: number, d = 'a') => `${String(1700000000000 + n).padStart(13, '0')}-0000-${d}`;
    const cs: Change[] = [
      { t: t(5), kind: 'accession', id: 'r', field: 'notes', value: 'edit' },
      { t: t(3), kind: 'accession', id: 'r', field: '_deleted', value: true },
      { t: t(1), kind: 'accession', id: 'r', field: 'taxonName', value: 'X' },
      { t: t(4, 'b'), kind: 'accession', id: 'r', field: '_deleted', value: false },
      { t: t(7, 'b'), kind: 'accession', id: 'r', field: '_deleted', value: true },
      { t: t(6), kind: 'accession', id: 'r', field: 'notes', value: 'edit2' }
    ];
    const perms = [cs, [...cs].reverse(), [cs[3], cs[0], cs[5], cs[1], cs[2], cs[4]]];
    const results = perms.map((p) => JSON.stringify([...materialise(p).state.values()].map((r) => Object.entries({ ...r }).sort())));
    expect(new Set(results).size).toBe(1);
    expect(materialise(cs).state.get('accession:r')?._deleted).toBe(true);
    // Incremental apply with a shared seen map agrees with a one-shot fold.
    const inc = materialise(cs.slice(0, 3));
    apply(inc.state, cs.slice(3), inc.seen);
    expect(Object.entries({ ...inc.state.get('accession:r') }).sort()).toEqual(Object.entries({ ...materialise(cs).state.get('accession:r') }).sort());
  });
  it('the same batch pushed twice lands once; a re-pushed identical batch is acked', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.collection.addAccession({ taxonName: 'Lithops', acc: 'B-1' });
    await B.sync.setup(KEY, 'create');
    const n = [...r2.objs.keys()].filter((k) => k.includes('/log/')).length;
    await (await import('$lib/db/vault')).outboxFill();
    await B.sync.run();
    expect([...r2.objs.keys()].filter((k) => k.includes('/log/')).length).toBe(n);
  });
  it('the Worker refuses paths that are not HLCs or photo ids, and a wrong token, before touching R2', async () => {
    const r2 = fakeR2();
    const B = await boot(newMem('bbbbbbbbbbbb'), r2);
    await B.sync.setup(KEY, 'create');
    const keys = await deriveKeys(KEY);
    const h = { authorization: `Bearer ${keys.token}` };
    expect((await fetch(`/api/sync/log/..%2F..%2Fmeta.json?vault=${keys.id}`, { headers: h })).status).toBe(400);
    expect((await fetch(`/api/sync/photo/x?vault=${keys.id}`, { headers: h })).status).toBe(400);
    expect((await fetch(`/api/sync/photo/P%2E%2E%2Fmeta?vault=${keys.id}`, { headers: h })).status).toBe(400);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`, { method: 'POST', headers: { ...h, 'x-batch': '../x' }, body: new Uint8Array(3) })).status).toBe(400);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`, { headers: { authorization: `Bearer ${'0'.repeat(64)}` } })).status).toBe(403);
    expect((await fetch(`/api/sync/log?vault=${keys.id}`)).status).toBe(401);
    expect((await fetch(`/api/sync/vault`, { method: 'POST', body: JSON.stringify({ id: keys.id, token: '1'.repeat(64), create: true }) })).status).toBe(403);
    expect([...r2.objs.keys()].every((k) => k.startsWith(`vault/${keys.id}/`))).toBe(true);
  });
  it('crypto: a photo sealed for one vault does not open in another, nor as a log', async () => {
    const a = await deriveKeys(newVaultKey()), b = await deriveKeys(newVaultKey());
    const blob = await sealJson(a, 'photo', { x: 1 });
    await expect(openJson(b, 'photo', blob)).rejects.toThrow();
    await expect(openJson(a, 'log', blob)).rejects.toThrow();
    blob[0] = 2;
    await expect(openJson(a, 'photo', blob)).rejects.toThrow(/version/);
  });
});
