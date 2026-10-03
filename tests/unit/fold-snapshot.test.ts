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
import { FOLD_REFRESH } from '$lib/db/collection.svelte';
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
    expect(await b.vault.writeFold({ rules: 1, build: '', device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], held: [], last: '', changes: 0 }, gen0)).toBe(false);
    expect(await b.vault.writeFold({ rules: 1, build: '', device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], held: [], last: '', changes: 0 }, gen0 + 1)).toBe(true);
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

  it('round fifty-four: of two held changes to one field, the earlier comes due and is folded while the later stays held', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const base = 1_800_000_000_000;
    vi.setSystemTime(base);
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base - 1000), { t: stamp(base + 1_200_000), kind: 'accession', id: 'p1', field: 'taxonName', value: 'twenty minutes ahead' }, { t: stamp(base + 2_400_000), kind: 'accession', id: 'p1', field: 'taxonName', value: 'forty minutes ahead' }], true);
    let b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect((await b.vault.readFold())!.fold.held).toHaveLength(2);
    vi.setSystemTime(base + 1_200_000 + MAX_AHEAD_MS + 1000);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.taxonName).toBe('twenty minutes ahead');
    const ref = await boot();
    await ref.vault.dropFold();
    await ref.store.collection.load();
    expect(ref.store.collection.accession('p1')?.taxonName).toBe('twenty minutes ahead');
  });

  it('round fifty-four: a parked change keeps its Apply after a snapshot load, and the one-shape pass leaves a record whose number change is parked alone', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    // a legacy-shaped plant (its number is its id, no `acc`), whose only `acc` change is from a clock three years ahead
    await vault.appendChanges([{ t: stamp(base, 0), kind: 'accession', id: '2024-0001', field: 'taxonName', value: 'Legacy' }, { t: stamp(base, 1), kind: 'accession', id: '2024-0001', field: 'status', value: 'growing' }, { t: stamp(base + 3 * 365 * 86_400_000), kind: 'accession', id: '2024-0001', field: 'acc', value: '2024-9999' }], true);
    let b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.parkedFor('accession', '2024-0001')).toHaveLength(1);
    expect((await b.vault.allChanges()).filter((c) => c.field === 'acc')).toHaveLength(1); // no second number written
    expect(await b.store.collection.snapshotWritten).toBe(true);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.parkedFor('accession', '2024-0001')).toHaveLength(1);
    expect(b.store.collection.parkedRecords).toBe(1);
    expect((await b.vault.allChanges()).filter((c) => c.field === 'acc')).toHaveLength(1);
  });

  it('round fifty-four: a stamp parked after the snapshot drops it, and a snapshot of another build is not read', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    let b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    await b.store.collection.markParked([{ t: stamp(base, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Species 1' }]);
    expect(await b.vault.readFold()).toBeUndefined();
    // the tab that parked told the others to fold again; whichever path the next load takes, the parked name is not folded
    await new Promise((r) => setTimeout(r, 50));
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession('p1')).toBeUndefined();
    expect(b.store.collection.parkedFor('accession', 'p1')).toHaveLength(1);
    await b.store.collection.snapshotWritten;
    const good = (await b.vault.readFold())!;
    await b.vault.writeFold({ ...good.fold, build: 'another-build' }, good.gen);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('log');
  });

  it('round fifty-four: the revival repair judges a record whole, so a tombstone and an import stamp arriving after a real edit do not remove the plant, and an import stamp arriving after a removal in the snapshot does', async () => {
    const base = Date.now() - 10 * 86_400_000;
    const { vault } = await boot();
    // p1: made, removed, then revived by a real edit (T3), all folded into the snapshot save the removal and the import, which arrive later
    await vault.appendChanges([...plant(1, base), { t: stamp(base + 3000), kind: 'accession', id: 'p1', field: 'notes', value: 'revived for real' }, ...plant(2, base + 50), { t: stamp(base + 100), kind: 'accession', id: 'p2', field: '_deleted', value: true }], true);
    let b = await boot();
    await b.store.collection.load();
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect(b.store.collection.accession('p1')).toBeDefined();
    expect(b.store.collection.accession('p2')).toBeUndefined();
    // the old backup's changes arrive: p1's tombstone at T1 and importedOn at T2 (both before T3); p2's importedOn after its removal
    await b.vault.appendChanges([{ t: stamp(base + 1000), kind: 'accession', id: 'p1', field: '_deleted', value: true }, { t: stamp(base + 2000), kind: 'accession', id: 'p1', field: 'importedOn', value: '2024-01-01' }, { t: stamp(base + 200), kind: 'accession', id: 'p2', field: 'importedOn', value: '2024-01-01' }], true);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.accession('p1')?.notes).toBe('revived for real'); // not removed again: the tail alone would have said so
    expect(b.store.collection.accession('p2')).toBeUndefined(); // the legacy revival, removed again
    expect((await b.vault.allChanges()).filter((c) => c.id === 'p1' && c.field === '_deleted')).toHaveLength(1);
  });

  it('round fifty-four: the arrival rows read with the counter say when a replace landed between the counter and the tail', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    const b = await boot();
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    const gen0 = await b.vault.foldGen();
    const f = (await b.vault.readFold())!.fold;
    const st = await b.vault.openStaging();
    await st.appendChanges([...plant(2, base)]);
    await st.promote();
    const tail = await b.vault.arrivalsAfter(f.seq);
    expect(tail.changes.map((c) => c.id)).toEqual(['p2', 'p2', 'p2']); // numbered after the old snapshot's rows: the numbers alone would not have told
    expect(tail.gen).not.toBe(gen0);
  });

  it('round fifty-five: an own write that lands past another tab\'s unread row does not carry the frontier over it', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    const a = await boot();
    await a.store.collection.load();
    // another tab (here: the vault directly) stores a plant; before A hears of it, A writes its own
    await a.vault.appendChanges([...plant(2, base + 1000)], true);
    await a.store.collection.put('accession', 'p1', { notes: 'mine' });
    await new Promise((r) => setTimeout(r, 30)); // the catch-up the gap asked for
    expect(a.store.collection.accessions.map((x) => x.id).sort()).toEqual(['p1', 'p2']);
    expect(a.store.collection.accession('p1')?.notes).toBe('mine');
  });

  it('round fifty-five: a refreshed snapshot names the tail it folded, so the next load reads none of it again', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base)], true);
    let b = await boot();
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    const first = (await b.vault.readFold())!.fold.seq;
    const many: Change[] = [];
    for (let i = 0; i < FOLD_REFRESH; i++) many.push({ t: stamp(base + 10_000 + i), kind: 'location', id: `l${i}`, field: 'name', value: `Place ${i}` });
    await b.vault.appendChanges(many, true);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded).toMatchObject({ from: 'snapshot', changes: FOLD_REFRESH });
    expect(await b.store.collection.snapshotWritten).toBe(true);
    expect((await b.vault.readFold())!.fold.seq).toBe(first + FOLD_REFRESH);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded).toMatchObject({ from: 'snapshot', changes: 0 });
    expect(b.store.collection.locations).toHaveLength(FOLD_REFRESH);
  });

  it('round fifty-five: a snapshot holding a record of a kind this build does not know is not read; the log is folded', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([{ t: stamp(base), kind: 'location', id: 'l1', field: 'name', value: 'Bench' }], true);
    let b = await boot();
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    const good = (await b.vault.readFold())!;
    await b.vault.writeFold({ ...good.fold, records: (good.fold.records as Array<Record<string, unknown>>).map((r) => ({ ...r, kind: 'unknown-kind' })) }, good.gen);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('log');
    expect(b.store.collection.locations.map((l) => l.name)).toEqual(['Bench']);
  });

  it('round fifty-five: a dismissed parked number still keeps the one-shape pass off the record, on a snapshot load as on a whole one', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([{ t: stamp(base, 0), kind: 'accession', id: '2024-0001', field: 'taxonName', value: 'Legacy' }, { t: stamp(base, 1), kind: 'accession', id: '2024-0001', field: 'status', value: 'growing' }, { t: stamp(base + 3 * 365 * 86_400_000), kind: 'accession', id: '2024-0001', field: 'acc', value: '2024-9999' }], true);
    let b = await boot();
    await b.store.collection.load();
    await b.store.collection.dismissParked('accession', '2024-0001');
    await b.store.collection.snapshotWritten;
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    expect(b.store.collection.parkedFor('accession', '2024-0001')).toHaveLength(0);
    expect((await b.vault.allChanges()).filter((c) => c.field === 'acc')).toHaveLength(1);
  });

  it('round fifty-five: an older build does not overwrite a newer build\'s snapshot', async () => {
    const { vault } = await boot();
    const base = { rules: 2, device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], held: [], last: '', changes: 0 };
    const gen = await vault.foldGen();
    expect(await vault.writeFold({ ...base, build: '2000' }, gen)).toBe(true);
    expect(await vault.writeFold({ ...base, build: '1000' }, gen)).toBe(false);
    expect((await vault.readFold())!.fold.build).toBe('2000');
    expect(await vault.writeFold({ ...base, build: '3000' }, gen)).toBe(true);
  });

  it('round fifty-five: an import stamp after a removal is not an edit, in the fold itself; nothing is written', async () => {
    const base = Date.now() - 86_400_000;
    const { vault } = await boot();
    await vault.appendChanges([...plant(1, base), { t: stamp(base + 100), kind: 'accession', id: 'p1', field: '_deleted', value: true }, { t: stamp(base + 200), kind: 'accession', id: 'p1', field: 'importedOn', value: '2024-01-01' }], true);
    const before = (await vault.allChanges()).length;
    const b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession('p1')).toBeUndefined();
    expect((await b.vault.allChanges()).length).toBe(before);
  });
});
