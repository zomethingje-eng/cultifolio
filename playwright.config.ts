import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  // wrangler dev's workerd occasionally drops a connection mid-run (a "Broken pipe" in its log; the page sees net::ERR_ABORTED on a
  // navigation). One retry tells that apart from a real failure without hiding one: a test that fails twice is reported.
  retries: 1,
  webServer: { command: 'npm run build && npx wrangler dev --port 4173', port: 4173, reuseExistingServer: true, timeout: 180000 },
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} }
});
