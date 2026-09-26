import { describe, it, expect } from 'vitest';
import { growingYear, cultivationSheet, span, runs, coldFloor, forReader } from '$core/sheet';
import { archFor } from '$core/arch';
import { careLine } from '$core/note';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 55 }));

// Ariocarpus fissuratus at Big Bend: monsoon in July–September, cold dry winter.
const bigBend = mk([18, 21, 25, 30, 33, 35, 34, 33, 31, 27, 22, 18], [4, 6, 9, 14, 18, 22, 22, 22, 19, 15, 9, 4], [17, 14, 10, 19, 38, 55, 68, 66, 45, 44, 15, 11], [29, 36, 46, 53, 57, 56, 53, 50, 44, 38, 30, 26]);
// Tylecodon on the Namaqualand coast: winter rain (June–August), hot dry summer. Southern hemisphere.
const namaqua = mk([26, 26, 25, 23, 20, 18, 17, 18, 20, 22, 24, 26], [14, 14, 13, 11, 9, 7, 6, 7, 8, 10, 12, 13], [3, 4, 8, 15, 28, 40, 38, 30, 14, 7, 4, 3], [55, 50, 42, 32, 24, 20, 22, 28, 36, 45, 52, 58]);
// Copiapoa on the Atacama coast: almost nothing.
const atacama = mk([22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14], [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5], [63, 59, 51, 42, 33, 30, 32, 38, 48, 57, 63, 65]);
// An equatorial site: two rainy seasons, a temperature curve that barely moves.
const equatorial = mk([28, 28, 28, 27, 27, 26, 26, 27, 27, 27, 27, 28], [18, 18, 18, 18, 17, 17, 16, 16, 17, 17, 18, 18], [20, 30, 120, 160, 90, 20, 10, 15, 60, 140, 110, 30]);

/** Words the sheet may never use: they say what a plant does, wants or tolerates, or what to do to it. */
const FORBIDDEN = /\b(rests?|resting|wants?|tolerat\w*|will|won't|water it|feed|repot|misting|kill\w*|fatal|scorch\w*|bleach\w*|keep it|give it|let it|wakes?|grows? in the open|not a desert plant)\b/i;

describe('archetypes', () => {
  it('resolve species, then genus, then family, and say which', () => {
    expect(archFor('Copiapoa cinerea', 'Cactaceae')?.tier).toBe('genus');
    expect(archFor('Euphorbia pulcherrima', 'Euphorbiaceae')?.arch.key).toBe('tropical');
    expect(archFor('Euphorbia obesa', 'Euphorbiaceae')?.arch.key).toBe('arid');
    expect(archFor('Xyzzy nobody', 'Cactaceae')?.tier).toBe('family');
    expect(archFor('Xyzzy nobody', 'Asparagaceae')).toBeNull(); // a family that splits is not guessed
    expect(archFor('Albuca spiralis', 'Asparagaceae')?.arch.key).toBe('geophyte');
  });
  it('supply a figure, not prose', () => {
    for (const a of Object.values(archFor('Monstera deliciosa', 'Araceae')!.arch)) expect(typeof a === 'string' ? a.length : 0).toBeLessThan(40);
  });
});

describe('month runs', () => {
  it('spans wrap the year', () => {
    expect(span([11, 12, 1, 2])).toBe('November to February');
    expect(span([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('all year');
    expect(span([6])).toBe('June');
  });
  it('a bimodal season is two runs, in both styles, from one function', () => {
    expect(runs([3, 4, 9, 10])).toBe('March to April and September to October');
    expect(runs([3, 4, 9, 10], 'short')).toBe('Mar–Apr, Sep–Oct');
    expect(runs([12, 1, 6], 'long')).toBe('December to January and June');
    expect(runs([12, 1, 6], 'short')).toBe('Dec–Jan, Jun');
  });
});

describe('the growing year', () => {
  it('reads a summer-rainfall desert as a summer growing season', () => {
    const y = growingYear(bigBend, 29.3)!;
    expect(y.grow).toBe('summer');
    expect(span(y.growMonths)).toBe('May to October');
    expect(y.south).toBe(false);
  });
  it('reads Namaqualand as winter and shifts the season for the north', () => {
    const y = growingYear(namaqua, -30)!;
    expect(y.grow).toBe('winter');
    expect(span(y.growMonths)).toBe('May to August');
    expect(span(y.shifted)).toBe('November to February');
    expect(y.south).toBe(true);
    expect(span(forReader(y, 52))).toBe('November to February');
    expect(span(forReader(y, -34))).toBe('May to August');
  });
  it('under 120 mm the rain rule reads nothing and the temperature rule names the cooler half, labelled as such', () => {
    const y = growingYear(atacama, -26)!;
    expect(y.fog).toBe(true);
    expect(y.grow).toBe('cool');
    expect(span(y.growMonths)).toBe('May to October');
    const { rows } = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: atacama, lat: -26 });
    const s = rows.find((r) => r.k === 'Its year')!.s;
    expect(s).toContain('the rain rule reads no rainy season');
    expect(s).toContain('The temperature rule reads the cooler six months as May to October');
    expect(s).toContain('southern hemisphere');
    expect(s).toContain('shifted six months for a northern-hemisphere collection: November to April');
  });
  it('rain spread through the year is no season, and says how many months it takes', () => {
    const karoo = mk([28, 28, 26, 23, 20, 17, 17, 18, 21, 23, 25, 27], [14, 14, 12, 9, 6, 3, 3, 4, 6, 9, 11, 13], [30, 32, 40, 30, 22, 18, 16, 20, 25, 30, 35, 30]);
    const y = growingYear(karoo, -33)!;
    expect(y.grow).toBe('even');
    expect(y.spread).toBe(true);
    const { rows } = cultivationSheet({ scientific: 'Dioscorea elephantipes', family: 'Dioscoreaceae', months: karoo, lat: -33 });
    expect(rows.find((r) => r.k === 'Its year')!.s).toMatch(/The rain rule reads no season: 70% of the year's rain \(\d+ mm of \d+ mm\) takes \d+ months/);
  });
  it('a sharp rainy season under a flat temperature curve is said to be sharp, and the rule infers nothing from it', () => {
    const y = growingYear(equatorial, 1)!;
    expect(y.flat).toBe(true);
    expect(y.grow).toBe('even');
    expect(span(y.growMonths)).toBe('March to May and October to November');
    const { rows } = cultivationSheet({ scientific: 'Aglaonema commutatum', family: 'Araceae', months: equatorial, lat: 1 });
    const s = rows.find((r) => r.k === 'Its year')!.s;
    expect(s).toContain('The rain rule reads a sharp season');
    expect(s).toContain('falls in March to May and October to November');
    expect(s).toMatch(/The temperature curve is flat, \d\.\d °C between the warmest and coldest month, so the growing-season rule does not infer a growing season/);
    expect(s).not.toContain('no sharp season');
  });
});

describe('the sheet', () => {
  it('names its sources, marks habitat-derived rows, and prints months with their hemisphere and the shift', () => {
    const { rows, arch } = cultivationSheet({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 } });
    expect(arch?.arch.key).toBe('arid');
    const year = rows.find((r) => r.k === 'Its year')!;
    expect(year.s).toContain('The rain rule reads a winter growing season: 70% of the year\'s rain (136 mm of 194 mm) falls in May to August');
    expect(year.s).toContain("Months are the habitat's, southern hemisphere; shifted six months for a northern-hemisphere collection: November to February.");
    expect(year.hab).toBe(true);
    const light = rows.find((r) => r.k === 'Light')!;
    expect(light.s).toBe('Open sky over the habitat: 20 to 58 mol/m²/day across the year (daily light integral, median year across the envelope cells, CHELSA).');
    const temp = rows.find((r) => r.k === 'Temperature')!;
    expect(temp.s).toContain('the 1st-percentile night over 44 years at the typical cell is 4.1 °C');
    expect(temp.s).toContain('Cold floor: 4.1 °C, which is the 1st-percentile night over 44 years at the typical cell (NASA POWER).');
    expect(rows.every((r) => r.why.length > 20)).toBe(true);
    expect(rows.every((r) => r.hab)).toBe(true);
  });
  it('carries the 10th–90th span when the percentile years are given', () => {
    const p10 = namaqua.map((m) => ({ ...m, tmin: m.tmin - 2, dli: (m.dli ?? 0) - 5, precipMm: m.precipMm - 1 }));
    const p90 = namaqua.map((m) => ({ ...m, tmin: m.tmin + 2, dli: (m.dli ?? 0) + 5, precipMm: m.precipMm + 3 }));
    const { rows } = cultivationSheet({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, p10, p90, lat: -30, annualP10: 170, annualP90: 240 });
    expect(rows.find((r) => r.k === 'Light')!.s).toContain('the lowest 10th-percentile month across the cells is 15, the highest 90th-percentile month 63');
    expect(rows.find((r) => r.k === 'Temperature')!.s).toContain('coldest night 6.0 °C in July (across the envelope cells 4.0 °C to 8.0 °C)');
    // The annual range is the percentiles of per-cell years, carried in, never a sum of monthly percentiles.
    expect(rows.find((r) => r.k === 'Rain')!.s).toContain("Across the envelope cells the year's total runs 170 mm to 240 mm (10th to 90th percentile of each cell's own year)");
    const noAnnual = cultivationSheet({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, p10, p90, lat: -30 });
    expect(noAnnual.rows.find((r) => r.k === 'Rain')!.s).not.toContain('Across the envelope cells');
  });
  it('the cold floor names its quantity, and a raising by the archetype table is in the same sentence', () => {
    const ex = { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 };
    // A tropical aroid whose habitat night is below the group minimum: the floor is the table's, and the sentence says so.
    const fl = coldFloor(namaqua, ex, archFor('Monstera deliciosa', 'Araceae'))!;
    expect(fl.floor).toBe(12);
    expect(fl).toMatchObject({ habitat: 4.1, raised: true, group: 'tropical foliage plant' });
    expect(fl.s).toBe("Cold floor: 12 °C. The habitat figure, the 1st-percentile night over 44 years at the typical cell (NASA POWER), is 4.1 °C; the archetype table's conventional minimum for a tropical foliage plant (grouped by the genus Monstera, which is reliably one kind of plant) is 12 °C, which is higher, and the floor rule takes the higher.");
    // Without extremes the quantity is the coldest month's mean night, named as such.
    const fl2 = coldFloor(namaqua, null, archFor('Tylecodon pearsonii', 'Crassulaceae'))!;
    expect(fl2.floor).toBe(6);
    expect(fl2.s).toContain("the coldest month's mean night, July, in the median year (CHELSA); no daily extremes are on file");
    // No climate at all: the table's figure alone, credited.
    const fl3 = coldFloor(null, null, archFor('Monstera deliciosa', 'Araceae'))!;
    expect(fl3.hab).toBe(false);
    expect(fl3.s).toContain("the archetype table's conventional minimum for a tropical foliage plant");
    expect(coldFloor(null, null, archFor('Copiapoa cinerea', 'Cactaceae'))).toBeNull();
  });
  it('with no climate, only the archetype figure appears, credited, and nothing else', () => {
    const { rows } = cultivationSheet({ scientific: 'Monstera deliciosa', family: 'Araceae' });
    expect(rows.map((r) => r.k)).toEqual(['Temperature']);
    expect(rows[0].hab).toBe(false);
    expect(cultivationSheet({ scientific: 'Stephania erecta', family: 'Menispermaceae' }).rows).toHaveLength(0);
  });
  it('with no archetype and no climate, there is nothing to say', () => {
    expect(cultivationSheet({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' }).rows).toHaveLength(0);
  });
  it('no row, on any of the test climates, says what the plant does, wants or tolerates, or what to do to it', () => {
    const ex = { minAbs: -3, minP01: 1, maxP99: 41, frostDaysPerYear: 12, years: 44 };
    for (const [name, family, months, lat] of [['Tylecodon pearsonii', 'Crassulaceae', namaqua, -30], ['Ariocarpus fissuratus', 'Cactaceae', bigBend, 29], ['Copiapoa cinerea', 'Cactaceae', atacama, -26], ['Aglaonema commutatum', 'Araceae', equatorial, 1], ['Monstera deliciosa', 'Araceae', null, null]] as const) {
      const { rows } = cultivationSheet({ scientific: name, family, months, lat, extremes: months ? ex : null, readerLat: 52 });
      for (const r of rows) for (const t of [r.s, r.why, r.short ?? '']) expect(t, `${name} · ${r.k}`).not.toMatch(FORBIDDEN);
    }
  });
});

describe('round five: seasons the rules do not earn', () => {
  const flat = (rain: number) => Array.from({ length: 12 }, () => ({ tmax: 30, tmin: 18, tmean: 24, precipMm: rain }));
  it('a flat, dry year names no cooler half: the six coolest months are chosen by calendar order alone', () => {
    const { rows, year } = cultivationSheet({ scientific: 'Testus aridus', family: 'Cactaceae', months: flat(0), lat: -25 });
    expect(year!.none).toBe(true);
    expect(year!.growMonths).toEqual([]);
    const s = rows.find((r) => r.k === 'Its year')!.s;
    expect(s).toContain('names no cooler half');
    expect(s).not.toContain('shifted');
    expect(careLine({ scientific: 'Testus aridus', family: 'Cactaceae', months: flat(0), lat: -25 })).toContain('no season to read');
  });
  it('a wet season within half a degree of the year is neither winter nor summer', () => {
    const m = Array.from({ length: 12 }, (_, i) => ({ tmax: 28 + 3 * Math.cos((i / 12) * 2 * Math.PI), tmin: 14 + 3 * Math.cos((i / 12) * 2 * Math.PI), tmean: 21 + 3 * Math.cos((i / 12) * 2 * Math.PI), precipMm: i >= 2 && i <= 4 ? 60 : 4 }));
    const { rows, year } = cultivationSheet({ scientific: 'Testus even', family: 'Cactaceae', months: m, lat: 30 });
    expect(year!.grow).toBe('even');
    expect(rows.find((r) => r.k === 'Its year')!.s).toContain('neither the cooler nor the warmer part of the year');
    expect(rows.find((r) => r.k === 'Its year')!.s).not.toMatch(/warmer half|cooler half/);
  });
  it('an equatorial habitat with a sharp rainy season is not shifted for the reader', () => {
    const m = Array.from({ length: 12 }, (_, i) => ({ tmax: 29, tmin: 17, tmean: 23, precipMm: i >= 2 && i <= 4 ? 90 : 10 }));
    const { rows, year } = cultivationSheet({ scientific: 'Testus kenyensis', family: 'Asphodelaceae', months: m, lat: -0.5, readerLat: 51 });
    expect(year!.shiftable).toBe(false);
    expect(forReader(year!, 51)).toEqual(year!.growMonths);
    const s = rows.find((r) => r.k === 'Its year')!;
    expect(s.s).toContain('within 10° of the equator');
    expect(s.s).not.toContain('shifted six months for');
    expect(s.short).toContain('March to May at the habitat (not shifted)');
  });
});

describe('the sheet carries the habitat latitude (round twelve, 1)', () => {
  it('a species with a climate and no map marker still tells the label which hemisphere it grows in', async () => {
    const { sheetOf } = await import('$lib/server/sheets');
    const d = JSON.parse(JSON.stringify((await import('../../fixtures/dossiers/s/v2/5384013.json')).default));
    d.centroid = null; // a species with too few in-range records for a marker
    const s = sheetOf(d);
    expect(s.centroid).toBeNull();
    expect(s.habitatLat).toBe(d.climate.at.lat); // the typical cell, as the species page falls back to
    expect(s.habitatLat).toBeLessThan(0);
    // and the label's season line, read from the sheet the way the labels page reads it, is the southern one
    const line = careLine({ scientific: s.name.scientific, family: s.name.family, months: s.climate.status === 'ok' ? s.climate.months : null, extremes: null, lat: s.habitatLat, units: 'metric' }, { readerLat: 40.4 });
    const without = careLine({ scientific: s.name.scientific, family: s.name.family, months: s.climate.status === 'ok' ? s.climate.months : null, extremes: null, lat: null, units: 'metric' }, { readerLat: 40.4 });
    expect(line).not.toBe(without); // the latitude changes the printed months; without it the habitat was read as northern
  });
});
