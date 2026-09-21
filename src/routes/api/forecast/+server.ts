import { parseUnits } from '$core/units';
import { json, error } from '@sveltejs/kit';
import { metUrl, reduceMet, nwsAlertsUrl, reduceNws, isUS, frostRisk, type MetResponse } from '$lib/weather/forecast';
import { USER_AGENT } from '$dossier/fetch';
import type { RequestHandler } from './$types';

/**
 * GET /api/forecast?lat=&lon=[&alt=]
 * MET Norway Locationforecast reduced to daily min/max, plus NWS frost/freeze
 * alerts for US points, plus the frost-risk verdict. Cached at the edge for
 * an hour per 0.01° cell so a site polls MET no more than hourly however many
 * devices watch it. MET asks for ≤4 decimals and an identifying User-Agent.
 */
const notAnswered = () => json({ error: 'forecast source did not answer' }, { status: 502, headers: { 'cache-control': 'no-store' } });

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const lat = Number(url.searchParams.get('lat')),
    lon = Number(url.searchParams.get('lon'));
  const alt = url.searchParams.get('alt');
  const units = parseUnits(url.searchParams.get('units')) ?? 'metric';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) error(400, 'lat and lon required');
  const la = Math.round(lat * 100) / 100,
    lo = Math.round(lon * 100) / 100;
  const cacheKey = new Request(`https://cultifolio.com/api/forecast?lat=${la}&lon=${lo}&alt=${alt ?? ''}`);
  const cache = platform?.caches?.default;
  const hit = cache ? await cache.match(cacheKey) : undefined;
  if (hit) return hit;

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
  const body = { lat: la, lon: lo, forecast, alerts, alertsStatus, risk: frostRisk(forecast, alerts, units), attribution: ['Forecast data from MET Norway (CC BY 4.0)', ...(isUS(la, lo) ? ['Alerts: NOAA National Weather Service'] : [])] };
  const res = json(body, { headers: { 'cache-control': 'public, max-age=3600' } });
  if (cache && platform?.context) platform.context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
};
