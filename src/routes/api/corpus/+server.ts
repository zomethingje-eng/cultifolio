import { json } from '@sveltejs/kit';
import { getCorpusId } from '$lib/server/dossiers';
import type { RequestHandler } from './$types';

/**
 * GET /api/corpus — `{ id }`: the reference corpus now served, which the client puts on its reference requests
 * (`/api/entries`, `/api/sheets`, `/api/dossier/…` as `?c=`) so a corpus refresh turns every cache over without a deploy
 * (round twelve, 7). Never cached: the service worker leaves it alone and the browser is told not to keep it. Offline the
 * client uses the id it saw last, which is the URL its worker holds.
 */
export const GET: RequestHandler = async ({ platform, fetch }) => json({ id: await getCorpusId(platform, fetch) }, { headers: { 'cache-control': 'no-store' } });
