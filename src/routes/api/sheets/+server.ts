import { json, error } from '@sveltejs/kit';
import { sheetsIn } from '$lib/server/sheets';
import { getCorpusId } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { BUCKET } from '$core/bucket';
import type { RequestHandler } from './$types';

/**
 * GET /api/sheets?b=03 — the sheets (see $lib/server/sheets) of every species whose slug hashes into that bucket; up
 * to four buckets in one request. The plant page, the labels and a batch page take their species' figures from here,
 * asked for by bucket: the server learns which of 32 buckets a device asked for, never which species it grows.
 *
 * Each bucket is one edge-cache entry under its own canonical URL (`?b=03&c=<corpus>`), whatever the request's
 * order or grouping, put there with the Cache API (a Worker's response is not cached by the edge on its own: round
 * twelve, 8). `c` is the corpus id the layout hands the client, so a corpus refresh is a new URL and a new entry, in
 * the edge, in the service worker and in the browser (round twelve, 7). A rate bucket bounds what one address can
 * make the Worker derive when nothing is cached.
 */
const MAX_PER_REQUEST = 4;

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const buckets = [...new Set((url.searchParams.get('b') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))].sort();
  if (!buckets.length) error(400, 'b required: two-hex-digit buckets (00–1f), comma separated');
  if (buckets.length > MAX_PER_REQUEST || buckets.some((b) => !BUCKET.test(b))) error(400, `buckets are two hex digits, 00 to 1f, at most ${MAX_PER_REQUEST} per request`);
  // The corpus id the client asked under is checked against the corpus now served: an answer is put in the edge cache
  // only under the current id, so a bucket from the previous corpus can never be stored under the new one; a request
  // under another id (a device that has not asked /api/corpus since a refresh) is answered without caching (round thirteen, 4).
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const corpus = await getCorpusId(platform, fetch);
  const current = asked === corpus;
  const edge = platform?.caches?.default;
  const keyOf = (b: string) => new Request(`${url.origin}/api/sheets?b=${b}&c=${corpus}`);
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' };
  const out: unknown[][] = [];
  for (const b of buckets) {
    const hit = edge && current ? await edge.match(keyOf(b)).catch(() => undefined) : undefined;
    if (hit) {
      out.push((await hit.json()) as unknown[]);
      continue;
    }
    // Charged per bucket derived, not per request (round thirteen, 12).
    const stop = await limited(platform, getClientAddress, 'sheets');
    if (stop) return stop;
    const sheets = await sheetsIn(platform, fetch, b, corpus);
    out.push(sheets);
    if (edge && current) {
      const body = JSON.stringify(sheets);
      const put = edge.put(keyOf(b), new Response(body, { headers })).catch(() => {});
      platform?.context?.waitUntil?.(put);
    }
  }
  return json(out.flat(), { headers: { 'cache-control': current ? headers['cache-control'] : 'no-store' } });
};
