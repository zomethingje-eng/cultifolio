/**
 * Round eighty-seven, stage 3 (t2): the lineage through the backup, its sheets and the import.
 *
 * 1. The backup carries every new field in its changes file (the log whole), and a backup without them restores.
 * 2. plants.csv: "taken from" (the mother's number; removed, still its number; one this file holds no plant under, its
 *    id; a value that is no id, nothing) and "taken as". events.csv: a cross's pollen parent, a graft's scion and stock
 *    plants, by number, on their own kinds of line only; a fruit line as "Set fruit". batches.csv: the cross ("seed ×
 *    pollen, day") and a graft batch's stock plant.
 * 3. The import reads "taken from" and "taken as" back from the backup's own sheet; a word for how that is not one of
 *    the five is kept in the notes and said; a sheet without the two columns keys its lines as before.
 *
 * Fails on the base (r87s2 head): the columns are not written or read.
 */
import { describe, it, expect } from 'vitest';
import { materialise, live, type Change, type Record_ } from '$core/log';
import { plantsCsv, eventsCsv, batchesCsv, buildBackup, readBackup } from '$lib/backup/backup';
import { parseCsv, guessMapping, detectHeader, fieldOfHeader } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import type { Accession, PlantEvent, Sowing } from '$lib/db/types';

const W = 'aaaaaaaaaaaa';
let wall = 1789520000000;
const ch = (kind: string, id: string, field: string, value: unknown): Change => ({ t: `${wall++}-0000-${W}`, kind, id, field, value } as Change);
const rec = (kind: string, id: string, fields: Record<string, unknown>): Change[] => Object.entries(fields).map(([f, v]) => ch(kind, id, f, v));
const plant = (id: string, no: string, name: string, more: Record<string, unknown> = {}) => rec('accession', id, { acc: no, taxonName: name, status: 'growing', ...more });

const LOG: Change[] = [
  ...plant('rA', '2026-0001', 'Ariocarpus retusus'),
  ...plant('rB', '2026-0002', 'Ariocarpus trigonus'),
  ...rec('event', 'eX', { acc: 'rA', d: '2026-04-02', t: 'pollinate', pollen: 'rB' }),
  ...rec('event', 'eF', { acc: 'rA', d: '2026-05-10', t: 'fruit' }),
  ...rec('event', 'eN', { acc: 'rA', d: '2026-05-11', t: 'note', pollen: 'rB' }), // a field on a kind of line that does not take it: not a cross
  ...rec('sowing', 's1', { no: 'S2026-001', taxonName: 'Ariocarpus retusus', method: 'seed', sown: '2026-07-20', count: 40, status: 'active', cross: 'eX' }),
  ...rec('sowing', 's2', { no: 'S2026-002', taxonName: 'Ariocarpus trigonus', method: 'graft', parentAcc: 'rB', stockAcc: 'rE', sown: '2026-06-03', count: 3, status: 'active' }),
  ...plant('rD', '2026-0004', 'Ariocarpus retusus', { motherAcc: 'rA', motherHow: 'offset' }),
  ...plant('rE', '2026-0005', 'Pereskiopsis spathulata'),
  ...plant('rG', '2026-0006', 'Ariocarpus trigonus'),
  ...rec('event', 'eG', { acc: 'rG', d: '2026-06-01', t: 'graft', scion: 'rB', stock: 'rE' }),
  ...plant('rH', '2026-0007', 'Ariocarpus retusus', { motherAcc: 'r-elsewhere', motherHow: 'division' }),
  ...plant('rJ', '2026-0008', 'Ariocarpus retusus', { motherAcc: 'rZ', motherHow: 'cutting' }),
  ...plant('rZ', '2026-0009', 'Ariocarpus retusus'),
  ch('accession', 'rZ', '_deleted', true)
];
const { state } = materialise(LOG);
const rows = (csv: string) => parseCsv(csv);
const col = (sheet: string[][], name: string) => sheet[0].indexOf(name);

describe('r87t2 sheets 1: the backup carries the fields, and an old one restores', () => {
  it('every change, read back as written', async () => {
    const { bytes } = await buildBackup({ changes: LOG, readPhoto: async () => null });
    const r = await readBackup(bytes);
    expect(r.changes).toEqual(LOG);
  });
  it('a backup of round eighty-six\'s shape (none of the fields) restores whole', async () => {
    const before = [...plant('r1', '2025-0001', 'Aloe vera'), ...rec('event', 'p1', { acc: 'r1', d: '2025-04-01', t: 'pollinate' })];
    const { bytes } = await buildBackup({ changes: before, readPhoto: async () => null });
    expect((await readBackup(bytes)).changes).toEqual(before);
  });
});

describe('r87t2 sheets 2: the columns', () => {
  it('plants.csv: taken from, by number, and taken as', () => {
    const sheet = rows(plantsCsv(live<Accession & Record_>(state, 'accession'), state));
    const from = col(sheet, 'taken from'), as = col(sheet, 'taken as');
    expect(as).toBe(from + 1); // side by side in the one column table; t3's season and photograph columns follow them (stage-3 integration)
    expect(sheet[0].at(-1)).toBe('id');
    const by = (no: string) => sheet.find((r) => r[0] === no)!;
    expect([by('2026-0004')[from], by('2026-0004')[as]]).toEqual(['2026-0001', 'offset']);
    expect([by('2026-0007')[from], by('2026-0007')[as]]).toEqual(['r-elsewhere', 'division']); // no plant here under it: its id
    expect(by('2026-0008')[from]).toBe('2026-0009'); // the mother removed: still its number
    expect([by('2026-0001')[from], by('2026-0001')[as]]).toEqual(['', '']);
  });
  it('a value that is no record id writes no cell, and no how without it', () => {
    const odd = materialise([...plant('rQ', '2026-0010', 'Aloe vera', { motherHow: 'offset' }), ch('accession', 'rQ', 'motherAcc', 'rQ')]).state;
    const sheet = rows(plantsCsv(live<Accession & Record_>(odd, 'accession'), odd));
    expect([sheet[1][col(sheet, 'taken from')], sheet[1][col(sheet, 'taken as')]]).toEqual(['', '']);
  });
  it('events.csv: the pollen parent, the scion and the stock, on their own lines only; fruit set by its label', () => {
    const sheet = rows(eventsCsv(live<PlantEvent & Record_>(state, 'event'), state));
    const p = col(sheet, 'pollen parent'), sc = col(sheet, 'scion from'), st = col(sheet, 'stock');
    expect(sheet[0].slice(-4)).toEqual(['pollen parent', 'scion from', 'stock', 'record id']);
    const by = (entry: string) => sheet.find((r) => r[3] === entry)!;
    expect(by('Pollinated')[p]).toBe('2026-0002');
    expect([by('Grafted')[sc], by('Grafted')[st]]).toEqual(['2026-0002', '2026-0005']);
    expect(by('Note')[p]).toBe('');
    expect(by('Set fruit')[0]).toBe('2026-05-10');
  });
  it('batches.csv: the cross, seed parent first, and the stock plant', () => {
    const sheet = rows(batchesCsv(live<Sowing & Record_>(state, 'sowing'), state));
    expect(sheet[0].slice(-3)).toEqual(['cross', 'stock plant', 'id']);
    const by = (no: string) => sheet.find((r) => r[0] === no)!;
    expect(by('S2026-001')[col(sheet, 'cross')]).toBe('2026-0001 × 2026-0002, 2026-04-02');
    expect(by('S2026-002')[col(sheet, 'stock plant')]).toBe('2026-0005');
    expect(by('S2026-002')[col(sheet, 'cross')]).toBe('');
  });
});

describe('r87t2 sheets 3: the import reads them back', () => {
  it('the backup\'s headers map to the two fields', () => {
    expect(fieldOfHeader('taken from')).toBe('mother');
    expect(fieldOfHeader('Taken as')).toBe('motherHow');
    const sheet = rows(plantsCsv(live<Accession & Record_>(state, 'accession'), state));
    expect(detectHeader(sheet)).toBe(true);
    const m = guessMapping(sheet, true);
    expect([m.mother, m.motherHow]).toEqual([col(sheet, 'taken from'), col(sheet, 'taken as')]);
    const read = rowsFromSheet(sheet, m, true, '2026-11-09').rows;
    const r = read.find((x) => x.number === '2026-0004')!;
    expect([r.mother, r.motherHow, r.problems]).toEqual(['2026-0001', 'offset', []]);
  });
  it('a word for how that is not one of the five is kept in the notes and said', () => {
    const sheet = parseCsv('species,taken from,taken as\nAloe vera,2026-0001,air layer\nAloe ferox,,offset\n');
    const read = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-11-09').rows;
    expect(read[0].motherHow ?? null).toBeNull();
    expect(read[0].notes).toContain('Taken as: air layer');
    expect(read[0].problems.join(' ')).toMatch(/is not offset, cutting, division, leaf or bulbil/);
    expect(read[1].problems.join(' ')).toMatch(/no plant it was taken from/);
  });
  it('a sheet without the two columns keys its lines as one with them empty', () => {
    const a = parseCsv('species,acquired,notes\nAloe vera,2024-05-01,south bench\n');
    const b = parseCsv('species,acquired,notes,taken from,taken as\nAloe vera,2024-05-01,south bench,,\n');
    const ka = rowsFromSheet(a, guessMapping(a, true), true, '2026-11-09').rows[0].importKeys;
    const kb = rowsFromSheet(b, guessMapping(b, true), true, '2026-11-09').rows[0].importKeys;
    expect(kb).toEqual(ka);
    const c = parseCsv('species,acquired,notes,taken from\nAloe vera,2024-05-01,south bench,2026-0001\n');
    expect(rowsFromSheet(c, guessMapping(c, true), true, '2026-11-09').rows[0].importKeys).not.toEqual(ka); // a line that names its mother is another line
  });
});
