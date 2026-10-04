import { json, error } from '@sveltejs/kit';
import { getDossier, getCorpusId } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * The dossier as JSON: the species page's source document, as /about/formats describes it. An answer the edge holds
 * never reaches here; a miss is counted, since a query string makes any request a miss (round fifty-eight). Public for
 * an hour only when asked under the current corpus id (`?c=`), as the other reference routes are: without it, a dossier
 * read during a refresh was kept at the edge under no id at all (round fifty-nine; the round forty-one review, 23).
 */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress, url }) => {
  const key = Number(params.key);
  if (!Number.isInteger(key)) error(400, 'key must be a GBIF taxon key');
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const [d, corpus] = await Promise.all([getDossier(platform, fetch, key), getCorpusId(platform, fetch)]);
  if (!d) error(404, 'no species page for that key');
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  return json(d, { headers: { 'cache-control': asked && asked === corpus ? 'public, max-age=3600' : 'no-store' } });
};
