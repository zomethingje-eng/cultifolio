import { corpusNow } from '$lib/server/dossiers';
import { today } from './today.server';
import { citeOf } from './reference';
import { limited } from '$lib/server/sync';
import type { PageServerLoad } from './$types';

/**
 * /about/data reads the reference the Worker serves when it is asked (round eighty-seven; plan D6): the manifest's id and
 * the day it was built, for the citation, and the GBIF downloads the day's species cites, so neither is a figure of the
 * day the page was written. Not prerendered for that reason. A corpus that cannot be read is said so on the page, not
 * answered as an error: the page's other sections hold.
 */
export const load: PageServerLoad = async ({ platform, fetch, setHeaders, getClientAddress }) => {
  // Short and private, as the front page's: the HTML names the build's hashed files, and a copy kept past a deploy would
  // name files that are gone.
  setHeaders({ 'cache-control': 'private, max-age=60' });
  const c = await corpusNow(platform, fetch).catch(() => null);
  // The day's species' record is a reference read, counted per address as /api/dossier's is; past the count the page
  // says the download could not be read just now, as it says when the record does not answer.
  const held = c ? await limited(platform, getClientAddress, 'reference').catch(() => null) : null;
  const t = c && !held ? await today(platform, fetch, c).catch(() => null) : null;
  return {
    cite: citeOf(c),
    species: c?.manifest?.species ?? null,
    downloads: t?.downloads ?? null,
    from: t ? { slug: t.slug, name: t.name } : null
  };
};
