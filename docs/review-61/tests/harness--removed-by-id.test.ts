/**
 * Harness review of round sixty-one, mutation R1: `removedAccession` looks a removed plant up by its id first (round
 * sixty-one; the records review, 2), which is what the plant page passes when a label's code or a link names the plant by
 * id. Deleting the id lookup (`if (own && own._deleted) return own`) passed every unit test that touches records
 * (r61l-records-restore-skew, collection-store, r61h-batch-href, r61a-select-undo, collection-follow, notes-replaced,
 * r60-notes-review, r60-guards-client); only the e2e "your own removed plant's label offers Restore" sees it.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). The in-memory vault is r61a-select-undo.test.ts's.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--removed-by-id.test.ts`.
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

describe('a removed plant, found again', () => {
  it('by its id, and by its number; of two removed plants that shared a number, the id finds the one it names', async () => {
    const { collection } = await fresh('testdevice');
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', status: 'growing', acc: '2026-0042' } as never);
    const b = await collection.addAccession({ taxonName: 'Lithops lesliei', status: 'growing' } as never);
    await collection.put('accession', b.id, { acc: '2026-0042' }); // the number shared, as a merge can leave it
    await collection.remove('accession', a.id);
    await collection.remove('accession', b.id);
    expect(collection.removedAccession(a.id)?.id).toBe(a.id);
    expect(collection.removedAccession(b.id)?.id).toBe(b.id);
    expect(collection.removedAccession('2026-0042')).toBeDefined(); // by number, as before: one of the two
    expect(collection.removedAccession('no-such-plant')).toBeUndefined();
  });
});
