// Run a few browser tests many times over, to see how often each fails (round seventy-five; the harness, H). For the
// owner's PC, where WebKit and Firefox are installed and the strict run before a deploy (`node scripts/predeploy.mjs`)
// fails on a test that passes only on its retry.
//
//   node scripts/flake-check.mjs
//     runs the tests below that were flaky once in round seventy-four's strict runs (the four still open, and two whose
//     faults were fixed, as checks) in Firefox and WebKit, 20 times each, at two workers, with no retries, and prints for
//     each test and engine how many runs passed and failed, with each failure's first line. It is not strict: it runs
//     everything and reports; its exit status is 0 only when every run passed.
//   node scripts/flake-check.mjs --engine=firefox --repeat=5 "r62bg 1"
//     names the engines (firefox, webkit, chromium), the runs per test, and the tests (the start of a title, or any part
//     of it) instead.
//   node scripts/flake-check.mjs --dry-run
//     prints the plan and the time it should take, and runs nothing.
//
// It prints the time it expects first, from rough times per run (below) and the two workers. Like predeploy, it starts
// its own server from a fresh state (playwright.config.ts's webServer, the build included) unless PW_REUSE=1.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The tests run when none is named, each with a rough time for one run in each engine on the owner's PC, in seconds
 * (WebKit's from its IndexedDB pace, tests/e2e/helpers/pace.ts: the example is about 26 s to set out there, the 400-plant
 * backup two restores of about 2 minutes each). The times only make the estimate; nothing is cut off by them.
 */
export const DEFAULT_TESTS = [
  { name: 'r60 11:', why: 'open: Firefox, page.goto("/sync") ended in "<unknown error>"', secs: { firefox: 12, webkit: 60, chromium: 8 } },
  { name: 'removing asks twice', why: 'open: Firefox, Water left no line', secs: { firefox: 20, webkit: 30, chromium: 12 } },
  { name: 'round twenty-eight: a backup of four hundred plants', why: 'open: WebKit, the restore ran past its 125 s', secs: { firefox: 25, webkit: 300, chromium: 12 } },
  { name: 'r62bg 1:', why: 'open: Firefox, a Leave answered Cancel left the example (round seventy-five changed Leave)', secs: { firefox: 12, webkit: 40, chromium: 8 } },
  { name: 'r64f 7:', why: 'fixed in round seventy-four: WebKit left the second page out of the first worker\'s claim', secs: { firefox: 12, webkit: 20, chromium: 8 } },
  { name: 'round forty-nine: a place takes plants in', why: 'fixed in round seventy-four: Firefox refused a space added while the collection opened', secs: { firefox: 12, webkit: 25, chromium: 8 } }
];
export const ENGINES = ['firefox', 'webkit', 'chromium'];
const DEFAULT_ENGINES = ['firefox', 'webkit'];
const DEFAULT_REPEAT = 20;
const DEFAULT_WORKERS = 2;
/** The build and the server's start, before the first test (the owner's PC: about four minutes). */
export const START_SECS = 240;
/** A test named on the command line that is not in the list above: a rough time per run. */
const OTHER_SECS = { firefox: 30, webkit: 60, chromium: 20 };

/**
 * The command line, read: `--engine=` (or `--engine x`), `--repeat=`, `--workers=`, `--dry-run`, `--help`, and the rest
 * as test names. PowerShell passes `--engine=firefox,webkit` as two words (`--engine=firefox` and `webkit`), so an
 * engine's bare name straight after `--engine=` is taken as part of it, as predeploy does for `--browsers=`. Returns the
 * plan, or `{ error }` with the sentence to print.
 */
export function parseArgs(argv) {
  const out = { engines: [], repeat: DEFAULT_REPEAT, workers: DEFAULT_WORKERS, names: [], dryRun: false, help: false };
  let inEngines = false;
  const num = (flag, v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : { error: `flake-check: ${flag} takes a whole number above 0, not "${v}"` };
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (flag) => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i] ?? '');
    if (a === '--help' || a === '-h') { out.help = true; inEngines = false; }
    else if (a === '--dry-run') { out.dryRun = true; inEngines = false; }
    else if (a === '--engine' || a.startsWith('--engine=') || a === '--engines' || a.startsWith('--engines=')) { out.engines.push(...value().split(',')); inEngines = true; }
    else if (a === '--repeat' || a.startsWith('--repeat=') || a.startsWith('--repeat-each')) { const n = num('--repeat', value()); if (typeof n !== 'number') return n; out.repeat = n; inEngines = false; }
    else if (a === '--workers' || a.startsWith('--workers=') || a === '-j') { const n = num('--workers', value()); if (typeof n !== 'number') return n; out.workers = n; inEngines = false; }
    else if (a.startsWith('-')) return { error: `flake-check: there is no option "${a}". Type: node scripts/flake-check.mjs [--engine=firefox,webkit] [--repeat=20] [--workers=2] [--dry-run] ["test name" ...]` };
    else if (inEngines && ENGINES.includes(a.toLowerCase())) out.engines.push(a);
    else { out.names.push(a); inEngines = false; }
  }
  out.engines = [...new Set(out.engines.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const unknown = out.engines.filter((e) => !ENGINES.includes(e));
  if (unknown.length) return { error: `flake-check: there is no engine "${unknown[0]}". Type one or more of: ${ENGINES.join(', ')} (for example --engine=firefox,webkit)` };
  if (!out.engines.length) out.engines = [...DEFAULT_ENGINES];
  return out;
}

/** The tests a plan runs: the names given, each with its rough times if it is one of the list's, or the list itself. */
export function testsOf(plan) {
  if (!plan.names.length) return DEFAULT_TESTS;
  const bare = (x) => x.toLowerCase().trim().replace(/:$/, '');
  // "r62bg 1" or "r62bg 1:" is the list's own "r62bg 1:", and so is its whole title; "r60 1" is not "r60 11:".
  return plan.names.map((n) => DEFAULT_TESTS.find((t) => bare(n) === bare(t.name) || n.toLowerCase().startsWith(t.name.toLowerCase())) ?? { name: n, why: 'named on the command line', secs: OTHER_SECS });
}

/** The time a plan should take, in seconds: the start, then every run over the workers. */
export function estimateSecs(plan, tests = testsOf(plan)) {
  let runs = 0;
  for (const t of tests) for (const e of plan.engines) runs += (t.secs[e] ?? OTHER_SECS[e]) * plan.repeat;
  return Math.round(START_SECS + runs / Math.max(1, plan.workers));
}
/** "1 h 25 min", "12 min", "under a minute". */
export function duration(secs) {
  const m = Math.round(secs / 60);
  if (secs < 60) return 'under a minute';
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

/** A pattern for Playwright's `--grep` that matches any of the names, each taken as plain text. */
export function grepOf(tests) {
  return tests.map((t) => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

/** The arguments for Playwright: the engines' projects, the names, the runs, two workers, and no retry (every run counts). */
export function playwrightArgs(plan, tests = testsOf(plan)) {
  return ['test', ...plan.engines.map((e) => `--project=${e}`), `--grep=${grepOf(tests)}`, `--repeat-each=${plan.repeat}`, `--workers=${plan.workers}`, '--retries=0', '--reporter=line,json'];
}

/** The first line of a failure's message, its colour codes taken out. */
export function firstLine(message) {
  const text = String(message ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  return text.split('\n').map((l) => l.trim()).find(Boolean) ?? '(no message)';
}

/**
 * Playwright's JSON report, read into one row per test and engine: the runs that passed, those that failed (with each
 * failure's first line and its run number), and those skipped. Rows come in the report's order.
 */
export function summarise(report) {
  const rows = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const key = `${t.projectName}\u0000${spec.title}`;
        const row = rows.get(key) ?? { engine: t.projectName, title: spec.title, file: spec.file, passed: 0, failed: 0, skipped: 0, failures: [] };
        rows.set(key, row);
        for (const r of t.results ?? []) {
          if (r.status === 'passed') row.passed++;
          else if (r.status === 'skipped') row.skipped++;
          else {
            row.failed++;
            const message = r.error?.message ?? r.errors?.[0]?.message ?? r.status;
            row.failures.push({ run: (t.repeatEachIndex ?? r.repeatEachIndex ?? row.passed + row.failed - 1) + 1, status: r.status, line: firstLine(message) });
          }
        }
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  return [...rows.values()];
}

/** The lines printed after the run: one per test and engine, each failure under its row, and a last line. */
export function report(rows, names = []) {
  const lines = ['flake-check: results (each run once, no retries)'];
  const width = Math.min(70, Math.max(10, ...rows.map((r) => r.title.length)));
  for (const r of rows) {
    const title = r.title.length > width ? `${r.title.slice(0, width - 1)}…` : r.title.padEnd(width);
    lines.push(`  ${r.engine.padEnd(8)} ${title}  ${r.passed} passed, ${r.failed} failed${r.skipped ? `, ${r.skipped} skipped` : ''}`);
    for (const f of r.failures) lines.push(`      run ${f.run}${f.status === 'failed' ? '' : ` (${f.status})`}: ${f.line}`);
  }
  for (const n of names) if (!rows.some((r) => r.title.toLowerCase().includes(n.toLowerCase()))) lines.push(`  no test matched "${n}"`);
  const runs = rows.reduce((s, r) => s + r.passed + r.failed, 0);
  const failed = rows.reduce((s, r) => s + r.failed, 0);
  lines.push(failed ? `flake-check: ${failed} of ${runs} runs failed. Send these lines back, with the folders under test-results/ that hold a trace.zip.` : `flake-check: all ${runs} runs passed.`);
  return lines;
}

function main() {
  const plan = parseArgs(process.argv.slice(2));
  if (plan.error) { console.error(plan.error); process.exit(1); }
  if (plan.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); return; }
  const tests = testsOf(plan);
  const require = createRequire(import.meta.url);
  let cli;
  try { cli = require.resolve('@playwright/test/cli'); } catch { console.error('flake-check: @playwright/test is not installed here; run `npm ci` first'); process.exit(1); }
  const runs = tests.length * plan.engines.length * plan.repeat;
  console.log(`flake-check: ${tests.length} ${tests.length === 1 ? 'test' : 'tests'} x ${plan.engines.join(' and ')} x ${plan.repeat} runs = ${runs} runs, at ${plan.workers} ${plan.workers === 1 ? 'worker' : 'workers'}, no retries`);
  for (const t of tests) console.log(`  ${t.name}  (${t.why})`);
  console.log(`flake-check: expected to take about ${duration(estimateSecs(plan, tests))}, the build and the server's start included`);
  if (plan.dryRun) { console.log(`flake-check: --dry-run, so nothing is run. Playwright would be given: ${playwrightArgs(plan, tests).join(' ')}`); return; }
  const missing = plan.engines.filter((e) => e !== 'chromium' && !installed(require, e));
  if (missing.length) {
    console.error(`flake-check: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not installed here. Install the engines once, then run this again:`);
    console.error('  npx playwright install webkit firefox');
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), 'flake-check-'));
  const json = join(dir, 'report.json');
  const env = { ...process.env, PW_BROWSERS: plan.engines.filter((e) => e !== 'chromium').join(','), PLAYWRIGHT_JSON_OUTPUT_FILE: json };
  delete env.CI_STRICT; // not the strict run: every run is reported, and a retry is not asked for
  const t0 = Date.now();
  const run = spawnSync(process.execPath, [cli, ...playwrightArgs(plan, tests)], { stdio: 'inherit', env });
  if (run.error) { console.error(`flake-check: Playwright did not start: ${run.error.message}`); process.exit(1); }
  if (!existsSync(json)) { console.error(`flake-check: Playwright wrote no report (exit ${run.status ?? 'none'}); the lines above say why`); process.exit(run.status || 1); }
  const rows = summarise(JSON.parse(readFileSync(json, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
  for (const l of report(rows, plan.names)) console.log(l);
  console.log(`flake-check: took ${duration((Date.now() - t0) / 1000)}`);
  process.exit(rows.some((r) => r.failed) || !rows.length ? 1 : 0);
}

/** Whether Playwright's own build of an engine is on this machine. */
function installed(require, engine) {
  try { return existsSync(require('@playwright/test')[engine].executablePath()); } catch { return false; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
