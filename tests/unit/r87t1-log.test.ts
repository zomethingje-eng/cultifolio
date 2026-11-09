/**
 * Round eighty-seven (t1): identity and provenance in the collection's log, both ways between versions (STAGE3-87's
 * safety rules, tested as tests/unit/r87b-pins-log.test.ts tests the pins).
 *
 * 1. A log as this version writes it (an item, a deaccession, a death that is one, ITF2's codes, the collector, the
 *    identification, an "ex" chain, a clone, an earlier name) is read by round eighty-six's own log module (the live code,
 *    kept whole in tests/unit/r87b-old/log-r86.ts): no change refused or left out, the batch not refused whole, and it
 *    folds to the same state as here. The plants it lists are the ones this version lists, an item under its own number,
 *    and a plant no longer held is off its growing list by its status alone.
 * 2. A log of round eighty-six read here: every plant reads as nothing stated, and no item and no deaccession.
 * 3. A newer version's values: a word or a code this version does not know folds as it is, on a pull and from a file
 *    alike, and reads as not stated; a value of the wrong type is left out by this version (round eighty-six passes it
 *    as an unknown field, which this version's own writes never send).
 * 4. Every new field is a field of `accession`, a kind round eighty-six knows: no new kind, and the fold rules unmoved.
 *
 * Fails on the base (r85m head): $core/identity does not exist.
 */
import { describe, it, expect } from 'vitest';
import * as old from './r87b-old/log-r86';
import { readChanges, materialise, live, FOLD_RULES, KINDS, type Change } from '$core/log';
import { identityOf } from '$core/identity';
import { accNo } from '$lib/db/types';

const W = 'bbbbbbbbbbbb';
let wall = 1789600000000;
const ch = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-${W}`, kind, id, field, value } as Change);
const rec = (id: string, fields: Record<string, unknown>): Change[] => Object.entries(fields).map(([f, v]) => ch('accession', id, f, v));

/** A log as this version writes it: what the plant page, the add form, the split and the deaccession write. */
const log: Change[] = [
  ...rec('r1', { acc: '2026-0012', taxonName: 'Lithops lesliei', status: 'growing', provenance: 'f1', fieldNumber: 'SB 829', provType: 'W', propHistory: 'SA', collector: 'Brack, S.', collected: '1985-11', idLevel: '2', idBy: 'Hunt, D.', idOn: '2019-03-07', exChain: ['Devon', 'Mesa Garden'], clone: 'A', idHistory: [{ name: 'Lithops cf. lesliei', until: '2026-11-01', idLevel: '1' }] }),
  // Item A split off: the shared fields as they stood, its own place and status.
  ...rec('r2', { acc: '2026-0012/A', item: 'A', itemOf: 'r1', taxonName: 'Lithops lesliei', status: 'growing', provenance: 'f1', fieldNumber: 'SB 829', provType: 'W', propHistory: 'SA', collector: 'Brack, S.', exChain: ['Devon', 'Mesa Garden'], locationId: null }),
  ch('event', 'e1', 'acc', 'r2'), ch('event', 'e1', 'd', '2026-11-09'), ch('event', 'e1', 't', 'note'), ch('event', 'e1', 'note', 'Split off 2026-0012 as item A of 2026-0012 (offset)'),
  // Given away: kept, with its reason; archived, so a version that does not read the reason lists it off the growing list.
  ...rec('r3', { acc: '2026-0013', taxonName: 'Aloe vera', status: 'growing' }),
  ...rec('r3', { deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club sale', status: 'archived' }),
  // A death recorded through Died…: the line, the status and the deaccession in one commit.
  ...rec('r4', { acc: '2026-0014', taxonName: 'Conophytum minimum', status: 'growing' }),
  ...rec('r4', { status: 'dead', deacc: 'died', deaccOn: '2026-11-02' }),
  // Held again: the deaccession cleared.
  ...rec('r5', { acc: '2026-0015', taxonName: 'Haworthia truncata', status: 'archived', deacc: 'lost', deaccOn: '2026-06' }),
  ...rec('r5', { deacc: null, deaccOn: null, deaccNote: null, status: 'growing' })
];

describe('r87t1 log 1: read by round eighty-six', () => {
  it('no change refused or left out, and the batch is not refused whole', () => {
    for (const c of log) expect(old.changeError(c), JSON.stringify(c)).toBeNull();
    const { changes, dropped } = old.readChanges(log);
    expect(dropped).toEqual([]);
    expect(changes).toHaveLength(log.length);
    expect(() => old.validateChanges(log)).not.toThrow();
  });
  it('folds to the same state as here, every plant whole', () => {
    const then = old.materialise(old.readChanges(log).changes).state;
    const { changes, dropped } = readChanges(log);
    expect(dropped).toEqual([]);
    const now = materialise(changes).state;
    expect([...now.values()].map((r) => JSON.stringify(r)).sort()).toEqual([...then.values()].map((r) => JSON.stringify(r)).sort());
    expect(old.incomplete(then)).toEqual([]);
  });
  it('lists the item under its own number, and a plant no longer held off the growing list by its status', () => {
    const then = old.materialise(old.readChanges(log).changes).state;
    const plants = old.live(then, 'accession');
    expect(plants.map((r) => accNo(r as never)).sort()).toEqual(['2026-0012', '2026-0012/A', '2026-0013', '2026-0014', '2026-0015']);
    const growing = plants.filter((r) => r.status === 'growing').map((r) => accNo(r as never)).sort();
    expect(growing).toEqual(['2026-0012', '2026-0012/A', '2026-0015']);
  });
  it('this version reads every field from the same log', () => {
    const now = materialise(readChanges(log).changes).state;
    const byNo = new Map(live(now, 'accession').map((r) => [accNo(r as never), identityOf(r)]));
    expect(byNo.get('2026-0012')).toMatchObject({ provType: 'W', provTypeRead: false, propHistory: 'SA', collector: 'Brack, S.', collected: '1985-11', idLevel: '2', idBy: 'Hunt, D.', idOn: '2019-03-07', exChain: ['Devon', 'Mesa Garden'], clone: 'A', field: { code: 'SB', no: '829' } });
    expect(byNo.get('2026-0012')!.idHistory).toEqual([{ name: 'Lithops cf. lesliei', until: '2026-11-01', idLevel: '1' }]);
    expect(byNo.get('2026-0012/A')).toMatchObject({ item: 'A', itemOf: 'r1' });
    expect(byNo.get('2026-0013')).toMatchObject({ deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club sale' });
    expect(byNo.get('2026-0014')).toMatchObject({ deacc: 'died', deaccOn: '2026-11-02' });
    expect(byNo.get('2026-0015')).toMatchObject({ deacc: null, deaccOn: null, deaccNote: null });
  });
});

describe('r87t1 log 2: a log of round eighty-six read here', () => {
  it('nothing stated, no item, no deaccession; the type read from the provenance word only where ITF2 agrees', () => {
    const r86 = [...rec('a1', { acc: '2025-0001', taxonName: 'Copiapoa cinerea', status: 'dead', provenance: 'wild', fieldNumber: 'KK 1462' }), ...rec('a2', { acc: '2025-0002', taxonName: 'Aloe vera', status: 'archived', provenance: 'fn' })];
    expect(old.readChanges(r86).dropped).toEqual([]);
    const { changes, dropped } = readChanges(r86);
    expect(dropped).toEqual([]);
    const plants = live(materialise(changes).state, 'accession');
    const [a1, a2] = ['a1', 'a2'].map((id) => identityOf(plants.find((p) => p.id === id)!));
    expect(a1).toMatchObject({ item: null, deacc: null, provType: 'W', provTypeRead: true, propHistory: null, field: { code: 'KK', no: '1462' } });
    expect(a2).toMatchObject({ item: null, deacc: null, provType: null, propHistory: 'S', propHistoryRead: true });
  });
});

describe('r87t1 log 3: a newer version\'s values', () => {
  it('a word or a code this version does not know folds as it is, and reads as not stated', () => {
    const newer = rec('n1', { acc: '2027-0001', taxonName: 'Aloe vera', status: 'growing', deacc: 'sold', provType: 'X', propHistory: 'VC', idLevel: '5', item: 'a1' });
    const { changes, dropped } = readChanges(newer);
    expect(dropped).toEqual([]);
    const r = live(materialise(changes).state, 'accession')[0];
    expect(r).toMatchObject({ deacc: 'sold', provType: 'X' }); // kept, so it is there when this device upgrades
    expect(identityOf(r)).toMatchObject({ deacc: null, provType: null, propHistory: null, idLevel: null, item: null });
  });
  it('a value of the wrong type is left out here, the rest of the batch folded; round eighty-six passes it as an unknown field', () => {
    const bad = [...rec('n2', { acc: '2027-0002', taxonName: 'Aloe vera', status: 'growing' }), ch('accession', 'n2', 'exChain', 'ex Devon'), ch('accession', 'n2', 'collector', 7)];
    const { changes, dropped } = readChanges(bad);
    expect(dropped).toHaveLength(2);
    expect(live(materialise(changes).state, 'accession')).toHaveLength(1);
    expect(old.readChanges(bad).dropped).toEqual([]);
  });
});

describe('r87t1 log 4: no new kind, the fold unmoved', () => {
  it('every change is of a kind round eighty-six knows, and the fold rules are where they were', () => {
    expect([...KINDS]).toEqual([...old.KINDS]);
    for (const c of log) expect(old.KINDS).toContain(c.kind);
    expect(FOLD_RULES).toBe(8);
  });
});
