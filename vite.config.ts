import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: process.env.QA_PROBES ? ['tests/qa/**/*.test.ts'] : ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // The counter class imports `cloudflare:workers`, which exists only in the Workers runtime; in tests the base class is a stub, so the real class runs against a fake storage (round twenty-three, 8).
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url)) },
    // The first test in a file pays for the file's transform (35 s on a cold Windows run); vitest's 5 s default is
    // for a warm machine. A real hang still fails, at 20 s.
    testTimeout: 20000
  }
});
