/**
 * Round seventy-eight (I): the builder itself, run on the fixture's dossiers in a folder of its own. `--rekey` writes the
 * version 2 corpus (`static/s/v2/<GBIF key>.json`) as version 3 under each page's id, with the genus records, the
 * index, the products and the manifest, says how many pages took Kew's id and lists the rest in ids-gbif.txt, and leaves
 * the version 2 folder as it was; a second `--index` changes nothing; the index names each page by id and by GBIF key.
 * FAILED on the base (no `--rekey`; version 2).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const md5s = (dir: string) => readdirSync(dir, { recursive: true }).map(String).sort().filter((f) => !f.endsWith('/')).map((f) => { try { return `${f} ${createHash('md5').update(readFileSync(join(dir, f))).digest('hex')}`; } catch { return f; } });

describe('--rekey on the fixture corpus written as version 2', () => {
  it('writes version 3 under the ids, leaves version 2 alone, and a second --index changes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r78i-build-'));
    const v2 = join(dir, 'static/s/v2'), v3 = join(dir, 'static/s/v3');
    mkdirSync(join(v2, 'g'), { recursive: true });
    // The fixture's dossiers as round seventy-seven's corpus held them: version 2, named and keyed by GBIF key.
    for (const f of readdirSync(join(ROOT, 'fixtures/dossiers/s/v3')).filter((x) => x.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), 'utf8'));
      // Version 2 had no page without a GBIF key (round seventy-nine's fixture, k457911, is not one of its pages).
      if (d.ids.gbif == null) continue;
      writeFileSync(join(v2, `${d.ids.gbif}.json`), JSON.stringify({ ...d, v: 2, key: d.ids.gbif }));
    }
    for (const f of readdirSync(join(ROOT, 'fixtures/dossiers/s/v3/g'))) copyFileSync(join(ROOT, 'fixtures/dossiers/s/v3/g', f), join(v2, 'g', f));
    const before = md5s(v2);
    const r = builder(dir, '--rekey');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("page ids: 3 by Kew's plant_name_id, 1 by GBIF's key (ids-gbif.txt says why); 4 dossiers written under a new id");
    expect(r.stdout).toContain('3 genus records copied to static/s/v3/g');
    expect(r.stdout).toContain('index: 4 species');
    expect(readdirSync(v3).filter((f) => f.endsWith('.json')).sort()).toEqual(['g999.json', 'index.json', 'k2735933.json', 'k2735990.json', 'k339841.json', 'manifest.json']);
    expect(readFileSync(join(dir, 'ids-gbif.txt'), 'utf8')).toBe("g999\tRefusia testii\tKew's file not read for this page (--fill kew-names)\n");
    const index = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<{ key: string; gbif: number; near?: string[] }>;
    expect(index.map((e) => [e.key, e.gbif])).toEqual([['k2735933', 5384013], ['k2735990', 5384999], ['g999', 999], ['k339841', 5411106]]);
    expect(JSON.parse(readFileSync(join(v3, 'manifest.json'), 'utf8')).v).toBe(3);
    expect(md5s(v2)).toEqual(before);
    const first = md5s(v3);
    // Round eighty-one: an index of unchanged files is not written again (`index-stamp.ts`); without its stamp it is, and
    // this asks that the writing itself changes nothing.
    rmSync(join(dir, 'cache/index-stamp.json'), { force: true });
    const again = builder(dir, '--index');
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('0 dossiers written under a new id');
    expect(again.stdout).toMatch(/0 files written, \d+ already on disk under their hash, 0 of older corpora deleted\); unchanged/);
    expect(md5s(v3)).toEqual(first);
    // Run again, --rekey does not copy over a version 3 corpus: it keys what is there by the rule.
    const third = builder(dir, '--rekey');
    expect(third.stdout).toContain('already holds dossiers: nothing is copied from static/s/v2');
    expect(md5s(v3)).toEqual(first);
  }, 120_000);
});
