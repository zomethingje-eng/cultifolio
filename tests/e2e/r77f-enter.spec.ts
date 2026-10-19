/**
 * Round seventy-seven (F), item 2: entering the example is decided by nothing that depends on time, as Leave has been
 * since round seventy-five (tests/e2e/r75h-leave.spec.ts; docs/review-75/H.md, item 1).
 *
 * On r77base "Show the example collection" set the tab's flag before it navigated, and took it off again once the page
 * was known to stay: at once where the browser says a Cancel (Chromium's `navigateerror`), and otherwise when "Leave
 * site?" was still showing 3 seconds later. Firefox and Safari's engine do not say a Cancel that way, so a reload before
 * the 3 s opened the example in a tab that had answered Cancel. Here Chromium is made such a browser (its Navigation API
 * taken away before the page's scripts run), the page is given a "Leave site?" of its own, and the reload comes straight
 * after the Cancel. Now the button writes only a one-use token, and the page its address opens sets the flag (app.html's
 * first script), so a Cancel leaves nothing half-done. Tests 1 and 2 fail on r77base; test 3 passes on both.
 */
import { test, expect, type Page } from '@playwright/test';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** An empty device's Today, in a browser that does not say a Cancel, with the offer drawn. */
async function emptyToday(page: Page, withLeaveSite: boolean) {
  test.setTimeout(120_000);
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST);
  await page.addInitScript(() => { try { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); } catch { /* an engine without it already */ } });
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#see-example')).toBeVisible();
  // A page that asks "Leave site?" (as a page with something typed does), added before the button's own listener.
  if (withLeaveSite) await page.evaluate(() => addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; }));
}
const tab = (page: Page) => page.evaluate(() => ({ flag: sessionStorage.getItem('cultifolio.demo'), token: sessionStorage.getItem('cultifolio.sampleEntering') }));
const databases = (page: Page) => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name)));

test('r77f enter 1: an entry answered Cancel, then a reload before anything has said the Cancel, stays out of the example @phone', async ({ page }) => {
  await emptyToday(page, true);
  const answers: string[] = [];
  page.on('dialog', (d) => { answers.push(d.type()); void (answers.length === 1 ? d.dismiss() : d.accept()); }); // Cancel, then the reload's own "Leave site?" answered Leave
  await page.locator('#see-example').click();
  await expect.poll(() => answers[0]).toBe('beforeunload');
  await expect(page.locator('#example-opening')).toBeVisible(); // nothing has said the Cancel: no `navigateerror` here, and not 3 s yet
  expect.soft((await tab(page)).flag).toBeNull(); // r77base: '1', set before the page went
  await page.reload();
  await ready(page);
  expect((await tab(page)).flag).toBeNull(); // r77base: '1', and the reloaded page opened the example
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#demobar')).toBeHidden();
  await expect(page.locator('#see-example')).toBeVisible(); // the grower's own empty Today, with its offer
  expect(await databases(page)).not.toContain('cultifolio-demo'); // r77base: made and set out by the reloaded page
});

test('r77f enter 2: the first press on the page after a Cancel brings the button back, with no wait', async ({ page }) => {
  await emptyToday(page, true);
  page.once('dialog', (d) => void d.dismiss());
  await page.locator('#see-example').click();
  await expect(page.locator('#example-opening')).toBeVisible();
  await page.locator('h1').first().click(); // a press on the page: the question was answered, and the page stayed
  await expect(page.locator('#see-example')).toBeVisible({ timeout: 1000 }); // r77base: only after 3 s
  expect(await tab(page)).toMatchObject({ flag: null });
});

test('r77f enter 3: an entry that goes enters, on the same page, and its address is an ordinary one again @phone', async ({ page }) => {
  await emptyToday(page, false);
  await page.locator('#see-example').click();
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page).toHaveURL(/\/today$/); // `?enter=<token>` taken off by the example's bar
  await expect(page.locator('#demobar')).toBeVisible();
  await expect(page.locator('#example-opening')).toBeHidden({ timeout: seedWait() });
  expect(await tab(page)).toEqual({ flag: '1', token: null }); // in, and the token used once
  await page.reload(); await ready(page);
  await expect(page.locator('#demobar')).toBeVisible(); // a reload stays in, as it always did
});
