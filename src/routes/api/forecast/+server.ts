import { parseUnits } from '$core/units';
import { json, error } from '@sveltejs/kit';
import { metUrl, reduceMet, nwsAlertsUrl, reduceNws, isUS, frostRisk, type MetResponse } from '$lib/weather/forecast';
import { USER_AGENT } from '$dossier/fetch';
import type { RequestHandler } from './$types';

/**
 * GET /api/forecast?lat=&lon=[&alt=]
 * MET Norway Locationforecast reduced to daily min/max, plus NWS frost/freeze
 * alerts for US points, plus the frost-risk verdict. The forecast and alerts
 * are cached at the edge for an hour per 0.01° cell so a site polls MET no
 * more than hourly however many devices watch it; the verdict is worded in the
 * reader's units on every request, so the cache never hands a Fahrenheit
 * sentence to a Celsius reader. MET asks for ≤4 decimals and an identifying
 * User-Agent.
 */
const notAnswered = () => json({ error: 'forecast source did not answer' }, { status: 502, headers: { 'cache-control': 'no-store' } });

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  // Absent or blank is not zero: Number('') is 0, and 0,0 is a real place in the Gulf of Guinea that MET would answer for.
  const coord = (k: string) => {
    const v = url.searchParams.get(k)?.trim();
    return v ? Number(v) : NaN;
  };
  const lat = coord('lat'),
    lon = coord('lon');
  const alt = url.searchParams.get('alt');
  const units = parseUnits(url.searchParams.get('units')) ?? 'metric';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) error(400, 'lat and lon required');
  const la = Math.round(lat * 100) / 100,
    lo = Math.round(lon * 100) / 100;
  const cacheKey = new Request(`https://cultifolio.com/api/forecast?lat=${la}&lon=${lo}&alt=${alt ?? ''}`);
  const cache = platform?.caches?.default;
  type Cached = { lat: number; lon: number; forecast: ReturnType<typeof reduceMet>; alerts: ReturnType<typeof reduceNws>; alertsStatus: 'ok' | 'none' | 'refused' | 'n/a'; attribution: string[] };
  const withRisk = (c: Cached, cc: string) => json({ ...c, risk: frostRisk(c.forecast, c.alerts, units) }, { headers: { 'cache-control': cc } });
  const hit = cache ? await cache.match(cacheKey) : undefined;
  if (hit) {
    try {
      // The cached body is the raw forecast; the verdict is worded here, in this reader's units, and the browser keeps
      // the worded answer only for the rest of the hour the edge would.
      const age = Number(hit.headers.get('age')) || 0;
      return withRisk((await hit.json()) as Cached, `public, max-age=${Math.max(60, 3600 - age)}`);
    } catch {
      /* an unreadable cache entry is fetched afresh below */
    }
  }

  const headers = { 'user-agent': USER_AGENT, accept: 'application/json' };
  // Anything short of a well-formed answer from MET (unreachable, a non-2xx, a body that is not JSON or not a forecast) is one
  // plain 502 with no-store: the page says "not checked", and a bad hour is never cached.
  let forecast: ReturnType<typeof reduceMet>;
  try {
    const metRes = await fetch(metUrl(la, lo, alt ? Number(alt) : undefined), { headers });
    if (!metRes.ok) return notAnswered();
    forecast = reduceMet((await metRes.json()) as MetResponse, lo, new Date().toISOString(), metRes.headers.get('expires') ?? undefined);
  } catch {
    return notAnswered();
  }

  let alerts: ReturnType<typeof reduceNws> = [];
  let alertsStatus: 'ok' | 'none' | 'refused' | 'n/a' = 'n/a';
  if (isUS(la, lo)) {
    try {
      const r = await fetch(nwsAlertsUrl(la, lo), { headers });
      if (r.ok) {
        alerts = reduceNws(await r.json());
        alertsStatus = alerts.length ? 'ok' : 'none';
      } else alertsStatus = 'refused';
    } catch {
      alertsStatus = 'refused';
    }
  }
  const raw: Cached = { lat: la, lon: lo, forecast, alerts, alertsStatus, attribution: ['Forecast data from MET Norway (CC BY 4.0)', ...(isUS(la, lo) ? ['Alerts: NOAA National Weather Service'] : [])] };
  if (cache && platform?.context) platform.context.waitUntil(cache.put(cacheKey, json(raw, { headers: { 'cache-control': 'public, max-age=3600' } })));
  return withRisk(raw, 'public, max-age=3600');
};
