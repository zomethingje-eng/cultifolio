/**
 * Round seventy-two, reviewer E: the date question of a sheet whose short dates read one way only with the year last.
 * Round seventy-one put the question only when a date read two ways with its year last (`ambiguousDates().n`), so a sheet
 * of year-first dates from 2013 on (19-05-23) or of LibreOffice's day-first dates past the twelfth (25/12/23) was never
 * asked, and none of its dates could be read: each went to the notes. FAILED on r72base (`dateQuestion` is new; the
 * page's condition was `amb.n`, which is 0 for each of these sheets, as the guard below shows).
 */
import { describe, it, expect } from 'vitest';
import * as csv from '$lib/import/csv';
import { parseCsv, detectHeader, guessMapping, ambiguousDates, readDate } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';

const T = '2026-10-15';
const amb = (text: string) => { const s = parseCsv(text); return ambiguousDates(s, guessMapping(s, true), true, T); };
const read = (text: string, dateOrder: 'dmy' | 'mdy' | 'ymd' | null) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, T, { dateOrder: dateOrder as never }).rows; };
const question = (a: ReturnType<typeof ambiguousDates>) => (csv as unknown as { dateQuestion?: (x: typeof a) => unknown }).dateQuestion?.(a) ?? null;

describe('the date question of short dates that read one way with the year last', () => {
  it('guard: such a sheet has no date that reads two ways, and every date is left unread with no choice', () => {
    expect(amb('species,acquired\nAloe vera,19-05-23\nAloe ferox,21-08-14\n').n).toBe(0);
    expect(readDate('19-05-23', T).d).toBeNull();
    expect(readDate('19-05-23', T, 'ymd').d).toBe('2019-05-23');
    expect(read('species,acquired\nAloe vera,19-05-23\n', null)[0].acquired ?? null).toBeNull();
  });
  it('a sheet of year-first dates of 2013 on is asked, naming one of them', () => {
    expect(question(amb('species,acquired\nAloe vera,19-05-23\nAloe ferox,21-08-14\n'))).toMatchObject({ n: 2, first: '19-05-23' }); // r72base: null
    expect(read('species,acquired\nAloe vera,19-05-23\nAloe ferox,21-08-14\n', 'ymd').map((r) => r.acquired)).toEqual(['2019-05-23', '2021-08-14']);
  });
  it('a LibreOffice sheet of day-first dates past the twelfth is asked, and day first reads them', () => {
    expect(question(amb('species,acquired\nAloe vera,25/12/23\nAloe ferox,17/03/24\n'))).toMatchObject({ n: 2, first: '25/12/23' }); // r72base: null
    expect(read('species,acquired\nAloe vera,25/12/23\nAloe ferox,17/03/24\n', 'dmy').map((r) => r.acquired)).toEqual(['2023-12-25', '2024-03-17']);
  });
  it('a sheet whose dates are all read is not asked; one with a date read two ways is asked about that one', () => {
    expect(question(amb('species,acquired\nAloe vera,2019-05-23\nAloe ferox,17/03/2024\n'))).toBeNull();
    expect(question(amb('species,acquired\nAloe vera,19-05-23\nAloe ferox,05/01/24\n'))).toMatchObject({ n: 1, first: '05/01/24', twoWays: true });
  });
});
