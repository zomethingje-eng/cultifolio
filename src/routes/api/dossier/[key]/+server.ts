import { json, error } from '@sveltejs/kit';
import { getDossier } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * The dossier as JSON: the species page's source document, as /about/formats describes it. An answer the edge holds
 * never reaches here; a miss is counted, since a query string makes any request a miss (round fifty-eight).
 */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress }) => {
  const key = Number(params.key);
  if (!Number.isInteger(key)) error(400, 'key must be a GBIF taxon key');
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const d = await getDossier(platform, fetch, key);
  if (!d) error(404, 'no dossier');
  return json(d, { headers: { 'cache-control': 'public, max-age=3600' } });
};
