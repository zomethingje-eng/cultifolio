/**
 * Round sixty-two, second pass, the harness: `scripts/predeploy.mjs`, the strict browser run before a deploy as one
 * command (the verification triage-self review N6). It must exit non-zero on a failure AND on a flake (a test that
 * passed only on its retry), zero only when every test passed first time; it sets CI_STRICT=1 and drops PW_REUSE.
 *
 * The script passes its arguments to Playwright, so each case runs it against a scratch config (no webServer, no
 * browser: the specs only read their own retry number and environment) in a directory under the repository, where
 * `@playwright/test` resolves. The scratch config has no `failOnFlakyTests`, so the flake case shows the script's own
 * `--fail-on-flaky-tests` at work, not the project config's.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const root = resolve(__dirname, '../..');
const dir = join(root, 'tests', `.r62bh-predeploy-${process.pid}`);

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pw.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: '.', retries: 1, reporter: 'line', workers: 1 });\n");
  writeFileSync(join(dir, 'steady.spec.ts'), "import { test, expect } from '@playwright/test';\ntest('steady', () => { expect(process.env.CI_STRICT).toBe('1'); expect(process.env.PW_REUSE).toBeUndefined(); });\n");
  writeFileSync(join(dir, 'flaky.spec.ts'), "import { test, expect } from '@playwright/test';\ntest('flaky', ({}, info) => { expect(info.retry).toBe(1); });\n");
  // The project's own config with its server, browsers and test folder taken away: what a plain `npx playwright test`
  // runs under, retries and flake rule included (round sixty-seven; triage-66 H10).
  writeFileSync(join(dir, 'plain.config.ts'), "import base from '../../playwright.config';\nexport default { ...base, webServer: undefined, testDir: '.', projects: [{ name: 'plain' }], reporter: 'line', workers: 1 };\n");
  writeFileSync(join(dir, 'broken.spec.ts'), "import { test, expect } from '@playwright/test';\ntest('broken', () => { expect(1).toBe(2); });\n");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function predeploy(spec: string) {
  // The spec by its name alone: Playwright reads a file argument as a pattern, and a Windows path's backslashes matched
  // nothing ("No tests found", round sixty-two's first deploy).
  const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', '--config', join(dir, 'pw.config.ts'), spec], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI_STRICT: '', PW_REUSE: '1' },
    timeout: 120_000
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

describe('scripts/predeploy.mjs: the strict run before a deploy (round sixty-two; the verification triage-self review N6)', () => {
  it('every test passing first time exits 0, with CI_STRICT=1 set and PW_REUSE dropped', () => {
    const r = predeploy('steady.spec.ts');
    expect(r.out).toContain('1 passed');
    expect(r.status).toBe(0);
  }, 130_000);

  it('a test that passes only on its retry fails the run', () => {
    const r = predeploy('flaky.spec.ts');
    expect(r.out).toMatch(/1 flaky/);
    expect(r.status).not.toBe(0);
  }, 130_000);

  it('a test that fails twice fails the run', () => {
    const r = predeploy('broken.spec.ts');
    expect(r.out).toMatch(/1 failed/);
    expect(r.status).not.toBe(0);
  }, 130_000);
});

describe('a plain `npx playwright test` is strict too (round sixty-seven; triage-66 H10, R45-29)', () => {
  // Before, only predeploy was strict: the config failed a flake only under CI_STRICT=1, so a plain run that needed a retry
  // exited 0. Run here with CI_STRICT unset and nothing on the command line but the config and the spec.
  const plain = (spec: string) => {
    const r = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(dir, 'plain.config.ts'), spec], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI_STRICT: '' },
      timeout: 120_000
    });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
  };
  it('the project config still retries once, and a test that passes only on its retry fails the run', () => {
    const r = plain('flaky.spec.ts');
    expect(r.out).toMatch(/1 flaky/);
    expect(r.status).not.toBe(0);
  }, 130_000);
});
