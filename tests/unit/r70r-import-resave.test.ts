/**
 * Round seventy, agent R: a sheet saved again by LibreOffice reads the same (triage-69 R3; the self-review's D3).
 * LibreOffice saves a date as a short date with a zero-padded two-digit year (05/01/24, 15/04/24), which the import
 * left as "could be written year first or year last", keyed by its text, and offered every line again; and a price in a
 * currency format came back as £12.50, keyed apart from 12.50. Now the short date is keyed by its readings with the year
 * last, whatever the sheet's choice, and read by that choice when one is made; a price with a currency is tried as its
 * amount alone. The reviewer's reproduction (zzd-import), with the readings and guards. Cases marked "base" fail on
 * 526ecaf; the rest are guards.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping, readDate, ambiguousDates } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markImported, markSheet, lineHash, type ImportRow } from '$lib/import/plan';
const read = (text: string, dateOrder: 'dmy' | 'mdy' | null = 'dmy') => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, '2026-10-05', { dateOrder }).rows; };
const keysOf = (rows: ImportRow[]) => new Set(rows.flatMap((r) => r.importKeys ?? []));
/** The day a cell of day, month and year reads as by the sheet's answer, the year last; other forms as written. */
function answered(cell: string, order: 'dmy' | 'mdy'): string {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(cell);
  if (!m) return cell.startsWith('2024-05-01') || /May/.test(cell) ? '2024-05-01' : cell;
  const [a, b] = [+m[1], +m[2]];
  const [mo, da] = a > 12 ? [b, a] : b > 12 ? [a, b] : order === 'dmy' ? [b, a] : [a, b];
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
describe('a sheet saved again (S-D3)', () => {
  for (const [orig, resaved] of [['2024-05-01', '05/01/24'], ['2024-04-15', '15/04/24'], ['2024-03-09', '03/09/24'], ['2024-03-09', '09/03/24'], ['2024-05-01', '5/1/24'], ['2024-05-01', '01.05.2024'], ['2024-05-01', '2024-05-01 00:00:00'], ['2024-05-01', '1-May-2024'], ['2024-05-01', '01-May-24']] as const) {
    for (const order of ['dmy', 'mdy', null] as const) {
      // Found when the cell is not read, or read as the day it was; a cell the grower answered as another day is another
      // plant (round seventy, second pass; triage-69 R7, R47-16).
      const want = order === null || answered(resaved, order) === orig;
      const short = /^\d\d\D\d\d\D\d\d$/.test(resaved);
      it(`${want === short ? 'base' : 'guard'}: ${orig} saved again as ${resaved}, order ${order}: ${want ? 'found' : 'another plant'}`, () => {
        const here = keysOf(read(`species,acquired\nAloe vera,${orig}\n`));
        const again = read(`species,acquired\nAloe vera,${resaved}\n`, order);
        expect(markImported(again, (k) => here.has(k))[0].done ?? false).toBe(want);
      });
    }
  }
  it('guard: notes with CRLF inside the cell, saved again with LF', () => {
    const here = keysOf(read('species,notes\r\nAloe vera,"line one\r\nline two"\r\n'));
    expect(markImported(read('species,notes\nAloe vera,"line one\nline two"\n'), (k) => here.has(k))[0].done).toBe(true);
  });
  it('guard: notes with a trailing space dropped by a re-save', () => {
    const here = keysOf(read('species,notes\nAloe vera,"from Uhlig "\n'));
    expect(markImported(read('species,notes\nAloe vera,from Uhlig\n'), (k) => here.has(k))[0].done).toBe(true);
  });
  it('base: price saved again with a currency sign', () => {
    const here = keysOf(read('species,price\nAloe vera,12.50\n'));
    expect(markImported(read('species,price\nAloe vera,£12.50\n'), (k) => here.has(k))[0].done).toBe(true);
  });
  it('guard: a column added between: two plants of a sheet with a done column', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n'));
    const second = markImported(read('species,acquired,done\nAloe vera,2024-05-01,x\nAloe vera,2024-05-01,x\n'), (k) => here.has(k));
    expect(second.map((r) => !!r.done)).toEqual([true, true]);
  });
  it('base: a price saved again in a currency format after the date, the two together', () => {
    const here = keysOf(read('species,acquired,price\nAloe vera,2024-05-01,12.50\n'));
    expect(markImported(read('species,acquired,price\nAloe vera,05/01/24,£12.50\n', null), (k) => here.has(k))[0].done).toBe(true);
  });
  it('guard: a plant filed by round sixty-nine from the short date itself is still found', () => {
    // Round sixty-nine keyed "05/01/24" by its text: name, cultivar, number, place, then the date (the cells after it empty).
    const then = `${lineHash(['Aloe vera', '', '', '', '05/01/24'], 'j')}#1`;
    for (const order of ['dmy', 'mdy', null] as const) expect(markImported(read('species,acquired\nAloe vera,05/01/24\n', order), (k) => k === then)[0].done).toBe(true);
  });
  it('guard: another day is still another plant', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-05-02\n'));
    for (const order of ['dmy', 'mdy', null] as const) expect(markImported(read('species,acquired\nAloe vera,05/01/24\n', order), (k) => here.has(k))[0].done ?? false).toBe(false);
  });
  it('guard: another price is still another plant', () => {
    const here = keysOf(read('species,price\nAloe vera,12.50\n'));
    expect(markImported(read('species,price\nAloe vera,£13.50\n'), (k) => here.has(k))[0].done ?? false).toBe(false);
  });
});

describe('the short date is read by the sheet\'s choice (S-D3)', () => {
  const TODAY = '2026-10-12';
  it('base: day first or month first puts the year last', () => {
    expect(readDate('05/01/24', TODAY, 'dmy').d).toBe('2024-01-05');
    expect(readDate('05/01/24', TODAY, 'mdy').d).toBe('2024-05-01');
    expect(readDate('15/04/24', TODAY, 'dmy').d).toBe('2024-04-15');
    expect(readDate('24.03.09', TODAY, 'dmy').d).toBe('2009-03-24');
    expect(read('species,acquired\nAloe vera,05/01/24\n', 'mdy')[0].acquired).toBe('2024-05-01');
  });
  it('base: a sheet of short dates asks which way round they are written', () => {
    const s = parseCsv('species,acquired\nAloe vera,05/01/24\nAloe ferox,15/04/24\n');
    expect(ambiguousDates(s, guessMapping(s, true), true, TODAY)).toMatchObject({ n: 1, first: '05/01/24' });
  });
  it('base: with no choice the short date is still not read, and its readings are given', () => {
    expect(readDate('05/01/24', TODAY)).toMatchObject({ d: null, yearLast: ['2024-01-05', '2024-05-01'] });
    expect(readDate('15/04/24', TODAY)).toMatchObject({ d: null, yearLast: ['2024-04-15'] });
    expect(readDate('24/03/09', TODAY).why).toMatch(/year first or year last/);
    expect(readDate('15/06/27', TODAY, 'dmy').d).toBeNull(); // 2027 is still to come: 1927 or 2027
  });
});

/*
 * A mutation the self-review found surviving (MR1e): the key without the columns no field takes is taken only when no
 * other line of the sheet shares it. Nothing tested a sheet that gains a column telling apart two lines it lacked.
 */
describe('guard: a column that tells apart two lines a first sheet did not (MR1e; R47-19\'s revert of onlyIfUnique)', () => {
  it('neither line is taken for the one plant filed from the line without it', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-05-01\n'));
    const again = markImported(read('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n'), (k) => here.has(k));
    expect(again.map((r) => !!r.done)).toEqual([false, false]);
  });
  it('one such line, alone in the sheet, is taken', () => {
    const here = keysOf(read('species,acquired\nAloe vera,2024-05-01\n'));
    expect(markImported(read('species,acquired,locality\nAloe vera,2024-05-01,Totoral\n'), (k) => here.has(k))[0].done).toBe(true);
  });
  it('base: of a pair sharing the key without the column, the one not found by its own key takes the plant (R47-16)', () => {
    // Paposo's line came in with the column; the plain line before it came in without it.
    const here = new Set([...keysOf(read('species,acquired\nAloe vera,2024-05-01\n')), ...keysOf(read('species,acquired,locality\nAloe vera,2024-05-01,Paposo\n'))]);
    const again = markImported(read('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n'), (k) => here.has(k));
    expect(again.map((r) => !!r.done)).toEqual([true, true]);
  });
});

describe('the import key after R47 (triage-69 R7, R47-16)', () => {
  const TODAY = '2026-10-05';
  const sheet = (text: string, dateOrder: 'dmy' | 'mdy' | null) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY, { dateOrder }).rows; };
  it('base: two lines a day-first sheet reads as two days are two plants, however the lines are sorted', () => {
    const here = keysOf(sheet('species,acquired\nAloe vera,05/01/2024\n', 'dmy'));
    const again = markImported(sheet('species,acquired\nAloe vera,01/05/2024\nAloe vera,05/01/2024\n', 'dmy'), (k) => here.has(k));
    expect(again.map((r) => !!r.done)).toEqual([false, true]);
  });
  it('base: a day-first 01/05/2024 is not taken for a plant of 2024-01-05', () => {
    const here = keysOf(sheet('species,acquired\nAloe vera,2024-01-05\n', 'dmy'));
    expect(markImported(sheet('species,acquired\nAloe vera,01/05/2024\n', 'dmy'), (k) => here.has(k))[0].done ?? false).toBe(false);
  });
  it('guard: answered the same way, the same line is found; left unanswered, a plant of either day is', () => {
    const here = keysOf(sheet('species,acquired\nAloe vera,05/01/2024\n', 'dmy'));
    expect(markImported(sheet('species,acquired\nAloe vera,05/01/2024\n', 'dmy'), (k) => here.has(k))[0].done).toBe(true);
    const iso = keysOf(sheet('species,acquired\nAloe vera,2024-01-05\n', null));
    expect(markImported(sheet('species,acquired\nAloe vera,05/01/2024\n', null), (k) => iso.has(k))[0].done).toBe(true);
  });
  it('base: a plant an unanswered run filed is found by the answered line only by its date or none', () => {
    const then = sheet('species,acquired\nAloe vera,05/01/2024\n', null)[0].importKeys![0];
    const plant = { acquired: null };
    expect(markImported(sheet('species,acquired\nAloe vera,05/01/2024\n', 'dmy'), (k) => (k === then ? plant : undefined))[0].done).toBe(true);
    expect(markImported(sheet('species,acquired\nAloe vera,05/01/2024\n', 'dmy'), (k) => (k === then ? { acquired: '2024-05-01' } : undefined))[0].done ?? false).toBe(false);
  });
  it('base: a line imported with a column no field takes is found when the sheet has lost the column', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\n', null)[0];
    expect(first.importKeysBare).toHaveLength(1);
    const plants = [{ taxonName: 'Aloe vera', importKey: first.importKeys![0], importKeyBare: first.importKeysBare![0] }];
    const again = markSheet(sheet('species,acquired\nAloe vera,2024-05-01\n', null), { has: (k) => (plants.some((p) => p.importKey === k) ? { acquired: '2024-05-01' } : undefined), dropped: new Set(), held: () => [], plants });
    expect(again[0].done).toBe(true);
  });
});
