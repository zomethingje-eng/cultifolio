/**
 * Round eighty-three, agent P: the dependency delivery (round eighty-one's review C4).
 *   - The lock holds the versions that clear the advisories `npm audit` named on 2026-10-29: devalue 5.9.4 (in the Worker),
 *     vite 8.3.3 or later, vitest and @vitest/mocker 5.0.3 or later, wrangler 4.153.0 or later (its miniflare pins undici
 *     7.30.1 and sharp 0.35.5), source-map-js 1.2.2.
 *   - package.json's ranges are unchanged by it (the owner's decision: the lock alone).
 *   - The installed tree is the lock's: a zip extracted without `npm ci` leaves the old node_modules, and this says so
 *     before the browser suite and the deploy run on it.
 * The first FAILED on r83b (devalue 5.9.2, wrangler 4.143.0, undici 7.29.0, ...); the second and third are guards (on r83b
 * the tree there matched its own lock).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>;
};
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};

/** Numeric parts of a version, its pre-release dropped (enough for the floors below). */
function parts(v: string): number[] {
  return v.split('-')[0].split('.').map(Number);
}
function atLeast(v: string, floor: string): boolean {
  const a = parts(v), b = parts(floor);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

const floors: Record<string, string> = {
  devalue: '5.9.4',
  vite: '8.3.3',
  vitest: '5.0.3',
  '@vitest/mocker': '5.0.3',
  wrangler: '4.153.0',
  undici: '7.30.1',
  sharp: '0.35.5',
  'source-map-js': '1.2.2'
};

describe('r83p the dependency delivery', () => {
  it('the lock holds a version past every advisory of 2026-10-29 that a version within the ranges fixes', () => {
    const low: string[] = [];
    for (const [name, floor] of Object.entries(floors)) {
      const v = lock.packages[`node_modules/${name}`]?.version;
      if (!v || !atLeast(v, floor)) low.push(`${name} ${v ?? 'missing'} (needs ${floor})`);
    }
    expect(low).toEqual([]);
  });

  it("package.json's ranges are the ones before the delivery", () => {
    expect(pkg.devDependencies).toMatchObject({
      vite: '^8.3.0',
      vitest: '^5.0.0',
      wrangler: '^4.143.0',
      '@sveltejs/kit': '^2.70.3',
      svelte: '^5.57.0'
    });
  });

  it('the installed packages are the lock\'s (run npm ci after a delivery that changes the lock)', () => {
    const stale: string[] = [];
    for (const name of Object.keys(floors)) {
      const want = lock.packages[`node_modules/${name}`]?.version;
      let have = 'not installed';
      try {
        have = JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;
      } catch {
        /* reported below */
      }
      if (have !== want) stale.push(`${name}: installed ${have}, the lock says ${want}`);
    }
    expect(stale, 'node_modules is not the lock\'s tree: run npm ci').toEqual([]);
  });
});
