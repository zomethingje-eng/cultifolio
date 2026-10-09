/**
 * Round sixty-three, agent U (U4): what a screen reader says, pinned. Each page below was read from its accessibility
 * tree (Playwright's ariaSnapshot) as VoiceOver would announce it: the front page, a species page, Today, a plant page,
 * the add form, the labels page and the sample's bar. What was wrong, and is pinned here with what was right:
 * - a count beside a chip's label ran into it ("No photo in 12 months7", "Due3");
 * - the label sheet's QR codes were each an unnamed "image";
 * - the climate chart's figure was named by its whole key, read again in place;
 * - on /today a second region called "Today" sat inside "Also today";
 * - the "How this section is made" arrow was said ("single right-pointing angle quotation mark");
 * - the plant page's "More ▾" said its triangle.
 * And what holds: one current tab, named by its word; landmarks; the toast's sentence in a live region already there.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context }) => {
  await context.addInitScript(quiet);
  await context.route(/inaturalist|wikimedia|staticflickr|gbif\.org\/.*\.(jpe?g|png)|api\.gbif\.org\/v1\/image/, (r) => r.abort());
});

async function threePlants(page: Page) {
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', 'Copiapoa cinerea\nCopiapoa humilis; Snow Queen\nLithops lesliei');
  await page.click('#imp-check');
  await expect(page.locator('#imp-review-h')).toBeFocused();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done-h')).toBeFocused();
}

test('r63u U4: a visitor\'s front page has its landmarks, one h1 first, and one current tab named by its word', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' }); await ready(page);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  const tabs = page.getByRole('navigation', { name: 'Tabs' });
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(tabs.getByRole('link', { name: 'Species', exact: true })).toHaveAttribute('aria-current', 'page');
  const heads = await page.locator('main').getByRole('heading').evaluateAll((hs) => hs.map((h) => h.tagName));
  expect(heads[0]).toBe('H1');
  expect(heads.filter((h) => h === 'H1')).toHaveLength(1);
});

test('r63u U4: a grower\'s pages say what they show (chips, Today, the labels, the plant\'s More, the toast)', async ({ page }) => {
  test.setTimeout(120_000);
  await threePlants(page);

  // The plants list's chips: the count is its own word.
  await page.goto('/plants'); await ready(page);
  const which = page.getByRole('group', { name: 'Which plants' });
  await expect(which.getByRole('button', { name: 'All, 3', exact: true })).toBeVisible(); // the first run: "All3"
  await expect(which.getByRole('button', { name: /^Growing, \d+$/ })).toBeVisible();

  // Today: its regions are the page's sections, with no second "Today" inside "Also today"; a summary's arrow is not said.
  await page.goto('/today'); await ready(page);
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toHaveCount(0);
  const tabs = page.getByRole('navigation', { name: 'Tabs' });
  await expect(tabs.getByRole('link', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('details.why > summary').first()).toHaveAccessibleName(/^How/); // the first run: "› How Today decides"

  // The labels page: no unnamed image among the labels.
  await page.goto('/labels'); await ready(page);
  const sheet = page.getByRole('region', { name: 'Label sheets as they will print' });
  await expect(sheet.locator('.qr svg').first()).toBeAttached();
  await expect(sheet.getByRole('img')).toHaveCount(0);
  await expect(sheet).toContainText('2026-0001');

  // The plant page: "More", not "More, down-pointing triangle"; a watering is said in the live region already there.
  await page.goto('/plants/2026-0001'); await ready(page);
  const live = page.locator('.toastregion [role="status"][aria-live="polite"]');
  await expect(live).toBeAttached();
  await expect(live).toHaveText('');
  await page.locator('.quickbar .more').waitFor();
  await expect(page.locator('.quickbar .more')).toHaveAccessibleName('More');
  await page.getByRole('button', { name: 'Water', exact: true }).first().click();
  await expect(live).toHaveText(/Watering recorded/);
});

test('r63u U4: the climate chart\'s figure is named by the chart\'s title, not by its key', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); await ready(page);
  const fig = page.locator('figure.climo').first();
  await expect(fig).toHaveAccessibleName('Habitat climate of Copiapoa cinerea through the year'); // the first run: "day night rain medians and …"
  await expect(fig.getByRole('img', { name: 'Habitat climate of Copiapoa cinerea through the year' })).toBeVisible();
});
