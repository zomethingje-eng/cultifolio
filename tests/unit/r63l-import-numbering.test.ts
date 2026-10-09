/**
 * Round sixty-three (agent L), L3: the import numbers a renumbered line in the grower's own numbering (the round-sixty
 * grower review's finding 10; docs/REVIEW-ROUND-61.md section 9), and the finding's other three bullets checked against
 * the code. The pattern tests and the order and search tests failed on the round-sixty-two base; the range and the words
 * for an in-file duplicate were already right there (said in the report as not reproduced), and are kept as guards.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers } from '$lib/import/plan';
import { numbersSaid } from '$lib/import/commit';
import { DEFAULT_SCHEME } from '$core/accession';

const sheetRows = (text: string) => { const s = parseCsv(text); return rowsFromSheet(s, guessMapping(s, detectHeader(s)), detectHeader(s), '2026-10-05').rows; };
const sheet = (nos: string[]) => 'number,species\n' + nos.map((n, i) => `${n},Lithops species ${i}`).join('\n') + '\n';
const pad = (n: number, w = 4) => String(n).padStart(w, '0');

describe('a renumbered line follows the sheet\'s own numbering', () => {
  it('an in-file duplicate in a sheet numbered 0001 to 0300 gets 0301, and the review says it numbers on from 0300', () => {
    const nos = Array.from({ length: 300 }, (_, i) => pad(i + 1));
    nos.splice(10, 0, '0007'); // 0007 twice
    const rows = sheetRows(sheet(nos));
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered).toEqual([expect.objectContaining({ given: '0007', got: '0301', inFile: expect.any(Number) })]);
    expect(plan.onFrom).toBe('0300');
  });

  it('a number already used here gets the next free one past both the sheet\'s and this collection\'s', () => {
    const rows = sheetRows(sheet(['A001', 'A002', 'A003', 'A095']));
    const plan = planNumbers(rows, ['A002', 'A120', '2026-0001'], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered).toEqual([expect.objectContaining({ given: 'A002', got: 'A121' })]);
    expect(plan.onFrom).toBe('A120'); // the number it numbered on from, this collection's highest (the fix pass, R2 5: it said A095)
    expect(plan.onFromHere).toBe(true);
  });

  it('a sheet whose numbers do not share one pattern keeps this collection\'s scheme, and says so', () => {
    const rows = sheetRows(sheet(['0001', '0002', 'A95', '0002']));
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['2026-0001']);
    expect(plan.onFrom).toBeNull();
    expect(plan.mixed).toBe(true); // the review says why
  });

  it('a sheet numbered in this collection\'s own scheme is numbered as before (the year rule)', () => {
    const rows = sheetRows('number,species\n2026-0001,Copiapoa cinerea\n2026-0001,Copiapoa humilis\n2026-0005,Welwitschia mirabilis\n');
    const plan = planNumbers(rows, ['2026-0005'], DEFAULT_SCHEME, 2026);
    expect(rows.map((r) => plan.byRow.get(r.key)!.numbers[0])).toEqual(['2026-0001', '2026-0006', '2026-0007']);
    expect(plan.onFrom).toBeNull();
    expect(plan.mixed).toBe(false); // nothing to say: the sheet numbers as the collection does
  });

  it('the pattern does not run past its width: past 9999 the line takes this collection\'s scheme', () => {
    const rows = sheetRows(sheet(['0001', '9998', '9999', '9999'])); // zero-padded, so four digits wide (the fix pass, R2 3: an unpadded 9999 carries on to 10000)
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['2026-0001']);
    expect(plan.onFrom).toBeNull(); // and the review does not say it numbered on from the sheet
  });

  it('a line with no number is numbered by this collection\'s scheme, as before', () => {
    const rows = sheetRows('number,species\n0001,Copiapoa cinerea\n,Copiapoa humilis\n');
    const plan = planNumbers(rows, [], DEFAULT_SCHEME, 2026);
    expect(rows.map((r) => plan.byRow.get(r.key)!.numbers[0])).toEqual(['0001', '2026-0001']);
  });
});

describe('the finding\'s other bullets', () => {
  it('not reproduced: the done line groups numbers by pattern and orders them as numbers ("0001 to 0300 and A9 to A95")', () => {
    expect(numbersSaid(['0002', '0300', '0001', 'A95', 'A9', 'A10'])).toBe('0001 to 0300 and A9 to A95'); // in line order, as the import adds them
  });

  it('"Newest first" orders numbers as numbers: A95, A94, A77, A9', async () => {
    const { byNumberNewest } = await import('$lib/db/number-order');
    expect(['A9', 'A95', 'A77', 'A94'].sort(byNumberNewest)).toEqual(['A95', 'A94', 'A77', 'A9']);
    expect(['2026-0002', '2026-0010', '2025-0099'].sort(byNumberNewest)).toEqual(['2026-0010', '2026-0002', '2025-0099']);
  });

  it('a search that is a plant\'s whole number lists that plant first: "0001" before 2026-0001 and 2014-0001', async () => {
    const { numberFirst } = await import('$lib/db/number-order');
    const list = [{ acc: '2026-0001' }, { acc: '2014-0001' }, { acc: '0001' }, { acc: '0010' }];
    expect(numberFirst(list, ' 0001 ', (a) => a.acc).map((a) => a.acc)).toEqual(['0001', '2026-0001', '2014-0001', '0010']);
    expect(numberFirst(list, 'lithops', (a) => a.acc)).toBe(list); // not a number here: the list as it was
  });
});
