/**
 * Round seventy-one, agent D: the import key without the columns no field takes (`importKeyBare`) across sheet edits
 * (the self-review's D1, D2 and D5; R47-16). Round seventy found a plant by that key for any line, and numbered it among
 * every line of the sheet: a new plain line beside the plant's own line was taken as that plant (D1, a regression of
 * round seventy: those cases pass on 7aa531c), a plain line's own key and another plant's bare key were one string, so a
 * sheet that lost the column offered a plant again without a word (D2), and two plants filed from two like lines were
 * both offered again when a column came to tell the lines apart (D5). Cases marked "base" fail on r71base; "guard" cases
 * pass on both. The mutation survivors of the self-review in this file's area (MI7, MI8, MI13, MI18) have a case each.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv, detectHeader, guessMapping } from '$lib/import/csv';
import { rowsFromSheet } from '$lib/import/rows';
import { markSheet, lineHash, type ImportRow } from '$lib/import/plan';
const TODAY = '2026-10-05';
const sheet = (text: string) => { const s = parseCsv(text); const h = detectHeader(s); return rowsFromSheet(s, guessMapping(s, h), h, TODAY, { dateOrder: null }).rows; };
type P = { taxonName: string; acquired: string | null; sourceFrom?: string | null; importKey: string; importKeyBare?: string };
/** What commit files: one plant per key, with importKeyBare when the line had extras. */
function file(rows: ImportRow[]): P[] {
  return rows.flatMap((r) => (r.importKeys ?? []).map((k, i) => ({ taxonName: r.name, acquired: r.acquired ?? null, sourceFrom: r.source ?? null, importKey: k, ...(r.importKeysBare?.[i] ? { importKeyBare: r.importKeysBare[i] } : {}) })));
}
function run(rows: ImportRow[], plants: P[]) {
  const here = new Map(plants.map((p) => [p.importKey, p]));
  return markSheet(rows, { has: (k) => here.get(k) as never, dropped: new Set(), held: () => [], plants: plants as never });
}
const show = (rows: ImportRow[]) => rows.map((r) => (r.done ? 'done' : r.changed ? 'changed' : 'NEW'));
describe('importKeyBare across sheet edits', () => {
  it('base: one line with a locality, one without; the column is then deleted (D2)', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,\n');
    const plants = file(first);
    const again = run(sheet('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n'), plants);
    expect(show(again)).toEqual(['done', 'done']);
  });
  it('base: the same, the plain line first (D2)', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,\nAloe vera,2024-05-01,Totoral\n');
    const again = run(sheet('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n'), file(first));
    expect(show(again)).toEqual(['done', 'done']);
  });
  it('base: two plants filed from two like lines, and a column then tells them apart: each line takes one (D5)', () => {
    const first = sheet('species,acquired\nAloe vera,2024-05-01\nAloe vera,2024-05-01\n');
    const again = run(sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n'), file(first));
    expect(show(again)).toEqual(['done', 'done']);
  });
  it('base: a Qty of 2 with a locality beside a plain line, the column deleted (D2)', () => {
    const first = sheet('species,acquired,qty,locality\nAloe vera,2024-05-01,2,Totoral\nAloe vera,2024-05-01,1,\n');
    const again = run(sheet('species,acquired,qty\nAloe vera,2024-05-01,2\nAloe vera,2024-05-01,1\n'), file(first));
    expect(show(again)).toEqual(['done', 'done']);
  });
  it('guard: two lines with different localities, the column deleted', () => {
    const first = sheet('species,acquired,locality,notes\nAloe vera,2024-05-01,Totoral,a\nAloe vera,2024-05-01,Paposo,a\n');
    const again = run(sheet('species,acquired,notes\nAloe vera,2024-05-01,a\nAloe vera,2024-05-01,a\n'), file(first));
    expect(show(again)).toEqual(['done', 'done']);
  });
  it('guard: the column deleted and one line of two removed from the sheet', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,Paposo\n');
    const again = run(sheet('species,acquired\nAloe vera,2024-05-01\n'), file(first));
    expect(show(again)).toEqual(['done']);
  });
});
describe('importKeyBare taking a new line', () => {
  it('base: a plain line added beside a line with a locality, the column kept, is a new plant (D1)', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\n');
    const again = run(sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\nAloe vera,2024-05-01,\n'), file(first));
    expect(show(again)).toEqual(['done', 'NEW']);
  });
  it('base: a plain line added before it, the same (D1)', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\n');
    const again = run(sheet('species,acquired,locality\nAloe vera,2024-05-01,\nAloe vera,2024-05-01,Totoral\n'), file(first));
    expect(show(again)).toEqual(['NEW', 'done']);
  });
  it('guard: the locality cleared on the one line (the grower empties the cell) still finds the plant', () => {
    const first = sheet('species,acquired,locality\nAloe vera,2024-05-01,Totoral\n');
    expect(show(run(sheet('species,acquired,locality\nAloe vera,2024-05-01,\n'), file(first)))).toEqual(['done']);
  });
});

describe('the survivors of the self-review\'s mutation run', () => {
  it('guard (MI13): a plant found by its bare key explains no other line as changed', () => {
    const first = sheet('species,acquired,source,locality\nAloe vera,2024-05-01,Haage,Totoral\n');
    const again = run(sheet('species,acquired,source,notes\nAloe vera,2024-05-01,Haage,\nAloe vera,2024-05-01,Haage,a second one\n'), file(first));
    expect(show(again)).toEqual(['done', 'NEW']);
  });
  it('guard (MI18): a line found only in part is not found whole, so another line does not take the plant it may be', () => {
    const first = sheet('species,acquired,qty,locality\nAloe vera,2024-05-01,1,\nAloe vera,2024-05-01,2,Paposo\n');
    // The plain line's plant is given a locality, Totoral, and a third Paposo plant is bought: either may be the plant filed plain.
    const again = run(sheet('species,acquired,qty,locality\nAloe vera,2024-05-01,1,Totoral\nAloe vera,2024-05-01,3,Paposo\n'), file(first));
    expect(again.map((r) => [show([r])[0], r.qty, r.partDone ?? 0])).toEqual([['changed', 1, 0], ['NEW', 1, 2]]);
  });
  it('guard (MI7): a short date that reads one way, written 4-digit and unanswered before, finds its plant by the ~ key', () => {
    // 05/11/26 on 2026-10-05: 11 May 2026 (5 November is to come); 05/11/2026 left unanswered filed its plant under "~".
    const first = sheet('species,acquired\nAloe vera,05/11/2026\n');
    expect(first[0].acquired).toBeNull();
    const plants = file(first);
    expect(show(run(sheet('species,acquired\nAloe vera,05/11/26\n'), plants))).toEqual(['done']);
  });
  it('guard (MI8): a plant round sixty-seven filed from a short date by its text is found by an answered line', () => {
    const then = `${lineHash(['Aloe vera', '', '', '', '05/01/24'], 'i')}#1`;
    const plant = { taxonName: 'Aloe vera', acquired: null, importKey: then };
    const s = parseCsv('species,acquired\nAloe vera,05/01/24\n');
    const h = detectHeader(s);
    const rows = rowsFromSheet(s, guessMapping(s, h), h, TODAY, { dateOrder: 'dmy' }).rows;
    expect(rows[0].acquired).toBe('2024-01-05');
    expect(show(run(rows, [plant]))).toEqual(['done']);
  });
});
