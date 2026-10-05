import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import { unitsFor } from '$lib/server/units';
import { building, version } from '$app/environment';
import { corpusNow } from '$lib/server/dossiers';
import { catalogueRows, homeWindow, byOf, chipOf } from '$lib/server/catalogue';
import { limited } from '$lib/server/sync';

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
const HELD_PAGES: Array<{ test: (path: string) => boolean; query: (event: RequestEvent) => Promise<string | null>; hemi: boolean }> = [
  // A species page reached by an old name (`?was=`) is a page in its own right, since the line it prints names the
  // address; it is not held, since anyone can write that query into a link and each spelling minted a copy (round forty-nine, 2).
  // The test reads the path as routing reads it, decoded: `/%73pecies/x` is the species page and was rendered unheld (round sixty; A30).
  { test: (path) => /^\/species\/[^/]+$/.test(path), query: async (e) => (e.url.searchParams.has('was') ? null : ''), hemi: true },
  { test: (path) => path === '/', query: homeQuery, hemi: false }
];

/**
 * The home page's query as the page reads it, and nothing else: the grouping and the chip reduced to their known
 * values, `from` to one letter, `at` to a positive whole number, and `open` only when it names a row of that grouping,
 * so a link with an unknown `open` (or one spelt with capitals, or with a tracking tag) shares the plain page's copy
 * rather than minting one (round forty-nine, 2; round twenty-seven, 3). Reads nothing the page's own load does not.
 */
async function homeQuery(event: RequestEvent): Promise<string> {
  const p = event.url.searchParams;
  const parts: string[] = [];
  const by = byOf(p.get('by'));
  const chip = chipOf(p.get('chip'));
  if (p.has('by')) parts.push(`by=${by}`); // present at all, the page is the catalogue, not the grower's list
  if (chip !== 'all') parts.push(`chip=${chip}`);
  const from = (p.get('from') ?? '').toUpperCase();
  const at = Number(p.get('at'));
  const open = p.get('open') ?? '';
  const wantsRows = /^[A-Z]$/.test(from) || (Number.isInteger(at) && at > 0) || /^[a-z0-9-]{1,80}$/.test(open);
  if (wantsRows) {
    const { cat } = await catalogueRows(event.platform, event.fetch, by, chip, event.locals.corpus); // the build's file under a manifest, of the request's own corpus (round fifty-nine)
    const w = homeWindow(cat, p); // the page's own reading (round fifty-eight)
    if (w.fromValid && !w.atValid) parts.push(`from=${from}`);
    if (w.atValid) parts.push(`at=${at}`);
    if (w.open) parts.push(`open=${w.open}`);
    if (w.part) parts.push(`part=${w.part}`);
  }
  return parts.join('&');
}

/** A path as the page reads it: `/species/%63opiapoa-cinerea` is the page `/species/copiapoa-cinerea` renders, and minted its own copy (round fifty-eight). */
const pathKey = (p: string) => { try { return decodeURIComponent(p); } catch { return p; } };

/** The two sections renamed before the launch: a bookmark or an installed app's cached shell still says the old path. */
const MOVED: Array<[RegExp, string]> = [
  [/^\/benches(?=\/|$)/, '/places'],
  [/^\/sowings(?=\/|$)/, '/propagation']
];

/**
 * The private pages: a grower's own collection, rendered on the device from the vault. Their shells say nothing of
 * anyone's plants, but a search engine has no use for them either, so they are sent with `X-Robots-Tag: noindex`
 * (round sixty; the corpus review, P3). /offline is prerendered and gets it from _headers.
 */
const PRIVATE = /^\/(plants|places|today|propagation|labels|settings|sync|backup|offline)(\/|$)/;

/**
 * Headers on every response the Worker renders (round sixty; the server review, 14): the browser is told not to guess a
 * file's type, which features a page may ask for (location for the frost watch and a place, the camera for the sync
 * key's code, nothing else), and to come back only over HTTPS for a year. static/_headers says the same for the files
 * the Worker does not render.
 */
const SECURITY: Array<[string, string]> = [
  ['x-content-type-options', 'nosniff'],
  ['permissions-policy', 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=()'],
  ['strict-transport-security', 'max-age=31536000']
];

/**
 * Two headers on every response the Worker renders. No referrer: a browser would otherwise send the page's own URL
 * with every request it makes, and on a page about your own plants that URL carries the plant's number, the search
 * typed in `?q=`, or a label's record id, none of which is on the list of what leaves the device (round sixteen, 9).
 * The meta tag in app.html says the same for the document; the header covers responses that are not the document.
 * X-Frame-Options mirrors the CSP's `frame-ancestors 'none'` for the older readers that only know the header. The
 * prerendered pages are served as static files and get theirs from static/_headers.
 */
/**
 * A write to the sync routes from another site is refused, whatever its content type: Kit's own origin check covers
 * form bodies only, and a no-cors POST with a Blob body (no content type) passed it and created a vault (round
 * fifty-eight; the server review). The device's own requests are same-origin; a browser names another site in `Origin`
 * or `Sec-Fetch-Site`, and a client that sends neither (a script, curl) can make any request it likes anyway.
 */
export function _foreignWrite(request: Request, url: URL): boolean {
  // Every path, not the sync routes by name: the name was tested on the raw path while routing decodes it, so
  // `/api/%73ync/vault` passed the check (round fifty-nine; two reviews). The site has no write another site may make.
  const method = request?.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  // A browser that sends `Sec-Fetch-Site` is believed: same-origin (or a request the reader typed) passes whatever `Origin`
  // says, since under `no-referrer` a same-origin form post sends `Origin: null`, and it was refused (round sixty; the
  // server review, 13). `Origin` decides only when the header is absent.
  const site = request.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  const origin = request.headers.get('origin');
  return !!origin && origin !== url.origin;
}

export const handle: Handle = async ({ event, resolve }) => {
  for (const [from, to] of MOVED) if (from.test(event.url.pathname)) redirect(301, event.url.pathname.replace(from, to) + event.url.search);
  if (_foreignWrite(event.request, event.url)) return new Response('a write from another site', { status: 403, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...Object.fromEntries(SECURITY) } });
  const path = pathKey(event.url.pathname);
  const policy = (r: Response) => {
    r.headers.set('referrer-policy', 'no-referrer');
    if (!r.headers.has('x-frame-options')) r.headers.set('x-frame-options', 'DENY');
    for (const [k, v] of SECURITY) if (!r.headers.has(k)) r.headers.set(k, v);
    if (PRIVATE.test(path)) r.headers.set('x-robots-tag', 'noindex');
    return r;
  };
  const held = HELD_PAGES.find((h) => h.test(path));
  const method = event.request?.method ?? 'GET';
  // Not while prerendering: the build crawls the home page from the prerendered pages' links, the adapter's emulated
  // platform offers a cache there, and a prerendered page may not read its query.
  // Nor for a data request: a client-side navigation asks for `/__data.json` under the page's own URL (Kit strips the
  // suffix before the hooks see it, and says so in `isDataRequest`), and the held HTML answered it, which the client
  // could not parse and showed as a 500. Round forty-five's key had made the data request's query invisible, so it
  // matched the page's copy; before that it had missed by luck (round forty-six, 3).
  // HEAD is answered from the copy as GET is (round sixty; the server review, 6): it rendered every time, and costs its
  // sender nothing to send.
  const cache = held && !building && !event.isDataRequest && (method === 'GET' || method === 'HEAD') ? event.platform?.caches?.default : undefined;
  let key: Request | undefined;
  if (cache && held) {
    // The key carries everything the rendering reads from the request, and nothing else: the build (a page held across a
    // deploy named chunks that were gone, round forty-nine, 2), the path, the queries the page reads, the units, and
    // (where the page reads it) the hemisphere cookie as one of its two values. A query the page never reads (`?x=1`,
    // a tracking tag, a check's timestamp, the search typed into `?q=`) is the same page, so it shares the copy rather
    // than minting one.
    const hemi = held.hemi ? event.cookies.get('cultifolio.hemi') : undefined;
    // One load for the whole request: the key's corpus, the home query's rows and the page's own load all read it, where
    // each loaded on its own and a refresh between them stored one corpus's page under the other's id (round fifty-nine;
    // three reviews). A load that fails leaves the page to load for itself, unheld.
    event.locals.corpus = await corpusNow(event.platform, event.fetch).catch(() => undefined);
    const q = event.locals.corpus ? await held.query(event) : null;
    if (q !== null) {
      // And the corpus: a page held across an upload showed the old corpus for its minute (round fifty-two, 5).
      const corpus = event.locals.corpus!.corpus;
      key = new Request(`https://cache.cultifolio/page?v=${encodeURIComponent(version)}&c=${encodeURIComponent(corpus)}&p=${encodeURIComponent(path)}&q=${encodeURIComponent(q)}&u=${unitsFor(event.cookies, event.request)}&h=${hemi === 'n' || hemi === 's' ? hemi : ''}`);
      // A cache that fails to answer is a page rendered, not a 500 (round forty-nine, 2).
      const hit = await cache.match(key).catch(() => undefined);
      if (hit) {
        const r = new Response(method === 'HEAD' ? null : hit.body, hit);
        r.headers.set('cache-control', `private, max-age=${PAGE_CACHE_S}`);
        // The Vary the page set, which the stored copy dropped: a shared cache in front of the Worker must still keep the units and the hemisphere apart (round forty-nine, 2; round thirty-five, R1-6).
        r.headers.set('vary', 'accept-language, cookie');
        r.headers.set('x-cultifolio-page', 'held');
        return policy(r);
      }
    }
  }
  // A render of a held page that cannot be held (a `?was=` page, a client navigation's data, a HEAD the copy did not
  // answer) is counted per address under a generous bucket: each read the bucket and rendered, with no limit at all
  // (round sixty; the server review, 6). A GET that misses is held once rendered, so it is not counted.
  if (held && !building && (event.isDataRequest || method === 'HEAD' || !key)) {
    const stop = await limited(event.platform, event.getClientAddress ?? (() => 'unknown'), 'render').catch(() => null);
    if (stop) return policy(new Response(stop.body, stop));
  }
  const res = await resolve(event);
  // A response taken from the edge cache (the names route returns its hit as it is) has immutable headers in Workers, and
  // setting one throws, which SvelteKit turned into a 500 on every repeated lookup (round seventeen, 1). A copy is mutable.
  const r = policy(new Response(res.body, res));
  // The sync answers carry the server's clock: the device's clock correction reads it, and a dev server sends none, so
  // the correction could not be tested end to end before (round fifty-two, 1). The edge sets it anyway; this is the same clock.
  if (event.url.pathname.startsWith('/api/sync/') && !r.headers.has('date')) r.headers.set('date', new Date().toUTCString());
  // A failure is never kept: a page whose reference could not be read is a 503 that the next visit asks again (round sixty).
  if (r.status >= 500) r.headers.set('cache-control', 'no-store');
  if (cache && key && method === 'GET' && r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('text/html') && !r.headers.has('set-cookie')) {
    // Stored under the Worker's own key with a public lifetime, which the cache needs to keep it; the reader's copy keeps its private header.
    const copy = new Response(r.clone().body, r);
    copy.headers.set('cache-control', `public, max-age=${PAGE_CACHE_S}`);
    copy.headers.delete('vary');
    r.headers.set('x-cultifolio-page', 'rendered');
    const put = cache.put(key, copy).catch(() => {});
    if (event.platform?.context?.waitUntil) event.platform.context.waitUntil(put);
    else await put;
  }
  return r;
};
