/**
 * Round sixty, a11y-perf finding 3: the root layout imports `GrowLayer` from the `$lib/ui/grow` barrel, so every page,
 * the front page and every species page included, loads the whole grower feature set: SelectMode, PlantsFoot,
 * PhotoTimeline, the QR code, the sample's seed, and through PlantsMenu's `downloadPlantsSheet` the backup module.
 * Measured on the build at 21257b7: 71 KB raw / 29.6 KB gzip of JavaScript and 8.3 KB of CSS inlined into every page's
 * HTML that no public page uses.
 *
 * The source assertion stays here. The built layout chunk is checked by `scripts/check-bundle.mjs` at the end of every
 * build, which fails rather than skips when the build is missing or was made from other sources (round sixty-two; the
 * harness review's 3, A43): this file's manifest test skipped itself on every deploy, since `npm run deploy` tests
 * before it builds. Its own tests are tests/unit/r62h-bundle-gate.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('the root layout ships no grower feature it does not draw', () => {
  it('imports GrowLayer from its own file, not from the grow barrel', () => {
    const src = fs.readFileSync('src/routes/+layout.svelte', 'utf8');
    expect(src).not.toMatch(/from '\$lib\/ui\/grow'/);
  });
});
