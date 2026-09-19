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
    // Absolute asset URLs, so a section shell served by the service worker for /plants/<id> still finds /_app/.
    paths: { relative: false },
    alias: { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $db: 'src/lib/db', $climate: 'src/lib/climate' },
    // Absolute asset paths: the service worker serves the /plants shell for /plants/<acc> when that page is not cached,
    // and a shell with relative ./_app/ paths would then look for its scripts under /plants/_app/ and find nothing.
    paths: { relative: false }
  }
};
export default config;
