/**
 * Reduce a multi-decade daily series (NASA POWER, MERRA-2, 0.5°) to the
 * extremes a grower cares about, and correct them to the elevation of the
 * finer climate cell the normals came from.
 *
 * Lapse rate: 6.5 °C per 1000 m is the environmental standard; the correction
 * is applied to temperatures only and stated in the provenance.
 */

export interface DailySeries {
  /** ISO dates, parallel arrays; -999 is POWER's fill value and is dropped. */
  dates: string[];
  tmin: number[];
  tmax: number[];
  precip?: number[];
}

export interface Extremes {
  years: number;
  days: number;
  minAbs: number;
  minP01: number;
  minP05: number;
  maxAbs: number;
  maxP99: number;
  frostDaysPerYear: number;
  /** Elevation delta applied, metres (target − source). 0 if none. */
  lapseAppliedM: number;
}

export const LAPSE_C_PER_M = 0.0065;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function reduceExtremes(s: DailySeries, elevDeltaM = 0): Extremes {
  const corr = -LAPSE_C_PER_M * elevDeltaM;
  const tmin: number[] = [],
    tmax: number[] = [];
  const years = new Set<string>();
  let frost = 0;
  for (let i = 0; i < s.dates.length; i++) {
    const a = s.tmin[i],
      b = s.tmax[i];
    if (a == null || b == null || a <= -900 || b <= -900) continue;
    const mn = a + corr,
      mx = b + corr;
    tmin.push(mn);
    tmax.push(mx);
    years.add(s.dates[i].slice(0, 4));
    if (mn <= 0) frost++;
  }
  tmin.sort((p, q) => p - q);
  tmax.sort((p, q) => p - q);
  const ny = Math.max(1, years.size);
  return {
    years: years.size,
    days: tmin.length,
    minAbs: tmin[0],
    minP01: quantile(tmin, 0.01),
    minP05: quantile(tmin, 0.05),
    maxAbs: tmax[tmax.length - 1],
    maxP99: quantile(tmax, 0.99),
    frostDaysPerYear: frost / ny,
    lapseAppliedM: elevDeltaM
  };
}

/** A series is usable when it covers at least 20 years at 95% completeness. */
export function extremesUsable(e: Extremes): boolean {
  return e.years >= 20 && e.days >= e.years * 365 * 0.95;
}
