import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { limited } from '$lib/server/sync';

/**
 * Name suggestions for the species picker, proxied from GBIF's backbone so
 * the browser never talks to a third-party host with what someone typed. The
 * answer is GBIF's own (the same JSON shape as species/suggest, trimmed to the
 * fields the picker reads), cached at the edge for a day: the backbone does
 * not change by the hour, and one query serves everyone who types it.
 *
 * What is forwarded is bounded twice. The query must look like a name (letters
 * in any script with their marks, spaces, the period of an abbreviation, an
 * apostrophe, a hyphen, the × of a hybrid; two to eighty characters), so the
 * cache and GBIF's goodwill are not spent on junk under the User-Agent the
 * corpus build shares. And one address gets `RATE.names` requests per window.
 *
 * Anything short of a well-formed answer from GBIF (unreachable, a non-2xx, a
 * 200 whose body is not JSON, JSON that is not an array) is a 502 with plain
 * JSON and `cache-control: no-store`, so a bad hour is never cached.
 */
const FIELDS = ['key', 'canonicalName', 'scientificName', 'family', 'rank', 'status'] as const;
type Row = { [K in (typeof FIELDS)[number]]?: unknown };
/** Letters and marks of any script, space, period, apostrophe, hyphen, the hybrid sign. */
export const _NAME_QUERY = /^[\p{L}\p{M}\s.'\-×]{2,80}$/u;

const bad = (why: string) => json({ error: why }, { status: 502, headers: { 'cache-control': 'no-store' } });

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 3) return json([], { headers: { 'cache-control': 'public, max-age=86400' } });
  if (!_NAME_QUERY.test(q)) return json({ error: 'a name is letters, spaces, periods, apostrophes, hyphens and ×' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const upstream = `https://api.gbif.org/v1/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=12&q=${encodeURIComponent(q)}`;
  // Folded to lower case: GBIF suggest is itself case-insensitive, so one spelling's answer serves the others. If that ever changes, this key must carry the case.
  const cacheKey = new Request(`https://cache.cultifolio/names?q=${encodeURIComponent(q.toLowerCase())}`);
  const cache = platform?.caches?.default;
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;
  const stop = await limited(platform, getClientAddress, 'names');
  if (stop) return stop;
  let res: Response;
  try {
    res = await fetch(upstream, { headers: { accept: 'application/json', 'user-agent': 'Cultifolio/3.0 (https://cultifolio.com)' } });
  } catch {
    return bad('backbone unreachable');
  }
  if (!res.ok) return bad(`backbone ${res.status}`);
  let rows: unknown;
  try {
    rows = await res.json();
  } catch {
    return bad('backbone answered with something other than JSON');
  }
  if (!Array.isArray(rows)) return bad('backbone answered with something other than a list');
  const out = (rows as Row[]).map((r) => Object.fromEntries(FIELDS.filter((k) => r && typeof r === 'object' && r[k] != null).map((k) => [k, r[k]])));
  const reply = json(out, { headers: { 'cache-control': 'public, max-age=86400' } });
  if (cache) platform?.context?.waitUntil?.(cache.put(cacheKey, reply.clone()));
  return reply;
};
