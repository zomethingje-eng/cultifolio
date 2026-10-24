/**
 * Round eighty-two, the independent review's 1: a Replace from a backup resumed by two tabs lost photographs. Tab A's
 * switch set the flag, wiped the live stores and copied the photographs one by one; a tab B that opened the vault
 * meanwhile saw the flag and ran the same copy, wiping what A had copied; A finished from its own list, cleared the flag
 * and deleted the staging database, and if B was closed part-way the photographs A copied before B's wipe were gone (and,
 * when B was closed between its wipe and its copy of the log, the records too).
 *
 * Two tabs are two module instances over one fake IndexedDB. B is opened from inside A's copy (at A's second photograph),
 * and B "is closed" right after its first write: every later write of B's connection is refused, as a closed tab's are
 * never made. With Web Locks (a stand-in LockManager, shared by the two instances as a browser's is by its tabs) B waits
 * for A and finds nothing to do; without them (node has none, as an engine without the API) B runs the copy beside A's
 * and nothing is lost either. All three failed on r82base: the last open found 10 of 12 photographs (the two A had
 * copied before B opened were gone), and the third emptied the collection for a staging database that was gone.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deleteDB } from 'idb';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const N = 12;
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (id: string, no: string, base: number, device = 'bbbbbbbbbbbb'): Change[] => [
  { t: stamp(base, 0, device), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(base, 1, device), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(base, 2, device), kind: 'accession', id, field: 'acc', value: no }
];
const photo = (id: string, i: number, base: number): Change[] =>
  Object.entries({ acc: 'file', d: '2026-01-01', w: 4, h: 3, bytes: 6 }).map(([field, value], k) => ({ t: stamp(base + 10 + i, k), kind: 'photo', id, field, value }));
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 0xff, 0xd9])], { type: 'image/jpeg' });

/** A browser's LockManager as far as the vault uses it: exclusive, first come first served, `ifAvailable`. */
function lockManager() {
  const held = new Set<string>();
  const queue = new Map<string, (() => void)[]>();
  const asked: string[] = [];
  const release = (name: string) => {
    const next = queue.get(name)?.shift();
    if (next) next(); else held.delete(name);
  };
  return {
    asked,
    async request(name: string, a: unknown, b?: unknown) {
      const opts = (typeof a === 'function' ? {} : a) as { ifAvailable?: boolean };
      const cb = (typeof a === 'function' ? a : b) as (lock: { name: string } | null) => Promise<unknown>;
      asked.push(`${name}${opts.ifAvailable ? '?' : ''}`);
      if (held.has(name)) {
        if (opts.ifAvailable) return cb(null);
        await new Promise<void>((r) => (queue.get(name) ?? queue.set(name, []).get(name)!).push(r));
      } else held.add(name);
      try { return await cb({ name }); } finally { release(name); }
    }
  };
}

const realPut = IDBObjectStore.prototype.put;
const realTx = IDBDatabase.prototype.transaction;
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as { locks?: unknown }).locks;
});
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
  await deleteDB('cultifolio-staging');
});

/**
 * The grower's own plant, a file of one plant and N photographs staged in tab A, and A's switch. At A's second live
 * photograph tab B opens the vault; B's first write is let through and every later one refused (B was closed).
 */
async function twoTabs() {
  const base = Date.now() - 86_400_000;
  const a = await boot();
  await a.vault.appendChanges(plant('mine', '2026-0001', base, DEV), true);
  await a.vault.putPhotoBlobs({ id: 'pmine', blob: jpeg(200), thumb: jpeg(201) });
  await a.collection.load();
  const st = await a.vault.openStaging();
  const fileLog: Change[] = [...plant('file', '2025-0001', base - 1000)];
  for (let i = 0; i < N; i++) {
    await st.putPhoto({ id: `p${i}`, blob: jpeg(i), thumb: jpeg(100 + i) });
    fileLog.push(...photo(`p${i}`, i, base - 1000));
  }
  await st.appendChanges(fileLog);
  const b = await boot(); // tab B's code, loaded; it opens the vault only during A's copy
  let aConn: IDBDatabase | null = null;
  let livePuts = 0;
  let bOpen: Promise<unknown> | null = null;
  const bWrites: string[] = [];
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
    const db = this.transaction.db;
    if (this.name === 'photos' && db.name === 'cultifolio' && (aConn === null || db === aConn)) {
      aConn ??= db;
      if (++livePuts === 2) bOpen = b.vault.openVault().then(() => 'opened', (e) => e);
    }
    return realPut.call(this, v, k);
  });
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores: string | Iterable<string>, mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
    if (aConn && this !== aConn && this.name === 'cultifolio' && mode === 'readwrite') {
      bWrites.push(typeof stores === 'string' ? stores : [...stores].join(','));
      if (bWrites.length > 1) throw new DOMException('the tab was closed', 'InvalidStateError');
    }
    return realTx.call(this, stores, mode, o);
  });
  const promoted = st.promote().then(() => 'promoted');
  const order: string[] = [];
  await Promise.all([promoted.then((x) => order.push(x)), vi.waitFor(() => expect(bOpen).not.toBeNull()).then(() => bOpen!.then(() => order.push('B opened')))]);
  vi.restoreAllMocks();
  // The next open of the collection, in a third tab.
  const c = await boot();
  await c.collection.load();
  const ids = (await c.vault.photoBlobIds()).sort();
  return { order, bWrites, ids, plants: c.collection.accessions.map((x) => x.id), pending: await c.vault.replacePending() };
}
const ALL = Array.from({ length: N }, (_, i) => `p${i}`).sort();

describe('a Replace from a backup with a second tab opened during its switch (the independent review\'s 1)', () => {
  it('with Web Locks: the second tab waits for the first and copies nothing; every photograph and record is there', async () => {
    const locks = lockManager();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    const r = await twoTabs();
    expect(locks.asked).toContain('cultifolio-replace?'); // B saw the flag and asked for the lock, which A held
    expect(locks.asked.filter((x) => x === 'cultifolio-replace')).toHaveLength(1); // and waited for it
    expect(r.order).toEqual(['promoted', 'B opened']);
    expect(r.bWrites).toEqual([]); // B wrote nothing: the copy was A's alone
    expect(r.ids).toEqual(ALL);
    expect(r.plants).toEqual(['file']);
    expect(r.pending).toBe(false);
  });

  it('without Web Locks: the second tab runs the copy beside the first and is closed part-way; nothing is lost', async () => {
    // An engine without the API. Node's own `navigator.locks`, where its build has one (the owner's PC ran
    // this with one, so B waited and wrote nothing): it is hidden here by an own property, which afterEach deletes.
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    const r = await twoTabs();
    expect(r.bWrites.length).toBeGreaterThan(0); // B did run a copy of its own, beside A's
    expect(r.ids).toEqual(ALL);
    expect(r.plants).toEqual(['file']);
    expect(r.pending).toBe(false);
  });

  it('a tab that finds the flag up and the staging database gone leaves the collection as it is (another tab finished)', async () => {
    const base = Date.now() - 86_400_000;
    const a = await boot();
    await a.vault.appendChanges(plant('mine', '2026-0001', base, DEV), true);
    await a.vault.putPhotoBlobs({ id: 'pmine', blob: jpeg(200), thumb: jpeg(201) });
    // The flag as a finishing tab leaves it for an instant: the staging copy deleted, the flag read up by a tab opening.
    const raw = (await a.vault.openVault()) as unknown as { put(s: string, v: unknown, k: string): Promise<unknown> };
    await raw.put('meta', true, 'staging-pending');
    const b = await boot();
    await b.collection.load();
    expect(b.collection.accessions.map((x) => x.id)).toEqual(['mine']); // r82base: [] (the log wiped for an empty file)
    expect(await b.vault.photoBlobIds()).toEqual(['pmine']);
    expect(await b.vault.replacePending()).toBe(false);
  });
});
