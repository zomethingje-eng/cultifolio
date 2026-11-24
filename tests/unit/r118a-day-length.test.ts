/**
 * Round 118 (SPECIES 19): day length by month from a latitude, against SPECIES 19's own figures: Pittsburgh (40.44° N)
 * 9.3 h in December, 15.0 h in June; Welwitschia mirabilis's typical cell (20.50° S) 10.9 h in the habitat's June to 13.4 h
 * in its December; the equator about 12.1 h all year; polar day and night clamped, never NaN.
 *
 * On 19ec7a8 there is no day length: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { dayLengths, dayLengthHours } from '../../src/lib/climate/day-length';

describe('r118a day length', () => {
  it('Pittsburgh, as SPECIES 19 checked it', () => {
    const p = dayLengths(40.44);
    expect(p[11]).toBe(9.3);
    expect(p[5]).toBe(15.0);
  });
  it('the habitat of Welwitschia mirabilis: 10.9 h in June to 13.4 h in December', () => {
    const w = dayLengths(-20.5);
    expect(w[5]).toBe(10.9);
    expect(w[11]).toBe(13.4);
  });
  it('the equator, and the poles clamped', () => {
    for (const h of dayLengths(0)) expect(h).toBeGreaterThan(12.0), expect(h).toBeLessThan(12.3);
    expect(dayLengthHours(80, 172)).toBe(24);
    expect(dayLengthHours(80, 355)).toBe(0);
  });
});

describe('r118a the year in two halves', () => {
  it('Welwitschia mirabilis: under 120 mm, the warmer six months hold 74 of the year\'s 80 mm, the cooler six 6 (SPECIES 19)', async () => {
    const { readFileSync } = await import('node:fs');
    const { yearHalves } = await import('../../src/lib/climate/year-halves');
    const { growingYear } = await import('../../src/lib/core/sheet');
    const F = JSON.parse(readFileSync('tests/unit/fixtures/r114a-k339841.json', 'utf8'));
    const h = yearHalves(F.climate.months, growingYear(F.climate.months, -20.5))!;
    expect(h.map((x) => x.kind)).toEqual(['warmer', 'cooler']);
    expect(Math.round(h[0].rainMm)).toBe(74);
    expect(Math.round(h[1].rainMm)).toBe(6);
    expect(h[0].months.length + h[1].months.length).toBe(12);
  });
  it('a rainy season read: the wet months and the dry', async () => {
    const { yearHalves } = await import('../../src/lib/climate/year-halves');
    const m = Array.from({ length: 12 }, (_, i) => ({ tmax: 25, tmin: 10, tmean: 17, precipMm: [6, 7, 8].includes(i + 1) ? 200 : 5 }));
    const h = yearHalves(m, { grow: 'summer', fog: false, frozen: false, growMonths: [6, 7, 8] })!;
    expect(h[0]).toMatchObject({ kind: 'wet', months: [6, 7, 8], rainMm: 600 });
    expect(h[1].kind).toBe('dry');
  });
});
