import { describe, it, expect } from 'vitest';
import { growingYear, cultivationSheet, span } from '$core/sheet';
import { archFor } from '$core/arch';

const mk = (tmax: number[], tmin: number[], pr: number[], dli?: number[]) => tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: dli?.[i], rh: 55 }));

// Ariocarpus fissuratus at Big Bend: monsoon in July–September, cold dry winter.
const bigBend = mk([18, 21, 25, 30, 33, 35, 34, 33, 31, 27, 22, 18], [4, 6, 9, 14, 18, 22, 22, 22, 19, 15, 9, 4], [17, 14, 10, 19, 38, 55, 68, 66, 45, 44, 15, 11], [29, 36, 46, 53, 57, 56, 53, 50, 44, 38, 30, 26]);
// Tylecodon on the Namaqualand coast: winter rain (June–August), hot dry summer. Southern hemisphere.
const namaqua = mk([26, 26, 25, 23, 20, 18, 17, 18, 20, 22, 24, 26], [14, 14, 13, 11, 9, 7, 6, 7, 8, 10, 12, 13], [3, 4, 8, 15, 28, 40, 38, 30, 14, 7, 4, 3], [55, 50, 42, 32, 24, 20, 22, 28, 36, 45, 52, 58]);
// Copiapoa on the Atacama coast: almost nothing, a fog desert.
const atacama = mk([22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14], [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5], [63, 59, 51, 42, 33, 30, 32, 38, 48, 57, 63, 65]);

describe('archetypes', () => {
  it('resolve species, then genus, then family, and say which', () => {
    expect(archFor('Copiapoa cinerea', 'Cactaceae')?.tier).toBe('genus');
    expect(archFor('Euphorbia pulcherrima', 'Euphorbiaceae')?.arch.key).toBe('tropical');
    expect(archFor('Euphorbia obesa', 'Euphorbiaceae')?.arch.key).toBe('arid');
    expect(archFor('Xyzzy nobody', 'Cactaceae')?.tier).toBe('family');
    expect(archFor('Xyzzy nobody', 'Asparagaceae')).toBeNull(); // a family that splits is not guessed
    expect(archFor('Albuca spiralis', 'Asparagaceae')?.arch.key).toBe('geophyte');
  });
});

describe('the growing year', () => {
  it('reads a summer-rainfall desert as a summer grower', () => {
    const y = growingYear(bigBend, 29.3)!;
    expect(y.grow).toBe('summer');
    expect(span(y.growMonths)).toBe('May to October');
    expect(y.south).toBe(false);
  });
  it('reads Namaqualand as a winter grower and shifts the season for the north', () => {
    const y = growingYear(namaqua, -30)!;
    expect(y.grow).toBe('winter');
    expect(span(y.growMonths)).toBe('May to August');
    expect(span(y.shifted)).toBe('November to February');
    expect(y.south).toBe(true);
  });
  it('a fog desert with no real rain takes its season from temperature and says so', () => {
    const y = growingYear(atacama, -26)!;
    expect(y.fog).toBe(true);
    expect(y.grow).toBe('winter');
    expect(span(y.growMonths)).toBe('May to October');
    const { rows } = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: atacama, lat: -26 });
    expect(rows.find((r) => r.k === 'Its year')!.s).toContain('too little to have a rainy season to read');
    expect(rows.find((r) => r.k === 'Its year')!.s).toContain('a reading of two curves, not a record of when this plant grows');
    expect(rows.map((r) => r.s + (r.short ?? '')).join(' ')).not.toMatch(/fog the plant drinks|lives on fog/);
  });
  it('rain spread through the year is not a season', () => {
    const karoo = mk([28, 28, 26, 23, 20, 17, 17, 18, 21, 23, 25, 27], [14, 14, 12, 9, 6, 3, 3, 4, 6, 9, 11, 13], [30, 32, 40, 30, 22, 18, 16, 20, 25, 30, 35, 30]);
    const y = growingYear(karoo, -33)!;
    expect(y.grow).toBe('even');
    const { rows } = cultivationSheet({ scientific: 'Dioscorea elephantipes', family: 'Dioscoreaceae', months: karoo, lat: -33 });
    expect(rows.find((r) => r.k === 'Its year')!.s).toContain('cooler months');
  });
  it('spans wrap the year', () => {
    expect(span([11, 12, 1, 2])).toBe('November to February');
    expect(span([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('all year');
    expect(span([6])).toBe('June');
  });
});

describe('the sheet', () => {
  it('names its sources and marks habitat-derived rows', () => {
    const { rows, arch } = cultivationSheet({ scientific: 'Tylecodon pearsonii', family: 'Crassulaceae', months: namaqua, lat: -30, extremes: { minAbs: 1.2, minP01: 4.1, maxP99: 38, frostDaysPerYear: 0, years: 44 } });
    expect(arch?.arch.key).toBe('arid');
    const year = rows.find((r) => r.k === 'Its year')!;
    expect(year.s).toContain('At home in the southern hemisphere it is a winter grower');
    expect(year.s).toContain('In a northern-hemisphere collection the same plant grows November to February and rests March to October');
    expect(year.hab).toBe(true);
    const light = rows.find((r) => r.k === 'Light')!;
    expect(light.s).toMatch(/20 to 58 mol/);
    const temp = rows.find((r) => r.k === 'Temperature')!;
    expect(temp.s).toContain('Keep it above 4 °C');
    expect(rows.every((r) => r.why.length > 20)).toBe(true);
    expect(rows.filter((r) => !r.hab).map((r) => r.k)).toEqual(['Feeding', 'Repotting', 'Pests']);
  });
  it('with no climate, only conventional rows appear and say so', () => {
    const { rows } = cultivationSheet({ scientific: 'Stephania erecta', family: 'Menispermaceae' });
    expect(rows.find((r) => r.k === 'Light')!.s).toContain('Conventionally');
    expect(rows.every((r) => !r.hab)).toBe(true);
  });
  it('with no archetype and no climate, there is nothing to say', () => {
    expect(cultivationSheet({ scientific: 'Nobodia knowsii', family: 'Asparagaceae' }).rows).toHaveLength(0);
  });
});
