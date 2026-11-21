/**
 * Round 104 (docs/PLAN-104.md; the second hand-off's round 9, the third's 15a and the first's round 3 search items): one
 * search, the header's, everywhere.
 *
 * 1. The front page's large box is the header's combobox: Browse rows before Species rows, the catalogue's list as its
 *    last row, the pitch kept under it; Enter opens the first row, whatever its kind.
 * 2. A query nothing answers whose first word is a genus here: the panel's first row is the genus, and the search page
 *    names it with its count and links its species, listing none as hits.
 * 3. A query nothing at all answers: the panel says so in one line.
 * 4. Your plants: a device with a plant finds it first in the header's panel, with its number; the plant's number is in
 *    no request.
 * 5. With no script the large box is a form that opens the catalogue's list for the words.
 * 6. One search box per screen: the bar's stand-in box steps aside on the search page too.
 *
 * On bc0883b: the front page's box was the catalogue's (`input.searchbar`, results in place): 1, 2, 3 and 6 FAILED; 4
 * FAILED (no "Your plants" group); 5 passed then (the catalogue's form) and passes now.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

test.use({ locale: 'en-GB' });

const box = (p: Page) => p.locator('main .frontsearch input');
const rows = (p: Page) => p.locator('main .frontsearch [role=option]');

test('r104b 1: the front page\'s box is the header\'s engine: Browse, then Species, then the catalogue\'s list; Enter opens the first row @phone', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(box(page)).toHaveAttribute('role', 'combobox');
  await box(page).fill('copiapoa');
  await expect(rows(page).first()).toBeVisible();
  await expect.poll(() => page.locator('main .frontsearch .gh').allTextContents(), { timeout: 10_000 }).toEqual(expect.arrayContaining(['Browse', 'Species']));
  const heads = await page.locator('main .frontsearch .gh').allTextContents();
  expect(heads.indexOf('Browse')).toBeGreaterThanOrEqual(0);
  expect(heads.indexOf('Browse')).toBeLessThan(heads.indexOf('Species'));
  await expect(rows(page).first()).toHaveAttribute('href', '/genus/copiapoa');
  await expect(rows(page).last()).toHaveAttribute('href', '/?q=copiapoa');
  // Figures, never "climate known".
  expect((await page.locator('main .frontsearch').innerText())).not.toMatch(/climate known/i);
  await expect(page.locator('.frontpitch')).toBeVisible();
  await box(page).press('Enter');
  await expect(page).toHaveURL(/\/genus\/copiapoa$/);
});

test('r104b 2: a genus held and a word that is no name of it: the genus first in the panel, named on the search page @phone', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await box(page).fill('copiapoa albo');
  await expect(rows(page).first()).toHaveAttribute('href', '/genus/copiapoa');
  await expect(rows(page).first()).toContainText(/genus · Cactaceae · \d+ species/);
  await page.goto('/?q=copiapoa%20albo');
  await ready(page);
  const held = page.locator('#held');
  await expect(held).toContainText('No name in the reference is spelt “copiapoa albo”. It holds');
  await expect(held).toContainText('species of Copiapoa');
  await expect(held.locator('a[href="/genus/copiapoa"]')).toBeVisible();
  await expect(held.locator('a[href="/about/how#list"]')).toBeVisible();
  await expect(page.locator('.rows.hits .hitrow')).toHaveCount(0);
});

test('r104b 3: nothing at all: the panel says so in one line @phone', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await box(page).fill('qzxwvk');
  await expect(page.locator('main .frontsearch .note')).toHaveText('No name in the reference matches “qzxwvk”.');
});

test('r104b 4: Your plants first in the header\'s panel, matched on the device; the plant\'s number is sent nowhere', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  const no = (await page.locator('.accno').first().innerText()).trim();
  const sent: string[] = [];
  page.on('request', (r) => sent.push(r.url()));
  await page.goto('/species/copiapoa-humilis');
  await ready(page);
  const bar = page.locator('#topbar .site-search input');
  await bar.fill('cinerea');
  const first = page.locator('#topbar .site-search [role=option]').first();
  await expect(first).toContainText('Copiapoa cinerea');
  await expect(first).toContainText(`1 plant · ${no}`);
  await expect(page.locator('#topbar .site-search .gh').first()).toHaveText('Your plants');
  expect(sent.filter((u) => u.includes(no))).toEqual([]);
});

test('r104b 5: with no script the front page\'s box is a form that opens the catalogue\'s list', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('main .frontsearch input').fill('copiapoa');
  await page.locator('main .frontsearch input').press('Enter');
  await expect(page).toHaveURL(/\/\?q=copiapoa$/);
  await ctx.close();
});

test('r104b 6: one search box per screen: the bar\'s stand-in steps aside on the search page', async ({ page }) => {
  await page.goto('/?q=copiapoa');
  await ready(page);
  await expect(page.locator('main .toolrow .searchbar')).toBeVisible();
  await expect(page.locator('#topbar .tobox')).toBeHidden();
  await page.goto('/?by=genus');
  await ready(page);
  await expect(page.locator('#topbar .tobox')).toBeVisible(); // a catalogue address keeps it, its box lower (r102a 5)
});
