/**
 * Round eighty-five, G: the border rule, the islands and TDWG's scheme (the owner's decisions 1 to 3; reviews D4, A3 to A6,
 * B1), on the committed shapes file and the real coordinates the reviews give.
 *
 * - Decision 1: a record strictly inside a region's shape is that region's, native or not; the margin, the coast reach and
 *   the islands take a record only on no region's land, and only when its stated country is the region's.
 * - Decision 2: beyond every drawn coast's reach, a record on a minor island, or in the region's country within half a
 *   degree of it or in its box, is the region's (the Poor Knights, Macauley I.).
 * - Decision 3: Morocco's southern provinces parted at 27°40' N, Darjeeling in the East Himalaya, the Aru Is., Costa Rica's
 *   Cocos I. and Los Roques where TDWG's gazetteer files them.
 * - The records' reasons are counted (`readRecords`, `admissionRecord`) and the climate's cells carry them (`envelope`).
 *
 * FAILS on r85base: the tester has no `admit` (each test below calls it or the counts), the file has no countries,
 * islands or places, Tarfaya and Laâyoune are in no shape, Darjeeling is India's, and Khor Fakkan and Tweed Heads are in by
 * the margin.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, RANGE_RULE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { readRecords, rangeTest, admissionRecord, withPlace, extremesUpstream } from '../../src/lib/dossier/build';
import type { GbifOccurrence } from '../../src/lib/dossier/sources/gbif';
import type { Climate } from '../../src/lib/dossier/schema';
import { TDWG3 } from '../../src/lib/dossier/tdwg';
import { ADMISSION_POLICY } from '../../src/lib/dossier/admission-policy';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);
// Every region's shape is prepared on the first record off a native one: seconds on a busy machine, once.
beforeAll(() => { t.landOf(0, 0); }, 120_000);

describe('the shapes file of round eighty-five', () => {
  it('names its rule, and gives each region its countries, its islands and each polygon its place', () => {
    // Round eighty-seven: the policy's rule is r87, which reads the shapes file of r86 (`AdmissionPolicy.shapes`).
    expect(file.meta.rule).toBe(ADMISSION_POLICY.shapes);
    // Round eighty-six: the rule is r86 (`admission-policy.ts`; the file of r86 places Kashmir and adds GBIF's codes).
    expect(file.meta.rule).toBe('r86');
    expect(RANGE_RULE).toBe('r87');
    expect(file.countries?.OMA).toEqual(['OM']);
    expect(file.countries?.GST).toEqual(['AE', 'BH', 'QA']);
    expect(file.countries?.WSA).toEqual(['EH', 'MA']);
    expect(file.countries?.FRA).toContain('JE');
    expect(Object.keys(file.islands ?? {}).length).toBeGreaterThan(100);
    for (const c of Object.keys(file.shapes)) expect(file.places?.[c]?.length, c).toBe(file.shapes[c].length);
  });
});

describe('decision 1: the border rule', () => {
  const cases: Array<[string, number, number, string[], string | null, string | null]> = [
    // A5, D4: Aloe vera's record at Khor Fakkan (GBIF country AE), 0.02° from Oman's Madha enclave; and its typical cell.
    ['Aloe vera at Khor Fakkan, Sharjah', 25.345, 56.315, ['OMA'], 'AE', null],
    ['its typical cell, in Sharjah', 25.325, 56.325, ['OMA'], null, null],
    // B1: Cordyline fruticosa's record at Tweed Heads, 21 m stated, inside New South Wales; and Ixora coccinea's in Laos.
    ['Cordyline fruticosa at Tweed Heads (NSW)', -28.230027, 153.473134, ['QLD'], 'AU', null],
    ['Ixora coccinea in Vientiane', 17.948027, 102.621207, ['THA'], 'LA', null],
    // A5, D4: Dracaena trifasciata's typical cell, in Rwanda 2 km from Bukavu.
    ['the snake plant at Bukavu, on Rwanda\'s side', -2.475, 28.875, ['ZAI', 'BUR', 'TAN'], null, null],
    ['Fujairah (round eighty-four)', 25.437721, 56.168707, ['OMA'], 'AE', null],
    ['Muscat', 23.6, 58.4, ['OMA'], 'OM', 'strict'],
    ['Brisbane', -27.47, 153.02, ['QLD'], 'AU', 'strict'],
  ];
  for (const [what, lat, lon, codes, country, want] of cases) {
    it(`${what}: ${want ?? 'not in range'}`, () => expect(t.admit(lat, lon, codes, country)?.how ?? null).toBe(want));
  }
  it('the margin takes a record on no region\'s land only in the region\'s own country', () => {
    // A point at sea off Oman's coast, within the margin: in by Oman's country, not by the Emirates'.
    const sea = (() => { for (let d = 0.005; d < 0.05; d += 0.005) { const lat = 23.62 + d; if (!t.landOf(lat, 58.55).length && t.admit(lat, 58.55, ['OMA'], 'OM')) return lat; } return null; })();
    expect(sea).not.toBeNull();
    expect(t.admit(sea!, 58.55, ['OMA'], 'OM')?.how).toMatch(/buffer|coast/);
    expect(t.admit(sea!, 58.55, ['OMA'], 'AE')).toBeNull();
    // Round eighty-six (outside review B's 6): no country stated is no country guessed; the margin does not take it.
    expect(t.admit(sea!, 58.55, ['OMA'], null)).toBeNull();
  });
  it('a record inside a non-native region is that region\'s, whatever its distance from the native edge', () => {
    expect(t.landOf(-28.230027, 153.473134)).toEqual(['NSW']);
    expect(t.landOf(25.345, 56.315)).toEqual(['GST']);
  });
});

describe('decision 2: islands too small to draw', () => {
  it('the Poor Knights lily: Tawhiti Rahi by the coast reach, Aorangi (21 km off) by New Zealand\'s country', () => {
    expect(t.admit(-35.408, 174.648, ['NZN'], 'NZ')?.how).toBe('coast');
    expect(t.admit(-35.47, 174.735, ['NZN'], 'NZ')?.how).toBe('island');
    // Stating another country, or none, beyond the coast reach: not in.
    expect(t.admit(-35.47, 174.735, ['NZN'], 'AU')).toBeNull();
    expect(t.admit(-35.47, 174.735, ['NZN'], null)).toBeNull();
  });
  it('Macauley I., a degree south of the one Kermadec island Natural Earth draws, by the region\'s box', () => {
    expect(t.admit(-30.21, -178.45, ['KER'], 'NZ')?.how).toBe('island');
  });
  it('a minor island Natural Earth draws is its nearest region\'s: Ile du Levant is France\'s', () => {
    expect(t.admit(43.03, 6.45, ['FRA'], 'FR')?.how).toBe('island');
    expect(t.admit(43.03, 6.45, ['ITA'], 'FR')).toBeNull();
  });
});

describe("decision 3: TDWG's scheme", () => {
  const cases: Array<[string, number, number, string, boolean]> = [
    ['Laâyoune', 27.15, -13.2, 'WSA', true],
    ['Laâyoune, not Morocco', 27.15, -13.2, 'MOR', false],
    ['Dakhla', 23.7, -15.95, 'WSA', true],
    ['Smara', 26.74, -11.67, 'WSA', true],
    ['Tan-Tan', 28.44, -11.1, 'MOR', true],
    ['Darjeeling (EHM-DJ)', 27.04, 88.26, 'EHM', true],
    ['Darjeeling, not India', 27.04, 88.26, 'IND', false],
    ['Kalimpong', 27.06, 88.47, 'EHM', true],
    ['Kurseong', 26.88, 88.28, 'EHM', true],
    ['Kolkata', 22.57, 88.36, 'IND', true],
    ['Jalpaiguri', 26.52, 88.72, 'IND', true],
    ['the Aru Is. (gazetteer: NWG-IJ)', -6.2, 134.4, 'NWG', true],
    ['the Aru Is., not the Lesser Sundas', -6.2, 134.4, 'LSI', false],
    ["Costa Rica's Cocos I. (CPI-CO)", 5.53, -87.06, 'CPI', true],
    ['Los Roques (VNA-OO)', 11.857, -66.757, 'VNA', true],
    // A4 read the Snares as the Antipodean Is.'; TDWG's gazetteer files "Snares I." under NZS-OO.
    ['the Snares', -48.02, 166.6, 'NZS', true],
    ['the Snares, not the Antipodes', -48.02, 166.6, 'ATP', false],
    // Kenting lies off Natural Earth's own coast (unsimplified, Pingtung ends at 21.905° N): the margin takes it.
    ['Kenting', 21.9267, 120.7239, 'TAI', true]
  ];
  // The records off a drawn coast state their country, as GBIF's do (round eighty-six: the margin and the coast reach take
  // only a record that states the region's).
  const stated: Record<string, string> = { "Costa Rica's Cocos I. (CPI-CO)": 'CR', 'Los Roques (VNA-OO)': 'VE', Kenting: 'TW' };
  for (const [what, lat, lon, code, want] of cases) it(`${what}: ${want ? 'in' : 'not in'} ${code}`, () => expect(t.inRegion(lat, lon, code, stated[what] ?? null)).toBe(want));
  it('Tarfaya is Morocco\'s, by its own country', () => expect(t.admit(27.94, -12.93, ['MOR'], 'MA')).not.toBeNull());
});

describe('every record says why it is in range, and the dossier counts it', () => {
  const rec = (key: number, lat: number, lon: number, countryCode: string, license = 'CC_BY_4_0'): GbifOccurrence => ({ key, decimalLatitude: lat, decimalLongitude: lon, countryCode, basisOfRecord: 'HUMAN_OBSERVATION', license, coordinateUncertaintyInMeters: 30, year: 2020 }) as GbifOccurrence;
  it("Aloe vera: Khor Fakkan's record is out, Oman's are in, and each is counted by its reason", () => {
    const inside = rangeTest([{ code: 'OMA', box: TDWG3.OMA }], t)!;
    expect(inside.rule).toBe(RANGE_RULE);
    // Round eighty-six: the words are the policy's (`recordWords`).
    expect(inside.words).toContain("counted only when it states the region's country");
    const data = [rec(1, 25.345, 56.315, 'AE'), rec(2, 23.6, 58.4, 'OM'), rec(3, 22.95, 57.53, 'OM'), rec(4, 25.437721, 56.168707, 'AE', 'CC_BY_NC_4_0')];
    const r = readRecords(data, [TDWG3.OMA], true, undefined, inside.admit);
    expect(r.nOutside).toBe(2);
    expect(r.open.map((p) => p[3])).toEqual(['OM', 'OM']);
    expect(r.admitted).toEqual({ strict: 2, buffer: 0, coast: 0, island: 0 });
    expect(r.forClimate.map((p) => p[2])).toEqual(['strict', 'strict']);
    expect(admissionRecord(r, true)).toEqual({ admitted: { strict: 2, buffer: 0, coast: 0, island: 0 } });
  });
  it('the Poor Knights: the island\'s record is in, and listed off the shapes', () => {
    const inside = rangeTest([{ code: 'NZN', box: TDWG3.NZN }], t)!;
    const r = readRecords([rec(1, -35.47, 174.735, 'NZ'), rec(2, -36.85, 174.76, 'NZ'), rec(3, -35.408, 174.648, 'NZ')], [TDWG3.NZN], true, undefined, inside.admit);
    expect(r.nOutside).toBe(0);
    expect(r.admitted).toEqual({ strict: 1, buffer: 0, coast: 1, island: 1 });
    const a = admissionRecord(r, true);
    expect(a.edge).toEqual({ island: [r.open.findIndex((p) => p[0] === -35.47)], coast: [r.open.findIndex((p) => p[0] === -35.408)] });
  });
});

describe("the typical cell's place (A5) and the extremes' record (A8, S8)", () => {
  it("Schlumbergera truncata's typical cell is said to be in São Paulo", () => {
    const c = { status: 'ok', at: { lat: -22.625, lon: -47.175 } } as unknown as Climate;
    expect((withPlace(c, t) as { place?: string }).place).toBe('São Paulo, Brazil');
    expect((withPlace({ ...c, at: { lat: 25.325, lon: 56.325 } } as Climate, t) as { place?: string }).place).toBe('Sharjah, United Arab Emirates');
  });
  it('read and set aside is a reading: ok, with why, never "nothing to report"', () => {
    const c = { status: 'ok', extremesStatus: 'lapse', src: { extremes: 'NASA POWER (MERRA-2) daily 1981–2024, cell 30.5,78.1, lapse-corrected -311 m at 6.5 °C/km' } } as unknown as Climate;
    const up = extremesUpstream(c, 'the 1-in-100 night is warmer', '2026-11-01T00:00:00.000Z')!;
    expect(up.status).toBe('ok');
    expect(up.detail).toMatch(/; read, and set aside: the 1-in-100 night is warmer$/);
    expect(extremesUpstream({ ...c, extremesStatus: 'sea' } as Climate, null, 'x')!).toMatchObject({ status: 'ok', detail: expect.stringContaining('read, and set aside: the weather cell is mostly sea') });
    expect(extremesUpstream({ ...c, extremesStatus: 'none' } as Climate, null, 'x')!.status).toBe('none');
  });
});
