import { defineConfig, devices, type PlaywrightTestProject } from '@playwright/test';
import { CHROMIUM_ONLY, enginesNamed } from './tests/e2e/helpers/engines';
// Offline means offline for the service worker too: without this, a worker's own fetches ignore `context.setOffline` and
// a page that should say "reference not reached" quietly gets its data through the worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
// The port is one setting: the server is started on it and every spec reaches it through `baseURL`, so a second copy of
// the app can be tested beside the first (PW_PORT=4196) and no spec names 4173 (round sixty-one; docs/review-60/harness.md 18).
// A server started by hand for PW_REUSE=1 is started as the webServer below is (`--var E2E_OFFLINE:1` too): `node scripts/dev/fresh-state.mjs` first,
// or the last run's vaults and counts are carried into this one (round sixty-two; the harness review's 9; each vault-making spec
// now sends its own documentation address, tests/e2e/helpers/address.ts, so the per-address ceiling is no longer what that meets).
const PORT = Number(process.env.PW_PORT ?? 4173);
// One mark per run, set here before the workers start (they inherit it): tests/e2e/helpers/address.ts moves the
// documentation addresses that vault-making specs send by it, so a reused server sees new ones next run (round sixty-two second pass).
process.env.CULTIFOLIO_E2E_RUN ??= `${Date.now()}-${process.pid}`;
// WebKit and Firefox run only when named (round sixty-three; the harness brief H2): PW_BROWSERS=webkit,firefox, or `--project
// webkit` on the command line, which is written into PW_BROWSERS here so the workers, which read this file again without
// the command line, build the same projects. Naming webkit builds the phone tests in Safari's engine too (phone-webkit),
// and PW_BROWSERS (predeploy's `--browsers=`) runs them; but `--project` is also Playwright's filter, which runs only the
// projects it names, so `--project webkit` alone runs WebKit's desktop project and nothing else (scripts/predeploy.mjs adds
// `--project=phone-webkit` to it and says what it runs; the server review of round sixty-three, R3 4).
const engines = enginesNamed(process.env.PW_BROWSERS, process.argv);
if (engines.size) process.env.PW_BROWSERS = [...engines].join(',');
// PW_CHROMIUM names a Chromium binary: it goes to the Chromium projects only, never to WebKit or Firefox.
const chromiumLaunch = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const iPhone = devices['iPhone 13'];
// `@phone` runs a test on the phone projects as well as the desktop ones; `@phone-only` on the phone projects alone (a test
// of the phone's own layout). /@phone\b/ matches both tags.
const PHONE = /@phone\b/;
const PHONE_ONLY = /@phone-only\b/;
const projects: PlaywrightTestProject[] = [
  { name: 'chromium', grepInvert: PHONE_ONLY, use: { browserName: 'chromium', launchOptions: chromiumLaunch } },
  // The owner's iPhone in Safari, as near as Chromium comes: Safari's page (390 x 664, not the 390 x 844 screen that round
  // sixty-two's first-screen test passed at while the phone failed), touch, the mobile viewport rules and Safari's user agent.
  { name: 'phone', grep: PHONE, use: { browserName: 'chromium', viewport: iPhone.viewport, deviceScaleFactor: iPhone.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: iPhone.userAgent, launchOptions: chromiumLaunch } }
];
if (engines.has('webkit')) projects.push({ name: 'webkit', grepInvert: [PHONE_ONLY, CHROMIUM_ONLY], use: { browserName: 'webkit' } });
if (engines.has('phone-webkit')) projects.push({ name: 'phone-webkit', grep: PHONE, grepInvert: CHROMIUM_ONLY, use: { ...iPhone } });
if (engines.has('firefox')) projects.push({ name: 'firefox', grepInvert: [PHONE_ONLY, CHROMIUM_ONLY], use: { browserName: 'firefox' } });
export default defineConfig({
  testDir: 'tests/e2e',
  // wrangler dev's workerd occasionally drops a connection mid-run (a "Broken pipe" in its log; the page sees net::ERR_ABORTED on a
  // navigation). One retry tells that apart from a real failure without hiding one: a test that fails twice is reported.
  retries: 1,
  // A test that passes only on its retry is a flake, and a flake can be a real intermittent fault (smoke 2781's scroll was
  // one): under CI_STRICT=1 it fails the run. The strict run is the one before a deploy (round sixty-two; the harness review's 4).
  failOnFlakyTests: !!process.env.CI_STRICT,
  // A server already up is reused only when asked (PW_REUSE=1): otherwise its state would not be reset (round twenty-two, 10).
  // Ready means answered, not listening: wrangler dev opens its port before its Worker can answer and holds the first
  // requests until it can. With `port` the run began at the open port, and the first page of a spec with no warm-up of its
  // own paid the server's start inside its 30 s (r61a a11y-perf 2, flaky on the PC, where that start is slow). With `url`
  // Playwright waits for the front page's answer, up to `timeout`, before any worker starts (round sixty-three; harness H3).
  // The budget covers the build too, since the server's command builds first: on the owner's PC the build alone went from
  // under a minute to over two (clearing the old output took 42 to 54 s), and 180 s ran out before the server answered
  // (round sixty-four, the PC's runs). Ten minutes is a budget for a slow disk, not a wait: the run starts the moment the
  // front page answers.
  webServer: { command: `npm run build && node scripts/dev/fresh-state.mjs && npx wrangler dev --port ${PORT} --var E2E_OFFLINE:1`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !!process.env.PW_REUSE, timeout: 600000 },
  // en-GB: the tests read metric figures; an en-US browser would be served Fahrenheit and inches on its first visit (by design).
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: 'en-GB' },
  projects
});
