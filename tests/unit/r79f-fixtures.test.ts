/**
 * Round seventy-nine (F): `--fixtures` writes the fixture pages under the ids they are committed under. Round seventy-
 * eight keyed pages by Kew's plant_name_id and rekeyed the committed fixtures by hand; the fixture build read no Kew
 * rows, so from an empty folder it wrote g5411106 and g5384013 where the fixtures hold k339841 and k2735933. Now it
 * reads Kew's rows for its two real species (fixtures/upstream.ts `kewRows`) with the build's own Kew fill and keys each
 * page by the rule.
 *
 * FAILED on the base: the files were g5384013.json, g5411106.json and g999.json, with no `name.kew`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const committed = (f: string) => JSON.parse(readFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), 'utf8'));

describe('--fixtures from an empty folder', () => {
  it('writes each page under its committed id, with the committed Kew record, and nothing beside the fixtures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r79f-fixtures-'));
    const r = builder(dir, '--fixtures');
    expect(r.status, r.stderr).toBe(0);
    const v3 = join(dir, 'fixtures/dossiers/s/v3');
    expect(readdirSync(v3).filter((f) => f.endsWith('.json')).sort()).toEqual(['g999.json', 'k2735933.json', 'k339841.json']);
    expect(r.stdout).toContain("fixture page ids: 2 by Kew's plant_name_id, 1 by GBIF's key; 2 dossiers written under a new id");
    for (const f of ['g999.json', 'k2735933.json', 'k339841.json']) {
      const d = JSON.parse(readFileSync(join(v3, f), 'utf8'));
      const c = committed(f);
      expect(d.key).toBe(c.key);
      expect(d.ids.gbif).toBe(c.ids.gbif);
      expect(d.name.kew).toEqual(f === 'g999.json' ? undefined : c.name.kew);
      expect(d.name.authorship).toBe(c.name.authorship);
    }
    const index = JSON.parse(readFileSync(join(dir, 'fixtures/dossiers/index.json'), 'utf8')) as Array<{ key: string; gbif: number }>;
    expect(index.map((e) => [e.key, e.gbif])).toEqual([['k2735933', 5384013], ['g999', 999], ['k339841', 5411106]]);
    // guard: no ids-gbif.txt or drops.txt left in the folder the build ran in
    expect(existsSync(join(dir, 'ids-gbif.txt'))).toBe(false);
    expect(existsSync(join(dir, 'drops.txt'))).toBe(false);
    // and a second run over what it wrote keys nothing anew
    const again = builder(dir, '--fixtures');
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('0 dossiers written under a new id');
    expect(readdirSync(v3).filter((f) => f.endsWith('.json')).sort()).toEqual(['g999.json', 'k2735933.json', 'k339841.json']);
  }, 120_000);
});
