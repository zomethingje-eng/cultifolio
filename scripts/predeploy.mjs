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
//
// Other engines (round sixty-three; the harness brief H2): `--browsers=webkit,firefox` (or `all`) sets PW_BROWSERS for the
// run, which playwright.config.ts reads to add the WebKit, phone-WebKit and Firefox projects; a PW_BROWSERS already set is
// passed through as it is. `--project` is Playwright's filter: it runs the projects named and no others, so `--project
// webkit` runs no Chromium and no Chromium phone, which this script says rather than naming the strict run; and naming
// `webkit` brings `phone-webkit` with it here, as `--browsers=webkit` does, since the phone tests in Safari's engine are
// the reason to name it (the server review of round sixty-three, R3 4: DEPLOY said so and the filter dropped them). An
// engine named but not installed stops the script before the build, with the one line that installs it, rather than
// after it with Playwright's longer message.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

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
// Two workers unless told otherwise (PW_WORKERS, or a --workers argument): the suite shares one wrangler dev, and the first
// strict run on a sixteen-thread PC took Playwright's default of eight, where page loads timed out in nine tests that
// pass alone (round sixty-two, the first deploy).
// PowerShell passes `--browsers=webkit,firefox` as two arguments (`--browsers=webkit` and `firefox`): an engine's bare name
// straight after `--browsers=` is taken as part of it, never handed to Playwright as a spec filter.
const extra = [];
const browsersArg = [];
let inBrowsers = false;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--browsers=')) { browsersArg.push(a.slice('--browsers='.length)); inBrowsers = true; }
  else if (inBrowsers && /^(webkit|firefox|phone-webkit|all)$/i.test(a)) browsersArg.push(a);
  else { extra.push(a); inBrowsers = false; }
}
if (browsersArg.length) env.PW_BROWSERS = [env.PW_BROWSERS, ...browsersArg].filter(Boolean).join(',');
const INSTALL = 'npx playwright install webkit firefox';
const engines = namedEngines(env.PW_BROWSERS, extra);
const missing = engines.filter((e) => !installed(e));
if (missing.length) {
  console.error(`predeploy: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} named but not installed here. Install the engines once (a download of a few hundred MB), then run this again:`);
  console.error(`  ${INSTALL}`);
  process.exit(1);
}
const workers = extra.some((a) => a.startsWith('--workers') || a === '-j') ? [] : [`--workers=${process.env.PW_WORKERS || 2}`];
const filtered = projectsNamed(extra);
// Its own option at the end: Playwright gathers every `--project`, and a bare word after one would be read as a project.
const phoneToo = filtered.includes('webkit') && !filtered.includes('phone-webkit') ? ['--project=phone-webkit'] : [];
if (phoneToo.length) filtered.push('phone-webkit');
const args = [cli, 'test', '--fail-on-flaky-tests', ...workers, ...extra, ...phoneToo];
console.log('predeploy: the browser suite, strict (a test that passes only on its retry fails the run)');
if (filtered.length) console.log(`predeploy: only the projects named: ${filtered.join(', ')}${filtered.includes('chromium') && filtered.includes('phone') ? '' : '. This is not the whole run before a deploy; for that, name engines with --browsers= instead'}`);
else console.log(engines.length ? `predeploy: Chromium, the Chromium phone, and ${engines.join(', ')}` : `predeploy: Chromium and the Chromium phone; for Safari's engine and Firefox as well, install them once (${INSTALL}) and run node scripts/predeploy.mjs --browsers=webkit,firefox`);
const run = spawnSync(process.execPath, args, { stdio: 'inherit', env });
if (run.error) {
  console.error(`predeploy: Playwright did not start: ${run.error.message}`);
  process.exit(1);
}
// A run stopped by a signal has no status: that is not a pass either.
const status = run.status ?? 1;
console.log(status === 0 ? 'predeploy: every test passed first time; the deploy may go ahead' : `predeploy: the strict run failed (exit ${status}); do not deploy`);
process.exit(status);

/** The engines beyond Chromium a run names, as playwright.config.ts reads them (tests/e2e/helpers/engines.ts `enginesNamed`;
 *  that file is TypeScript, which this script cannot import on every Node the owner may have): PW_BROWSERS and `--project`. */
function namedEngines(setting, argv) {
  const words = (setting ?? '').split(/[\s,]+/).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--project=')) words.push(...argv[i].slice('--project='.length).split(','));
    else if (argv[i] === '--project') for (let j = i + 1; j < argv.length && !argv[j].startsWith('-'); j++) words.push(...argv[j].split(','));
  }
  const out = new Set();
  for (const w of words.map((x) => x.trim().toLowerCase())) {
    if (w === 'all') { out.add('webkit'); out.add('firefox'); }
    else if (w === 'webkit' || w === 'phone-webkit') out.add('webkit');
    else if (w === 'firefox') out.add('firefox');
  }
  return [...out];
}

/** The projects a `--project` filter names (`--project webkit`, `--project=webkit,firefox`, `--project webkit firefox`),
 *  as Playwright reads them; a word that is no project of playwright.config.ts (a spec after the names) is left out. */
function projectsNamed(argv) {
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--project=')) words.push(...argv[i].slice('--project='.length).split(','));
    else if (argv[i] === '--project') for (let j = i + 1; j < argv.length && !argv[j].startsWith('-'); j++) words.push(...argv[j].split(','));
  }
  const known = /^(chromium|phone|webkit|phone-webkit|firefox)$|\*/;
  return [...new Set(words.map((x) => x.trim().toLowerCase()).filter((w) => known.test(w)))];
}

/** Whether Playwright's own build of an engine is on this machine (where `npx playwright install` puts it). */
function installed(engine) {
  try {
    return existsSync(require('@playwright/test')[engine].executablePath());
  } catch {
    return false;
  }
}
