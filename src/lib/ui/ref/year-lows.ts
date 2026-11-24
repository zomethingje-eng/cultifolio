/**
 * "How cold it gets" (round 113; SPECIES 21): the habitat's lowest night of each year, drawn. The page held the 44 yearly
 * lows its USDA zone is the mean of (`climate.extremes.lows`, round eighty-seven) without drawing them. This reads them for
 * the chart: one bar a year with a low (a year the series holds too few days of is a gap, never a zero), their mean, and
 * the coldest year. The figures are the series' own; nothing is worked out here that the hardiness section does not state.
 */
export interface YearLow { year: number; c: number }
export interface YearLows {
  bars: Array<YearLow | { year: number; c: null }>;
  /** Years with a low. */
  n: number;
  meanC: number;
  coldest: YearLow;
  warmest: YearLow;
  from: number;
  to: number;
}

export function yearLows(lows: { from: number; t: ReadonlyArray<number | null> } | null | undefined): YearLows | null {
  if (!lows || !lows.t.length) return null;
  const bars = lows.t.map((c, i) => ({ year: lows.from + i, c: typeof c === 'number' && Number.isFinite(c) ? c : null }));
  const held = bars.filter((b): b is YearLow => b.c !== null);
  if (!held.length) return null;
  const meanC = held.reduce((s, b) => s + b.c, 0) / held.length;
  // The first year of the coldest low: a tie names the earlier year.
  const coldest = held.reduce((a, b) => (b.c < a.c ? b : a));
  const warmest = held.reduce((a, b) => (b.c > a.c ? b : a));
  return { bars, n: held.length, meanC, coldest, warmest, from: bars[0].year, to: bars[bars.length - 1].year };
}

/** A scale for the chart: round ticks covering the lows, the mean and the cold floor, 2 or 5 °C apart. */
export function lowsScale(values: number[]): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(...values), hi = Math.max(...values);
  const step = hi - lo > 12 ? 5 : 2;
  const min = Math.floor(lo / step) * step - (lo % step === 0 ? step : 0);
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return { min, max, ticks };
}
