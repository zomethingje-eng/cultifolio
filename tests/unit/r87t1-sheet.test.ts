/**
 * Round eighty-seven (t1): identity and provenance through the plants sheet, the import and a backup.
 *
 * 1. The plants sheet a backup carries (and "Download as a spreadsheet") writes every field under ITF2's column names
 *    where ITF2 has one, and the app's own import reads them back to the same record.
 * 2. The columns that restate others (the accession status, the qualifier and rank, the field number's code and number,
 *    an item's accession) are listed apart on import, never put in the notes.
 * 3. A sheet imported before this round, with a "Collector" column that no field took, gives the same import key now
 *    that the column is a field: its plants are found again, not added twice.
 * 4. An old backup (round eighty's, 300 plants) restores and reads: no plant has an identity field it never had, and its
 *    sheet is written.
 * 5. A cell that cannot be read is said on its row and kept in the notes.
 *
 * Fails on the base (r85m head): the sheet has none of the columns, and $core/identity does not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { plantsCsv, readBackup } from '$lib/backup/backup';
import { parseCsv, detectHeader, guessMapping, unmappedColumns } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { recordOf } from '$lib/import/commit';
import { materialise, live, type Record_ } from '$core/log';
import { identityOf, SHEET_COLUMNS } from '$core/identity';
import type { Accession } from '$lib/db/types';

const plant = (id: string, acc: string, f: Record<string, unknown>) => ({ kind: 'accession', id, acc, taxonName: 'Lithops lesliei', status: 'growing', provenance: 'unknown', ...f }) as unknown as Accession & Record_;
const IDENT = { provenance: 'f1', fieldNumber: 'SB 829', provType: 'W', propHistory: 'SA', collector: 'Brack, S.', collected: '1985-11', idLevel: '2', idBy: 'Hunt, D.', idOn: '2019-03-07', exChain: ['Devon', 'Mesa Garden'], clone: 'A', idHistory: [{ name: 'Lithops cf. lesliei', until: '2026-11-01', idLevel: '1' }] };

describe('r87t1 sheet 1: written and read back', () => {
  const base = plant('r1', '2026-0012', { ...IDENT, taxonName: 'Lithops cf. lesliei' });
  const item = plant('r2', '2026-0012/A', { ...IDENT, taxonName: 'Lithops cf. lesliei', item: 'A', itemOf: 'r1' });
  const gone = plant('r3', '2026-0013', { taxonName: 'Aloe vera', status: 'archived', deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club sale' });
  const state = new Map<string, Record_>([['accession:r1', base], ['accession:r2', item], ['accession:r3', gone]]);
  const text = plantsCsv([base, item, gone], state);
  const sheet = parseCsv(text);
  it('every column, by its ITF2 name, before the record id', () => {
    const head = sheet[0];
    // In one run, in ITF2's order, among the plants sheet's one column table; the record id still last (the stage-3
    // integration put t3's season and photograph columns after them, so they are no longer the last before the id).
    const at = head.indexOf(SHEET_COLUMNS[0]);
    expect(head.slice(at, at + SHEET_COLUMNS.length)).toEqual([...SHEET_COLUMNS]);
    expect(head.at(-1)).toBe('id');
    const row = (no: string) => Object.fromEntries(head.map((h, i) => [h, sheet.find((r) => r[0] === no)![i]]));
    expect(row('2026-0012')).toMatchObject({ accsta: 'C', prot: 'W', prohis: 'SA', cnam: 'Brack, S.', cid: '829', 'field code': 'SB', cdat: '198511', idql: 'cf.', rkql: 'S', vlev: '2', vnam: 'Hunt, D.', vdat: '20190307', ex: 'ex Devon, ex Mesa Garden', clone: 'A', 'item of': '' });
    expect(row('2026-0012/A')['item of']).toBe('2026-0012');
    expect(row('2026-0013')).toMatchObject({ accsta: 'T', 'no longer held': 'given away', 'no longer held on': '2026-05-01', 'no longer held note': 'to the club sale', status: 'archived' });
  });
  it('the import reads each field back to the record as it was, and puts nothing in the notes', () => {
    expect(detectHeader(sheet)).toBe(true);
    const m = guessMapping(sheet, true);
    const { rows } = rowsFromSheet(sheet, m, true, '2026-11-09');
    const byNo = new Map(rows.map((r) => [r.number, r]));
    const r1 = byNo.get('2026-0012')!;
    expect(r1.problems).toEqual([]);
    expect(r1.notes).toBeNull();
    const rec = recordOf(r1, undefined, null) as Record<string, unknown>;
    for (const k of ['provType', 'propHistory', 'collector', 'collected', 'idLevel', 'idBy', 'idOn', 'exChain', 'clone', 'idHistory', 'fieldNumber', 'provenance']) expect(rec[k], k).toEqual((IDENT as Record<string, unknown>)[k]);
    const r3 = recordOf(byNo.get('2026-0013')!, undefined, null) as Record<string, unknown>;
    expect(r3).toMatchObject({ deacc: 'given', deaccOn: '2026-05-01', deaccNote: 'to the club sale', status: 'archived' });
    expect(byNo.get('2026-0012/A')!.notes).toBeNull();
  });
});

describe('r87t1 sheet 2: the columns that restate others', () => {
  it('are listed apart, not added to the notes', () => {
    const sheet = parseCsv(plantsCsv([plant('r1', '2026-0001', { fieldNumber: 'KK 1462', taxonName: 'Aloe cf. vera' })], new Map()));
    const u = unmappedColumns(sheet, guessMapping(sheet, true), true);
    expect(u.extra).toEqual([]);
    expect(u.restated.sort()).toEqual(['accsta', 'cid', 'field code', 'idql', 'rkql']);
    expect(u.own).toEqual(['id']);
  });
  it('a sheet with ITF2\'s cid alone takes it as the field number', () => {
    const sheet = [['species', 'cid', 'cnam'], ['Aloe vera', 'KK 1462', 'Kaiser, K.']];
    const { rows } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-11-09');
    expect(rows[0]).toMatchObject({ fieldNumber: 'KK 1462', ident: { collector: 'Kaiser, K.' } });
  });
});

describe('r87t1 sheet 3: a sheet imported before this round finds its plants again', () => {
  it('a "Collector" column gives the same import key as a field as it gave as a column no field took', () => {
    const sheet = [['Name', 'Collector', 'Locality', 'Ex'], ['Lithops lesliei', 'Brack, S.', 'Kimberley', 'ex Devon'], ['Lithops karasmontana', '', 'Aus', '']];
    const now = guessMapping(sheet, true);
    expect(now.collector).toBe(1);
    expect(now.exChain).toBe(3);
    const before = { ...now };
    delete before.collector;
    delete before.exChain; // round eighty-six had no such fields: both were columns no field takes
    const a = rowsFromSheet(sheet, now, true, '2026-11-09').rows;
    const b = rowsFromSheet(sheet, before, true, '2026-11-09').rows;
    expect(a.map((r) => r.importKeys)).toEqual(b.map((r) => r.importKeys));
    expect(a.map((r) => r.importKeysBare)).toEqual(b.map((r) => r.importKeysBare));
    // Now a field, not a note: the collector is in its field, the locality still in the notes.
    expect(a[0].notes).toBe('Locality: Kimberley');
    expect(a[0].ident).toEqual({ collector: 'Brack, S.', exChain: ['Devon'] });
  });
});

describe('r87t1 sheet 4: an old backup restores', () => {
  it('round eighty\'s backup of 300 plants reads, every plant whole, none with a field it never had, and its sheet is written', async () => {
    const file = await readBackup(new Uint8Array(readFileSync('tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip')));
    const { state } = materialise(file.changes);
    const plants = live<Accession & Record_>(state, 'accession');
    expect(plants.length).toBeGreaterThanOrEqual(300);
    for (const p of plants) {
      const x = identityOf(p);
      expect(x.item ?? x.itemOf ?? x.deacc ?? x.collector ?? x.collected ?? x.idLevel ?? x.clone, p.id).toBeNull();
      expect(x.exChain.length + x.idHistory.length).toBe(0);
    }
    const sheet = parseCsv(plantsCsv(plants, state));
    expect(sheet).toHaveLength(plants.length + 1);
    expect(sheet[0]).toContain('accsta');
  });
});

describe('r87t1 sheet 5: what cannot be read', () => {
  it('is said on its row and kept in the notes; a deaccession sets its status', () => {
    const sheet = [['species', 'prot', 'cdat', 'no longer held', 'no longer held on'], ['Aloe vera', 'Q', 'spring 1985', 'Died', '2026-03']];
    const { rows } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-11-09');
    expect(rows[0].problems).toHaveLength(2);
    expect(rows[0].notes).toBe('Provenance type: Q\nCollected: spring 1985');
    expect(rows[0].ident).toEqual({ deacc: 'died', deaccOn: '2026-03' });
    expect(rows[0].status).toBe('dead');
  });
});
