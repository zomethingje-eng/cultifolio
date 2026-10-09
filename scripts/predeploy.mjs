// The strict browser run before a deploy, as one command: `node scripts/predeploy.mjs` (round sixty-two; the
// verification triage-self review N6). It runs the whole Playwright suite with CI_STRICT=1, so playwright.config.ts
// fails the run on a test that passed only on its retry (`failOnFlakyTests`), and passes `--fail-on-flaky-tests` as
// well, so a config that loses that line still cannot let a flake through. It exits with Playwright's status: zero only
// when every test passed first time. Before round sixty-two this run was a sentence in DEPLOY.md, and package.json is
// not changed this round, so the deploy procedure names this script.
//
// It starts its own server (the config's webServer builds, resets the local state with fresh-state.mjs and starts
// wrangler dev), so PW_REUSE is dropped: a server left running from earlier would carry a day's vaults and records
// into the strict run. Anything after the script's name goes to Playwright unchanged (a `--config`, a spec, `-g`),
// for checking the script itself; the deploy runs it bare.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error('predeploy: @playwright/test is not installed here; run `npm ci` first');
  process.exit(1);
}
const env = { ...process.env, CI_STRICT: '1' };
if (env.PW_REUSE) {
  console.log('predeploy: PW_REUSE is set; ignoring it, so the run starts its own server from a fresh state');
  delete env.PW_REUSE;
}
const args = [cli, 'test', '--fail-on-flaky-tests', ...process.argv.slice(2)];
console.log('predeploy: the browser suite, strict (a test that passes only on its retry fails the run)');
const run = spawnSync(process.execPath, args, { stdio: 'inherit', env });
if (run.error) {
  console.error(`predeploy: Playwright did not start: ${run.error.message}`);
  process.exit(1);
}
// A run stopped by a signal has no status: that is not a pass either.
const status = run.status ?? 1;
console.log(status === 0 ? 'predeploy: every test passed first time; the deploy may go ahead' : `predeploy: the strict run failed (exit ${status}); do not deploy`);
process.exit(status);
