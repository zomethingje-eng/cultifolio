/**
 * Round eighty, agent A (review-d 9): a MATERIAL_SAMPLE record with no year at 23.874, -101.554, one dataset's default
 * location for Mexico, was on the map of five sampled cacti and counted toward their markers. The rule, read from the
 * reference's own records: a coordinate where the open in-range records of 20 species or more lie, 95% of them or more
 * with no year, is a default point, and a record there is left out of the map, the marker and the climate, and counted.
 * Round seventy-seven's corpus: 18 such points on 593 of 8,947 pages. FAILED on r80f: no rule, and the record was kept.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultPoints, parseDefaultPoints, pointKey, formatDefaultPoints } from '../../src/lib/dossier/default-points';
import { readRecords } from '../../src/lib/dossier/build';

const rec = (lat: number, lon: number, year?: number) => ({ key: 1, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'MATERIAL_SAMPLE', license: 'CC_BY_4_0', datasetKey: 'd', ...(year ? { year } : {}) });

describe('default points', () => {
  it('a point of 20 species, nearly all undated, is one; a dated survey plot of 20 species is not', () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({ open: [[23.874, -101.554, null], [-25.6, 28.1, 2001 + i]] as Array<[number, number, number | null]> }));
    const ps = defaultPoints(pages);
    expect(ps.map((p) => p.key)).toEqual(['23.874,-101.554']);
    expect(parseDefaultPoints(formatDefaultPoints(ps, ['x']))).toEqual(new Set(['23.874,-101.554']));
    expect(defaultPoints(pages.slice(0, 19))).toEqual([]);
  });
  it('a record at one is left out of the map and the marker, and counted', () => {
    const box = { s: 14, w: -118, n: 33, e: -86 };
    const r = readRecords([rec(23.874, -101.554), rec(24.1, -101.2, 2010), rec(24.2, -101.3, 2011), rec(24.3, -101.25, 2012)], [box], true, undefined, undefined, new Set([pointKey(23.874, -101.554)]));
    expect(r.nDefault).toBe(1);
    expect(r.open.map((p) => p[0])).toEqual([24.1, 24.2, 24.3]);
  });
  it('the committed list holds Mexico\'s point', () => {
    expect(parseDefaultPoints(readFileSync('scripts/default-points.txt', 'utf8')).has('23.874,-101.554')).toBe(true);
  });
});
