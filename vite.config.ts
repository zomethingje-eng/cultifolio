import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
// What the service worker caches at install: the offline pages' build files only (round eighty; scripts/offline-files.mjs).
import { offlineFiles } from './scripts/offline-files.mjs';

/**
 * The corpus on disk at /s/ under `vite dev` (round eighty). The corpus is in static/s/, outside the app's own files
 * (static/app/, svelte.config.js's `files.assets`), so that no build copies it; `vite dev` then no longer served it, and
 * this does, for the browser and for the server's fallback (src/hooks.server.ts sends the server's own requests for
 * /s/ here under `vite dev`). Read-only, inside static/s/ only, and never part of a build: `apply: 'serve'`.
 */
export function corpusOnDisk(root = resolve('static/s')): Plugin {
  const types: Record<string, string> = { '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
  return {
    name: 'cultifolio-corpus-on-disk',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/s', (req, res, next) => {
        let path: string;
        try {
          path = decodeURIComponent((req.url ?? '/').split('?')[0]);
        } catch {
          return next();
        }
        const file = resolve(root, '.' + path);
        if (!file.startsWith(root + sep)) return next();
        let size: number;
        try {
          const st = statSync(file);
          if (!st.isFile()) return next();
          size = st.size;
        } catch {
          return next();
        }
        res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('content-length', String(size));
        res.setHeader('cache-control', 'no-store');
        if (req.method === 'HEAD') return void res.end();
        createReadStream(file).pipe(res);
      });
    }
  };
}

export default defineConfig({
  plugins: [corpusOnDisk(), sveltekit(), offlineFiles()],
  // Nor is the corpus watched: up to 145,812 files under static/s/ that no module imports (round eighty).
  server: { watch: { ignored: ['**/static/s/**'] } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // The counter class imports `cloudflare:workers`, which exists only in the Workers runtime; in tests the base class is a stub, so the real class runs against a fake storage (round twenty-three, 8).
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url)) },
    // The first test in a file pays for the file's transform (35 s on a cold Windows run); vitest's 5 s default is
    // for a warm machine. A real hang still fails, at 20 s.
    testTimeout: 20000
  }
});
