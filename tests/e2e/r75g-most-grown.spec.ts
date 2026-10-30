/**
 * Round seventy-five, agent G (the owner's decisions): "Most grown" is a chip of the catalogue, off by default and the
 * same on a desktop and a phone, that shows the species of the most-grown genera, ranked by iNaturalist's observations
 * of plants marked captive or cultivated (scripts/most-grown-genera.txt). Its set is worked out here from the real file by
 * the app's own rule over the fixture's genera: Hesperocyparis (16,980 captive observations on 22 October 2026, when the
 * count was made over the full list's genera; it was not counted before, round eighty) holds over half of the counted,
 * Welwitschia (267) and Copiapoa (140) do not get in, Refusia is refused (iNaturalist has no genus of that name).
 * On r75base there is no such chip, `?chip=grown` is read as no chip, and /about/how names no source for it.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseMostGrown, openingGenera } from '../../src/lib/ui/ref/most-grown-rule';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const file = parseMostGrown(readFileSync('scripts/most-grown-genera.txt', 'utf8'));
const FIXTURE = ['Copiapoa', 'Hesperocyparis', 'Refusia', 'Welwitschia']; // Hesperocyparis: K's page without a GBIF key (round seventy-nine)
const expected = openingGenera(file, FIXTURE).genera;
const DEVICES: Record<string, Parameters<Browser['newContext']>[0]> = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true }
};
const rows = (page: Page) => page.locator('.rows a.grow:visible .gname').allTextContents();

for (const [device, opts] of Object.entries(DEVICES)) {
  test(`r75g grown 1, ${device}: "Popular genera" ("Most grown" until round eighty-two) is a chip, off by default; on, it shows the most-grown genera by the rule on the real file`, async ({ browser, baseURL }) => {
    expect(expected).toEqual(['Hesperocyparis']); // the file's counts, as of its day (Welwitschia until round eighty's count)
    const ctx = await browser.newContext({ ...opts, baseURL, locale: 'en-GB', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    expect(await rows(page)).toEqual(FIXTURE); // off by default: every genus
    const grown = page.locator('.chiprow a', { hasText: 'Popular genera' });
    await expect(grown).toHaveText('Popular genera, 1');
    await expect(grown).not.toHaveAttribute('aria-current', 'page');
    await expect(grown).toHaveAttribute('title', 'The species of the genus most observed in cultivation on iNaturalist');
    await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText('All, 5');
    await grown.click();
    await expect(page).toHaveURL(/\?by=genus&chip=grown$/);
    await expect(grown).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => rows(page)).toEqual(expected);
    await expect(page.locator('.seccount:visible').last()).toHaveText("1 genus · 1 species in the popular genera, the genera most observed in cultivation on iNaturalist (how they are chosen)");
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
  await page.locator('.chiprow a', { hasText: 'Popular genera' }).click();
  await expect(page).toHaveURL(/\?by=genus&chip=grown$/);
  expect(await rows(page)).toEqual(expected);
  await expect(page.locator('.chiprow a[aria-current="page"]')).toHaveText('Popular genera, 1');
  await page.goto('/?by=family&chip=grown');
  expect(await rows(page)).toEqual(['Cupressaceae']);
  await ctx.close();
});

test('r75g grown 3: /about/how names the source, the day and the rule, and that every device shows every genus', async ({ page }) => {
  await page.goto('/about/how');
  const day = new Date(`${file.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  // Round eighty-four: the rule in short sentences (the reviews' S5).
  expect(text).toContain("The front page's catalogue is the same on every device: every genus and every species.");
  expect(text).toContain('Its chip "Popular genera", off until chosen, narrows it to the popular genera. These are the fewest genera that, taken from the most observed down, hold half of iNaturalist\'s observations of plants marked captive or cultivated, across the reference\'s genera that were counted.');
  expect(text).toContain(`The count was made on ${day}, over the`);
  expect(text).toContain('scripts/most-grown-genera.txt holds every count, the query and iNaturalist\'s terms.');
  expect(text).not.toMatch(/On a phone the front page's catalogue opens/);
});
