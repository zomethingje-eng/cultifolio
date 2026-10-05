import { json, error } from '@sveltejs/kit';
import { getDossier, corpusNow, indexMaps } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * The dossier as JSON: the species page's source document, as /about/formats describes it. Every request reaches the
 * Worker (a Worker's own answer is not kept by the edge) and is counted, since a query string makes any request new
 * (round fifty-eight). `no-store` (round sixty; the second outside review, B11): the dossier is read from its fixed,
 * overwritten place in the bucket (`s/v2/<key>.json`), not from a product the manifest names by its hash, so nothing
 * proves it is of the corpus the id names, and one read mid-refresh was kept for an hour under the old id. It stays
 * `no-store` until dossiers are stored by their hash, as the other products are. The corpus is loaded before the dossier
 * is read, so a cold isolate's first answer is not a 404 (round sixty; the harness review, 10). A key the index holds
 * whose dossier cannot be read is a 503, not "no species page".
 */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress }) => {
  const key = Number(params.key);
  if (!Number.isInteger(key)) error(400, 'key must be a GBIF taxon key');
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const d = await getDossier(platform, fetch, key, c).catch(() => undefined);
  if (!d) {
    const listed = indexMaps(c.idx).byKey.has(key);
    if (d === undefined || listed) return json({ message: 'This species page could not be read just now' }, { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
    error(404, 'no species page for that key');
  }
  return json(d, { headers: { 'cache-control': 'no-store' } });
};
