/**
 * Harness review of round sixty-one: the bundle guard must run on the build that is deployed.
 *
 * `tests/unit/r61g-layout-bundle.test.ts` reads `.svelte-kit/output/client/.vite/manifest.json` and, since the first deploy
 * of round sixty-one, skips itself when that build is older than any file under src/. `npm run deploy` is
 * `check && test && build && wrangler deploy`: the tests run before the build, so on a checkout whose sources changed
 * since its last build the guard always skips, and a layout that pulls the backup module (or the grow barrel) back into
 * every page would be deployed unnoticed.
 *
 * The proposed fix: the manifest check moves into `scripts/check-bundle.mjs` (plain Node, so it runs the same on Windows,
 * where `VAR=1 cmd` does not), chained at the end of `npm run build`. Every build then checks itself: the deploy's, the
 * e2e webServer's, and a developer's. The unit test keeps the source assertion and may keep the skipping manifest one.
 * This guard accepts either that or a deploy script that runs the bundle test after the build and before `wrangler deploy`.
 *
 * FAILS on f4ab4f8. Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--deploy-bundle.test.ts`.
 */
import { it, expect } from 'vitest';
import fs from 'node:fs';

it('every path to a deploy checks the bundle of the build it deploys', () => {
  const { build, deploy } = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const inBuild = /vite build.*&&\s*node scripts\/check-bundle\.mjs/.test(build) && fs.existsSync('scripts/check-bundle.mjs');
  const b = deploy.indexOf('npm run build');
  const t = deploy.search(/r61g-layout-bundle|check-bundle/);
  const inDeploy = b > -1 && t > b && t < deploy.indexOf('wrangler deploy');
  expect(inBuild || inDeploy).toBe(true);
});
