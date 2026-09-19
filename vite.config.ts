import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: process.env.QA_PROBES ? ['tests/qa/**/*.test.ts'] : ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node'
  }
});
