import { json, error } from '@sveltejs/kit';
import { corpusNow, entriesIn } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { isBucket, bucketWidth } from '$core/bucket';
import type { RequestHandler } from './$types';

/**
 * GET /api/entries?b=03,1a — the index entries whose slug hashes into those buckets (see $core/bucket), for the pages
 * that need a grower's own species and not the whole 3 MB catalogue. The device asks by bucket, never by name: the
 * server learns which buckets were asked for, not which species are grown. Up to four buckets a call (the client
 * asks in fours), each the build's file under the corpus id or hashed from the index here (round fifty-three, 2);
 * `?c=<corpus>` from the client makes a corpus refresh a new URL for every cache (round twelve, 7). The answer is
 * cacheable and kept by the service worker, so it also works in the greenhouse.
 */
export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  // An answer the edge holds never reaches here; a miss is counted (round fifty-eight).
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const buckets = (url.searchParams.get('b') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!buckets.length) error(400, 'b required: hex buckets, comma separated');
  // The count and the id they belong to come from one load, never two that could straddle the cache's minute (round seventeen, 10).
  const c = await corpusNow(platform, fetch);
  const { corpus, buckets: count } = c;
  // The count the device hashed by, when it says: a name of two hex digits is valid under thirty-two buckets and under
  // sixty-four, and a device on the old count took half a bucket's species for the reference lacking them (round fifty-four, 3;
  // both reviewers). A count that is not the one served is a 409, never an answer, and the device re-reads /api/corpus.
  // A request that names no count is refused (round fifty-seven): every build since round fifty-four names it.
  const n = url.searchParams.get('n');
  if (!n) error(400, 'n required: the bucket count the names were hashed by');
  if (Number(n) !== count) return json({ error: 'bucket count', buckets: count, id: corpus }, { status: 409, headers: { 'cache-control': 'no-store' } });
  if (buckets.length > 4 || buckets.some((b) => !isBucket(b, count))) error(400, `buckets are ${bucketWidth(count)} hex digits, 0 to ${(count - 1).toString(16)}, at most 4 per request`);
  // As the sheets route does (round thirteen, 4): an answer is cacheable only when asked for under the corpus now served.
  // An isolate still holding the old index answers a request under the new id with `no-store`, so no cache, the service
  // worker included, keeps the old entries under the new id until the next deploy (round sixteen, 12).
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const current = asked === corpus;
  const out: unknown[] = [];
  for (const b of [...new Set(buckets)]) out.push(...(await entriesIn(c, platform, fetch, b)));
  return json(out, { headers: { 'cache-control': current ? 'public, max-age=86400' : 'no-store' } });
};
