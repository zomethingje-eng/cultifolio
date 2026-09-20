/**
 * Round-five probes of the collection store (src/lib/db) against an in-memory
 * vault. Each `it` states a claim from the code's comments or the About/formats
 * pages; a probe that passes with a "// FINDING" assertion demonstrates the
 * defect, one that fails would mean the defect is gone. Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-collection.probe.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, hlcDecode, MAX_AHEAD_MS } from '$core/hlc';
import { accNo } from '$lib/db/types';
import { mySpeciesOf } from '$lib/db/species-list';
import { importV2 } from '$lib/import/v2';

const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => void mem.changes.push(...c),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
  requestPersistence: async () => true,
  putPhotoBlobs: async () => {},
  getPhotoBlobs: async () => undefined,
  deletePhotoBlobs: async () => {}
}));

const { collection } = await import('$lib/db/collection.svelte');

/** A change as another device would have stamped it. */
const remote = (wall: number, count: number, device: string, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: hlcEncode({ wall, count, device }), kind, id, field, value });

beforeEach(async () => {
  await collection.load();
});

describe('HLC drift guard (hlc.ts: "a device whose wall clock is wrong cannot rewrite history")', () => {
  it('FINDING: a peer one hour ahead wins every field it touches; this device\'s own later edit to that field is applied to the log but never to the state it shows', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' });
    const ahead = Date.now() + 60 * 60_000; // an hour ahead: well past MAX_AHEAD_MS, so observe() ignores it
    expect(ahead - Date.now()).toBeGreaterThan(MAX_AHEAD_MS);
    await collection.ingest([remote(ahead, 0, 'phoneahead00', 'accession', a.id, 'notes', 'from the fast phone')], 'server');
    expect(collection.accession(a.id)?.notes).toBe('from the fast phone');
    // The grower on this device now edits the notes. The write "succeeds"...
    await collection.put('accession', a.id, { notes: 'corrected here' });
    const last = mem.changes[mem.changes.length - 1];
    expect(last.field).toBe('notes');
    expect(last.value).toBe('corrected here');
    expect(hlcDecode(last.t).wall).toBeLessThan(ahead); // ...stamped in the present, because the clock refused to follow the peer
    // ...but the state the page renders still shows the peer's value, and will for an hour on every device.
    expect(collection.accession(a.id)?.notes).toBe('from the fast phone'); // FINDING
  });
  it('FINDING: nothing refuses a change stamped years in the future; it is applied and locks the field on every device', async () => {
    const a = await collection.addAccession({ taxonName: 'Ariocarpus retusus', status: 'growing' });
    const y2031 = Date.parse('2031-01-01T00:00:00Z');
    await collection.ingest([remote(y2031, 0, 'phoneahead00', 'accession', a.id, 'status', 'dead')], 'server');
    await collection.put('accession', a.id, { status: 'growing' });
    expect(collection.accession(a.id)?.status).toBe('dead'); // FINDING: the grower cannot revive the plant until 2031
  });
});

describe('accession numbers', () => {
  it('addAccession refuses a number in use, live or dead; put() does not, so a merge can leave two plants on one number until resolveDuplicateNumbers runs', async () => {
    const a = await collection.addAccession({ taxonName: 'Lithops', acc: 'DUP-1' });
    await collection.put('accession', a.id, { status: 'dead' });
    await expect(collection.addAccession({ taxonName: 'Lithops', acc: 'DUP-1' })).rejects.toThrow(/already used/);
    const b = await collection.addAccession({ taxonName: 'Lithops' });
    await collection.put('accession', b.id, { acc: 'DUP-1' }); // no check on the edit path (no UI edits `acc`; a merge can)
    expect(collection.accessions.filter((x) => accNo(x) === 'DUP-1')).toHaveLength(2); // two plants, one number, until...
    expect(await collection.resolveDuplicateNumbers()).toBe(1); // ...the merge-time repair runs; it does, on every ingest. Holds.
    expect(collection.accessions.filter((x) => accNo(x) === 'DUP-1')).toHaveLength(1);
  });
  it('FINDING: two devices that merge the same duplicate each mint their own renumber and note; the log ends with two "Renumbered" notes and, if the schemes differ, a number nobody printed', async () => {
    // Device X (this device) already has 2026-0007 minted offline.
    const mine = await collection.addAccession({ taxonName: 'Copiapoa', acc: '2026-0007', acquired: '2026-05-01' });
    // Device Y minted the same number offline for a different plant, LATER than ours (so it is the one to be renumbered).
    const yId = 'r' + (Date.now() + 1000).toString(36) + '00' + 'devicey00000';
    const yWall = Date.now() - 1000;
    await collection.ingest([
      remote(yWall, 0, 'devicey00000', 'accession', yId, 'taxonName', 'Copiapoa'),
      remote(yWall, 1, 'devicey00000', 'accession', yId, 'acc', '2026-0007'),
      remote(yWall, 2, 'devicey00000', 'accession', yId, 'status', 'growing'),
      remote(yWall, 3, 'devicey00000', 'accession', yId, 'acquired', '2026-05-02')
    ], 'server');
    const ours = collection.accession(yId)!;
    expect(accNo(mine)).toBe('2026-0007');
    expect(accNo(ours)).not.toBe('2026-0007'); // we renumbered Y's plant
    const notesBefore = collection.events(yId).filter((e) => e.t === 'note' && /Renumbered/.test(e.note ?? ''));
    expect(notesBefore).toHaveLength(1);
    // Device Y, meanwhile, did the same resolution on its own log with its own (prefix) scheme: 'GH-0001'.
    const yFix = Date.now() + 500;
    await collection.ingest([
      remote(yFix, 0, 'devicey00000', 'accession', yId, 'acc', 'GH-0001'),
      remote(yFix, 1, 'devicey00000', 'event', 'evy000000001', 'acc', yId),
      remote(yFix, 2, 'devicey00000', 'event', 'evy000000001', 'd', '2026-09-20'),
      remote(yFix, 3, 'devicey00000', 'event', 'evy000000001', 't', 'note'),
      remote(yFix, 4, 'devicey00000', 'event', 'evy000000001', 'note', 'Renumbered from 2026-0007 to GH-0001: another plant had been given 2026-0007 on a device that was offline at the time.')
    ], 'server');
    const notes = collection.events(yId).filter((e) => e.t === 'note' && /Renumbered/.test(e.note ?? ''));
    expect(notes).toHaveLength(2); // FINDING: two notes, one of them naming a number the plant no longer has
    expect(['2026-0008', 'GH-0001']).toContain(accNo(collection.accession(yId)!));
  });
});

describe('events and plants', () => {
  it('an event can name a plant that does not exist, and removing a plant leaves its events live in the log', async () => {
    const e = await collection.addEvent({ acc: 'r-nobody', d: '2026-01-01', t: 'water' });
    expect(collection.events('r-nobody')).toHaveLength(1);
    expect(collection.accession('r-nobody')).toBeUndefined();
    const a = await collection.addAccession({ taxonName: 'Aloe', acquired: '2026-01-01' });
    await collection.remove('accession', a.id);
    expect(collection.accession(a.id)).toBeUndefined();
    expect(collection.events(a.id)).toHaveLength(1); // orphaned, invisible, still in every backup and every sync batch
    expect(e.id).toMatch(/^e/);
  });
});

describe('location tree', () => {
  it('moveLocation refuses a self-parent; a self-parent that arrives by merge is rooted silently, NOT flagged (tree() seeds nearestLive with the node itself)', async () => {
    const l = await collection.addLocation({ name: 'Shelf', parentId: null });
    await expect(collection.moveLocation(l.id, l.id)).rejects.toThrow(/inside itself/);
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', l.id, 'parentId', l.id)], 'server');
    expect(collection.location(l.id)?.parentId).toBe(l.id);
    expect(collection.needsHome(l.id)).toBe(false); // quality: a 1-cycle is the one loop the cut does not flag
    expect(collection.locationPath(l.id).map((x) => x.id)).toEqual([l.id]);
    expect(collection.children(null).some((x) => x.id === l.id)).toBe(true);
  });
  it('two devices moving two places into each other offline: the loop is cut at the lowest id, the other keeps its parent, and removeLocation on the cut node follows the RAW parent', async () => {
    const room = await collection.addLocation({ name: 'Room', parentId: null });
    const x = await collection.addLocation({ name: 'X', parentId: room.id });
    const y = await collection.addLocation({ name: 'Y', parentId: room.id });
    await collection.moveLocation(x.id, y.id); // here: X under Y
    await collection.ingest([remote(Date.now() + 5000, 0, 'devicey00000', 'location', y.id, 'parentId', x.id)], 'server'); // there: Y under X
    const cut = [x.id, y.id].sort()[0];
    const other = cut === x.id ? y.id : x.id;
    expect(collection.needsHome(cut)).toBe(true);
    expect(collection.needsHome(other)).toBe(false);
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([cut, other]);
    // Neither is under Room any more: the cut is at a root, not at the parent both had before the move. A grower sees "needs a home" with no hint that Room was where they lived.
    expect(collection.children(room.id)).toHaveLength(0);
    const plant = await collection.addAccession({ taxonName: 'Aloe', locationId: cut });
    await collection.removeLocation(cut);
    // The plant is moved to the removed node's RAW parent (the other node in the loop), whose own parent is the removed node.
    expect(collection.accession(plant.id)?.locationId).toBe(other);
    expect(collection.placeOf(other)).toBe(other);
    expect(collection.locationPath(other).map((l) => l.id)).toEqual([other]); // now a root, silently; nothing flags it
  });
});

describe('taxon followed / myNotes against the plant list', () => {
  it('FINDING: follow() on a taxon whose record carries removed:true (a v2 overlay) shows "Following" on the button and nothing on the list', async () => {
    await collection.put('taxon', 'aloe-polyphylla', { name: 'Aloe polyphylla', removed: true, myNotes: 'wanted' });
    await collection.follow('aloe-polyphylla', 'Aloe polyphylla', 123, true);
    expect(collection.taxon('aloe-polyphylla')?.followed).toBe(true); // FollowButton reads this: "Following ✓"
    expect(collection.mySpecies.has('aloe-polyphylla')).toBe(false); // the Species tab does not list it
    expect(mySpeciesOf([], collection.taxa)).toEqual(new Map()); // taxa getter drops removed too
  });
  it('myNotes on a species with no growing plant and no follow are kept but listed nowhere', async () => {
    const a = await collection.addAccession({ taxonName: 'Conophytum minutum' });
    await collection.put('taxon', 'conophytum-minutum', { name: 'Conophytum minutum', myNotes: 'sow in autumn' });
    expect(collection.mySpecies.get('conophytum-minutum')?.grown).toBe(1);
    await collection.put('accession', a.id, { status: 'dead' });
    expect(collection.mySpecies.has('conophytum-minutum')).toBe(false); // notes survive in the log; no view reaches them but the species page
    expect(collection.taxon('conophytum-minutum')?.myNotes).toBe('sow in autumn');
  });
});

describe('v2 importer', () => {
  it('FINDING: importing the same v2 file twice re-stamps every field at now−1h, so a month of edits since the first import is overwritten', async () => {
    const v2 = { collection: { accessions: { 'A-1': { acc: 'A-1', nameAsReceived: 'Copiapoa cinerea', notes: 'v2 notes', status: 'growing' } } } };
    const first = importV2(v2, { now: Date.now() - 30 * 86_400_000 }); // imported a month ago
    await collection.ingest(first.changes);
    expect(collection.accession('A-1')?.notes).toBe('v2 notes');
    // Two weeks ago the grower repotted it and later recorded its death (stamped then, by this device).
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    await collection.ingest([remote(twoWeeksAgo, 0, 'testdevice', 'accession', 'A-1', 'notes', 'repotted, new mix'), remote(twoWeeksAgo, 1, 'testdevice', 'accession', 'A-1', 'status', 'dead')], 'server');
    expect(collection.accession('A-1')?.status).toBe('dead');
    const again = importV2(v2, { now: Date.now() }); // "just to be safe"
    await collection.ingest(again.changes);
    expect(collection.accession('A-1')?.notes).toBe('v2 notes'); // FINDING
    expect(collection.accession('A-1')?.status).toBe('growing'); // FINDING: the dead plant is alive again
  });
  it('a v2 accession whose taxonId is not in the overlay is named by its slug', () => {
    const r = importV2({ collection: { accessions: [{ acc: 'B-1', taxonId: 'copiapoa-cinerea' }] } });
    expect(r.changes.find((c) => c.field === 'taxonName')?.value).toBe('copiapoa-cinerea'); // a slug where a name should be
  });
});
