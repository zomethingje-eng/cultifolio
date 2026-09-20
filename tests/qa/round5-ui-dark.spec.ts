/** Dark-scheme viewport shots of the climate section and a plant page, at both widths. */
import { test } from '@playwright/test';
const OUT = '/tmp/r5';
for (const width of [1000, 390]) {
  test(`dark ${width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto('/species/copiapoa-cinerea');
    await page.waitForTimeout(600);
    await page.locator('#s-climate').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -60));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/dark-${width}-climate.png` });
    if (width === 390) { await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/dark-${width}-climate2.png` }); }
    await page.locator('#s-habitat').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/dark-${width}-habitat.png` });
    await page.goto('/species/refusia-testii');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/dark-${width}-refusia.png`, fullPage: true });
    await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
    await page.getByRole('button', { name: /^Add/ }).click();
    await page.waitForURL(/\/plants\/\d{4}-\d{4}$/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/dark-${width}-plant.png` });
    await page.getByRole('button', { name: 'Water', exact: true }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/dark-${width}-plant-water.png` });
    await ctx.close();
  });
}
