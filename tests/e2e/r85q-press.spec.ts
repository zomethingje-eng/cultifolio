/**
 * Round eighty-five, Q: the single-press helper (helpers/disclosure.ts `pressOnce`, helpers/press-kind.ts) tells a
 * release the engine lost from a real missed tap, presses again for the first alone, and only where asked to (WebKit on
 * Windows; here, in Chromium, by `retryLost`), and never hides the second. Each kind is made in the page: a lost release
 * by stopping the press's `pointerup`, `mouseup` and `click` before the page sees them, as the engine's loss leaves the
 * page; a missed tap by letting the release through and stopping the click alone, as a page that drops the click would.
 * On r85base the helper had no such reading: `pressOnce` returned the first press, and the check read both as "moved".
 */
import { test, expect, type Page } from '@playwright/test';
import { pressOnce, expectOneTap } from './helpers/disclosure';
import { goneQuiet } from './helpers/settled';

test.use({ serviceWorkers: 'block' });
const SEL = '#imp-csv-paste-box';
async function at(page: Page) {
  await page.goto('/plants/import');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await page.click('#imp-mode-csv');
  await expect(page.locator(SEL)).toBeVisible();
  // The page settled (its faces in, nothing more asked for): a page still moving would make every press a missed one,
  // which is the classifier's to say and not this test's subject.
  await goneQuiet(page);
}
/** The next press on the summary loses what `kinds` names, before any of the page's listeners (registered first, at the window, capturing). */
const lose = (page: Page, kinds: string[]) => page.evaluate((k) => {
  let armed = true;
  const stop = (e: Event) => { if (!armed) return; e.stopImmediatePropagation(); if (e.type === 'click') { e.preventDefault(); armed = false; } };
  for (const t of k) addEventListener(t, stop, { capture: true });
  // Once the press is over, the next press is the page's own.
  if (!k.includes('click')) addEventListener('click', () => { armed = false; }, { capture: true, once: true });
}, kinds);

test('r85q press 1: a lost release (no pointerup, no click reach the page) is pressed once more where asked, and recorded @phone', async ({ page }) => {
  await at(page);
  await lose(page, ['pointerup', 'mouseup', 'click']);
  const r = await pressOnce(page, SEL, { retryLost: true });
  expect(r.lostRelease?.kind).toEqual({ kind: 'lost-release' });
  expectOneTap(r); // the second press opened it
  expect(test.info().annotations.filter((a) => a.type === 'lost-release')).toHaveLength(1);
});

test('r85q press 2: a lost release is not pressed again where it is not asked, and fails the check @phone', async ({ page }) => {
  await at(page);
  await lose(page, ['pointerup', 'mouseup', 'click']);
  // Not asked, said outright: left to the engine's default, WebKit on Windows (the owner's PC) is asked, and pressed
  // again, which press 1 tests (the owner's all-engines run of round eighty-five).
  const r = await pressOnce(page, SEL, { retryLost: false });
  expect(r.kind).toEqual({ kind: 'lost-release' });
  expect(r.opened).toBe(false);
  expect(() => expectOneTap(r)).toThrow();
});

test('r85q press 3: a real missed tap (the release reaches the page, no toggle follows) is never pressed again, even where lost releases are @phone', async ({ page }) => {
  await at(page);
  await lose(page, ['click']);
  const r = await pressOnce(page, SEL, { retryLost: true });
  expect(r.kind).toMatchObject({ kind: 'missed' });
  expect(r.lostRelease).toBeUndefined();
  expect(r.ups).toBeGreaterThan(0);
  expect(() => expectOneTap(r)).toThrow();
  expect(test.info().annotations.filter((a) => a.type === 'lost-release')).toHaveLength(0);
});
