// Round eighty-nine: what a predeploy proved, kept for the deploy after it (the owner's decision of 12 November 2026).
// `npm run deploy` ran svelte-check and the whole unit suite again, about fifteen minutes, on code the predeploy had just
// passed. A predeploy run with a tier (`--tier=corpus`, `app` or `launch`), every test passing, writes .predeploy-stamp.json:
// the code it ran on, by `treeMark`, and what it ran. `node scripts/deploy.mjs` then runs only what the stamp does not
// cover for exactly that code: one byte changed anywhere outside the corpus and ignored files, and it runs everything,
// as `npm run deploy` does. The build, the upload and the live check always run.
//
// Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STAMP = '.predeploy-stamp.json';

/**
 * The code a run ran on: the commit, and every file that differs from it, tracked or not (git's ignored files aside, and
 * so the corpus, static/s/), by its content. Two marks are the same only when every such file is the same.
 * @param {string} root @param {(args: string[]) => string} [git]
 */
export function treeMark(root = '.', git = (args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) {
  const head = git(['rev-parse', 'HEAD']).trim();
  const changed = git(['diff', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
  const h = createHash('sha1');
  h.update(`head ${head}\n`);
  for (const f of [...new Set([...changed, ...untracked])].sort()) {
    // The stamp itself and the predeploy's own output are not the code.
    if (f === STAMP) continue;
    const p = join(root, f);
    h.update(`file ${f}\n`);
    h.update(existsSync(p) ? readFileSync(p) : Buffer.from('(deleted)'));
    h.update('\n');
  }
  return h.digest('hex');
}

/** The stamp a passing predeploy writes. @param {string} root @param {{ mark: string, unit: boolean, check: boolean, tier: string }} s */
export function writeStamp(root, s) {
  writeFileSync(join(root, STAMP), JSON.stringify({ ...s, at: new Date().toISOString() }, null, 1) + '\n');
}

/** @param {string} root */
export function readStamp(root) {
  try { return JSON.parse(readFileSync(join(root, STAMP), 'utf8')); } catch { return null; }
}

/**
 * What a deploy runs before the build: svelte-check and the unit tests, each left out only when the stamp says a
 * predeploy ran it, passing, on this very code. With the sentence that says why.
 * @param {{ mark?: string, unit?: boolean, check?: boolean, tier?: string, at?: string } | null} stamp @param {string} mark
 */
export function deploySteps(stamp, mark) {
  const same = !!stamp && stamp.mark === mark;
  const check = !(same && stamp.check);
  const unit = !(same && stamp.unit);
  const why = !stamp
    ? 'no predeploy stamp: svelte-check and the unit tests run first'
    : !same
      ? `the code differs from what the predeploy of ${stamp.at ?? 'a time not recorded'} passed: svelte-check and the unit tests run first`
      : `the predeploy of ${stamp.at} (--tier=${stamp.tier}) passed ${[stamp.check ? 'svelte-check' : '', stamp.unit ? 'the unit tests' : ''].filter(Boolean).join(' and ') || 'neither'} on this very code: ${[check ? 'svelte-check' : '', unit ? 'the unit tests' : ''].filter(Boolean).join(' and ') || 'nothing'} run${check && unit ? '' : 's'} first`;
  return { check, unit, why };
}
