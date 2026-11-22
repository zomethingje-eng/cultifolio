import { json, error } from '@sveltejs/kit';
import { workerKey } from '$lib/server/worker-cache';
import { USER_AGENT } from '$dossier/fetch';
import { limited, upstreamCall, heldBack, clientIp } from '$lib/server/sync';
import { placeQuery, nominatimUrl, readPlaces, PLACE_CREDIT, type Place } from '$lib/weather/place';
import type { RequestHandler } from './$types';

/**
 * GET /api/place?q=Kew (round 107; src/lib/weather/place.ts): a town for the frost watch's site, asked of OpenStreetMap's
 * Nominatim from the server, so the visitor's address is never Nominatim's to see. Up to five places, each a name and
 * coordinates (three decimals), and the credit its licence asks. An answer is kept in the Worker's cache for a week under
 * the words asked, lower-cased, so a town asked twice is one call; the words themselves are not logged or kept otherwise.
 * Only a miss counts against the address and the site's share of Nominatim's one call a second (`OSM_SHARE`). A source
 * that refused or did not answer is said as that (502), a call held back as not asked (rule 2).
 */
const TTL_S = 604_800;
type Answer = { q: string; places: Place[]; credit: string };
export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = placeQuery(url.searchParams.get('q'));
  if (!q) error(400, 'q: a place name of 2 to 100 characters');
  const cacheKey = workerKey('place', { q: q.toLowerCase() });
  const cache = platform?.caches?.default;
  // A cache that fails to answer is a town asked for afresh, not a failure.
  const hit = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  if (hit) {
    try { return json((await hit.json()) as Answer, { headers: { 'cache-control': 'private, max-age=3600' } }); } catch { /* asked afresh */ }
  }
  const stop = await limited(platform, getClientAddress, 'place');
  if (stop) return stop;
  const call = await upstreamCall(platform, ['osm'], clientIp(getClientAddress));
  if (!call.ok) return heldBack(call);
  let places: Place[];
  try {
    const r = await fetch(nominatimUrl(q), { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    if (r.status === 429 || r.status === 403) return json({ error: "OpenStreetMap's Nominatim refused this site's request", refused: true }, { status: 502, headers: { 'cache-control': 'no-store' } });
    if (!r.ok) return json({ error: "OpenStreetMap's Nominatim did not answer" }, { status: 502, headers: { 'cache-control': 'no-store' } });
    places = readPlaces(await r.json());
  } catch {
    return json({ error: "OpenStreetMap's Nominatim did not answer" }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  const body: Answer = { q, places, credit: PLACE_CREDIT };
  // A copy not kept costs only a call next time: the answer is still given.
  if (cache && platform?.context) platform.context.waitUntil(cache.put(cacheKey, json(body, { headers: { 'cache-control': `public, max-age=${TTL_S}` } })).catch(() => {}));
  return json(body, { headers: { 'cache-control': 'private, max-age=3600' } });
};
