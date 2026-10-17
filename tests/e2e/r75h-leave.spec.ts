/**
 * Round seventy-five, the harness (agent H): a Leave answered Cancel is decided by nothing that depends on time.
 *
 * r62bg 1 failed once in Firefox on the owner's PC (round seventy-four's last run): after a Leave answered Cancel and a
 * Save, the tab had left the example. Leave used to take the tab's flag off and mark the example for deletion before it
 * navigated, and to put both back once the page was known to stay: at once where the browser says the Cancel (Chromium's
 * `navigateerror`), and otherwise when a "Leave site?" was still showing 3 seconds later. Firefox and Safari's engine do
 * not say a Cancel that way, so there the outcome rested on a 3 s timer, and anything that reloaded the page before it
 * (a slow machine's late timer, a quick visitor) left the example and deleted it with the visitor's edit.
 *
 * Here Chromium is made such a browser (its Navigation API taken away before the page's scripts run), and the reload
 * comes straight after the Cancel, before the 3 s: on r75base the reload opens the grower's own collection and the
 * example is deleted. Leave now writes only its token, and the page its address opens does the leaving (app.html,
 * `finishLeaving`), so there is nothing to put back. The second test: the first press on the page after the Cancel
 * brings the button back, where r75base waited the 3 s.
 */
import { test, expect, type Page } from '@playwright/test';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** The example, set out, with a plant's edit form open and a price typed: a page that asks "Leave site?". */
async function exampleWithForm(page: Page, withoutNavigationApi: boolean) {
  test.setTimeout(120_000);
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  if (withoutNavigationApi) await page.addInitScript(() => { try { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); } catch { /* an engine without it already */ } });
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  await page.locator('.rows a').first().click();
  await ready(page);
  await page.getByRole('button', { name: /More for this plant/ }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.fill('#ed-price', '12');
}
const flag = (page: Page) => page.evaluate(() => [sessionStorage.getItem('cultifolio.demo'), sessionStorage.getItem('cultifolio.sampleLeft')]);
const databases = (page: Page) => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name)));

test('r75h leave 1: a Leave answered Cancel, then a reload before anything has said the Cancel, stays in the example', async ({ page }) => {
  await exampleWithForm(page, true);
  const answers: string[] = [];
  page.on('dialog', (d) => { answers.push(d.type()); void (answers.length === 1 ? d.dismiss() : d.accept()); }); // Cancel, then the reload's own "Leave site?" answered Leave
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect.poll(() => answers[0]).toBe('beforeunload');
  await expect(page.locator('#demo-leave')).toHaveText('Leaving…'); // nothing has said the Cancel: no `navigateerror` here, and not 3 s yet
  expect.soft(await flag(page)).toEqual(['1', null]); // r75base: [null, '1'], the flag already off and the delete marked
  await page.reload();
  await ready(page);
  expect(await flag(page)).toEqual(['1', null]); // r75base: [null, '1'] read by the reloaded page, outside the example
  await expect(page.locator('.demobar')).toBeVisible();
  await expect(page.locator('h1.sci')).toBeVisible(); // the example's plant, still here
  expect(await databases(page)).toContain('cultifolio-demo'); // r75base: deleted by the reloaded page, the visitor's edit with it
});

test('r75h leave 2: the first press on the page after a Cancel brings the button back, with no wait', async ({ page }) => {
  await exampleWithForm(page, true);
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect(page.locator('#demo-leave')).toHaveText('Leaving…');
  await page.locator('h1.sci').click(); // a press on the page: the question was answered, and the page stayed
  await expect(page.getByRole('button', { name: 'Leave the example' })).toBeEnabled({ timeout: 1000 }); // r75base: only after 3 s
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('main')).toContainText('12');
  expect(await flag(page)).toEqual(['1', null]);
});

test('r75h leave 3: a Leave that goes still leaves, and the page it opens deletes the example', async ({ page }) => {
  await exampleWithForm(page, true);
  page.once('dialog', (d) => void d.accept()); // "Leave site?" answered Leave
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?.*)?$/);
  await ready(page);
  expect(await flag(page)).toEqual([null, null]); // out of the example, and the delete mark used once
  await expect(page.locator('.demobar')).toBeHidden();
  await expect.poll(() => databases(page), { timeout: 10_000 }).not.toContain('cultifolio-demo');
});
