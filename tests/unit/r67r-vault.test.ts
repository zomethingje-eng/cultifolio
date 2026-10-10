/**
 * Round sixty-seven, agent R: the vault's contracts and the cost of a change, on the real vault over fake IndexedDB.
 *  - C1: `putWith`'s `opts.meta` and `opts.markLast` land in the changes' own transaction, or not at all; and
 *    `arrivalSeqsAfter` reads every change after an arrival number, with its number, in arrival order.
 *  - C2: the example's database writes no outbox rows (triage-66 R13).
 *  - R13: the load's tail is read with one range read, not one `get` per change (the self-review's E1: 432 gets on every
 *    example page); a write that mints numbers moves the frontier, so the next write does not re-read the log (E5); a
 *    snapshot can be written on request after an import or a seed.
 * Each case marked "base" failed on the round-sixty-six base (the API did not exist, or the counts were per change).
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (i: number, wall: number): Change[] => [
  { t: stamp(wall, 0), kind: 'accession', id: `p${i}`, field: 'taxonName', value: `Species ${i}` },
  { t: stamp(wall, 1), kind: 'accession', id: `p${i}`, field: 'status', value: 'growing' },
  { t: stamp(wall, 2), kind: 'accession', id: `p${i}`, field: 'acc', value: `2024-${String(i).padStart(4, '0')}` }
];

const ss = new Map<string, string>();
const hadSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
function inExample(on: boolean) {
  ss.clear();
  if (on) ss.set('cultifolio.demo', '1');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => ss.get(k) ?? null, setItem: (k: string, v: string) => void ss.set(k, v), removeItem: (k: string) => void ss.delete(k) } });
}
async function boot(): Promise<{ store: Store; vault: Vault }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { store, vault };
}
/** Requests made on an object store of the vault, by method and store, while `count` is on. */
const calls = new Map<string, number>();
let counting = false;
for (const m of ['get', 'getAll', 'getAllKeys', 'count', 'put', 'add'] as const) {
  const real = IDBObjectStore.prototype[m] as (...a: unknown[]) => unknown;
  (IDBObjectStore.prototype as unknown as Record<string, unknown>)[m] = function (this: IDBObjectStore, ...a: unknown[]) {
    if (counting) calls.set(`${m}:${this.name}`, (calls.get(`${m}:${this.name}`) ?? 0) + 1);
    return real.apply(this, a);
  };
}
const n = (k: string) => calls.get(k) ?? 0;
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  inExample(false);
  calls.clear();
  counting = false;
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (hadSession) Object.defineProperty(globalThis, 'sessionStorage', hadSession); else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
});

describe('C1: putWith carries meta and the last arrival number in its own transaction', () => {
  it('base: the meta and the mark land with the changes, and arrivalSeqsAfter reads what came after the mark', async () => {
    const { store, vault } = await boot();
    await vault.appendChanges(plant(1, Date.now() - 1000), true); // something before the seed
    await store.collection.load();
    await store.collection.putWith('accession', 'seed1', { taxonName: 'Copiapoa cinerea', status: 'growing', acc: '2026-0001' }, [], [{ kind: 'taxon', id: 'copiapoa-cinerea', fields: { name: 'Copiapoa cinerea' } }], { meta: { demoSeeded: true }, markLast: 'demoSeedTop' });
    const mark = await vault.getMeta<number>('demoSeedTop');
    expect(await vault.getMeta('demoSeeded')).toBe(true);
    expect(mark).toBe(await vault.lastArrival());
    expect(await vault.arrivalSeqsAfter(mark!)).toEqual([]);
    // The seed's own changes are the rows up to the mark, after the earlier ones.
    const seedRows = (await vault.arrivalSeqsAfter(3)).map((r) => r.id);
    expect(new Set(seedRows)).toEqual(new Set(['seed1', 'copiapoa-cinerea']));
    // A visitor's edit after the seed is after the mark, with its number, in arrival order.
    await store.collection.put('accession', 'seed1', { notes: 'mine' });
    const after = await vault.arrivalSeqsAfter(mark!);
    expect(after.map((r) => [r.kind, r.id, r.field, r.value])).toEqual([['accession', 'seed1', 'notes', 'mine'], ['accession', 'seed1', 'notesBase', null]]);
    expect(after.map((r) => r.seq)).toEqual([mark! + 1, mark! + 2]);
    expect(after.every((r) => typeof r.t === 'string')).toBe(true);
  });
  it('base: a commit the vault refuses writes neither the changes nor the meta nor the mark', async () => {
    const { store, vault } = await boot();
    await store.collection.load();
    const realAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
      if (this.name === 'order') throw new DOMException('', 'QuotaExceededError');
      return realAdd.call(this, v, k);
    });
    await expect(store.collection.putWith('accession', 'seed1', { taxonName: 'Copiapoa cinerea', status: 'growing', acc: '2026-0001' }, [], [], { meta: { demoSeeded: true }, markLast: 'demoSeedTop' })).rejects.toBeTruthy();
    vi.restoreAllMocks();
    expect(await vault.getMeta('demoSeeded')).toBeUndefined();
    expect(await vault.getMeta('demoSeedTop')).toBeUndefined();
    expect(await vault.allChanges()).toEqual([]);
  });
});

describe('C2: the example writes no outbox rows', () => {
  it('base: a write in the example stores its changes and no outbox row; the grower\'s own still does', async () => {
    let { store, vault } = await boot();
    await store.collection.load();
    await store.collection.addAccession({ taxonName: 'Lithops lesliei' });
    expect((await vault.outboxKeys()).length).toBeGreaterThan(0);
    inExample(true);
    ({ store, vault } = await boot());
    await vault.wipeVault();
    await vault.setMeta('device', DEV);
    await store.collection.load();
    await store.collection.addAccession({ taxonName: 'Copiapoa cinerea' });
    await store.collection.addEvents([{ acc: store.collection.accessions[0].id, d: '2026-10-01', t: 'water' }]);
    expect((await vault.allChanges()).length).toBeGreaterThan(5);
    expect(await vault.outboxKeys()).toEqual([]);
  });
});

describe('R13: the cost of each change', () => {
  it('base: a load from a snapshot with a 431-change tail reads the tail in one range read, not 431 gets', async () => {
    let { store, vault } = await boot();
    await store.collection.load(); // the empty example's first page: a snapshot at seq 0
    expect(await store.collection.snapshotWritten).toBe(true);
    const base = Date.now() - 86_400_000;
    const seed: Change[] = [];
    for (let i = 1; i <= 143; i++) seed.push(...plant(i, base + i));
    seed.push(...plant(144, base + 200).slice(0, 2)); // 431
    expect(seed).toHaveLength(431);
    await vault.appendChanges(seed, true);
    ({ store, vault } = await boot());
    counting = true;
    await store.collection.load();
    counting = false;
    expect(store.collection.loaded).toEqual({ from: 'snapshot', changes: 431, snapshot: 0 });
    expect(store.collection.accessions).toHaveLength(144);
    expect(n('get:changes')).toBeLessThanOrEqual(2); // base: 431
    expect(n('getAll:changes')).toBe(1);
  });
  it('a few old stamps scattered through a large log are read one by one, not as the whole range', async () => {
    let { store, vault } = await boot();
    const base = Date.now() - 86_400_000;
    const log: Change[] = [];
    for (let i = 1; i <= 400; i++) log.push(...plant(i, base + i * 10));
    await vault.appendChanges(log, true);
    await store.collection.load();
    expect(await store.collection.snapshotWritten).toBe(true);
    // A pull brings two changes stamped at either end of the log.
    await vault.appendChanges([{ t: stamp(base + 5, 7), kind: 'accession', id: 'p1', field: 'notes', value: 'a' }, { t: stamp(base + 3995, 7), kind: 'accession', id: 'p400', field: 'notes', value: 'b' }], true);
    ({ store, vault } = await boot());
    counting = true;
    await store.collection.load();
    counting = false;
    expect(store.collection.accession('p1')?.notes).toBe('a');
    expect(store.collection.accession('p400')?.notes).toBe('b');
    expect(n('getAll:changes')).toBe(0);
    expect(n('get:changes')).toBe(2);
  });
  it('the tail comes back in arrival order, not stamp order', async () => {
    const { vault } = await boot();
    const base = Date.now() - 86_400_000;
    const late = { t: stamp(base + 100), kind: 'accession', id: 'p1', field: 'notes', value: 'late stamp, first in' } as Change;
    const early = { t: stamp(base + 1), kind: 'accession', id: 'p1', field: 'notes', value: 'early stamp, second in' } as Change;
    await vault.appendChanges([late], true);
    await vault.appendChanges([early], true);
    expect((await vault.arrivalsAfter(0)).changes.map((c) => c.value)).toEqual(['late stamp, first in', 'early stamp, second in']);
  });
  it('base: a write after a write that minted a number does not read the log again', async () => {
    const { store } = await boot();
    await store.collection.load();
    const a = await store.collection.addAccession({ taxonName: 'Copiapoa cinerea' });
    await settle();
    counting = true;
    await store.collection.put('accession', a.id, { notes: 'repotted' });
    await settle();
    counting = false;
    expect(n('getAll:order')).toBe(0); // base: 1, the catch-up re-reading every change since the load
    expect(n('get:changes')).toBe(0);
  });
  it('base: saveSnapshot writes the fold as it is, and the next load reads only what came after', async () => {
    let { store } = await boot();
    await store.collection.load();
    for (let i = 0; i < 5; i++) await store.collection.addAccession({ taxonName: `Aloe ${i}` });
    await settle(); // the order store's numbers go on after the wipe before this test, so its first write catches up first
    expect(await store.collection.saveSnapshot()).toBe(true);
    ({ store } = await boot());
    await store.collection.load();
    expect(store.collection.loaded.from).toBe('snapshot');
    expect(store.collection.loaded.changes).toBe(0);
    expect(store.collection.accessions).toHaveLength(5);
  });
});
