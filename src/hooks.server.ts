import { redirect, type Handle } from '@sveltejs/kit';
import { unitsFor } from '$lib/server/units';

/**
 * A species page is public content rendered in the reader's units and hemisphere, which is why its own header is
 * `private`: no shared cache may hand one reader's page to another. The Worker's own cache can, keyed by the page and
 * both choices, so a page already rendered in this location in the last minute is answered from it instead of being
 * rendered again (the bucket reads, the index, the two maps). The minute is the same the browser is already allowed
 * to keep the page for, so a deploy is no staler than before (round forty-three, 3).
 */
const PAGE_CACHE_S = 60;
const isSpeciesPage = (url: URL) => /^\/species\/[^/]+$/.test(url.pathname);

/** The two sections renamed before the launch: a bookmark or an installed app's cached shell still says the old path. */
const MOVED: Array<[RegExp, string]> = [
  [/^\/benches(?=\/|$)/, '/places'],
  [/^\/sowings(?=\/|$)/, '/propagation']
];

/**
 * Two headers on every response the Worker renders. No referrer: a browser would otherwise send the page's own URL
 * with every request it makes, and on a page about your own plants that URL carries the plant's number, the search
 * typed in `?q=`, or a label's record id, none of which is on the list of what leaves the device (round sixteen, 9).
 * The meta tag in app.html says the same for the document; the header covers responses that are not the document.
 * X-Frame-Options mirrors the CSP's `frame-ancestors 'none'` for the older readers that only know the header. The
 * prerendered pages are served as static files and get theirs from static/_headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  for (const [from, to] of MOVED) if (from.test(event.url.pathname)) redirect(301, event.url.pathname.replace(from, to) + event.url.search);
  const policy = (r: Response) => {
    r.headers.set('referrer-policy', 'no-referrer');
    if (!r.headers.has('x-frame-options')) r.headers.set('x-frame-options', 'DENY');
    return r;
  };
  const cache = isSpeciesPage(event.url) && event.request.method === 'GET' ? event.platform?.caches?.default : undefined;
  let key: Request | undefined;
  if (cache) {
    // The key carries everything the rendering reads from the request: the path and query, the units, the hemisphere cookie.
    key = new Request(`https://cache.cultifolio/page?p=${encodeURIComponent(event.url.pathname + event.url.search)}&u=${unitsFor(event.cookies, event.request)}&h=${event.cookies.get('cultifolio.hemi') ?? ''}`);
    const hit = await cache.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('cache-control', `private, max-age=${PAGE_CACHE_S}`);
      r.headers.set('x-cultifolio-page', 'held');
      return policy(r);
    }
  }
  const res = await resolve(event);
  // A response taken from the edge cache (the names route returns its hit as it is) has immutable headers in Workers, and
  // setting one throws, which SvelteKit turned into a 500 on every repeated lookup (round seventeen, 1). A copy is mutable.
  const r = policy(new Response(res.body, res));
  if (cache && key && r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('text/html') && !r.headers.has('set-cookie')) {
    // Stored under the Worker's own key with a public lifetime, which the cache needs to keep it; the reader's copy keeps its private header.
    const copy = new Response(r.clone().body, r);
    copy.headers.set('cache-control', `public, max-age=${PAGE_CACHE_S}`);
    copy.headers.delete('vary');
    r.headers.set('x-cultifolio-page', 'rendered');
    const put = cache.put(key, copy);
    if (event.platform?.context?.waitUntil) event.platform.context.waitUntil(put);
    else await put;
  }
  return r;
};
