import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';

// The collection store against an in-memory vault: what a page sees, without IndexedDB.
const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => void mem.changes.push(...c),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'test-device',
  requestPersistence: async () => true
}));

const { collection } = await import('$lib/db/collection.svelte');

describe('event ids', () => {
  it('never collide across quick successive writes on one device', async () => {
    await collection.load();
    const a = await collection.addAccession({ taxonName: 'Test', acquired: '2026-01-01' });
    for (let i = 0; i < 5; i++) await collection.addEvent({ acc: a.id, d: '2026-02-0' + (i + 1), t: 'water' });
    await collection.addEvents([{ acc: a.id, d: '2026-03-01', t: 'feed' }, { acc: a.id, d: '2026-03-01', t: 'audit' }]);
    expect(collection.events(a.id)).toHaveLength(8);
  });
});

describe('sowings', () => {
  beforeEach(async () => {
    await collection.load();
  });

  it('numbers batches per year, counts cumulatively, and pots up into numbered accessions', async () => {
    const s = await collection.addSowing({ taxonName: 'Copiapoa cinerea', method: 'seed', sown: '2026-03-01', count: 20, sourceFrom: 'Mesa Garden', sourceRef: 'MG 456', provenance: 'wild' });
    expect(s.id).toBe('S2026-001');
    expect(s.status).toBe('active');
    await collection.addEvent({ acc: s.id, d: '2026-03-09', t: 'germinate', n: 4 });
    await collection.addEvent({ acc: s.id, d: '2026-03-16', t: 'germinate', n: 11 });
    await collection.addEvent({ acc: s.id, d: '2026-04-02', t: 'loss', n: 2, cause: 'damping off' });
    let st = collection.sowingStats(s.id);
    expect(st.germinated).toBe(11); // cumulative: the latest count wins, not the sum
    expect(st.lost).toBe(2);
    expect(st.remaining).toBe(9);
    expect(st.rate).toBeCloseTo(0.55, 2);
    expect(st.firstUp).toBe('2026-03-09');
    expect(st.daysToFirst).toBe(8);

    const made = await collection.potUp(s.id, 3, { date: '2026-06-01', locationId: null });
    expect(made).toHaveLength(3);
    expect(made.map((a) => a.id)).toEqual(made.map((a) => a.id).slice().sort()); // consecutive, never reused
    expect(new Set(made.map((a) => a.id)).size).toBe(3);
    const a = collection.accession(made[0].id)!;
    expect(a.sowingId).toBe(s.id);
    expect(a.provenance).toBe('f1'); // wild seed raises F1 plants
    expect(a.fieldNumber).toBe('MG 456');
    expect(a.sourceFrom).toBe('Mesa Garden');
    expect(a.sourceForm).toBe('seedling');
    expect(a.acquired).toBe('2026-06-01');
    for (const a2 of made) expect(collection.events(a2.id).map((e) => e.t)).toEqual(['acquire']); // one acquire each: ids never collide
    st = collection.sowingStats(s.id);
    expect(st.potted).toBe(3);
    expect(st.remaining).toBe(6);
    expect(collection.raisedFrom(s.id)).toHaveLength(3);
    const potup = collection.events(s.id).find((e) => e.t === 'potup')!;
    expect(potup.n).toBe(3);
    expect(potup.note).toContain(made[2].id);

    // a second batch the same year gets the next number; a later year restarts
    expect((await collection.addSowing({ taxonName: 'X', method: 'seed', sown: '2026-05-05', count: 5 })).id).toBe('S2026-002');
    expect((await collection.addSowing({ taxonName: 'X', method: 'seed', sown: '2027-01-05', count: 5 })).id).toBe('S2027-001');
  });

  it('a vegetative batch from a parent records the taking on the parent and carries its identity', async () => {
    const mother = await collection.addAccession({ taxonName: 'Tylecodon pearsonii', fieldNumber: 'EVJ 9931', cultivar: null, provenance: 'wild', acquired: '2020-01-01' });
    const s = await collection.addSowing({ taxonName: mother.taxonName, method: 'cutting', parentAcc: mother.id, sown: '2026-09-01', count: 4 });
    const parentEvents = collection.events(mother.id);
    expect(parentEvents[0].t).toBe('propagate');
    expect(parentEvents[0].n).toBe(4);
    expect(parentEvents[0].note).toContain(s.id);
    expect(collection.propagationsOf(mother.id).map((x) => x.id)).toEqual([s.id]);
    await collection.addEvent({ acc: s.id, d: '2026-10-01', t: 'germinate', n: 3 });
    const made = await collection.potUp(s.id, 2, { date: '2026-11-01' });
    expect(made[0].provenance).toBe('veg');
    expect(made[0].fieldNumber).toBe('EVJ 9931');
    expect(made[0].sourceFrom).toBe(`own plant ${mother.id}`);
    expect(made[0].sourceForm).toBe('cutting');
  });
});
