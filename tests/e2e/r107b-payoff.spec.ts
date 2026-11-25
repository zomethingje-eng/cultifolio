/**
 * Round 107 (docs/PLAN-107.md; the first hand-off's round 7, the tracker's payoff), in the browser:
 *
 * - A plant added from a species page opens its page on one comparison: the space's floor against Copiapoa cinerea's
 *   cold floor (6.5 °C over 40 years, NASA POWER, in the fixture), each figure with its source; a reload shows no card.
 * - A plant added with no space is asked for one in the card, then for the space's floor, and the line follows.
 * - Today with no plants is one button to add one; the frost watch says why before it asks where you are, and takes a
 *   town (OpenStreetMap's Nominatim, answered here by a route), which becomes the site.
 *
 * On c92f117: FAILED, every test: the add form opened the plant page with a toast and no card, Today said "Add one and
 * this page says what it needs.", and no town could be typed.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { allowWrites } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

async function space(page: Page, name: string, floor: string | null) {
  await page.goto('/places'); await ready(page);
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', name);
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const row = page.locator('.tree .row', { hasText: name });
  await expect(row).toBeVisible();
  if (floor == null) return;
  await row.click(); // the row is the space's link
  await expect(page).toHaveURL(/\/places\/[^/?]+$/);
  await page.goto(`${page.url()}?edit=1`); await ready(page);
  await page.fill('#e-floor', floor);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#e-floor')).toHaveCount(0);
}
async function addFromSpecies(page: Page, spaceName: string | null) {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await expect(page).toHaveURL(/\/plants\/new\?species=/);
  await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  if (spaceName) {
    const opt = await page.locator('#f-loc option', { hasText: spaceName }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
  } else await page.selectOption('#f-loc', { label: 'No space' });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
}

test('r107b 1: a plant just added opens on its space\'s floor beside the habitat\'s cold floor, and a reload shows no card', async ({ page }) => {
  allowWrites(30_000);
  await space(page, 'East sill', '2');
  await addFromSpecies(page, 'East sill');
  const card = page.locator('#payoff');
  await expect(card.locator('h2')).toHaveText('Your plant against its habitat');
  await expect(page.locator('#payoff-line')).toHaveText("Your East sill: floor 2.0 °C (as you set it), 4.5 °C under this habitat's cold floor, 6.5 °C (one night in a hundred colder, over 40 years, NASA POWER).");
  await expect(card).not.toContainText(/should|too cold|protect/i);
  await page.reload(); await ready(page);
  await expect(page.locator('h1.sci')).toBeVisible();
  await expect(page.locator('#payoff')).toHaveCount(0);
});

test('r107b 2: with no space, the card asks for one, then for its floor, and the line follows; Close puts it away', async ({ page }) => {
  allowWrites(30_000);
  await space(page, 'Bench 2', null);
  await addFromSpecies(page, null);
  const card = page.locator('#payoff');
  await expect(card).toContainText('Where does it live?');
  // Round 119 (MYPLANTS 27 b): six spaces or fewer are chips; one tap places the plant.
  await card.locator('#payoff-chips').getByRole('button', { name: 'Bench 2', exact: true }).click();
  await expect(page.locator('#payoff-line')).toContainText('Your Bench 2 has no floor set');
  await page.fill('#payoff-floor', '10');
  await card.getByRole('button', { name: 'Use this floor' }).click();
  await expect(page.locator('#payoff-line')).toHaveText("Your Bench 2: floor 10.0 °C (as you set it), 3.5 °C over this habitat's cold floor, 6.5 °C (one night in a hundred colder, over 40 years, NASA POWER).");
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#payoff')).toHaveCount(0);
});

test('r107b 3: Today with no plants is one button to add one; the frost watch says why first, and takes a town @phone', async ({ page }) => {
  let asked = '';
  await page.route('**/api/place?**', (r) => { asked = new URL(r.request().url()).searchParams.get('q') ?? ''; return r.fulfill({ json: { q: asked, places: [{ name: 'Kew, London Borough of Richmond upon Thames, England, United Kingdom', lat: 51.479, lon: -0.296 }], credit: 'Places from OpenStreetMap (© OpenStreetMap contributors, ODbL), through Nominatim' } }); });
  await page.route('**/api/forecast?**', (r) => r.abort());
  await page.goto('/today'); await ready(page);
  const add = page.locator('#today-add');
  await expect(add).toHaveText('Add your first plant');
  await expect(add).toHaveAttribute('href', '/plants/new');
  await expect(page.locator('#frost-why')).toHaveText('Your location gives the forecast for your nights. It is kept on this device; only its position, rounded to about a kilometre, goes to MET Norway, through this site.');
  await page.fill('#frost-town-q', 'Kew');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.locator('#frost-town-list + .credit')).toContainText('© OpenStreetMap contributors, ODbL');
  await page.getByRole('button', { name: /^Kew, London Borough/ }).click();
  expect(asked).toBe('Kew');
  await expect(page.locator('#frost-why')).toHaveCount(0); // the site is set: the strip that asked for one is gone
  await page.goto('/settings'); await ready(page);
  await expect(page.locator('#site-lat')).toHaveValue('51.479');
  await expect(page.getByText('Set: Kew, 51.479, -0.296')).toBeVisible();
});
