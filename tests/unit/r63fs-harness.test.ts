/**
 * Round sixty-three, the fix pass, fixer S: two harness findings of the server review of the round.
 *
 * - R3 4: DEPLOY offered `--project webkit` "for one engine" and said naming WebKit also runs the phone tests in WebKit,
 *   and predeploy printed "Chromium, the Chromium phone, and webkit" for it; but `--project` is Playwright's filter, which
 *   ran WebKit's desktop project alone. Predeploy now adds the phone tests in WebKit to it, as `--browsers=webkit` does,
 *   and says it runs only the projects named, which is not the whole run before a deploy.
 * - R3 5: the 200%-text tests checked the text size on their first page and then measured others. Each page they measure
 *   now checks it again (`textSizeHeld`), and the test is skipped, with the page and the size, if it did not hold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const root = resolve(__dirname, '../..');
const dir = join(root, 'tests', `.r63fs-harness-${process.pid}`);
const browsers = join(dir, 'browsers');

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pw.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', reporter: 'line', projects: [{ name: 'chromium' }, { name: 'phone', grep: /@phone\\b/ }, { name: 'webkit' }, { name: 'phone-webkit', grep: /@phone\\b/ }] });\n");
  writeFileSync(join(dir, 'a.spec.ts'), "import { test } from '@playwright/test';\ntest('desk', () => {});\ntest('hand', { tag: '@phone' }, () => {});\n");
  // A stand-in for an installed WebKit, where Playwright looks for one: `--list` launches no browser.
  const exe = spawnSync(process.execPath, ['-e', "console.log(require('@playwright/test').webkit.executablePath())"], { cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers } }).stdout.trim();
  mkdirSync(dirname(exe), { recursive: true });
  writeFileSync(exe, '');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function predeploy(...args: string[]) {
  const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', '--config', join(dir, 'pw.config.ts'), '--list', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers, PW_BROWSERS: '' }, timeout: 120_000
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('R3 4: predeploy --project webkit does what it says, and says what it does', () => {
  it('runs WebKit with its phone tests, and says these are the only projects, not the run before a deploy', () => {
    const r = predeploy('--project', 'webkit');
    expect(r.status).toBe(0);
    expect(r.out).toContain('[webkit] › a.spec.ts');
    expect(r.out).toMatch(/\[phone-webkit\] › a\.spec\.ts.*hand/);
    expect(r.out).not.toContain('[chromium]');
    expect(r.out).toContain('predeploy: only the projects named: webkit, phone-webkit. This is not the whole run before a deploy');
    expect(r.out).not.toContain('predeploy: Chromium, the Chromium phone, and webkit');
  }, 130_000);

  it('GUARD: Chromium and the phone named together is said as only those projects, with no warning', () => {
    const r = predeploy('--project=chromium,phone');
    expect(r.out).toContain('predeploy: only the projects named: chromium, phone\n');
  }, 130_000);
});

describe('R3 5: the 200%-text tests check the size on every page they measure', () => {
  /** A test's body, from its title to the next top-level test. */
  const body = (file: string, title: string) => {
    const s = readFileSync(join(root, 'tests/e2e', file), 'utf8');
    const at = s.indexOf(title);
    expect(at, title).toBeGreaterThan(-1);
    const end = s.indexOf('\ntest(', at);
    return s.slice(at, end < 0 ? undefined : end);
  };
  const MEASURES = /scrollWidth|sideways\(|boundingBox\(/;
  for (const [file, title] of [
    ['r61a-a11y.spec.ts', 'r61a a11y-perf 7:'],
    ['smoke.spec.ts', "round sixty: at 320 px with the browser\\'s text at 200%"],
    ['r61w-pages.spec.ts', 'at 320 px with 200% text, the refusal pills wrap']
  ] as const) {
    it(`${file}: every page measured after a navigation has the size checked first`, () => {
      // Each stretch from one navigation to the next that measures the layout checks the size in it.
      const parts = body(file, title).split(/page\.goto\(/).slice(1);
      expect(parts.length).toBeGreaterThan(0);
      const unchecked = parts.filter((p) => MEASURES.test(p) && !/textSize(Held)?\(/.test(p)).map((p) => p.slice(0, 40));
      expect(unchecked).toEqual([]);
    });
  }
});
