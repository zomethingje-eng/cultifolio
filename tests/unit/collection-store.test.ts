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

type Mem = {
  changes: Map<string, Change>;
  meta: Map<string, unknown>;
  photos: Map<string, unknown>;
  device: string;
  fail: string | null;
};
const newMem = (device: string): Mem => ({
  changes: new Map(),
  meta: new Map(),
  photos: new Map(),
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
    return { kept: cs, replaced: [], seq: 0 };
  },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => mem.device,
  requestPersistence: async () => true
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
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  if (!m.changesOf) m.changesOf = async (kind: string, id: string) => ([...mem.changes.values()] as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.putPhotoBlobs = async (p: { id: string }) => void mem.photos.set(p.id, p);
  m.getPhotoBlobs = async (id: string) => mem.photos.get(id);
  m.deletePhotoBlobs = async (id: string) => void mem.photos.delete(id);
  m.announceSyncForgotten = () => {};
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
    const batch = [remote(Date.now() + 1000, 0, 'phone0000000', 'accession', a.id, 'status', 'dead'), remote(Date.now() + 1000, 1, 'phone0000000', 'accession', 'rnewplant000', 'taxonName', 'Lithops'), remote(Date.now() + 1000, 2, 'phone0000000', 'accession', 'rnewplant000', 'status', 'growing')];
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
  it('setScheme writes a setting record; a device with no record is on the default, whatever its meta holds; the record arrives by sync and takes over', async () => {
    const { collection, mem: vault } = await fresh('testdevice');
    expect(collection.scheme).toEqual({ mode: 'year', width: 4 });
    await collection.setScheme({ mode: 'prefix', prefix: 'GH', width: 3 });
    const rec = [...vault.changes.values()].find((c) => c.kind === 'setting' && c.id === NUMBERING_SETTING);
    expect(rec?.field).toBe('scheme');
    expect(rec?.value).toEqual({ mode: 'prefix', prefix: 'GH', width: 3 });
    expect(collection.nextAccessionNumber()).toBe('GH-001');
    // A device with no setting record in its log is on the default; a meta value is not read (round fifty-seven).
    await fresh('olddevice000');
    mem.meta.set('scheme', { mode: 'prefix', prefix: 'OLD', width: 2 });
    const c3 = await reload();
    expect(c3.scheme).toEqual({ mode: 'year', width: 4 });
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
    // Each device pulls the other's log, and the grower asks for the repair on each (round fifty-nine: a merge repairs nothing on its own).
    mem = x.mem;
    await x.collection.ingest(yLog, 'server');
    await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
    mem = y.mem;
    await y.collection.ingest(xLog, 'server');
    await y.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
    const sortLog = (m: Mem) => [...m.changes.values()].sort((a, b) => a.t.localeCompare(b.t));
    expect(sortLog(x.mem)).toEqual(sortLog(y.mem)); // byte for byte
    expect(accNo(x.collection.accession(mine.id)!)).toBe('2026-0007');
    expect(accNo(x.collection.accession(theirs.id)!)).toBe('2026-0008');
    expect(accNo(y.collection.accession(theirs.id)!)).toBe('2026-0008');
    const notes = (c: typeof x.collection) => c.events(theirs.id).filter((e) => e.t === 'note' && /Renumbered/.test(e.note ?? ''));
    expect(notes(x.collection)).toHaveLength(1);
    expect(notes(y.collection)).toHaveLength(1);
    expect(notes(x.collection)[0].note).toBe('Renumbered from 2026-0007 to 2026-0008: another plant, recorded first, had been given 2026-0007 (on another device, or in a file merged in).');
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

describe('follow() (finding 36)', () => {
  it('following keeps the species notes, lists the species, and unfollowing takes it off the list', async () => {
    const { collection } = await fresh('testdevice');
    await collection.put('taxon', 'aloe-polyphylla', { name: 'Aloe polyphylla', myNotes: 'wanted' });
    await collection.follow('aloe-polyphylla', 'Aloe polyphylla', 123, true);
    const t = collection.taxon('aloe-polyphylla');
    expect(t?.followed).toBe(true);
    expect(t?.myNotes).toBe('wanted');
    expect(collection.mySpecies.get('aloe-polyphylla')).toMatchObject({ followed: true, grown: 0 });
    expect(collection.taxa.some((x) => x.id === 'aloe-polyphylla')).toBe(true);
    await collection.follow('aloe-polyphylla', 'Aloe polyphylla', 123, false);
    expect(collection.mySpecies.has('aloe-polyphylla')).toBe(false);
  });
});


describe('a clock that was fast (round eight, 4)', () => {
  it('an edit after the correction wins its field by a stamp just past the old one, while other fields and other records are stamped at real time', async () => {
    const real = Date.parse('2026-09-25T12:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(real + 20 * 3_600_000); // twenty hours fast: within the day a device still follows (past two days the stamps are parked instead: round fifty-two, 1)
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

describe('round fifty-two, 1: a device a year fast, once its clock is right, parks what it stamped then and can apply it afresh', () => {
  it('without a server reading its record stays shown and the clock line says why; once a reading confirms the clock it is parked, listed with its fields, and Apply writes it again at real time (round fifty-nine)', async () => {
    const real = Date.parse('2026-09-25T12:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(real + 365 * 86_400_000);
      const { collection } = await fresh('fastdevice00');
      const a = await collection.addAccession({ taxonName: 'Lithops', acc: 'L-1', notes: 'first' });
      expect(collection.accession(a.id)?.notes).toBe('first'); // shown while the device believes its clock
      vi.setSystemTime(real); // put right, and the app reloads
      const c2 = (await reload()) as typeof collection;
      // No server has confirmed this clock: the device's own changes are folded whatever it says, and nothing is parked
      // (a clock set back would otherwise have hidden the grower's plants for good; the round forty-one review, 1).
      expect(c2.accession(a.id)?.notes).toBe('first');
      expect(c2.parkedRecords).toBe(0);
      expect(c2.clockBehindAt).toBeGreaterThan(real);
      // A sync reading confirms the clock: the fold is judged again, and the stamps a year past it are parked.
      const hlc = await import('$core/hlc');
      hlc.trustServerTime(real, real);
      await c2.rebuild();
      expect(c2.accession(a.id)).toBeUndefined(); // parked: a stamp a year past a checked clock is a wrong clock's, this device's own included
      expect(c2.parkedRecords).toBe(1);
      expect(c2.parkedFor('accession', a.id).map((c) => c.field).sort()).toEqual(['acc', 'notes', 'status', 'taxonName']);
      await c2.applyParked('accession', a.id);
      expect(c2.accession(a.id)?.notes).toBe('first');
      expect(c2.parkedFor('accession', a.id)).toHaveLength(0);
      const stamps = [...mem.changes.values()].filter((c) => c.id === a.id && c.value === 'first').map((c) => hlcDecode(c.t).wall);
      expect(Math.min(...stamps)).toBeLessThan(real + 60_000); // the re-write is at real time
      const c3 = (await reload()) as typeof collection;
      expect(c3.accession(a.id)?.notes).toBe('first');
      expect(c3.parkedRecords).toBe(0); // dismissed stamps stay dismissed
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
      vi.setSystemTime(real + 20 * 3_600_000);
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
});

describe('round eleven', () => {
  it('the renumbering note carries the same day on two devices in different time zones (round eleven, 3)', async () => {
    const tz = process.env.TZ;
    vi.useFakeTimers();
    try {
      // Y's plant is made at 00:30 UTC on New Year's Day: the previous evening in Honolulu, the next afternoon in Kiritimati.
      vi.setSystemTime(Date.parse('2026-01-01T00:29:00Z'));
      const x = await fresh('devicex00000');
      const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
      vi.setSystemTime(Date.parse('2026-01-01T00:30:00Z'));
      const y = await fresh('devicey00000');
      const theirs = await y.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
      expect(theirs.id > mine.id).toBe(true);
      const xLog = [...x.mem.changes.values()], yLog = [...y.mem.changes.values()];
      process.env.TZ = 'Pacific/Honolulu';
      mem = x.mem;
      await x.collection.ingest(yLog, 'server');
      await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
      process.env.TZ = 'Pacific/Kiritimati';
      mem = y.mem;
      await y.collection.ingest(xLog, 'server');
      await y.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
      const sortLog = (m: Mem) => [...m.changes.values()].sort((a, b) => a.t.localeCompare(b.t));
      expect(sortLog(x.mem)).toEqual(sortLog(y.mem)); // byte for byte, the note's day included
      const note = x.collection.events(theirs.id).find((e) => /Renumbered/.test(e.note ?? ''))!;
      expect(note.d).toBe('2026-01-01');
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
      vi.useRealTimers();
    }
  });
});

describe('round twelve', () => {
  it('one commit after a fast-clock episode gives every field its own stamp, so nothing is overwritten on disk (round twelve, 4)', async () => {
    const real = Date.parse('2026-09-25T12:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(real + 20 * 3_600_000); // twenty hours fast (round fifty-two, 1: past two days such stamps are parked, not followed)
      const { collection } = await fresh('fastdevice00');
      const a = await collection.addAccession({ taxonName: 'Lithops', acc: 'L-1', notes: 'n1', price: 'p1' });
      vi.setSystemTime(real);
      const c2 = (await reload()) as typeof collection;
      await c2.put('accession', a.id, { notes: 'n2' });
      await c2.put('accession', a.id, { notes: 'n3', price: 'p2' });
      expect(c2.accession(a.id)?.notes).toBe('n3');
      expect(c2.accession(a.id)?.price).toBe('p2');
      const stamps = [...mem.changes.values()].map((c) => c.t);
      expect(new Set(stamps).size).toBe(stamps.length); // every change under its own key
      const c3 = (await reload()) as typeof collection;
      expect(c3.accession(a.id)?.notes).toBe('n3'); // what the screen showed is what the vault holds
      expect(c3.accession(a.id)?.price).toBe('p2');
    } finally {
      vi.useRealTimers();
    }
  });
  it('two devices that repaired one duplicate to different numbers (one log still short a batch) settle on one number after the merge, with no stamp shared by two values (round twelve, 3)', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
    const other = await x.collection.addAccession({ taxonName: 'Lithops', acc: '2026-0008' }); // X knows 0008 is taken; Y will not
    const y = await fresh('devicey00000');
    await new Promise((r) => setTimeout(r, 2));
    const theirs = await y.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
    const xLog = [...x.mem.changes.values()], yLog = [...y.mem.changes.values()];
    // X has everything and repairs: theirs -> 0009. Y receives only X's 0007 (a batch short) and repairs: theirs -> 0008.
    mem = x.mem;
    await x.collection.ingest(yLog, 'server');
    await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
    expect(accNo(x.collection.accession(theirs.id)!)).toBe('2026-0009');
    mem = y.mem;
    await y.collection.ingest(xLog.filter((c) => c.id !== other.id), 'server');
    await y.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
    expect(accNo(y.collection.accession(theirs.id)!)).toBe('2026-0008');
    // The two repairs carry different stamps (the number is in the tag), never two values under one stamp.
    const xRepair = [...x.mem.changes.values()].filter((c) => c.field === 'acc' && c.id === theirs.id && c.value !== '2026-0007');
    const yRepair = [...y.mem.changes.values()].filter((c) => c.field === 'acc' && c.id === theirs.id && c.value !== '2026-0007');
    expect(xRepair).toHaveLength(1);
    expect(yRepair).toHaveLength(1);
    expect(xRepair[0].t).not.toBe(yRepair[0].t);
    // Then the logs meet, in either order, and both devices end with the same numbers, all distinct.
    const xAll = [...x.mem.changes.values()], yAll = [...y.mem.changes.values()];
    mem = x.mem;
    await x.collection.ingest(yAll, 'server');
    mem = y.mem;
    await y.collection.ingest(xAll, 'server');
    const nos = (c: typeof x.collection) => [mine.id, other.id, theirs.id].map((id) => accNo(c.accession(id)!));
    expect(nos(x.collection)).toEqual(nos(y.collection)); // the same merge everywhere
    // If the merge left two plants under one number, the page says so and the grower's repair settles it; the other
    // device receives that repair and agrees (round fifty-nine: a merge writes nothing of its own).
    const shared = [mine.id, other.id, theirs.id].find((id) => x.collection.sharesNumber('accession', id).length);
    if (shared) {
      mem = x.mem;
      expect(await x.collection.repairNumbers({ kind: 'accession', no: accNo(x.collection.accession(shared)!) })).toBe(true);
      mem = y.mem;
      await y.collection.ingest([...x.mem.changes.values()], 'server');
    }
    expect(nos(x.collection)).toEqual(nos(y.collection));
    expect(new Set(nos(x.collection)).size).toBe(3);
    const sortLog = (m: Mem) => [...m.changes.values()].sort((a, b) => a.t.localeCompare(b.t));
    expect(sortLog(x.mem)).toEqual(sortLog(y.mem));
  });
});

describe('round thirteen', () => {
  it('two commits, each bumping a different field past stamps that differ only by writer, do not collide in the store (round thirteen, 7)', async () => {
    const { collection } = await fresh('testdevice');
    // Two tabs of this device (the device id with two tab tags) stamped two fields of one record at the same wall and count
    // while the clock was twenty hours fast: applied, since they are this device's own, and never followed by the clock.
    const wall = Date.now() + 20 * 3_600_000;
    await collection.ingest([remote(wall, 3, 'testdevicea1b2', 'accession', 'X-1', 'notes', 'n1'), remote(wall, 3, 'testdevicec3d4', 'accession', 'X-1', 'price', 'p1'), remote(wall, 4, 'testdevicea1b2', 'accession', 'X-1', 'taxonName', 'Lithops'), remote(wall, 5, 'testdevicea1b2', 'accession', 'X-1', 'status', 'growing')], 'server');
    await collection.put('accession', 'X-1', { notes: 'n2' }); // stepped past notes' stamp: wall, count 4, this writer
    await collection.put('accession', 'X-1', { price: 'p2' }); // stepped past price's stamp: the same wall and count, the same writer, unless the store is checked
    expect(collection.lastWriteError).toBeNull();
    expect(collection.accession('X-1')?.notes).toBe('n2');
    expect(collection.accession('X-1')?.price).toBe('p2');
    const again = (await reload()) as typeof collection;
    expect(again.accession('X-1')?.notes).toBe('n2');
    expect(again.accession('X-1')?.price).toBe('p2');
  });
});

describe('round fifteen', () => {
  it('a duplicate is renumbered into the year of the number it held, not its acquisition year (round fifteen, 14)', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2019-05-01' });
    const y = await fresh('devicey00000');
    await new Promise((r) => setTimeout(r, 2));
    const theirs = await y.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2019-05-01' });
    mem = x.mem;
    await x.collection.ingest([...y.mem.changes.values()], 'server');
    await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' }); // the grower's "Renumber now": a merge repairs nothing on its own (round fifty-nine)
    expect(accNo(x.collection.accession(mine.id)!)).toBe('2026-0007');
    expect(accNo(x.collection.accession(theirs.id)!)).toBe('2026-0008');
  });
});

describe('round sixteen', () => {
  it('several plants at once are one commit: a refused write stores none of them and issues no number; a good one stores all, consecutively (round sixteen, 14)', async () => {
    const { collection } = await fresh('testdevice');
    mem.fail = 'QuotaExceededError: the disk is full';
    await expect(collection.addAccessions(3, { taxonName: 'Lithops' })).rejects.toThrow(/QuotaExceeded/);
    expect(collection.accessions).toEqual([]);
    expect(collection.lastWriteError).toMatch(/QuotaExceeded/);
    expect(mem.changes.size).toBe(0); // nothing durable either: no first plant of three
    expect(collection.numbersIssued).toBe(0);
    mem.fail = null;
    const recs = await collection.addAccessions(3, { taxonName: 'Lithops', acquired: '2026-09-01', sourceFrom: 'Mesa' });
    expect(recs.map((r) => accNo(r))).toEqual([`${new Date().getFullYear()}-0001`, `${new Date().getFullYear()}-0002`, `${new Date().getFullYear()}-0003`]);
    expect(collection.accessions.length).toBe(3);
    expect(recs.every((r) => collection.events(r.id).some((e) => e.t === 'acquire'))).toBe(true); // each with its acquire event
    const again = (await reload()) as typeof collection;
    expect(again.accessions.length).toBe(3);
    // a brought number goes on the first, the rest follow it
    const more = await again.addAccessions(2, { taxonName: 'Conophytum', acc: '2030-0007' });
    expect(more.map((r) => accNo(r))).toEqual(['2030-0007', `${new Date().getFullYear()}-0004`]);
  });
});

describe('round twenty-eight', () => {
  it('a removed plant keeps its number: the next plant takes the next number, and Undo brings the removed one back under its own (round twenty-eight, 0)', async () => {
    const { collection } = await fresh('testdevice');
    const y = new Date().getFullYear();
    const [a] = await collection.addAccessions(1, { taxonName: 'Lithops', acquired: `${y}-03-01` });
    expect(accNo(a)).toBe(`${y}-0001`);
    await collection.remove('accession', a.id);
    expect(collection.accessions).toEqual([]);
    const [b] = await collection.addAccessions(1, { taxonName: 'Conophytum', acquired: `${y}-03-02` });
    expect(accNo(b)).toBe(`${y}-0002`); // never reused, removed or not
    await collection.restore('accession', a.id);
    expect(collection.accessions.map((r) => accNo(r)).sort()).toEqual([`${y}-0001`, `${y}-0002`]);
    const again = (await reload()) as typeof collection;
    expect(again.accessions.map((r) => accNo(r)).sort()).toEqual([`${y}-0001`, `${y}-0002`]);
    expect(again.accessions.every((r) => !r.acc || collection.accessions.filter((x) => x.acc === r.acc).length === 1)).toBe(true);
  });
});

describe('round twenty-nine', () => {
  it('a plant restored after another device minted its number is renumbered on restore, not left sharing it; the one brought back yields (round twenty-nine, 3; round fifty-nine)', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
    const y = await fresh('devicey00000');
    await new Promise((r) => setTimeout(r, 2));
    const theirs = await y.collection.addAccession({ taxonName: 'Lithops', acc: '2026-0007', acquired: '2026-05-02' });
    mem = x.mem;
    await x.collection.remove('accession', mine.id);
    await x.collection.ingest([...y.mem.changes.values()], 'server'); // nothing to repair: X's plant is removed
    expect(x.collection.accessions.map((a) => accNo(a))).toEqual(['2026-0007']);
    expect(await x.collection.restore('accession', mine.id)).toEqual({ from: '2026-0007', to: '2026-0008' }); // Undo, and what the page says
    const nos = x.collection.accessions.map((a) => accNo(a)).sort();
    expect(nos).toEqual(['2026-0007', '2026-0008']);
    expect(accNo(x.collection.accession(theirs.id)!)).toBe('2026-0007'); // the live plant keeps its number, label and all
    expect(accNo(x.collection.accession(mine.id)!)).toBe('2026-0008');
  });
  it('a photograph whose record cannot be written (a full device) leaves no pixels behind; a cover picked after a removal survives the Undo (round thirty, R1-2 and R2-3)', async () => {
    const { collection } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Aloe', acquired: '2026-03-01' });
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 1])]);
    mem.fail = 'QuotaExceededError';
    await expect(collection.addPhoto({ acc: a.id, d: '2026-03-02', dFrom: 'added', caption: null, w: 1, h: 1, bytes: 3, sha: null, blob, thumb: blob })).rejects.toThrow(/Quota/);
    expect(mem.photos.size).toBe(0); // the pixels came out again
    expect(collection.photos(a.id)).toHaveLength(0);
    mem.fail = null;
    const p0 = await collection.addPhoto({ acc: a.id, d: '2026-03-02', dFrom: 'added', caption: null, w: 1, h: 1, bytes: 3, sha: null, blob, thumb: blob });
    const p1 = await collection.addPhoto({ acc: a.id, d: '2026-03-03', dFrom: 'added', caption: null, w: 1, h: 1, bytes: 3, sha: null, blob, thumb: blob });
    await collection.setCover(a.id, p0.id);
    const undo = await collection.removePhoto(p0.id);
    expect(collection.accession(a.id)!.cover).toBeNull();
    await collection.setCover(a.id, p1.id); // a choice made after the removal
    await undo();
    expect(collection.photos(a.id).map((p) => p.id).sort()).toEqual([p0.id, p1.id].sort());
    expect(collection.accession(a.id)!.cover).toBe(p1.id); // stands
  });
});

describe('what belongs together is written together (round forty-nine, 1)', () => {
  it('an event and the status it stands for are one commit: the listener hears once, and a vault that refuses keeps both out', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Aloe', status: 'growing' });
    const heard: Change[][] = [];
    collection.onLocalChange((cs) => heard.push(cs));
    await collection.addEventWith({ acc: a.id, d: localDate(), t: 'death', note: null }, 'accession', a.id, { status: 'dead' });
    expect(heard).toHaveLength(1);
    expect(heard[0].map((c) => c.kind + ':' + c.field).sort()).toEqual(['accession:status', 'event:acc', 'event:d', 'event:note', 'event:t']);
    expect(collection.accession(a.id)?.status).toBe('dead');
    mem.fail = 'QuotaExceededError';
    await expect(collection.addEventWith({ acc: a.id, d: localDate(), t: 'note', note: 'Marked growing again' }, 'accession', a.id, { status: 'growing' })).rejects.toThrow();
    expect(collection.accession(a.id)?.status).toBe('dead');
    expect(collection.events(a.id).filter((e) => e.t === 'note')).toHaveLength(0);
  });
  it('a batch and the line on its parent plant are one commit; a photograph\'s removal and the cover it clears are one commit', async () => {
    const { collection } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Aloe', status: 'growing' });
    const heard: Change[][] = [];
    collection.onLocalChange((cs) => heard.push(cs));
    const s = await collection.addSowing({ taxonName: 'Aloe', method: 'offset', sown: localDate(), count: 2, parentAcc: a.id });
    expect(heard).toHaveLength(1);
    expect(heard[0].some((c) => c.kind === 'event' && c.field === 't' && c.value === 'propagate')).toBe(true);
    expect(heard[0].some((c) => c.kind === 'sowing' && c.id === s.id)).toBe(true);
    const p = await collection.addPhoto({ acc: a.id, d: localDate(), w: 10, h: 10, bytes: 1, blob: new Blob(['x']), thumb: new Blob(['t']) });
    await collection.setCover(a.id, p.id);
    heard.length = 0;
    await collection.removePhoto(p.id);
    expect(heard).toHaveLength(1);
    expect(heard[0].map((c) => c.kind + ':' + c.field).sort()).toEqual(['accession:cover', 'photo:_deleted']);
    expect(collection.accession(a.id)?.cover).toBeNull();
  });
  it('round fifty-one, 3: a record edit, its lines and the other records it restates are one commit (putWith), and a refused vault keeps all of it out', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Aloe', status: 'growing' });
    const acq = await collection.addEvent({ acc: a.id, d: '2026-01-01', t: 'acquire', note: null });
    const heard: Change[][] = [];
    collection.onLocalChange((cs) => heard.push(cs));
    await collection.putWith('accession', a.id, { taxonName: 'Aloe vera', location: 'sill' }, [{ acc: a.id, d: localDate(), t: 'note', note: 'Renamed from Aloe to Aloe vera', auto: true }, { acc: a.id, d: localDate(), t: 'move', note: 'to sill' }], [{ kind: 'event', id: acq.id, fields: { d: '2026-02-02', note: 'from a friend' } }]);
    expect(heard).toHaveLength(1);
    const kinds = heard[0].map((c) => c.kind + ':' + c.field);
    expect(kinds).toContain('accession:taxonName');
    expect(kinds.filter((k) => k === 'event:t')).toHaveLength(2); // two new lines
    expect(heard[0].some((c) => c.kind === 'event' && c.id === acq.id && c.field === 'd' && c.value === '2026-02-02')).toBe(true);
    expect(collection.events(a.id).map((e) => e.t).sort()).toEqual(['acquire', 'move', 'note']);
    expect(collection.events(a.id).find((e) => e.t === 'acquire')?.note).toBe('from a friend');
    mem.fail = 'QuotaExceededError';
    await expect(collection.putWith('accession', a.id, { taxonName: 'Aloe ferox' }, [{ acc: a.id, d: localDate(), t: 'note', note: 'Renamed', auto: true }])).rejects.toThrow();
    expect(collection.accession(a.id)?.taxonName).toBe('Aloe vera');
    expect(collection.events(a.id)).toHaveLength(3);
  });
});
