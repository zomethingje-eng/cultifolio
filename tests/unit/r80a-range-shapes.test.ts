/**
 * Round eighty, agent A (review-w 5): the range test was each WGSRPD region's bounding box, and Tanzania's (south -11.74,
 * west 29.34, north -1.0, east 40.43) holds Nairobi, so the snake plant's marker and climate came from Kenya, outside its
 * range. TDWG's own polygons are not openly licensed (their metadata reserves the boundaries' rights to ESRI), so the
 * shapes are made from Natural Earth's states and provinces (public domain) by TDWG's own tables
 * (`scripts/dev/r80a-tdwg-shapes.py`, `scripts/tdwg3-shapes.json`): 243 of the 369 regions; the others keep their box.
 * On round seventy-seven's corpus, 13,490 of 1,125,954 open in-range records (1.2%) on 1,953 of 7,760 pages fall outside
 * every native region's shape. FAILED on r80f: no shapes, and Nairobi was in Tanzania's range.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { rangeTest, readRecords } from '../../src/lib/dossier/build';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);

describe("the range test by the regions' shapes", () => {
  it('Nairobi is in Kenya, not in Tanzania, though in Tanzania\'s box; Dar es Salaam and Arusha are in Tanzania', () => {
    expect(t.hasShape('TAN') && t.hasShape('KEN')).toBe(true);
    expect(t.inRegion(-1.253, 36.81, 'TAN')).toBe(false);
    expect(t.inRegion(-1.253, 36.81, 'KEN')).toBe(true);
    expect(t.inRegion(-6.8, 39.28, 'TAN')).toBe(true);
    expect(t.inRegion(-3.37, 36.68, 'TAN')).toBe(true);
  });
  it('a record just off the coast is inside (the buffer), one far off is not', () => {
    expect(t.inRegion(-6.8, 39.33, 'TAN')).toBe(true); // Dar es Salaam's harbour mouth
    expect(t.inRegion(-6.8, 40.3, 'TAN')).toBe(false); // the open sea, inside the box
  });
  it('a region without a shape is its box, as before', () => {
    const none = Object.keys(TDWG3).find((c) => !t.hasShape(c))!;
    const b = TDWG3[none];
    expect(t.inRegion((b.s + b.n) / 2, b.w <= b.e ? (b.w + b.e) / 2 : b.w, none)).toBe(true);
    expect(file.meta.source).toMatch(/Natural Earth.*public domain/);
  });
  it("the build reads the shapes and says so; the snake plant's Nairobi records are outside its range", () => {
    const native = ['NGA', 'CAF', 'CMN', 'CON', 'EQG', 'GAB', 'ZAI', 'TAN'].map((code) => ({ code, box: TDWG3[code] }));
    const r = rangeTest(native, t)!;
    expect(r.words).toMatch(/^records tested against (the native regions'|\d+ of the 8 native regions') shapes/);
    const rec = (lat: number, lon: number) => ({ key: 1, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', datasetKey: 'd', coordinateUncertaintyInMeters: 10 });
    const read = readRecords([rec(-1.253, 36.81), rec(-6.8, 39.28), rec(4.36, 18.56)], native.map((n) => n.box), true, undefined, r.test);
    expect(read.nOutside).toBe(1);
    expect(read.open.map((p) => p[0])).toEqual([-6.8, 4.36]);
    // Without the shapes, the box test as before: Nairobi counted inside.
    expect(readRecords([rec(-1.253, 36.81)], native.map((n) => n.box), true).nOutside).toBe(0);
  });
});
