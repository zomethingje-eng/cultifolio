/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * The app shell, offline. Your collection lives in IndexedDB and needs no
 * network; what a fresh navigation in a greenhouse with no signal needs is
 * the HTML and scripts to read it with. So: the build's assets and the
 * collection pages are cached at install, and served cache-first (they are
 * immutable per build). Species pages are network-first with a cache
 * fallback, so a page you have opened stays readable when the signal goes;
 * one you have never opened does not, and the page says so rather than
 * spinning. An update reads the species pages you had opened again, so they
 * stay readable after it (`carryOver`). The reference's entries and sheet
 * buckets are kept by corpus. Sync and photo APIs are never cached, and
 * neither is a dossier: `/api/dossier/` answers `no-store`, and no page asks
 * for one (a plant's page reads its species from the sheet buckets).
 */
import { build, files, version } from '$service-worker';
import { pruneOnActivate, sweepPrevious, capCache, isSpeciesEntry, carryList, saveCarry, carryOver, keepFiles, SPECIES_KEEP, CORPUS_KEEP } from '$core/sw-keep';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `cultifolio-${version}`;
/**
 * The reference's answers (an entries bucket, a sheet bucket) are keyed by corpus (`?c=`), not by build: they
 * live in a cache of their own that a deploy leaves alone, so a device does not download its species again after every
 * deploy; a corpus refresh drops the old corpus's answers when the first new one is kept (round fifty-one, 6).
 */
const CORPUS_CACHE = 'cultifolio-corpus';
/** Which corpus ids this worker has pruned the corpus cache down to: the first answer under an id drops every entry under another, once per worker life, so a restarted worker prunes too (round fifty-two, 5). */
const prunedTo = new Set<string>();
/** Collection pages render on the device from the vault; their HTML is a shell that is the same for everyone. */
const SHELLS = ['/plants', '/plants/new', '/places', '/propagation', '/propagation/new', '/labels', '/backup', '/sync', '/today', '/settings', '/offline'];
const BUILD = new Set(build);
/** No dot-file is precached or asked for: `.assetsignore` is the platform's list, served as a 404 (round sixty; the product review, 12). svelte.config.js leaves them out too. */
const dotFile = (p: string) => p.split('/').some((s) => s.startsWith('.'));
const FILES = new Set(files.filter((f) => !dotFile(f)));
/**
 * Cached at install: the scripts and styles, the shells, the front page (the start URL), and only the Latin subsets of
 * the three fonts, which is every glyph the pages set in them. The Latin-extended and Vietnamese subsets (84 kB) are
 * fetched by the browser only when a name needs them, and the fetch handler caches them then (improvements, 9). The
 * corpus is kept out of `files` by svelte.config.js.
 */
// And no `.woff`, in any subset: it is the fallback for browsers without WOFF2, which every browser the app supports has (round eighty).
const isLazyFont = (p: string) => /\.woff$/.test(p) || (/\.woff2$/.test(p) && !/-latin-(?!ext)/.test(p));
/**
 * Only what the pages that work offline need, not the whole build (round eighty; the phone review's 10, the desktop
 * review's 16: the install was about 170 requests a device, the share image among them). The build files are the ones
 * the collection's pages, the front page, the offline page, the layout and the error page load, on demand or not, as
 * the build works them out (scripts/offline-files.mjs, `__OFFLINE_BUILD__`); without that list (a dev server) the whole
 * build, as before. Of the static files only the tab's icon, the web manifest and the small icon: the share image is for
 * other sites' link previews, the large icons are read once at install to a home screen, and the maps are a species
 * page's and the Origin grouping's. Every file left out is still kept the first time a page asks for it (the fetch
 * handler below), so a species page read online has its scripts and its map offline after.
 */
declare const __OFFLINE_BUILD__: string[] | null;
const OFFLINE_BUILD = typeof __OFFLINE_BUILD__ !== 'undefined' && Array.isArray(__OFFLINE_BUILD__) ? new Set(__OFFLINE_BUILD__) : null;
/**
 * The species page's own build files (its scripts and styles, past those cached at install), fetched only when an update
 * carries species pages over (`carryOver`, round eighty-five; review-c C6): the offline page opens a carried page with
 * them. Null without the list (a dev server), when none are fetched ahead and the page's first use keeps them.
 */
declare const __SPECIES_BUILD__: string[] | null;
const SPECIES_BUILD: string[] = typeof __SPECIES_BUILD__ !== 'undefined' && Array.isArray(__SPECIES_BUILD__) ? __SPECIES_BUILD__ : [];
// And the two coastlines every species page's maps draw on (round eighty-six; review C's C4): a page carried over an
// update, or read online and not scrolled to its maps (which since round eighty-six are fetched only near the viewport),
// opened offline with two empty maps. 127 kB sent, once a build, after the first page has loaded (the layout registers the
// worker then), and from the browser's own cache when it holds them (`/maps/*` is kept a day). The region files are a
// page's own: kept with the page (`keep-maps` below, and `carryOver`).
const OFFLINE_FILES = new Set(['/favicon.svg', '/manifest.webmanifest', '/icon-192.png', '/maps/land110.svg', '/maps/land50.svg']);
const PRECACHE = [...build.filter((p) => !isLazyFont(p) && (!OFFLINE_BUILD || OFFLINE_BUILD.has(p))), ...[...FILES].filter((f) => OFFLINE_FILES.has(f)), ...SHELLS, '/'];

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
  // kept for one generation, and read by the fetch handler, so a tab that has not reloaded yet still finds the chunks it
  // lazily imports (round sixty-seven; triage-66 P2).
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
  // A page that loaded while this first worker was activating and was left out of its claim asks again (round seventy-four:
  // in WebKit a second page asked for in that moment stayed uncontrolled until its next navigation, in 4 of 6 runs of r64f 7).
  else if (e.data === 'claim') e.waitUntil(self.clients.claim());
  // Which build this worker serves, for a page deciding whether a takeover changes anything it shows (round sixty-four;
  // the Firefox run, where a second worker of the very build the page ran took over and the page reloaded under the grower).
  else if (e.data === 'version') e.ports[0]?.postMessage(version);
  // A species page, once loaded, hands over the files its maps draw from, to be kept for offline: since round eighty-six
  // (outside review B's 4) a map's files are fetched only when it nears the viewport, so a page read and not scrolled to
  // its maps would otherwise open offline without them. Only this build's map files are fetched (`keepFiles`).
  else if (e.data && typeof e.data === 'object' && (e.data as { type?: unknown }).type === 'keep-maps') {
    const files = (e.data as { files?: unknown }).files;
    if (Array.isArray(files)) e.waitUntil(caches.open(CACHE).then((c) => keepFiles(c, files, (u) => fetch(u), location.origin, (p) => FILES.has(p))).catch(() => { /* kept the next time the page is read */ }));
  }
});

self.addEventListener('activate', (e) => {
  // claim() is safe without skipWaiting: on a first install it lets the very first visit work offline, and on an
  // update the worker only reaches this point once every page of the old build has gone.
  // This build's cache stays, and the newest one before it only while a tab open now is open (a tab of the old build
  // may still ask for its chunks); everything older goes. The kept one goes later, once none of those tabs is open
  // (`sweepPrevious`, from the fetch handler), where before it stayed until the next deploy reached the device (round
  // eighty-two; the independent review's 8: a device held a build from three weeks before).
  e.waitUntil(
    // The species pages the builds before held are listed first, before any of them is deleted: they are read again
    // from the new server once the worker is in charge (round eighty-five; review-c C6).
    carryList(caches, CACHE, CORPUS_CACHE)
      .then((pages) => saveCarry(caches, CACHE, pages))
      .then(() => { carryMaybe = true; }, () => { /* no list kept: the pages read before the update need the network once, as before */ })
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((open) => pruneOnActivate(caches, CACHE, CORPUS_CACHE, open.map((c) => c.id)))
      .catch(() => { /* pruning is housekeeping: an old cache not deleted now is deleted at the next activation, and the worker still takes over */ })
      .then(() => { heldMaybe = true; })
      .then(() => self.clients.claim())
  );
});

/** Whether a build before this one may still be recorded as kept: true until a look finds none, and again after each activation. */
let heldMaybe = true;
let lastLook = 0;
/** At most every ten seconds, while one is recorded: the build before this one goes once no tab that held it is open. */
function lookAtPrevious(e: FetchEvent) {
  if (!heldMaybe) return;
  const now = Date.now();
  if (now - lastLook < 10_000) return;
  lastLook = now;
  // Housekeeping: whatever it meets, the request is still answered.
  try {
    e.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((open) => sweepPrevious(caches, CACHE, open.map((c) => c.id)))
        .then((left) => { heldMaybe = left; })
        .catch(() => { /* housekeeping: the previous build is looked at again within ten seconds of the next request */ })
    );
  } catch {
    /* a worker that cannot list its tabs keeps the previous build until the next activation */
  }
}

/** Whether a list of species pages may wait to be read again: true after an activation, false once a round finds none left. */
let carryMaybe = true;
let carrying: Promise<unknown> | null = null;
let lastCarry = 0;
/**
 * At most once a minute, one round at a time, in the background of a request: the species pages read before the update,
 * read again (`carryOver`). A round that does not reach the server stops, and the next tries again.
 */
function carryOnce(e: FetchEvent) {
  if (!carryMaybe || carrying) return;
  const now = Date.now();
  if (now - lastCarry < 60_000) return;
  lastCarry = now;
  carrying = carryOver(caches, CACHE, (u) => fetch(u), location.origin, SPECIES_BUILD, (p) => FILES.has(p))
    .then((r) => { if (!r.left) carryMaybe = false; }, (err) => console.warn('service worker: the species pages read before the update were not read again this time', err))
    .finally(() => { carrying = null; });
  try {
    e.waitUntil(carrying);
  } catch {
    /* the event has already answered: the round goes on while the worker is awake, and the next request carries on */
  }
}

/** Where the build's hashed files live: a path under it is a build file of some build. */
const IMMUTABLE = '/_app/immutable/';
/** A copy of a build file in any cache this worker keeps: this build's, the previous build's, never the corpus answers'. */
async function oldCopy(request: Request): Promise<Response | undefined> {
  for (const k of await caches.keys()) {
    if (!k.startsWith('cultifolio-') || k === CORPUS_CACHE) continue;
    const hit = await (await caches.open(k)).match(request);
    if (hit) return hit;
  }
  return undefined;
}
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
/**
 * A page's data kept from a move inside the app, for the same page asked for again with the network gone: the framework's
 * own `x-sveltekit-invalidated` says which of the page's parts it wants afresh, and a page opened offline from the offline
 * page (src/routes/offline) may ask with other bits than the move that kept it. Every other part of the query must match
 * (round eighty-one; the phone review's 3).
 */
const dataQuery = (u: URL) => { const q = new URLSearchParams(u.search); q.delete('x-sveltekit-invalidated'); q.sort(); return q.toString(); };
async function dataCopy(cache: Cache, url: URL): Promise<Response | undefined> {
  if (!url.pathname.endsWith('/__data.json')) return undefined;
  const want = dataQuery(url);
  for (const k of await cache.keys(url.origin + url.pathname, { ignoreSearch: true, ignoreVary: true })) {
    if (dataQuery(new URL(k.url)) === want) return (await cache.match(k, { ignoreVary: true })) ?? undefined;
  }
  return undefined;
}
/** Only our own server's HTML goes in the cache: a captive portal's 200 must not become the app shell until the next build. */
const cacheableHtml = (r: Response) => r.ok && r.type === 'basic' && (r.headers.get('content-type') ?? '').startsWith('text/html');
/** How long a page already in the cache waits on the network before the held copy answers. */
const NETWORK_BUDGET_MS = 4000;

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  lookAtPrevious(e);
  carryOnce(e);
  // Sync, photos and the index are live data: never from the cache. (The index is 3 MB; a plant's page reads its species
  // from the sheet buckets instead, kept by corpus below, so the greenhouse does not need the index at all.) A dossier is
  // never kept either: the route answers `no-store` (round sixty; B11), so it goes to the network like these.
  if (url.pathname.startsWith('/api/sync') || url.pathname.startsWith('/api/index') || url.pathname === '/api/corpus' || url.pathname.startsWith('/api/dossier/')) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Build assets and the app shell: cache first, they are immutable per build.
      if (BUILD.has(url.pathname) || FILES.has(url.pathname)) {
        const hit = await cache.match(request);
        if (hit) return hit;
        // A build file not cached at install (a font subset fetched for one name): kept once it has been asked for.
        const r = await fetch(request);
        if (r.ok && r.type === 'basic') e.waitUntil(cache.put(request, r.clone()).catch(() => { /* the file was answered; one not kept (storage full) is fetched again next time it is asked for */ }));
        return r;
      }
      // A file of another build (its names are hashed, so it is never this build's): a tab still running the previous
      // build after a takeover asks for its own chunks, a dynamic import (the spreadsheet, the example's seed, the share
      // card) among them. The previous build's cache is kept for exactly this and was never read: the request went to the
      // network, and failed offline or once the old files were gone (round sixty-seven; triage-66 P2, S-E7).
      if (url.pathname.startsWith(IMMUTABLE)) {
        const kept = await oldCopy(request);
        if (kept) return kept;
        return fetch(request);
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
      // Species pages and the about pages: network first, cache fallback, so what you have read stays readable.
      // Settings too: its HTML is rendered in the reader's units, so a cached copy from before a switch would paint the old ones first.
      // The reference's files are asked for under the corpus id (`?c=`, from /api/corpus, which is never cached): an index
      // bucket or a sheet bucket is asked for once per corpus and then served from here, so a device that has its species
      // asks the server nothing more about them, online or off, and a corpus refresh (an upload, no deploy) is a new URL (round twelve, 7).
      if (url.pathname.startsWith('/api/entries') || url.pathname.startsWith('/api/sheets')) {
        const corpusCache = await caches.open(CORPUS_CACHE);
        // Kept by corpus, not by build: the page names its build in the URL (`v=`, round sixty-seven; triage-66 S7) for
        // the adapter's cache at the edge, and a deploy must not leave the greenhouse without the buckets this device has.
        const kept = new URL(request.url);
        kept.searchParams.delete('v');
        const keyOf = new Request(kept.href);
        const hit = url.searchParams.get('c') ? ((await corpusCache.match(keyOf)) ?? (await cache.match(request))) : undefined;
        if (hit) return hit;
        try {
          const r = await fetch(request);
          // A `no-store` answer is the server declining to vouch for it (a sheet or entries bucket asked for under a corpus id
          // that is not the current one): kept out of here too, or a device would hold it until the next deploy (round sixteen, 12).
          // And only an answer asked for under a corpus id: one without (a bucket fetched by its bare address; a dossier too, before round eighty-five left dossiers to the network) was kept
          // under no id, never pruned, and served for good after a refresh (round fifty-eight).
          const c = url.searchParams.get('c') ?? '';
          if (c && r.ok && r.type === 'basic' && !/no-store/.test(r.headers.get('cache-control') ?? '')) {
            e.waitUntil((async () => {
              // The first answer under a corpus id in this worker's life drops the answers under any other: they are a different URL and would never be asked for again.
              if (c && !prunedTo.has(c)) { prunedTo.add(c); for (const k of await corpusCache.keys()) if (new URL(k.url).searchParams.get('c') !== c) await corpusCache.delete(k); }
              await corpusCache.put(keyOf, r.clone());
              await capCache(corpusCache, CORPUS_KEEP); // the oldest go past the cap (round eighty-two; the independent review's 8)
            })().catch(() => { /* the answer was given; a copy not kept, or a prune not finished, is done again by the next answer under this corpus */ }));
          }
          return r;
        } catch {
          return Response.error();
        }
      }
      if (url.pathname.startsWith('/species/') || url.pathname.startsWith('/s/') || url.pathname.startsWith('/about/') || url.pathname === '/' || url.pathname === '/settings') {
        // These pages vary on the units cookie; offline, the copy cached under the other units is the page (it re-reads the units on hydration), so Vary is ignored.
        // A navigation is held under its path alone: `/?by=origin&chip=climate` and `/species/x?was=y` each minted a copy
        // (round fifty-one, 6). Only a navigation without a query is kept, though: the page renders what its query asked
        // for and does not read it again, so a copy kept from `/?by=origin&open=cape&part=3` answered `/` and every other
        // query offline (round fifty-nine; the corpus review, 6). One with a query goes to the network, and falls back to
        // the plain page's copy only when the network fails.
        const navigate = request.mode === 'navigate';
        const queried = navigate && url.search !== '';
        const under = navigate ? url.origin + url.pathname : request;
        const kept = await cache.match(under, { ignoreVary: true, ignoreSearch: navigate });
        const good = (r: Response) => (queried ? false : navigate ? cacheableHtml(r) : r.ok && r.type === 'basic');
        // The cache write is a promise of its own, handed to `waitUntil`: a write started with `void` after the response
        // was returned could be cut off with the event, and the copy the next visit found was the old one (round thirty-eight, R2-2).
        // And the species pages held are capped, the oldest written first to go (round eighty-two; the independent review's 8).
        const species = isSpeciesEntry(url.href);
        const keep = (r: Response) => ({ r, written: good(r) ? cache.put(under, r.clone()).then(() => (species ? capCache(cache, SPECIES_KEEP, isSpeciesEntry) : 0)).catch(() => { /* the page was answered; a copy not kept (storage full) only means the last copy kept is the one offline */ }) : Promise.resolve() });
        try {
          const live = fetch(request).then(keep);
          if (!kept || queried) {
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
          e.waitUntil(live.then((x) => x.written).catch(() => { /* the held copy has answered; a refresh that fails leaves it as the copy for next time */ }));
          return kept;
        } catch {
          if (kept) return kept;
          if (request.mode === 'navigate') return (await cache.match('/offline')) ?? Response.error();
          return (await dataCopy(cache, url)) ?? Response.error();
        }
      }
      // Any other page (Compare, a redirect such as /privacy or /frost): the network, and offline the app's own page that
      // says so, never the browser's error page (round eighty; the phone review's 5).
      if (request.mode === 'navigate') {
        try {
          return await fetch(request);
        } catch {
          return (await cache.match('/offline')) ?? Response.error();
        }
      }
      return fetch(request);
    })()
  );
});
