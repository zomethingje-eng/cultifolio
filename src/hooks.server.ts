import { redirect, type Handle } from '@sveltejs/kit';

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
  const res = await resolve(event);
  // A response taken from the edge cache (the names route returns its hit as it is) has immutable headers in Workers, and
  // setting one throws, which SvelteKit turned into a 500 on every repeated lookup (round seventeen, 1). A copy is mutable.
  const r = new Response(res.body, res);
  r.headers.set('referrer-policy', 'no-referrer');
  if (!r.headers.has('x-frame-options')) r.headers.set('x-frame-options', 'DENY');
  return r;
};
