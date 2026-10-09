/**
 * Round sixty-two, agent H (triage decision 10; the harness review's 3, outside reviews A43 and B): the bundle gate is
 * `scripts/check-bundle.mjs`, run at the end of every build, and it fails rather than skips.
 *
 * The script runs here in a scratch directory holding a made-up build (a manifest whose root layout chunk imports what
 * each case says) and a made-up src/, so the cases do not need a real build:
 * - no manifest: fails (a fresh clone, or a deploy that never built);
 * - a build that recorded other sources than the ones now there: fails (a checkout changed under an old build,
 *   including one restored with old mtimes: contents are compared, not times);
 * - no record of its sources: fails;
 * - a layout closure that reaches `backup` or `grow`: fails, even freshly built;
 * - a fresh build of a clean layout: passes.
 * And the wiring: `npm run build` runs attach-do.mjs after `vite build`, and attach-do.mjs runs the gate, recording first.
 * (Adapted from docs/review-61/tests/harness--deploy-bundle.test.ts, which looked for the gate in package.json's own
 * `build`; package.json is not this round's to change, and attach-do.mjs already ends every build.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = path.resolve('scripts/check-bundle.mjs');
let dir = '';
const run = (...args: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const write = (p: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); };
/** A manifest whose root layout (nodes/0.js) imports `a`, which imports the named module. */
const manifest = (inner: string) => write('.svelte-kit/output/client/.vite/manifest.json', JSON.stringify({
  '.svelte-kit/generated/client-optimized/nodes/0.js': { file: 'n0.js', name: 'nodes/0', imports: ['_a.js'] },
  '_a.js': { file: 'a.js', name: 'a', imports: [`_${inner}.js`] },
  [`_${inner}.js`]: { file: `${inner}.js`, name: inner },
  '_backup.js': { file: 'backup.js', name: 'backup' } // in the build, but not reached from the layout: allowed
}));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r62h-bundle-'));
  write('src/routes/+layout.svelte', '<slot />\n');
  write('src/lib/a.ts', 'export const a = 1;\n');
  write('svelte.config.js', 'export default {};\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('scripts/check-bundle.mjs', () => {
  it('fails when there is no build at all', () => {
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/manifest\.json is missing/);
  });
  it('passes on a fresh build of a clean layout, and fails once a source changes under it', () => {
    manifest('theme');
    expect(run('--record').code).toBe(0); // what the build does
    expect(run().code).toBe(0); // and a later check of the same sources
    write('src/lib/a.ts', 'export const a = 2;\n');
    const stale = run();
    expect(stale.code).toBe(1);
    expect(stale.out).toMatch(/made from other sources/);
    write('src/lib/a.ts', 'export const a = 1;\n');
    expect(run().code).toBe(0); // the same contents again: the same build
  });
  it('compares contents, not times: a source restored with an old mtime is still seen', () => {
    manifest('theme');
    expect(run('--record').code).toBe(0);
    write('src/lib/a.ts', 'export const a = 3;\n');
    fs.utimesSync(path.join(dir, 'src/lib/a.ts'), new Date(2001, 0, 1), new Date(2001, 0, 1));
    expect(run().code).toBe(1);
  });
  it('a change to what shapes the bundle beside src/ (svelte.config.js) is a change of sources', () => {
    manifest('theme');
    expect(run('--record').code).toBe(0);
    write('svelte.config.js', 'export default { kit: {} };\n');
    expect(run().code).toBe(1);
  });
  it('fails when the build did not record its sources', () => {
    manifest('theme');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/build-sources\.json is missing/);
  });
  it('fails, even freshly built, when the layout reaches the backup module or the grow barrel', () => {
    for (const bad of ['backup', 'grow']) {
      manifest(bad);
      const r = run('--record');
      expect(r.code).toBe(1);
      expect(r.out).toContain(`imports "${bad}"`);
    }
  });
});

it('every build runs the gate: `npm run build` ends with attach-do.mjs, and attach-do.mjs runs check-bundle.mjs --record', () => {
  const { build } = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  expect(build).toMatch(/vite build\s*&&\s*node scripts\/attach-do\.mjs\s*$/);
  const attach = fs.readFileSync('scripts/attach-do.mjs', 'utf8');
  expect(attach).toMatch(/spawnSync\(process\.execPath, \['scripts\/check-bundle\.mjs', '--record'\]/);
  expect(attach).toMatch(/if \(gate\.status !== 0\) process\.exit/);
});
