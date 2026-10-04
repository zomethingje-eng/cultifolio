/**
 * One way to ask for the forecast from the browser, shared by the front page,
 * the frost page and a bench, with one answer kept in session storage for
 * thirty minutes per site and units. The edge caches an hour per cell, but a
 * grower who opens the app ten times in an hour would still make ten calls,
 * and /api/forecast is rate-limited per address; this keeps that to two. A
 * refusal is never kept: the next open asks again.
 */
import { browser } from '$app/environment';
import type { Units } from '$core/units';

export const FORECAST_TTL_MS = 30 * 60_000;
const KEY = 'cultifolio.forecast';

/** `at`: when the answer was read from the server (ms), which a cached one is older than the moment it is asked for. */
export type ForecastAnswer<T> = { ok: true; body: T; at: number } | { ok: false; status: number };

type Entry = { at: number; body: unknown };

function readCache(k: string): Entry | undefined {
  if (!browser) return undefined;
  try {
    const all = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
    const e = all[k];
    return e && Date.now() - e.at < FORECAST_TTL_MS ? e : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(k: string, body: unknown) {
  if (!browser) return;
  try {
    const all = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
    const now = Date.now();
    for (const [key, e] of Object.entries(all)) if (now - e.at >= FORECAST_TTL_MS) delete all[key];
    all[k] = { at: now, body };
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a browser without session storage asks each time, as before */
  }
}

/** The forecast for a point in the reader's units: from the session's cache when fresh, else from /api/forecast. */
/** Requests in flight by cache key: two readers of one site in the same moment (the watch and the Today tab) share one request (round fifty-four, 4). */
const inFlight = new Map<string, Promise<ForecastAnswer<unknown>>>();
export async function getForecast<T = unknown>(lat: number, lon: number, units: Units, altM?: number | null): Promise<ForecastAnswer<T>> {
  const la = lat.toFixed(2), lo = lon.toFixed(2), alt = altM != null ? String(Math.round(altM / 10) * 10) : null;
  const k = `${la},${lo},${alt ?? ''},${units}`;
  let p = inFlight.get(k);
  if (!p) {
    p = fetchForecast(lat, lon, units, altM).finally(() => { if (inFlight.get(k) === p) inFlight.delete(k); });
    inFlight.set(k, p);
  }
  return p as Promise<ForecastAnswer<T>>;
}
async function fetchForecast<T = unknown>(lat: number, lon: number, units: Units, altM?: number | null): Promise<ForecastAnswer<T>> {
  // Rounded here, before anything leaves the device: a hundredth of a degree (about a kilometre) and ten metres, which is
  // all a forecast can use. The server rounds again for the weather services; this is so the server itself never sees
  // more (round sixteen, 11).
  const la = lat.toFixed(2), lo = lon.toFixed(2), alt = altM != null ? String(Math.round(altM / 10) * 10) : null;
  const k = `${la},${lo},${alt ?? ''},${units}`;
  const hit = readCache(k);
  if (hit !== undefined) return { ok: true, body: clockTime(hit.body) as T, at: hit.at };
  // Ten seconds, then the check did not happen, which is said: a request that hung held the watch's one read for good
  // and the line under the top bar said nothing (round fifty-eight; the client review).
  const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(10_000) : undefined;
  const r = await fetch(`/api/forecast?lat=${la}&lon=${lo}${alt != null ? `&alt=${alt}` : ''}&units=${units}`, { signal });
  if (!r.ok) return { ok: false, status: r.status };
  const body = (await r.json()) as T;
  writeCache(k, body);
  return { ok: true, body: clockTime(body) as T, at: Date.now() };
}

/* ---------- Clock time for the frost line ---------- */

type RiskBody = { forecast?: { days?: Array<{ date: string; tmin: number; tminAt?: string }>; offsetH?: number }; risk?: { level: string; text: string } };
const SOLAR = /\b(around|between) \d\d:\d\d [A-Z][a-z]+(?: and \d\d:\d\d(?: [A-Z][a-z]+)?)? solar time\b/;

/** The zone's offset from UTC in hours at an instant, by what Intl prints for it. */
function zoneOffsetH(zone: string | undefined, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(at));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round(((asUtc - Math.floor(at / 60_000) * 60_000) / 3600_000) * 4) / 4;
}

/**
 * The server says when the coldest hour falls in solar time by the site's longitude, because MET's answer carries no
 * zone and a zone table is more than a frost line needs (round fifteen, 9). On the device the clock is known: when the
 * browser's zone is within two hours of the site's solar offset, the reader is at the site or in its zone, and the line
 * is said in their clock time instead, weekday from the same zone. A browser five zones away (a grower checking a
 * greenhouse from abroad) keeps the solar wording, which is at least true. The server's text is never changed in the
 * cache; the rewrite is on the way out, so a wrong guess costs one line, not the stored answer (improvements, 6).
 */
export function clockTime<T>(body: T, zone?: string): T {
  const b = body as RiskBody;
  const f = b?.forecast, risk = b?.risk;
  if (!f?.days || typeof f.offsetH !== 'number' || !risk?.text || !SOLAR.test(risk.text)) return body;
  try {
    const day = risk.level === 'none' ? f.days.reduce((a, c) => (c.tmin < a.tmin ? c : a)) : f.days.find((d) => risk.text.includes(`(${d.date},`));
    if (!day?.tminAt) return body;
    const [a, bb] = day.tminAt.split('/');
    const ta = new Date(a).getTime();
    // Compared around the clock: Apia's solar offset is -11 and its zone +13, twenty-four hours apart on the number line and
    // the same hour on the clock, so the line is said in clock time there. The reader's weekday then differs from the
    // table's solar date (05:00 Thursday on an Apia clock is 05:00 Wednesday by the sun), which "in the table" is for; saying
    // solar time instead would give the reader at the site a weekday their clock disagrees with (round twenty-two, 13; round twenty-three, 13).
    const x = (((zoneOffsetH(zone, ta) - f.offsetH) % 24) + 24) % 24;
    if (!Number.isFinite(ta) || Math.min(x, 24 - x) > 2) return body;
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
    const wd = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long' });
    // "your time": the reader's clock, which is the site's clock when they are there, and near it when they are not; the
    // line never claims to be the site's own clock, which the server does not know (round twenty, 7).
    let when: string;
    if (!bb) when = `around ${hm.format(ta)} ${wd.format(ta)}, your time`;
    else {
      const tb = new Date(bb).getTime();
      if (!Number.isFinite(tb)) return body;
      const da = wd.format(ta), db = wd.format(tb);
      when = `between ${hm.format(ta)} ${da} and ${hm.format(tb)}${db === da ? '' : ' ' + db}, your time`;
    }
    // The bracketed date stays the server's: it is the row of the frost table, which lists the site's solar days, and a
    // line in the reader's clock must still point at that row; "in the table" says that is what it is, since "night of
    // the 15th" in plain English is the evening of the 15th, which a pre-dawn frost is not (round twenty-two, 12).
    const text = risk.text.replace(SOLAR, when).replace(`(${day.date},`, `(${day.date} in the table,`);
    return { ...b, risk: { ...risk, text } } as T;
  } catch {
    return body;
  }
}

/**
 * The sentence for a forecast that was not had. A refusal of ours (a bad altitude, a rate limit) is said as ours; only
 * a failure of the source is blamed on the source. Never a status code, never "no frost".
 */
export function forecastRefusal(status: number | null, what: 'Forecast' | 'Frost' = 'Forecast'): string {
  if (status === 429) return `${what} not checked: this site asked this device to wait a few minutes before asking again.`;
  if (status === 400) return `${what} not checked: this place's altitude is outside −500 to 9000 m, or its coordinates are not a place; check them.`;
  return `${what} not checked: the forecast source did not answer.`;
}
