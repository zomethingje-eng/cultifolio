/**
 * Round seventy-two (reviewer D, the dry run): a dossier cut off mid-write (a Ctrl-C, a crash) was skipped by the scan
 * without a word, so `--index` wrote an index, products and a manifest one species short, exit 0, ready to upload
 * (D-work/trunc: four files, an index of three). Now `--index` says which file, exits 1, and leaves the index, the
 * products and the manifest as they were. Runs the script itself on fixture dossiers in a folder of its own. FAILED on
 * r72base.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve('.');
const index = (cwd: string) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), '--index'], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

describe('--index and a dossier it cannot read', () => {
  it('names the file, exits 1, and writes no index, products or manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r72d-index-'));
    const v2 = join(dir, 'static/s/v3');
    mkdirSync(v2, { recursive: true });
    const files = readdirSync(join(ROOT, 'fixtures/dossiers/s/v3')).filter((f) => /^[kg]\d+\.json$/.test(f));
    for (const f of files) copyFileSync(join(ROOT, 'fixtures/dossiers/s/v3', f), join(v2, f));
    // A write-then-rename a stopped run left half done: the temporary file goes, the dossier it was replacing stays.
    writeFileSync(join(v2, `${files[0]}.4242.tmp`), '{"cut');
    const first = index(dir);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('1 temporary file a stopped run left deleted');
    expect(readdirSync(v2).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    const manifest = readFileSync(join(v2, 'manifest.json'), 'utf8');
    expect(JSON.parse(readFileSync(join(v2, 'index.json'), 'utf8'))).toHaveLength(files.length);
    // One dossier cut off as a killed write leaves it.
    const cut = files[0];
    writeFileSync(join(v2, cut), readFileSync(join(v2, cut), 'utf8').slice(0, 300));
    const second = index(dir);
    expect(second.status).toBe(1); // r72base: 0
    expect(second.stderr).toContain(`1 dossier on disk could not be read: ${cut}. Do not upload`);
    expect(JSON.parse(readFileSync(join(v2, 'index.json'), 'utf8'))).toHaveLength(files.length); // r72base: one fewer
    expect(readFileSync(join(v2, 'manifest.json'), 'utf8')).toBe(manifest);
    expect(existsSync(join(v2, 'manifest.prev.json'))).toBe(false);
  }, 120_000);
});
