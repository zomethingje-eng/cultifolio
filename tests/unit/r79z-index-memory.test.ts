/**
 * Round seventy-nine (Z): `--index` at the full list's size. At 48,368 dossiers (about 2 GB of JSON) the index held every
 * dossier whole while it marked the photographs two pages share, and every page's photographs while it read the tiles:
 * gigabytes, which the review's machine could not give it (killed at 1.1 GB). It now holds what each rule reads (names,
 * and the identities of the photographs shown) and reads a file again when it needs it, so its memory no longer grows
 * with the dossiers' size. Here 400 dossiers of 250 KB (100 MB, most of it in their photographs) are indexed in a heap
 * that cannot hold them: FAILED on the base (out of memory), and the index is the one a heap that holds them writes.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slugify } from '$core/names';

const ROOT = resolve('.');
const builder = (cwd: string, heapMB: number, ...args: string[]) => spawnSync(process.execPath, [`--max-old-space-size=${heapMB}`, '--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

const N = 400, PHOTOS = 100, PAD = 2400;
const letters = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s; return s; };
function corpus(dir: string) {
  const v3 = join(dir, 'static/s/v3');
  mkdirSync(v3, { recursive: true });
  const base = JSON.parse(readFileSync(join(ROOT, 'fixtures/dossiers/s/v3/k2735933.json'), 'utf8'));
  for (let i = 0; i < N; i++) {
    const d = structuredClone(base);
    const name = `Copiapoa ${letters(i)}ensis`;
    d.key = `k${3_000_000 + i}`;
    d.slug = slugify(name);
    d.name.scientific = name;
    d.name.kew = { ...d.name.kew, entry: String(3_000_000 + i) };
    d.ids = { ...d.ids, gbif: 90_000_000 + i };
    delete d.changed;
    const p0 = base.photos.find((p: { src: string }) => p.src === 'inat');
    d.photos = Array.from({ length: PHOTOS }, (_, j) => {
      const id = String(700_000_000 + i * PHOTOS + j);
      return { ...p0, id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpeg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/medium.jpeg`, page: `https://www.inaturalist.org/observations/${id}`, pad: 'x'.repeat(PAD) };
    });
    writeFileSync(join(v3, `${d.key}.json`), JSON.stringify(d));
  }
}

describe('--index at full size (round seventy-nine)', () => {
  it('indexes 100 MB of dossiers in a heap that cannot hold them, and writes the same index as one that can', () => {
    const small = mkdtempSync(join(tmpdir(), 'r79z-mem-')), big = mkdtempSync(join(tmpdir(), 'r79z-mem-'));
    try {
      corpus(small); corpus(big);
      const roomy = builder(big, 2048, '--index');
      expect(roomy.status, roomy.stderr).toBe(0);
      const r = builder(small, 128, '--index');
      expect(r.status, r.stderr.slice(-600)).toBe(0);
      expect(r.stdout).toContain(`index: ${N} species`);
      expect(readFileSync(join(small, 'static/s/v3/index.json'), 'utf8')).toBe(readFileSync(join(big, 'static/s/v3/index.json'), 'utf8'));
    } finally {
      rmSync(small, { recursive: true, force: true });
      rmSync(big, { recursive: true, force: true });
    }
  }, 240_000);
});
