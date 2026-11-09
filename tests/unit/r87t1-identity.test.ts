/**
 * Round eighty-seven (t1): identity and provenance, the readings of $core/identity (the plan's F1, F2, F3, F6).
 *
 * 1. Field numbers read as a collector's code and a number, the text as typed kept; the BCSS lookup built, not fetched.
 * 2. Partial dates (ITF2 F.27, D.3) in ISO and ITF2's syntax.
 * 3. ITF2's provenance type and propagation history: read from the grower's word only where the definitions coincide;
 *    pairs ITF2 forbids refused.
 * 4. The qualifier in the name read as ITF2's idql and rkql; "sp." is none.
 * 5. Items' letters, the "ex" chain, the identification history, the accession status.
 * 6. Every field validated on read: a value of another shape, a word or code not known, a text past its cap.
 * 7. The log's tables and db/types.ts agree (the words, the codes, the field types).
 *
 * Fails on the base (r85m head): $core/identity does not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFieldNumber, bcssHref, BCSS_LOOKUP, isPartialDate, readPartialDate, itf2Date, provTypeRead, propHistoryRead, itf2Problem, idqlOf, itemLetter, nextItem, splitItemNumber, ITEM_MAX, readExChain, exChainText, exChainOf, idHistoryOf, withEarlierName, vhistText, readVhist, identityOf, accsta, deaccStatus, DEACC_REASONS, PROV_TYPES, PROP_HISTORIES, ID_LEVELS, HISTORY_MAX, EX_MAX, TEXT_MAX, SHEET_COLUMNS, sheetCells, readIdentCells, pickShared, SHARED_FIELDS } from '$core/identity';
import { FIELD_ENUMS, FIELD_TYPES } from '$core/log';

describe('r87t1 1: field numbers as data (F3)', () => {
  it.each([
    ['SB 829', 'SB', '829'],
    ['KK1398', 'KK', '1398'],
    ['MG 1234.5', 'MG', '1234.5'],
    ['Lau 1234', 'Lau', '1234'],
    ['  PP   1/23 ', 'PP', '1/23'],
    ['STO 1002a', 'STO', '1002a'],
    ['L&P 45', 'L&P', '45']
  ])('%s is %s and %s', (raw, code, no) => {
    expect(parseFieldNumber(raw)).toEqual({ code, no });
  });
  it.each(['Mesa Garden', '1234', '', 'ABCDEFGHIJKLMN 12', null, 42])('%s is not read as one, and stands as typed', (raw) => {
    expect(parseFieldNumber(raw)).toBeNull();
  });
  it('the lookup is a link to the BCSS database with the text as typed, built and never asked', () => {
    expect(bcssHref('SB 829')).toBe(`${BCSS_LOOKUP}SB%20829`);
    expect(BCSS_LOOKUP).toBe('https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=');
    expect(bcssHref('A 91/I/10a')).toBe(`${BCSS_LOOKUP}A%2091%2FI%2F10a`);
    expect(bcssHref('')).toBeNull();
    expect(bcssHref(undefined)).toBeNull(); // that the page never asks it is r87t1-identity.spec.ts's 4, by the requests the page makes
  });
});

describe('r87t1 2: partial dates', () => {
  it('a day, a month or a year, of the calendar', () => {
    for (const d of ['2019', '2019-03', '2019-03-07', '2024-02-29', '1850']) expect(isPartialDate(d), d).toBe(true);
    for (const d of ['2019-13', '2019-02-30', '2023-02-29', '19', '1699', '2019-3', 'yesterday', 2019, null]) expect(isPartialDate(d), String(d)).toBe(false);
  });
  it('typed in ISO or ITF2 syntax, written in ITF2 syntax', () => {
    expect(readPartialDate('19851109')).toBe('1985-11-09');
    expect(readPartialDate('198511')).toBe('1985-11');
    expect(readPartialDate(' 1985 ')).toBe('1985');
    expect(readPartialDate('1985-11-31')).toBeNull();
    expect(itf2Date('1985-11-09')).toBe('19851109');
    expect(itf2Date('1985-11')).toBe('198511');
    expect(itf2Date(null)).toBeNull();
  });
});

describe('r87t1 3: ITF2 provenance (F2)', () => {
  it('read from the grower\'s word only where the definitions coincide', () => {
    expect(provTypeRead('wild')).toBe('W');
    expect(provTypeRead('f1')).toBe('W');
    expect(provTypeRead('fn')).toBeNull(); // Z or G: the word does not tell
    expect(provTypeRead('veg')).toBeNull();
    expect(provTypeRead('unknown')).toBeNull(); // not stated is not U
    expect(propHistoryRead('f1')).toBe('S');
    expect(propHistoryRead('veg')).toBe('V');
    expect(propHistoryRead('wild')).toBeNull(); // I or VA
  });
  it('a pair ITF2 forbids, or one the provenance word contradicts, is refused with a reason', () => {
    expect(itf2Problem('unknown', 'W', 'U')).toMatch(/rule 6/);
    expect(itf2Problem('unknown', 'G', 'I')).toMatch(/rule 7/);
    expect(itf2Problem('fn', 'W', null)).toMatch(/does not go with/);
    expect(itf2Problem('wild', 'G', null)).toMatch(/does not go with/);
    expect(itf2Problem('veg', null, 'SA')).toMatch(/does not go with/);
    expect(itf2Problem('wild', null, 'S')).toMatch(/F1/);
    for (const [p, t, h] of [['wild', 'W', 'I'], ['f1', 'W', 'SA'], ['fn', 'Z', 'S'], ['veg', 'W', 'VA'], ['veg', 'G', 'V'], ['unknown', 'U', 'U'], ['unknown', null, null]] as const) expect(itf2Problem(p, t, h), `${p} ${t} ${h}`).toBeNull();
  });
});

describe('r87t1 4: the qualifier in the name, as ITF2 sends it (F6)', () => {
  it.each([
    ['Mammillaria cf. bombycina', 'cf.'],
    ['Cypripedium aff. candidum', 'aff.'],
    ['cf. Mammillaria bombycina', 'cf.'],
    ['Copiapoa nr. cinerea', 'near'],
    ['Lithops vel aff. lesliei', 'aff.']
  ])('%s: idql %s, rank S', (name, idql) => {
    expect(idqlOf(name)).toEqual({ idql, rkql: 'S' });
  });
  it('"sp." and a plain name have none', () => {
    expect(idqlOf('Lithops sp. C 036')).toBeNull();
    expect(idqlOf('Copiapoa cinerea')).toBeNull();
  });
});

describe('r87t1 5: items, the ex chain, earlier names, the status', () => {
  it('letters A to Z, then AA to ZZ; the next free one; an item number split', () => {
    expect([0, 1, 25, 26, 27, 51, 52, ITEM_MAX - 1].map(itemLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ']);
    const taken = new Set(['2026-0012/A', '2026-0012/B']);
    expect(nextItem('2026-0012', (n) => taken.has(n))).toBe('C');
    expect(nextItem('2026-0012', () => true)).toBeNull();
    expect(splitItemNumber('2026-0012/AB')).toEqual({ base: '2026-0012', item: 'AB' });
    expect(splitItemNumber('2026-0012')).toBeNull();
    expect(splitItemNumber('2026-0012/a')).toBeNull();
  });
  it('items share the name and provenance, not the place, the status or the notes', () => {
    const shared = pickShared({ taxonName: 'Aloe vera', provType: 'W', collector: 'X', locationId: 'l1', status: 'dead', notes: 'n', price: '5', deacc: 'died', cover: 'p1' });
    expect(shared).toEqual({ taxonName: 'Aloe vera', provType: 'W', collector: 'X' });
    for (const own of ['acc', 'item', 'itemOf', 'locationId', 'status', 'notes', 'price', 'cover', 'waterDays', 'deacc', 'deaccOn', 'deaccNote', 'importKey']) expect(SHARED_FIELDS as readonly string[]).not.toContain(own);
  });
  it('an ex chain typed either way, said one way', () => {
    expect(readExChain('ex Devon, ex Mesa Garden')).toEqual(['Devon', 'Mesa Garden']);
    expect(readExChain('Devon; Mesa Garden')).toEqual(['Devon', 'Mesa Garden']);
    expect(readExChain('ex Smith, J., ex Essex Cacti')).toEqual(['Smith, J.', 'Essex Cacti']);
    expect(exChainText(['Devon', 'Mesa Garden'])).toBe('ex Devon, ex Mesa Garden');
    expect(readExChain(exChainText(['Devon', 'Mesa Garden']))).toEqual(['Devon', 'Mesa Garden']);
    expect(readExChain(Array.from({ length: 20 }, (_, i) => `ex H${i}`).join(', '))).toHaveLength(EX_MAX);
  });
  it('a rename keeps the name it had, the day it stopped and how it had been identified', () => {
    const h = withEarlierName(null, { taxonName: 'Mammillaria cf. bombycina', cultivar: null, idLevel: '1', idBy: 'Hunt, D.', idOn: '2019' }, '2026-11-09');
    expect(h).toEqual([{ name: 'Mammillaria cf. bombycina', until: '2026-11-09', idLevel: '1', idBy: 'Hunt, D.', idOn: '2019' }]);
    const h2 = withEarlierName(h, { taxonName: 'Mammillaria bombycina', cultivar: 'Pink' }, '2026-12-01');
    expect(h2.map((e) => e.name)).toEqual(['Mammillaria cf. bombycina', "Mammillaria bombycina 'Pink'"]);
    expect(readVhist(vhistText(h2))).toEqual(h2);
    let long: unknown = null;
    for (let i = 0; i < HISTORY_MAX + 5; i++) long = withEarlierName(long, { taxonName: `Aloe n${i}` }, '2026-01-01');
    expect(idHistoryOf(long)).toHaveLength(HISTORY_MAX);
    expect(idHistoryOf(long).at(-1)!.name).toBe(`Aloe n${HISTORY_MAX + 4}`);
  });
  it('ITF2\'s accession status from the deaccession, and the status it sets', () => {
    expect(accsta({ status: 'growing' })).toBe('C');
    expect(accsta({ status: 'archived' })).toBe('C');
    expect(accsta({ status: 'dead' })).toBe('D');
    expect(accsta({ status: 'dead', deacc: 'died' })).toBe('D');
    expect(accsta({ status: 'archived', deacc: 'given' })).toBe('T');
    for (const r of ['lost', 'stolen', 'reaccessioned'] as const) expect(accsta({ status: 'archived', deacc: r })).toBe('O');
    expect(DEACC_REASONS.map(deaccStatus)).toEqual(['dead', 'archived', 'archived', 'dead', 'archived', 'archived']);
  });
});

describe('r87t1 6: validated on read', () => {
  it('a record of an older version reads as nothing stated, the type read from its word', () => {
    const x = identityOf({ taxonName: 'Copiapoa cinerea', provenance: 'wild', fieldNumber: 'KK 1462' });
    expect(x).toMatchObject({ item: null, itemOf: null, deacc: null, provType: 'W', provTypeRead: true, propHistory: null, collector: null, collected: null, idLevel: null, exChain: [], clone: null, idHistory: [], field: { code: 'KK', no: '1462' } });
  });
  it('a value of another shape, a word or code not known, a text past its cap: not stated', () => {
    const x = identityOf({ item: 'a', itemOf: 7, deacc: 'sold', deaccOn: '2026-02-30', deaccNote: 'x'.repeat(5000), provType: 'X', propHistory: 'IS', collector: { a: 1 }, collected: '1985-13', idLevel: '5', idBy: 'y'.repeat(500), idOn: 20190101, exChain: 'ex Devon', clone: ['a'], idHistory: [{ name: 'A b' }, 'x', null, { name: 'Aloe vera', until: '2020' }, { name: 3, until: '2020' }] });
    expect(x).toMatchObject({ item: null, itemOf: null, deacc: null, deaccOn: null, provType: null, propHistory: null, collector: null, collected: null, idLevel: null, idOn: null, exChain: [], clone: null });
    expect(x.deaccNote).toHaveLength(1000);
    expect(x.idBy).toHaveLength(TEXT_MAX);
    expect(x.idHistory).toEqual([{ name: 'Aloe vera', until: '2020' }]);
    expect(exChainOf(['Devon', 3, '', null, 'z'.repeat(300)])).toEqual(['Devon', 'z'.repeat(80)]);
  });
});

describe('r87t1 7: the sheet\'s columns, read back', () => {
  it('each column a cell, ITF2\'s dates in its syntax, the verifier only for a level above 0', () => {
    const a = { taxonName: 'Mammillaria cf. bombycina', status: 'archived', deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club', provenance: 'f1', fieldNumber: 'SB 829', collector: 'Brack, S.', collected: '1985-11', idLevel: '2', idBy: 'Hunt, D.', idOn: '2019-03-07', exChain: ['Devon', 'Mesa Garden'], clone: 'A', itemOf: 'r1' };
    const cells = Object.fromEntries(SHEET_COLUMNS.map((c, i) => [c, sheetCells(a, '2026-0012')[i]]));
    expect(cells).toEqual({ 'item of': '2026-0012', accsta: 'T', 'no longer held': 'given away', 'no longer held on': '2026-05-01', 'no longer held note': 'to the club', prot: 'W', prohis: 'S', cnam: 'Brack, S.', cid: '829', 'field code': 'SB', cdat: '198511', idql: 'cf.', rkql: 'S', vlev: '2', vnam: 'Hunt, D.', vdat: '20190307', vhist: null, ex: 'ex Devon, ex Mesa Garden', clone: 'A' });
    expect(sheetCells({ ...a, idLevel: '0' }, null)[SHEET_COLUMNS.indexOf('vnam')]).toBeNull();
  });
  it('read back as the forms read them; what cannot be read said and kept in the notes', () => {
    const ok = readIdentCells({ provType: 'w', propHistory: 'sa', collector: 'Brack, S.', collected: '198511', idLevel: '2', idBy: 'Hunt, D.', idOn: '20190307', exChain: 'ex Devon, ex Mesa Garden', clone: 'A', deacc: 'Given away', deaccOn: '2026-05-01', deaccNote: 'to the club', idHistory: 'Aloe vera, until 2020-01-01, vlev 1' }, 'f1');
    expect(ok.problems).toEqual([]);
    expect(ok.fields).toEqual({ provType: 'W', propHistory: 'SA', collector: 'Brack, S.', collected: '1985-11', idLevel: '2', idBy: 'Hunt, D.', idOn: '2019-03-07', exChain: ['Devon', 'Mesa Garden'], clone: 'A', deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club', idHistory: [{ name: 'Aloe vera', until: '2020-01-01', idLevel: '1' }] });
    const bad = readIdentCells({ provType: 'Q', collected: 'spring 85', deacc: 'sold', idLevel: '9' }, 'unknown');
    expect(bad.fields).toEqual({});
    expect(bad.problems).toHaveLength(4);
    expect(bad.kept).toEqual(['Provenance type: Q', 'Verification level: 9', 'Collected: spring 85', 'No longer held: sold']);
    const clash = readIdentCells({ provType: 'G' }, 'wild');
    expect(clash.fields).toEqual({});
    expect(clash.kept).toEqual(['ITF2 codes: G']);
  });
});

describe('r87t1 8: the log\'s tables and db/types.ts agree', () => {
  const types = readFileSync('src/lib/db/types.ts', 'utf8');
  const union = (name: string) => { const m = new RegExp(`export type ${name} = ([^;]+);`).exec(types); if (!m) throw new Error(name); return [...m[1].matchAll(/'([A-Za-z0-9]+)'/g)].map((x) => x[1]); };
  it('the words and codes', () => {
    expect(FIELD_ENUMS.accession!.deacc).toEqual([...DEACC_REASONS]);
    expect(union('DeaccReason')).toEqual([...DEACC_REASONS]);
    expect(FIELD_ENUMS.accession!.provType).toEqual([...PROV_TYPES]);
    expect(union('ProvType')).toEqual([...PROV_TYPES]);
    expect(FIELD_ENUMS.accession!.propHistory).toEqual([...PROP_HISTORIES]);
    expect(union('PropHistory')).toEqual([...PROP_HISTORIES]);
    expect(FIELD_ENUMS.accession!.idLevel).toEqual([...ID_LEVELS]);
    expect(union('IdLevel')).toEqual([...ID_LEVELS]);
  });
  it('the field types', () => {
    for (const f of ['item', 'itemOf', 'deacc', 'deaccOn', 'deaccNote', 'provType', 'propHistory', 'collector', 'collected', 'idLevel', 'idBy', 'idOn', 'clone']) expect(FIELD_TYPES.accession[f], f).toBe('string');
    expect(FIELD_TYPES.accession.exChain).toBe('array');
    expect(FIELD_TYPES.accession.idHistory).toBe('array');
  });
});
