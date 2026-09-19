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
/** Collection pages render on the device from the vault; their HTML is a shell that is the same for everyone. */
const SHELLS = ['/plants', '/plants/new', '/benches', '/sowings', '/sowings/new', '/labels', '/backup', '/sync', '/frost', '/offline'];
const PRECACHE = [...build, ...files.filter((f) => !f.startsWith('/s/')), ...SHELLS];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isShell = (path: string) => SHELLS.includes(path) || /^\/(plants|benches|sowings)\/[^/]+$/.test(path);
/** Only our own server's HTML goes in the cache: a captive portal's 200 must not become the app shell until the next build. */
const cacheableHtml = (r: Response) => r.ok && r.type === 'basic' && (r.headers.get('content-type') ?? '').startsWith('text/html');

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // Sync, photos and the index are live data: never from the cache.
  if (url.pathname.startsWith('/api/sync') || url.pathname.startsWith('/api/index')) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Build assets and the app shell: cache first, they are immutable per build.
      if (build.includes(url.pathname) || files.includes(url.pathname)) {
        return (await cache.match(request)) ?? fetch(request);
      }
      if (request.mode === 'navigate' && isShell(url.pathname)) {
        // A plant's own page is the /plants shell plus the vault: serve the shell of the section when the exact page is not cached.
        const exact = await cache.match(request);
        if (exact) return exact;
        try {
          const r = await fetch(request);
          if (cacheableHtml(r)) cache.put(request, r.clone());
          return r;
        } catch {
          // The section's shell renders the same page from the vault; asset URLs are absolute (paths.relative is off), so it works from a nested path.
          const section = '/' + url.pathname.split('/')[1];
          return (await cache.match(section)) ?? (await cache.match('/offline')) ?? Response.error();
        }
      }
      // Species pages, dossiers, the climate API: network first, cache fallback, so what you have read stays readable.
      if (url.pathname.startsWith('/species/') || url.pathname.startsWith('/api/dossier/') || url.pathname.startsWith('/s/') || url.pathname.startsWith('/about/') || url.pathname === '/') {
        try {
          const r = await fetch(request);
          if (request.mode === 'navigate' ? cacheableHtml(r) : r.ok && r.type === 'basic') cache.put(request, r.clone());
          return r;
        } catch {
          return (await cache.match(request)) ?? (request.mode === 'navigate' ? ((await cache.match('/offline')) ?? Response.error()) : Response.error());
        }
      }
      return fetch(request);
    })()
  );
});
