/**
 * Harness review of round sixty-one, mutation I1: a sheet's quantity is read only from 1 to 200 (`QTY_MAX`,
 * src/lib/import/rows.ts). Dropping the upper bound (`if (n >= 1) r.qty = n`) passed every import test: r61g-import
 * checks "3" and "two", never a number past the cap. Without it, one mistyped cell ("2000" for a year, a pasted lot
 * number) adds thousands of plants in one commit, each with its own number.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Adopted in round sixty-two (agent H; triage decision 10) from docs/review-61/tests/harness--import-qty-cap.test.ts.
 */
import { it, expect } from 'vitest';
import { parseCsv, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';

it('a quantity past 200, or of 0, is one plant with the text kept in the notes and said on the row; 200 is read', () => {
  const s = parseCsv('Name,Qty\r\nCopiapoa cinerea,200\r\nCopiapoa humilis,2009\r\nLithops lesliei,0\r\n');
  const { rows } = rowsFromSheet(s, guessMapping(s, true), true, '2026-10-06');
  expect(rows.map((r) => r.qty)).toEqual([200, 1, 1]);
  expect(rows[1].notes).toBe('Qty: 2009');
  expect(rows[1].problems.join()).toMatch(/"2009" was not read as a number of plants \(1 to 200\)/);
  expect(rows[2].notes).toBe('Qty: 0');
});
