/**
 * Round eighty-nine: `node scripts/deploy.mjs` leaves out what a passing predeploy ran on this very code
 * (scripts/deploy-stamp.mjs). The mark is the commit and every file that differs from it, by content: a byte changed,
 * a file added or deleted gives another mark, and git's ignored files (the corpus) none. With no stamp, another mark, or a
 * stamp that did not run a step, the step runs.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeMark, deploySteps, writeStamp, readStamp, stampFor } from '../../scripts/deploy-stamp.mjs';

const repo = () => {
  const d = mkdtempSync(join(tmpdir(), 'r89c-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
  git('init', '-q');
  writeFileSync(join(d, 'a.ts'), 'one\n');
  writeFileSync(join(d, '.gitignore'), 'static/s/\n');
  git('add', '.');
  git('commit', '-q', '-m', 'x');
  return { d, git };
};

describe('r89c: the deploy stamp', () => {
  it('the mark follows the code: a byte, a new file, a deleted file; not an ignored file nor the stamp', () => {
    const { d } = repo();
    const m0 = treeMark(d);
    writeFileSync(join(d, 'a.ts'), 'two\n');
    const m1 = treeMark(d);
    expect(m1).not.toBe(m0);
    writeFileSync(join(d, 'a.ts'), 'one\n');
    expect(treeMark(d)).toBe(m0);
    writeFileSync(join(d, 'b.ts'), 'new\n');
    const m2 = treeMark(d);
    expect(m2).not.toBe(m0);
    unlinkSync(join(d, 'b.ts'));
    expect(treeMark(d)).toBe(m0);
    unlinkSync(join(d, 'a.ts'));
    expect(treeMark(d)).not.toBe(m0);
    writeFileSync(join(d, 'a.ts'), 'one\n');
    mkdirSync(join(d, 'static/s'), { recursive: true });
    writeFileSync(join(d, 'static/s/x.json'), '{}');
    writeStamp(d, { mark: m0, unit: true, check: false, tier: 'corpus' });
    expect(treeMark(d)).toBe(m0);
  });
  it('what a deploy runs: only what the stamp ran on this very code is left out', () => {
    const { d } = repo();
    const m = treeMark(d);
    expect(deploySteps(null, m)).toEqual({ check: true, unit: true, why: 'no predeploy stamp: svelte-check and the unit tests run first' });
    writeStamp(d, { mark: m, unit: true, check: false, tier: 'corpus' });
    const s = readStamp(d);
    expect(deploySteps(s, m)).toMatchObject({ check: true, unit: false });
    expect(deploySteps(s, m).why).toMatch(/--tier=corpus\) passed the unit tests on this very code: svelte-check runs first$/);
    expect(deploySteps({ ...s, check: true }, m)).toMatchObject({ check: false, unit: false });
    expect(deploySteps({ ...s, check: true }, m).why).toMatch(/: nothing runs first$/);
    expect(deploySteps(s, 'another')).toMatchObject({ check: true, unit: true });
    expect(deploySteps(s, 'another').why).toMatch(/^the code differs from what the predeploy of .* passed/);
  });
  it('the predeploy stamps only a tier\'s whole passing run on code that did not change under it', () => {
    const base = { tier: 'corpus', status: 0, scope: 'chromium', markBefore: 'm', markAfter: 'm' };
    expect(stampFor(base)).toEqual({ stamp: { mark: 'm', unit: true, check: false, tier: 'corpus' }, words: 'predeploy: stamped (.predeploy-stamp.json): node scripts/deploy.mjs leaves out the unit tests for this very code' });
    expect(stampFor({ ...base, tier: 'launch', scope: 'all' }).stamp).toEqual({ mark: 'm', unit: true, check: true, tier: 'launch' });
    expect(stampFor({ ...base, status: 1 })).toEqual({ stamp: null, words: null });
    expect(stampFor({ ...base, scope: 'part' })).toEqual({ stamp: null, words: null });
    expect(stampFor({ ...base, tier: null })).toEqual({ stamp: null, words: null });
    expect(stampFor({ ...base, markAfter: 'n' })).toEqual({ stamp: null, words: 'predeploy: the code changed while this ran: no stamp; node scripts/deploy.mjs runs everything' });
  });
});
