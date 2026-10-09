import { defineConfig } from '@playwright/test';
// Offline means offline for the service worker too: without this, a worker's own fetches ignore `context.setOffline` and
// a page that should say "reference not reached" quietly gets its data through the worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
// The port is one setting: the server is started on it and every spec reaches it through `baseURL`, so a second copy of
// the app can be tested beside the first (PW_PORT=4196) and no spec names 4173 (round sixty-one; docs/review-60/harness.md 18).
// A server started by hand for PW_REUSE=1 is started as the webServer below is: `node scripts/dev/fresh-state.mjs` first,
// or the last run's vaults and counts are carried into this one (round sixty-two; the harness review's 9; each vault-making spec
// now sends its own documentation address, tests/e2e/helpers/address.ts, so the per-address ceiling is no longer what that meets).
const PORT = Number(process.env.PW_PORT ?? 4173);
// One mark per run, set here before the workers start (they inherit it): tests/e2e/helpers/address.ts moves the
// documentation addresses that vault-making specs send by it, so a reused server sees new ones next run (round sixty-two second pass).
process.env.CULTIFOLIO_E2E_RUN ??= `${Date.now()}-${process.pid}`;
export default defineConfig({
  testDir: 'tests/e2e',
  // wrangler dev's workerd occasionally drops a connection mid-run (a "Broken pipe" in its log; the page sees net::ERR_ABORTED on a
  // navigation). One retry tells that apart from a real failure without hiding one: a test that fails twice is reported.
  retries: 1,
  // A test that passes only on its retry is a flake, and a flake can be a real intermittent fault (smoke 2781's scroll was
  // one): under CI_STRICT=1 it fails the run. The strict run is the one before a deploy (round sixty-two; the harness review's 4).
  failOnFlakyTests: !!process.env.CI_STRICT,
  webServer: { command: `npm run build && node scripts/dev/fresh-state.mjs && npx wrangler dev --port ${PORT}`, port: PORT, reuseExistingServer: !!process.env.PW_REUSE, timeout: 180000 }, // a server already up is reused only when asked (PW_REUSE=1): otherwise its state would not be reset (round twenty-two, 10)
  // en-GB: the tests read metric figures; an en-US browser would be served Fahrenheit and inches on its first visit (by design).
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'en-GB', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} }
});
