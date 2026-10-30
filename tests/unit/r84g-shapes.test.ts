/**
 * Round eighty-four, G (reviews D2, A2, W1): the regions' shapes for 366 of the 369 regions, where round eighty-three's file
 * had 244 and tested the other 125 by their bounding boxes (France's box holds Belgium and southern England; Japan's
 * failed for the Bonin Islands, the Cape Provinces' for Marion Island, Great Britain's for an unplaced county); and a box
 * tested with the shape's buffer (Taiwan's box ends at 21.928° N, its tip is at 21.897° N).
 *
 * Every place below is tested by the code's own range test on the committed file. FAILS on r84base: France, Great Britain,
 * Taiwan, Japan, the Cape Provinces, Turkey and Greece have no shape there (their boxes hold Belgium, Seoul, Windhoek and
 * Samos), Latvia was in no shape, and Kenting is outside Taiwan's unbuffered box.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, grownBox, SHAPES_FILE, SHAPE_BUFFER_DEG, RANGE_RULE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);

describe("round eighty-four's shapes", () => {
  it('366 of the 369 regions have a shape; the file names its rule', () => {
    expect(Object.keys(file.shapes).length).toBe(366);
    expect(file.meta.regions).toBe(366);
    expect(file.meta.rule).toBe(RANGE_RULE);
    expect(t.rule).toBe(RANGE_RULE);
    // The three left: no state or province of Natural Earth draws Cocos (Keeling) or Christmas Is.; TDWG gives the Spratly Is. no country.
    expect(Object.keys(TDWG3).filter((c) => !t.hasShape(c)).sort()).toEqual(['CKI', 'SCS', 'XMS']);
  });

  const cases: Array<[string, number, number, string, boolean]> = [
    // D2: the snowdrop's typical spot, Belgian Limburg, was inside France's box.
    ['Belgian Limburg (Galanthus nivalis)', 50.875, 5.475, 'FRA', false],
    ['Belgium, the snowdrop marker', 50.586, 4.53, 'FRA', false],
    ['Melissa officinalis in Belgium', 50.809, 3.695, 'FRA', false],
    ['Luxembourg', 49.61, 6.13, 'FRA', false],
    ['Paris', 48.85, 2.35, 'FRA', true],
    ['Jersey (the Channel Is. are France\'s region in TDWG)', 49.21, -2.13, 'FRA', true],
    ['London', 51.52, -0.1, 'GRB', true],
    ['Devon', 50.72, -3.53, 'GRB', true],
    ['Isle of Man', 54.23, -4.55, 'GRB', true],
    // A2: Indigofera taiwaniana's records at Kenting.
    ['Kenting, 1991 specimens', 21.9267, 120.7239, 'TAI', true],
    ['Taipei', 25.03, 121.56, 'TAI', true],
    ['Fujairah (Aloe vera)', 25.437721, 56.168707, 'OMA', false],
    ['Cape Town', -33.92, 18.42, 'CPP', true],
    ['Windhoek', -22.56, 17.08, 'CPP', false],
    ['Marion Island, its own region', -46.9, 37.75, 'MPE', true],
    ['Marion Island, not the Cape', -46.9, 37.75, 'CPP', false],
    ['Tokyo', 35.68, 139.7, 'JAP', true],
    ['Seoul (Rhododendron indicum)', 37.56, 126.97, 'JAP', false],
    ['the Bonin Islands', 27.09, 142.2, 'OGA', true],
    ['Samos (Punica granatum)', 37.689, 26.94, 'TUR', false],
    ['Samos', 37.689, 26.94, 'EAI', true],
    ['Naxos, in the Cyclades', 37.07, 25.47, 'GRC', true],
    ['Naxos, not the East Aegean', 37.07, 25.47, 'EAI', false],
    ['Edirne', 41.67, 26.56, 'TUE', true],
    ['Bursa', 40.18, 29.06, 'TUR', true],
    ['the Gallipoli peninsula', 40.35, 26.5, 'TUE', true],
    ['the Asian shore of the Dardanelles', 40.05, 26.6, 'TUR', true],
    ['Riga (Latvia was in no shape)', 56.95, 24.1, 'BLT', true],
    ['Minsk', 53.9, 27.56, 'BLR', true],
    ['Simferopol', 44.95, 34.1, 'KRY', true],
    ['Moscow', 55.75, 37.6, 'RUC', true],
    ['Tula', 54.2, 37.6, 'RUC', true],
    ['Navassa Island', 18.4, -75.01, 'HAI', true],
    ['Socotra', 12.5, 53.9, 'SOC', true],
    ['Socotra, not Yemen', 12.5, 53.9, 'YEM', false],
    ['Unalaska', 53.87, -166.53, 'ALU', true],
    ['Labrador', 53.3, -60.4, 'LAB', true],
    ['Nelson, South Island', -41.27, 173.28, 'NZS', true],
    ['Brasilia', -15.8, -47.9, 'BZC', true],
    ['Venezuela (Drosera biflora)', 7.5, -63.2, 'VEN', true],
    ['Colombia, outside Venezuela', 4.6, -74.08, 'VEN', false],
    ['Rapa, Austral Islands', -27.6, -144.33, 'TUB', true],
    // At sea, or on an islet Natural Earth does not draw: the region whose coast is nearest, within about 17 km.
    ["Ile du Levant (not drawn), France's", 43.03, 6.45, 'FRA', true],
    ['the Frioul islands off Marseille', 43.28, 5.3, 'FRA', true],
    ['the Channel, 12 km off Eastbourne: England\'s', 50.65, 0.3, 'GRB', true],
    ['the Channel, 12 km off Eastbourne: not France\'s', 50.65, 0.3, 'FRA', false],
    ['the open sea off Dar es Salaam, 100 km out', -6.8, 40.3, 'TAN', false]
  ];
  it.each(cases)('%s (%f, %f): in %s is %s', (_name, lat, lon, code, inside) => {
    expect(t.hasShape(code)).toBe(true);
    expect(t.inRegion(lat, lon, code)).toBe(inside);
  });

  it('round eighty-three\'s shapes are unchanged but for Santa Fe joining Argentina Northeast, Navassa Haiti, and four islets', () => {
    // Santa Fe province: TDWG's table writes it under Argentina South, whose box ends 5° south of it; the box of Argentina Northeast holds it.
    expect(t.inRegion(-31.63, -60.7, 'AGE')).toBe(true);
    expect(t.inRegion(-31.63, -60.7, 'AGS')).toBe(false);
  });
});

describe('a box is tested with the same buffer as a shape (A2)', () => {
  const none = 'CKI';
  const b = TDWG3[none];
  it('a record a little outside a box with no shape is inside, one further is not', () => {
    expect(t.hasShape(none)).toBe(false);
    expect(t.inRegion(b.s - 0.03, (b.w + b.e) / 2, none)).toBe(true);
    expect(t.inRegion(b.s - SHAPE_BUFFER_DEG - 0.02, (b.w + b.e) / 2, none)).toBe(false);
    expect(regionTester(file, 0).inRegion(b.s - 0.03, (b.w + b.e) / 2, none)).toBe(false);
  });
  it('a grown box across the antimeridian stays one', () => {
    const g = grownBox({ s: 0, w: 179.98, n: 1, e: -179.9 }, 0.05);
    expect([g.s, g.n, g.w, g.e].map((x) => Math.round(x * 1000) / 1000)).toEqual([-0.05, 1.05, 179.93, -179.85]);
    expect(grownBox({ s: 0, w: -179.98, n: 1, e: 179.99 }, 0.05).w).toBeCloseTo(179.97, 5);
  });
});
