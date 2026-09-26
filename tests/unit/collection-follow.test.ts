import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { mySpeciesOf } from '$lib/db/species-list';
import type { Accession, Taxon } from '$lib/db/types';

// The collection store against an in-memory vault: what a page sees, without IndexedDB.
const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => { mem.changes.push(...c); return c; },
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
  requestPersistence: async () => true
};
  // The claiming write of the real vault, over the same in-memory log: `build` sees the numbers the caller knows.
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.announceSyncForgotten = () => {};
  return m;
});

const { collection } = await import('$lib/db/collection.svelte');

const acc = (taxonName: string, status: Accession['status'] = 'growing', taxonKey?: number): Accession => ({ id: 'r' + Math.random().toString(36).slice(2), taxonName, taxonKey, status });
const taxon = (id: string, name: string, extra: Partial<Taxon> = {}): Taxon => ({ id, name, ...extra });

describe('mySpeciesOf', () => {
  it('is empty with nothing grown or followed', () => {
    expect(mySpeciesOf([], []).size).toBe(0);
    expect(mySpeciesOf([acc('Copiapoa cinerea', 'dead')], [taxon('copiapoa-cinerea', 'Copiapoa cinerea')]).size).toBe(0);
  });
  it('counts growing plants per slug and ignores archived and dead ones', () => {
    const m = mySpeciesOf([acc('Copiapoa cinerea'), acc('Copiapoa cinerea', 'growing', 123), acc('Copiapoa cinerea', 'archived'), acc('Ariocarpus retusus', 'dead')], []);
    expect([...m.keys()]).toEqual(['copiapoa-cinerea']);
    expect(m.get('copiapoa-cinerea')).toMatchObject({ name: 'Copiapoa cinerea', grown: 2, followed: false });
  });
  it('lists a followed species without a plant, and drops one whose taxon record was removed', () => {
    const m = mySpeciesOf([], [taxon('ariocarpus-retusus', 'Ariocarpus retusus', { gbifKey: 5, followed: true }), taxon('lithops-aucampiae', 'Lithops aucampiae', { followed: true, removed: true }), taxon('haworthia-truncata', 'Haworthia truncata', { followed: null })]);
    expect([...m.keys()]).toEqual(['ariocarpus-retusus']);
    expect(m.get('ariocarpus-retusus')).toEqual({ slug: 'ariocarpus-retusus', name: 'Ariocarpus retusus', gbifKey: 5, grown: 0, followed: true });
  });
  it('a species both grown and followed is one entry, grown and followed', () => {
    const m = mySpeciesOf([acc('Copiapoa cinerea')], [taxon('copiapoa-cinerea', 'Copiapoa cinerea', { gbifKey: 7, followed: true })]);
    expect(m.get('copiapoa-cinerea')).toMatchObject({ grown: 1, followed: true, gbifKey: 7 });
  });
  it('the plant carries a species even when its taxon record is not followed', () => {
    const m = mySpeciesOf([acc('Copiapoa cinerea')], [taxon('copiapoa-cinerea', 'Copiapoa cinerea', { myNotes: 'x' })]);
    expect(m.get('copiapoa-cinerea')).toMatchObject({ grown: 1, followed: false });
  });
});

describe('collection.follow', () => {
  it('follows and unfollows through the log, and mySpecies reflects it', async () => {
    await collection.load();
    expect(collection.mySpecies.size).toBe(0);
    await collection.follow('ariocarpus-retusus', 'Ariocarpus retusus', 5, true);
    expect(collection.taxon('ariocarpus-retusus')).toMatchObject({ name: 'Ariocarpus retusus', gbifKey: 5, followed: true });
    expect(collection.mySpecies.get('ariocarpus-retusus')).toMatchObject({ grown: 0, followed: true });
    // Following again writes nothing: put diffs fields.
    const before = mem.changes.length;
    await collection.follow('ariocarpus-retusus', 'Ariocarpus retusus', 5, true);
    expect(mem.changes.length).toBe(before);
    await collection.follow('ariocarpus-retusus', 'Ariocarpus retusus', 5, false);
    expect(collection.taxon('ariocarpus-retusus')?.followed ?? null).toBeNull();
    expect(collection.mySpecies.has('ariocarpus-retusus')).toBe(false);
  });
  it('a growing plant puts its species on the list; unfollowing does not take it off', async () => {
    await collection.load();
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', acquired: '2026-01-01' });
    expect(collection.mySpecies.get('copiapoa-cinerea')).toMatchObject({ grown: 1, followed: false });
    await collection.follow('copiapoa-cinerea', 'Copiapoa cinerea', 9, true);
    expect(collection.mySpecies.get('copiapoa-cinerea')).toMatchObject({ grown: 1, followed: true, gbifKey: 9 });
    await collection.follow('copiapoa-cinerea', 'Copiapoa cinerea', 9, false);
    expect(collection.mySpecies.get('copiapoa-cinerea')).toMatchObject({ grown: 1, followed: false });
    await collection.put('accession', a.id, { status: 'dead' });
    expect(collection.mySpecies.has('copiapoa-cinerea')).toBe(false);
  });
});
