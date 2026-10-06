/**
 * records review, round sixty: the plants.csv a backup writes, with values a grower really keeps, through the `="…"`
 * form and the formula guard, and back through the app's own import (src/lib/import/csv.ts, rows.ts, commit.ts recordOf).
 *
 * Mixed file. Tests marked FAILS reproduce a finding on commit 21257b7; tests marked PASSES guard behaviour that is right.
 * Run: npx vitest run tests/unit/records--csv-roundtrip.test.ts
 * With RECORDS_CSV_OUT=/some/dir it also writes the sheet there, for opening in LibreOffice.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { plantsCsv } from '$lib/backup/backup';
import { parseCsv, detectHeader, guessMapping, cellText } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { recordOf } from '$lib/import/commit';
import { splitPath } from '$lib/import/plan';
import type { Record_ } from '$core/log';
import type { Accession } from '$lib/db/types';

const plant = (id: string, acc: string, f: Partial<Accession>) => ({ kind: 'accession', id, acc, taxonName: 'Copiapoa cinerea', status: 'growing', provenance: 'unknown', ...f }) as unknown as Accession & Record_;
const state = new Map<string, Record_>();
/** The sheet's cell for one plant's lot (`lot or reference`, column 13), as written. */
function lotCell(v: string): string {
  const text = plantsCsv([plant('r1', '2026-0001', { sourceRef: v })], state);
  return parseCsv(text)[1][12];
}
const back = (accs: Array<Accession & Record_>) => {
  const sheet = parseCsv(plantsCsv(accs, state));
  expect(detectHeader(sheet)).toBe(true);
  return rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-05').rows;
};

describe('csvCell: the ="…" form where a spreadsheet would change the text (PASSES: what the round wrote it for)', () => {
  it.each(['0012', '00042', '3-12', '1/2', '1E5', '1e-3', '12345678901234567'])('%s is written ="…" and read back as written', (v) => {
    expect(lotCell(v)).toBe(`="${v}"`);
    expect(cellText(lotCell(v))).toBe(v);
  });
  it.each(['=SUM(1,2)', '-', '-5 °C', '+44 20 7946 0000', '@home', '＝1'])('%s keeps its guard apostrophe and reads back as written', (v) => {
    expect(lotCell(v)).toBe(`'${v}`);
    expect(cellText(lotCell(v))).toBe(v);
  });
  it.each(['FR 1234', 'Copiapoa', '2026-0001', 'S2026-001', '12', '0'])('%s is written bare', (v) => {
    expect(lotCell(v)).toBe(v);
  });
});

describe('csvCell misses text Excel and Google Sheets turn into a date or a number (FAILS: finding 5)', () => {
  // Each of these is a date or number to Excel and to Google Sheets' CSV import, by their documented parsing: a year and a
  // month, a day-month-year, a 12 to 15 digit run (shown as 1.23457E+11 in a General cell, and saved back that way).
  it.each(['2026-01', '2024-03', '3-12-2024', '1/2/24', '123456789012', '123456789012345'])('%s should be written ="…"', (v) => {
    expect(lotCell(v)).toBe(`="${v}"`);
  });
  it('a plant number under a two-digit scheme (Settings allows width 2: 2026-01 to 2026-12) is a month to a spreadsheet', () => {
    const text = plantsCsv([plant('r1', '2026-01', {})], state);
    expect(parseCsv(text)[1][0]).toBe('="2026-01"');
  });
});

describe('the app reads its own plants.csv back', () => {
  it('PASSES: tricky text in every free-text column survives the round trip', () => {
    const vals = { cultivar: 'Snow ‘White’', fieldNumber: '0012', sourceRef: '3-12', sourceForm: '1E5', sourceFrom: 'Club, "spring" sale', price: '£12.50', notes: '=HYPERLINK("http://x")\r\nline two, with a comma', nameAsReceived: 'Copiapoa cinerea var. 𝒜lba', parentage: null };
    const [r] = back([plant('r1', '2026-0001', vals as Partial<Accession>)]);
    expect(r).toMatchObject({ cultivar: 'Snow ‘White’', fieldNumber: '0012', lot: '3-12', form: '1E5', source: 'Club, "spring" sale', price: '£12.50', nameAsReceived: 'Copiapoa cinerea var. 𝒜lba' });
    expect(r.notes).toBe('=HYPERLINK("http://x")\nline two, with a comma'.replace('\n', '\r\n'));
  });
  it('FAILS (finding 6): a note that is literally ="0012" comes back as 0012: the apostrophe is taken off, then the ="…" unwrapped', () => {
    const [r] = back([plant('r1', '2026-0001', { notes: '="0012"' })]);
    expect(r.notes).toBe('="0012"');
  });
  it('FAILS (finding 6): a value that begins with an apostrophe and a formula sign loses the apostrophe', () => {
    const [r] = back([plant('r1', '2026-0001', { notes: "'=not a formula" })]);
    expect(r.notes).toBe("'=not a formula");
  });
  it('FAILS (finding 6): leading and trailing white space and a final line break are trimmed off every cell', () => {
    const [r] = back([plant('r1', '2026-0001', { notes: 'kept\n', cultivar: ' Lime ' })]);
    expect(r.notes).toBe('kept\n');
  });
  it('FAILS (finding 7): a place whose name holds " › " or ">" comes back as a deeper path, so the import would make new places', () => {
    const st = new Map<string, Record_>([['location:g', { kind: 'location', id: 'g', name: 'Shelf >1 m', parentId: null } as unknown as Record_]]);
    const sheet = parseCsv(plantsCsv([plant('r1', '2026-0001', { locationId: 'g' })], st));
    const [r] = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-05').rows;
    expect(splitPath(r.placePath!)).toEqual(['Shelf >1 m']);
  });
  it('PASSES: two plants sharing a number are two rows, told apart by the id column', () => {
    const text = plantsCsv([plant('ra', '2026-0007', {}), plant('rb', '2026-0007', { cultivar: 'B' })], state);
    const rows = parseCsv(text);
    expect(rows[0].at(-1)).toBe('id');
    expect(rows.slice(1).map((r) => r.at(-1)).sort()).toEqual(['ra', 'rb']);
  });
  it('PASSES: recordOf files a hybrid, a cultivar in quotes and a genus-only name as the add form would', () => {
    const [r] = back([plant('r1', '2026-0001', { taxonName: 'Copiapoa', nameKind: 'hybrid' as Accession['nameKind'] })]);
    expect(recordOf(r, undefined, null)).toMatchObject({ taxonName: 'Copiapoa', nameKind: 'hybrid' });
  });
  it('writes the tricky sheet for LibreOffice when asked', () => {
    const out = process.env.RECORDS_CSV_OUT;
    if (!out) return;
    const vals = ['0012', '00042', '3-12', '1/2', '1E5', '12345678901234567', '2026-01', '2024-03', '3-12-2024', '1/2/24', '123456789012', '12.50', 'TRUE', '-', '+44 20', '=SUM(1,2)', '(5)', '5%', '1,200'];
    writeFileSync(`${out}/plants.csv`, plantsCsv(vals.map((v, i) => plant(`r${i}`, `2026-${String(i + 1).padStart(4, '0')}`, { sourceRef: v })), state));
    writeFileSync(`${out}/values.json`, JSON.stringify(vals));
  });
});
