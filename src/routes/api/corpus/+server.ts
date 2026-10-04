import { json } from '@sveltejs/kit';
import { getCorpus } from '$lib/server/dossiers';
import type { RequestHandler } from './$types';

/**
 * GET /api/corpus — `{ id, buckets, manifest }`: the reference corpus now served, which the client puts on its reference requests
 * (`/api/entries`, `/api/sheets`, `/api/dossier/…` as `?c=`) so a corpus refresh turns every cache over without a deploy
 * (round twelve, 7), and the number of buckets its species are split into, which the client hashes by before it asks
 * for one (round fifty-three, 2). Never cached: the service worker leaves it alone and the browser is told not to keep
 * it. Offline the client uses the id and the count it saw last, which is the URL its worker holds. `manifest` says whether
 * the build's products are served (round fifty-eight: the live check holds the real site to it).
 */
export const GET: RequestHandler = async ({ platform, fetch }) => {
  const { id, buckets, products } = await getCorpus(platform, fetch);
  return json({ id, buckets, manifest: products }, { headers: { 'cache-control': 'no-store' } });
};
