/**
 * Round 116 (MYPLANTS 26, docs/PLAN-IPHONE.md): the "keep your plants" sheet, in Safari on an iPhone (its user agent and
 * `navigator.standalone`, which only Apple's mobile WebKit has), after the first plant: sync first, the Home Screen
 * option with its warning that labels open Safari, a backup; "Remind me in a week"; not in the Home Screen app, and not
 * on a desktop. The list's line opens it on the iPhone.
 *
 * On 1764df3 there is no sheet: every test FAILED.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
test.use({ serviceWorkers: 'block' });

async function asIphone(page: Page, standalone: boolean) {
  await page.addInitScript((s) => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => s, configurable: true }), standalone);
}
async function addOne(page: Page) {
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Testus primus');
  await addPlant(page);
}

test.describe('in Safari on an iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('r116b 1: after the first plant, the sheet: sync first, the Home Screen warning, a backup; put off for a week', async ({ page }) => {
    await asIphone(page, false);
    await addOne(page);
    const sheet = page.locator('dialog.keep');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#keep-state')).toHaveText('1 plant · no backup yet · sync off');
    await expect(sheet).toContainText('Safari can delete what a website has stored once seven days pass without the site being used.');
    await expect(sheet.locator('.ways li').first()).toContainText('Turn on sync');
    await expect(sheet.locator('.ways li').first()).toContainText('recommended');
    await expect(sheet.locator('.ways li').nth(1)).toContainText('The app starts empty');
    await expect(sheet.locator('.ways li').nth(1)).toContainText('A label scanned with the Camera opens Safari');
    await expect(sheet.locator('a[href="/backup"]')).toBeVisible();
    await sheet.getByRole('button', { name: 'Remind me in a week' }).click();
    await expect(sheet).toBeHidden();
    await page.goto('/plants');
    await ready(page);
    await expect(page.locator('dialog.keep')).toBeHidden(); // not again before the week is out
    // The list's line, true of an iPhone, opens it.
    const line = page.locator('#storage-notice');
    await expect(line).toContainText('Kept in Safari on this device only, which may delete it after seven days unused');
    await line.getByRole('button', { name: 'keep your plants' }).click();
    await expect(page.locator('dialog.keep')).toBeVisible();
  });

  test('r116b 2: a week on, with nothing done, it shows again', async ({ page }) => {
    await asIphone(page, false);
    await addOne(page);
    await page.locator('dialog.keep').getByRole('button', { name: 'Remind me in a week' }).click();
    await page.evaluate(() => localStorage.setItem('cultifolio.keepSheetShownAt', String(Date.now() - 8 * 86_400_000)));
    await page.goto('/plants');
    await ready(page);
    await expect(page.locator('dialog.keep')).toBeVisible();
  });

  test('r116b 3: never in the Home Screen app', async ({ page }) => {
    await asIphone(page, true);
    await addOne(page);
    await expect(page.locator('#storage-notice, .rows, h1').first()).toBeVisible(); // the plant's page, drawn
    await expect(page.locator('dialog.keep')).toHaveCount(0);
  });
});

test('r116b 4: never on a desktop, and its line as before', async ({ page }) => {
  await addOne(page);
  await expect(page.locator('h1').first()).toBeVisible(); // the plant's page, drawn
  await expect(page.locator('dialog.keep')).toHaveCount(0);
});
