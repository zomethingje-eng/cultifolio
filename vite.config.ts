import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: process.env.QA_PROBES ? ['tests/qa/**/*.test.ts'] : ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // The first test in a file pays for the file's transform (35 s on a cold Windows run); vitest's 5 s default is
    // for a warm machine. A real hang still fails, at 20 s.
    testTimeout: 20000
  }
});
