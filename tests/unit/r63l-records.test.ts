/**
 * Round sixty-three (agent L): a record of real time beside the stamp (L1; outside review B9) and one note for "Renumber
 * now" on two devices (L2; docs/REVIEW-ROUND-62.md section 11), at collection level over an in-memory vault (the harness
 * of collection-store.test.ts). Each test failed on the round-sixty-two base.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, hlcDecode, isPastStamp, PAST_BIT } from '$core/hlc';
import { accNo } from '$lib/db/types';

type Mem = { changes: Map<string, Change>; meta: Map<string, unknown>; photos: Map<string, unknown>; device: string };
const newMem = (device: string): Mem => ({ changes: new Map(), meta: new Map(), photos: new Map(), device });
let mem: Mem = newMem('testdevice');
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes.values()].map((c) => structuredClone(c)),
    appendChanges: async (cs: Change[]) => { for (const c of cs) mem.changes.set(c.t, structuredClone(c)); return { kept: cs, replaced: [], seq: 0, first: 0 }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; },
    deviceId: async () => mem.device,
    requestPersistence: async () => true,
    onOtherTabWrite: () => () => {},
    readFold: async () => undefined,
    writeFold: async () => false,
    touchFold: async () => {},
    foldGen: async () => 0,
    dropFold: async () => {},
    parkStamps: async (st: string[]) => { const had = (mem.meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem.meta.set('parked', out); return out; },
    lastArrival: async () => 0,
    arrivalsAfter: async () => ({ changes: [...mem.changes.values()], seq: 0, gen: 0 }),
    arrivalsOf: async (ts: string[]) => { const keys = [...mem.changes.keys()]; return new Map(ts.filter((t) => mem.changes.has(t)).map((t) => [t, keys.indexOf(t) + 1])); },
    changeKeys: async () => [...mem.changes.keys()],
    changesByKeys: async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean).map((c) => structuredClone(c)),
    changesOf: async (kind: string, id: string) => [...mem.changes.values()].filter((c) => c.kind === kind && c.id === id).map((c) => structuredClone(c)),
    holdVault: async (w: () => Promise<unknown>) => w(),
    putPhotoBlobs: async () => {}, getPhotoBlobs: async () => undefined, deletePhotoBlobs: async () => {}, photoBlobIds: async () => [],
    announceSyncForgotten: () => {}
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  return m;
});

async function fresh(device: string) {
  vi.resetModules();
  mem = newMem(device);
  const m = mem;
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return { collection, mem: m };
}
const peer = (wall: number, count: number, device: string, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: hlcEncode({ wall, count, device }), kind, id, field, value });
const YEAR = 365 * 86_400_000;

describe('L1: every change this device writes carries its corrected time at writing', () => {
  it('an edit carries `w`, the corrected clock when it was written, beside its stamp', async () => {
    const { collection, mem } = await fresh('devicew00000');
    const before = Date.now();
    const a = await collection.addAccession({ taxonName: 'Ariocarpus fissuratus' });
    await collection.put('accession', a.id, { notes: 'repotted in pumice' });
    const after = Date.now();
    const own = [...mem.changes.values()];
    expect(own.length).toBeGreaterThan(2);
    for (const c of own) {
      expect(typeof c.w).toBe('number');
      expect(c.w!).toBeGreaterThanOrEqual(before);
      expect(c.w!).toBeLessThanOrEqual(after);
    }
  });

  it('an edit placed past a stamp a year ahead (marked) is dated by its recorded time, which says when it was made', async () => {
    const { collection, mem } = await fresh('devicew00000');
    const a = await collection.addAccession({ taxonName: 'Lophophora williamsii' });
    // This device wrote the notes while its clock was a year fast (its own changes are never held); the grower edits them
    // now, with the clock put right: the edit is stamped past that stamp.
    await collection.ingest([peer(Date.now() + YEAR, 0, 'devicew00000', 'accession', a.id, 'notes', 'from the fast clock')], 'import');
    await collection.put('accession', a.id, { notes: 'written here, today' });
    const edit = [...mem.changes.values()].find((c) => c.field === 'notes' && c.value === 'written here, today')!;
    expect(isPastStamp(edit.t)).toBe(true);
    expect(hlcDecode(edit.t).wall).toBeGreaterThan(Date.now() + YEAR - 60_000); // the stamp: a year ahead
    expect(Math.abs(edit.w! - Date.now())).toBeLessThan(60_000); // the recorded time: now
    // What the notes' history shows: the replaced text's time is the recorded one, not the stamp's year ahead.
    const { shownTime } = await import('$core/when');
    expect(Math.abs(shownTime(edit) - Date.now())).toBeLessThan(60_000);
    // A change with no recorded time (an older build's) reads by its stamp, as before.
    const old = { ...edit }; delete old.w;
    expect(shownTime(old)).toBe(hlcDecode(edit.t).wall);
  });

  it('the fold never reads it: the same log with and without `w` folds to the same records', async () => {
    const { collection, mem } = await fresh('devicew00000');
    const a = await collection.addAccession({ taxonName: 'Astrophytum asterias', notes: 'one' });
    await collection.put('accession', a.id, { notes: 'two', status: 'archived' });
    const withW = [...mem.changes.values()];
    const { materialise } = await import('$core/log');
    const strip = (cs: Change[]) => cs.map((c) => { const { w: _w, ...r } = c; void _w; return r; });
    const one = materialise(withW).state, two = materialise(strip(withW)).state;
    expect([...one.entries()]).toEqual([...two.entries()]);
  });

  it('a recorded time from outside that is not a time is left off; the change is kept, not refused or set aside', async () => {
    const { readChanges } = await import('$core/log');
    const ok = { ...peer(1_760_000_000_000, 0, 'phone0000000', 'accession', 'r1', 'notes', 'a'), w: 1_760_000_000_500 };
    const bad = { ...peer(1_760_000_000_000, 1, 'phone0000000', 'accession', 'r1', 'price', '£4'), w: 'yesterday' } as unknown as Change;
    const read = readChanges([ok, bad]);
    expect(read.dropped).toEqual([]);
    expect(read.changes).toHaveLength(2);
    expect(read.changes[0].w).toBe(1_760_000_000_500);
    expect('w' in read.changes[1]).toBe(false);
  });

  it('the notes replaced unseen are dated by the recorded time of a marked edit', async () => {
    const { collection } = await fresh('devicew00000');
    const a = await collection.addAccession({ taxonName: 'Mammillaria theresae', notes: 'first text' });
    // A blind edit made here while the clock was a year fast replaces the text without having seen it (its stamps are this
    // device's, under another tab's tag, and are never held); the grower then edits past it, with the clock put right.
    const base = 'none';
    await collection.ingest([
      peer(Date.now() + YEAR, 0, 'devicew00000', 'accession', a.id, 'notes', 'blind text'),
      peer(Date.now() + YEAR, 1, 'devicew00000', 'accession', a.id, 'notesBase', base)
    ], 'import');
    await collection.put('accession', a.id, { notes: 'third text', notesBase: hlcEncode({ wall: 1, count: 0, device: 'x' }) }); // made blind to "blind text" too
    const found = await collection.replacedNotes('accession', a.id);
    const third = found.find((r) => r.text === 'blind text')!;
    expect(isPastStamp(third.by)).toBe(true);
    expect(Math.abs(third.byAt - Date.now())).toBeLessThan(60_000); // replaced today, not a year ahead
    expect(third.wasAt).toBe(hlcDecode(third.was).wall); // the fast phone's own stamp is read from its clock: shown as it is
  });

  it('a renumber note placed past a marked stamp is dated by the day the repair was written', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
    const theirs = 'rtheirs000000';
    // Another plant under the same number, made later, whose latest field stamp is marked and a year ahead.
    const t0 = Date.now() + 1000;
    await x.collection.ingest([
      peer(t0, 0, 'phone0000000', 'accession', theirs, 'taxonName', 'Copiapoa'),
      peer(t0, 1, 'phone0000000', 'accession', theirs, 'status', 'growing'),
      peer(t0, 2, 'phone0000000', 'accession', theirs, 'acc', '2026-0007'),
      { t: hlcEncode({ wall: t0 + YEAR, count: PAST_BIT | 1, device: 'phone0000000' }), kind: 'accession', id: theirs, field: 'notes', value: 'placed past' }
    ], 'server');
    expect(await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' })).toBe(true);
    expect(accNo(x.collection.accession(theirs)!)).toBe('2026-0008');
    expect(accNo(x.collection.accession(mine.id)!)).toBe('2026-0007');
    const note = x.collection.events(theirs).find((e) => e.note?.startsWith('Renumbered from'))!;
    const dates = await x.collection.recordedLineDates(theirs);
    const { localDate } = await import('$core/dates');
    expect(dates.get(note.id)).toBe(localDate());
  });
});

describe('L2: "Renumber now" on two devices leaves one note', () => {
  /** Two devices with a shared number, where one has seen a later edit of the renumbered plant that the other has not. */
  async function twoDevices() {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
    const y = await fresh('devicey00000');
    await new Promise((r) => setTimeout(r, 2));
    const theirs = await y.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007' });
    const xLog = [...x.mem.changes.values()], yLog = [...y.mem.changes.values()];
    mem = x.mem; await x.collection.ingest(yLog, 'server');
    mem = y.mem; await y.collection.ingest(xLog, 'server');
    // Y edits its plant before X has that edit: the two devices' latest stamps for the plant now differ.
    await new Promise((r) => setTimeout(r, 2));
    await y.collection.put('accession', theirs.id, { notes: 'seen on Y only' });
    return { x, y, mine, theirs };
  }
  const notes = (c: { events(id: string): Array<{ t: string; note?: string | null; id: string }> }, id: string) => c.events(id).filter((e) => e.t === 'note' && /^Renumbered from/.test(e.note ?? ''));

  it('two devices that repair from logs that differ write the same note: one line, whatever each saw', async () => {
    const { x, y, theirs } = await twoDevices();
    mem = x.mem; await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' });
    mem = y.mem; await y.collection.repairNumbers({ kind: 'accession', no: '2026-0007' });
    const xAll = [...x.mem.changes.values()], yAll = [...y.mem.changes.values()];
    mem = x.mem; await x.collection.ingest(yAll, 'server');
    mem = y.mem; await y.collection.ingest(xAll, 'server');
    for (const c of [x.collection, y.collection]) {
      expect(accNo(c.accession(theirs.id)!)).toBe('2026-0008');
      expect(notes(c, theirs.id)).toHaveLength(1);
    }
    // One record in the log too, not two that the page folds into one.
    const ids = new Set([...x.mem.changes.values()].filter((c) => c.kind === 'event' && c.field === 'note' && String(c.value).startsWith('Renumbered from')).map((c) => c.id));
    expect(ids.size).toBe(1);
  });

  it('an older build\'s note for the same repair is shown once, and removing the line removes both', async () => {
    const { x, theirs } = await twoDevices();
    mem = x.mem;
    await x.collection.repairNumbers({ kind: 'accession', no: '2026-0007' });
    const ours = notes(x.collection, theirs.id);
    expect(ours).toHaveLength(1);
    // The same repair as a round-sixty-one build wrote it: another event id, another date, the same words.
    const old = 'e' + (Date.now() - 86_400_000).toString(36) + '00zzoldbuild';
    const w = Date.now() - 86_400_000;
    const line = (n: number, field: string, value: unknown) => peer(w, n, 'zzoldbuild0000', 'event', old, field, value);
    await x.collection.ingest([line(1, 'acc', theirs.id), line(2, 'd', '2026-01-02'), line(3, 't', 'note'), line(4, 'note', ours[0].note)], 'server');
    expect(notes(x.collection, theirs.id)).toHaveLength(1);
    const shown = notes(x.collection, theirs.id)[0];
    await x.collection.remove('event', shown.id);
    expect(notes(x.collection, theirs.id)).toHaveLength(0);
    await x.collection.restore('event', shown.id);
    expect(notes(x.collection, theirs.id)).toHaveLength(1);
  });
});
