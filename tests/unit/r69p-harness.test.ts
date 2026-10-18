/**
 * The harness (round sixty-nine; triage-68 P5, R46-31): the webServer's devtools port is set apart, and the engine fixes
 * of P4 stay in their specs. Failed on the base: wrangler dev ran on the default inspector port 9229, the offline specs
 * waited a fixed 15 or 20 s for the worker, the Firefox second-tab test set its tab up by `window.open`, the WebKit
 * persistence test injected its plant while the first page's collection was still opening, and the WebKit plant test
 * counted the engine's cancelled-fetch report as the page's own error.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const raw = (f: string) => readFileSync(f, 'utf8');

describe("the webServer's inspector port", () => {
  const cfg = raw('playwright.config.ts');
  it('wrangler dev is started on a devtools port of its own, never 9229, and never the server\'s', () => {
    expect(cfg).toMatch(/npx wrangler dev --port \$\{PORT\} --inspector-port \$\{INSPECTOR_PORT\} --var E2E_OFFLINE:1/);
    expect(cfg).toMatch(/const INSPECTOR_PORT = Number\(process\.env\.PW_INSPECTOR_PORT \?\? PORT \+ 5000\);/);
    const port = 4173, inspector = port + 5000;
    expect(inspector).not.toBe(9229);
    expect(inspector).not.toBe(port);
  });
});

describe('the engine fixes of P4 (IND-12, IND-13, R46-30)', () => {
  it('the offline specs wait for the worker to control the page before going offline', () => {
    expect(raw('tests/e2e/smoke-3.spec.ts')).toMatch(/await page\.goto\('\/plants'\); \/\/ lets the service worker install and precache the shells\n\s*await controlledBy\(page\);/);
    expect(raw('tests/e2e/r67h-offline.spec.ts')).toMatch(/async function workerInControl\(page: Page\) \{\n\s*await controlledBy\(page\);/);
    const helper = raw('tests/e2e/helpers/controlled.ts');
    expect(helper).toMatch(/await page\.evaluate\(\(\) => navigator\.serviceWorker\.ready\);/);
    expect(helper).toMatch(/await page\.reload\(\);/);
  });
  it('the second example tab is set up through the menu, and asserted, not by window.open', () => {
    const v = raw('tests/e2e/r67v-example.spec.ts');
    const v3 = v.slice(v.indexOf("test('r67v V3: a second example tab"), v.indexOf("test('r67v V3: a Leave answered Cancel"));
    expect(v3).not.toMatch(/window\.open\(/);
    expect(v3).toMatch(/const second = await context\.newPage\(\);[\s\S]*await second\.locator\('#menu-example'\)\.click\(\);\n\s*await expect\(second\.locator\('html\[data-demo\]'\)\)\.toBeAttached/);
  });
  it('the persistence test writes its plant only once the first page has opened its collection, and counts from no ask', () => {
    const p = raw('tests/e2e/r67p-pages.spec.ts');
    expect(p).toMatch(/await expect\(page\.locator\('main'\)\)\.not\.toContainText\('Opening your collection'[^\n]*\n\s*await inject\(page, plant\('rQ1'/);
    expect(p).toMatch(/localStorage\.removeItem\('__asks'\); localStorage\.removeItem\('cultifolio\.persistAskedAt'\);/);
  });
  it("the plant test sets aside only Safari's report of a cancelled fetch of this site's own /api/", () => {
    const l = raw('tests/e2e/r62l-plant.spec.ts');
    const re = new RegExp(/const cancelled = \(m: string\) => (\/.*\/)\.test\(m\);/.exec(l)![1].slice(1, -1));
    expect(re.test('Fetch API cannot load http://127.0.0.1:4173/api/sheets?b=0a&c=x&v=1 due to access control checks.')).toBe(true);
    // Round seventy-six: WebKit on the owner's PC wrote it without the words before the address.
    expect(re.test('/127.0.0.1:4173/api/sheets?b=03&n=32&v=1792285814243 due to access control checks.')).toBe(true);
    expect(re.test('Illegal invocation')).toBe(false);
    expect(re.test('Fetch API cannot load https://example.org/x due to access control checks.')).toBe(false);
  });
  it('the front page keeps its count on a row of its own on a phone', () => {
    expect(raw('src/lib/ui/PageHead.svelte')).toMatch(/\.phead\.compact\.countrow \.inlinecount \{ flex-basis: 100%; \}/);
    expect(raw('src/routes/+page.svelte')).toMatch(/kick=\{visitor \? 'Species reference' : 'Cultifolio'\} compact countRow count=/);
  });
});
