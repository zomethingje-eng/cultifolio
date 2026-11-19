/**
 * Round ninety-eight (docs/PLAN-98.md, 3): the Walter–Lieth diagram drawn. Round eighty-seven gave the reading only (the
 * arid months, `walterLieth`) and left drawing the diagram's one shared scale for a later round (REVIEW-ROUND-87.md, 4).
 * `walterLiethChart` gives its geometry: 10 °C against 20 mm on one axis, rain over 100 mm at a tenth, and the areas
 * between the curves, arid where the rain curve is under the temperature curve. The arid areas are the reading's months.
 *
 * On 8335b5e: src/lib/climate/walter-lieth-chart.ts did not exist; every case FAILED (import).
 */
import { describe, it, expect } from 'vitest';
import { walterLiethChart, rainScaled } from '$climate/walter-lieth-chart';
import { walterLieth } from '$climate/walter-lieth';

const year = (t: number[], p: number[]) => t.map((tmean, i) => ({ tmean, precipMm: p[i] }));
// A Mediterranean year: dry summer (June to September arid by the reading), wet winter with a month over 100 mm.
const MED = year([10, 11, 13, 15, 19, 23, 26, 26, 23, 18, 14, 11], [110, 80, 60, 40, 25, 8, 2, 4, 20, 60, 90, 120]);
const xs = (pts: string) => pts.split(' ').map((p) => Number(p.split(',')[0]));
const ys = (pts: string) => pts.split(' ').map((p) => Number(p.split(',')[1]));

describe('r98b: the diagram\'s geometry', () => {
  it('rain is drawn at half its mm up to 100, a tenth of that above', () => {
    expect(rainScaled(40)).toBe(20);
    expect(rainScaled(100)).toBe(50);
    expect(rainScaled(300)).toBe(60);
  });
  it('one shared scale: the tick of 10 °C is the tick of 20 mm, of 50 °C 100 mm', () => {
    const c = walterLiethChart(MED)!;
    expect(c.ticks.find((t) => t.c === 10)!.mm).toBe(20);
    expect(c.ticks.find((t) => t.c === 30)!.mm).toBe(60);
    expect(c.compressAt).not.toBeNull(); // January and December are over 100 mm
  });
  it('a month with the same rain on the scale as its temperature sits on the same y', () => {
    const c = walterLiethChart(year(Array(12).fill(20), Array(12).fill(40)))!;
    expect(ys(c.temp)).toEqual(ys(c.rain));
    expect(c.arid).toEqual([]);
  });
  it('the arid area spans the reading\'s arid months, and no others', () => {
    const c = walterLiethChart(MED)!;
    expect(walterLieth(MED)!.arid).toEqual([4, 5, 6, 7, 8]); // May (25 mm under 2 × 19) to September (20 under 46)
    expect(c.arid).toHaveLength(1);
    const x = xs(c.arid[0]);
    // From the crossing between April and May to the one between September and October.
    expect(Math.min(...x)).toBeGreaterThan(c.monthX[3]);
    expect(Math.min(...x)).toBeLessThan(c.monthX[4]);
    expect(Math.max(...x)).toBeGreaterThan(c.monthX[8]);
    expect(Math.max(...x)).toBeLessThan(c.monthX[9]);
    expect(c.humid).toHaveLength(2); // January to April, October to December
  });
  it('no figure, or not twelve: no diagram', () => {
    expect(walterLiethChart(null)).toBeNull();
    expect(walterLiethChart(MED.slice(0, 11))).toBeNull();
    expect(walterLiethChart(year(Array(12).fill(NaN), Array(12).fill(1)))).toBeNull();
  });
  it('a year below freezing draws its ticks from below zero, and rain only from zero', () => {
    const c = walterLiethChart(year([-12, -10, -4, 3, 10, 15, 17, 15, 9, 2, -5, -10], Array(12).fill(30)))!;
    expect(c.ticks[0].c).toBe(-20);
    expect(c.compressAt).toBeNull();
  });
});
