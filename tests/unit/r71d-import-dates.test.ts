/**
 * Round seventy-one, agent D: short dates written with a two-digit year first (the self-review's D4). Round seventy read
 * a cell that could be written year first by a day-first or month-first answer, with the year last, and asked about a
 * sheet of them: 10-04-15 (15 April 2010) became 10 April 2015 or 4 October 2015, whichever was answered, where round
 * sixty-nine left it in the notes. The choice now offers year first when such a cell is in the sheet, which reads those
 * cells so, and its words carry each reading's year (the page; r71d-import.spec.ts). Cases marked "base" fail on
 * r71base; "guard" cases pass on both.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping, readDate, ambiguousDates } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markImported, type ImportRow } from '$lib/import/plan';
const T = '2026-10-15';
type Order = 'dmy' | 'mdy' | 'ymd' | null;
const read = (text: string, dateOrder: Order) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, T, { dateOrder: dateOrder as never }).rows; };
const keysOf = (rows: ImportRow[]) => new Set(rows.flatMap((r) => r.importKeys ?? []));

describe('year-first short dates (D4)', () => {
  it('base: a sheet of them is asked about, and says year first is possible', () => {
    const s = parseCsv('species,acquired\nAloe vera,10-04-15\nAloe ferox,11-06-20\n');
    expect(ambiguousDates(s, guessMapping(s, true), true, T)).toMatchObject({ n: 2, first: '10-04-15', yearFirst: { n: 2, first: '10-04-15' } });
  });
  it('base: answered year first, each reads with its year first', () => {
    expect(readDate('10-04-15', T, 'ymd' as never).d).toBe('2010-04-15');
    expect(readDate('12/05/03', T, 'ymd' as never).d).toBe('2012-05-03');
    expect(read('species,acquired\nAloe vera,10-04-15\nAloe ferox,24-03-09\n', 'ymd').map((r) => r.acquired)).toEqual(['2010-04-15', '2024-03-09']);
  });
  it('base: year first reads nothing else: a date that cannot be written so, and 09/03/2024, are left', () => {
    expect(readDate('31-12-23', T, 'ymd' as never).d).toBeNull();
    expect(readDate('09/03/2024', T, 'ymd' as never)).toMatchObject({ d: null, ambiguous: true });
    expect(readDate('2024-03-09', T, 'ymd' as never).d).toBe('2024-03-09');
  });
  it('guard: day first and month first still read LibreOffice\'s short dates with the year last (round seventy, R3)', () => {
    expect(readDate('05/01/24', T, 'dmy').d).toBe('2024-01-05');
    expect(readDate('05/01/24', T, 'mdy').d).toBe('2024-05-01');
  });
  it('base: a sheet of short dates none of which could be year first offers no year first', () => {
    const s = parseCsv('species,acquired\nAloe vera,05/01/45\nAloe ferox,09/03/2024\n');
    expect(ambiguousDates(s, guessMapping(s, true), true, T).yearFirst).toEqual({ n: 0, first: null });
  });
  it('base: a plant filed year first is found again by the same answer, and not by a line of the year-last day', () => {
    const here = keysOf(read('species,acquired\nAloe vera,10-04-15\n', 'ymd'));
    expect(markImported(read('species,acquired\nAloe vera,10-04-15\n', 'ymd'), (k) => here.has(k))[0].done).toBe(true);
    expect(markImported(read('species,acquired\nAloe vera,2010-04-15\n', null), (k) => here.has(k))[0].done).toBe(true);
    expect(markImported(read('species,acquired\nAloe vera,2015-04-10\n', null), (k) => here.has(k))[0].done ?? false).toBe(false);
  });
  it('base: one that reads one way with the year last is keyed by the day year first reads', () => {
    const here = keysOf(read('species,acquired\nAloe vera,24-03-09\n', 'ymd'));
    expect(markImported(read('species,acquired\nAloe vera,2024-03-09\n', null), (k) => here.has(k))[0].done).toBe(true);
    expect(markImported(read('species,acquired\nAloe vera,2009-03-24\n', null), (k) => here.has(k))[0].done ?? false).toBe(false);
  });
});
