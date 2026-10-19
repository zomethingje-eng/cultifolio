import { json, error } from '@sveltejs/kit';
import { getDossier, corpusNow } from '$lib/server/dossiers';
import { lookupOf } from '$lib/server/lookup';
import { limited } from '$lib/server/sync';
import { isPageId, gbifKeyOf } from '$core/page-id';
import type { RequestHandler } from './$types';

/**
 * The dossier as JSON: the species page's source document, as /about/formats describes it. Every request reaches the
 * Worker (a Worker's own answer is not kept by the edge) and is counted, since a query string makes any request new
 * (round fifty-eight). `no-store` (round sixty; the second outside review, B11): the dossier is read from its fixed,
 * overwritten place in the bucket (`s/v3/<id>.json`), not from a product the manifest names by its hash, so nothing
 * proves it is of the corpus the id names, and one read mid-refresh was kept for an hour under the old id. It stays
 * `no-store` until dossiers are stored by their hash, as the other products are. The corpus is loaded before the dossier
 * is read, so a cold isolate's first answer is not a 404 (round sixty; the harness review, 10). A key the index holds
 * whose dossier cannot be read is a 503, not "no species page".
 */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress, url }) => {
  // A page's id (round seventy-eight; `$core/page-id`), or a GBIF backbone key, the alias of the page whose own key it is.
  const id = isPageId(params.key) ? params.key : null;
  const gbif = id ? null : gbifKeyOf(params.key);
  if (!id && gbif == null) error(400, 'key must be a page id (k<plant_name_id> or g<GBIF key>) or a GBIF taxon key');
  const stop = await limited(platform, getClientAddress, 'reference');
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const look = lookupOf(c, platform, fetch);
  // A GBIF key moves to its page's id: a temporary move, kept by no cache, since a page's id can change by the rule (a
  // `g` page whose Kew entry another page shared takes its `k` id once that page is merged away).
  if (gbif != null) {
    const page = await look.gbif(gbif);
    if (!page) error(404, 'no species page for that key');
    return new Response(null, { status: 302, headers: { location: `/api/dossier/${page.key}${url.search}`, 'cache-control': 'no-store' } });
  }
  // A key the index does not list has no page, whatever the bucket still holds under it (round seventy-two; E): the
  // upload copies and never deletes, so the dossier of a species since dropped from the corpus (a synonym followed, a
  // duplicate merged) was served here as a page for good, and every unknown key cost an R2 read.
  // Asked of the name files by key, or of the index's map for a corpus built before them (round seventy-six).
  const listed = !!(await look.species(id!));
  if (!listed) error(404, 'no species page for that key');
  const d = await getDossier(platform, fetch, id!, c).catch(() => undefined);
  if (!d) {
    if (d === undefined || listed) return json({ message: 'This species page could not be read just now' }, { status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' } });
    error(404, 'no species page for that key');
  }
  return json(d, { headers: { 'cache-control': 'no-store' } });
};
