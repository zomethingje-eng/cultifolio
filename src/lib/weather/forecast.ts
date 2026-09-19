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
  /** When the minimum was forecast: an instant (ISO), or "start/end" for a six-hour interval the series only gives a minimum over. */
  tminAt?: string;
}

export interface Forecast {
  source: 'met.no';
  fetched: string;
  expires?: string;
  days: DayForecast[];
  /** Ordered nearest-first; a frost night is a min at or below 0 °C, a cold night at or below 3 °C. */
  firstFrost?: string;
  firstCold?: string;
  /** Hours from the first step to the end of the last interval: what "no frost" is a statement about. */
  hoursCovered: number;
  /** The site's local offset from UTC in whole hours, from its longitude, so times can be printed as local. */
  offsetH: number;
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
  const day = (ms: number) => new Date(ms + offsetH * 3600_000).toISOString().slice(0, 10);
  const at = (date: string) => {
    let d = byDay.get(date);
    if (!d) byDay.set(date, (d = { date, tmin: Infinity, tmax: -Infinity, precipMm: 0, steps: 0 }));
    return d;
  };
  const series = res.properties?.timeseries ?? [];
  for (let i = 0; i < series.length; i++) {
    const t = series[i];
    const start = new Date(t.time).getTime();
    const d = at(day(start));
    const inst = t.data.instant?.details?.air_temperature;
    const six = t.data.next_6_hours?.details;
    if (typeof inst === 'number') {
      if (inst < d.tmin) {
        d.tmin = inst;
        d.tminAt = t.time;
      }
      d.tmax = Math.max(d.tmax, inst);
    }
    if (six) {
      // A six-hour minimum belongs to the interval it covers, not to the step's date: an interval from
      // 21:00 to 03:00 is the night of the later date, so it is filed by its midpoint and reported with its span.
      if (typeof six.air_temperature_min === 'number') {
        const mid = at(day(start + 3 * 3600_000));
        if (six.air_temperature_min < mid.tmin) {
          mid.tmin = six.air_temperature_min;
          mid.tminAt = `${t.time}/${new Date(start + 6 * 3600_000).toISOString()}`;
        }
      }
      if (typeof six.air_temperature_max === 'number') d.tmax = Math.max(d.tmax, six.air_temperature_max);
    }
    // Precipitation belongs to the interval a step covers, counted once. The series is hourly at
    // first (next_1_hours) and six-hourly later (next_6_hours only); the interval is the gap to the
    // next step, and its rain is spread over the hours it spans, so an interval across midnight is
    // shared between the two dates rather than handed whole to the first.
    const p1 = t.data.next_1_hours?.details?.precipitation_amount;
    const p6 = six?.precipitation_amount;
    const next = series[i + 1] ? new Date(series[i + 1].time).getTime() : start + (typeof p1 === 'number' ? 1 : 6) * 3600_000;
    const hours = Math.max(1, Math.min(6, Math.round((next - start) / 3600_000)));
    let amount: number | null = null;
    if (hours === 1 && typeof p1 === 'number') amount = p1;
    else if (typeof p6 === 'number') amount = (p6 * hours) / 6; // a six-hour total for the hours this step covers
    else if (typeof p1 === 'number') amount = p1;
    if (amount != null) {
      const perHour = amount / hours;
      for (let h = 0; h < hours; h++) at(day(start + h * 3600_000)).precipMm += perHour;
    }
    d.steps++;
  }
  const days = [...byDay.values()].filter((d) => Number.isFinite(d.tmin)).map((d) => ({ ...d, precipMm: Math.round(d.precipMm * 10) / 10 }));
  let hoursCovered = 0;
  if (series.length) {
    const first = new Date(series[0].time).getTime();
    const last = series[series.length - 1];
    const lastEnd = new Date(last.time).getTime() + (last.data.next_6_hours ? 6 : last.data.next_1_hours ? 1 : 0) * 3600_000;
    hoursCovered = Math.max(0, Math.round((lastEnd - first) / 3600_000));
  }
  return { source: 'met.no', fetched, expires, days, firstFrost: days.find((d) => d.tmin <= 0)?.date, firstCold: days.find((d) => d.tmin <= 3)?.date, hoursCovered, offsetH };
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

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const localHM = (ms: number, offsetH: number) => new Date(ms + offsetH * 3600_000).toISOString().slice(11, 16);
const localDay = (ms: number, offsetH: number) => WEEKDAY[new Date(ms + offsetH * 3600_000).getUTCDay()];

/** "at 05:00 Thursday", or for a six-hour minimum "between 21:00 Wednesday and 03:00 Thursday". Local time by the site's longitude. */
export function whenText(tminAt: string | undefined, offsetH: number): string {
  if (!tminAt) return '';
  const [a, b] = tminAt.split('/');
  const ta = new Date(a).getTime();
  if (!b) return `at ${localHM(ta, offsetH)} ${localDay(ta, offsetH)}`;
  const tb = new Date(b).getTime();
  const da = localDay(ta, offsetH), db = localDay(tb, offsetH);
  return `between ${localHM(ta, offsetH)} ${da} and ${localHM(tb, offsetH)}${db === da ? '' : ' ' + db}`;
}

/** What the frost panel says. Thresholds are in °C at 2 m; a bench under glass or indoors adjusts them itself. Every sentence names the hours it covers or the night it is about. */
export function frostRisk(f: Forecast, alerts: Alert[]): { level: 'none' | 'cold' | 'frost' | 'warning'; text: string } {
  const warn = alerts.find((a) => /Freeze Warning|Hard Freeze Warning|Extreme Cold Warning/.test(a.event));
  if (warn) return { level: 'warning', text: `${warn.event} in force${warn.ends ? ` until ${warn.ends.slice(0, 16).replace('T', ' ')}` : ''} (NOAA/NWS).` };
  const adv = alerts.find((a) => /Frost Advisory|Freeze Watch|Cold Weather Advisory/.test(a.event));
  if (f.firstFrost) {
    const d = f.days.find((x) => x.date === f.firstFrost)!;
    return { level: 'frost', text: `Frost forecast: ${d.tmin.toFixed(1)} °C ${whenText(d.tminAt, f.offsetH)} (${d.date}, MET Norway)${adv ? `; ${adv.event} issued (NOAA/NWS)` : ''}.` };
  }
  if (adv) return { level: 'frost', text: `${adv.event} issued (NOAA/NWS).` };
  if (f.firstCold) {
    const d = f.days.find((x) => x.date === f.firstCold)!;
    return { level: 'cold', text: `Cold night ahead: ${d.tmin.toFixed(1)} °C ${whenText(d.tminAt, f.offsetH)} (${d.date}, MET Norway).` };
  }
  const coldest = f.days.length ? f.days.reduce((a, b) => (b.tmin < a.tmin ? b : a)) : null;
  return { level: 'none', text: coldest ? `No frost in the next ${f.hoursCovered} hours of forecast; coldest ${coldest.tmin.toFixed(1)} °C ${whenText(coldest.tminAt, f.offsetH)} (MET Norway).` : 'No forecast available.' };
}
