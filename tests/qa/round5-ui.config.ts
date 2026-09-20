// Round-5 UI probes against an already-running `vite dev --port 5199`:
//   npx playwright test --config tests/qa/round5-ui.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'round5-ui-*.spec.ts',
  retries: 0,
  workers: 2,
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
});
