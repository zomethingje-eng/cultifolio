/**
 * Round seventy-three, agent P (REVIEW-ROUND-72 §7; self-F 11, the owner's decision): a phone opened the front page's
 * catalogue on Abelia, Abelmoschus and Abutilon. It opens on the collector genera now (scripts/specialist-genera.txt, the
 * list the species list takes whole), the rest one chip away; a desktop is drawn as before. The fixture holds three
 * genera: Copiapoa and Welwitschia are collector genera, Refusia is not.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const phone = (browser: Browser, baseURL: string | undefined, js = true) => browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', javaScriptEnabled: js, serviceWorkers: 'block' });

test('r73p front 1: a phone opens on the collector genera, keeps them when a row opens, and has the rest one chip away', async ({ browser, baseURL }) => {
  const ctx = await phone(browser, baseURL);
  const page = await ctx.newPage();
  await page.goto('/'); await ready(page);
  await expect(page.locator('#g-copiapoa')).toBeVisible();
  await expect(page.locator('#g-welwitschia')).toBeVisible();
  await expect(page.locator('#g-refusia')).toBeHidden();
  await expect(page.locator('#l-R')).toBeHidden(); // its letter's heading too
  await expect(page.locator('.letters a', { hasText: 'R' })).toBeHidden();
  const collector = page.locator('.chiprow a:visible', { hasText: 'Collector genera' });
  await expect(collector).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.seccount:visible').last()).toContainText('2 collector genera · 3 species');
  // A row opened keeps the view.
  await page.locator('#g-copiapoa').click();
  await expect(page).toHaveURL(/\/\?open=copiapoa$/);
  await expect(page.locator('#g-copiapoa')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('a.tile')).toHaveCount(2);
  await expect(page.locator('#g-refusia')).toBeHidden();
  // The rest, one chip away.
  await page.locator('.chiprow a:visible', { hasText: /^All/ }).click();
  await expect(page).toHaveURL(/\?by=genus$/);
  await expect(page.locator('#g-refusia')).toBeVisible();
  await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText(/^All/);
  // And back.
  await page.locator('.chiprow a:visible', { hasText: 'Collector genera' }).click();
  await expect(page.locator('#g-refusia')).toBeHidden();
  await ctx.close();
});

test('r73p front 2: without JavaScript a phone draws the same view from the server\'s page', async ({ browser, baseURL }) => {
  const ctx = await phone(browser, baseURL, false);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#g-copiapoa')).toBeVisible();
  await expect(page.locator('#g-refusia')).toBeHidden();
  await ctx.close();
});

test('r73p front 3: a desktop is drawn as before: every genus, its own "All", and its rows\' addresses', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/'); await ready(page);
  for (const g of ['copiapoa', 'refusia', 'welwitschia']) await expect(page.locator(`#g-${g}`)).toBeVisible();
  await expect(page.locator('.chiprow a', { hasText: 'Collector genera' })).toBeHidden();
  await expect(page.locator('.chiprow a:visible[aria-current="page"]')).toHaveText(/^All/);
  await expect(page.locator('.seccount:visible').last()).toContainText('3 genera · 4 species');
  await page.locator('#g-copiapoa').click();
  await expect(page).toHaveURL(/\?by=genus&open=copiapoa$/);
  // A phone's link opened on a desktop is the same page as the desktop's own.
  await page.goto('/?open=refusia'); await ready(page);
  await expect(page.locator('#g-refusia')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#g-copiapoa')).toBeVisible();
  await ctx.close();
});
