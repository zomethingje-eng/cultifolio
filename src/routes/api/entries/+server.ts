import { json, error } from '@sveltejs/kit';
import { getIndex } from '$lib/server/dossiers';
import { bucketOf, BUCKET } from '$core/bucket';
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
  const idx = await getIndex(platform, fetch);
  return json(idx.filter((e) => want.has(bucketOf(e.slug))), { headers: { 'cache-control': 'public, max-age=86400' } });
};
