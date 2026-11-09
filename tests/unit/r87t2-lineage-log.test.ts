/**
 * Round eighty-seven, stage 3 (t2: lineage and events): the new fields in the collection's log, both ways between
 * versions (STAGE3-87's rules; read beside r87b-pins-log, whose method this follows).
 *
 * 1. A log holding every field this work writes, as this version writes them (a plant's `motherAcc` and `motherHow`, a
 *    batch's `cross` and `stockAcc`, a line's `pollen`, `scion` and `stock`, and a `fruit` line) is read by round
 *    eighty-six's own log module (the live code, kept whole in tests/unit/r87b-old/log-r86.ts): no change refused or left
 *    out, the batch not refused whole, every record folded as this version folds it and none left waiting.
 * 2. A log written by round eighty-six (a cutting batch from a parent, a pollinate line without a pollen parent, a graft
 *    line without its parts) read here: the parents it states are read, and nothing it does not state.
 * 3. Validated on read: a link that is not a record id (a number, a list, a text past 64 characters, the record's own
 *    id), a cross line with no readable pollen parent, a graft line with neither part, a `motherHow` word of a newer
 *    version: each read as none, or shown by its word, never thrown on.
 * 4. Why fields and not a kind: round eighty-six refuses a batch that holds a kind it does not know, whole.
 *
 * Fails on the base (r87s2 head): $lib/db/lineage does not exist, and `fruit` is no event type there.
 */
import { describe, it, expect } from 'vitest';
import * as old from './r87b-old/log-r86';
import { readChanges, materialise, live, changeError, FOLD_RULES, FIELD_TYPES, FIELD_ENUMS, type Change, type Record_ } from '$core/log';
import { parentsOf, childrenOf, crossesOf, crossOf, graftOf, linkId, howOf, LINK_MAX, type LineageSource } from '$lib/db/lineage';
import { EVENT_LABEL, MOTHER_HOW, type Accession, type PlantEvent, type Sowing } from '$lib/db/types';

const W = 'aaaaaaaaaaaa';
let wall = 1789520000000;
const ch = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-${W}`, kind, id, field, value } as Change);
const rec = (kind: string, id: string, fields: Record<string, unknown>): Change[] => Object.entries(fields).map(([f, v]) => ch(kind, id, f, v));
const plant = (id: string, no: string, name: string, more: Record<string, unknown> = {}) => rec('accession', id, { acc: no, taxonName: name, status: 'growing', ...more });
const line = (id: string, acc: string, d: string, t: string, more: Record<string, unknown> = {}) => rec('event', id, { acc, d, t, ...more });

/** A source over a folded state, as the collection reads it. */
function sourceOf(state: Map<string, Record_>): LineageSource & { plants: Accession[] } {
  const lines = live<PlantEvent & Record_>(state, 'event');
  return {
    sowing: (id) => { const r = state.get(`sowing:${id}`); return r && !r._deleted ? (r as unknown as Sowing) : undefined; },
    event: (id) => { const r = state.get(`event:${id}`); return r && !r._deleted ? (r as unknown as PlantEvent) : undefined; },
    events: (id) => lines.filter((e) => e.acc === id),
    plants: live<Accession & Record_>(state, 'accession')
  };
}

/** Every field this work writes, as the pages write them. */
const NEW_LOG: Change[] = [
  ...plant('rA', '2026-0001', 'Ariocarpus retusus'),
  ...plant('rB', '2026-0002', 'Ariocarpus trigonus'),
  // A cross, on its seed parent, with its pollen parent; then fruit and seed set on the same plant.
  ...line('eX', 'rA', '2026-04-02', 'pollinate', { pollen: 'rB', note: 'brush, morning' }),
  ...line('eF', 'rA', '2026-05-10', 'fruit'),
  ...line('eS', 'rA', '2026-07-01', 'seed', { n: 40 }),
  // The seed lot sown, the batch naming the cross; a plant potted up from it.
  ...rec('sowing', 's1', { no: 'S2026-001', taxonName: 'Ariocarpus retusus', method: 'seed', sown: '2026-07-20', count: 40, status: 'active', cross: 'eX', provenance: 'fn' }),
  ...plant('rC', '2026-0003', 'Ariocarpus retusus', { sowingId: 's1' }),
  // An offset added from its mother, without a batch.
  ...plant('rD', '2026-0004', 'Ariocarpus retusus', { motherAcc: 'rA', motherHow: 'offset', provenance: 'veg' }),
  // A graft line on a grafted plant, and a graft batch with its stock.
  ...plant('rE', '2026-0005', 'Pereskiopsis spathulata'),
  ...plant('rG', '2026-0006', 'Ariocarpus trigonus'),
  ...line('eG', 'rG', '2026-06-01', 'graft', { scion: 'rB', stock: 'rE' }),
  ...rec('sowing', 's2', { no: 'S2026-002', taxonName: 'Ariocarpus trigonus', method: 'graft', parentAcc: 'rB', stockAcc: 'rE', sown: '2026-06-03', count: 3, status: 'active' })
];

describe('r87t2 lineage in the log 1: read by round eighty-six', () => {
  it('no change refused or left out, and the batch is not refused whole', () => {
    for (const c of NEW_LOG) expect(old.changeError(c), JSON.stringify(c)).toBeNull();
    const { changes, dropped } = old.readChanges(NEW_LOG);
    expect(dropped).toEqual([]);
    expect(changes).toHaveLength(NEW_LOG.length);
    expect(() => old.validateChanges(NEW_LOG)).not.toThrow();
  });
  it('folds every record as this version does, none waiting', () => {
    const then = old.materialise(old.readChanges(NEW_LOG).changes).state;
    const now = materialise(readChanges(NEW_LOG).changes).state;
    expect([...now.values()].map((r) => JSON.stringify(r)).sort()).toEqual([...then.values()].map((r) => JSON.stringify(r)).sort());
    expect(old.incomplete(then)).toEqual([]);
    expect(old.live(then, 'accession')).toHaveLength(6);
    expect(old.live(then, 'sowing')).toHaveLength(2);
    // The fruit line is an event round eighty-six folds and shows by its word, as it shows any type it does not know.
    expect(old.live(then, 'event').map((e) => e.t).sort()).toEqual(['fruit', 'graft', 'pollinate', 'seed']);
    expect(FOLD_RULES).toBe(8); // no fold rule moved: every field is on a kind every version folds
  });
  it('this version reads the lineage from it', () => {
    const { state } = materialise(readChanges(NEW_LOG).changes);
    const src = sourceOf(state);
    const by = (id: string) => src.plants.find((a) => a.id === id)!;
    expect(parentsOf(by('rC'), src).map((p) => [p.role, p.id, p.d])).toEqual([['seed', 'rA', '2026-04-02'], ['pollen', 'rB', '2026-04-02']]);
    expect(parentsOf(by('rD'), src).map((p) => [p.role, p.id, p.how])).toEqual([['mother', 'rA', 'offset']]);
    expect(parentsOf(by('rG'), src).map((p) => [p.role, p.id])).toEqual([['scion', 'rB'], ['stock', 'rE']]);
    expect(childrenOf('rA', src.plants, src).map((c) => [c.id, c.role]).sort()).toEqual([['rC', 'seed'], ['rD', 'mother']]);
    expect(childrenOf('rB', src.plants, src).map((c) => [c.id, c.role]).sort()).toEqual([['rC', 'pollen'], ['rG', 'scion']]);
    expect(childrenOf('rE', src.plants, src).map((c) => [c.id, c.role])).toEqual([['rG', 'stock']]);
    expect(crossesOf('rB', live<PlantEvent & Record_>(state, 'event')).map((c) => [c.id, c.as, c.seed])).toEqual([['eX', 'pollen', 'rA']]);
  });
});

describe('r87t2 lineage in the log 2: a log of round eighty-six read here', () => {
  const OLD_LOG: Change[] = [
    ...plant('r1', '2025-0001', 'Haworthia truncata'),
    ...rec('sowing', 'sv', { no: 'S2025-001', taxonName: 'Haworthia truncata', method: 'leaf', parentAcc: 'r1', sown: '2025-03-01', count: 6, status: 'done' }),
    ...plant('r2', '2025-0002', 'Haworthia truncata', { sowingId: 'sv', provenance: 'veg' }),
    ...line('o1', 'r1', '2025-04-01', 'pollinate', { note: 'with a friend\'s plant' }),
    ...line('o2', 'r2', '2025-05-01', 'graft', { note: 'onto Pereskiopsis' })
  ];
  it('its batches give the parent they state, and nothing it does not state', () => {
    const { state, } = materialise(readChanges(OLD_LOG).changes);
    const src = sourceOf(state);
    const r2 = src.plants.find((a) => a.id === 'r2')!;
    expect(parentsOf(r2, src).map((p) => [p.role, p.id, p.how, p.via.kind])).toEqual([['mother', 'r1', 'leaf', 'batch']]);
    expect(crossesOf('r1', live<PlantEvent & Record_>(state, 'event'))).toEqual([]); // a pollinate line with no pollen parent is a pollination, not a cross
    expect(graftOf(state.get('event:o2') as never)).toBeNull();
    expect(childrenOf('r1', src.plants, src).map((c) => c.id)).toEqual(['r2']);
  });
});

describe('r87t2 lineage in the log 3: validated on read', () => {
  it('a link that is not a record id is none', () => {
    for (const v of [null, undefined, 5, ['r1'], { id: 'r1' }, '', '   ', ' r1', 'x'.repeat(LINK_MAX + 1)]) expect(linkId(v), JSON.stringify(v)).toBeNull();
    expect(linkId('r1', 'r1')).toBeNull(); // its own id
    expect(linkId('r1')).toBe('r1');
    expect(linkId('x'.repeat(LINK_MAX))).toBe('x'.repeat(LINK_MAX));
  });
  it('a cross line needs a readable pollen parent other than its own plant; its day is a day or none', () => {
    const base = { id: 'e', acc: 'rA', t: 'pollinate' as const, d: '2026-04-02' };
    expect(crossOf({ ...base, pollen: 'rB' })).toMatchObject({ seed: 'rA', pollen: 'rB', d: '2026-04-02' });
    expect(crossOf({ ...base, pollen: 'rA' })).toBeNull();
    expect(crossOf({ ...base, pollen: 7 })).toBeNull();
    expect(crossOf({ ...base, t: 'flower' as never, pollen: 'rB' })).toBeNull();
    expect(crossOf({ ...base, d: '2026-04', pollen: 'rB' })!.d).toBeNull();
    expect(crossOf(undefined)).toBeNull();
  });
  it('a graft line needs one part at least', () => {
    expect(graftOf({ id: 'g', acc: 'rG', t: 'graft', d: '2026-06-01', stock: 'rE' })).toMatchObject({ scion: null, stock: 'rE' });
    expect(graftOf({ id: 'g', acc: 'rG', t: 'graft', d: '2026-06-01', scion: 'rG', stock: ['x'] })).toBeNull();
  });
  it('a newer version\'s word for how is shown as it is, cut to forty characters; a non-word is none', () => {
    for (const k of MOTHER_HOW) expect(howOf(k)).toBe(k);
    expect(howOf('air layer')).toBe('air layer');
    expect(howOf('y'.repeat(90))).toHaveLength(40);
    expect(howOf(3)).toBeNull();
    expect(howOf('')).toBeNull();
  });
  it('a parent no longer here is still a parent; one this device never had is named by its id', () => {
    const log = [...NEW_LOG, ch('accession', 'rA', '_deleted', true), ...plant('rH', '2026-0008', 'Ariocarpus retusus', { motherAcc: 'r-elsewhere', motherHow: 'division' })];
    const { state } = materialise(readChanges(log).changes);
    const src = sourceOf(state);
    const rC = src.plants.find((a) => a.id === 'rC')!;
    expect(parentsOf(rC, src).map((p) => p.id)).toEqual(['rA', 'rB']); // the seed parent removed: the cross still names it
    expect(parentsOf(src.plants.find((a) => a.id === 'rH')!, src)).toEqual([{ role: 'mother', id: 'r-elsewhere', how: 'division', d: null, via: { kind: 'plant' } }]);
  });
  it('this version refuses a link of the wrong type from outside, one change at a time; round eighty-six folds it, and the reader reads it as none', () => {
    const bad = ch('event', 'eX', 'pollen', 42);
    expect(changeError(bad)).toMatch(/pollen of an event must be a string/);
    expect(readChanges([...NEW_LOG, bad]).dropped).toHaveLength(1);
    expect(old.changeError(bad)).toBeNull();
    const then = old.materialise(old.readChanges([...NEW_LOG, bad]).changes).state;
    expect(crossOf(then.get('event:eX') as never)).toBeNull();
  });
  it('the tables name every field this work writes, and the one new event type', () => {
    expect(FIELD_TYPES.accession.motherAcc).toBe('string');
    expect(FIELD_TYPES.accession.motherHow).toBe('string');
    expect(FIELD_ENUMS.accession!.motherHow).toEqual([...MOTHER_HOW]);
    expect([FIELD_TYPES.sowing.cross, FIELD_TYPES.sowing.stockAcc]).toEqual(['string', 'string']);
    expect([FIELD_TYPES.event.pollen, FIELD_TYPES.event.scion, FIELD_TYPES.event.stock]).toEqual(['string', 'string', 'string']);
    expect(EVENT_LABEL.fruit).toBe('Set fruit');
    // Round eighty-six knows none of them, so each passes it as a field it does not know.
    for (const [k, f] of [['accession', 'motherAcc'], ['accession', 'motherHow'], ['sowing', 'cross'], ['sowing', 'stockAcc'], ['event', 'pollen'], ['event', 'scion'], ['event', 'stock']] as const) expect(Object.hasOwn(old.FIELD_TYPES[k], f), `${k}.${f}`).toBe(false);
  });
});

describe('r87t2 lineage in the log 4: why fields and not a kind', () => {
  it('round eighty-six refuses a batch that holds a kind it does not know, whole', () => {
    expect(() => old.readChanges([...plant('r1', '2026-0001', 'Aloe vera'), ch('cross', 'x1', 'seed', 'r1')])).toThrow(/unknown kind/);
    expect(old.KINDS).toEqual(expect.arrayContaining(['accession', 'sowing', 'event']));
  });
});
