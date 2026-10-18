import { json } from '@sveltejs/kit';
import { corpusNow, fromFiles, getIndex } from '$lib/server/dossiers';
import { productPath } from '$dossier/manifest';
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
  const headers = { 'cache-control': 'public, max-age=300' };
  // Under the lookup files the index is the build's stored file, passed on as it is and never parsed here (round
  // seventy-six: the Worker no longer holds it for this).
  const c = await corpusNow(platform, fetch);
  if (fromFiles(c)) {
    const path = productPath(c.manifest!.files['index.json']);
    const obj = await platform?.env?.STORE?.get(path);
    if (obj) return new Response(obj.body, { headers: { ...headers, 'content-type': 'application/json' } });
    if (!c.fromStore) { const r = await fetch(`/${path}`).catch(() => null); if (r?.ok) return new Response(r.body, { headers: { ...headers, 'content-type': 'application/json' } }); }
    return json({ message: 'The reference could not be read just now' }, { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
  }
  return json(await getIndex(platform, fetch), { headers });
};
