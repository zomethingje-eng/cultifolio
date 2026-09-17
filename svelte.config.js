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
    alias: { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $db: 'src/lib/db', $climate: 'src/lib/climate' }
  }
};
export default config;
