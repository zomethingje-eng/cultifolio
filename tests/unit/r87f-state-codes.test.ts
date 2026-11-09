/**
 * Round eighty-seven, the review of the pipeline's changes (S1 and M1), the data fix.
 *
 * S1: at the 37 places the shapes file parts between two regions, the same place gave opposite answers by its name and
 * by its code. The name was read the native region's first; an alias, the neighbour's first ("on both sides, the shape
 * decides"). At 45.57,-122.28 (Washington's shape, 0.02° from Oregon's), with Oregon native, "Oregon" was admitted and
 * "OR" and "US-OR" refused; "West Bengal" and "WB" in the East Himalaya, "Istanbul" and "TR-34" in Turkey-in-Europe, the
 * same. A current ISO 3166-2 code now stands for its place and is read as that place's name is; only a historical name
 * (an old province, which may have held land on both sides) leaves it to the shape.
 *
 * M1: ISO names China's, Russia's and Ukraine's subdivisions with their kind ("Yunnan Sheng", "Amurskaja oblast'",
 * "Vinnytska oblast"), Natural Earth without it, so none of their codes had an alias (Crimea's among them). The table is
 * made again with the kind taken off, and the rest by hand, each checked against Natural Earth's own code.
 *
 * On r87s1 (381aea9): "OR", "US-OR", "WB", "IN-WB" and "TR-34" were refused at the points below; "CN-YN" and "UA-43"
 * were not matched (`border-unmatched`); the table had no CN, RU or UA entry and no `STATE_HISTORICAL`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionTester, aliasOf, historicalAlias, SHAPES_FILE, type ShapesFile } from '$dossier/tdwg-shapes';
import { STATE_ALIASES, STATE_HISTORICAL, STATE_UNREAD } from '$dossier/state-aliases';
import { policyWords, ADMISSION_POLICY } from '$dossier/admission-policy';

const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
const t = regionTester(file);
beforeAll(() => { t.landOf(0, 0); }, 120_000);
const by = (lat: number, lon: number, native: string, cc: string, state: string) => t.admit(lat, lon, [native], cc, state)?.by ?? null;

describe('S1: a current code is read as its place\'s name, at a place the shapes file parts between two regions', () => {
  it('Oregon, in Washington\'s shape 0.02° from Oregon\'s: by its name and by its code alike', () => {
    expect(t.landOf(45.57, -122.28)).toEqual(['WAS']);
    for (const s of ['Oregon', 'OR', 'US-OR', 'us-or']) expect(by(45.57, -122.28, 'ORE', 'US', s), s).toBe('border-state'); // r87s1: OR, US-OR null
    for (const s of ['Washington', 'WA', 'US-WA']) expect(by(45.57, -122.28, 'ORE', 'US', s), s).toBeNull();
  });
  it('West Bengal, in India\'s shape beside the East Himalaya', () => {
    expect(t.landOf(26.43, 88.27)).toEqual(['IND']);
    for (const s of ['West Bengal', 'WB', 'IN-WB']) expect(by(26.43, 88.27, 'EHM', 'IN', s), s).toBe('border-state'); // r87s1: WB, IN-WB null
  });
  it('Istanbul, in Turkey\'s shape beside Turkey-in-Europe', () => {
    expect(t.landOf(41.01, 29.02)).toEqual(['TUR']);
    for (const s of ['Istanbul', 'İstanbul', 'TR-34']) expect(by(41.01, 29.02, 'TUE', 'TR', s), s).toBe('border-state'); // r87s1: TR-34 null
  });
  it('a historical province that held land in both regions still leaves it to the shape: Cape Province at the North West', () => {
    // In the Northern Provinces' shape (North West), 0.02° from the Cape Provinces' (the Northern Cape); and the other way.
    expect(t.landOf(-28.09, 24.51)).toEqual(['TVL']);
    expect(t.landOf(-28.12, 24.52)).toEqual(['CPP']);
    expect(historicalAlias('ZA', 'Cape Province')).toBe(true);
    expect(aliasOf('ZA', 'Cape Province')).toEqual(['easterncape', 'northerncape', 'northwest', 'westerncape']);
    expect(by(-28.09, 24.51, 'CPP', 'ZA', 'Cape Province')).toBeNull();
    expect(by(-28.12, 24.52, 'TVL', 'ZA', 'Cape Province')).toBeNull();
    // The current provinces' codes are read as their names: each side's own.
    expect(by(-28.09, 24.51, 'CPP', 'ZA', 'NC')).toBe('border-state');
    expect(by(-28.09, 24.51, 'CPP', 'ZA', 'ZA-NW')).toBeNull();
    expect(by(-28.12, 24.52, 'TVL', 'ZA', 'NW')).toBe('border-state');
    expect(by(-28.12, 24.52, 'TVL', 'ZA', 'Transvaal')).toBe('border-state'); // an old province wholly the native side's
  });
  it('the historical names are the script\'s by-hand list, and no current code is among them', () => {
    expect(Object.keys(STATE_HISTORICAL)).toEqual(['CA', 'MX', 'ZA']);
    expect(STATE_HISTORICAL.ZA).toContain('~natal');
    expect(STATE_HISTORICAL.ZA).toContain('=ZA-NL');
    expect(STATE_HISTORICAL.ZA).not.toContain('~kzn');
    for (const s of ['US-OR', 'OR', 'KZN', 'ZA-KZN', 'TX']) expect(historicalAlias(s.startsWith('US') || s === 'OR' || s === 'TX' ? 'US' : 'ZA', s), s).toBe(false);
    for (const [cc, ks] of Object.entries(STATE_HISTORICAL)) for (const k of ks) expect(STATE_ALIASES[cc][k], `${cc} ${k}`).toBeDefined();
  });
});

describe('M1: China\'s, Russia\'s and Ukraine\'s codes', () => {
  it('ISO\'s names with their kind taken off, and the rest by hand', () => {
    expect(aliasOf('CN', 'CN-YN')).toEqual(['yunnan']);
    expect(aliasOf('CN', 'YN')).toEqual(['yunnan']);
    expect(aliasOf('CN', 'Yunnan Sheng')).toEqual(['yunnan']);
    expect(aliasOf('CN', 'CN-GX')).toEqual(['guangxi']);
    expect(aliasOf('CN', 'CN-NM')).toEqual(['innermongol']);
    expect(aliasOf('RU', 'RU-AMU')).toEqual(['amur']);
    expect(aliasOf('RU', "Amurskaja oblast'")).toEqual(['amur']);
    expect(aliasOf('RU', 'RU-KHA')).toEqual(['khabarovsk']); // ISO's "Habarovskij kraj", in Natural Earth's letters
    // Altaj, Respublika and Altajskij kraj both read "Altay" with the kind off: parted by hand, by Natural Earth's codes.
    expect(aliasOf('RU', 'RU-AL')).toEqual(['gornoaltay']);
    expect(aliasOf('RU', 'RU-ALT')).toEqual(['altay']);
    // Moscow by ISO's names: Natural Earth's own codes for the two are the other way round.
    expect(aliasOf('RU', 'RU-MOW')).toEqual(['moskva']);
    expect(aliasOf('RU', 'RU-MOS')).toEqual(['moskovskaya']);
    expect(aliasOf('UA', 'UA-05')).toEqual(['vinnytsya']);
    expect(aliasOf('UA', 'UA-63')).toEqual(['kharkiv']);
    // Crimea and Sevastopol: Natural Earth files them under RU, in Krym, a region of RU and of UA.
    expect(aliasOf('UA', 'UA-43')).toEqual(['crimea']);
    expect(aliasOf('UA', 'UA-40')).toEqual(['sevastopol']);
  });
  it('every subdivision of the three is matched but those the shapes file holds under their own codes', () => {
    const head = readFileSync('src/lib/dossier/state-aliases.ts', 'utf8').split('*/')[0];
    const per = /Not matched, by country: ([^.]*)\./.exec(head.replace(/\n \* /g, ' '))?.[1] ?? '';
    expect(per).toContain('CN 3'); // Hong Kong, Macao and Taiwan: their own country codes
    expect(per).not.toMatch(/\b(RU|UA|PK) \d/);
    for (const cc of ['CN', 'RU', 'UA']) expect(Object.keys(STATE_ALIASES[cc] ?? {}).length, cc).toBeGreaterThan(30);
  });
  it('at a border inside China and one inside Ukraine, the code decides as the name does', () => {
    // Guangxi's shape (South-East China), 0.02° from Yunnan's (South-Central China).
    expect(t.landOf(23.16, 105.54)).toEqual(['CHS']);
    for (const s of ['Yunnan', 'CN-YN', 'YN', 'Yunnan Sheng']) expect(by(23.16, 105.54, 'CHC', 'CN', s), s).toBe('border-state'); // r87s1: border-unmatched
    for (const s of ['Guangxi', 'CN-GX', 'Guangxi Zhuangzu Zizhiqu']) expect(by(23.16, 105.54, 'CHC', 'CN', s), s).toBeNull();
    // Kherson's shape (Ukraine), 0.02° from Crimea's (Krym).
    expect(t.landOf(45.96, 34.46)).toEqual(['UKR']);
    expect(by(45.96, 34.46, 'KRY', 'UA', 'UA-43')).toBe('border-state'); // r87s1: border-unmatched
    expect(by(45.96, 34.46, 'KRY', 'UA', 'UA-65')).toBeNull();
    expect(by(45.96, 34.46, 'KRY', 'UA', 'Khersonska oblast')).toBeNull();
  });
  it("/about/how's sentence says which codes are read", () => {
    const w = policyWords(ADMISSION_POLICY).border;
    expect(w).toContain('A state is read by its name, by its ISO 3166-2 code (KZN, TX, CN-YN) or by an old province\'s name (Natal, Transvaal).');
    expect(w).toContain(`A code is read where ISO's subdivision is matched to one of Natural Earth's provinces, by its name or by hand: ${STATE_UNREAD.subdivisions} of ISO's subdivisions are not, among them every one of Kiribati's and Morocco's.`);
    expect(STATE_UNREAD).toEqual({ subdivisions: 238, countries: ['Kiribati', 'Morocco'] });
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain(w);
  });
});
