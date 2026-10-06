/**
 * records review, round sixty: the store calls select mode makes (src/lib/ui/grow/SelectMode.svelte): water and its Undo
 * (addEventsIds / removeEvents), move and its Undo (movePlantsUndoable), archive (putWith). In-memory vault, the mock of
 * collection-store.test.ts.
 *
 * Mixed: the PASSES tests guard what is right; the one FAILS test reproduces finding 14 on commit 21257b7.
 * Run: npx vitest run tests/unit/records--select-undo.test.ts
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

describe('select mode, through the store', () => {
  it('PASSES: water is one commit and its Undo removes exactly those lines, in one commit', async () => {
    const { collection } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Copiapoa', status: 'growing' });
    const b = await collection.addAccession({ taxonName: 'Lithops', status: 'growing' });
    const old = await collection.addEvent({ acc: a.id, d: '2026-01-01', t: 'water' });
    const heard: Change[][] = [];
    collection.onLocalChange((cs) => heard.push(cs));
    const ids = await collection.addEventsIds([a, b].map((x) => ({ acc: x.id, d: localDate(), t: 'water' as const })));
    await collection.removeEvents(ids);
    expect(heard).toHaveLength(2);
    expect(collection.events(a.id).map((e) => e.id)).toEqual([old.id]);
    expect(collection.events(b.id)).toHaveLength(0);
  });
  it('PASSES: archive is one commit: every status and its line, or none (a full disk)', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Copiapoa', status: 'growing' });
    const b = await collection.addAccession({ taxonName: 'Lithops', status: 'growing' });
    mem.fail = 'QuotaExceededError';
    await expect(collection.putWith('accession', a.id, { status: 'archived' }, [a, b].map((x) => ({ acc: x.id, d: localDate(), t: 'note' as const, note: 'Archived' })), [{ kind: 'accession', id: b.id, fields: { status: 'archived' } }])).rejects.toThrow();
    expect([collection.accession(a.id)!.status, collection.accession(b.id)!.status]).toEqual(['growing', 'growing']);
    expect(collection.events(a.id).concat(collection.events(b.id)).filter((e) => e.note === 'Archived')).toHaveLength(0);
  });
  it('PASSES: move Undo puts back what is still where it was moved and skips a plant removed meanwhile on another device', async () => {
    const { collection } = await fresh('testdevice');
    const x = await collection.addLocation({ name: 'X' });
    const home = await collection.addLocation({ name: 'Home' });
    const a = await collection.addAccession({ taxonName: 'Copiapoa', status: 'growing', locationId: home.id });
    const b = await collection.addAccession({ taxonName: 'Lithops', status: 'growing', locationId: home.id });
    const { n, undo } = await collection.movePlantsUndoable([a.id, b.id], x.id);
    expect(n).toBe(2);
    await collection.ingest([remote(Date.now() + 1000, 0, 'peerpeerpeer', 'accession', b.id, '_deleted', true)], 'server');
    await undo();
    expect(collection.accession(a.id)!.locationId).toBe(home.id);
  });
  it('FAILS (finding 14): move Undo leaves a plant that was moved on since where it is, but still deletes its "to X" line, so its log skips a place it was in', async () => {
    const { collection } = await fresh('testdevice');
    const x = await collection.addLocation({ name: 'X' });
    const y = await collection.addLocation({ name: 'Y' });
    const home = await collection.addLocation({ name: 'Home' });
    const b = await collection.addAccession({ taxonName: 'Lithops', status: 'growing', locationId: home.id });
    const { undo } = await collection.movePlantsUndoable([b.id], x.id);
    await collection.movePlants([b.id], y.id); // moved on, here or on another device, before the Undo
    await undo();
    expect(collection.accession(b.id)!.locationId).toBe(y.id); // left where it is: right
    expect(collection.events(b.id).filter((e) => e.t === 'move').map((e) => e.note).sort()).toEqual(['to X', 'to Y']);
  });
});
