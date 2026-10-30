/**
 * Round eighty-four, G: the records' rules, on fixtures built from the real cases' coordinates (the reviews give them;
 * GBIF's bulk download is the owner's PC's).
 *
 * - A1, B1: every record that can reach a climate is tested against the shapes, restricted ones included, and the record of
 *   the sources says so and names the rule (`occurrences.rangeRule`): Aloe vera's restricted CC BY-NC records in Fujairah
 *   (occurrences 3398657448, 3398877447, 3399171466 at 25.437721, 56.168707, ±4,459 m) never reach its climate.
 * - D2, A2: Galanthus nivalis's and Melissa officinalis's Belgian records are outside France; Indigofera taiwaniana's
 *   Kenting records are inside Taiwan.
 * - A6f: the climate's reason counts records, not places, and says the placing as the rule's reading.
 * - D4: a page that lost its GBIF key carries none of the records read under it.
 *
 * FAILS on r84base: France and Taiwan are boxes there (Belgium in, Kenting out), `rangeRule`, `noPlacedWords`,
 * `nInRangeRecords` and `carry-core.ts` do not exist, and the words name no restricted record and no rule.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, RANGE_RULE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { rangeTest, readRecords, noPlacedWords } from '../../src/lib/dossier/build';
import { carriesCore } from '../../src/lib/dossier/carry-core';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

const t = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
const native = (codes: string[]) => codes.map((code) => ({ code, box: TDWG3[code] }));
type Rec = { key: number; decimalLatitude: number; decimalLongitude: number; basisOfRecord: string; license: string; datasetKey: string; coordinateUncertaintyInMeters?: number };
let k = 0;
const rec = (lat: number, lon: number, license = 'CC_BY_4_0', unc: number | null = 30): Rec => ({ key: ++k, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'HUMAN_OBSERVATION', license, datasetKey: 'd', ...(unc == null ? {} : { coordinateUncertaintyInMeters: unc }) });
const read = (codes: string[], recs: Rec[]) => {
  const n = native(codes);
  const r = rangeTest(n, t)!;
  return { test: r, out: readRecords(recs as never, n.map((x) => x.box), true, undefined, r.test) };
};

describe('A1, B1: restricted records are tested by the shapes, and the record says so', () => {
  it("Aloe vera: Oman's records read, the restricted ones in Fujairah left out", () => {
    const oman = [rec(23.07, 57.62), rec(23.1, 57.55), rec(23.24, 57.43), rec(23.36, 57.28), rec(23.5, 57.15), rec(23.57, 57.2), rec(23.08, 57.66)];
    const fujairah = [rec(25.437721, 56.168707, 'CC_BY_NC_4_0', 4459), rec(25.4377, 56.1688, 'CC_BY_NC_4_0', 4459), rec(25.4378, 56.1686, 'CC_BY_NC_4_0', 4459)];
    const { test, out } = read(['OMA'], [...oman, ...fujairah]);
    expect(out.open.length).toBe(7);
    expect(out.restrictedInRange.length).toBe(0);
    expect(out.nOutside).toBe(1); // the three records share a three-decimal place
    expect(out.forClimate.every(([lat]) => lat < 24)).toBe(true);
    expect(test.words).toMatch(/^records tested against the native regions' shapes, openly licensed and restricted alike \(Natural Earth/);
    expect(test.words).toContain(`shapes rule ${RANGE_RULE}`);
    expect(test.rule).toBe(RANGE_RULE);
  });
  it('Ficus elastica: a record in the West Bengal Sundarbans is outside Bangladesh, Assam, the East Himalaya and Myanmar', () => {
    const { out } = read(['BAN', 'ASS', 'EHM', 'MYA'], [rec(22.13183, 88.5994, 'CC_BY_NC_4_0', 1032), rec(24.9, 91.87)]);
    expect(out.nOutside).toBe(1);
    expect(out.restrictedInRange).toEqual([]);
  });
});

describe('D2 and A2: the regions once tested by their boxes', () => {
  it("Galanthus nivalis: Belgian records are outside France's shape; a French one is in", () => {
    const { out } = read(['AUT', 'CZE', 'GER', 'HUN', 'POL', 'SWI', 'FRA', 'SPA'], [rec(50.875, 5.475, 'CC_BY_NC_4_0'), rec(50.586, 4.53), rec(48.6, 7.75)]);
    expect(out.nOutside).toBe(2);
    expect(out.open.map((p) => p[0])).toEqual([48.6]);
  });
  it('Melissa officinalis: records in Belgium, Luxembourg and Britain are outside its native range; Corsica is in', () => {
    const { out } = read(['BAL', 'COR', 'FRA', 'POR', 'SAR', 'SPA', 'ALB', 'BUL'], [rec(50.809, 3.695), rec(49.61, 6.13), rec(51.2, 0.9), rec(42.15, 9.1)]);
    expect(out.nOutside).toBe(3);
    expect(out.open.map((p) => p[0])).toEqual([42.15]);
  });
  it('Indigofera taiwaniana: the Kenting records, south of the box Taiwan had, are in its range', () => {
    const { test, out } = read(['TAI'], [rec(21.9267, 120.7239, 'CC_BY_4_0', 1000), rec(21.95, 120.78), rec(24.5, 121.2)]);
    expect(out.nOutside).toBe(0);
    expect(out.forClimate.length).toBe(3);
    expect(test.words).not.toMatch(/bounding box/);
  });
});

describe('A6f: the climate\'s reason counts records', () => {
  it('four records at two places, none placed well enough: said as four records, by the rule', () => {
    // Dionysia iranica's case: GBIF holds 4 records, the page said "2". Herbarium sheets with no stated accuracy.
    const sheet = (lat: number, lon: number): Rec => ({ ...rec(lat, lon, 'CC_BY_4_0', null), basisOfRecord: 'PRESERVED_SPECIMEN' });
    const { out } = read(['IRN'], [sheet(32.1, 51.6), sheet(32.1, 51.6), sheet(32.1, 51.6), sheet(33.5, 50.2)]);
    expect(out.forClimate.length).toBe(0);
    expect(out.allPts.length).toBe(2);
    expect(out.nInRangeRecords).toBe(4);
    expect(noPlacedWords(out.nInRangeRecords, out.allPts.length)).toBe("4 in-range records at 2 places, none placed to within 10 km by the climate's rule (none states an accuracy of 10 km or better, and none is a person's observation given to three decimals)");
    expect(noPlacedWords(1, 1)).toMatch(/^1 in-range record, none placed/);
  });
});

describe('D4: the snapshot of a build is never carried to a page without its key', () => {
  const ok = { status: 'ok' };
  const prev = { v: 3, ids: { gbif: 9479204 }, upstream: { 'gbif.occurrences': ok, 'wcvp.distribution': ok } };
  it('Xanthoceras sorbifolium, built from Kew\'s file with no key: its records under 9479204 are not carried', () => {
    expect(carriesCore(prev, { v: 3, ids: {}, upstream: { 'gbif.occurrences': { status: 'skipped' }, 'wcvp.distribution': ok } }, true)).toBe(false);
    expect(carriesCore(prev, { v: 3, ids: {}, upstream: { 'gbif.occurrences': { status: 'skipped' }, 'wcvp.distribution': ok } }, false)).toBe(false);
    // The live page: keyless already, its records carried once: still not carried again.
    expect(carriesCore({ v: 3, ids: {}, upstream: { 'gbif.occurrences': ok, 'wcvp.distribution': ok } }, { v: 3, ids: {}, upstream: { 'gbif.occurrences': { status: 'skipped' }, 'wcvp.distribution': ok } }, true)).toBe(false);
  });
  it('a page under another key now carries nothing; the same key still carries through a refusal', () => {
    expect(carriesCore(prev, { v: 3, ids: { gbif: 1 }, upstream: { 'gbif.occurrences': { status: 'refused' }, 'wcvp.distribution': ok } }, false)).toBe(false);
    expect(carriesCore(prev, { v: 3, ids: { gbif: 9479204 }, upstream: { 'gbif.occurrences': { status: 'refused' }, 'wcvp.distribution': ok } }, false)).toBe(true);
    expect(carriesCore(prev, { v: 3, ids: { gbif: 9479204 }, upstream: { 'gbif.occurrences': ok, 'wcvp.distribution': ok } }, false)).toBe(false);
  });
});
