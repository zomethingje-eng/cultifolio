import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      config: 'wrangler.jsonc',
      platformProxy: { configPath: 'wrangler.jsonc', persist: true }
    }),
    // An open page learns of a new deploy and does a full reload on its next navigation, so it never asks for a chunk the
    // previous build had and the new one does not. HTML is served with a short cache and no stale-while-revalidate for the same reason.
    version: { pollInterval: 5 * 60_000 },
    // The corpus under static/s/ is served by the platform, never listed in the worker: 19,000 paths in the script would be 400 KB of nothing it uses.
    // The layout registers the worker itself (after load, and it watches the registration for a waiting build); Kit's
    // own inline registration on top of that made two registrations per load, and the second always installed a
    // spurious waiting worker, which the take-over then reloaded the page for, without end.
    serviceWorker: { register: false, files: (f) => !f.startsWith('s/') },
    // "No third-party scripts" as a header the browser enforces, not a sentence on the about page. Scripts only from
    // this origin (SvelteKit hashes its own inline one; app.html's theme line is hashed below); inline style attributes are used
    // throughout, so styles allow them; photographs come from iNaturalist, GBIF's cache and Wikimedia over https.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        // The hash is app.html's one inline line (the theme before first paint); change that line and this hash together.
        // The second hash is Svelte's own `this.__e=event` on images and iframes, which lets a load or error that fires
        // before hydration be replayed after it; `unsafe-hashes` is what lets a hash cover an attribute handler.
        'script-src': ['self', 'sha256-ZQQX2ILV9DPyiEPs7JZE3Oi94h8HRWjrR5AWwUjCafM=', 'unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:', 'https:'],
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
