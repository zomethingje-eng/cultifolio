/**
 * Round sixty-seven, the harness (triage-66 H5; R45-27, IND's single-click note): the disclosures the suite opens through
 * `openDisclosure`, opened here with ONE press each, as a person taps them, and what that press did is checked: the
 * summary did not move between the press and the release, one click and one toggle followed, and it is open. The helper
 * presses again when a first press misses (and now records it); this check never does, so a missed tap fails here.
 *
 * And the move a missed tap is blamed on (S-E2, E's finding 2): the add form's "Use my own number" and Add stay where
 * they are while the name check answers late, read frame by frame (tests/e2e/helpers/positions.ts), which works in
 * every engine. That one passes once P's P10 (the name check's line reserved) is merged; on the base the summary moves
 * by up to 120 px.
 *
 * No Chromium-only feature is used: these run in WebKit and Firefox when they are named, and the add form's on the
 * phones (`@phone`).
 */
import { test, expect, type Page } from '@playwright/test';
import { pressOnce, type Press } from './helpers/disclosure';
import { startPositions, positionMoves } from './helpers/positions';
import { ownPages } from './helpers/r63v-own';

test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });
// No service worker: in Safari's engine a page the worker controls sends its requests past `page.route`, and the late
// name check below is a route.
test.use({ serviceWorkers: 'block' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

function oneTap(r: Press) {
  expect({ opened: r.opened, clicks: r.clicks, toggles: r.toggles, moved: r.downTop !== r.upTop }, JSON.stringify(r)).toEqual({ opened: true, clicks: 1, toggles: 1, moved: false });
}

test('r67h disclosure 1: the import\'s "paste the sheet\'s text" opens on one press', async ({ page }) => {
  await page.goto('/plants/import'); await ready(page);
  await page.click('#imp-mode-csv');
  oneTap(await pressOnce(page, '#imp-csv-paste-box'));
  await expect(page.locator('#imp-csv-text')).toBeVisible();
});

test('r67h disclosure 2: the add form\'s "Use my own number" opens on one press after the name is typed and left (smoke 901\'s steps) @phone', async ({ page }) => {
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  oneTap(await pressOnce(page, 'details.own'));
  await expect(page.locator('#f-own')).toBeVisible();
});

test('r67h disclosure 3: the add form\'s "More details" opens on one press (r60-grow\'s price) @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  oneTap(await pressOnce(page, 'details.moredetails'));
  await expect(page.locator('#f-price')).toBeVisible();
});

test('r67h disclosure 4: "Use my own number" and Add stay put while the name check answers late, on the phone\'s page (S-E2; passes with P10) @phone', async ({ page }) => {
  // The reference's search and the name service held back as E's probe held them (1.2 s and 1.5 s): the answer lands
  // after the field is left, which is when a person reaches for the summary.
  await page.route('**/api/names**', async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
  await page.route('**/api/search**', async (r) => { await new Promise((res) => setTimeout(res, 1200)); await r.continue(); });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await startPositions(page, ['details.own > summary', 'form button[type="submit"]']);
  await page.locator('#species-name').blur();
  // Long enough for both answers and what they draw.
  await page.waitForTimeout(2_500);
  const { moves, frames } = await positionMoves(page);
  expect(frames, 'frames were read').toBeGreaterThan(10);
  expect(moves).toEqual([]);
  // and a press now still opens it
  oneTap(await pressOnce(page, 'details.own'));
});
