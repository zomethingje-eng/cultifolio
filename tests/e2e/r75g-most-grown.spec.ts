/**
 * Round seventy-five, agent G (the owner's decisions): "Most grown" is a chip of the catalogue, off by default and the
 * same on a desktop and a phone, that shows the species of the most-grown genera, ranked by iNaturalist's observations
 * of plants marked captive or cultivated (scripts/most-grown-genera.txt). Its set is worked out here from the real file by
 * the app's own rule over the fixture's genera: Welwitschia (263 captive observations on 17 October 2026) holds over half
 * of the counted, Copiapoa (140) does not get in, Refusia is refused (iNaturalist has no genus of that name).
 * On r75base there is no such chip, `?chip=grown` is read as no chip, and /about/how names no source for it.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseMostGrown, openingGenera } from '../../src/lib/ui/ref/most-grown-rule';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const file = parseMostGrown(readFileSync('scripts/most-grown-genera.txt', 'utf8'));
const FIXTURE = ['Copiapoa', 'Refusia', 'Welwitschia'];
const expected = openingGenera(file, FIXTURE).genera;
const DEVICES: Record<string, Parameters<Browser['newContext']>[0]> = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true }
};
const rows = (page: Page) => page.locator('.rows a.grow:visible .gname').allTextContents();

for (const [device, opts] of Object.entries(DEVICES)) {
  test(`r75g grown 1, ${device}: "Most grown" is a chip, off by default; on, it shows the most-grown genera by the rule on the real file`, async ({ browser, baseURL }) => {
    expect(expected).toEqual(['Welwitschia']); // the file's counts, as of its day
    const ctx = await browser.newContext({ ...opts, baseURL, locale: 'en-GB', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    expect(await rows(page)).toEqual(FIXTURE); // off by default: every genus
    const grown = page.locator('.chiprow a', { hasText: 'Most grown' });
    await expect(grown).toHaveText('Most grown, 1');
    await expect(grown).not.toHaveAttribute('aria-current', 'page');
    await expect(grown).toHaveAttribute('title', 'The species of the genus most observed in cultivation on iNaturalist');
    await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText('All, 4');
    await grown.click();
    await expect(page).toHaveURL(/\?by=genus&chip=grown$/);
    await expect(grown).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => rows(page)).toEqual(expected);
    await expect(page.locator('.seccount:visible').last()).toHaveText("1 genus · 1 species in the most-grown genera, by iNaturalist's records of cultivated plants (how they are chosen)");
    // The search under the chip is filtered by it too, as under the climate chips.
    await page.locator('input.searchbar').fill('Copiapoa cinerea');
    await expect(page.locator('.emptybox')).toContainText('with the chip on (1 without it)');
    await ctx.close();
  });
}

test('r75g grown 2: without JavaScript the chip is a link and its address draws the filtered catalogue, by family too', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ ...DEVICES.phone, baseURL, locale: 'en-GB', javaScriptEnabled: false, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('.chiprow a', { hasText: 'Most grown' }).click();
  await expect(page).toHaveURL(/\?by=genus&chip=grown$/);
  expect(await rows(page)).toEqual(expected);
  await expect(page.locator('.chiprow a[aria-current="page"]')).toHaveText('Most grown, 1');
  await page.goto('/?by=family&chip=grown');
  expect(await rows(page)).toEqual(['Welwitschiaceae']);
  await ctx.close();
});

test('r75g grown 3: /about/how names the source, the day and the rule, and that every device shows every genus', async ({ page }) => {
  await page.goto('/about/how');
  const day = new Date(`${file.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain("The front page's catalogue is the same on every device, every genus and every species, and its chip “Most grown”, off until chosen, narrows it to the species of the most-grown genera");
  expect(text).toContain(`together hold half of iNaturalist's observations of plants marked captive or cultivated across all the reference's genera that were counted, each genus counted with every taxon under it, on ${day} (scripts/most-grown-genera.txt in the source`);
  expect(text).not.toMatch(/On a phone the front page's catalogue opens/);
});
