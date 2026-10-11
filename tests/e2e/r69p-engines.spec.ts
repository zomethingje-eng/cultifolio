/**
 * Round sixty-nine, agent P (triage-68 P4, IND-13): the fixture home at 390 px moved by a line in Firefox when the web
 * fonts arrived, because the count beside the title fitted on the title's line in one face and not in the other. The
 * count now has a row of its own on a phone, whatever the face, so nothing under it depends on the face's width. Failed
 * on the base: the fixture's count sat on the title's line.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

/** The title's and the count's boxes on the visitor's front page. */
async function head(p: Page) {
  const h1 = await p.locator('.phead h1').boundingBox();
  const count = await p.locator('.phead .inlinecount').boundingBox();
  return { h1: h1!, count: count! };
}

test('r69p P4: at 390 px the front page\'s count sits under its title in a narrow face, a wide one and the fallback faces alike (IND-13)', async ({ browser, baseURL }) => {
  // A face a little narrower or wider than the web face stands in for an engine's own metrics: the fixture's count fitted
  // on the title's line in one and not in the other, which is what moved Firefox's page by a line.
  for (const face of ['narrow', 'wide', 'fallback'] as const) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block' });
    if (face === 'fallback') await ctx.route(/\.woff2(\?|$)/, (r) => r.abort()); // the site's own files never arrive
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    if (face !== 'fallback') await page.addStyleTag({ content: `.phead .inlinecount { letter-spacing: ${face === 'narrow' ? '-0.06em' : '0.04em'}; }` });
    const { h1, count } = await head(page);
    expect(count.y, `${face}: the count is under the title, on a row of its own`).toBeGreaterThanOrEqual(h1.y + h1.height - 1);
    expect(count.x, `${face}: and starts the row`).toBeLessThanOrEqual(h1.x + 1);
    await ctx.close();
  }
});

test('r69p P4: what follows the head starts where it did whichever faces are in use (IND-13)', async ({ browser, baseURL }) => {
  const ys: number[] = [];
  for (const fonts of ['web', 'fallback'] as const) {
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block' });
    if (fonts === 'fallback') await ctx.route(/\.woff2(\?|$)/, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    if (fonts === 'web') await page.evaluate(() => document.fonts.ready);
    const box = (await page.locator('main .phead').boundingBox())!;
    ys.push(box.y + box.height); // where what follows the head starts
    await ctx.close();
  }
  // The faces are scaled to the same average width, not the same height: a few pixels, never a line.
  expect(Math.abs(ys[0] - ys[1])).toBeLessThan(8);
});
