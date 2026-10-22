// What the service worker caches at install (round eighty; the phone review's 10, the desktop review's 16): only the build
// files the pages that work offline need, not every file of the build. Before, the install fetched all 170 or so files
// (the species pages' and about pages' scripts, the share image, the maps), about 170 requests per device on a site whose
// plan counts requests. Now it fetches the scripts, styles and fonts of the collection's pages, the front page, the offline
// page, the layout and the error page, and everything those import, on demand or not (an export's spreadsheet writer, the
// example's seed). Every other build file is still kept the first time a page asks for it (the worker's fetch handler),
// so a species page read online has its scripts offline after.
//
// The list is worked out at build time from Vite's manifest of the client build, and handed to the service worker's own
// build through `define` (Kit builds the worker after the client, with the main build's `define`). Without it (a dev
// server, a unit test, a build where the hand-over did not happen) the worker caches the whole build, as before.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The route files whose pages work offline: the layout, the error page, the front page and the collection's sections. */
export const OFFLINE_ROUTE = /(^|\/)src\/routes\/(\+layout\.svelte|\+error\.svelte|\+page\.svelte|(plants|places|propagation|labels|backup|sync|today|settings|offline)\/)/;

/**
 * The build files (paths as the manifest names them, `_app/immutable/...`) that the offline pages need: Kit's two entries,
 * the nodes whose route file is an offline one, and everything each reaches through static and dynamic imports, with their
 * styles and assets. The app entry's own dynamic imports are every node of the site and are not followed from it.
 *
 * @param {Record<string, { file: string; imports?: string[]; dynamicImports?: string[]; css?: string[]; assets?: string[]; isEntry?: boolean }>} manifest
 * @param {(key: string) => string | null} routeOf the route file a node entry re-exports (its generated source), or null
 * @returns {string[]}
 */
export function offlineBuild(manifest, routeOf) {
  const out = new Set();
  const seen = new Set();
  const isApp = (key) => /client-optimized\/app\.js$/.test(key) || /(^|\/)generated\/client\/app\.js$/.test(key);
  const walk = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const e = manifest[key];
    if (!e) return;
    out.add(e.file);
    for (const f of e.css ?? []) out.add(f);
    for (const f of e.assets ?? []) out.add(f);
    for (const k of e.imports ?? []) walk(k);
    if (!isApp(key)) for (const k of e.dynamicImports ?? []) walk(k);
  };
  for (const [key, e] of Object.entries(manifest)) {
    if (e.isEntry && !/\/nodes\/\d+\.js$/.test(key)) walk(key);
    else if (/\/nodes\/\d+\.js$/.test(key)) {
      const route = routeOf(key);
      if (route && OFFLINE_ROUTE.test(route)) walk(key);
    }
  }
  return [...out].sort();
}

/** The route file a generated node re-exports, read from its source beside the build. */
export function routeFromNode(root, key) {
  const f = join(root, key);
  if (!existsSync(f)) return null;
  const m = /from\s+["']([^"']*src\/routes\/[^"']+)["']/.exec(readFileSync(f, 'utf8'));
  return m ? m[1].replace(/^(\.\.\/)+/, '') : null;
}

/** The Vite plugin: the client build works the list out; the service worker's build reads it as `__OFFLINE_BUILD__`. */
export function offlineFiles() {
  let client = false;
  let root = process.cwd();
  return {
    name: 'cultifolio-offline-files',
    apply: 'build',
    config: () => ({ define: { __OFFLINE_BUILD__: 'null' } }),
    configResolved(c) {
      root = c.root;
      client = !c.build.ssr;
      // The main (server) build's `define` is the object Kit hands to the worker's build once the client build is done.
      if (!client) globalThis.__cultifolioWorkerDefine = c.define;
    },
    closeBundle() {
      if (!client) return;
      const at = join(root, '.svelte-kit/output/client/.vite/manifest.json');
      const define = globalThis.__cultifolioWorkerDefine;
      if (!existsSync(at) || !define) {
        console.warn('offline-files: no client manifest or no server build to hand the list to; the service worker caches the whole build');
        return;
      }
      const list = offlineBuild(JSON.parse(readFileSync(at, 'utf8')), (key) => routeFromNode(root, key)).map((f) => `/${f}`);
      define.__OFFLINE_BUILD__ = JSON.stringify(list);
      console.log(`offline-files: the service worker caches ${list.length} build files at install`);
    }
  };
}
