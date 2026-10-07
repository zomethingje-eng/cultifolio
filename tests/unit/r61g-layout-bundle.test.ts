/**
 * Round sixty, a11y-perf finding 3: the root layout imports `GrowLayer` from the `$lib/ui/grow` barrel, so every page,
 * the front page and every species page included, loads the whole grower feature set: SelectMode, PlantsFoot,
 * PhotoTimeline, the QR code, the sample's seed, and through PlantsMenu's `downloadPlantsSheet` the backup module.
 * Measured on the build at 21257b7: 71 KB raw / 29.6 KB gzip of JavaScript and 8.3 KB of CSS inlined into every page's
 * HTML that no public page uses.
 *
 * FAILS on current code (both assertions). Run: copy to tests/unit/ and `npx vitest run tests/unit/a11y-perf--layout-bundle.test.ts`.
 * The second test reads the last build's manifest and is skipped when there is none, or when it is older than the sources.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the root layout ships no grower feature it does not draw', () => {
  it('imports GrowLayer from its own file, not from the grow barrel', () => {
    const src = fs.readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(src).not.toMatch(/from '\$lib\/ui\/grow'/);
  });
  const manifest = '.svelte-kit/output/client/.vite/manifest.json';
  // Only a build made from the sources as they are now says anything about them: `npm run deploy` runs the tests before it
  // builds, and on a checkout that last built an older round the manifest is that round's (failed the first deploy of round
  // sixty-one, with the old layout's backup import). A build older than any source file is skipped.
  const newest = (dir: string): number => fs.readdirSync(dir, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(`${dir}/${e.name}`) : fs.statSync(`${dir}/${e.name}`).mtimeMs), 0);
  const fresh = fs.existsSync(manifest) && fs.statSync(manifest).mtimeMs >= newest('src');
  it.skipIf(!fresh)('the layout chunk does not import the backup module (on a build of the current sources)', () => {
    const m = JSON.parse(fs.readFileSync(manifest, 'utf8')) as Record<string, { file: string; name?: string; imports?: string[] }>;
    const closure = (k: string, seen = new Set<string>()): Set<string> => { if (seen.has(k)) return seen; seen.add(k); for (const i of m[k]?.imports ?? []) closure(i, seen); return seen; };
    const layout = Object.keys(m).find((k) => /nodes\/0\.js$/.test(k))!;
    const names = [...closure(layout)].map((k) => m[k].name ?? '');
    expect(names).not.toContain('backup');
    expect(names).not.toContain('grow');
  });
});
