import { json, error } from '@sveltejs/kit';
import { getIndexWithCorpus, entriesByBucket } from '$lib/server/dossiers';
import { BUCKET } from '$core/bucket';
import type { RequestHandler } from './$types';

/**
 * GET /api/entries?b=03,1a — the index entries whose slug hashes into those buckets (see $core/bucket), for the pages
 * that need a grower's own species and not the whole 3 MB catalogue. The device asks by bucket, never by name: the
 * server learns which of 32 buckets were asked for, not which species are grown. Up to four buckets a call (the client
 * asks in fours), answered from the index in memory; `?c=<corpus>` from the client makes a corpus refresh a new URL for
 * every cache (round twelve, 7). The answer is cacheable and kept by the service worker, so it also works in the greenhouse.
 */
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const buckets = (url.searchParams.get('b') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!buckets.length) error(400, 'b required: two-hex-digit buckets, comma separated');
  if (buckets.length > 4 || buckets.some((b) => !BUCKET.test(b))) error(400, 'buckets are two hex digits, 00 to 1f, at most 4 per request');
  const want = new Set(buckets);
  // The entries and the id they belong to come from one load, never two that could straddle the cache's minute (round seventeen, 10).
  const { idx, corpus } = await getIndexWithCorpus(platform, fetch);
  // As the sheets route does (round thirteen, 4): an answer is cacheable only when asked for under the corpus now served.
  // An isolate still holding the old index answers a request under the new id with `no-store`, so no cache, the service
  // worker included, keeps the old entries under the new id until the next deploy (round sixteen, 12).
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const current = asked === corpus;
  const byBucket = entriesByBucket(idx); // hashed once per index (round fifty-two, 5)
  return json([...want].flatMap((b) => byBucket.get(b) ?? []), { headers: { 'cache-control': current ? 'public, max-age=86400' : 'no-store' } });
};
