/**
 * Round eighty-four, agent U: outside review B12. An isolated run of ten repetitions of one Chromium test ended "every
 * test passed first time; the deploy may go ahead", though a full strict run before it had failed: the last line said
 * the gate was passed whatever the run's scope. Now it follows the scope (scripts/predeploy-scope.mjs): only the whole
 * suite in every engine ends with the deploy going ahead.
 *
 * The first test runs the script itself over a real Playwright run of one test (a config of its own that opens no
 * browser): on r84base its last line was "every test passed first time; the deploy may go ahead".
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runScope, closingLine } from '../../scripts/predeploy-scope.mjs';

const root = resolve(__dirname, '../..');

describe('predeploy\'s last line follows the run\'s scope (B12)', () => {
  it('a run that is not the whole suite says what it proved and does not clear the deploy', { timeout: 90_000 }, () => {
    const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', '--config=tests/unit/fixtures/r84u-pw/playwright.config.ts', '--repeat-each=2'], { cwd: root, encoding: 'utf8', timeout: 80_000, env: { ...process.env, PW_BROWSERS: '' } });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const last = out.trim().split('\n').filter((l) => l.startsWith('predeploy:')).at(-1)!;
    expect(last).toContain('the tests selected passed first time (another config, --repeat-each)');
    expect(last).toContain('This was not the run before a deploy');
    expect(out).not.toContain('the deploy may go ahead');
  });
  it('each scope in its own words', () => {
    const say = (c: Parameters<typeof runScope>[0], status = 0) => closingLine(status, runScope(c));
    // The whole suite in every engine: the only run that clears the deploy.
    expect(say({ engines: ['webkit', 'firefox'] })).toBe('predeploy: every test passed first time in every engine; the deploy may go ahead');
    expect(say({ engines: ['webkit', 'firefox'], extra: ['--workers=2', '--reporter', 'line'] })).toContain('the deploy may go ahead');
    // Chromium and its phone: the corpus tier's gate, said as such.
    expect(say({})).toMatch(/in Chromium \(desktop and phone\)\. That is the gate for a round that changed only the corpus/);
    expect(say({ extra: ['--project=chromium', '--project=phone'], filtered: ['chromium', 'phone'] })).toMatch(/That is the gate for a round that changed only the corpus/);
    // B12's own run: one spec, repeated; and a name filter, a shard, a subset of engines.
    expect(say({ extra: ['tests/e2e/r82d-record.spec.ts', '--repeat-each=10', '--project=chromium'], filtered: ['chromium'] })).toBe('predeploy: the tests selected passed first time (tests/e2e/r82d-record.spec.ts, --repeat-each, the projects chromium). This was not the run before a deploy, which runs the whole suite in every engine: node scripts/predeploy.mjs --tier=app');
    expect(say({ extra: ['-g', 'backup reminder'], engines: ['webkit', 'firefox'] })).toContain('(a name filter)');
    expect(say({ extra: ['--shard=1/4'], engines: ['webkit', 'firefox'] })).toContain('(--shard)');
    expect(say({ extra: ['--project', 'webkit', '--project=phone-webkit'], filtered: ['webkit', 'phone-webkit'], engines: ['webkit'] })).toContain('(the projects webkit, phone-webkit)');
    // A failure is a failure in either scope.
    expect(say({ engines: ['webkit', 'firefox'] }, 1)).toBe('predeploy: the strict run failed (exit 1); do not deploy');
    expect(say({ extra: ['x.spec.ts'] }, 1)).toBe('predeploy: the tests selected failed (exit 1; x.spec.ts); do not deploy');
  });
});
