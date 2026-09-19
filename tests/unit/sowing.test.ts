import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode } from '$core/hlc';
import { accNo, sowNo } from '$lib/db/types';

// The collection store against an in-memory vault: what a page sees, without IndexedDB.
const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => void mem.changes.push(...c),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
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
    expect(sowNo(s)).toBe('S2026-001');
    expect(s.id).not.toBe('S2026-001'); // identity and number are different things
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
    expect(made.map(accNo)).toEqual(made.map(accNo).slice().sort()); // consecutive, never reused
    expect(new Set(made.map(accNo)).size).toBe(3);
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
    expect(potup.note).toContain(accNo(made[2]));

    // a second batch the same year gets the next number; a later year restarts
    expect(sowNo(await collection.addSowing({ taxonName: 'X', method: 'seed', sown: '2026-05-05', count: 5 }))).toBe('S2026-002');
    expect(sowNo(await collection.addSowing({ taxonName: 'X', method: 'seed', sown: '2027-01-05', count: 5 }))).toBe('S2027-001');
  });

  it('a vegetative batch from a parent records the taking on the parent and carries its identity', async () => {
    const mother = await collection.addAccession({ taxonName: 'Tylecodon pearsonii', fieldNumber: 'EVJ 9931', cultivar: null, provenance: 'wild', acquired: '2020-01-01' });
    const s = await collection.addSowing({ taxonName: mother.taxonName, method: 'cutting', parentAcc: mother.id, sown: '2026-09-01', count: 4 });
    const parentEvents = collection.events(mother.id);
    expect(parentEvents[0].t).toBe('propagate');
    expect(parentEvents[0].n).toBe(4);
    expect(parentEvents[0].note).toContain(sowNo(s));
    expect(collection.propagationsOf(mother.id).map((x) => x.id)).toEqual([s.id]);
    await collection.addEvent({ acc: s.id, d: '2026-10-01', t: 'germinate', n: 3 });
    const made = await collection.potUp(s.id, 2, { date: '2026-11-01' });
    expect(made[0].provenance).toBe('veg');
    expect(made[0].fieldNumber).toBe('EVJ 9931');
    expect(made[0].sourceFrom).toBe(`own plant ${accNo(mother)}`);
    expect(made[0].sourceForm).toBe('cutting');
  });
});

describe('identity is not the number', () => {
  it('a number already in use is refused, never overwritten, even when its plant is dead', async () => {
    await collection.load();
    const a = await collection.addAccession({ taxonName: 'Albuca spiralis', acc: '2019-0001' });
    expect(accNo(a)).toBe('2019-0001');
    await expect(collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2019-0001' })).rejects.toThrow(/already used/);
    expect(collection.accession('2019-0001')?.taxonName).toBe('Albuca spiralis'); // by number
    expect(collection.accession(a.id)?.taxonName).toBe('Albuca spiralis'); // by identity
    await collection.remove('accession', a.id);
    expect(collection.isNumberTaken('2019-0001')).toBe(true);
    await expect(collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2019-0001' })).rejects.toThrow(/already used/);
  });
  it('two devices that minted the same number offline keep both plants; the later one is renumbered and told', async () => {
    await collection.load();
    const mine = await collection.addAccession({ taxonName: 'Albuca spiralis', acquired: '2026-05-01' });
    const no = accNo(mine);
    const before = collection.accessions.length;
    // The other device, offline, also minted that number for a different plant (a different identity).
    const theirs: Change[] = [
      { t: '1700000000000-0000-other', kind: 'accession', id: 'rzzzzzzzzz00othr', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: '1700000000001-0000-other', kind: 'accession', id: 'rzzzzzzzzz00othr', field: 'acc', value: no },
      { t: '1700000000002-0000-other', kind: 'accession', id: 'rzzzzzzzzz00othr', field: 'status', value: 'growing' },
      { t: '1700000000003-0000-other', kind: 'accession', id: 'rzzzzzzzzz00othr', field: 'acquired', value: '2026-05-02' }
    ];
    await collection.ingest(theirs, 'server');
    expect(collection.accessions).toHaveLength(before + 1); // nothing merged into nothing
    expect(accNo(collection.accession(mine.id)!)).toBe(no); // the earlier creation keeps the number
    const renamed = collection.accession('rzzzzzzzzz00othr')!;
    expect(accNo(renamed)).not.toBe(no);
    expect(collection.accessions.filter((x) => accNo(x) === no)).toHaveLength(1);
    expect(collection.events(renamed.id).some((e) => new RegExp(`Renumbered from ${no} to ${accNo(renamed)}`).test(e.note ?? ''))).toBe(true);
  });
  it('records made before identity and number were separate still read as their number', () => {
    expect(accNo({ id: '2019-0147' })).toBe('2019-0147');
    expect(sowNo({ id: 'S2024-003' })).toBe('S2024-003');
  });
});

describe('places', () => {
  beforeEach(async () => {
    await collection.load();
  });
  it('two places with the same name are two places, and a place cannot be put inside itself', async () => {
    const house = await collection.addLocation({ name: 'House', type: 'room' });
    const porch = await collection.addLocation({ name: 'Porch', type: 'outdoor' });
    const s1 = await collection.addLocation({ name: 'Shelf 1', type: 'shelf', parentId: house.id });
    const s2 = await collection.addLocation({ name: 'Shelf 1', type: 'shelf', parentId: porch.id });
    expect(s1.id).not.toBe(s2.id);
    expect(collection.locations.filter((l) => l.name === 'Shelf 1')).toHaveLength(2);
    await expect(collection.moveLocation(house.id, house.id)).rejects.toThrow(/inside itself/);
    await expect(collection.moveLocation(house.id, s1.id)).rejects.toThrow(/inside itself/); // under its own child
    await collection.moveLocation(s2.id, house.id); // a real move is fine
    expect(collection.children(house.id)).toHaveLength(2);
    await expect(collection.addLocation({ name: 'Orphan', parentId: 'nope' })).rejects.toThrow(/does not exist/);
  });
  it('a loop in the log (two devices moving places into each other offline) is cut at its lowest id, which needs a home', async () => {
    await collection.ingest([
      { t: '1700000000000-0000-x', kind: 'location', id: 'la', field: 'name', value: 'A' },
      { t: '1700000000001-0000-x', kind: 'location', id: 'la', field: 'parentId', value: 'lb' },
      { t: '1700000000002-0000-x', kind: 'location', id: 'lb', field: 'name', value: 'B' },
      { t: '1700000000003-0000-x', kind: 'location', id: 'lb', field: 'parentId', value: 'la' },
      { t: '1700000000004-0000-x', kind: 'location', id: 'lc', field: 'name', value: 'C' },
      { t: '1700000000005-0000-x', kind: 'location', id: 'lc', field: 'parentId', value: 'lb' }
    ]);
    expect(collection.children(null).map((l) => l.id)).toContain('la'); // shown at the top, not hidden
    expect(collection.needsHome('la')).toBe(true);
    expect(collection.needsHome('lb')).toBe(false);
    expect(collection.subtree('la').sort()).toEqual(['la', 'lb', 'lc']);
    expect(collection.locationPath('lc').map((l) => l.name)).toEqual(['A', 'B', 'C']);
    expect(collection.locationName('la')).toBe('A');
    await collection.moveLocation('la', null); // the person gives it a home; the flag clears
    expect(collection.needsHome('la')).toBe(false);
  });
  it('removing a place moves its sowings too, and a plant put into a removed place by another device shows at the place above', async () => {
    const room = await collection.addLocation({ name: 'Room', parentId: null, type: 'room' });
    const shelf = await collection.addLocation({ name: 'Shelf', parentId: room.id, type: 'shelf' });
    const s = await collection.addSowing({ taxonName: 'Copiapoa', method: 'seed', sown: '2026-03-01', count: 10, locationId: shelf.id });
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'LOC-1', locationId: room.id });
    await collection.removeLocation(shelf.id);
    expect(collection.sowing(s.id)!.locationId).toBe(room.id);
    // The other device's move, stamped after the removal, arrives through a pull.
    await collection.ingest([{ t: hlcEncode({ wall: Date.now() + 5000, count: 0, device: 'bbbbbbbbbbbb' }), kind: 'accession', id: a.id, field: 'locationId', value: shelf.id }], 'server');
    expect(collection.accession(a.id)!.locationId).toBe(shelf.id);
    expect(collection.placeOf(shelf.id)).toBe(room.id);
    expect(collection.plantsAt(room.id, false).map((p) => p.id)).toContain(a.id);
    expect(collection.locationName(shelf.id)).toBe('Room');
  });
  it('record ids carry the whole device id', async () => {
    const a = await collection.addAccession({ taxonName: 'X', acc: 'ID-1' });
    expect(a.id).toMatch(/^r[0-9a-z]+testdevice$/);
  });
});
