import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, hlcCompare } from '$core/hlc';
import { accNo, sowNo } from '$lib/db/types';
import { localDate } from '$core/dates';

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
    const s = await collection.addSowing({ taxonName: 'Copiapoa cinerea', method: 'seed', sown: '2026-03-01', count: 20, sourceFrom: 'Mesa Garden', sourceRef: 'MG 456', fieldNumber: 'KK 1462', provenance: 'wild' });
    expect(sowNo(s)).toBe('S2026-001');
    expect(collection.sowingStats(s.id).rate).toBeNull(); // no count yet is not 0 % (round twenty-eight, 3)
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
    expect(a.fieldNumber).toBe('KK 1462'); // the field number is the collector's; the lot is the seller's and is not a field number (round twenty-eight, 4)
    expect(a.sourceRef).toBe('MG 456');
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
    expect(potup.plants).toEqual(made.map((a) => a.id)); // the plants by id: the line names them by their current numbers, whatever a later repair renumbers (round fifty-two, 4)

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
  it('a batch under a method this build does not know pots up with an unknown provenance and no source form, never as seed (round thirty-five, R1-1)', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const s = await collection.addSowing({ taxonName: 'Lachenalia viridiflora', method: 'seed', sown: '2026-09-01', count: 6, provenance: 'wild' });
    await collection.put('sowing', s.id, { method: 'twin-scaling' }); // a newer build's word, pulled by this one
    await collection.addEvent({ acc: s.id, d: '2026-10-01', t: 'germinate', n: 4 });
    const made = await collection.potUp(s.id, 2, { date: '2026-11-01' });
    expect(made[0].provenance).toBe('unknown'); // not "f1 from wild-collected seed": the method says nothing this build can read
    expect(made[0].sourceForm).toBeNull();
    expect(collection.sowing(s.id)?.method).toBe('twin-scaling');
  });
});

describe('round fifty-two, 3: the pot is read inside the claim, and an overdrawn pot is said', () => {
  beforeEach(async () => {
    await collection.load();
  });
  it('two pot-ups in flight for the last seedling make one plant; a merge that overdraws the pot is counted, not clamped away', async () => {
    const s = await collection.addSowing({ taxonName: 'Lithops', method: 'seed', sown: '2026-03-01', count: 5 });
    await collection.addEvent({ acc: s.id, d: '2026-03-16', t: 'germinate', n: 1 });
    const [a, b] = await Promise.all([collection.potUp(s.id, 1, { date: '2026-06-01' }), collection.potUp(s.id, 1, { date: '2026-06-01' }).catch(() => [])]);
    expect(a.length + b.length).toBe(1);
    expect(collection.sowingStats(s.id).remaining).toBe(0);
    expect(collection.sowingStats(s.id).overdrawn).toBe(0);
    // a peer potted the same seedling while apart: the merged pot is one over
    await collection.ingest([{ t: `${String(Date.now() - 1000).padStart(13, '0')}-0000-peerdevice00`, kind: 'event', id: 'e-peer', field: 'acc', value: s.id }, { t: `${String(Date.now() - 999).padStart(13, '0')}-0000-peerdevice00`, kind: 'event', id: 'e-peer', field: 'd', value: '2026-06-01' }, { t: `${String(Date.now() - 998).padStart(13, '0')}-0000-peerdevice00`, kind: 'event', id: 'e-peer', field: 't', value: 'potup' }, { t: `${String(Date.now() - 997).padStart(13, '0')}-0000-peerdevice00`, kind: 'event', id: 'e-peer', field: 'n', value: 1 }], 'server');
    expect(collection.sowingStats(s.id).overdrawn).toBe(1);
    expect(collection.sowingStats(s.id).remaining).toBe(0);
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
  it('two devices that minted the same number offline keep both plants; the merge says the number is shared, and the grower\'s repair renumbers the later one and tells it', async () => {
    await collection.load();
    const mine = await collection.addAccession({ taxonName: 'Albuca spiralis', acquired: '2026-05-01' });
    const no = accNo(mine);
    const before = collection.accessions.length;
    // The other device, offline, also minted that number for a different plant (a different identity).
    // Made a second after this device's plant: the record made first keeps the number, by its first stamp (round fifty-eight).
    const w = Date.now() + 1000;
    const theirs: Change[] = [
      { t: `${w}-0000-other`, kind: 'accession', id: 'raaaaaaaaa00othr', field: 'taxonName', value: 'Copiapoa cinerea' },
      { t: `${w + 1}-0000-other`, kind: 'accession', id: 'raaaaaaaaa00othr', field: 'acc', value: no },
      { t: `${w + 2}-0000-other`, kind: 'accession', id: 'raaaaaaaaa00othr', field: 'status', value: 'growing' },
      { t: `${w + 3}-0000-other`, kind: 'accession', id: 'raaaaaaaaa00othr', field: 'acquired', value: '2026-05-02' }
    ];
    await collection.ingest(theirs, 'server');
    expect(collection.accessions).toHaveLength(before + 1); // nothing merged into nothing
    expect(collection.sharesNumber('accession', mine.id)).toEqual(['raaaaaaaaa00othr']); // the merge wrote nothing of its own (round fifty-nine)
    expect(await collection.repairNumbers({ kind: 'accession', no })).toBe(true); // "Renumber now"
    expect(accNo(collection.accession(mine.id)!)).toBe(no); // the earlier creation keeps the number, though its id sorts after the other's
    const renamed = collection.accession('raaaaaaaaa00othr')!;
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
    await expect(collection.addLocation({ name: 'Orphan', parentId: 'nope' })).rejects.toThrow(/no longer here/); // said in the picker since round sixty-seven (triage-66 R12)
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
    const onShelf = await collection.addAccession({ taxonName: 'Lithops', acc: 'LOC-2', locationId: shelf.id });
    const r = await collection.removeLocation(shelf.id);
    expect(r).toEqual({ plants: 1, batches: 1, places: 0, to: 'Room' }); // said back to the page, for the toast (round twenty-three, 2)
    expect(collection.sowing(s.id)!.locationId).toBe(room.id);
    expect(collection.accession(onShelf.id)!.locationId).toBe(room.id);
    expect(collection.events(onShelf.id).map((e) => `${e.t}:${e.note}`)).toContain('move:to Room (Shelf was removed)'); // the plant's log says where it went and why
    // The other device's move, stamped after the removal, arrives through a pull.
    await collection.ingest([{ t: hlcEncode({ wall: Date.now() + 5000, count: 0, device: 'bbbbbbbbbbbb' }), kind: 'accession', id: a.id, field: 'locationId', value: shelf.id }], 'server');
    expect(collection.accession(a.id)!.locationId).toBe(shelf.id);
    expect(collection.placeOf(shelf.id)).toBe(room.id);
    expect(collection.plantsAt(room.id, false).map((p) => p.id)).toContain(a.id);
    expect(collection.locationName(shelf.id)).toBe('Room');
  });
  it('a removed place refiles dead plants without a line, carries up a plant filed under a place already removed, and marks its lines auto (round twenty-four, 4)', async () => {
    const room = await collection.addLocation({ name: 'Room', parentId: null, type: 'room' });
    const porch = await collection.addLocation({ name: 'Porch', parentId: room.id, type: 'outdoor' });
    const frame = await collection.addLocation({ name: 'Frame', parentId: porch.id, type: 'bench' });
    const dead = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'RM-1', locationId: porch.id });
    await collection.put('accession', dead.id, { status: 'dead' });
    const live = await collection.addAccession({ taxonName: 'Lithops', acc: 'RM-2', locationId: porch.id });
    await collection.removeLocation(frame.id); // Frame is gone; another device then files a plant into it
    const late = await collection.addAccession({ taxonName: 'Aloe', acc: 'RM-3', locationId: frame.id });
    const r = await collection.removeLocation(porch.id);
    expect(r).toEqual({ plants: 2, batches: 0, places: 0, to: 'Room' }); // the dead plant is not counted or logged
    expect(collection.accession(dead.id)!.locationId).toBe(room.id);
    expect(collection.events(dead.id).some((e) => e.t === 'move')).toBe(false);
    expect(collection.accession(late.id)!.locationId).toBe(room.id); // found through placeOf, not by the raw id
    const line = collection.events(live.id).find((e) => e.t === 'move')!;
    expect(line.note).toBe('to Room (Porch was removed)');
    expect(line.auto).toBe(true);
  });
  it('record ids carry the whole device id and this tab\'s writer tag, so two tabs of one device never mint one id (round eight, 1)', async () => {
    const a = await collection.addAccession({ taxonName: 'X', acc: 'ID-1' });
    expect(a.id).toMatch(/^r[0-9a-z]+testdevice[0-9a-z]{4}$/);
    expect(collection.writer).toMatch(/^testdevice[0-9a-z]{4}$/);
    expect(collection.device).toBe('testdevice');
  });
});

describe('last seen and missed (round twenty-four, 3)', () => {
  beforeEach(async () => { await collection.load(); });
  it('a same-day miss after a watering stands, a same-day sighting after a miss clears it, and the order is the log\'s, not the date\'s', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'LS-1' });
    const today = localDate();
    await collection.addEvent({ acc: a.id, d: today, t: 'water' });
    await collection.addEvent({ acc: a.id, d: today, t: 'audit', note: 'not seen' });
    expect(collection.missedAt(a.id)).toBe(today);
    expect(collection.lastSeen(a.id)).toBe(today); // the watering stands as the last sighting; the miss is later
    await collection.addEvent({ acc: a.id, d: today, t: 'audit', note: null });
    expect(collection.missedAt(a.id)).toBeNull();
  });
  it('automatic lines, place-wide actions and future dates are not sightings', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'LS-2', acquired: '2020-01-01' });
    const today = localDate();
    await collection.addEvent({ acc: a.id, d: '2026-01-05', t: 'audit', note: 'not seen' });
    await collection.addEvent({ acc: a.id, d: today, t: 'water', note: 'whole bench', auto: true });
    await collection.addEvent({ acc: a.id, d: today, t: 'move', note: 'to Room (Shelf was removed)', auto: true });
    await collection.addEvent({ acc: a.id, d: today, t: 'note', note: 'Renumbered from 1 to 2: another plant had been given 1' });
    await collection.addEvent({ acc: a.id, d: '2099-01-01', t: 'water' });
    expect(collection.missedAt(a.id)).toBe('2026-01-05');
    expect(collection.lastSeen(a.id)).toBe(localDate()); // the acquisition, by the day its record was made
  });
});

describe('free text replaced by another device (round twenty-four, 1; round twenty-five, 2; read from the log since round fifty-eight)', () => {
  beforeEach(async () => { await collection.load(); });
  const later = (ms: number, device: string, count = 0): string => hlcEncode({ wall: Date.now() + ms, count, device });
  const replaced = async (id: string) => (await collection.replacedNotes('accession', id)).map((r) => r.text);
  it('a pulled notes change made blind to a text shows that text as replaced unseen, on the record, and writes nothing; one made in sight of it shows nothing', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'TX-1' });
    await collection.put('accession', a.id, { notes: 'mealybug on the crown, treated with alcohol' });
    const lines = () => collection.events(a.id).filter((e) => e.t === 'note');
    // B edited from an older text (its notesBase is not this text's stamp): a true conflict
    await collection.ingest([{ t: later(5000, 'bbbbbbbbbbbbtab1'), kind: 'accession', id: a.id, field: 'notes', value: 'moved closer to the glass, looks etiolated' }, { t: later(5000, 'bbbbbbbbbbbbtab1', 1), kind: 'accession', id: a.id, field: 'notesBase', value: '1700000000000-0000-bbbbbbbbbbbbtab1' }], 'server');
    expect(collection.accession(a.id)!.notes).toBe('moved closer to the glass, looks etiolated');
    expect(await replaced(a.id)).toEqual(['mealybug on the crown, treated with alcohol']);
    expect(lines()).toHaveLength(0); // read from the log, never written to it (rule 5)
    // this device writes again; B then edits from this text (its notesBase is this text's stamp): seen, not lost
    await collection.put('accession', a.id, { notes: 'repotted into pumice' });
    const seen = collection.notesStamp('accession', a.id)!;
    await collection.ingest([{ t: later(9000, 'bbbbbbbbbbbbtab1'), kind: 'accession', id: a.id, field: 'notes', value: 'repotted into pumice; watered in' }, { t: later(9000, 'bbbbbbbbbbbbtab1', 1), kind: 'accession', id: a.id, field: 'notesBase', value: seen }], 'server');
    expect(collection.accession(a.id)!.notes).toBe('repotted into pumice; watered in');
    // the local edit 'repotted into pumice' was made from the etiolated text it opened on: seen too
    expect(await replaced(a.id)).toEqual(['mealybug on the crown, treated with alcohol']);
    // a text written elsewhere and stamped before all of these, arriving late, lost to the first edit after it, unseen: shown too, on every device alike
    await collection.ingest([{ t: hlcEncode({ wall: Date.now() - 60_000, count: 0, device: 'cccccccccccctab1' }), kind: 'accession', id: a.id, field: 'notes', value: 'older text' }], 'server');
    expect(collection.accession(a.id)!.notes).toBe('repotted into pumice; watered in');
    expect(await replaced(a.id)).toEqual(['older text', 'mealybug on the crown, treated with alcohol']);
    expect(lines()).toHaveLength(0);
  });
  it('a restore that replaces notes shows them too, and a local edit records what it was based on', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'TX-2' });
    await collection.put('accession', a.id, { notes: 'first text' });
    expect(collection.accession(a.id)!.notesBase ?? null).toBeNull(); // nothing to base the first text on
    const first = collection.notesStamp('accession', a.id);
    await collection.put('accession', a.id, { notes: 'second text' });
    expect(collection.accession(a.id)!.notesBase).toBe(first); // the second edit says it was made from the first text
    expect(await replaced(a.id)).toEqual([]);
    await collection.ingest([{ t: later(60_000, 'ddddddddddddtab1'), kind: 'accession', id: a.id, field: 'notes', value: 'from a backup made elsewhere' }], 'import'); // no base: an old file's edit, taken as unseen
    expect(await replaced(a.id)).toEqual(['second text']);
    expect(collection.events(a.id).filter((e) => e.t === 'note')).toHaveLength(0);
  });
});

describe('notesBase, the gaps (round twenty-six, 2)', () => {
  beforeEach(async () => { await collection.load(); });
  const later = (ms: number, device: string, count = 0): string => hlcEncode({ wall: Date.now() + ms, count, device });
  it('a save that re-sends unchanged notes writes no base; a real edit always writes one, stamped right after the notes', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'NB-1' });
    await collection.put('accession', a.id, { notes: 'one' });
    const before = mem.changes.length;
    await collection.put('accession', a.id, { notes: 'one', price: '5' }); // the form re-sends the notes unchanged
    expect(mem.changes.slice(before).map((c) => c.field)).toEqual(['price']);
    const s1 = collection.notesStamp('accession', a.id);
    await collection.put('accession', a.id, { notes: 'two' });
    const n = mem.changes.length;
    await collection.put('accession', a.id, { notes: 'three' }); // the base equals what diff would drop only if it never changed; it changed
    const last = mem.changes.slice(n).map((c) => c.field);
    expect(last).toEqual(['notes', 'notesBase']);
    expect(hlcCompare(mem.changes[n + 1].t, mem.changes[n].t)).toBeGreaterThan(0);
    expect(mem.changes[n + 1].value).not.toBe(s1);
  });
  it('a restore carrying this device\'s own older base does not make a knowing edit look blind; a base is paired to its own edit', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa', acc: 'NB-2' });
    await collection.put('accession', a.id, { notes: 'mine' });
    const mine = collection.notesStamp('accession', a.id)!;
    // B's backup holds the whole log: an old base of B's, then B's knowing edit (based on `mine`) and its base
    const old = { t: hlcEncode({ wall: Date.now() - 999_999, count: 0, device: 'bbbbbbbbbbbbtab1' }), kind: 'accession' as const, id: a.id, field: 'notesBase', value: 'x' };
    const edit = { t: later(120_000, 'bbbbbbbbbbbbtab1'), kind: 'accession' as const, id: a.id, field: 'notes', value: 'mine, and more' }; // past this device's clock, which earlier tests moved on
    const base = { t: later(120_000, 'bbbbbbbbbbbbtab1', 1), kind: 'accession' as const, id: a.id, field: 'notesBase', value: mine };
    await collection.ingest([old, edit, base], 'import');
    expect(collection.accession(a.id)!.notes).toBe('mine, and more');
    expect(await collection.replacedNotes('accession', a.id)).toEqual([]);
  });
  it('a push is never cut between a notes change and its base', async () => {
    const { cutBefore } = await import('$lib/sync/engine.svelte');
    const w = (tab: string) => `1789520000000-0000-aaaaaaaaaaaa${tab}`;
    const list = [{ t: w('tab1'), field: 'price' }, { t: w('tab1'), field: 'notes', kind: 'accession', id: 'r1' }, { t: w('tab1'), field: 'notesBase', kind: 'accession', id: 'r1' }, { t: w('tab1'), field: 'acc' }] as never[];
    expect(cutBefore(list, 2)).toBe(1);
    expect(cutBefore(list, 3)).toBe(3);
    expect(cutBefore(list, 1)).toBe(1);
    // another tab's change stamped between the pair (round twenty-eight, 0): the cut still moves before the notes
    const mixed = [{ t: w('tab1'), field: 'price' }, { t: w('tab1'), field: 'notes', kind: 'accession', id: 'r1' }, { t: w('tab2'), field: 'price', kind: 'accession', id: 'r2' }, { t: w('tab1'), field: 'notesBase', kind: 'accession', id: 'r1' }] as never[];
    expect(cutBefore(mixed, 3)).toBe(1);
    // a cut that falls between the pair without landing on the base itself moves too (round twenty-nine, 9)
    expect(cutBefore(mixed, 2)).toBe(1);
    // a pair at the very start of the batch cannot be cut before, so the cut goes after it
    const first = [{ t: w('tab1'), field: 'notes', kind: 'accession', id: 'r1' }, { t: w('tab1'), field: 'notesBase', kind: 'accession', id: 'r1' }, { t: w('tab1'), field: 'price' }, { t: w('tab1'), field: 'acc' }] as never[];
    expect(cutBefore(first, 1)).toBe(2);
    // the other tab's own edit of the same notes between them: not this pair, the cut stays
    const other = [{ t: w('tab1'), field: 'price' }, { t: w('tab1'), field: 'notes', kind: 'accession', id: 'r1' }, { t: w('tab2'), field: 'notes', kind: 'accession', id: 'r1' }, { t: w('tab1'), field: 'notesBase', kind: 'accession', id: 'r1' }] as never[];
    expect(cutBefore(other, 3)).toBe(3);
  });
});
