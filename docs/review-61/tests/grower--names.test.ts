/**
 * Round sixty-one self-review, the grower: names a collector writes that the parser still misfiles.
 *
 * FAILS on f4ab4f8 (reproductions):
 *  1. "Copiapoa sp. 'Pan de Azúcar'" and "Mammillaria sp. nov. "Sierra Gorda"": a provisional name in quotes after "sp." is
 *     read as a cultivar of a bare genus, so the plant is filed as a HYBRID ("a cross, filed under its genus" in the import
 *     review; "A hybrid; parentage not stated" on its page; the label code drops its species). It is an undescribed species.
 *  2. "× Gasteraloe 'Green Ice'": the nothogenus mark is dropped from the filed name (still open from round sixty, grower 15).
 * Run: npx vitest run tests/unit/grower--names.test.ts   (lives in tests/unit/)
 */
import { describe, it, expect } from 'vitest';
import { parseName } from '$core/names';
import { recordOf } from '$lib/import/commit';
import { blankRow } from '$lib/import/plan';

describe('names a collector writes', () => {
  it.each([
    ['Copiapoa sp. \'Pan de Azúcar\''],
    ['Mammillaria sp. nov. "Sierra Gorda"'],
    ['Gymnocalycium sp. \'LB 1234\'']
  ])('%s is an undescribed species with a provisional name, not a cross', (name) => {
    const p = parseName(name);
    expect(p.qualifier).toBe('sp.');
    expect(p.kind).not.toBe('hybrid');
    expect(recordOf(blankRow('k', 2, name), undefined, null).nameKind).not.toBe('hybrid');
  });
  it('a nothogenus keeps its ×', () => {
    expect(parseName('× Gasteraloe \'Green Ice\'').scientific).toMatch(/^×\s?Gasteraloe/);
    expect(parseName('x Gasteraloe \'Green Ice\'').scientific).toMatch(/^×\s?Gasteraloe/);
  });
});
