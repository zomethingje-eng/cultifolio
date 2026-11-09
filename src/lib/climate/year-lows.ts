/**
 * Each year's lowest night at the typical cell, from NASA POWER's daily series (round eighty-seven): what the habitat's
 * hardiness zone is worked out from (`$dossier/hardiness`). USDA's zones are the 30-year mean of each year's lowest
 * temperature; the dossier kept only the lowest night of all (`minAbs`) and the 1-in-100 night (`minP01`), so the walk
 * keeps the yearly lows too, read from the same cached series, by the same lapse correction as the other extremes.
 *
 * A year is the calendar year (January to December), as POWER's dates give it. A year counts only when it holds at least
 * 95% of its days (347 of 365), the share `extremesUsable` asks of the whole series: a year with weeks missing may have
 * lost its coldest night. Such a year is `null`, never a low.
 */
import { LAPSE_C_PER_M, type DailySeries } from '$core/extremes';
import { r1 } from '$core/num';

/** The days a calendar year must hold to count: 95% of 365, as `extremesUsable` asks of the whole series. */
export const YEAR_DAYS_MIN = Math.ceil(365 * 0.95);

export interface YearLows {
  /** The first calendar year of the series. */
  from: number;
  /** Each year's lowest night in °C, one decimal, lapse-corrected; null for a year with fewer than `YEAR_DAYS_MIN` days. */
  t: Array<number | null>;
}

/** The yearly lows of a series, corrected by `elevDeltaM` at 6.5 °C/km as `reduceExtremes` corrects (target − source). */
export function yearLows(s: DailySeries, elevDeltaM = 0): YearLows | null {
  const corr = -LAPSE_C_PER_M * elevDeltaM;
  const low = new Map<number, number>(), days = new Map<number, number>();
  for (let i = 0; i < s.dates.length; i++) {
    const a = s.tmin[i], b = s.tmax[i];
    if (a == null || b == null || a <= -900 || b <= -900 || !Number.isFinite(a)) continue;
    const y = Number(s.dates[i].slice(0, 4));
    if (!Number.isInteger(y)) continue;
    const t = a + corr;
    days.set(y, (days.get(y) ?? 0) + 1);
    if (!low.has(y) || t < low.get(y)!) low.set(y, t);
  }
  if (!low.size) return null;
  const years = [...low.keys()].sort((p, q) => p - q);
  const from = years[0], to = years[years.length - 1];
  const t: Array<number | null> = [];
  for (let y = from; y <= to; y++) t.push((days.get(y) ?? 0) >= YEAR_DAYS_MIN ? r1(low.get(y)!) : null);
  return { from, t };
}
