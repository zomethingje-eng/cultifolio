/**
 * Clock review of round sixty-one: the snapshot's part in the round's clock rules, on the real vault over an in-memory
 * IndexedDB (the harness of fold-snapshot.test.ts). Guards for two fixes no test held (both mutations survived the
 * round's clock tests):
 *  - a park judged by the clock alone is not stored, but rides in the snapshot's inventory and is judged again at the
 *    next load, so its Apply still stands after a load from the snapshot (M16);
 *  - the held count, on a load from the snapshot, leaves out a held change an edit here was since stamped past: the
 *    snapshot's held stamps have their fields read back (M22).
 *
 * PASSES on f4ab4f8. Run: npx vitest run tests/unit/clock--snapshot.test.ts
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const DAY = 86_400_000;
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (i: number, wall: number): Change[] => [
  { t: stamp(wall, 0), kind: 'accession', id: `p${i}`, field: 'taxonName', value: `Species ${i}` },
  { t: stamp(wall, 1), kind: 'accession', id: `p${i}`, field: 'status', value: 'growing' },
  { t: stamp(wall, 2), kind: 'accession', id: `p${i}`, field: 'acc', value: `2024-${String(i).padStart(4, '0')}` }
];
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
// The clock's correction is kept in localStorage between loads: one store for the whole test, as one browser has.
const ls = new Map<string, string>();
const hadLs = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  vi.useRealTimers();
  if (hadLs) Object.defineProperty(globalThis, 'localStorage', hadLs); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('the snapshot and the clock rules of round sixty-one', () => {
  it('a park judged by a confirmed clock alone is not stored, rides in the snapshot\'s inventory, and is listed with Apply after a load from the snapshot (M16)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const base = 1_800_000_000_000;
    vi.setSystemTime(base);
    let b = await boot();
    b.hlc.trustServerTime(base, base); // a sync reading confirmed this clock (kept in localStorage)
    await b.vault.appendChanges([...plant(1, base - 1000), { t: stamp(base + 3 * DAY), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Renamed three days ahead' }], true);
    await b.store.collection.load();
    expect(b.store.collection.parkedRecords).toBe(1);
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]); // rule 5: a reading, not stored
    vi.setSystemTime(base + 60_000);
    b = await boot();
    expect(b.hlc.clockChecked()).toBe(true);
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.taxonName).toBe('Species 1');
    expect(b.store.collection.parkedRecords).toBe(1);
  });

  it('on a load from the snapshot, a held change an edit here was since stamped past is not counted as waiting (M22)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const base = 1_800_000_000_000;
    vi.setSystemTime(base);
    let b = await boot();
    await b.vault.appendChanges([...plant(1, base - 1000), { t: stamp(base + 3_600_000), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Renamed an hour ahead' }], true);
    await b.store.collection.load();
    expect(b.store.collection.heldWaiting).toBe(1);
    await b.store.collection.put('accession', 'p1', { taxonName: 'Renamed here' }); // stamped past the held change (marked)
    expect(b.store.collection.heldWaiting).toBe(0);
    await b.store.collection.rebuild(); // a snapshot whose inventory holds the held stamp
    expect(await b.store.collection.snapshotWritten).toBe(true);
    vi.setSystemTime(base + 60_000);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.taxonName).toBe('Renamed here');
    expect(b.store.collection.heldWaiting).toBe(0);
  });
});
