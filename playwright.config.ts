import { defineConfig } from '@playwright/test';
// Offline means offline for the service worker too: without this, a worker's own fetches ignore `context.setOffline` and
// a page that should say "reference not reached" quietly gets its data through the worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
// The port is one setting: the server is started on it and every spec reaches it through `baseURL`, so a second copy of
// the app can be tested beside the first (PW_PORT=4196) and no spec names 4173 (round sixty-one; docs/review-60/harness.md 18).
const PORT = Number(process.env.PW_PORT ?? 4173);
export default defineConfig({
  testDir: 'tests/e2e',
  // wrangler dev's workerd occasionally drops a connection mid-run (a "Broken pipe" in its log; the page sees net::ERR_ABORTED on a
  // navigation). One retry tells that apart from a real failure without hiding one: a test that fails twice is reported.
  retries: 1,
  webServer: { command: `npm run build && node scripts/dev/fresh-state.mjs && npx wrangler dev --port ${PORT}`, port: PORT, reuseExistingServer: !!process.env.PW_REUSE, timeout: 180000 }, // a server already up is reused only when asked (PW_REUSE=1): otherwise its state would not be reset (round twenty-two, 10)
  // en-GB: the tests read metric figures; an en-US browser would be served Fahrenheit and inches on its first visit (by design).
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'en-GB', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} }
});
