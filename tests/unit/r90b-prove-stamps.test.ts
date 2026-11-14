/**
 * Round ninety: the round 88 proof (scripts/dev/r88-prove.mjs) checks, before it builds, that no page outside its sample
 * has changed since its last stamp. Each build writes the index at its end, and the index stamps such a page (a fill
 * since the last index): a file outside the sample changed, which the proof cannot put back, so it stopped after its
 * first build. On the owner's PC on 13 November 2026 that was an hour in, on the 2,769 pages the flowering fill wrote
 * that evening.
 *
 * On bf1a176: FAILED. The proof built A (one at a time) before it noticed, then stopped with exit 1, "A changed 1
 * file(s) in static/s/v3 outside the sample"; now it refuses at once (exit 2), builds nothing, names the page and says to
 * write the index first. A corpus whose stamps hold still proves as before.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { restamp } from '../../src/lib/dossier/changed';
import { folder, N, sp } from './helpers/r88-pages';

const prove = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [resolve('scripts/dev/r88-prove.mjs'), '--args', '--offline --bulk bulk', ...args], { cwd, encoding: 'utf8' });
const raw = (dir: string) => Object.fromEntries(readdirSync(join(dir, 'static/s/v3')).sort().map((f) => [f, readFileSync(join(dir, 'static/s/v3', f), 'utf8')]));
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const page = (dir: string, i: number) => join(dir, 'static/s/v3', `k${sp(i).id}.json`);

/** The twelve pages, each stamped as the index stamps them (its own hash, the builder's sha1), and the index of them. */
function stamped(): string {
  const dir = folder();
  writeFileSync(join(dir, 'static/s/v3/index.json'), JSON.stringify(Array.from({ length: N }, (_, i) => ({ key: `k${sp(i).id}`, gbif: sp(i).gbif, name: `Begonia ${sp(i).epithet}` }))));
  for (let i = 0; i < N; i++) {
    const d = JSON.parse(readFileSync(page(dir, i), 'utf8'));
    d.changed = restamp({ ...d, changed: undefined }, '2026-11-01', sha1);
    writeFileSync(page(dir, i), JSON.stringify(d));
  }
  return dir;
}

describe('r90b: the proof checks the stamps before it builds', () => {
  // --n 6 of 12: every second page, so page 1 is outside the sample.
  it('a page outside the sample changed since its stamp: refused at once, nothing built, the page named, the index said', () => {
    const dir = stamped();
    const d = JSON.parse(readFileSync(page(dir, 1), 'utf8'));
    d.name.scientific = 'Begonia filled'; // as a fill leaves a page: its content moved, its stamp not
    writeFileSync(page(dir, 1), JSON.stringify(d));
    const was = raw(dir);
    const r = prove(dir, '--n', '6');
    expect(r.status, r.stderr + r.stdout).toBe(2);
    expect(r.stderr).toContain(`1 page outside the sample changed since its last stamp (k${sp(1).id}.json): a fill wrote it after the index was last written.`);
    expect(r.stderr).toContain('npm run dossier -- --index; then run this again. Nothing was built.');
    expect(r.stdout).not.toMatch(/\nA: npm run dossier/); // base: A built, an hour on the PC, then exit 1
    expect(raw(dir)).toEqual(was);
    expect(existsSync(join(dir, 'r88-prove/before/kept.json'))).toBe(false);
  }, 120_000);

  it('guard: the same corpus with every stamp holding proves as before, the page outside the sample untouched', () => {
    const dir = stamped();
    const was = raw(dir);
    const r = prove(dir, '--n', '6');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('A and B (eight at once against one at a time): the same, 6 of 6 pages');
    expect(raw(dir)).toEqual(was);
  }, 300_000);
});
