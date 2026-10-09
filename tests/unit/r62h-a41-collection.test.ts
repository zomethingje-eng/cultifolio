/**
 * Round sixty-two, agent H (triage decision 10; outside review A41): fixes of round sixty-one that could be reverted with
 * every unit test green, each now held by a test of what the grower sees, over the real vault (fake-indexeddb) and the
 * real collection, so the tests outlive a rewrite of the code under them:
 * 1. a peer change parked by a confirmed clock alone is still parked, with its Apply, on a load from the snapshot (the
 *    snapshot's inventory carries the clock's parks; reverted to `held = [...this.heldStamps]`, the change was neither
 *    parked nor held nor shown); and once the clock is no longer confirmed, it is held, coming due, not lost;
 * 2. a rebuild judges the clock's parks again (reverted, without its two resets, a change parked by a clock that is no
 *    longer confirmed stayed parked in this tab instead of held);
 * 5. a plant acquired in a year alone ("2019") is numbered for that year by the collection itself, as the import plans it;
 * 8. Move's Undo puts back the plants still where the Move left them and removes their own "to X" lines, and leaves a
 *    plant moved on since where it is, with its line.
 * (A41's 3 and 4, the engine's DELETE 409 asked again an hour on and not within it, did not reproduce as green: both
 * reverts fail sync-engine.test.ts's "round sixty: the removal carries its time..." on this base. A41's 6 and 7 are
 * r62h-a41-sample-lock.test.ts and r62h-harness.spec.ts.)
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');
const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** A plant of this device's and a peer's edit of its notes stamped three days ahead; the clock confirmed by a reading now. */
async function farPeerEdit() {
  const T0 = Date.now();
  const b = await boot();
  b.hlc.trustServerTime(T0, T0);
  const own = (i: number) => hlcEncode({ wall: T0 - 3_600_000 + i, count: 0, device: DEV + '0000' });
  const far = hlcEncode({ wall: T0 + 3 * DAY, count: 0, device: PEER });
  await b.vault.appendChanges([
    { t: own(0), kind: 'accession', id: 'p1', field: 'acc', value: '2026-0001' },
    { t: own(1), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Copiapoa cinerea' },
    { t: own(2), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
    { t: own(3), kind: 'accession', id: 'p1', field: 'notes', value: 'mine' },
    { t: far, kind: 'accession', id: 'p1', field: 'notes', value: 'from a peer three days ahead' }
  ], true);
  return far;
}
const parkedNotes = (c: Store['collection']) => c.parkedFor('accession', 'p1').map((x) => x.value);

describe('a park judged by the clock alone (A41 1 and 2)', () => {
  it('is parked again, with Apply, on a load from the snapshot under the same clock; held once the clock is no longer confirmed', async () => {
    await farPeerEdit();
    let b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded?.from).toBe('log');
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect(parkedNotes(b.store.collection)).toEqual(['from a peer three days ahead']); // the plant page offers Apply for it
    b = await boot(); // the next load, a moment later: from the snapshot
    await b.store.collection.load();
    expect(b.store.collection.loaded?.from).toBe('snapshot');
    expect(parkedNotes(b.store.collection)).toEqual(['from a peer three days ahead']); // still offered, not gone from every list
    expect(b.store.collection.accession('p1')?.notes).toBe('mine');
    b.hlc.clearClockOffset(); // syncing stopped: no reading confirms the clock any more
    b = await boot();
    await b.store.collection.load();
    expect(parkedNotes(b.store.collection)).toEqual([]);
    expect(b.store.collection.heldWaiting).toBe(1); // held, coming due: an unconfirmed clock parks nothing it alone judged
  });

  it('a rebuild after the clock stops being confirmed holds it, in this tab, rather than keeping the old park', async () => {
    await farPeerEdit();
    const b = await boot();
    await b.store.collection.load();
    expect(parkedNotes(b.store.collection)).toEqual(['from a peer three days ahead']);
    b.hlc.clearClockOffset();
    expect(b.hlc.clockChecked()).toBe(false);
    await b.store.collection.rebuild();
    expect(parkedNotes(b.store.collection)).toEqual([]);
    expect(b.store.collection.heldWaiting).toBe(1);
    expect(b.store.collection.accession('p1')?.notes).toBe('mine');
  });
});

describe('the collection, round sixty-one (A41 5 and 8)', () => {
  it('a plant acquired in a year alone is numbered for that year when it is added', async () => {
    const b = await boot();
    await b.store.collection.load();
    const a = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acquired: '2019' });
    expect(a.acc).toBe('2019-0001');
    const m = await b.store.collection.addAccession({ taxonName: 'Copiapoa humilis', acquired: '2019-05' });
    expect(m.acc).toBe('2019-0002');
  });

  it("Move's Undo puts back the plants still where it left them and removes their own lines; a plant moved on since keeps its place and its line", async () => {
    const b = await boot();
    const c = b.store.collection;
    await c.load();
    const bench = await c.addLocation({ name: 'Bench', parentId: null });
    const frame = await c.addLocation({ name: 'Cold frame', parentId: null });
    const shelf = await c.addLocation({ name: 'Shelf', parentId: null });
    const one = await c.addAccession({ taxonName: 'Copiapoa cinerea', locationId: bench.id });
    const two = await c.addAccession({ taxonName: 'Copiapoa humilis', locationId: bench.id });
    const moved = await c.movePlantsUndoable([one.id, two.id], frame.id);
    expect(moved.n).toBe(2);
    const lines = (id: string) => c.events(id).filter((e) => e.t === 'move').map((e) => e.note);
    expect(lines(one.id)).toEqual(['to Cold frame']);
    await c.movePlants([two.id], shelf.id); // moved on since
    await moved.undo();
    expect(c.accession(one.id)?.locationId).toBe(bench.id);
    expect(lines(one.id)).toEqual([]); // the put-back plant's "to Cold frame" is gone from its log
    expect(c.accession(two.id)?.locationId).toBe(shelf.id);
    expect(lines(two.id)).toContain('to Cold frame'); // it was there, and its log says so
  });
});
