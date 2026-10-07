/**
 * records review, round sixty: `restore` yields its number only to a record "born after the removal", judged by comparing
 * a peer's first stamp with this device's removal stamp: two clocks. Run against the in-memory vault of
 * collection-store.test.ts (its mock is copied here).
 *
 * Adopted in round sixty-one (agent L) from docs/review-60/tests/records--restore-skew.test.ts, decided differently from
 * the review's expectation: "while this one was removed" is read from the order in which the removal and the other plant
 * reached this device (one device's order), never from two clocks. So a peer four minutes fast and a peer three minutes
 * slow are judged alike when their plants arrive after the removal: the restored plant yields, and its note says what
 * this device saw ("reached this device while this one was removed"), which is true whatever the peer's clock. The
 * review's first test failed on the round-sixty base (renumbered, with a note saying the other plant was GIVEN the number
 * while this one was removed, which was false); its second pinned the clock judgement the other way, and is inverted.
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
  // The order of arrival on this device (round sixty-one): the in-memory log's insertion order, as the real vault's order store keeps it.
  m.arrivalsOf = async (ts: string[]) => { const keys = [...mem.changes.keys()]; return new Map(ts.filter((t) => mem.changes.has(t)).map((t) => [t, keys.indexOf(t) + 1])); };
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

describe('restore under clock skew (finding 12): judged by arrival here, not by two clocks', () => {
  for (const [what, skew] of [['four minutes fast, made two minutes before the removal', 2 * 60_000], ['three minutes slow, made one minute after the removal', -2 * 60_000]] as const) {
    it(`a peer ${what}, arriving after the removal: the restored plant yields, and the note says only what this device saw`, async () => {
      const x = await fresh('devicex00000');
      const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
      await x.collection.remove('accession', mine.id);
      await x.collection.ingest(plantOf(Date.now() + skew, 'devicey00000', 'rpeer', '2026-0007', 'Lithops'), 'server');
      const moved = await x.collection.restore('accession', mine.id);
      expect(moved).toEqual({ from: '2026-0007', to: '2026-0008' });
      const note = x.collection.events(mine.id).find((e) => /Renumbered/.test(e.note ?? ''))?.note ?? '';
      expect(note).toContain('reached this device while this one was removed');
      expect(note).not.toMatch(/was given/); // round 60: "another plant was given 2026-0007 while this one was removed", false of the fast peer
      expect(accNo(x.collection.accession('rpeer')!)).toBe('2026-0007');
    });
  }
  it('a peer plant that reached this device before the removal, however its clock reads: no yield, the number is left shared for the grower to renumber', async () => {
    const x = await fresh('devicex00000');
    const mine = await x.collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
    await x.collection.ingest(plantOf(Date.now() + 4 * 60_000, 'devicey00000', 'rpeer', '2026-0007', 'Lithops'), 'server'); // stamped after the removal below, by a fast clock
    await x.collection.remove('accession', mine.id);
    expect(await x.collection.restore('accession', mine.id)).toBeNull();
    expect(x.collection.withNumber('accession', '2026-0007')).toHaveLength(2);
  });
});
