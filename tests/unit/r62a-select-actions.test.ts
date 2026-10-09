/**
 * Round sixty-two, agent A: Archive's Undo in select mode is one commit (decision 1; the outside review's A25, the harness
 * review, 6). `archivePlants` and `undoArchive` (src/lib/ui/grow/select-actions.ts) are what SelectMode.svelte calls, so a
 * no-op Undo now fails here, not only in e2e. The Undo puts back the status of the plants still archived and removes only
 * their own "Archived" lines, in one `putWith`; a plant marked otherwise since keeps its status and its line; a line
 * another device wrote is never touched; and a failure throws with nothing changed, for the component to say.
 *
 * The first block runs over a recording store and passes on this copy. The second runs over the real collection (the
 * in-memory vault of r61a-select-undo.test.ts) and needs `putWith` to write an `also` entry of `{ _deleted: true }` as a
 * removal, agent L's file: it fails until that lands (agent A's report, "Needs from others").
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode } from '$core/hlc';
import { localDate } from '$core/dates';
import { archivePlants, undoArchive, type ArchiveStore } from '$lib/ui/grow/select-actions';

/** A store that records each write, with the lines and statuses it holds. */
function recording(statuses: Record<string, string>, lines: Record<string, Array<{ id: string; t: string; note?: string }>>) {
  const calls: Array<{ id: string; fields: Record<string, unknown>; events: unknown[]; also: Array<{ kind: string; id: string; fields: Record<string, unknown> }> }> = [];
  let fail: string | null = null;
  let n = 0;
  const store: ArchiveStore = {
    accession: (id) => (statuses[id] ? { status: statuses[id] } : null),
    events: (acc) => lines[acc] ?? [],
    putWith: async (_kind, id, fields, events = [], also = []) => {
      if (fail) throw new Error(fail);
      calls.push({ id, fields, events, also });
      for (const e of events as Array<{ acc: string; note: string; t: string }>) (lines[e.acc] ??= []).push({ id: `new${++n}`, t: e.t, note: e.note });
      statuses[id] = String(fields.status);
      for (const o of also) if (o.kind === 'accession') statuses[o.id] = String(o.fields.status);
    }
  };
  return { store, calls, setFail: (f: string | null) => (fail = f) };
}

describe('archive and its Undo, as select mode calls them', () => {
  it('archive is one write: every status and its line, and it returns each plant with the line written on it', async () => {
    const st = { a: 'growing', b: 'growing' };
    const { store, calls } = recording(st, { a: [{ id: 'old', t: 'note', note: 'Archived' }] });
    const done = await archivePlants(store, ['a', 'b'], '2026-10-08');
    expect(calls).toHaveLength(1);
    expect(done).toEqual([{ acc: 'a', line: 'new1' }, { acc: 'b', line: 'new2' }]); // not the older "Archived" line on a
  });
  it('the Undo is one write: the statuses back and only these plants\' own lines removed', async () => {
    const st = { a: 'growing', b: 'growing', c: 'growing' };
    const { store, calls } = recording(st, {});
    const done = await archivePlants(store, ['a', 'b', 'c'], '2026-10-08');
    st.b = 'dead'; // marked otherwise since: keeps its status and its line
    calls.length = 0;
    expect(await undoArchive(store, done)).toEqual({ back: 2, lines: 2 });
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect([c.id, c.fields]).toEqual(['a', { status: 'growing' }]);
    expect(c.also).toEqual([{ kind: 'accession', id: 'c', fields: { status: 'growing' } }, { kind: 'event', id: done[0].line, fields: { _deleted: true } }, { kind: 'event', id: done[2].line, fields: { _deleted: true } }]);
    expect(c.also.some((o) => o.id === done[1].line)).toBe(false);
  });
  it('nothing still archived: no write at all', async () => {
    const st = { a: 'growing' };
    const { store, calls } = recording(st, {});
    const done = await archivePlants(store, ['a'], '2026-10-08');
    st.a = 'growing';
    calls.length = 0;
    expect(await undoArchive(store, done)).toEqual({ back: 0, lines: 0 });
    expect(calls).toHaveLength(0);
  });
  it('a failed write is thrown for the page to say, and nothing is half done', async () => {
    const st = { a: 'growing', b: 'growing' };
    const { store, setFail } = recording(st, {});
    const done = await archivePlants(store, ['a', 'b'], '2026-10-08');
    setFail('QuotaExceededError');
    await expect(undoArchive(store, done)).rejects.toThrow('QuotaExceededError');
    expect(st).toEqual({ a: 'archived', b: 'archived' });
  });
});

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


describe('archive and its Undo over the real collection (needs agent L\'s putWith removal)', () => {
  it('one commit puts the statuses back and removes only the archive\'s own lines; a peer\'s line and a plant marked dead are left', async () => {
    const { collection } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Copiapoa', status: 'growing' });
    const b = await collection.addAccession({ taxonName: 'Lithops', status: 'growing' });
    const done = await archivePlants(collection, [a.id, b.id], localDate());
    expect(done.every((x) => !!x.line)).toBe(true);
    // A peer's own "Archived" line on a, arriving by sync between the archive and the Undo.
    await collection.ingest([
      { t: hlcEncode({ wall: Date.now() - 1000, count: 0, device: 'peerdevice00' }), kind: 'event', id: 'epeer1', field: 'acc', value: a.id },
      { t: hlcEncode({ wall: Date.now() - 1000, count: 1, device: 'peerdevice00' }), kind: 'event', id: 'epeer1', field: 'd', value: localDate() },
      { t: hlcEncode({ wall: Date.now() - 1000, count: 2, device: 'peerdevice00' }), kind: 'event', id: 'epeer1', field: 't', value: 'note' },
      { t: hlcEncode({ wall: Date.now() - 1000, count: 3, device: 'peerdevice00' }), kind: 'event', id: 'epeer1', field: 'note', value: 'Archived' }
    ] as Change[], 'server');
    await collection.put('accession', b.id, { status: 'dead' });
    const heard: Change[][] = [];
    collection.onLocalChange((cs) => heard.push(cs));
    expect(await undoArchive(collection, done)).toEqual({ back: 1, lines: 1 });
    expect(heard).toHaveLength(1); // one commit
    expect([collection.accession(a.id)!.status, collection.accession(b.id)!.status]).toEqual(['growing', 'dead']);
    const notes = (id: string) => collection.events(id).filter((e) => e.note === 'Archived').map((e) => e.id);
    expect(notes(a.id)).toEqual(['epeer1']); // the archive's own line gone, the peer's kept
    expect(notes(b.id)).toEqual([done[1].line]); // the dead plant keeps its line
  });
  it('a refused write changes nothing: still archived, the lines still there', async () => {
    const { collection, mem } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Copiapoa', status: 'growing' });
    const done = await archivePlants(collection, [a.id], localDate());
    mem.fail = 'QuotaExceededError';
    await expect(undoArchive(collection, done)).rejects.toThrow();
    expect(collection.accession(a.id)!.status).toBe('archived');
    expect(collection.events(a.id).filter((e) => e.note === 'Archived')).toHaveLength(1);
  });
});
