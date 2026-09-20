import { describe, it, expect } from 'vitest';
import { climateDistance, nearestByClimate } from '$core/near';

const year = (tmax: number, tmin: number, rain: number, shift = 0) => Array.from({ length: 12 }, (_, i) => ({ tmax: tmax + 5 * Math.cos(((i + shift) / 12) * 2 * Math.PI), tmin: tmin + 5 * Math.cos(((i + shift) / 12) * 2 * Math.PI), precipMm: rain }));

describe('climate distance', () => {
  it('is zero for the same year and grows with temperature and rain differences', () => {
    const a = year(25, 10, 20);
    expect(climateDistance(a, a)).toBe(0);
    expect(climateDistance(a, year(28, 13, 20))).toBeCloseTo(Math.sqrt(9 + 9), 5);
    // a factor of e in every month's rain counts as three degrees
    expect(climateDistance(a, year(25, 10, (20 + 1) * Math.E - 1))).toBeCloseTo(3, 5);
  });
  it('tells the hemispheres apart: the same seasons six months out are far, not near', () => {
    const north = year(25, 10, 20, 0), south = year(25, 10, 20, 6), warmer = year(27, 12, 20, 0);
    expect(climateDistance(north, south)).toBeGreaterThan(climateDistance(north, warmer));
  });
  it('finds the nearest n for every species, nearest first, never itself', () => {
    const items = [
      { key: 1, months: year(25, 10, 20) },
      { key: 2, months: year(26, 11, 20) },
      { key: 3, months: year(30, 15, 100) },
      { key: 4, months: year(10, -5, 300) }
    ];
    const near = nearestByClimate(items, 2);
    expect(near.get(1)).toEqual([2, 3]);
    expect(near.get(4)![0]).toBe(1); // 15 °C off in both series beats 20 °C off, even against a rain gap of 300 vs 100
    expect(near.get(2)).not.toContain(2);
    expect(near.get(3)).toHaveLength(2);
  });
});
