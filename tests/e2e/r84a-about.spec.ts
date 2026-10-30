/**
 * Round eighty-four (A): the about pages for a grower, in the browser.
 *
 *  1. (S4, A18) /about/how says the reference's counts as the site serves them now (`/api/counts`), and, when that does not
 *     answer, the counts of the day the page was built, said as that day's.
 *  2. (S5, A19) Each page is read as a summary and lists: at 320, 375 and 430 px no page is wider than the screen, the
 *     sources' table stacks into blocks on a phone, and every section's summary is on screen above its rules.
 *  3. The long technical lists open when asked, and print opens them.
 *
 * The worker is blocked so the route answers here; every wait is for a state, never a time, so each holds in WebKit and
 * Firefox. On r84base: 1 FAILED (no counts line), 2 FAILED (no table, no summaries; the page's paragraphs were whole),
 * 3 FAILED (no such lists).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('r84a about 1: the counts are the reference\'s now, and the dated ones when it does not answer @phone', async ({ page }) => {
  let asked = 0;
  await page.route('**/api/counts', (r) => { asked++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ corpus: 'test', species: 50_123, genera: 7_001, withClimate: 40_456 }) }); });
  await page.goto('/about/how');
  await ready(page);
  const counts = page.locator('#counts');
  await expect(counts).toContainText('The reference now holds 50,123 species pages in 7,001 genera, and 40,456 of those pages have a habitat climate.');
  expect(asked).toBe(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/counts', (r) => r.abort());
  await page.reload();
  await ready(page);
  await expect(counts).toContainText('The reference held, on 29 October 2026, 48,357 species pages in 6,529 genera, and 37,727 of those pages have a habitat climate.');
});

for (const width of [320, 375, 430]) {
  test(`r84a about 2: at ${width} px each page is no wider than the screen, the table stacks, and each summary leads its section @phone-only`, async ({ page }) => {
    await page.route('**/api/counts', (r) => r.abort());
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/about/how', '/about/formats']) {
      await page.goto(path);
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
      // Each section's first block is its summary, and it is shown, not folded away.
      const firsts = await page.locator('article.prose > section:not(.brief)').evaluateAll((ss) => ss.map((s) => !!s.querySelector('h2')!.nextElementSibling?.classList.contains('sum')));
      expect(firsts.length, path).toBeGreaterThan(10);
      expect(firsts.filter((c) => !c), path).toEqual([]);
      await expect(page.locator('article.prose .sum').first()).toBeVisible();
    }
    await page.goto('/about/how');
    await ready(page);
    // The sources' table as blocks: a cell sits under the one before it, not beside it.
    const [th, td] = await Promise.all([page.locator('.src tbody tr').first().locator('th').boundingBox(), page.locator('.src tbody tr').first().locator('td').first().boundingBox()]);
    expect(td!.y).toBeGreaterThan(th!.y + th!.height - 1);
  });
}

test('r84a about 3: a list of rules in full opens when asked, and every one opens for print @phone', async ({ page }) => {
  await page.route('**/api/counts', (r) => r.abort());
  await page.goto('/about/how');
  await ready(page);
  const more = page.locator('details.more').filter({ hasText: 'Which Commons files are shown' });
  await expect(more.locator('li').first()).toBeHidden();
  await more.locator('summary').click();
  await expect(more.locator('li').first()).toBeVisible();
  await more.locator('summary').click();
  await expect(more.locator('li').first()).toBeHidden();
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  for (const d of await page.locator('article.prose details').all()) await expect(d.locator('li').first()).toBeVisible();
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(more.locator('li').first()).toBeHidden();
});
