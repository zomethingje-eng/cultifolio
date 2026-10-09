/**
 * Harness review of round sixty-one, mutation I5: a line is "already imported" only when a plant here holds its number
 * under the same species and the same cultivar (`markAlreadyImported`, src/lib/import/plan.ts). Dropping the cultivar
 * comparison passed every import test: r61g-import's case matches a cultivar to itself and a different species, never
 * the same species under another cultivar. Without it, a sheet line "0002, Haworthia truncata 'Lime Green'" is skipped as
 * a duplicate of a plant here numbered 0002 that is plain Haworthia truncata (or another clone), and the plant is never
 * added: a silent loss on a restart.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Adopted in round sixty-two (agent H; triage decision 10) from docs/review-61/tests/harness--already-imported-cultivar.test.ts.
 */
import { it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markAlreadyImported } from '$lib/import/plan';

it('the same number and species under another cultivar (or none) is not already imported', () => {
  const s = parseCsv("number,species,cultivar\n0002,Haworthia truncata,Lime Green\n0003,Haworthia truncata,\n0004,Haworthia truncata,Lime Green\n");
  const h = detectHeader(s);
  const { rows } = rowsFromSheet(s, guessMapping(s, h), h, '2026-10-06');
  const here: Record<string, Array<{ taxonName: string; cultivar?: string | null }>> = {
    '0002': [{ taxonName: 'Haworthia truncata' }], // plain species here, the sheet names a cultivar
    '0003': [{ taxonName: 'Haworthia truncata', cultivar: 'Lime Green' }], // a cultivar here, the sheet names the species
    '0004': [{ taxonName: 'Haworthia truncata', cultivar: 'lime green' }] // the same clone, written in other case
  };
  const marked = markAlreadyImported(rows, (no) => here[no] ?? []);
  expect(marked.map((r) => r.already ?? false)).toEqual([false, false, true]);
});
