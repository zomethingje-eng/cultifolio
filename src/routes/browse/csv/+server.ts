import { error } from '@sveltejs/kit';
import { corpusNow } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { lastmodOf } from '$lib/server/sitemap';
import { slugify } from '$core/names';
import { browseOf } from '$lib/browse/load.server';
import { parseQuery, allRows, titleOf } from '$lib/browse/engine';
import { browseCsv, sourcesCsv } from '$lib/browse/csv';
import type { RequestHandler } from './$types';

/**
 * /browse/csv?<a browse query> (round eighty-seven, C4): every result of the query as CSV, and with `?part=sources`
 * the second file, each column's meaning, source and day (rule 1).
 *
 * The file of sources, a few rows, is counted under `render`, as a browse page is. The results are counted under
 * `index`, as the whole index is (round eighty-seven, the review of stage 1, S5): unfiltered they are every species of
 * the reference, 8.3 MB in about a third of a second at 48,375, which `render`'s 1,200 per ten minutes let one address
 * ask for again and again. The index's allowance is six per ten minutes, its IPv4 /24 and IPv6 /48 counted too.
 */
export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const sources = url.searchParams.get('part') === 'sources';
  const stop = await limited(platform, getClientAddress, sources ? 'render' : 'index').catch(() => null);
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const built = lastmodOf(c.manifest?.built); // the build's UTC day, as the sitemap says it
  const headers = (name: string) => ({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'public, max-age=300' });
  if (sources) return new Response(sourcesCsv(built), { headers: headers('browse-columns') });
  const p = await browseOf(c, platform, fetch);
  const q = parseQuery(url.searchParams);
  if (!q) error(400, { message: 'Not a browse query' });
  const name = `browse-${slugify(titleOf(p, q)).slice(0, 80) || 'species'}`;
  return new Response(browseCsv(p, allRows(p, q), built), { headers: headers(name) });
};
