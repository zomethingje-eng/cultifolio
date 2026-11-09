import { browseView, corpusOf, countRender, canonicalSearch, toCanonical, BROWSE_HEADERS } from '$lib/browse/load.server';
import { unitsFor } from '$lib/server/units';
import type { PageServerLoad } from './$types';

/**
 * /browse (round eighty-seven, C1): the browse engine's own page, any query of it. Rendered on the server, its answer
 * in the page, so a phone is sent one page of results and the counts, never the table. Every render is counted under
 * the `render` bucket, as the pages no copy holds are: a query is the table read whole, a few tens of milliseconds.
 * Kept a minute by the reader's browser alone, as every page that names the build's hashed chunks is (round eighty-seven,
 * the review of stage 1, S4: it was kept by the edge too). An address not in its one spelling (a parameter the page does
 * not read, a value spelt another way) moves to it first (S5).
 */
export const load: PageServerLoad = async ({ cookies, request, url, platform, fetch, setHeaders, getClientAddress, locals }) => {
  toCanonical(url, canonicalSearch(url, 'browse'));
  await countRender(platform, getClientAddress);
  const c = await corpusOf(locals, platform, fetch);
  const { view } = await browseView(c, platform, fetch, url);
  setHeaders(BROWSE_HEADERS);
  return { view, units: unitsFor(cookies, request) };
};
