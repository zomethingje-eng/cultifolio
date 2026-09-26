/**
 * The collection store against an in-memory vault that can refuse a write:
 * write-then-apply, the numbering scheme as a synced setting, deterministic
 * duplicate repair across two devices, the location tree's loop cuts, and
 * follow() on a removed taxon. Round-five findings 6, 32, 35, 36 and 5.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, hlcDecode } from '$core/hlc';
import { localDate } from '$core/dates';
import { accNo, NUMBERING_SETTING } from '$lib/db/types';
import { importV2 } from '$lib/import/v2';

type Mem = {
  changes: Map<string, Change>;
  meta: Map<string, unknown>;
  device: string;
  fail: string | null;
};
const newMem = (device: string): Mem => ({
  changes: new Map(),
  meta: new Map(),
  device,
  fail: null
});
/** Which device's vault the mock is talking to; switched before each call when two collections are in play. */
let mem: Mem = newMem('testdevice');
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[]) => {
    if (mem.fail) throw new Error(mem.fail);
    for (const c of cs) mem.changes.set(c.t, c);
  },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => mem.device,
  requestPersistence: async () => true
};
  // The claiming write of the real vault, over the same in-memory log: `build` sees the numbers the caller knows.
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  return m;
});

const remote = (wall: number, count: number, device: string, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({
  t: hlcEncode({ wall, count, device }),
  kind,
  id,
  field,
  value
});

/** The same vault, opened by a new store instance (a page reload). */
async function reload() {
  const keep = mem;
  vi.resetModules();
  mem = keep;
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return collection;
}

async function fresh(device: string) {
  vi.resetModules();
  mem = newMem(device);
  const m = mem;
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return { collection, mem: m };
}

describe('every write goes to the vault before memory (finding 6)', () => {
  it('a refused write throws, applies nothing, and leaves a message the page can show; the next good write clears it', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({
      taxonName: 'Copiapoa cinerea',
      notes: 'kept'
    });
    const stored = mem.changes.size;
    mem.fail = 'QuotaExceededError: the disk is full';
    await expect(collection.put('accession', a.id, { notes: 'never stored' })).rejects.toThrow(/full/);
    expect(collection.accession(a.id)?.notes).toBe('kept'); // the page shows what the vault holds, not the edit
    expect(mem.changes.size).toBe(stored);
    expect(collection.lastWriteError).toMatch(/QuotaExceededError/);
    mem.fail = null;
    await collection.put('accession', a.id, { notes: 'stored now' });
    expect(collection.accession(a.id)?.notes).toBe('stored now');
    expect(collection.lastWriteError).toBeNull();
  });
  it('ingest() from the server follows the same order: a storage failure throws and nothing in memory changes, so sync can tell a bad batch from a full disk', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({
      taxonName: 'Aloe',
      status: 'growing'
    });
    mem.fail = 'QuotaExceededError';
    const batch = [remote(Date.now() + 1000, 0, 'phone0000000', 'accession', a.id, 'status', 'dead'), remote(Date.now() + 1000, 1, 'phone0000000', 'accession', 'rnewplant000', 'taxonName', 'Lithops')];
    await expect(collection.ingest(batch, 'server')).rejects.toThrow(/Quota/);
    expect(collection.accession(a.id)?.status).toBe('growing');
    expect(collection.accession('rnewplant000')).toBeUndefined();
    mem.fail = null;
    await collection.ingest(batch, 'server');
    expect(collection.accession(a.id)?.status).toBe('dead');
    expect(collection.accession('rnewplant000')?.taxonName).toBe('Lithops');
  });
});

describe('the numbering scheme is a synced setting (finding 32)', () => {
  it('setScheme writes a setting record; a device that only has the old meta value still reads it; the record wins over meta', async () => {
    const { collection, mem: vault } = await fresh('testdevice');
    expect(collection.scheme).toEqual({ mode: 'year', width: 4 });
    await collection.setScheme({ mode: 'prefix', prefix: 'GH', width: 3 });
    const rec = [...vault.changes.values()].find((c) => c.kind === 'setting' && c.id === NUMBERING_SETTING);
    expect(rec?.field).toBe('scheme');
    expect(rec?.value).toEqual({ mode: 'prefix', prefix: 'GH', width: 3 });
    expect(collection.nextAccessionNumber()).toBe('GH-001');
    // An old device: meta only, no setting record in its log.
    await fresh('olddevice000');
    mem.meta.set('scheme', { mode: 'prefix', prefix: 'OLD', width: 2 });
    const c3 = await reload();
    expect(c3.scheme).toEqual({ mode: 'prefix', prefix: 'OLD', width: 2 });
    // The setting record arrives by sync and takes over.
    await c3.ingest([remote(Date.now() - 1000, 0, 'phone0000000', 'setting', NUMBERING_SETTING, 'scheme', { mode: 'prefix', prefix: 'NEW', width: 3 })], 'server');
    expect(c3.scheme).toEqual({ mode: 'prefix', prefix: 'NEW', width: 3 });
  });
  it('two devices that merge the same duplicate number write the same repair: one number, one note, identical logs', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({
      taxonName: 'Copiapoa',
      acc: '2026-0007',
      acquired: '2026-05-01'
    });
    const y = await fresh('devicey00000');
    await new Promise((r) => setTimeout(r, 2)); // Y's plant is created later, so it is the one renumbered
    const theirs = await y.collection.addAccession({
      taxonName: 'Copiapoa',
      acc: '2026-0007',
      acquired: '2026-05-02'
    });
    expect(theirs.id > mine.id).toBe(true);
    const xLog = [...x.mem.changes.values()],
      yLog = [...y.mem.changes.values()];
    // Each device pulls the other's log and runs the repair on its own.
    mem = x.mem;
    await x.collection.ingest(yLog, 'server');
    mem = y.mem;
    await y.collection.ingest(xLog, 'server');
    const sortLog = (m: Mem) => [...m.changes.values()].sort((a, b) => a.t.localeCompare(b.t));
    expect(sortLog(x.mem)).toEqual(sortLog(y.mem)); // byte for byte
    expect(accNo(x.collection.accession(mine.id)!)).toBe('2026-0007');
    expect(accNo(x.collection.accession(theirs.id)!)).toBe('2026-0008');
    expect(accNo(y.collection.accession(theirs.id)!)).toBe('2026-0008');
    const notes = (c: typeof x.collection) => c.events(theirs.id).filter((e) => e.t === 'note' && /Renumbered/.test(e.note ?? ''));
    expect(notes(x.collection)).toHaveLength(1);
    expect(notes(y.collection)).toHaveLength(1);
    expect(notes(x.collection)[0].note).toBe('Renumbered from 2026-0007 to 2026-0008: another plant had been given 2026-0007 on a device that was offline at the time.');
    // Each then receives the other's repair: nothing new, nothing doubled.
    const xAfter = [...x.mem.changes.values()],
      yAfter = [...y.mem.changes.values()];
    mem = x.mem;
    await x.collection.ingest(yAfter, 'server');
    mem = y.mem;
    await y.collection.ingest(xAfter, 'server');
    expect(x.mem.changes.size).toBe(xAfter.length);
    expect(notes(x.collection)).toHaveLength(1);
    expect(notes(y.collection)).toHaveLength(1);
  });
});

describe('location tree loops (finding 35)', () => {
  beforeEach(async () => {
    await fresh('testdevice');
  });
  it('a place whose parent is itself (by merge) is flagged as needing a home, like any loop', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const l = await collection.addLocation({ name: 'Shelf', parentId: null });
    await expect(collection.moveLocation(l.id, l.id)).rejects.toThrow(/inside itself/);
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', l.id, 'parentId', l.id)], 'server');
    expect(collection.location(l.id)?.parentId).toBe(l.id);
    expect(collection.needsHome(l.id)).toBe(true);
    expect(collection.locationPath(l.id).map((x) => x.id)).toEqual([l.id]);
    expect(collection.children(null).some((x) => x.id === l.id)).toBe(true);
  });
  it('a self-parent on a place that had a parent goes back under it', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const room = await collection.addLocation({ name: 'Room', parentId: null });
    const l = await collection.addLocation({
      name: 'Shelf',
      parentId: room.id
    });
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', l.id, 'parentId', l.id)], 'server');
    expect(collection.needsHome(l.id)).toBe(false);
    expect(collection.locationPath(l.id).map((x) => x.id)).toEqual([room.id, l.id]);
  });
  it('two devices moving two places into each other: the cut node goes back to where it was before the move, and removing it moves its plants there, not into the loop', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const room = await collection.addLocation({ name: 'Room', parentId: null });
    const x = await collection.addLocation({ name: 'X', parentId: room.id });
    const y = await collection.addLocation({ name: 'Y', parentId: room.id });
    await collection.moveLocation(x.id, y.id); // here: X under Y
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', y.id, 'parentId', x.id)], 'server'); // there: Y under X
    const cut = [x.id, y.id].sort()[0];
    const other = cut === x.id ? y.id : x.id;
    expect(collection.needsHome(cut)).toBe(false); // it has a home: the one it had before the move
    expect(collection.needsHome(other)).toBe(false);
    expect(collection.locationPath(cut).map((l) => l.id)).toEqual([room.id, cut]);
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([room.id, cut, other]);
    expect(collection.children(room.id).map((l) => l.id)).toEqual([cut]);
    const plant = await collection.addAccession({
      taxonName: 'Aloe',
      locationId: cut
    });
    await collection.removeLocation(cut);
    expect(collection.accession(plant.id)?.locationId).toBe(room.id); // the shown parent, not the raw one
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([room.id, other]);
    expect(collection.needsHome(other)).toBe(false);
  });
  it('when the pre-move parent is gone, the cut node is a root and flagged', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    const x = await collection.addLocation({ name: 'X', parentId: null });
    const y = await collection.addLocation({ name: 'Y', parentId: null });
    await collection.moveLocation(x.id, y.id);
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', y.id, 'parentId', x.id)], 'server');
    const cut = [x.id, y.id].sort()[0];
    const other = cut === x.id ? y.id : x.id;
    expect(collection.needsHome(cut)).toBe(true);
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([cut, other]);
    const plant = await collection.addAccession({
      taxonName: 'Aloe',
      locationId: cut
    });
    await collection.removeLocation(cut);
    expect(collection.accession(plant.id)?.locationId).toBeNull(); // up to the root, not into the other node whose parent was the removed one
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([other]);
  });
});

describe('follow() on a removed taxon (finding 36)', () => {
  it('following clears the removed flag, so the species is listed and the button agrees with the list', async () => {
    const { collection } = await fresh('testdevice');
    await collection.put('taxon', 'aloe-polyphylla', {
      name: 'Aloe polyphylla',
      removed: true,
      myNotes: 'wanted'
    });
    await collection.follow('aloe-polyphylla', 'Aloe polyphylla', 123, true);
    const t = collection.taxon('aloe-polyphylla');
    expect(t?.followed).toBe(true);
    expect(t?.removed ?? null).toBeNull();
    expect(t?.myNotes).toBe('wanted');
    expect(collection.mySpecies.get('aloe-polyphylla')).toMatchObject({
      followed: true,
      grown: 0
    });
    expect(collection.taxa.some((x) => x.id === 'aloe-polyphylla')).toBe(true);
    await collection.follow('aloe-polyphylla', 'Aloe polyphylla', 123, false);
    expect(collection.mySpecies.has('aloe-polyphylla')).toBe(false);
  });
});

describe('importing the same v2 file twice (finding 5)', () => {
  it('changes nothing: records already in the log are skipped, so edits made since the first import stand', async () => {
    const { collection } = await fresh('testdevice');
    const v2 = {
      collection: {
        accessions: {
          'A-1': {
            acc: 'A-1',
            nameAsReceived: 'Copiapoa cinerea',
            notes: 'v2 notes',
            status: 'growing'
          }
        }
      }
    };
    const exists = (kind: Change['kind'], id: string) => collection.exists(kind, id);
    const first = importV2(v2, { now: Date.now() - 30 * 86_400_000, exists });
    expect(first.report.alreadyHere).toBe(0);
    await collection.ingest(first.changes);
    expect(collection.accession('A-1')?.notes).toBe('v2 notes');
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    await collection.ingest([remote(twoWeeksAgo, 0, 'testdevice', 'accession', 'A-1', 'notes', 'repotted, new mix'), remote(twoWeeksAgo, 1, 'testdevice', 'accession', 'A-1', 'status', 'dead')], 'server');
    const again = importV2(v2, { now: Date.now(), exists });
    expect(again.changes).toHaveLength(0);
    expect(again.report.alreadyHere).toBe(1);
    await collection.ingest(again.changes);
    expect(collection.accession('A-1')?.notes).toBe('repotted, new mix');
    expect(collection.accession('A-1')?.status).toBe('dead');
  });
});

describe('a clock that was fast (round eight, 4)', () => {
  it('an edit after the correction wins its field by a stamp just past the old one, while other fields and other records are stamped at real time', async () => {
    const real = Date.parse('2026-09-25T12:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(real + 365 * 86_400_000); // a year fast
      const { collection } = await fresh('fastdevice00');
      const a = await collection.addAccession({ taxonName: 'Lithops', acc: 'L-1', notes: 'first' });
      vi.setSystemTime(real); // put right, and the app reloads
      const c2 = (await reload()) as typeof collection;
      expect(c2.accession(a.id)?.notes).toBe('first'); // its own stamps are never held on itself
      await c2.put('accession', a.id, { notes: 'second', location: 'sill' });
      expect(c2.accession(a.id)?.notes).toBe('second'); // the edit wins the field
      const changes = [...mem.changes.values()].sort((x, y) => x.t.localeCompare(y.t));
      const notes = changes.filter((c) => c.field === 'notes').map((c) => hlcDecode(c.t));
      expect(notes[1].wall).toBe(notes[0].wall); // stamped just past the fast stamp, not a year ahead again
      expect(notes[1].count).toBe(notes[0].count + 1);
      const loc = hlcDecode(changes.find((c) => c.field === 'location')!.t);
      expect(loc.wall).toBeLessThan(real + 60_000); // an untouched field is stamped now: nothing else from this device is held elsewhere
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('round nine', () => {
  it('a removal after a fast-clock edit takes: the removal is stamped past the record\'s latest edit, not only its own field (round nine, 2)', async () => {
    const real = Date.parse('2026-09-25T12:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(real + 365 * 86_400_000);
      const { collection } = await fresh('fastdevice00');
      const e = await collection.addEvent({ acc: 'x', d: '2026-09-25', t: 'water', note: 'logged while fast' });
      vi.setSystemTime(real);
      const c2 = (await reload()) as typeof collection;
      expect(c2.events('x')).toHaveLength(1);
      await c2.remove('event', e.id);
      expect(c2.events('x')).toHaveLength(0);
      await c2.restore('event', e.id);
      expect(c2.events('x')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a record that arrived in a file counts from the day it arrived, whatever its changes are stamped (round nine, 3)', async () => {
    const { collection } = await fresh('testdevice');
    const old = Date.now() - 500 * 86_400_000;
    await collection.ingest([remote(old, 0, 'v2import', 'accession', 'A-1', 'acc', 'A-1'), remote(old, 1, 'v2import', 'accession', 'A-1', 'taxonName', 'Lithops')]);
    expect(collection.madeOn('accession', 'A-1')).toBe(localDate());
    const again = (await reload()) as typeof collection;
    expect(again.madeOn('accession', 'A-1')).toBe(localDate()); // kept across a reload
  });
});

describe('round ten', () => {
  it('the import day is a field on the record, so a second device that receives the log counts from the same day (round ten, 3)', async () => {
    const { collection, mem: first } = await fresh('testdevice');
    const old = Date.now() - 500 * 86_400_000;
    await collection.ingest([remote(old, 0, 'v2import', 'accession', 'A-1', 'acc', 'A-1'), remote(old, 1, 'v2import', 'accession', 'A-1', 'taxonName', 'Lithops')]);
    const imported = [...first.changes.values()].filter((c) => c.field === 'importedOn');
    expect(imported).toHaveLength(1);
    expect(imported[0].value).toBe(localDate());
    expect(collection.accession('A-1')?.importedOn).toBe(localDate());
    // Another device receives the whole log from the server, a month later by its own clock: same day.
    const { collection: other } = await fresh('otherdevice0');
    await other.ingest([...first.changes.values()], 'server');
    expect(other.madeOn('accession', 'A-1')).toBe(localDate());
    // A record that already carries the day is not stamped again by a later file.
    await collection.ingest([remote(old, 2, 'v2import', 'accession', 'A-1', 'notes', 'again')]);
    expect([...first.changes.values()].filter((c) => c.field === 'importedOn')).toHaveLength(1);
  });
});
