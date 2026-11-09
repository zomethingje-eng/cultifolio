import { json } from '@sveltejs/kit';
import { corpusNow } from '$lib/server/dossiers';
import { forBuild } from '$lib/server/build';
import { limited } from '$lib/server/sync';
import { browseOf, hasBrowse } from '$lib/browse/load.server';
import { suggest } from '$lib/browse/suggest';
import { _clean } from '../search/+server';
import type { RequestHandler } from './$types';

/**
 * GET /api/suggest?q=<text>&c=<corpus>&v=<build> (round eighty-seven, C3): the search box's browse rows (a genus, a
 * family, a country, a region, or a genus or family with a place), each a view of the browse engine with its count. The
 * text is cleaned as /api/search cleans it and answered from the browse table the Worker holds; the species rows are
 * /api/search's, which the box asks beside this. Counted under the search's allowance.
 *
 * Kept five minutes by the browser and the edge only under the corpus and the build it was asked under, as /api/search
 * keeps its answers (`forBuild`; round eighty-seven, the review of stage 1, M5): kept under its text alone, an answer
 * outlived an upload of the reference and a deploy, and named rows of a table no longer served. Asked under another
 * corpus, or none, it is answered and not kept.
 *
 * A corpus with no browse table (`hasBrowse`; B2) answers no rows, and says so (`unbuilt`): the box lists the species
 * rows as before, where a 503 here had left its Browse group to a failure.
 */
export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = _clean([...(url.searchParams.get('q') ?? '')].slice(0, 200).join(''));
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  if (!/[\p{L}\p{N}]/u.test(q)) return json({ rows: [] }, { headers: { 'cache-control': forBuild(url, 'public, max-age=300') } });
  const stop = await limited(platform, getClientAddress, 'search');
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const headers = { 'cache-control': asked && asked === c.corpus ? forBuild(url, 'public, max-age=300') : 'no-store' };
  if (!hasBrowse(c)) return json({ rows: [], unbuilt: true }, { headers });
  const p = await browseOf(c, platform, fetch);
  return json({ rows: suggest(p, q) }, { headers });
};
