/**
 * Round eighty-seven (derived agent): the Köppen–Geiger class of the median year by Peel, Finlayson and McMahon's (2007)
 * thresholds (their Table 1, B first, the Cs/Cw rule of their section 2), each letter with its test; the Walter–Lieth
 * reading (arid where a month's rain in mm is under twice its mean temperature in °C).
 *
 * FAILS on the base: no `koppen.ts`, no `walter-lieth.ts`.
 */
import { describe, it, expect } from 'vitest';

const year = (t: number[], p: number[]) => t.map((tmean, i) => ({ tmean, precipMm: p[i] }));

describe('Peel and others’ thresholds', () => {
  it('Herberton Post Office, the paper’s own Table 2: both Cs and Cw hold, summer has more than 70% of the rain, so Cw (and a, the warmest 23.3 °C)', async () => {
    const { koppenOf } = await import('$dossier/koppen');
    const k = koppenOf(year([23.2, 22.8, 21.9, 20.0, 17.9, 16.0, 15.5, 16.5, 18.6, 21.0, 22.4, 23.3], [238.4, 229.7, 214.4, 86.0, 46.9, 33.3, 22.0, 18.2, 16.5, 25.3, 77.3, 137.9]))!;
    expect(k.cls).toBe('Cwa');
    expect(k.summer).toBe('ONDJFM');
    expect(k.summerShare).toBeGreaterThan(0.7);
    // The paper: "the B climate type precipitation threshold of 678 mm (10 * (2 * 19.9 + 28))", from the annual mean it
    // prints, 19.9; the twelve months' own mean is 19.925, so 2 × 19.925 + 28 = 67.85, one decimal 67.9.
    expect(k.pth).toBe(67.9);
    expect(k.map).toBe(1146);
  });
  it('each first letter, B tested first', async () => {
    const { koppenOf } = await import('$dossier/koppen');
    const flat = (t: number, p: number) => year(Array(12).fill(t), Array(12).fill(p));
    expect(koppenOf(flat(27, 200))!.cls).toBe('Af');
    expect(koppenOf(flat(27, 2))!.cls).toBe('BWh');
    expect(koppenOf(flat(12, 5))!.cls).toBe('BWk');
    expect(koppenOf(year(Array(12).fill(27), [300, 300, 300, 300, 300, 300, 300, 300, 300, 300, 30, 30]))!.cls).toBe('Am');
    expect(koppenOf(year(Array(12).fill(27), [250, 250, 250, 250, 250, 5, 5, 5, 5, 5, 250, 250]))!.cls).toBe('Aw');
    // A Mediterranean year, north of the equator: dry summer, hot.
    expect(koppenOf(year([10, 11, 13, 15, 19, 23, 26, 26, 23, 19, 14, 11], [90, 80, 70, 50, 30, 10, 2, 5, 30, 80, 100, 110]))!.cls).toBe('Csa');
    expect(koppenOf(year([-15, -12, -5, 3, 11, 15, 18, 16, 11, 3, -5, -12], [30, 25, 30, 40, 55, 70, 80, 75, 60, 45, 40, 35]))!.cls).toBe('Dfb');
    expect(koppenOf(flat(5, 60))!.cls).toBe('ET');
    expect(koppenOf(flat(-5, 60))!.cls).toBe('EF');
  });
  it('a warmest month of exactly 10 °C is on the paper’s boundary: no class, and why', async () => {
    const { koppenOf } = await import('$dossier/koppen');
    const k = koppenOf(year([2, 3, 4, 6, 8, 10, 10, 9, 7, 5, 3, 2], Array(12).fill(80)))!;
    expect(k.cls).toBeUndefined();
    expect(k.why).toMatch(/10 °C exactly/);
  });
  it('null for anything but twelve full months', async () => {
    const { koppenOf } = await import('$dossier/koppen');
    expect(koppenOf(null)).toBeNull();
    expect(koppenOf(year([1, 2], [3, 4]))).toBeNull();
  });
  it('letters and tests in fixed words around the figures', async () => {
    const { koppenOf, koppenReasons, koppenWords } = await import('$dossier/koppen');
    expect(koppenWords('Csb')).toBe('temperate, dry summer, warm summer');
    expect(koppenWords('BWh')).toBe('arid, desert, hot');
    const k = koppenOf(year([10, 11, 13, 15, 19, 23, 26, 26, 23, 19, 14, 11], [90, 80, 70, 50, 30, 10, 2, 5, 30, 80, 100, 110]))!;
    const r = koppenReasons(k);
    expect(r.map(([l]) => l)).toEqual(['C', 's', 'a']);
    expect(r[1][2]).toBe("the driest summer month (summer April to September) 2 mm, under 40 mm and under a third of the wettest winter month's 110 mm");
    expect(r[2][2]).toBe('the warmest month 26.0 °C, 22 °C or more');
  });
});

describe('Walter–Lieth', () => {
  it('arid months where the rain is under twice the mean temperature, and their runs across the year’s end', async () => {
    const { walterLieth, monthRuns } = await import('$climate/walter-lieth');
    const w = walterLieth(year([10, 11, 13, 15, 19, 23, 26, 26, 23, 19, 14, 11], [90, 80, 70, 50, 30, 10, 2, 5, 30, 80, 100, 110]))!;
    expect(w.arid).toEqual([4, 5, 6, 7, 8]);
    expect(monthRuns(w.arid)).toEqual([[4, 8]]);
    expect(monthRuns([0, 1, 10, 11])).toEqual([[10, 1]]);
    expect(monthRuns([0, 3])).toEqual([[0, 0], [3, 3]]);
    expect(monthRuns([...Array(12).keys()])).toEqual([[0, 11]]);
    expect(walterLieth(null)).toBeNull();
  });
});
