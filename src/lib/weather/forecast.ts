/**
 * Frost watch inputs. MET Norway's Locationforecast (CC BY 4.0, worldwide)
 * is the forecast; the US National Weather Service adds official Frost
 * Advisory / Freeze Warning products where they exist. Both are free for
 * commercial use with attribution and an identifying User-Agent; both are
 * called only from the Worker so the UA is set and responses are cached.
 */

export interface DayForecast {
  date: string; // YYYY-MM-DD, local to the site's UTC offset approximation
  tmin: number;
  tmax: number;
  precipMm: number;
  /** How many hourly/6-hourly steps informed this day; low counts at the end of the horizon mean "partial". */
  steps: number;
}

export interface Forecast {
  source: 'met.no';
  fetched: string;
  expires?: string;
  days: DayForecast[];
  /** Ordered nearest-first; a frost night is a min at or below 0 °C, a cold night at or below 3 °C. */
  firstFrost?: string;
  firstCold?: string;
}

interface MetTimeseries {
  time: string;
  data: {
    instant?: { details?: { air_temperature?: number } };
    next_1_hours?: { details?: { precipitation_amount?: number } };
    next_6_hours?: { details?: { air_temperature_max?: number; air_temperature_min?: number; precipitation_amount?: number } };
  };
}
export interface MetResponse {
  properties?: { timeseries?: MetTimeseries[] };
}

export function metUrl(lat: number, lon: number, altitudeM?: number): string {
  const la = lat.toFixed(4),
    lo = lon.toFixed(4);
  return `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${la}&lon=${lo}${altitudeM != null ? `&altitude=${Math.round(altitudeM)}` : ''}`;
}

/** Reduce MET's hourly-then-6-hourly series to daily min/max. Days are cut at local midnight using a longitude-based offset (good to within an hour, which is enough for a night minimum). */
export function reduceMet(res: MetResponse, lon: number, fetched = new Date().toISOString(), expires?: string): Forecast {
  const offsetH = Math.round(lon / 15);
  const byDay = new Map<string, DayForecast>();
  for (const t of res.properties?.timeseries ?? []) {
    const local = new Date(new Date(t.time).getTime() + offsetH * 3600_000);
    const date = local.toISOString().slice(0, 10);
    const d = byDay.get(date) ?? { date, tmin: Infinity, tmax: -Infinity, precipMm: 0, steps: 0 };
    const inst = t.data.instant?.details?.air_temperature;
    const six = t.data.next_6_hours?.details;
    if (typeof inst === 'number') {
      d.tmin = Math.min(d.tmin, inst);
      d.tmax = Math.max(d.tmax, inst);
    }
    if (six) {
      if (typeof six.air_temperature_min === 'number') d.tmin = Math.min(d.tmin, six.air_temperature_min);
      if (typeof six.air_temperature_max === 'number') d.tmax = Math.max(d.tmax, six.air_temperature_max);
    }
    const p1 = t.data.next_1_hours?.details?.precipitation_amount;
    if (typeof p1 === 'number') d.precipMm += p1;
    else if (typeof six?.precipitation_amount === 'number') d.precipMm += six.precipitation_amount / 6; // 6-hourly steps repeat; approximate
    d.steps++;
    byDay.set(date, d);
  }
  const days = [...byDay.values()].filter((d) => Number.isFinite(d.tmin)).map((d) => ({ ...d, precipMm: Math.round(d.precipMm * 10) / 10 }));
  return { source: 'met.no', fetched, expires, days, firstFrost: days.find((d) => d.tmin <= 0)?.date, firstCold: days.find((d) => d.tmin <= 3)?.date };
}

/* ---------- NWS alerts (US only) ---------- */

export interface Alert {
  event: string;
  headline?: string;
  onset?: string;
  ends?: string;
  severity?: string;
  area?: string;
}
export const FROST_EVENTS = ['Frost Advisory', 'Freeze Watch', 'Freeze Warning', 'Hard Freeze Watch', 'Hard Freeze Warning', 'Extreme Cold Watch', 'Extreme Cold Warning', 'Cold Weather Advisory'];

export function nwsAlertsUrl(lat: number, lon: number): string {
  return `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function reduceNws(res: { features?: Array<{ properties?: Record<string, unknown> }> }): Alert[] {
  const out: Alert[] = [];
  for (const f of res.features ?? []) {
    const p = f.properties ?? {};
    const event = String(p.event ?? '');
    if (!FROST_EVENTS.includes(event)) continue;
    out.push({ event, headline: p.headline as string | undefined, onset: p.onset as string | undefined, ends: (p.ends ?? p.expires) as string | undefined, severity: p.severity as string | undefined, area: p.areaDesc as string | undefined });
  }
  return out;
}

export const isUS = (lat: number, lon: number) => (lat > 24 && lat < 50 && lon > -125 && lon < -66) || (lat > 51 && lat < 72 && lon > -170 && lon < -130) || (lat > 18 && lat < 23 && lon > -161 && lon < -154);

/** What the frost panel says. Thresholds are in °C at 2 m; a bench under glass or indoors adjusts them itself. */
export function frostRisk(f: Forecast, alerts: Alert[]): { level: 'none' | 'cold' | 'frost' | 'warning'; text: string } {
  const warn = alerts.find((a) => /Freeze Warning|Hard Freeze Warning|Extreme Cold Warning/.test(a.event));
  if (warn) return { level: 'warning', text: `${warn.event} in force${warn.ends ? ` until ${warn.ends.slice(0, 16).replace('T', ' ')}` : ''} (NOAA/NWS).` };
  const adv = alerts.find((a) => /Frost Advisory|Freeze Watch|Cold Weather Advisory/.test(a.event));
  if (f.firstFrost) {
    const d = f.days.find((x) => x.date === f.firstFrost)!;
    return { level: 'frost', text: `Frost forecast: ${d.tmin.toFixed(1)} °C on ${d.date}${adv ? `; ${adv.event} issued (NOAA/NWS)` : ''}. Bring tender plants in or cover them.` };
  }
  if (adv) return { level: 'frost', text: `${adv.event} issued (NOAA/NWS).` };
  if (f.firstCold) {
    const d = f.days.find((x) => x.date === f.firstCold)!;
    return { level: 'cold', text: `Cold night ahead: ${d.tmin.toFixed(1)} °C on ${d.date}. Watch anything that dislikes wet cold.` };
  }
  const lo = f.days.length ? Math.min(...f.days.map((d) => d.tmin)) : NaN;
  return { level: 'none', text: Number.isFinite(lo) ? `No frost in the next ${f.days.length} days; coldest night ${lo.toFixed(1)} °C.` : 'No forecast available.' };
}
