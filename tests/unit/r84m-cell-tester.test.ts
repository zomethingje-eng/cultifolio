import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cellTester } from '../../src/lib/dossier/range-check';
import { regionTester, SHAPE_BUFFER_DEG } from '../../src/lib/dossier/tdwg-shapes';

// The owner's walk of 31 October 2026: --check-ranges listed Semiaquilegia adoxoides (k2600888), whose typical cell's middle
// (36.275 N, 126.275 E) lies off Korea's west coast by the islets its record is on; the check tested the middle against the
// coast reach without the half cell it gives the shape buffer, and stopped the upload.
const file = JSON.parse(readFileSync('scripts/tdwg3-shapes.json', 'utf8'));
describe('the typical cell is tested with the coast reach widened by half a cell (the walk check)', () => {
  it('Semiaquilegia adoxoides: the cell holding the islet record is inside Korea', () => {
    expect(cellTester(file).inRegion(36.275, 126.275, 'KOR')).toBe(true);
    // the base's tester (buffer widened, coast reach not) listed it
    expect(regionTester(file, SHAPE_BUFFER_DEG + 0.036).inRegion(36.275, 126.275, 'KOR')).toBe(false);
  });
  it('still outside: Aloe vera\'s old cell in Fujairah, and the open Yellow Sea', () => {
    expect(cellTester(file).inRegion(25.425, 56.175, 'OMA')).toBe(false);
    expect(cellTester(file).inRegion(36.0, 125.0, 'KOR')).toBe(false);
  });
});
