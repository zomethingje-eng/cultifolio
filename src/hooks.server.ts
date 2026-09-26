import type { Handle } from '@sveltejs/kit';

/**
 * Two headers on every response the Worker renders. No referrer: a browser would otherwise send the page's own URL
 * with every request it makes, and on a page about your own plants that URL carries the plant's number, the search
 * typed in `?q=`, or a label's record id, none of which is on the list of what leaves the device (round sixteen, 9).
 * The meta tag in app.html says the same for the document; the header covers responses that are not the document.
 * X-Frame-Options mirrors the CSP's `frame-ancestors 'none'` for the older readers that only know the header. The
 * prerendered pages are served as static files and get theirs from static/_headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const r = await resolve(event);
  r.headers.set('referrer-policy', 'no-referrer');
  if (!r.headers.has('x-frame-options')) r.headers.set('x-frame-options', 'DENY');
  return r;
};
