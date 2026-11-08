/**
 * Round eighty-six, the ranges agent: the range test's admission policy, one typed object (`admission-policy.ts`), and the
 * shapes file of rule r86. On real records (GBIF's answers saved by review D, `fixtures/r86r-records.json`) and real
 * places.
 *
 * 1. Outside review B's 6, review D4: `tdwg-shapes.ts` `ours` read "no country" as "ours", so the margin and the coast reach
 *    let in a record that states no country. Now the policy says what each clause takes, and a record that states no
 *    country is let in only inside a shape, a shapeless region's box or on a minor island. The border tolerance (D4): a
 *    record 0.02° or less inside a neighbouring region's shape counts for the native one by its stated country (Begonia
 *    faustinoi's Union Juarez specimen, Mexico's, 0.005° over Guatemala's line; Hieracium bombycinum's Larra record, Spain's,
 *    in France's shape), and, where both regions are of its country, by its stated state (Albuca fastigiata's Sentinel
 *    records: the four stating the Free State in, the five stating KwaZulu-Natal out). Khor Fakkan (AE) and Tweed Heads
 *    (0.03°, beyond the tolerance) stay out. The state is read from the download (`OCC_TERMS`, `SQL_SELECT`, the sample).
 *    The derivation, the check (`range-check.ts`), each page's words and /about/how read the one object.
 * 2. The plan's B3: the codes GBIF states for Svalbard (SJ), Bouvet I. (BV), the Caribbean Netherlands (BQ), Saint-Martin
 *    (MF) and Clipperton I. (CP) were no region's country, so a record off those coasts stating its own code was out.
 * 3. The plan's B4: Gilgit-Baltistan and Azad Kashmir were Pakistan's; TDWG's gazetteer files Gilgit and Baltistan under
 *    WHM-JK, the West Himalaya. Polystichum sinense's typical spot (Azad Kashmir) and its Baltistan record (35.081 N,
 *    76.031 E, in no shape before: the east of the Northern Areas was cut away) are the West Himalaya's.
 * 4. The plan's B5: the island reach stops at a foreign coast. Artemisia chinensis's records off Taiwan's Pengjia Islet,
 *    stating TW, were China Southeast's "islands" by its box, though Japan's Nansei-shoto is nearer than any land of China
 *    Southeast's.
 *
 * On r86base: 1 FAILED (no `admission-policy.ts`; the margin and the coast reach took a record with no country; Begonia
 * faustinoi's, Hieracium's and the Free State records were out; no `stateProvince` in the download's terms), 2 FAILED (no
 * SJ, BV, BQ, MF or CP), 3 FAILED (Gilgit and Muzaffarabad in Pakistan; the Baltistan record in no shape), 4 FAILED (the
 * Pengjia records admitted).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, RANGE_RULE, type ShapesFile } from '$dossier/tdwg-shapes';
import { ADMISSION_POLICY, POLICY_R85, POLICY_R86, policyWords, recordWords, stateKey } from '$dossier/admission-policy';
import { cellTester, checkPage } from '$dossier/range-check';
import { rangeTest, readRecords } from '$dossier/build';
import { occHeader, parseOccRow, OccIndex, OCC_TERMS, SQL_SELECT } from '$dossier/bulk';
import type { GbifOccurrence } from '$dossier/sources/gbif';
import { TDWG3 } from '$dossier/tdwg';
import { aboutText } from '../about-pages';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);
const R = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')) as { records: Record<string, Array<GbifOccurrence & { stateProvince?: string; locality?: string }>> };
const rec = (page: string, key: number) => R.records[page].find((r) => r.key === key)!;

describe('1. one admission policy', () => {
  it('is typed, named r86, and the tester, the check and the words read it', () => {
    expect(ADMISSION_POLICY).toBe(POLICY_R86);
    expect(RANGE_RULE).toBe('r86');
    expect(file.meta.rule).toBe('r86');
    expect(t.policy).toBe(ADMISSION_POLICY);
    expect(POLICY_R86.missingCountry).toEqual({ margin: false, coast: false, island: false });
    expect(POLICY_R85.missingCountry).toEqual({ margin: true, coast: true, island: true });
    expect(POLICY_R86.borderDeg).toBe(0.02);
    expect(POLICY_R86.islandStopsAt).toBe('other-country');
    // The check's cell tester reads the same policy, its reaches widened by half a cell; a cell states no country.
    expect(cellTester(file).policy.borderDeg).toBe(POLICY_R86.borderDeg);
    expect(cellTester(file).policy.marginDeg).toBeGreaterThan(POLICY_R86.marginDeg);
    // Each page's record of its sources says the policy's words.
    expect(rangeTest([{ code: 'OMA', box: TDWG3.OMA }], t)!.words).toContain(recordWords(POLICY_R86));
  });
  it('/about/how says the policy: every sentence of it is on the page, so the page changes when the rule does', () => {
    const how = aboutText('how');
    const w = policyWords(ADMISSION_POLICY);
    for (const [k, s] of Object.entries(w)) expect(how, k).toContain(s);
    // Round eighty-six (final review): a record on a native minor island needs no country, so the summary says so; the
    // coast reach takes only a record stating the region's country, so the glossary says so.
    expect(w.summary).toContain("unless it lies on one of Natural Earth's minor islands placed in that region and states no other country");
    expect(w.summary).toContain('where it names a state or province the shapes can match to one of the two regions, by that state');
    expect(w.glossCoast).toContain("Only for a record that states that region's country.");
    expect(how).not.toContain('only by its stated country and, where it names one, its state'); // base
  });
});

describe("1. a record that states no country is not guessed into a region (outside review B's 6)", () => {
  const before = regionTester(file, POLICY_R85);
  it("Kenting's specimen, just off Taiwan's drawn coast: in by the margin with TW, out with no country (r85: in)", () => {
    expect(t.admit(21.9267, 120.7239, ['TAI'], 'TW')?.how).toBe('buffer');
    expect(t.admit(21.9267, 120.7239, ['TAI'], null)).toBeNull();
    expect(before.admit(21.9267, 120.7239, ['TAI'], null)?.how).toBe('buffer');
  });
  it('Tawhiti Rahi, the Poor Knights lily\'s island: off the coast with NZ, out with no country (r85: in)', () => {
    expect(t.admit(-35.408, 174.648, ['NZN'], 'NZ')?.how).toBe('coast');
    expect(t.admit(-35.408, 174.648, ['NZN'], null)).toBeNull();
    expect(before.admit(-35.408, 174.648, ['NZN'], null)?.how).toBe('coast');
  });
  it('inside a shape, a shapeless box or on a minor island, no country is needed: where it lies is not a guess', () => {
    expect(t.admit(25.03, 121.56, ['TAI'], null)?.how).toBe('strict'); // Taipei
    const b = TDWG3.CKI;
    expect(t.admit((b.s + b.n) / 2, (b.w + b.e) / 2, ['CKI'], null)?.how).toBe('strict');
    expect(t.admit(43.03, 6.45, ['FRA'], null)?.how).toBe('island'); // Ile du Levant, one of Natural Earth's minor islands
  });
  it('the walk\'s check reads the same rule: a page whose open record states no country by the margin is a fault', () => {
    const page = { key: 'k1', name: { scientific: 'Indigofera taiwaniana' }, distribution: { native: [{ code: 'TAI' }] }, upstream: { 'gbif.occurrences': { status: 'ok' } }, occurrences: { rangeRule: RANGE_RULE, nOpenInRange: 1, nRestrictedInRange: 0, admitted: { strict: 0, buffer: 1, coast: 0, island: 0 }, edge: { buffer: [0] }, open: [[21.9267, 120.7239, 1991, null, 'PRESERVED_SPECIMEN', 'by']] as Array<readonly [number, number, ...unknown[]]> } };
    expect(checkPage(page, cellTester(file), t, RANGE_RULE).openOutside).toBe(1);
    const stated = { ...page, occurrences: { ...page.occurrences, open: [[21.9267, 120.7239, 1991, 'TW', 'PRESERVED_SPECIMEN', 'by']] as Array<readonly [number, number, ...unknown[]]> } };
    expect(checkPage(stated, cellTester(file), t, RANGE_RULE).openOutside).toBe(0);
  });
});

describe('1. review D4: within the drawing\'s tolerance across a border, by the stated country and state', () => {
  it('Begonia faustinoi, GBIF 4168528352, "Chiapas, Camino a la linea", Mexico\'s, 0.005° inside Guatemala: in for Mexico Southeast', () => {
    const r = rec('k361567', 4168528352);
    expect(r.countryCode).toBe('MX');
    expect(t.landOf(r.decimalLatitude!, r.decimalLongitude!)).toEqual(['GUA']);
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['MXT'], r.countryCode, r.stateProvince)).toEqual({ code: 'MXT', how: 'buffer', by: 'border' });
    // No country stated, or Guatemala's: not in.
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['MXT'], null)).toBeNull();
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['MXT'], 'GT')).toBeNull();
  });
  it("Hieracium bombycinum, GBIF 357759129, Larra, Navarra, Spain's, 0.007° inside France: in for Spain", () => {
    const r = rec('k3064601', 357759129);
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['SPA'], r.countryCode, r.stateProvince)?.by).toBe('border');
  });
  it('Albuca fastigiata at the Sentinel: the four stating the Free State in, the five stating KwaZulu-Natal out', () => {
    const recs = R.records.k294532;
    expect(recs.length).toBe(9);
    for (const r of recs) {
      expect(t.landOf(r.decimalLatitude!, r.decimalLongitude!), String(r.key)).toEqual(['NAT']);
      const got = t.admit(r.decimalLatitude!, r.decimalLongitude!, ['CPP', 'OFS'], r.countryCode, r.stateProvince);
      if (r.stateProvince === 'Free State') expect(got, String(r.key)).toEqual({ code: 'OFS', how: 'buffer', by: 'border-state' });
      else expect(got, String(r.key)).toBeNull();
    }
    // Naming neither (a record with no state): the line cannot tell within its tolerance, so it counts.
    const r = recs[0];
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['CPP', 'OFS'], 'ZA', null)?.by).toBe('border');
    // A state the shapes cannot match to either side (an old province's name) is read as none, as /about/how says (final review M2).
    expect(t.admit(r.decimalLatitude!, r.decimalLongitude!, ['CPP', 'OFS'], 'ZA', 'Natal')?.by).toBe('border');
    expect(policyWords(ADMISSION_POLICY).border).toContain('A record that names no state or province the shapes can match to either region counts');
    expect(stateKey('Free State Province')).toBe(stateKey('Free State'));
    expect(stateKey('Kwazulu Natal')).toBe(stateKey('KwaZulu-Natal'));
  });
  it('through the records reader: each state read from the record, the Free State places in by the margin', () => {
    const inside = rangeTest([{ code: 'CPP', box: TDWG3.CPP }, { code: 'OFS', box: TDWG3.OFS }], t)!;
    const r = readRecords(R.records.k294532, [TDWG3.CPP, TDWG3.OFS], true, undefined, inside.admitBy);
    // One record a three-decimal place: at -28.735, 28.893 the reader keeps 5087214565 (224 m, KwaZulu-Natal) over
    // 4523495516 (no accuracy stated, Free State), so three Free State places are in and five places are out.
    expect(r.admitted).toEqual({ strict: 0, buffer: 3, coast: 0, island: 0 });
    expect(r.nOutside).toBe(5);
    const r85 = readRecords(R.records.k294532, [TDWG3.CPP, TDWG3.OFS], true, undefined, rangeTest([{ code: 'CPP', box: TDWG3.CPP }, { code: 'OFS', box: TDWG3.OFS }], regionTester(file, POLICY_R85))!.admitBy);
    expect(r85.nOutside).toBe(8);
  });
  it('Khor Fakkan (Sharjah, AE) and Tweed Heads (NSW, 0.03°, beyond the tolerance) stay out', () => {
    expect(t.admit(25.345, 56.315, ['OMA'], 'AE')).toBeNull();
    expect(t.admit(-28.230027, 153.473134, ['QLD'], 'AU', 'New South Wales')).toBeNull();
    expect(t.admit(-28.230027, 153.473134, ['QLD'], 'AU')).toBeNull();
  });
  it("the download carries the record's state: the DWCA's stateProvince, the SQL download's stateprovince, kept in the sample", () => {
    expect(OCC_TERMS).toContain('stateProvince');
    expect(SQL_SELECT.map(([, a]) => a)).toContain('stateprovince');
    const head = occHeader(['gbifID', 'decimalLatitude', 'decimalLongitude', 'countryCode', 'stateProvince', 'speciesKey', 'taxonKey', 'establishmentMeans', 'license', 'basisOfRecord'].join('\t'));
    const row = parseOccRow(head, ['4945597446', '-28.736869', '28.8927', 'ZA', 'Free State', '2772375', '2772375', 'MANAGED', 'CC_BY_4_0', 'HUMAN_OBSERVATION'].join('\t'))!;
    expect(row.stateProvince).toBe('Free State');
    const idx = new OccIndex(10);
    idx.add(row);
    idx.add(parseOccRow(head, ['4458793525', '-28.71912', '28.896867', 'ZA', '', '2772375', '2772375', '', 'CC_BY_4_0', 'HUMAN_OBSERVATION'].join('\t'))!);
    idx.seal();
    const got = idx.get(2772375)!.sort((a, b) => a.key - b.key);
    expect(got.map((o) => [o.key, o.countryCode, o.stateProvince, o.establishmentMeans])).toEqual([[4458793525, 'ZA', undefined, undefined], [4945597446, 'ZA', 'Free State', 'MANAGED']]);
  });
});

describe("2. the countries' codes GBIF states (the plan's B3)", () => {
  const base = { ...file, countries: Object.fromEntries(Object.entries(file.countries ?? {}).map(([c, v]) => [c, v.filter((x) => !['SJ', 'BV', 'BQ', 'MF', 'CP'].includes(x))])) };
  it('each region carries them', () => {
    expect(file.countries?.SVA).toEqual(expect.arrayContaining(['NO', 'SJ']));
    expect(file.countries?.BOU).toEqual(expect.arrayContaining(['BV']));
    expect(file.countries?.NLA).toEqual(expect.arrayContaining(['BQ']));
    expect(file.countries?.LEE).toEqual(expect.arrayContaining(['BQ', 'MF']));
    expect(file.countries?.CPI).toEqual(expect.arrayContaining(['CP']));
  });
  it("a record off Svalbard's drawn coast stating SJ counts for Svalbard; without the code it did not", () => {
    const sea = (() => { for (let d = 0.002; d < 0.15; d += 0.002) { const lat = 78.2 + d; if (!t.landOf(lat, 15.2).length && t.admit(lat, 15.2, ['SVA'], 'SJ')) return lat; } return null; })();
    expect(sea).not.toBeNull();
    expect(t.admit(sea!, 15.2, ['SVA'], 'SJ')?.how).toMatch(/buffer|coast/);
    expect(regionTester(base as ShapesFile).admit(sea!, 15.2, ['SVA'], 'SJ')).toBeNull();
  });
});

describe("3. Kashmir is TDWG's West Himalaya (the plan's B4)", () => {
  const cases: Array<[string, number, number]> = [['Gilgit', 35.92, 74.31], ['Muzaffarabad, Azad Kashmir', 34.37, 73.47], ['Skardu, Baltistan', 35.3, 75.63], ["Polystichum sinense's typical spot, Azad Kashmir", 34.575, 73.525], ["Polystichum sinense's record in Baltistan", 35.081, 76.031]];
  for (const [what, lat, lon] of cases) it(`${what}: the West Himalaya's land, not Pakistan's`, () => {
    expect(t.landOf(lat, lon)).toEqual(['WHM']);
    expect(t.admit(lat, lon, ['WHM'], 'PK')?.how).toBe('strict');
    // A page native to Pakistan alone takes it only within the border tolerance of Pakistan's shape (the typical spot,
    // 0.02° from Khyber Pakhtunkhwa: both regions of Pakistan's code, no state named), never as Pakistan's land.
    expect(t.admit(lat, lon, ['PAK'], 'PK')?.how ?? null).toBe(what.includes('typical spot') ? 'buffer' : null);
  });
  it('Islamabad, Peshawar and Chitral stay Pakistan\'s; the West Himalaya counts Pakistan\'s code', () => {
    for (const [lat, lon] of [[33.69, 73.05], [34.01, 71.58], [35.85, 71.79]]) expect(t.landOf(lat, lon)).toEqual(['PAK']);
    expect(file.countries?.WHM).toEqual(['IN', 'PK']);
    expect(t.placeOf(34.575, 73.525)).toBe('Azad Kashmir|PK');
  });
});

describe("4. the island reach stops at a foreign coast (the plan's B5)", () => {
  const before = regionTester(file, POLICY_R85);
  it("Artemisia chinensis's records off Pengjia Islet, stating TW: not China Southeast's island, Japan's land being nearer than China Southeast's", () => {
    for (const [lat, lon] of [[25.485, 122.105], [25.589, 122.021], [25.41, 122.044]]) {
      expect(before.admit(lat, lon, ['CHS'], 'TW')?.how).toBe('island');
      expect(t.admit(lat, lon, ['CHS'], 'TW')).toBeNull();
    }
  });
  it('the Poor Knights, Macauley I. and the Torres Strait keep their islands: no foreign land is nearer', () => {
    expect(t.admit(-35.47, 174.735, ['NZN'], 'NZ')?.how).toBe('island');
    expect(t.admit(-30.21, -178.45, ['KER'], 'NZ')?.by).toBe('box');
    expect(t.admit(-10.106, 143.321, ['QLD'], 'AU')?.how).toBe('island');
  });
});
