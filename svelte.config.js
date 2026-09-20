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
    alias: { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $db: 'src/lib/db', $climate: 'src/lib/climate' },
    // Absolute asset paths: the service worker serves the /plants shell for /plants/<acc> when that page is not cached,
    // and a shell with relative ./_app/ paths would then look for its scripts under /plants/_app/ and find nothing.
    paths: { relative: false }
  }
};
export default config;
