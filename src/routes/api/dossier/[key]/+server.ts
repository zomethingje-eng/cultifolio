import { json, error } from '@sveltejs/kit';
import { getDossier } from '$lib/server/dossiers';
import type { RequestHandler } from './$types';

/** The dossier as JSON, for the client to hydrate species-linked views (labels, cards) without re-rendering the page. */
export const GET: RequestHandler = async ({ params, platform, fetch }) => {
  const key = Number(params.key);
  if (!Number.isInteger(key)) error(400, 'key must be a GBIF taxon key');
  const d = await getDossier(platform, fetch, key);
  if (!d) error(404, 'no dossier');
  return json(d, { headers: { 'cache-control': 'public, max-age=3600' } });
};
