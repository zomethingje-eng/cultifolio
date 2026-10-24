/**
 * Round eighty-two (O): the content security policy with `object-src 'none'` (the independent review's 33), on the
 * site's own pages.
 *
 * 1. Every kind of page (the front page, a species page, Compare, the about pages, the offline page, the collection's
 *    pages, Settings) loads under the policy with nothing refused: no script, style, font, image or worker blocked. A
 *    refusal is caught in the page (`securitypolicyviolation`) and in the console, and the test fails on either.
 * 2. The policy every rendered page and every prerendered page carries says `object-src 'none'`.
 *
 * The service worker is blocked, so each page is the server's own answer in every engine.
 *
 * On r82base: 2 FAILED (no object-src); 1 passed (it guards that the stricter policy blocks nothing the pages use).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

const PAGES = ['/', '/species/copiapoa-cinerea', '/compare?s=copiapoa-cinerea,aloe-vera', '/about', '/about/how', '/about/formats', '/offline', '/plants', '/plants/new', '/today', '/settings', '/backup', '/sync', '/labels', '/places', '/propagation'];

test('r82o csp 1: every kind of page loads under the policy with nothing refused @phone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    (window as unknown as { __refused: string[] }).__refused = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __refused: string[] }).__refused.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  const said: string[] = [];
  page.on('console', (m) => { if (/content security policy/i.test(m.text())) said.push(m.text()); });
  for (const path of PAGES) {
    await page.goto(path); await ready(page);
    // A moment for what loads after hydration (fonts, images, the lazy chunks of the page).
    await page.waitForLoadState('load');
    const refused = await page.evaluate(() => (window as unknown as { __refused: string[] }).__refused);
    expect(refused, path).toEqual([]);
  }
  expect(said).toEqual([]);
});

test("r82o csp 2: the policy of a rendered page and of a prerendered one says object-src 'none'", async ({ page, request }) => {
  const rendered = await request.get('/species/copiapoa-cinerea');
  expect(rendered.headers()['content-security-policy']).toMatch(/(^|;)\s*object-src 'none'/);
  // A prerendered page carries its policy in a meta tag.
  await page.goto('/about/how');
  const meta = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content');
  expect(meta ?? '').toMatch(/(^|;)\s*object-src 'none'/);
});
