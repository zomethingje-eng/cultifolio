/**
 * The six answers under a species' name (round 114; SPECIES 18, c): Cold, Heat, Rain, Light, Air and Ground, the same
 * six in the same order on every page, in place of the four figures of "Habitat in short". Every figure here is one the
 * page held already (the habitat's months and their 10th and 90th percentiles, CHELSA; the daily extremes and yearly
 * lows, NASA POWER; the year's rain across the range; the typical cell's elevation, ETOPO 2022). Nothing is worked out
 * that the climate section does not state, and no figure says what the plant does.
 *
 * - Cold: the cold floor (`minP01`); the coolest month's mean nightly low, 10th to 90th percentile; the range of the
 *   yearly lows; the frost count as the page words it.
 * - Heat: the warmest month's mean daily high, its 10th to 90th percentile; the hottest day in 100 (`maxP99`).
 * - Rain: the year's rain, its 10th to 90th percentile across the range; the months under 5 mm, as the Rain fold counts
 *   them (`sheet.ts`); "Fog and dew are not measured" where the year's rain is under the rain rule's 120 mm.
 * - Light: the lowest to the highest month's DLI, under open sky.
 * - Air: the lowest to the highest month's humidity, dryness of the air (VPD) and wind; how much cooler the nights are
 *   than the days, lowest to highest month.
 * - Ground: the typical cell's elevation, read from the record's sentence (`climate.src.elevation`) until the build
 *   writes it as a number.
 */
type Month = { tmax: number; tmin: number; precipMm: number; dli?: number; rh?: number; vpdKpa?: number; windMs?: number };
export interface SixIn {
  months: readonly Month[];
  p10?: readonly Month[] | null;
  p90?: readonly Month[] | null;
  annualRain?: { p10?: number; p90?: number; p50?: number | null } | null;
  extremes?: { minP01: number; maxP99?: number; years?: number; frostDaysPerYear?: number; frostNights?: number; lows?: { from: number; t: ReadonlyArray<number | null> } } | null;
  elevation?: string | null;
}
export type Span = { min: number; max: number };
export interface Six {
  cold: { floor: number | null; coolest: { i: number; mid: number; p10: number | null; p90: number | null }; lows: Span | null };
  heat: { warmest: { i: number; mid: number; p10: number | null; p90: number | null }; p99: number | null };
  rain: { mm: number; acrossRange: boolean; p10: number | null; p90: number | null; dryMonths: number; fog: boolean };
  light: Span | null;
  air: { rh: Span | null; vpd: Span | null; wind: Span | null; gap: Span };
  ground: { m: number | null };
  /** The twelve values each sparkline draws (the yearly lows for Cold). */
  spark: { cold: number[]; heat: number[]; rain: number[]; light: number[]; air: number[] };
}

/** The rain rule's threshold (`growingYear`): a year under it reads as little rain, where fog and dew may count. */
export const FOG_RAIN_MM = 120;

const span = (xs: Array<number | undefined>): Span | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
};

/** The metres in the elevation's sentence ("ETOPO 2022, 777 m (cell mean)"), or null. */
export function elevationOf(sentence: string | null | undefined): number | null {
  const m = sentence ? /(−|-)?(\d[\d,]*)\s*m\b/.exec(sentence) : null;
  return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')) : null;
}

export function sixAnswers(c: SixIn): Six | null {
  const m = c.months;
  if (m.length !== 12) return null;
  const coolI = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
  const warmI = m.reduce((b, x, i) => (x.tmax > m[b].tmax ? i : b), 0);
  const lows = c.extremes?.lows ? span(c.extremes.lows.t.map((x) => (x == null ? undefined : x))) : null;
  const added = m.reduce((s, x) => s + x.precipMm, 0);
  const mm = c.annualRain?.p50 ?? added;
  return {
    cold: { floor: c.extremes?.minP01 ?? null, coolest: { i: coolI, mid: m[coolI].tmin, p10: c.p10?.[coolI]?.tmin ?? null, p90: c.p90?.[coolI]?.tmin ?? null }, lows },
    heat: { warmest: { i: warmI, mid: m[warmI].tmax, p10: c.p10?.[warmI]?.tmax ?? null, p90: c.p90?.[warmI]?.tmax ?? null }, p99: c.extremes?.maxP99 ?? null },
    rain: { mm, acrossRange: c.annualRain?.p50 != null, p10: c.annualRain?.p10 ?? null, p90: c.annualRain?.p90 ?? null, dryMonths: m.filter((x) => x.precipMm < 5).length, fog: mm < FOG_RAIN_MM },
    light: span(m.map((x) => x.dli)),
    air: { rh: span(m.map((x) => x.rh)), vpd: span(m.map((x) => x.vpdKpa)), wind: span(m.map((x) => x.windMs)), gap: span(m.map((x) => x.tmax - x.tmin))! },
    ground: { m: elevationOf(c.elevation) },
    spark: {
      cold: c.extremes?.lows ? c.extremes.lows.t.map((x) => (x == null ? NaN : x)) : m.map((x) => x.tmin),
      heat: m.map((x) => x.tmax),
      rain: m.map((x) => x.precipMm),
      light: m.map((x) => x.dli ?? NaN),
      air: m.map((x) => x.rh ?? NaN)
    }
  };
}
