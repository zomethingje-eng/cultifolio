/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * The app shell, offline. Your collection lives in IndexedDB and needs no
 * network; what a fresh navigation in a greenhouse with no signal needs is
 * the HTML and scripts to read it with. So: the build's assets and the
 * collection pages are cached at install, and served cache-first (they are
 * immutable per build). Species pages and dossiers are network-first with a
 * cache fallback, so a page you have opened stays readable when the signal
 * goes; one you have never opened does not, and the page says so rather
 * than spinning. Sync and photo APIs are never cached.
 */
import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `cultifolio-${version}`;
/**
 * The reference's answers (a dossier, an entries bucket, a sheet bucket) are keyed by corpus (`?c=`), not by build: they
 * live in a cache of their own that a deploy leaves alone, so a device does not download its species again after every
 * deploy; a corpus refresh drops the old corpus's answers when the first new one is kept (round fifty-one, 6).
 */
const CORPUS_CACHE = 'cultifolio-corpus';
/** Which corpus ids this worker has pruned the corpus cache down to: the first answer under an id drops every entry under another, once per worker life, so a restarted worker prunes too (round fifty-two, 5). */
const prunedTo = new Set<string>();
/** Collection pages render on the device from the vault; their HTML is a shell that is the same for everyone. */
const SHELLS = ['/plants', '/plants/new', '/places', '/propagation', '/propagation/new', '/labels', '/backup', '/sync', '/today', '/settings', '/offline'];
const BUILD = new Set(build);
const FILES = new Set(files);
/**
 * Cached at install: the scripts and styles, the shells, the front page (the start URL), and only the Latin subsets of
 * the three fonts, which is every glyph the pages set in them. The Latin-extended and Vietnamese subsets (84 kB) are
 * fetched by the browser only when a name needs them, and the fetch handler caches them then (improvements, 9). The
 * corpus is kept out of `files` by svelte.config.js.
 */
const isLazyFont = (p: string) => /\.woff2$/.test(p) && !/-latin-(?!ext)/.test(p);
const PRECACHE = [...build.filter((p) => !isLazyFont(p)), ...files, ...SHELLS, '/'];

self.addEventListener('install', (e) => {
  // Each file on its own: one shell that answers with a redirect or a 500 must not fail the whole install and leave the
  // app with no offline shell at all. What could not be cached is logged; the next install tries again.
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      const failed: string[] = [];
      await Promise.all(PRECACHE.map((p) => c.add(p).catch(() => failed.push(p))));
      if (failed.length) console.warn(`service worker: ${failed.length} of ${PRECACHE.length} files not cached at install`, failed.slice(0, 5));
    })
  );
  // No skipWaiting by itself: the new worker waits until every page of the old build is gone. An open page that learns
  // of the deploy from the version poll sends 'skip' (below) and reloads under this worker; the old build's cache is
  // kept for one generation so a tab that has not reloaded yet still finds the chunks it lazily imports.
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // claim() is safe without skipWaiting: on a first install it lets the very first visit work offline, and on an
  // update the worker only reaches this point once every page of the old build has gone.
  e.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // This build's cache and the newest one before it stay; everything older goes.
        const ours = keys.filter((k) => k.startsWith('cultifolio-') && k !== CACHE && k !== CORPUS_CACHE).sort();
        const keep = new Set([CACHE, CORPUS_CACHE, ...ours.slice(-1)]);
        return Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

const isShell = (path: string) => SHELLS.includes(path) || /^\/(plants|places|propagation)\/[^/]+$/.test(path);
/**
 * The two sections renamed in round nineteen. The server answers the old paths with a 301, but a private page's URL must not
 * reach the server at all (its record id is in it), and offline there is no server: the worker answers the redirect itself,
 * query kept, and the new path is then served as a shell like any other (round twenty, 1). The same map is in hooks.server.ts.
 */
const MOVED: Array<[RegExp, string]> = [
  [/^\/benches(?=\/|$)/, '/places'],
  [/^\/sowings(?=\/|$)/, '/propagation']
];
const moved = (path: string): string | null => {
  for (const [from, to] of MOVED) if (from.test(path)) return path.replace(from, to);
  return null;
};
/** Only our own server's HTML goes in the cache: a captive portal's 200 must not become the app shell until the next build. */
const cacheableHtml = (r: Response) => r.ok && r.type === 'basic' && (r.headers.get('content-type') ?? '').startsWith('text/html');
/** How long a page already in the cache waits on the network before the held copy answers. */
const NETWORK_BUDGET_MS = 4000;

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // Sync, photos and the index are live data: never from the cache. (The index is 3 MB; a plant's page asks for its
  // one dossier by key instead, which is cached below, so the greenhouse does not need the index at all.)
  if (url.pathname.startsWith('/api/sync') || url.pathname.startsWith('/api/index') || url.pathname === '/api/corpus') return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Build assets and the app shell: cache first, they are immutable per build.
      if (BUILD.has(url.pathname) || FILES.has(url.pathname)) {
        const hit = await cache.match(request);
        if (hit) return hit;
        // A build file not cached at install (a font subset fetched for one name): kept once it has been asked for.
        const r = await fetch(request);
        if (r.ok && r.type === 'basic') e.waitUntil(cache.put(request, r.clone()).catch(() => {}));
        return r;
      }
      if (request.mode === 'navigate') {
        // The path is normalised once, doubled slashes collapsed and a trailing one stripped, before anything is matched:
        // `/plants/r1/` and `/benches//x` are shells only in that form, and un-normalised they would go to the server
        // with the record id in them (round twenty-one, 13; round twenty-two, 7). A path that changed is a redirect.
        const clean = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
        const to = moved(clean) ?? (clean !== url.pathname ? clean : null);
        if (to) return Response.redirect(url.origin + to + url.search, 301);
      }
      if (request.mode === 'navigate' && isShell(url.pathname) && url.pathname !== '/settings') {
        // A plant's own page is the /plants shell plus the vault, and the shell is the same HTML for every plant: it is
        // served from the cache without asking the network, so a label's link opens in a greenhouse with one bar of signal
        // instead of waiting on a fetch that neither succeeds nor fails.
        // The shell is the same HTML whatever the query (`/labels?acc=…`, `/plants?show=…`), so the match ignores it: a
        // query-string navigation on a private page after a deploy must not go to the server, which would see the record
        // id in the URL, nor be cached once per URL (round sixteen, 10).
        const exact = await cache.match(request, { ignoreSearch: true });
        if (exact) return exact;
        const section = '/' + url.pathname.split('/')[1];
        if (section !== url.pathname) {
          const shell = await cache.match(section);
          if (shell) return shell;
        }
        try {
          const r = await fetch(request);
          if (cacheableHtml(r)) e.waitUntil(cache.put(url.origin + url.pathname, r.clone()).catch(() => {})); // under the path alone, never a query
          return r;
        } catch {
          // The section's shell renders the same page from the vault; asset URLs are absolute (paths.relative is off), so it works from a nested path.
          return (await cache.match(section)) ?? (await cache.match('/offline')) ?? Response.error();
        }
      }
      // Species pages, dossiers, the climate API: network first, cache fallback, so what you have read stays readable.
      // Settings too: its HTML is rendered in the reader's units, so a cached copy from before a switch would paint the old ones first.
      // The reference's files are asked for under the corpus id (`?c=`, from /api/corpus, which is never cached): a dossier, an
      // index bucket or a sheet bucket is asked for once per corpus and then served from here, so a device that has its species
      // asks the server nothing more about them, online or off, and a corpus refresh (an upload, no deploy) is a new URL (round twelve, 7).
      if (url.pathname.startsWith('/api/dossier/') || url.pathname.startsWith('/api/entries') || url.pathname.startsWith('/api/sheets')) {
        const corpusCache = await caches.open(CORPUS_CACHE);
        const hit = (await corpusCache.match(request)) ?? (await cache.match(request));
        if (hit) return hit;
        try {
          const r = await fetch(request);
          // A `no-store` answer is the server declining to vouch for it (a sheet or entries bucket asked for under a corpus id
          // that is not the current one): kept out of here too, or a device would hold it until the next deploy (round sixteen, 12).
          if (r.ok && r.type === 'basic' && !/no-store/.test(r.headers.get('cache-control') ?? '')) {
            const c = url.searchParams.get('c') ?? '';
            e.waitUntil((async () => {
              // The first answer under a corpus id in this worker's life drops the answers under any other: they are a different URL and would never be asked for again.
              if (c && !prunedTo.has(c)) { prunedTo.add(c); for (const k of await corpusCache.keys()) if (new URL(k.url).searchParams.get('c') !== c) await corpusCache.delete(k); }
              await corpusCache.put(request, r.clone());
            })().catch(() => {}));
          }
          return r;
        } catch {
          return Response.error();
        }
      }
      if (url.pathname.startsWith('/species/') || url.pathname.startsWith('/s/') || url.pathname.startsWith('/about/') || url.pathname === '/' || url.pathname === '/settings') {
        // These pages vary on the units cookie; offline, the copy cached under the other units is the page (it re-reads the units on hydration), so Vary is ignored.
        // A navigation is held under its path alone: `/?by=origin&chip=climate` and `/species/x?was=y` each minted a copy, and
        // the query is read again on hydration (round fifty-one, 6).
        const under = request.mode === 'navigate' ? url.origin + url.pathname : request;
        const kept = await cache.match(under, { ignoreVary: true, ignoreSearch: request.mode === 'navigate' });
        const good = (r: Response) => (request.mode === 'navigate' ? cacheableHtml(r) : r.ok && r.type === 'basic');
        // The cache write is a promise of its own, handed to `waitUntil`: a write started with `void` after the response
        // was returned could be cut off with the event, and the copy the next visit found was the old one (round thirty-eight, R2-2).
        const keep = (r: Response) => ({ r, written: good(r) ? cache.put(under, r.clone()).catch(() => {}) : Promise.resolve() });
        try {
          const live = fetch(request).then(keep);
          if (!kept) {
            const got = await live;
            e.waitUntil(got.written);
            return got.r;
          }
          // A page read before: the network gets a few seconds, and past that the copy already held answers, with the
          // fetch left to finish and refresh the copy for next time. A fetch on one bar of signal in a greenhouse neither
          // succeeds nor fails for a long time, and before this the page waited on it the whole way (round thirty-six, 2).
          // Only an answer worth keeping wins the race: a quick 502, or a captive portal's 200, is not better than the
          // page already held (round thirty-eight, R1-9).
          const got = await Promise.race([live, new Promise<null>((ok) => setTimeout(() => ok(null), NETWORK_BUDGET_MS))]);
          if (got && good(got.r)) {
            e.waitUntil(got.written);
            return got.r;
          }
          e.waitUntil(live.then((x) => x.written).catch(() => {}));
          return kept;
        } catch {
          return kept ?? (request.mode === 'navigate' ? ((await cache.match('/offline')) ?? Response.error()) : Response.error());
        }
      }
      return fetch(request);
    })()
  );
});
