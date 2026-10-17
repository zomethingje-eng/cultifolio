/**
 * Round seventy-five, the harness (agent H). Over round seventy-four's four strict runs on the owner's PC nine tests were
 * flaky once each, never the same one twice, five of them in Firefox, which ran at the run's four workers while WebKit was
 * held to two. This file holds:
 *
 * - Firefox held to two workers of its own, as WebKit is (playwright.config.ts; PW_FIREFOX_WORKERS), with its failed
 *   tests' traces kept, and predeploy saying what each engine runs at; the strict rule as it was;
 * - `scripts/flake-check.mjs`, the owner's repeat run: its command line, its estimate, and its reading of Playwright's
 *   report (from a real run of a scratch config, as tests/unit/r62bh-predeploy.test.ts runs one);
 * - a guard: a test that presses or types on a server-drawn page straight after `goto` waits for the page's hydration
 *   first (a press before it has no handler; a value typed is dropped when the field hydrates);
 * - the three open flakes' tests as round seventy-five left them (smoke-2's Water, r60 11's Today, smoke-3's restores).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import * as paceScript from '../../scripts/engine-pace.mjs';
import * as flakeScript from '../../scripts/flake-check.mjs';

/** The two scripts are plain JavaScript; their results are read here as the scripts use them, not by inferred types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pace = paceScript as any, flake = flakeScript as any;

const require = createRequire(import.meta.url);
const root = resolve(__dirname, '../..');
const dir = join(root, 'tests', `.r75h-harness-${process.pid}`);
const browsers = join(dir, 'browsers');
const e2e = join(root, 'tests', 'e2e');

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pw.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', reporter: 'line', projects: [{ name: 'chromium' }] });\n");
  writeFileSync(join(dir, 'a.spec.ts'), "import { test } from '@playwright/test';\ntest('desk', () => {});\n");
  // Stand-ins for installed WebKit and Firefox, where Playwright looks for them: `--list` launches no browser (as r63fs-harness does).
  for (const engine of ['webkit', 'firefox']) {
    const exe = spawnSync(process.execPath, ['-e', `console.log(require('@playwright/test').${engine}.executablePath())`], { cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers } }).stdout.trim();
    mkdirSync(dirname(exe), { recursive: true });
    writeFileSync(exe, '');
  }
  // For flake-check's reading of a report: a test that fails on its second run of three, one that passes, one skipped.
  mkdirSync(join(dir, 'runs'), { recursive: true });
  writeFileSync(join(dir, 'runs', 'pw.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', projects: [{ name: 'firefox' }, { name: 'webkit' }] });\n");
  writeFileSync(join(dir, 'runs', 'b.spec.ts'), [
    "import { test, expect } from '@playwright/test';",
    "test('r99 1: wobbles on its second run', ({}, info) => { expect(info.repeatEachIndex === 1 && info.project.name === 'webkit' ? 'Leaving…' : 'ok', 'the button came back').toBe('ok'); });",
    "test('r99 2: steady', () => {});",
    "test('r99 3: not here', () => { test.skip(true, 'not in this engine'); });",
    ''
  ].join('\n'));
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Firefox is held to two workers of its own, as WebKit is (round seventy-five)', () => {
  async function config(env: Record<string, string>) {
    const saved = { ...process.env };
    Object.assign(process.env, { PW_BROWSERS: 'all', PW_FIREFOX_WORKERS: '', PW_WEBKIT_WORKERS: '', PW_FIREFOX_TRACE: '' }, env);
    for (const [k, v] of Object.entries(process.env)) if (v === '' && k.startsWith('PW_') && k !== 'PW_BROWSERS') delete process.env[k];
    vi.resetModules();
    try {
      return (await import('../../playwright.config')).default;
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }
  const project = (c: Awaited<ReturnType<typeof config>>, name: string) => c.projects!.find((p) => p.name === name)!;
  it('Firefox runs at two, WebKit and its phone at two, Chromium at the run\'s count', async () => {
    const c = await config({});
    expect(project(c, 'firefox').workers).toBe(2); // r75base: undefined, the run's four
    expect(project(c, 'webkit').workers).toBe(2);
    expect(project(c, 'phone-webkit').workers).toBe(2);
    expect(project(c, 'chromium').workers).toBeUndefined();
  });
  it('PW_FIREFOX_WORKERS names another count, and a count that is not one is two', async () => {
    expect(project(await config({ PW_FIREFOX_WORKERS: '3' }), 'firefox').workers).toBe(3);
    expect(project(await config({ PW_FIREFOX_WORKERS: 'four' }), 'firefox').workers).toBe(2);
    expect(project(await config({ PW_WEBKIT_WORKERS: '1' }), 'webkit').workers).toBe(1);
  });
  it('a Firefox test that fails keeps its trace, as a WebKit one does', async () => {
    const t = project(await config({}), 'firefox').use!.trace as { mode: string };
    expect(t.mode).toBe('retain-on-failure');
  });
  it('the strict rule is as it was: one retry, a flake fails the run, and predeploy still passes --fail-on-flaky-tests', async () => {
    const c = await config({});
    expect(c.retries).toBe(1);
    expect(c.failOnFlakyTests).toBe(true);
    expect(read('scripts/predeploy.mjs')).toMatch(/const args = \[cli, 'test', '--fail-on-flaky-tests'/);
    expect(read('scripts/flake-check.mjs')).not.toMatch(/spawnSync\([^)]*predeploy/); // the repeat run is its own, never the deploy's
  });
});

describe('predeploy says what each engine runs at (round seventy-five)', () => {
  function predeploy(env: Record<string, string>, ...args: string[]) {
    const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', '--config', join(dir, 'pw.config.ts'), '--list', ...args], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers, PW_BROWSERS: '', PW_WORKERS: '', PW_WEBKIT_WORKERS: '', PW_FIREFOX_WORKERS: '', ...env }, timeout: 120_000
    });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
  }
  it('every engine, at four: Chromium at four, WebKit and Firefox at two each', () => {
    const r = predeploy({}, '--browsers=all');
    expect(r.status).toBe(0);
    // r75base: "predeploy: Chromium, the Chromium phone, and webkit, firefox", no count for any engine
    expect(r.out).toContain('predeploy: Chromium and the Chromium phone at 4 workers; WebKit and the WebKit phone at 2 workers (PW_WEBKIT_WORKERS); Firefox at 2 workers (PW_FIREFOX_WORKERS), 4 in all at once');
  }, 130_000);
  it('the counts the environment names are the counts said', () => {
    const r = predeploy({ PW_WORKERS: '6', PW_FIREFOX_WORKERS: '1' }, '--browsers=firefox');
    expect(r.out).toContain('predeploy: Chromium and the Chromium phone at 6 workers; Firefox at 1 worker (PW_FIREFOX_WORKERS), 6 in all at once');
  }, 130_000);
  it('Chromium alone says so, and how to add the others', () => {
    const r = predeploy({});
    expect(r.out).toContain('predeploy: Chromium and the Chromium phone at 4 workers; for Safari\'s engine and Firefox as well');
  }, 130_000);
  it('the sentence itself, for counts the run does not set', () => {
    expect(pace.paceLine({ engines: ['webkit', 'firefox'], workers: 2, env: {} })).toBe('Chromium and the Chromium phone at 2 workers; WebKit and the WebKit phone at 2 workers (PW_WEBKIT_WORKERS); Firefox at 2 workers (PW_FIREFOX_WORKERS), 2 in all at once');
    expect(pace.paceLine({ engines: ['firefox'], workers: null, env: { PW_FIREFOX_WORKERS: '3' } })).toBe('Chromium and the Chromium phone at the workers named; Firefox at at most 3 of the workers named (PW_FIREFOX_WORKERS)');
    expect(pace.paceLine({ engines: ['firefox'], workers: 1, env: { PW_FIREFOX_WORKERS: '3' } })).toContain('Firefox at 1 worker');
    expect(pace.engineWorkers({ PW_FIREFOX_WORKERS: '0', PW_WEBKIT_WORKERS: '2.5' })).toEqual({ webkit: 2, firefox: 2 });
  });
});

describe('scripts/flake-check.mjs: the command line (round seventy-five)', () => {
  it('nothing named: the six tests, in Firefox and WebKit, twenty times, at two workers', () => {
    const p = flake.parseArgs([]);
    expect([p.engines, p.repeat, p.workers, p.names, p.dryRun]).toEqual([['firefox', 'webkit'], 20, 2, [], false]);
    expect(flake.testsOf(p).map((t: { name: string }) => t.name)).toEqual(['r60 11:', 'removing asks twice', 'round twenty-eight: a backup of four hundred plants', 'r62bg 1:', 'r64f 7:', 'round forty-nine: a place takes plants in']);
  });
  it('--engine, --repeat and names override; PowerShell\'s split of --engine=firefox,webkit is one list', () => {
    expect(flake.parseArgs(['--engine=firefox', 'webkit', 'r62bg 1']).engines).toEqual(['firefox', 'webkit']);
    expect(flake.parseArgs(['--engine=firefox', 'webkit', 'r62bg 1']).names).toEqual(['r62bg 1']);
    const p = flake.parseArgs(['--engine', 'webkit', '--repeat', '5', '--workers=1', 'removing asks twice', '--dry-run']);
    expect([p.engines, p.repeat, p.workers, p.names, p.dryRun]).toEqual([['webkit'], 5, 1, ['removing asks twice'], true]);
    expect(flake.parseArgs(['--engine=Chromium,FIREFOX']).engines).toEqual(['chromium', 'firefox']);
    expect(flake.parseArgs(['--repeat=3']).repeat).toBe(3);
  });
  it('a word it does not know is refused with what to type', () => {
    expect(flake.parseArgs(['--engine=safari']).error).toContain('there is no engine "safari"');
    expect(flake.parseArgs(['--repeat=0']).error).toContain('--repeat takes a whole number above 0');
    expect(flake.parseArgs(['--repeat', 'many']).error).toContain('not "many"');
    expect(flake.parseArgs(['--strict']).error).toContain('there is no option "--strict"');
  });
  it('a name is the list\'s own test when it is that test, and only then', () => {
    const of = (n: string) => flake.testsOf(flake.parseArgs([n]))[0];
    expect(of('r62bg 1').name).toBe('r62bg 1:');
    expect(of('R62BG 1:').name).toBe('r62bg 1:');
    expect(of('r60 1')).toMatchObject({ name: 'r60 1', why: 'named on the command line' }); // not r60 11
    expect(of('r64f 7: on a first visit the second page is loaded once').name).toBe('r64f 7:');
  });
  it('the pattern Playwright is given takes each name as plain text, and every run counts: no retry, not strict', () => {
    const tests = flake.testsOf(flake.parseArgs(['a (b) c?', 'r62bg 1']));
    expect(flake.grepOf(tests)).toBe('a \\(b\\) c\\?|r62bg 1:');
    const args = flake.playwrightArgs(flake.parseArgs(['--engine=webkit', '--repeat=4']));
    expect(args).toEqual(expect.arrayContaining(['--project=webkit', '--repeat-each=4', '--workers=2', '--retries=0', '--reporter=line,json']));
    expect(args).not.toContain('--fail-on-flaky-tests');
  });
  it('the estimate: the start, then every run over the workers', () => {
    const plan = flake.parseArgs(['--engine=firefox', '--repeat=2', '--workers=1', 'r62bg 1']);
    expect(flake.estimateSecs(plan)).toBe(flake.START_SECS + 2 * 12);
    expect(flake.duration(30)).toBe('under a minute');
    expect(flake.duration(12 * 60)).toBe('12 min');
    expect(flake.duration(85 * 60)).toBe('1 h 25 min');
    expect(flake.duration(120 * 60)).toBe('2 h');
  });
  it('prints the plan and the time it expects before running anything (--dry-run runs nothing)', () => {
    const r = spawnSync(process.execPath, ['scripts/flake-check.mjs', '--dry-run'], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines[0]).toBe('flake-check: 6 tests x firefox and webkit x 20 runs = 240 runs, at 2 workers, no retries');
    expect(lines.find((l) => l.startsWith('flake-check: expected to take about'))).toMatch(/about \d+ h( \d+ min)?, the build/);
    expect(lines.at(-1)).toContain('--dry-run, so nothing is run');
  }, 70_000);
});

describe('scripts/flake-check.mjs: reading Playwright\'s report (round seventy-five)', () => {
  let rows: Array<{ engine: string; title: string; passed: number; failed: number; skipped: number; failures: Array<{ run: number; line: string }> }> = [];
  beforeAll(() => {
    const json = join(dir, 'runs', 'report.json');
    spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(dir, 'runs', 'pw.config.ts'), '--repeat-each=3', '--retries=0', '--workers=1', '--reporter=json'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: json, CI_STRICT: '' }, timeout: 120_000
    });
    rows = flake.summarise(JSON.parse(readFileSync(json, 'utf8')));
  }, 130_000);
  it('one row per test and engine, the runs counted', () => {
    const row = (engine: string, start: string) => rows.find((r) => r.engine === engine && r.title.startsWith(start))!;
    expect([row('webkit', 'r99 1').passed, row('webkit', 'r99 1').failed]).toEqual([2, 1]);
    expect([row('firefox', 'r99 1').passed, row('firefox', 'r99 1').failed]).toEqual([3, 0]);
    expect([row('webkit', 'r99 2').passed, row('webkit', 'r99 2').failed]).toEqual([3, 0]);
    expect([row('firefox', 'r99 3').passed, row('firefox', 'r99 3').skipped]).toEqual([0, 3]);
    expect(rows).toHaveLength(6);
  });
  it('each failure with its run and its first line, colour taken out', () => {
    const f = rows.find((r) => r.engine === 'webkit' && r.title.startsWith('r99 1'))!.failures;
    expect(f).toHaveLength(1);
    expect(f[0].run).toBe(2);
    expect(f[0].line).toBe('Error: the button came back');
    expect(flake.firstLine('\u001b[31mError:\u001b[39m one\n two')).toBe('Error: one');
  });
  it('the lines printed: a row each, the failure under its row, a name that matched nothing, and the count', () => {
    const lines = flake.report(rows, ['r99 1', 'r98 nothing']);
    expect(lines.some((l: string) => /^ {2}webkit +r99 1: wobbles on its second run +2 passed, 1 failed$/.test(l))).toBe(true);
    expect(lines).toContain('      run 2: Error: the button came back');
    expect(lines).toContain('  no test matched "r98 nothing"');
    expect(lines.at(-1)).toBe('flake-check: 1 of 12 runs failed. Send these lines back, with the folders under test-results/ that hold a trace.zip.');
  });
});

/** Each top-level `test(` block of a spec, by its title, with its source and first line (as r73h-harness reads them). */
function blocks(src: string): { title: string; body: string }[] {
  const starts = [...src.matchAll(/^test(?:\.\w+)?\((['"`])(.*?)\1/gm)].map((m) => ({ at: m.index!, title: m[2] }));
  return starts.map((s, i) => ({ title: s.title, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}

/**
 * A press or a value typed on a server-drawn page straight after `goto`, with no wait for its hydration between them.
 * The pages drawn in the browser alone (`ssr = false`: My plants, spaces, propagation, Today, Labels, Backup, Sync) draw
 * nothing until their script runs, so a control on them has its handler; a server-drawn page (the front page, species,
 * about, settings) shows its controls before. A link followed works either way, and a press inside `expect.poll` is
 * tried again. Line-based, as the specs are written.
 */
function pressedBeforeHydration(src: string, file: string): string[] {
  const CSR = /^\/(backup|labels|places|plants|propagation|sync|today)(?:[/?#]|$)/;
  const WAIT = /ready\((\w+)\)|html\[data-(ready|worker|collection)|waitForLoadState\('networkidle'\)|decided\(/;
  const PRESS = /\.(click|dblclick|fill|check|uncheck|selectOption|press|type|pressSequentially|setInputFiles|tap)\(/;
  const LINK = /getByRole\('link'|locator\((['"`])(?:[\w.#-]+ )*a(?:[.[\]#:]|\1|\s)|a\.tile|\.letters a/;
  const out: string[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const g = /\b(\w+)\.goto\((['"`])(\/[^'"`$]*)/.exec(lines[i]);
    if (!g) continue;
    const [, p, , path] = g;
    if (CSR.test(path)) continue;
    // A page with JavaScript off (`javaScriptEnabled: false`) never hydrates: what it is pressed for works without it.
    let start = i;
    while (start > 0 && !/^\s*test(?:\.\w+)?\(/.test(lines[start])) start--;
    if (lines.slice(start, i).some((l) => /javaScriptEnabled: false/.test(l))) continue;
    const at = lines[i].slice(g.index);
    if (WAIT.test(at)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^(test|describe)[.(]|^\}\);/.test(l) || new RegExp(`\\b${p}\\.(goto|reload)\\(`).test(l) || WAIT.test(l)) break;
      if (!new RegExp(`\\b${p}\\b`).test(l) || !PRESS.test(l)) continue;
      if (/expect\.poll\(/.test(l) || LINK.test(l)) break; // a press tried until it takes proves the hydration; a link followed is another page
      out.push(`${file}:${j + 1} ${l.trim().slice(0, 90)}`);
      break;
    }
  }
  return out;
}

describe('a press on a server-drawn page waits for its hydration (round seventy-five)', () => {
  const specs = readdirSync(e2e).filter((f) => f.endsWith('.spec.ts'));
  it('reads what it is about: a press with no wait is found, and the waits and links pass', () => {
    expect(pressedBeforeHydration("  await page.goto('/species/x');\n  await page.getByRole('button', { name: 'Follow' }).click();\n", 'x.spec.ts')).toHaveLength(1);
    expect(pressedBeforeHydration("  await page.goto('/settings');\n  await page.check('#pref-refphotos');\n", 'x.spec.ts')).toHaveLength(1);
    expect(pressedBeforeHydration("  await page.goto('/settings');\n  await ready(page);\n  await page.check('#pref-refphotos');\n", 'x.spec.ts')).toEqual([]);
    expect(pressedBeforeHydration("  await page.goto('/');\n  await page.waitForLoadState('networkidle');\n  await page.fill('.searchbar', 'x');\n", 'x.spec.ts')).toEqual([]);
    expect(pressedBeforeHydration("  await page.goto('/species/x');\n  await page.getByRole('link', { name: 'Add one' }).click();\n", 'x.spec.ts')).toEqual([]);
    expect(pressedBeforeHydration("test('x', async ({ browser }) => {\n  const ctx = await browser.newContext({ javaScriptEnabled: false });\n  await page.goto('/');\n  await page.locator('.grow').click();\n", 'x.spec.ts')).toEqual([]); // no script: nothing to wait for
    expect(pressedBeforeHydration("  await page.goto('/plants/2026-0001');\n  await page.getByRole('button', { name: 'Water' }).click();\n", 'x.spec.ts')).toEqual([]); // drawn in the browser: no control before its handler
    const goes = specs.flatMap((f) => [...readFileSync(join(e2e, f), 'utf8').matchAll(/\b\w+\.goto\((['"`])\/(?!backup|labels|places|plants|propagation|sync|today)/g)]).length;
    expect(goes).toBeGreaterThan(100);
  });
  it('no spec presses or types on a server-drawn page before it has hydrated', () => {
    const found = specs.flatMap((f) => pressedBeforeHydration(readFileSync(join(e2e, f), 'utf8'), f));
    expect(found).toEqual([]);
  });
});

describe('the open flakes\' tests, as round seventy-five left them', () => {
  const body = (file: string, start: string) => blocks(readFileSync(join(e2e, file), 'utf8')).find((b) => b.title.startsWith(start))?.body ?? '';
  it('smoke-2 "removing asks twice" lets the plant page settle before Water, and says what the page was doing if no line comes', () => {
    const b = body('smoke-2.spec.ts', 'removing asks twice');
    const water = b.indexOf("getByRole('button', { name: 'Water', exact: true }).click()");
    const visit = b.lastIndexOf('await page.goto(`/plants/${acc}`);', water);
    const between = b.slice(visit, water);
    expect(visit).toBeGreaterThan(0);
    expect(between).toContain('await ready(page);'); // r75base: the tap straight after the goto
    expect(between).toContain("page.locator('#species-link')).toBeVisible(");
    expect(b.slice(water)).toMatch(/^[^\n]*\n\s*await watered\(page\);/);
  });
  it('r60 11 waits for Today to hydrate before going on to Sync', () => {
    const b = body('r60-grow.spec.ts', 'r60 11:');
    expect(b).toMatch(/await page\.goto\('\/today'\);\n\s*await ready\(page\);/);
  });
  it('smoke-3\'s 400-plant restores are waited for while the database answers, with no fixed time of their own', () => {
    const b = body('smoke-3.spec.ts', 'round twenty-eight: a backup of four hundred plants');
    expect(b).toContain('await watchStorage(page);');
    expect(b.match(/whileStoring\(page, \(timeout\) => expect\(page\.locator\('#bk-done'\)\)\.toContainText\('400 plants', \{ timeout \}\)/g)).toHaveLength(2);
    expect(b).not.toMatch(/'#bk-done'\)\)\.toContainText\('400 plants', \{ timeout: writeWait/); // r75base: writeWait(5_000, 6_000), 125 s in WebKit
  });
});
