/**
 * Round eighty-five, the owner's check of 3 November 2026: `--check-ranges` named Peperomia leptostachya (k2555771) and
 * Pandanus tectorius (k285436), each for one climate cell "off the shapes beyond its reason's reach", at 22.625 S,
 * 152.825 W. Their records there are on Rimatara, one of the Tubuai Is. (TDWG's TUB) that Natural Earth does not draw: the
 * build took them by the island rule (French Polynesia stated, inside Tubuai's box, whose west edge is 152.823 W), and the
 * check tested the cell's middle against that box with no allowance, though a cell is 5 km across and every other reason's
 * reach adds half its diagonal. The box is now grown by the same half-diagonal.
 *
 * FAILS on 91896bb: `cellReached` is false for the cell, and `checkPage` counts one edge cell outside.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { cellReached, checkPage, cellTester, CELL_SLACK_DEG } from '../../src/lib/dossier/range-check';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

const file = JSON.parse(readFileSync('scripts/tdwg3-shapes.json', 'utf8')) as ShapesFile;
const t = regionTester(file);
// The two pages' native regions in the Pacific (each lists more; these are the ones within a few degrees of the cell).
const CODES = ['TUB', 'COO', 'SCI', 'TUA', 'PIT'];
const RIMATARA: [number, number] = [-22.625, -152.825];

describe("an island cell inside the region's box, by half a cell", () => {
  it("Tubuai's box is the one the check reads, and the cell's middle is just past its west edge", () => {
    expect(TDWG3.TUB.w).toBeCloseTo(-152.823, 3);
    expect(RIMATARA[1]).toBeLessThan(TDWG3.TUB.w);
    expect(TDWG3.TUB.w - RIMATARA[1]).toBeLessThan(CELL_SLACK_DEG);
  });
  it('the cell at Rimatara, taken by the island rule, is reached', () => {
    expect(cellReached(t, RIMATARA[0], RIMATARA[1], CODES, 'island')).toBe(true);
  });
  it('guard: a cell a tenth of a degree further out is not, and no other reason reaches Rimatara', () => {
    expect(cellReached(t, RIMATARA[0], RIMATARA[1] - 0.1, CODES, 'island')).toBe(false);
    for (const how of ['strict', 'buffer', 'coast'] as const) expect(cellReached(t, RIMATARA[0], RIMATARA[1], CODES, how)).toBe(false);
  });
  it('a page holding that cell as an island edge is not counted by the check', () => {
    const page = {
      key: 'k285436',
      name: { scientific: 'Pandanus tectorius' },
      distribution: { native: CODES.map((code) => ({ code })) },
      occurrences: { rangeTested: true, rangeRule: 'r85', open: [], admitted: { strict: 0, buffer: 0, coast: 0, island: 1 }, nOpenInRange: 0, nRestrictedInRange: 1 },
      climate: { status: 'ok', at: { lat: -21.225, lon: -159.775 }, cells: 2, admitted: { strict: 1, buffer: 0, coast: 0, island: 1 }, edge: [[RIMATARA[0], RIMATARA[1], 'island'] as const] },
      upstream: { 'gbif.occurrences': { status: 'ok' } }
    };
    expect(checkPage(page, cellTester(file), t, 'r85').edgeOutside).toBe(0);
  });
});
