import { json, error } from '@sveltejs/kit';
import { sheetsIn } from '$lib/server/sheets';
import { BUCKET } from '$core/bucket';
import type { RequestHandler } from './$types';

/**
 * GET /api/sheets?b=03,1a — the sheets (see $lib/server/sheets) of every species whose slug hashes into those buckets.
 * The plant page, the labels and a batch page take their species' figures from here, asked for by bucket: the server
 * learns which of 32 buckets a device asked for, never which species it grows. Cacheable at the edge for a day and kept
 * by the service worker for the build, so a device asks at most once per bucket per build.
 */
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const buckets = [...new Set((url.searchParams.get('b') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!buckets.length) error(400, 'b required: two-hex-digit buckets (00–1f), comma separated');
  if (buckets.length > 32 || buckets.some((b) => !BUCKET.test(b))) error(400, 'buckets are two hex digits, 00 to 1f');
  const all = await Promise.all(buckets.map((b) => sheetsIn(platform, fetch, b)));
  return json(all.flat(), { headers: { 'cache-control': 'public, max-age=86400' } });
};
