/**
 * Round sixty-nine, agent P (triage-68 P4, IND-13): the fixture home at 390 px moved by a line in Firefox when the web
 * fonts arrived, because the count beside the title fitted on the title's line in one face and not in the other. The
 * count now has a row of its own on a phone, whatever the face, so nothing under it depends on the face's width. Failed
 * on the base: the fixture's count sat on the title's line.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/**
 * Round eighty-seven (plan D1, DESIGN-87): the visitor's front page leads with one figure, not a title and a count; the
 * count is in the plain facts under it. What IND-13 asked of the head is asked of the lead: its sentence wraps at the same
 * words in a narrower and a wider face and in the fallback faces, so what follows it does not move a line.
 */
async function leadLines(p: Page) {
  return p.locator('section.lead h1').evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
}

test('r69p P4: at 390 px the front page\'s lead is as many lines in a narrow face, a wide one and the fallback faces alike (IND-13)', async ({ browser, baseURL }) => {
  const lines: Record<string, number> = {};
  for (const face of ['web', 'narrow', 'wide', 'fallback'] as const) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block' });
    if (face === 'fallback') await ctx.route(/\.woff2(\?|$)/, (r) => r.abort()); // the site's own files never arrive
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    if (face === 'narrow' || face === 'wide') await page.addStyleTag({ content: `section.lead h1 { letter-spacing: ${face === 'narrow' ? '-0.01em' : '0.01em'}; }` });
    lines[face] = await leadLines(page);
    await ctx.close();
  }
  expect(new Set(Object.values(lines)).size, JSON.stringify(lines)).toBe(1);
});

test('r69p P4: what follows the head starts where it did whichever faces are in use (IND-13)', async ({ browser, baseURL }) => {
  const ys: number[] = [];
  for (const fonts of ['web', 'fallback'] as const) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block' });
    if (fonts === 'fallback') await ctx.route(/\.woff2(\?|$)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    if (fonts === 'web') await page.evaluate(() => document.fonts.ready);
    const box = (await page.locator('main section.lead').boundingBox())!;
    ys.push(box.y + box.height); // where what follows the head starts
    await ctx.close();
  }
  // The faces are scaled to the same average width, not the same height: a few pixels, never a line.
  expect(Math.abs(ys[0] - ys[1])).toBeLessThan(8);
});
