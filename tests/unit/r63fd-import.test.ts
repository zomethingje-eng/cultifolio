/**
 * Round sixty-three, the fix pass (fixer D), R2 findings 3 to 6: the import's numbering. An unpadded sheet (1 to 300, A9
 * to A95) is a pattern too; a Cultifolio export over two years is this collection's own scheme and the review says so;
 * the review names the number the import truly numbered on from; a line's further plants (Qty) follow the same scheme as
 * their line, kept or renumbered. Each failed on the merged round before the fix.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { planNumbers } from '$lib/import/plan';
import { DEFAULT_SCHEME } from '$core/accession';
import { readFileSync } from 'node:fs';

const sheetRows = (text: string) => { const s = parseCsv(text); return rowsFromSheet(s, guessMapping(s, detectHeader(s)), detectHeader(s), '2026-10-05').rows; };
const sheet = (nos: string[]) => 'number,species\n' + nos.map((n, i) => `${n},Lithops species ${i}`).join('\n') + '\n';
const pad = (n: number, w = 4) => String(n).padStart(w, '0');

describe('R2 3: an unpadded sheet is a pattern', () => {
  it('1 to 300 with 7 given twice: the second 7 gets 301, and the review says it numbered on from 300', () => {
    const nos = Array.from({ length: 300 }, (_, i) => String(i + 1)); nos.push('7');
    const plan = planNumbers(sheetRows(sheet(nos)), [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered).toEqual([expect.objectContaining({ given: '7', got: '301' })]);
    expect(plan.onFrom).toBe('300');
    expect(plan.onFromHere).toBe(false);
    expect(plan.mixed).toBe(false);
  });
  it('A9, A77, A94, A95, A9 (the grower review\'s own example): the second A9 gets A96', () => {
    const plan = planNumbers(sheetRows(sheet(['A9', 'A77', 'A94', 'A95', 'A9'])), [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['A96']);
    expect(plan.onFrom).toBe('A95');
    expect(plan.mixed).toBe(false);
  });
  it('an unpadded sheet carries on past its widest number: 9999 is followed by 10000', () => {
    const plan = planNumbers(sheetRows(sheet(['9998', '9999', '9999'])), [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['10000']);
  });
  it('a zero-padded number among unpadded ones of another width is no pattern (A007 beside A95)', () => {
    const plan = planNumbers(sheetRows(sheet(['A007', 'A95', 'A95'])), [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['2026-0001']);
    expect(plan.mixed).toBe(true);
  });
  it('an unpadded pattern skips this collection\'s own unpadded numbers in it, and not its padded ones', () => {
    const plan = planNumbers(sheetRows(sheet(['A9', 'A95', 'A9'])), ['A120', 'A0500'], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['A121']);
    expect(plan.onFrom).toBe('A120');
    expect(plan.onFromHere).toBe(true);
  });
});

describe('R2 4: a Cultifolio export over two years is this collection\'s own scheme', () => {
  it('2025-0001, 2025-0002, 2026-0001, 2026-0001: the line is numbered 2026-0002 by the year rule, and it is not called mixed', () => {
    const plan = planNumbers(sheetRows(sheet(['2025-0001', '2025-0002', '2026-0001', '2026-0001'])), [], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered.map((x) => x.got)).toEqual(['2026-0002']);
    expect(plan.mixed).toBe(false);
    expect(plan.own).toBe(true);
    expect(plan.onFrom).toBeNull();
  });
  it('the review says the sheet is numbered as this collection numbers, never that it follows no pattern', () => {
    const page = readFileSync('src/routes/plants/import/+page.svelte', 'utf8');
    expect(page).toContain("Renumbered lines take this collection\\'s next number by its own rule, since your sheet is numbered as this collection numbers.");
  });
});

describe('R2 5: the review names the number the import numbered on from', () => {
  it('a sheet 0001 to 0300 into a collection grown to 0450: the line gets 0451 and the review names 0450, here', () => {
    const plan = planNumbers(sheetRows(sheet(['0001', '0002', '0300'])), ['0001', '0450'], DEFAULT_SCHEME, 2026);
    expect(plan.renumbered).toEqual([expect.objectContaining({ given: '0001', got: '0451' })]);
    expect(plan.onFrom).toBe('0450');
    expect(plan.onFromHere).toBe(true);
  });
  it('the sheet\'s own highest when it is the higher: 0007 twice in 0001 to 0300 gets 0301, from 0300', () => {
    const nos = Array.from({ length: 300 }, (_, i) => pad(i + 1)); nos.splice(10, 0, '0007');
    const plan = planNumbers(sheetRows(sheet(nos)), ['0100'], DEFAULT_SCHEME, 2026); // 0100 is here too
    expect(plan.renumbered.map((x) => [x.given, x.got])).toEqual([['0007', '0301'], ['0100', '0302']]);
    expect(plan.onFrom).toBe('0300');
    expect(plan.onFromHere).toBe(false);
  });
  it('the page says which: the sheet\'s highest, or the highest of that kind here', () => {
    const page = readFileSync('src/routes/plants/import/+page.svelte', 'utf8');
    expect(page).toContain("carry on your sheet's own numbering, from ${plan.onFromHere ? `the highest number of that kind here, ${plan.onFrom}` : `its highest number, ${plan.onFrom}`}.");
  });
});

describe('R2 6: a line\'s further plants follow the same scheme as their line', () => {
  it('0002 Qty 3 kept, and 0002 Qty 2 renumbered, in a sheet 0001 to 0300: every plant in the sheet\'s numbering', () => {
    const plan = planNumbers(sheetRows('number,species,qty\n0001,Lithops a,1\n0002,Lithops b,3\n0300,Lithops c,1\n0002,Lithops d,2\n'), [], DEFAULT_SCHEME, 2026);
    expect([...plan.byRow.values()].map((p) => p.numbers)).toEqual([['0001'], ['0002', '0301', '0302'], ['0300'], ['0303', '0304']]);
    expect(plan.extrasOn).toBe(3);
    expect(plan.onFrom).toBe('0300');
  });
  it('a line with no number keeps this collection\'s rule for every plant', () => {
    const plan = planNumbers(sheetRows('number,species,qty\n0001,Lithops a,1\n,Lithops b,2\n'), [], DEFAULT_SCHEME, 2026);
    expect([...plan.byRow.values()].map((p) => p.numbers)).toEqual([['0001'], ['2026-0001', '2026-0002']]);
    expect(plan.extrasOn).toBe(0);
    expect(plan.onFrom).toBeNull();
  });
  it('a sheet numbered as this collection numbers keeps the year rule for a kept line\'s further plants', () => {
    const plan = planNumbers(sheetRows('number,species,qty\n2026-0001,Lithops a,2\n'), [], DEFAULT_SCHEME, 2026);
    expect([...plan.byRow.values()][0].numbers).toEqual(['2026-0001', '2026-0002']);
  });
});
