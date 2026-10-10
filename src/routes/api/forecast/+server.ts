import { parseUnits } from '$core/units';
import { forBuild } from '$lib/server/build';
import { json, error } from '@sveltejs/kit';
import { metUrl, reduceMet, nwsAlertsUrl, reduceNws, isUS, frostRisk, type MetResponse } from '$lib/weather/forecast';
import { USER_AGENT } from '$dossier/fetch';
import { limited, upstreamCall, heldBack, clientIp } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * GET /api/forecast?lat=&lon=[&alt=]
 * MET Norway Locationforecast reduced to daily min/max, plus NWS frost/freeze
 * alerts for US points, plus the frost-risk verdict. The forecast and alerts
 * are kept in the Worker's cache (the Cache API) for an hour per 0.01° cell so a site polls MET no
 * more than hourly however many devices watch it (five minutes when the NWS did
 * not answer for the alerts: `REFUSED_TTL_S`); the verdict is worded in the
 * reader's units on every request, so the cache never hands a Fahrenheit
 * sentence to a Celsius reader. MET asks for ≤4 decimals and an identifying
 * User-Agent.
 */
/**
 * How long an answer whose alerts the NWS did not answer is kept, at the edge and in the browser (seconds): kept for the
 * hour, it said "alerts not checked" for an hour after the NWS recovered (round sixty-two; the words review, 18). Short
 * enough that the alerts are asked again soon, long enough that a site watched by many devices still asks MET at most
 * twelve times an hour while the NWS is down.
 */
const REFUSED_TTL_S = 300;
/** How long any other answer is kept (seconds). */
const TTL_S = 3600;
const ttlOf = (status: string | undefined) => (status === 'refused' || status === 'unanswered' ? REFUSED_TTL_S : TTL_S);
const notAnswered = () => json({ error: 'forecast source did not answer' }, { status: 502, headers: { 'cache-control': 'no-store' } });
/** A source's 429 or 403: it refused this site's request, which is said as a refusal (round sixty-seven; triage-66 S8). */
export const _refusedBySource = (status: number) => status === 429 || status === 403;
/**
 * MET Norway refused this site's request (its 429 or 403): 502 as before, said as a refusal, never as "did not answer"
 * (round sixty-seven; triage-66 S8, R45-11): `refused: true`, the source's status, and its Retry-After when it gave one,
 * so a page can say "MET Norway refused this site's request" and wait it out.
 */
const refusedBy = (r: Response) => {
  const wait = Number(r.headers.get('retry-after'));
  const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.min(3600, Math.ceil(wait)) : null;
  return json({ error: "MET Norway refused this site's request", refused: true, service: 'met', status: r.status, ...(retryAfter ? { retryAfter } : {}) }, { status: 502, headers: { 'cache-control': 'no-store', ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}) } });
};

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  // Absent or blank is not zero: Number('') is 0, and 0,0 is a real place in the Gulf of Guinea that MET would answer for.
  const coord = (k: string) => {
    const v = url.searchParams.get(k)?.trim();
    return v ? Number(v) : NaN;
  };
  const lat = coord('lat'),
    lon = coord('lon');
  const altRaw = url.searchParams.get('alt')?.trim();
  const units = parseUnits(url.searchParams.get('units')) ?? 'metric';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) error(400, 'lat and lon required');
  // An altitude is a number between the Dead Sea and the high Himalaya, rounded to 10 m so that 300 and 300.0001 are one cache line and one MET call; anything else is our caller's mistake (400), not the source failing to answer.
  const altN = altRaw ? Number(altRaw) : null;
  if (altN != null && (!Number.isFinite(altN) || altN < -500 || altN > 9000)) error(400, 'alt must be a height in metres between -500 and 9000');
  const alt = altN == null ? null : String(Math.round(altN / 10) * 10);
  const la = Math.round(lat * 100) / 100,
    lo = Math.round(lon * 100) / 100;
  // On a private host, as the names route: a key that is also a real URL of this site is a raw object the edge can hand
  // back to a request for that URL, which is what happened to the live check after round nineteen (round twenty-one, 5).
  const cacheKey = new Request(`https://cache.cultifolio/forecast?lat=${la}&lon=${lo}&alt=${alt ?? ''}`);
  const cache = platform?.caches?.default;
  // `refused`: the NWS refused this site's request (its 429 or 403); `unanswered`: it did not answer (unreachable, a
  // timeout, another status, a body that is not alerts). Both were 'refused' before round sixty-seven (triage-66 S8, R45-11).
  type Cached = { lat: number; lon: number; forecast: ReturnType<typeof reduceMet>; alerts: ReturnType<typeof reduceNws>; alertsStatus: 'ok' | 'none' | 'refused' | 'unanswered' | 'n/a'; attribution: string[] };
  // Kept by the adapter's cache and the browser only under the build the request names (round sixty-seven; triage-66 S7):
  // the verdict's words are this build's.
  const withRisk = (c: Cached, cc: string) => json({ ...c, risk: frostRisk(c.forecast, c.alerts, units) }, { headers: { 'cache-control': forBuild(url, cc) } });
  // A cache that fails to answer is a forecast asked for, not a 500 (round sixty; the server review, 12).
  const hit = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (hit) {
    try {
      // The cached body is the raw forecast; the verdict is worded here, in this reader's units, and the browser keeps
      // the worded answer only for the rest of the hour the Worker's cache would.
      const age = Number(hit.headers.get('age')) || 0;
      const c = (await hit.json()) as Cached;
      // Never past what the edge keeps it for: an hour, or five minutes when the NWS did not answer (round sixty-two; the
      // words review, 18). The floor of a minute stays below either.
      const ttl = ttlOf(c.alertsStatus);
      return withRisk(c, `public, max-age=${Math.max(Math.min(60, ttl), ttl - age)}`);
    } catch {
      /* an unreadable cache entry is fetched afresh below */
    }
  }

  // Only a cache miss costs MET a call, so only a miss counts against the address: a garden club on one Wi-Fi watching one
  // site shares a cache line, not an allowance. A stream of distinct coordinates is what the limit is for.
  const stop = await limited(platform, getClientAddress, 'forecast');
  if (stop) return stop;
  // The site's own minute of calls to MET and the NWS, for every address together, so the site's User-Agent is never the
  // one MET blocks (round sixty; the server review, 16). Since round sixty-one each has its own share, one address takes
  // at most a tenth of it, a US point takes from both (two calls), and a call held back is said as held back, 503 "not
  // asked", never as a source that did not answer (rule 2; the server review, 4; B13).
  const us = isUS(la, lo);
  // No answer says "only the NWS's share was spent": every NWS call is taken with a MET call, both shares are equal and MET
  // is checked first, so a refusal always names MET. The branch that answered MET alone with the alerts "not asked" was
  // a state no request reached, and is gone (round sixty-two, second pass; the server review, 4).
  const call = await upstreamCall(platform, us ? ['met', 'nws'] : ['met'], clientIp(getClientAddress));
  if (!call.ok) return heldBack(call);
  const headers = { 'user-agent': USER_AGENT, accept: 'application/json' };
  // Anything short of a well-formed answer from MET (unreachable, a non-2xx, a body that is not JSON or not a forecast) is one
  // plain 502 with no-store: the page says "not checked", and a bad hour is never cached.
  let forecast: ReturnType<typeof reduceMet>;
  try {
    const metRes = await fetch(metUrl(la, lo, alt ? Number(alt) : undefined), { headers });
    if (_refusedBySource(metRes.status)) return refusedBy(metRes);
    if (!metRes.ok) return notAnswered();
    forecast = reduceMet((await metRes.json()) as MetResponse, lo, new Date().toISOString(), metRes.headers.get('expires') ?? undefined);
  } catch {
    return notAnswered();
  }
  // A 200 with no days in it (an empty body, a series without a temperature) is not a forecast that says "no frost"; it is the source not answering.
  if (!forecast.days.length || !forecast.days.some((d) => Number.isFinite(d.tmin))) return notAnswered();

  let alerts: ReturnType<typeof reduceNws> = [];
  let alertsStatus: Cached['alertsStatus'] = 'n/a';
  if (us) {
    try {
      const r = await fetch(nwsAlertsUrl(la, lo), { headers });
      if (r.ok) {
        alerts = reduceNws(await r.json());
        alertsStatus = alerts.length ? 'ok' : 'none';
      } else alertsStatus = _refusedBySource(r.status) ? 'refused' : 'unanswered';
    } catch {
      alertsStatus = 'unanswered';
    }
  }
  const raw: Cached = { lat: la, lon: lo, forecast, alerts, alertsStatus, attribution: ['Forecast data from MET Norway (CC BY 4.0)', ...(us ? ['Alerts: NOAA National Weather Service'] : [])] };
  // The lifetimes are written out (REFUSED_TTL_S and TTL_S) so the about pages' check reads them from the put.
  if (cache && platform?.context) platform.context.waitUntil(cache.put(cacheKey, json(raw, { headers: { 'cache-control': alertsStatus === 'refused' || alertsStatus === 'unanswered' ? 'public, max-age=300' : 'public, max-age=3600' } })).catch(() => {}));
  return withRisk(raw, `public, max-age=${ttlOf(alertsStatus)}`);
};
