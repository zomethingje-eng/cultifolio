import { redirect, type Handle } from '@sveltejs/kit';
import { unitsFor } from '$lib/server/units';
import { building } from '$app/environment';

/**
 * A species page is public content rendered in the reader's units and hemisphere, which is why its own header is
 * `private`: no shared cache may hand one reader's page to another. The Worker's own cache can, keyed by the page and
 * both choices, so a page already rendered in this location in the last minute is answered from it instead of being
 * rendered again (the bucket reads, the index, the two maps). The minute is the same the browser is already allowed
 * to keep the page for, so a deploy is no staler than before (round forty-three, 3).
 */
const PAGE_CACHE_S = 60;
/**
 * The pages held, and what each reads from its request: the query parameters it looks at, and whether the hemisphere
 * cookie shapes it. The home page joined the species pages in round forty-six: it is rendered from the whole index on
 * every request (grouping nine thousand species, the day's featured tiles) and was the one page a stranger always
 * lands on with nothing holding it.
 */
const HELD_PAGES: Array<{ test: (url: URL) => boolean; params: string[]; hemi: boolean }> = [
  { test: (url) => /^\/species\/[^/]+$/.test(url.pathname), params: ['was'], hemi: true },
  { test: (url) => url.pathname === '/', params: ['by', 'open', 'chip', 'from', 'at'], hemi: false }
];

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
  const held = HELD_PAGES.find((h) => h.test(event.url));
  // Not while prerendering: the build crawls the home page from the prerendered pages' links, the adapter's emulated
  // platform offers a cache there, and a prerendered page may not read its query.
  // Nor for a data request: a client-side navigation asks for `/__data.json` under the page's own URL (Kit strips the
  // suffix before the hooks see it, and says so in `isDataRequest`), and the held HTML answered it, which the client
  // could not parse and showed as a 500. Round forty-five's key had made the data request's query invisible, so it
  // matched the page's copy; before that it had missed by luck (round forty-six, 3).
  const cache = held && !building && !event.isDataRequest && event.request.method === 'GET' ? event.platform?.caches?.default : undefined;
  let key: Request | undefined;
  if (cache && held) {
    // The key carries everything the rendering reads from the request, and nothing else: the path, the queries the page
    // reads, the units, and (where the page reads it) the hemisphere cookie as one of its two values. A query the page
    // never reads (`?x=1`, a tracking tag, a check's timestamp, the search typed into `?q=`) is the same page, so it
    // shares the copy rather than minting one.
    const hemi = held.hemi ? event.cookies.get('cultifolio.hemi') : undefined;
    const q = held.params.filter((k) => event.url.searchParams.has(k)).map((k) => `${k}=${encodeURIComponent(event.url.searchParams.get(k) ?? '')}`).join('&');
    key = new Request(`https://cache.cultifolio/page?p=${encodeURIComponent(event.url.pathname)}&q=${encodeURIComponent(q)}&u=${unitsFor(event.cookies, event.request)}&h=${hemi === 'n' || hemi === 's' ? hemi : ''}`);
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
