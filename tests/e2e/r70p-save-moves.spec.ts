/**
 * Round seventy, agent P (triage-69 P1, IND-8): the two WebKit flakes, smoke's species-change Save and the 400-plant
 * backup's price edit, each "left the edit form open for ten seconds". Both leave the plant form's species field before
 * Save is pressed (the species test types a name and leaves it; the price test's form opens with the focus in the
 * species field, and filling the price leaves it). The field's check then answers, 150 to 300 ms later, and its words
 * arrive under the field: measured in Chromium, Save moves down 31 px for a pill ("name service not reached, kept as
 * typed", the 400-plant case, whose plants carry no key) and 68 px for a pill and a line ("GBIF 5411106" and "The name
 * service did not answer…", the species case). Save is 36 px high. A press begun on Save before the words land and
 * released after them is released on another element, and no click reaches Save: nothing is saved, and the form stays
 * open. Playwright checks the target of a click's first event only (its hit-target interceptor sets its verdict on the
 * pointerdown and lets the mouseup through), so a click whose release came after the move did nothing, silently, and
 * the next attempt, timed otherwise, passed. Chromium's clicks are quick enough to land before the answer; WebKit's, on
 * the owner's PC, are not always.
 *
 * It is a fault for a grower too, the one round sixty-seven fixed on the add form (triage-66 P10: "a tap begun before
 * the answer landed on nothing"): a tap on Save as the check answers saves nothing. These tests press Save, let the
 * check answer, then release, as such a tap does; both fail on the base (the form stays open). They pass once the edit
 * form keeps the room for the check's words, as the add form does (`<SpeciesPicker reserve …>`): a need in
 * src/routes/plants/[acc]/+page.svelte, which is no agent's file this round (docs/review-70/P.md).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { inject } from './helpers/inject';

// The service worker answers /api/search itself once it controls the page, past the page's route: the test holds the
// check's answers, so the page must ask the network.
test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** Hold the check's two answers (/api/names and /api/search) until `release()`; each request is let through then. */
async function holdAnswers(page: Page): Promise<{ asked: () => number; release: () => void }> {
  const held: Route[] = [];
  let open = false;
  await page.route(/\/api\/(names|search)\?/, async (r) => { if (open) await r.continue(); else held.push(r); });
  return { asked: () => held.length, release: () => { open = true; for (const r of held.splice(0)) void r.continue(); } };
}

/** A press on Save that is released only after the check's words have arrived, as a grower's tap that meets them. */
async function pressAcrossTheAnswer(page: Page, hold: { release: () => void }, arrived: () => Promise<void>) {
  const save = page.getByRole('button', { name: 'Save' });
  await save.scrollIntoViewIfNeeded(); // the mouse is placed in the viewport, as a finger is
  const box = (await save.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  hold.release();
  await arrived();
  await page.mouse.up();
}

test('r70p P1: a price edited on a plant with no key is saved by a Save pressed as the name check answers (IND-8, the 400-plant flake) @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  // A plant as the backup in smoke's 400-plant test files it: a name and no key, so leaving the field asks about it.
  await inject(page, [['accession', 'k1', 'taxonName', 'Welwitschia mirabilis'], ['accession', 'k1', 'status', 'growing'], ['accession', 'k1', 'acquired', '2025-03-01'], ['accession', 'k1', 'acc', '2025-0400']], Date.now() - 3_600_000);
  await page.goto('/plants/2025-0400'); await ready(page);
  const hold = await holdAnswers(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await expect(page.locator('#ed-name')).toBeFocused(); // the form opens in the species field (round twenty, 11)
  await page.fill('#ed-price', '12'); // and this leaves it: the check asks the name service
  await expect.poll(hold.asked).toBeGreaterThan(0);
  const status = page.locator('.editform .picker .status');
  await pressAcrossTheAnswer(page, hold, () => expect(status).toContainText('kept as typed'));
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.getByText('2025-03-01 · 12')).toBeVisible(); // the card's source line carries the price
});

test('r70p P1: a species changed in the edit form is saved by a Save pressed as the name check answers (IND-8, the species-change flake) @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  const hold = await holdAnswers(page);
  await page.fill('#ed-name', 'Welwitschia mirabilis');
  await page.locator('#ed-name').blur();
  await expect.poll(hold.asked).toBeGreaterThan(1); // the search and the name service, both asked
  const status = page.locator('.editform .picker .status');
  await pressAcrossTheAnswer(page, hold, () => expect(status).toContainText('GBIF 5411106'));
  await expect(page.locator('h1.sci')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('.editform')).toHaveCount(0);
});

test('r70p P1: Save stays where it was pressed while the name check answers (IND-8) @phone', async ({ page }) => {
  // The measure behind the two above, kept as a check of its own: Save's place before the check's words and after.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  const hold = await holdAnswers(page);
  await page.fill('#ed-name', 'Welwitschia mirabilis');
  await page.locator('#ed-name').blur();
  await expect.poll(hold.asked).toBeGreaterThan(1);
  const save = page.getByRole('button', { name: 'Save' });
  const before = (await save.boundingBox())!;
  hold.release();
  await expect(page.locator('.editform .picker .status')).toContainText('GBIF 5411106');
  const after = (await save.boundingBox())!;
  expect(Math.abs(after.y - before.y), `Save moved from y=${before.y} to y=${after.y}`).toBeLessThan(1);
});
