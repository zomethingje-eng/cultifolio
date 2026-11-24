/**
 * Round 113 (SPECIES 21, "How cold it gets"): the yearly lows the page held without drawing them.
 *
 * 1. `yearLows` over Welwitschia mirabilis's page (k339841, as SPECIES 21's test names it; tests/unit/fixtures/r113a-k339841.json): 44 bars from
 *    1981 to 2024, the coldest 2.1 °C in 1991, the mean 4.0 °C, which is zone 10b, as the page's hardiness says.
 * 2. A year the series holds too few days of is a gap, never a zero, and is not counted in the mean.
 * 3. `lowsScale` covers the lows, the mean and the cold floor with round ticks.
 *
 * On 1764df3 the page drew no lows: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { yearLows, lowsScale } from '../../src/lib/ui/ref/year-lows';

// The page as the corpus held it on 23 November 2026: the committed fixture k339841 predates the yearly lows.
const F = JSON.parse(readFileSync('tests/unit/fixtures/r113a-k339841.json', 'utf8'));
const W = { climate: { extremes: F.extremes }, hardiness: F.hardiness };

describe('r113a yearLows', () => {
  it('reads Welwitschia mirabilis\'s 44 yearly lows', () => {
    const y = yearLows(W.climate.extremes.lows)!;
    expect(y.bars).toHaveLength(44);
    expect([y.from, y.to]).toEqual([1981, 2024]);
    expect(y.coldest).toEqual({ year: 1991, c: 2.1 });
    expect(y.meanC.toFixed(1)).toBe('4.0');
    expect(W.hardiness.usda.zone).toBe('10b');
    expect(W.hardiness.rhs.band).toBe('H2');
    expect(W.climate.extremes.maxP99).toBe(41.2);
    expect(W.climate.extremes.frostNights).toBe(0);
  });
  it('leaves a year with too few days as a gap', () => {
    const y = yearLows({ from: 2000, t: [-3, null, -5] })!;
    expect(y.bars.map((b) => b.c)).toEqual([-3, null, -5]);
    expect(y.n).toBe(2);
    expect(y.meanC).toBe(-4);
    expect(y.coldest).toEqual({ year: 2002, c: -5 });
    expect(yearLows({ from: 2000, t: [null] })).toBeNull();
    expect(yearLows(undefined)).toBeNull();
  });
  it('a scale with round ticks covering everything drawn', () => {
    const s = lowsScale([2.1, 6.3, 5.5, 4.0]);
    expect(s.min).toBeLessThanOrEqual(2.1);
    expect(s.max).toBeGreaterThanOrEqual(6.3);
    expect(s.ticks.every((t) => Number.isInteger(t / 2))).toBe(true);
    const wide = lowsScale([-25, -3]);
    expect(wide.ticks.every((t) => Number.isInteger(t / 5))).toBe(true);
  });
});

