/**
 * Round sixty, agent F: the sample collection is seeded only in the sample (the tab's demo flag), only into an empty
 * collection, and only once; what it writes is ordinary records through the collection's own functions.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';

const store = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }).sessionStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k)
};

// The collection store against an in-memory vault: what a page sees, without IndexedDB.
const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => { mem.changes.push(...c); return { kept: c, replaced: [] }; },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
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
  m.arrivalsAfter = async () => ({ changes: [...mem.changes], seq: 0, gen: 0 });
  m.changeKeys = async () => mem.changes.map((c) => c.t);
  if (!m.changesByKeys) m.changesByKeys = async (ts: string[]) => mem.changes.filter((c) => ts.includes(c.t));
  if (!m.updateMeta) m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  if (!m.changesOf) m.changesOf = async (kind: string, id: string) => (mem.changes as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.announceSyncForgotten = () => {};
  return m;
});

const { collection } = await import('$lib/db/collection.svelte');
const { seedDemo, SAMPLE, POTTED, SEEDED } = await import('$lib/ui/grow/demo-seed');

describe('the sample collection seed', () => {
  it('writes nothing outside the sample: a grower\'s own collection is never seeded', async () => {
    store.delete('cultifolio.demo');
    expect(await seedDemo()).toBe(false);
    expect(mem.changes).toHaveLength(0);
    expect(mem.meta.has(SEEDED)).toBe(false);
  });
  it('writes nothing into a collection that already has a plant', async () => {
    store.set('cultifolio.demo', '1');
    await collection.load();
    const a = await collection.addAccession({ taxonName: 'Aloe polyphylla', provenance: 'unknown' });
    const before = mem.changes.length;
    expect(await seedDemo()).toBe(false);
    expect(mem.changes).toHaveLength(before);
    await collection.remove('accession', a.id);
  });
  it('fills an empty sample once: twelve plants in a greenhouse with two benches and on a windowsill, a seed batch with counts and a pot-up, waterings, a flowering, notes', async () => {
    store.set('cultifolio.demo', '1');
    expect(collection.accessions).toHaveLength(0);
    expect(await seedDemo()).toBe(true);
    expect(mem.meta.get(SEEDED)).toBe(true);
    expect(collection.accessions).toHaveLength(SAMPLE.length + POTTED);
    expect(collection.accessions.length).toBe(12);
    const names = collection.locations.map((l) => collection.locationPath(l.id).map((x) => x.name).join(' › ')).sort();
    expect(names).toEqual(['Greenhouse', 'Greenhouse › Bench 1', 'Greenhouse › Bench 2', 'Kitchen windowsill']);
    expect(collection.sowings).toHaveLength(1);
    const s = collection.sowings[0];
    expect(collection.sowingStats(s.id)).toMatchObject({ germinated: 23, potted: POTTED });
    expect(collection.raisedFrom(s.id)).toHaveLength(POTTED);
    const lines = collection.accessions.flatMap((a) => collection.events(a.id));
    expect(lines.filter((e) => e.t === 'water').length).toBeGreaterThan(20);
    expect(lines.some((e) => e.t === 'flower')).toBe(true);
    expect(collection.accessions.some((a) => a.notes)).toBe(true);
    // The reference's own species carry its keys; nothing else is given one.
    expect(collection.accessions.find((a) => a.taxonName === 'Copiapoa cinerea')?.taxonKey).toBe(5384013);
    expect(collection.accessions.find((a) => a.taxonName === 'Lithops lesliei')?.taxonKey ?? null).toBeNull();
    expect(collection.mySpecies.get('aloe-polyphylla')).toMatchObject({ grown: 0, followed: true });
    // Some plants are due, so Today has something to show.
    expect(collection.due.length).toBeGreaterThan(0);
  });
  it('does not seed twice, even after the visitor removes every plant', async () => {
    const before = mem.changes.length;
    expect(await seedDemo()).toBe(false);
    for (const a of collection.accessions) await collection.remove('accession', a.id);
    const after = mem.changes.length;
    expect(await seedDemo()).toBe(false);
    expect(mem.changes.length).toBe(after);
    expect(after).toBeGreaterThan(before);
  });
});
