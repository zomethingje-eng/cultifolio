/**
 * The snapshot of the folded state, on the real vault over an in-memory IndexedDB (round fifty-three, 1; the reviewers'
 * finding 25): a second load reads the snapshot and the changes that arrived after it, in arrival order, and comes out
 * as the whole-log fold does; a held change that came due since is folded; the snapshot goes with a replace and with a
 * displaced change, and a write of one that began before either is refused; another build's rules, another device, or
 * a changed clock correction fold the log again; another tab's writes are caught up by arrival.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode, MAX_AHEAD_MS } from '$core/hlc';
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
const watering = (i: number, wall: number, d: string): Change[] => [
  { t: stamp(wall, 0), kind: 'event', id: `e${i}`, field: 'acc', value: `p${i}` },
  { t: stamp(wall, 1), kind: 'event', id: `e${i}`, field: 'd', value: d },
  { t: stamp(wall, 2), kind: 'event', id: `e${i}`, field: 't', value: 'water' }
];

/** A fresh module graph over the same database: a new tab, or the page reloaded. */
async function boot(): Promise<{ store: Store; vault: Vault }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { store, vault };
}
const picture = (c: Store['collection']) => ({
  plants: c.accessions.map((a) => [a.id, a.acc, a.status]),
  watered: c.accessions.map((a) => [a.id, c.lastWatered(a.id)]),
  places: c.locations.map((l) => [l.id, l.name, c.placeOf(l.id)])
});

beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await vault.setMeta('device', DEV);
  await vault.setMeta('parked', []);
  await vault.setMeta('sync', null);
});

describe('the fold snapshot', () => {
  it('the first load folds the log and writes the snapshot; the next reads it and folds only what arrived after, to the same state', async () => {
    const base = Date.now() - 10 * 86_400_000;
    const { vault } = await boot();
    const first: Change[] = [];
    for (let i = 1; i <= 300; i++) first.push(...plant(i, base + i * 1000), ...watering(i, base + i * 1000 + 500, '2024-05-01'));
    await vault.appendChanges(first, true);
    let b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded).toEqual({ from: 'log', changes: first.length });
    expect(await b.store.collection.snapshotWritten).toBe(true);
    const whole = picture(b.store.collection);
    expect(whole.plants).toHaveLength(300);
    // What arrives after the snapshot: an older stamp than any folded (a peer's pull), a new plant, a watering, a removal
    const later: Change[] = [
      ...plant(301, base - 86_400_000), // stamped before everything, arriving last: folded by arrival, not by stamp
      ...watering(7, Date.now() - 1000, '2024-06-01'),
      { t: stamp(Date.now() - 500), kind: 'accession', id: 'p9', field: '_deleted', value: true }
    ];
    await b.vault.appendChanges(later, true);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded).toEqual({ from: 'snapshot', changes: later.length, snapshot: first.length });
    const quick = picture(b.store.collection);
    // the same as a fold of the whole log
    const { store: ref, vault: rv } = await boot();
    await rv.dropFold();
    await ref.collection.load();
    expect(ref.collection.loaded.from).toBe('log');
    expect(quick).toEqual(picture(ref.collection));
    expect(quick.plants).toHaveLength(300); // 301 added, 9 removed
    expect(quick.watered.find(([id]) => id === 'p7')?.[1]).toBe('2024-06-01');
  });

  it('a held change that came due since the snapshot is folded on the load that finds it due', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // the clock alone: the in-memory IndexedDB schedules its work on real timers
    const base = 1_800_000_000_000;
    vi.setSystemTime(base);
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base - 1000)], true);
    let b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    // a peer's edit stamped an hour ahead: held, in the log
    const ahead = base + 3_600_000;
    await b.vault.appendChanges([{ t: stamp(ahead), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Renamed ahead' }], true);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.taxonName).toBe('Species 1'); // still held
    expect(await b.store.collection.snapshotWritten).toBe(false); // a short tail: the snapshot stands
    // two hours later, from the snapshot that never saw it applied
    vi.setSystemTime(ahead + MAX_AHEAD_MS + 1000);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.taxonName).toBe('Renamed ahead');
  });

  it('a replace drops the snapshot; a displaced change drops it; a write that began before either is refused', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    const b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect(await b.vault.readFold()).toBeDefined();
    const gen0 = await b.vault.foldGen();
    // a change under a stamp already stored, ranking higher: displaced
    await b.vault.appendChanges([{ t: stamp(base, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Species 1x' }], true); // ranks higher by content than "Species 1" (a longer value, the quote outranked)
    expect(await b.vault.readFold()).toBeUndefined();
    expect(await b.vault.foldGen()).toBe(gen0 + 1);
    // the write that was built against gen0 is refused
    const f = (await b.vault.readFold()) ?? undefined;
    expect(f).toBeUndefined();
    expect(await b.vault.writeFold({ rules: 1, device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], last: '', changes: 0 }, gen0)).toBe(false);
    expect(await b.vault.writeFold({ rules: 1, device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], last: '', changes: 0 }, gen0 + 1)).toBe(true);
    expect(await b.vault.readFold()).toBeDefined();
    // a replace from a staged file
    const st = await b.vault.openStaging();
    await st.appendChanges([...plant(2, base)]);
    await st.promote();
    expect(await b.vault.readFold()).toBeUndefined();
    expect(await b.vault.foldGen()).toBe(gen0 + 2);
    expect((await b.vault.arrivalsAfter(0)).changes).toHaveLength(3); // the order holds the replacement's changes and nothing of the old log
    const c = await boot();
    await c.store.collection.load();
    expect(c.store.collection.loaded.from).toBe('log');
    expect(c.store.collection.accessions.map((a) => a.id)).toEqual(['p2']);
  });

  it('another build\'s rules, another device, or a changed clock correction fold the log again', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    let b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    const good = (await b.vault.readFold())!;
    await b.vault.writeFold({ ...good.fold, rules: good.fold.rules + 1 }, good.gen);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('log');
    expect(await b.store.collection.snapshotWritten).toBe(true); // written afresh under this build's rules
    await b.vault.writeFold({ ...(await b.vault.readFold())!.fold, device: 'cccccccccccc' }, await b.vault.foldGen());
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('log');
    await b.store.collection.snapshotWritten;
    // the correction in force differs from the snapshot's
    b = await boot();
    const hlc = await import('$core/hlc');
    expect(Math.abs(hlc.trustServerTime(Date.now() + 3_600_000) - 3_600_000)).toBeLessThan(50); // an hour: taken on one reading
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('log');
    hlc._resetClockOffset();
  });

  it('a tab catches up with another tab\'s writes by arrival, including a stamp older than any it folded', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    const a = await boot();
    await a.store.collection.load();
    const b = await boot();
    await b.store.collection.load();
    await b.vault.appendChanges([...plant(2, base - 3_600_000), ...watering(1, Date.now() - 1000, '2024-07-01')], true);
    // the channel does not reach across modules here; the catch-up is called as the notice would
    await (a.store.collection as unknown as { catchUp(): Promise<void> }).catchUp();
    expect(a.store.collection.accessions.map((x) => x.id).sort()).toEqual(['p1', 'p2']);
    expect(a.store.collection.lastWatered('p1')).toBe('2024-07-01');
    // and again: nothing new is nothing folded
    await (a.store.collection as unknown as { catchUp(): Promise<void> }).catchUp();
    expect(a.store.collection.accessions).toHaveLength(2);
  });
});
