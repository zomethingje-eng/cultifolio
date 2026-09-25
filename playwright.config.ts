import { defineConfig } from '@playwright/test';
// Offline means offline for the service worker too: without this, a worker's own fetches ignore `context.setOffline` and
// a page that should say "reference not reached" quietly gets its data through the worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
export default defineConfig({
  testDir: 'tests/e2e',
  // wrangler dev's workerd occasionally drops a connection mid-run (a "Broken pipe" in its log; the page sees net::ERR_ABORTED on a
  // navigation). One retry tells that apart from a real failure without hiding one: a test that fails twice is reported.
  retries: 1,
  webServer: { command: 'npm run build && npx wrangler dev --port 4173', port: 4173, reuseExistingServer: true, timeout: 180000 },
  // en-GB: the tests read metric figures; an en-US browser would be served Fahrenheit and inches on its first visit (by design).
  use: { baseURL: 'http://127.0.0.1:4173', locale: 'en-GB', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} }
});
