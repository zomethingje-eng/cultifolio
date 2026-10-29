/**
 * Round eighty-three, agent C: the climate review (independent review 1's 40) at the corpus's full size. Three rules.
 *
 * 1. The regions' shapes. Of the 101 live pages that lost their habitat climate in the repair of 29 October 2026, 68 lost
 *    no record at a default point: the shapes took their records out. TDWG's tables write the former Yugoslavia's units
 *    under YU (no state or province carries it) and Slovenia under SL (Sierra Leone's), so Yugoslavia's shape was Croatia
 *    and Macedonia (Picea omorika, Campanula hercegovina, Primula carniolica lost every record); Natural Earth gives
 *    Somaliland, South Sudan, Northern Cyprus, the West Bank and Gaza no code of the tables, so Somalia's, Sudan's,
 *    Cyprus's and Palestine's shapes left them out; and 570 islets were dropped by the simplification. FAILED on r83b.
 * 2. The default points. Of 100 of the 5,187 points, sampled from those the repair took out of 702 live pages and read
 *    on GBIF: 37 survey plots and quadrats, 39 local floras' centres, 14 herbarium or municipal localities, 4 atlas grid
 *    cells, 2 published localities and 4 centroids. A record its dataset states placed to within 10 km (the climate's
 *    own line) is now kept.
 *    FAILED on r83b: left out.
 * 3. The cold floor. Eulychnia acida's 1-in-100 night (7.5 °C) is warmer than the coldest month's mean nightly low
 *    (6.8 °C): set aside, as a record low warmer than it already was. FAILED on r83b: kept.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { readRecords, defaultWords } from '../../src/lib/dossier/build';
import { lapseSetAside } from '../../src/lib/core/lapse';
import { setAsideExtremes, type Dossier } from '../../src/lib/dossier/schema';
import { pointKey } from '../../src/lib/dossier/default-points';
import { shapesRegained, defaultLeftOut, repairList, changedRegions } from '../../src/lib/dossier/repair-r83';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);

describe("1. the regions' shapes hold the whole region", () => {
  it('Yugoslavia: Bosnia, Slovenia, Serbia, Montenegro and Kosovo as well as Croatia and Macedonia; not Sofia, Tirana or Budapest', () => {
    for (const [lat, lon] of [[43.86, 18.41], [46.05, 14.51], [44.8, 20.47], [42.44, 19.26], [42.66, 21.17], [45.81, 15.98], [41.99, 21.43]]) expect(t.inRegion(lat, lon, 'YUG')).toBe(true);
    // Picea omorika's own records (live, the Drina valley, Zlatibor) and Primula carniolica's (Idrija)
    expect(t.inRegion(43.92, 19.425, 'YUG')).toBe(true);
    expect(t.inRegion(45.989, 13.845, 'YUG')).toBe(true);
    for (const [lat, lon] of [[42.7, 23.32], [41.33, 19.82], [47.5, 19.04]]) expect(t.inRegion(lat, lon, 'YUG')).toBe(false);
  });
  it('Somaliland in Somalia, South Sudan in Sudan, the West Bank and Gaza in Palestine, the north in Cyprus, Aland in Finland', () => {
    expect(t.inRegion(9.56, 44.06, 'SOM')).toBe(true); // Hargeisa
    expect(t.inRegion(10.62, 47.37, 'SOM')).toBe(true); // Erigavo, Salvia somalensis's Sanaag
    expect(t.inRegion(4.85, 31.58, 'SUD')).toBe(true); // Juba
    expect(t.inRegion(31.9, 35.2, 'PAL')).toBe(true);
    expect(t.inRegion(31.5, 34.47, 'PAL')).toBe(true);
    expect(t.inRegion(35.34, 33.32, 'CYP')).toBe(true); // Kyrenia
    expect(t.inRegion(60.1, 19.94, 'FIN')).toBe(true); // Mariehamn
    expect(t.inRegion(9.56, 44.06, 'ETH')).toBe(false);
  });
  it('an islet is kept: the Maldives, Nauru', () => {
    expect(t.inRegion(4.175, 73.509, 'MDV')).toBe(true);
    expect(t.hasShape('NRU') && t.inRegion(-0.52, 166.93, 'NRU')).toBe(true);
    expect(file.meta.regions).toBe(244);
  });
  it('the shapes still keep Nairobi out of Tanzania (round eighty)', () => {
    expect(t.inRegion(-1.253, 36.81, 'TAN')).toBe(false);
  });
});

const rec = (lat: number, lon: number, o: Record<string, unknown> = {}) => ({ key: 1, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', datasetKey: 'd', ...o });

describe('2. a record at a default point placed to within 10 km is kept', () => {
  const box = { s: -30, w: 140, n: -10, e: 154 };
  const defaults = new Set([pointKey(-17.872, 145.617), pointKey(23.874, -101.554)]);
  it("a survey plot's record (stated 20 m) is kept, on the map and in the climate; a centroid's sample with no figure is not", () => {
    const r = readRecords([rec(-17.872, 145.617, { basisOfRecord: 'OCCURRENCE', coordinateUncertaintyInMeters: 20 }), rec(-17.872, 145.617, { basisOfRecord: 'MATERIAL_SAMPLE', datasetKey: 'g' }), rec(-20.1, 146.2, { coordinateUncertaintyInMeters: 50, year: 2020 })], [box], true, undefined, undefined, defaults);
    expect(r.nDefault).toBe(1);
    expect(r.open.map((p) => p[0]).sort((a, b) => a - b)).toEqual([-20.1, -17.872]);
    expect(r.forClimate.map((p) => p[0]).sort((a, b) => a - b)).toEqual([-20.1, -17.872]);
  });
  it("a record stated to 201 km (French Guiana's middle) is left out, and so is one with no figure, whatever its decimals (a checklist placed at one point)", () => {
    const r = readRecords([rec(-17.872, 145.617, { coordinateUncertaintyInMeters: 201367 }), rec(-17.872, 145.617, { coordDecimals: 3, license: 'CC0_1_0' })], [box], true, undefined, undefined, defaults);
    expect(r.nDefault).toBe(2);
    expect(r.open).toHaveLength(0);
  });
  it('the words say so', () => {
    expect(defaultWords(3)).toMatch(/^3 records at a dataset's default point left out \(.*; a record there its dataset states to within 10 km is kept\)$/);
  });
});

describe('3. a 1-in-100 night warmer than the coldest month is set aside', () => {
  const months = (cold: number) => Array.from({ length: 12 }, (_, i) => ({ tmin: i === 6 ? cold : cold + 5 }));
  it("Eulychnia acida (live, 29 October 2026): 7.5 °C against 6.8 °C", () => {
    const why = lapseSetAside({ months: months(6.8), extremes: { minAbs: 4.3, minP01: 7.5, lapseAppliedM: -432 } });
    expect(why).toMatch(/the 1-in-100 night, 7.5 °C, is warmer than the coldest month's mean nightly low across the range, 6.8 °C/);
  });
  it('Cedrus deodara (−2.8 °C against −2.4 °C) and a night equal to the mean stand', () => {
    expect(lapseSetAside({ months: months(-2.4), extremes: { minAbs: -11.1, minP01: -2.8, lapseAppliedM: -814 } })).toBeNull();
    expect(lapseSetAside({ months: months(6.8), extremes: { minAbs: 4.3, minP01: 6.8, lapseAppliedM: 0 } })).toBeNull();
  });
  it('the reader sets it aside and keeps it, as it does a lapse beyond 1,000 m', () => {
    const c = { status: 'ok', months: months(6.8), extremes: { years: 44, minAbs: 4.3, minP01: 7.5, maxP99: 32.9, frostDaysPerYear: 0, frostNights: 0, lapseAppliedM: -432 }, extremesStatus: 'ok', landFraction: 1 } as unknown as Dossier['climate'];
    const out = setAsideExtremes(c) as { extremes?: unknown; extremesLapse?: { minP01: number }; extremesStatus?: string };
    expect(out.extremes).toBeUndefined();
    expect(out.extremesStatus).toBe('lapse');
    expect(out.extremesLapse?.minP01).toBe(7.5);
  });
});

describe('the pages to derive again (--list-r83-repair)', () => {
  const sq = (s: number, w: number, n: number, e: number) => [[[w * 1000, s * 1000], [e * 1000, s * 1000], [e * 1000, n * 1000], [w * 1000, n * 1000], [w * 1000, s * 1000]]];
  const before = regionTester({ meta: { source: 'test' }, shapes: { YUG: [sq(42, 13, 46.9, 16.5)] } } as unknown as ShapesFile);
  const now = regionTester({ meta: { source: 'test' }, shapes: { YUG: [sq(42, 13, 46.9, 16.5), sq(42, 16.5, 45.3, 19.6)] } } as unknown as ShapesFile);
  const page = (key: string, gbif: number, open: Array<[number, number]>, detail = '') => ({ key, name: { scientific: key }, ids: { gbif }, distribution: { native: [{ code: 'YUG' }] }, occurrences: { open, rangeTested: true }, upstream: { 'gbif.occurrences': { detail } } });
  it('a record in Bosnia, outside the shape before and inside it now, lists the page; one in Croatia does not', () => {
    expect(shapesRegained(page('a', 1, [[43.86, 18.41], [45.81, 15.98]]), before, now)).toBe(1);
    expect(shapesRegained(page('b', 2, [[45.81, 15.98]]), before, now)).toBe(0);
  });
  it('a page saying records were left out at a default point is listed; a page whose id changed is found by its GBIF key', () => {
    expect(defaultLeftOut(page('c', 3, [], `GBIF occurrence download …; ${defaultWords(14)}; records tested`))).toBe(14);
    const current = [page('k1', 1, []), page('k2', 2, []), page('k3', 3, [], defaultWords(2))];
    const copy = [page('g1', 1, [[43.86, 18.41]]), page('k2', 2, [[45.81, 15.98]])];
    const r = repairList(current, copy, before, now);
    expect(r.lines).toEqual(["k1 k1\t1 open record inside a native region's shape now, outside them before", 'k3 k3\t2 records at a default point left out']);
    expect([r.regained, r.defaults]).toEqual([1, 1]);
  });
  it('without the copy, a page of a changed region with records outside its range is listed', () => {
    const changed = changedRegions({ shapes: { YUG: [sq(42, 13, 46.9, 16.5)], KEN: [sq(-4, 34, 4, 41)] } }, { shapes: { YUG: [sq(42, 13, 46.9, 16.5), sq(42, 16.5, 45.3, 19.6)], KEN: [sq(-4, 34, 4, 41)] } });
    expect([...changed]).toEqual(['YUG']);
    const out = (key: string, n: number) => ({ ...page(key, 9, []), occurrences: { open: [], rangeTested: true, nOutsideRange: n } });
    const r = repairList([out('m', 22), out('n', 0)], null, before, now, changed);
    expect(r.lines).toEqual(['m m\tthe shape of YUG changed and 22 records lie outside the range']);
  });
});
