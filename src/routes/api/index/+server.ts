import { json } from '@sveltejs/kit';
import { getIndex } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * The species index: which dossiers exist, for scripts and checks. No page reads it since round forty-seven (the catalogue
 * and the search come in windows), and at fifty thousand species it is fifteen megabytes, so it is rate-limited per address
 * (round fifty-one, 6). The limit counts what reaches the Worker: the adapter's cache answers a repeated URL for its five
 * minutes before this runs (round sixty-seven; triage-66 S-D5).
 */
export const GET: RequestHandler = async ({ platform, fetch, getClientAddress }) => {
  const stop = await limited(platform, getClientAddress, 'index');
  if (stop) return stop;
  return json(await getIndex(platform, fetch), { headers: { 'cache-control': 'public, max-age=300' } });
};
