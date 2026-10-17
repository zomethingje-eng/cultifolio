/**
 * Round seventy-three, agent P, made a phone open the front page's catalogue on a subset (the collector genera), the rest
 * under its own "All". Round seventy-five (the owner's decision, agent G): that read as missing data, so every device
 * draws the same catalogue, every genus and every species, the same rows, counts and order; "Most grown" is a chip off
 * by default (r75g-phone-opening.spec.ts). The fixture holds three genera: Copiapoa, Refusia and Welwitschia.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const phone = (browser: Browser, baseURL: string | undefined, js = true) => browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', javaScriptEnabled: js, serviceWorkers: 'block' });
const desktop = (browser: Browser, baseURL: string | undefined) => browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });

/** What a reader is shown of the catalogue: the rows drawn, the letters, the chip that is on, every chip drawn and the count line. */
async function shown(page: Page) {
  return {
    rows: await page.locator('.rows a.grow:visible .gname').allTextContents(),
    letters: await page.locator('.letters a:visible').allTextContents(),
    on: await page.locator('.chiprow a:visible[aria-current="page"]').allTextContents(),
    chips: await page.locator('.chiprow a:visible').allTextContents(),
    count: (await page.locator('.seccount:visible').last().textContent())?.trim()
  };
}

test('r73p front 1 (round seventy-five): a phone draws the same catalogue as a desktop, every genus, "All" on, nothing hidden', async ({ browser, baseURL }) => {
  const [p, d] = [await phone(browser, baseURL), await desktop(browser, baseURL)];
  const [pp, dp] = [await p.newPage(), await d.newPage()];
  for (const page of [pp, dp]) { await page.goto('/'); await ready(page); }
  const [a, b] = [await shown(pp), await shown(dp)];
  expect(a.rows).toEqual(['Copiapoa', 'Refusia', 'Welwitschia']);
  expect(a).toEqual(b);
  expect(a.on).toEqual(['All, 4']);
  expect(a.count).toBe('3 genera · 4 species');
  // A row opened on a phone goes to the same address as on a desktop.
  await pp.locator('#g-copiapoa').click();
  await expect(pp).toHaveURL(/\?by=genus&open=copiapoa$/);
  await expect(pp.locator('#g-refusia')).toBeVisible();
  await p.close(); await d.close();
});

test('r73p front 2: without JavaScript a phone draws the same catalogue from the server\'s page', async ({ browser, baseURL }) => {
  const ctx = await phone(browser, baseURL, false);
  const page = await ctx.newPage();
  await page.goto('/');
  expect(await page.locator('.rows a.grow:visible .gname').allTextContents()).toEqual(['Copiapoa', 'Refusia', 'Welwitschia']);
  await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText('All, 4');
  await ctx.close();
});

test('r73p front 3: a desktop is drawn as before: every genus, its own "All", and its rows\' addresses', async ({ browser, baseURL }) => {
  const ctx = await desktop(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto('/'); await ready(page);
  for (const g of ['copiapoa', 'refusia', 'welwitschia']) await expect(page.locator(`#g-${g}`)).toBeVisible();
  await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText(/^All/);
  await expect(page.locator('.seccount:visible').last()).toContainText('3 genera · 4 species');
  await page.locator('#g-copiapoa').click();
  await expect(page).toHaveURL(/\?by=genus&open=copiapoa$/);
  await page.goto('/?open=refusia'); await ready(page);
  await expect(page.locator('#g-refusia')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#g-copiapoa')).toBeVisible();
  await ctx.close();
});
