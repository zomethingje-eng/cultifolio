/**
 * Grower review of round sixty: what an import of a real grower's sheet loses or changes without a word.
 *
 * STATUS: every test here FAILS on 21257b7 (each is a reproduction). They pass once the fix named in each describe lands.
 * Run (from the repo, with this file copied to tests/unit/): npx vitest run tests/unit/grower--import-loss.test.ts
 *
 * Checked without vitest against the main checkout with tsx (same imports, same inputs): every expectation below is
 * contradicted by the current code's output, quoted in the comment beside it.
 */
import { describe, it, expect } from 'vitest';
import { parseName } from '$core/names';
import { detectHeader, guessMapping, parseCsv, readDate } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';

describe('a qualifier the grower wrote is kept (finding 1)', () => {
  // Today: "Mammillaria cf. bombycina" → scientific "Mammillaria bombycina"; "Turbinicarpus aff. alonsoi" → "Turbinicarpus alonsoi";
  // "Lithops sp. C 036" → "Lithops C 036"; "Conophytum sp. nov." → "Conophytum nov." (and a second import → "Conophytum").
  it.each([
    ['Mammillaria cf. bombycina', /cf\./],
    ['Turbinicarpus aff. alonsoi', /aff\./],
    ['Lithops sp. C 036', /sp\./],
    ['Conophytum sp. nov.', /sp\. nov\./]
  ])('%s keeps its qualifier', (typed, re) => {
    expect(parseName(typed).scientific).toMatch(re);
  });
  it('is idempotent: parsing the stored name again changes nothing', () => {
    const once = parseName('Conophytum sp. nov.').scientific;
    expect(parseName(once).scientific).toBe(once);
  });
});

describe('a sheet column the importer has no field for is not dropped unseen (finding 2)', () => {
  const sheet = parseCsv('Acc No.,Name,Locality,Qty,Notes\r\n0001,Copiapoa cinerea,"Totoral, Chile",3,big one\r\n');
  it('maps a quantity column', () => {
    // Today: guessMapping has no field for Qty, so three plants become one.
    const m = guessMapping(sheet, detectHeader(sheet)) as Record<string, number>;
    expect(Object.values(m)).toContain(3);
  });
  it('keeps an unmapped column somewhere (the notes), so nothing in the sheet is lost', () => {
    // Today: the row's notes are "big one"; "Totoral, Chile" is nowhere.
    const { rows } = rowsFromSheet(sheet, guessMapping(sheet, true), true, '2026-10-06');
    expect(JSON.stringify(rows[0])).toContain('Totoral, Chile');
  });
  it('reads a sheet with Genus and Species in separate columns as the full name', () => {
    // Today: "Species" maps to the name, so the plant is named "cinerea" (and Genus is dropped).
    const s = parseCsv('No,Genus,Species\r\n1,Copiapoa,cinerea\r\n');
    const { rows } = rowsFromSheet(s, guessMapping(s, detectHeader(s)), true, '2026-10-06');
    expect(rows[0].name).toBe('Copiapoa cinerea');
  });
});

describe('dates that are not ambiguous are read, and an unread date is kept (finding 3)', () => {
  // Rule 3 forbids guessing 09/03/2024. None of these is a guess: a year alone, a named month, a day over 12.
  it.each([
    ['2009', '2009'],
    ['August 2017', '2017-08'],
    ['17-Feb-2017', '2017-02-17'],
    ['17.11.2007', '2007-11-17'],
    ['30/09/09', '2009-09-30']
  ])('%s is read (at the precision written)', (cell, want) => {
    // Today: every one is refused with "is not written year first (2024-03-09), so it was not read".
    expect(readDate(cell, '2026-10-06').d ?? '').toMatch(new RegExp('^' + want));
  });
  it('a date that is not read is kept in the plant, not thrown away', () => {
    const s = parseCsv('Name,Date Acq.\r\nCopiapoa cinerea,09/03/2024\r\n');
    const { rows } = rowsFromSheet(s, { name: 0, acquired: 1 }, true, '2026-10-06');
    // Today: acquired null, notes null; the text "09/03/2024" exists only in the review list's warning.
    expect(JSON.stringify({ a: rows[0].acquired, n: rows[0].notes })).toContain('09/03/2024');
  });
});
