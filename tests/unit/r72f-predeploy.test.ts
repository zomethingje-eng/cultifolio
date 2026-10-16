/**
 * Round seventy-two, reviewer F: `scripts/predeploy.mjs --tier=` (the owner's process change 4). The tiers' own runs are
 * the unit suite and the browser suite, too long for a unit test; what is tested here is what a novice typing the
 * command meets first: a tier that does not exist, and a tier with engines named beside it, are each refused with one
 * sentence that says what to type, before anything is built or run.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, ['scripts/predeploy.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
};

describe('r72f predeploy tiers', () => {
  it('a tier that does not exist is refused, naming the three there are', () => {
    const r = run('--tier=everything');
    expect(r.status).toBe(1);
    expect(r.out).toContain('there is no tier "everything"');
    expect(r.out).toContain('--tier=corpus');
    expect(r.out).toContain('--tier=app');
    expect(r.out).toContain('--tier=launch');
  });
  it('a tier with engines named beside it is refused rather than guessed at', () => {
    const r = run('--tier=corpus', '--browsers=webkit');
    expect(r.status).toBe(1);
    expect(r.out).toContain('chooses the engines itself');
  });
});
