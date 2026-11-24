/**
 * Round 114 (SPECIES 18, c): the six answers under a species' name, their figures, against SPECIES 18's own test for
 * Welwitschia mirabilis (k339841, tests/unit/fixtures/r114a-k339841.json, the page as the corpus held it on 23 November
 * 2026):
 *
 * - Cold 5.5 °C, the coolest month's nights 11–14 °C, the yearly lows 2.1–6.3 °C;
 * - Heat 31 °C, 28–34 °C, the hottest day in 100 41.2 °C;
 * - Rain 80 mm, 30–196 mm, 7 months under 5 mm, the fog sentence;
 * - Light 30–53 DLI; Air 44–56%, 1.14–1.52 kPa, nights 12–15 °C cooler; Ground 777 m.
 *
 * And a page with no extremes, and the elevation's sentence read. On 1764df3 there are no six answers: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sixAnswers, elevationOf } from '../../src/lib/ui/ref/six-answers';

const F = JSON.parse(readFileSync('tests/unit/fixtures/r114a-k339841.json', 'utf8'));
const r0 = (x: number | null | undefined) => (x == null ? null : Math.round(x));

describe('r114a the six answers of Welwitschia mirabilis', () => {
  const s = sixAnswers({ ...F.climate, elevation: F.elevation })!;
  it('Cold', () => {
    expect(s.cold.floor).toBe(5.5);
    expect([r0(s.cold.coolest.p10), r0(s.cold.coolest.p90)]).toEqual([11, 14]);
    expect(s.cold.lows).toEqual({ min: 2.1, max: 6.3 });
  });
  it('Heat', () => {
    expect(r0(s.heat.warmest.mid)).toBe(31);
    expect([r0(s.heat.warmest.p10), r0(s.heat.warmest.p90)]).toEqual([28, 34]);
    expect(s.heat.p99).toBe(41.2);
  });
  it('Rain', () => {
    expect(r0(s.rain.mm)).toBe(80);
    expect([r0(s.rain.p10), r0(s.rain.p90)]).toEqual([30, 196]);
    expect(s.rain.dryMonths).toBe(7);
    expect(s.rain.fog).toBe(true);
  });
  it('Light, Air and Ground', () => {
    expect([r0(s.light!.min), r0(s.light!.max)]).toEqual([30, 53]);
    expect(s.air.rh).toEqual({ min: 44, max: 56 });
    expect(s.air.vpd).toEqual({ min: 1.14, max: 1.52 });
    expect([r0(s.air.gap.min), r0(s.air.gap.max)]).toEqual([12, 15]);
    expect(s.ground.m).toBe(777);
  });
});

describe('r114a the rest', () => {
  it('a page with no daily extremes has no floor and no lows, and the coolest month still', () => {
    const s = sixAnswers({ months: F.climate.months })!;
    expect(s.cold.floor).toBeNull();
    expect(s.cold.lows).toBeNull();
    expect(s.heat.p99).toBeNull();
    expect(s.cold.coolest.mid).toBe(Math.min(...F.climate.months.map((m: { tmin: number }) => m.tmin)));
    expect(s.rain.acrossRange).toBe(false);
  });
  it('the elevation read from its sentence', () => {
    expect(elevationOf('ETOPO 2022, 777 m (cell mean)')).toBe(777);
    expect(elevationOf('ETOPO 2022, 1,204 m (cell mean)')).toBe(1204);
    expect(elevationOf('ETOPO 2022, -12 m (cell mean)')).toBe(-12);
    expect(elevationOf(undefined)).toBeNull();
  });
  it('twelve months or none', () => {
    expect(sixAnswers({ months: [] })).toBeNull();
  });
});
