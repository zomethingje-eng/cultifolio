/**
 * records review, round sixty: `restore` yields its number only to a record "born after the removal", judged by comparing
 * a peer's first stamp with this device's removal stamp: two clocks. Run against the in-memory vault of
 * collection-store.test.ts (its mock is copied here).
 *
 * FAILS on commit 21257b7 (reproduces finding 12): a peer whose clock is four minutes fast made its plant two minutes
 * BEFORE the removal; Undo renumbers the restored plant and writes a note saying the other was given the number "while
 * this one was removed". The second test PASSES and pins the other direction (a peer a few minutes slow, plant made after
 * the removal, is judged "before": the number is left shared, which the record pages then offer to renumber).
 * Run: npx vitest run tests/unit/records--restore-skew.test.ts
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

const plantOf = (wall: number, device: string, id: string, no: string, name: string): Change[] => [
  remote(wall, 0, device, 'accession', id, 'taxonName', name),
  remote(wall, 1, device, 'accession', id, 'status', 'growing'),
  remote(wall, 2, device, 'accession', id, 'acc', no)
];

describe('restore under clock skew (finding 12)', () => {
  it('a peer four minutes fast, plant made two minutes before the removal: the restored plant should keep its number (FAILS: renumbered, with a note that is not true)', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
    await x.collection.remove('accession', mine.id);
    // Y's plant was made at true time now - 2 min, on a clock 4 min fast: stamped now + 2 min (inside the 5 minutes a peer may run ahead before it is held)
    await x.collection.ingest(plantOf(Date.now() + 2 * 60_000, 'deviceyfast0', 'rpeer', '2026-0007', 'Lithops'), 'server');
    const moved = await x.collection.restore('accession', mine.id);
    const note = x.collection.events(mine.id).find((e) => /Renumbered/.test(e.note ?? ''))?.note ?? null;
    expect({ moved, note }).toEqual({ moved: null, note: null });
  });
  it('a peer three minutes slow, plant made one minute after the removal: judged "before", the number is left shared (PASSES; pins the other direction)', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
    await x.collection.remove('accession', mine.id);
    await x.collection.ingest(plantOf(Date.now() + 60_000 - 3 * 60_000, 'deviceyslow0', 'rpeer', '2026-0007', 'Lithops'), 'server');
    expect(await x.collection.restore('accession', mine.id)).toBeNull();
    expect(x.collection.withNumber('accession', '2026-0007')).toHaveLength(2);
  });
});
