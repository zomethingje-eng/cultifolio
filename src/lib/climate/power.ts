/**
 * NASA POWER daily point series (MERRA-2, 0.5° × 0.625°, since 1981), used
 * only for what a climatology cannot give: absolute and percentile extremes
 * and frost-night frequency over four decades. US government data, no
 * licence restriction; POWER asks that the same location not be requested
 * repeatedly, so results are cached forever per POWER cell.
 */
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import { reduceExtremes, extremesUsable, type Extremes, type DailySeries } from '$core/extremes';

export const POWER_START = '19810101';
export const POWER_END = '20241231';

interface PowerResponse {
  geometry?: { coordinates?: [number, number, number] };
  header?: { fill_value?: number };
  properties?: { parameter?: Record<string, Record<string, number>> };
}

/** POWER's meteorological grid is 0.5° lat × 0.625° lon; snap so nearby points share one cached call. */
export function powerCell(lat: number, lon: number): { lat: number; lon: number; id: string } {
  const la = Math.round(lat / 0.5) * 0.5;
  const lo = Math.round(lon / 0.625) * 0.625;
  return { lat: la, lon: lo, id: `${la.toFixed(2)}_${lo.toFixed(3)}` };
}

export function powerUrl(lat: number, lon: number): string {
  return (
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG` +
    `&longitude=${lon}&latitude=${lat}&start=${POWER_START}&end=${POWER_END}&format=JSON`
  );
}

export interface PowerSeries {
  cell: string;
  elevationM?: number;
  series: DailySeries;
}

export async function fetchPowerSeries(f: JsonFetcher, lat: number, lon: number): Promise<FetchResult<PowerSeries>> {
  const c = powerCell(lat, lon);
  const r = await f<PowerResponse>(powerUrl(c.lat, c.lon), { timeoutMs: 60000 });
  if (r.status !== 'ok') return r;
  const p = r.data.properties?.parameter;
  const tmax = p?.T2M_MAX,
    tmin = p?.T2M_MIN,
    pr = p?.PRECTOTCORR;
  if (!tmax || !tmin) return { status: 'error', detail: 'POWER response lacked T2M fields' };
  const fill = r.data.header?.fill_value ?? -999;
  const dates = Object.keys(tmin).sort();
  const series: DailySeries = { dates: [], tmin: [], tmax: [], precip: [] };
  for (const d of dates) {
    const a = tmin[d],
      b = tmax[d];
    if (a == null || b == null || a === fill || b === fill) continue;
    series.dates.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
    series.tmin.push(a);
    series.tmax.push(b);
    series.precip!.push(pr?.[d] === fill ? NaN : (pr?.[d] ?? NaN));
  }
  if (!series.dates.length) return { status: 'none' };
  return { status: 'ok', data: { cell: c.id, elevationM: r.data.geometry?.coordinates?.[2], series } };
}

/** Extremes at the habitat cell, lapse-corrected from POWER's cell elevation to the grid cell's. */
export function extremesFor(ps: PowerSeries, targetElevM?: number): { extremes: Extremes; usable: boolean; deltaM: number } {
  const deltaM = targetElevM != null && ps.elevationM != null ? Math.round(targetElevM - ps.elevationM) : 0;
  const extremes = reduceExtremes(ps.series, deltaM);
  return { extremes, usable: extremesUsable(extremes), deltaM };
}
