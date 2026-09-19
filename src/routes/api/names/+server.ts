import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Name suggestions for the species picker, proxied from GBIF's backbone so
 * the browser never talks to a third-party host with what someone typed. The
 * answer is GBIF's own (the same JSON shape as species/suggest, trimmed to the
 * fields the picker reads), cached at the edge for a day: the backbone does
 * not change by the hour, and one query serves everyone who types it.
 */
const FIELDS = ['key', 'canonicalName', 'scientificName', 'family', 'rank', 'status'] as const;
type Row = { [K in (typeof FIELDS)[number]]?: unknown };

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 3) return json([], { headers: { 'cache-control': 'public, max-age=86400' } });
  const upstream = `https://api.gbif.org/v1/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=12&q=${encodeURIComponent(q)}`;
  const cacheKey = new Request(`https://cache.cultifolio/names?q=${encodeURIComponent(q.toLowerCase())}`);
  const cache = platform?.caches?.default;
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch(upstream, { headers: { accept: 'application/json', 'user-agent': 'Cultifolio/3.0 (https://cultifolio.com)' } });
  } catch {
    return json({ error: 'backbone unreachable' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  if (!res.ok) return json({ error: `backbone ${res.status}` }, { status: 502, headers: { 'cache-control': 'no-store' } });
  const rows = (await res.json()) as Row[];
  const out = rows.map((r) => Object.fromEntries(FIELDS.filter((k) => r[k] != null).map((k) => [k, r[k]])));
  const reply = json(out, { headers: { 'cache-control': 'public, max-age=86400' } });
  if (cache) platform?.context?.waitUntil?.(cache.put(cacheKey, reply.clone()));
  return reply;
};
