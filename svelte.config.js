import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      config: 'wrangler.jsonc',
      // The proxy reads a config without the Durable Object: a dev proxy cannot run one and warned on every build that the class was missing (round twenty-two, 2)
      platformProxy: { configPath: 'wrangler.dev.jsonc', persist: true }
    }),
    // No version poll (round sixty; the first outside review, A3): Kit asked for /_app/version.json every five minutes from
    // every open page, a request /about/how did not list. An open page learns of a new deploy from the service worker's
    // own update check instead (the layout asks it when a page loads), and HTML is served with a short cache and no
    // stale-while-revalidate, so a page never asks for a chunk the previous build had and the new one does not.
    version: { pollInterval: 0 },
    // Every stylesheet goes into the page's HTML, the layout's 34 kB (7.6 kB gzipped) included: a page then paints with no
    // request between its HTML and its first paint. Round forty-six first inlined only the small sheets and left the
    // layout's as a file, and from Google's own machines that one request was still the top line, 450 ms on slow 4G;
    // the bytes it adds to each page are less than the round trip it removes. Client-side navigations still fetch the
    // sheets as files (Kit names them as disabled links), so nothing is lost there. Styles allow inline already
    // (`style-src 'unsafe-inline'`), so Kit adds no hashes for them (round forty-six, 1; round forty-seven, 1).
    inlineStyleThreshold: 40 * 1024,
    // The corpus under static/s/ is served by the platform, never listed in the worker: 19,000 paths in the script would be 400 KB of nothing it uses.
    // The layout registers the worker itself (after load, and it watches the registration for a waiting build); Kit's
    // own inline registration on top of that made two registrations per load, and the second always installed a
    // spurious waiting worker, which the take-over then reloaded the page for, without end.
    // Nor any dot-file (`.assetsignore` is the platform's own list, not a file to serve): the worker asked for it at every
    // install and got a 404 (round sixty; the product review, 12).
    serviceWorker: { register: false, files: (f) => !f.startsWith('s/') && !f.split('/').some((p) => p.startsWith('.')) },
    // "No third-party scripts" as a header the browser enforces, not a sentence on the about page. Scripts only from
    // this origin (SvelteKit hashes its own inline one; app.html's theme line is hashed below); inline style attributes are used
    // throughout, so styles allow them; photographs come from the four hosts /about/how names and from nowhere else, which
    // the browser now enforces (round sixty; the server review, 14: `https:` let any host serve an image).
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        // The hash is app.html's one inline line (the theme and the dismissed welcome, before first paint); change that line and this hash together.
        // The second hash is Svelte's own `this.__e=event` on images and iframes, which lets a load or error that fires
        // before hydration be replayed after it; `unsafe-hashes` is what lets a hash cover an attribute handler.
        'script-src': ['self', 'sha256-zgjjgkoiqlrDxrMK8COqHzfFe9dedqOeH1MsNh4Kij4=', 'unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:', 'https://inaturalist-open-data.s3.amazonaws.com', 'https://static.inaturalist.org', 'https://upload.wikimedia.org', 'https://api.gbif.org'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'worker-src': ['self'],
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'form-action': ['self']
      }
    },
    alias: { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $db: 'src/lib/db', $climate: 'src/lib/climate' },
    // Absolute asset paths: the service worker serves the /plants shell for /plants/<acc> when that page is not cached,
    // and a shell with relative ./_app/ paths would then look for its scripts under /plants/_app/ and find nothing.
    paths: { relative: false }
  }
};
export default config;
