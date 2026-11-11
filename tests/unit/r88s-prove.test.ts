/**
 * Round eighty-eight (the speed round): scripts/dev/r88-prove.mjs, the owner's proof on real pages that the faster paths
 * write what the slow one writes. On the twelve pages of tests/unit/helpers/r88-pages.ts: the three builds agree, the
 * corpus is left as it was found, the third build reads the cache the second wrote; a page that differs is named; and a
 * proof stopped mid-build stops the next until --put-back puts its files back.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folder, N, sp } from './helpers/r88-pages';

const prove = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [resolve('scripts/dev/r88-prove.mjs'), '--args', '--offline --bulk bulk', ...args], { cwd, encoding: 'utf8' });
const raw = (dir: string) => Object.fromEntries(readdirSync(join(dir, 'static/s/v3')).sort().map((f) => [f, readFileSync(join(dir, 'static/s/v3', f), 'utf8')]));
const indexOf = (dir: string) => writeFileSync(join(dir, 'static/s/v3/index.json'), JSON.stringify(Array.from({ length: N }, (_, i) => ({ key: `k${sp(i).id}`, gbif: sp(i).gbif, name: `Begonia ${sp(i).epithet}` }))));

describe('r88s: the proof on the owner\'s PC', () => {
  it('builds three ways, finds them the same, leaves the corpus as it was, and names a page that differs', () => {
    const dir = folder();
    indexOf(dir);
    const was = raw(dir);
    const r = prove(dir, '--n', String(N));
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain(`A and B (eight at once against one at a time): the same, ${N} of ${N} pages`);
    expect(r.stdout).toContain(`B and C (the cache read against the files read): the same, ${N} of ${N} pages`);
    // B wrote the cache and C read it; A read the files.
    const [, a, b, c] = r.stdout.split(/\n[ABC]: npm run dossier/);
    expect(a).not.toContain('bulk cache');
    expect(b).toContain('kept in the bulk cache');
    expect(c).toContain('GBIF occurrences from the bulk cache');
    expect(raw(dir)).toEqual(was);
    // A page of C changed by hand: the comparison alone names it, and where it parts.
    const p = join(dir, 'r88-prove/C', `k${sp(3).id}.json`);
    const d = JSON.parse(readFileSync(p, 'utf8'));
    d.name.scientific = 'Begonia altered';
    writeFileSync(p, JSON.stringify(d));
    const again = prove(dir, '--compare');
    expect(again.status).toBe(1);
    expect(again.stdout).toContain(`B and C (the cache read against the files read): 1 of ${N} pages DIFFER:`);
    expect(again.stdout).toMatch(new RegExp(`k${sp(3).id} Begonia ${sp(3).epithet}: \\.name\\.scientific: "Begonia ${sp(3).epithet}" / "Begonia altered"`));
    expect(readFileSync(join(dir, 'r88-prove/result.txt'), 'utf8')).toContain('DIFFER');
  }, 300_000);

  it('a proof stopped mid-build: the next refuses, and --put-back puts its files back', () => {
    const dir = folder();
    indexOf(dir);
    const was = raw(dir);
    const first = prove(dir, '--n', String(N));
    expect(first.status, first.stderr + first.stdout).toBe(0);
    expect(existsSync(join(dir, 'r88-prove/before/kept.json'))).toBe(false);
    // As a PC restarted during a build leaves it: kept.json still there, two pages and the index as the build wrote them,
    // and a list the build made.
    writeFileSync(join(dir, 'r88-prove/before/kept.json'), JSON.stringify([
      ...[1, 7].map((i, j) => ({ path: join('static/s/v3', `k${sp(i).id}.json`), copy: `p${j}`, was: true })),
      { path: join('static/s/v3', 'index.json'), copy: 'ix', was: true },
      { path: 'drops.txt', was: false },
    ]));
    for (const [i, j] of [[1, 0], [7, 1]]) {
      writeFileSync(join(dir, 'r88-prove/before', `p${j}`), was[`k${sp(i).id}.json`]);
      writeFileSync(join(dir, 'static/s/v3', `k${sp(i).id}.json`), readFileSync(join(dir, 'r88-prove/B', `k${sp(i).id}.json`)));
    }
    writeFileSync(join(dir, 'r88-prove/before/ix'), was['index.json']);
    writeFileSync(join(dir, 'static/s/v3/index.json'), '[]');
    writeFileSync(join(dir, 'drops.txt'), 'a drop\n');
    expect(raw(dir)).not.toEqual(was);
    const refused = prove(dir, '--n', String(N));
    expect(refused.status).toBe(2);
    expect(refused.stderr).toMatch(/did not finish: .*kept\.json names the files it kept\. If nothing has run since, run this again with --put-back/);
    expect(raw(dir)).not.toEqual(was);
    const back = prove(dir, '--put-back');
    expect(back.status, back.stderr + back.stdout).toBe(0);
    expect(back.stdout).toMatch(/files put back from r88-prove\/before/);
    expect(raw(dir)).toEqual(was);
    expect(existsSync(join(dir, 'drops.txt'))).toBe(false);
    expect(existsSync(join(dir, 'r88-prove/before/kept.json'))).toBe(false);
  }, 300_000);
});
