/**
 * Round eighty-one (U): the desktop review's 7 and 9.
 *
 * 1. (W7) The plant log's "×" were each "Remove this entry", five alike in a row to a screen reader. Now each is named
 *    by its line too: "Remove this entry: Watered, <its date>", its kind and its date.
 * 2. (W7) A search result's link was named "C Copiapoa cinerea … ›": the thumbnail's letter and the arrow read out. Now
 *    the name starts with the species.
 * 3. (W7) The batch form's species field was named by its whole hint, about 300 characters, and the add form's by its
 *    name check's pills. Now each is named "Species", and the batch form's hint describes it.
 * 4. (W7) On a desktop the add form put focus nowhere: the species field was 13 Tabs from the top. Now it takes focus, as
 *    the front page's search does; not on a phone.
 * 5. (W9) A species page whose photograph fails showed its placeholder in the top 200 px of the desktop's 300 px frame
 *    and an empty band under it. Now the placeholder fills the frame, on a phone's band too.
 *
 * Names are read by Playwright's own accessible-name rules (`toHaveAccessibleName`), the same in every engine.
 *
 * On r81base: 1 FAILED ("Remove this entry"); 2 FAILED ("C Copiapoa cinerea … ›"); 3 FAILED (the hint's 300 characters);
 * 4 FAILED (focus on the page's body); 5 FAILED (200 of 300 px, and 200 of 150 px on a phone).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
async function noThirdParty(page: Page) {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
}

test("r81u a11y 1: each × in a plant's log is named by its line @phone", async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await page.getByRole('button', { name: /^Water$/ }).first().click();
  // The watering's own line, not only the plant's first: WebKit writes the log more slowly than Chromium (owner's PC, round 81).
  await expect(page.locator('.tl .tlrow .rm[aria-label^="Remove this entry: Watered, "]')).toHaveCount(1);
  const names = await page.locator('.tl .tlrow .rm').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(n).toMatch(/^Remove this entry: .+, .+/);
  expect(names.join(' | ')).toMatch(/Remove this entry: Watered, /);
  await page.locator('.tl .tlrow .rm').first().click();
  await expect(page.locator('.tl .rm.confirm')).toHaveAccessibleName(/^Remove\? .+, .+: press again to remove it$/);
});

test('r81u a11y 2: a search result is named by its species, not by the thumbnail\'s letter and the arrow @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/'); await ready(page);
  await page.locator('input[type=search]').first().fill('copiapoa');
  const hit = page.locator('a.hitrow[href="/species/copiapoa-cinerea"]');
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await expect(hit).toHaveAccessibleName(/^Copiapoa cinerea\b/);
  await expect(hit).not.toHaveAccessibleName(/›/);
});

test('r81u a11y 3: the species field of the batch form and of the add form is named "Species", the hint describing it @phone', async ({ page }) => {
  await page.goto('/propagation/new'); await ready(page);
  await expect(page.locator('#species-name')).toHaveAccessibleName('Species');
  await expect(page.locator('#species-name')).toHaveAccessibleDescription(/^A species, a cultivar/);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await expect(page.locator('.picker .pill').first()).toBeVisible({ timeout: 15_000 }); // the check's pill, inside the label
  await expect(page.locator('#species-name')).toHaveAccessibleName('Species');
});

test('r81u a11y 4: on a desktop the add form puts focus in the species field', async ({ page }) => {
  await page.goto('/plants/new'); await ready(page);
  test.skip(!(await page.evaluate(() => matchMedia('(min-width: 701px) and (pointer: fine)').matches)), "this engine's desktop reports no fine pointer, where the form leaves focus alone by design");
  await expect(page.locator('#species-name')).toBeFocused({ timeout: 10_000 });
  // Reached by a link inside the app too, where the layout first moves focus to the page's content.
  await page.goto('/plants'); await ready(page);
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/plants/new'; a.id = 'r81u-go'; a.textContent = 'go'; document.body.insertBefore(a, document.body.firstChild); a.click(); });
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('#species-name')).toBeFocused({ timeout: 10_000 });
  // Typed into before the collection opens, the field keeps what was typed and focus goes where the grower takes it.
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.waitForTimeout(800); // a negative: nothing may take focus back
  await expect(page.locator('#species-name')).not.toBeFocused();
  // With the name given by the link, focus is left alone.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.waitForTimeout(500); // a negative: nothing may take focus after the collection opens
  await expect(page.locator('#species-name')).not.toBeFocused();
});

test('r81u a11y 5: a photograph that fails leaves its placeholder filling the frame, with no empty band @phone', async ({ page }) => {
  await noThirdParty(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    const frame = page.locator('.hero.photo.failed');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    const f = (await frame.boundingBox())!;
    const p = (await frame.locator('.ph').boundingBox())!;
    expect(Math.abs(p.height - f.height), `${width}: placeholder ${p.height} in a frame of ${f.height}`).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y - f.y)).toBeLessThanOrEqual(1);
  }
});
