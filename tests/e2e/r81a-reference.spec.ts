/**
 * Round eighty-one, agent A (the reference's data on the page):
 * - review D2 and the owner's decision: a species page takes its care group only where Kew's lifeform agrees, and says
 *   so; no group carries a temperature. The fixture Copiapoa cinerea carries Kew's own words ("succulent subshrub").
 * - review W6: a label's care line is whole clauses, never cut mid-figure ("open sky 30–…" on Avery 5160).
 * - review W8: a batch started with the pre-treatment box blank says "not stated", not "none".
 * FAILED on r81base: the group line ended "in the archetype table." with no word of Kew; the care line was one run of
 * text clamped to two lines (no `.cl` clauses), cut where the second line ended; the batch said "Pre-treatment none".
 * Written for every engine the owner's PC runs: no service worker, no wheel, no timing assumed.
 */
import { test, expect, type Page } from '@playwright/test';
import { smokeSetup, ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
smokeSetup();

test('r81a D2: the group is said with Kew\'s words that agree, and no group gives a temperature', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#group-chip')).toHaveText('listed by its genus as a cactus or succulent');
  await expect(page.locator('p.archline')).toHaveText('Grouped as a cactus or succulent, listed under the genus Copiapoa in the reference\'s list of growers\' groups, and Kew describes it as “succulent subshrub”.');
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/convention for|grown indoors is|group min/);
  await page.goto('/about/how'); await ready(page);
  const how = await page.locator('#archetypes + p').innerText();
  expect(how).toContain("only where Kew's own description of the species");
  expect(how).not.toMatch(/12 °C|13 °C|10 °C|5 °C/);
});

test('r81a W6: a label\'s care line is whole clauses, the last ones left off, never one cut short', async ({ page }) => {
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/labels'); await ready(page);
  await page.selectOption('#lb-sheet', '5160');
  const care = page.locator('.page .label .care').first();
  await expect(care.locator('.cl')).toHaveCount(3); // careLine's three clauses, each its own element
  const all = ['cooler six months Nov–Apr', 'floor 6.5 °C (1 in 100, NASA POWER)', 'open sky 30–65 DLI (CHELSA)'];
  // Fitted after layout: wait until what shows is whole clauses that end inside the box.
  await expect.poll(async () => care.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const shown = [...el.querySelectorAll<HTMLElement>(':scope > .cl')].filter((c) => !c.hidden);
    const inside = shown.every((c) => [...c.getClientRects()].every((r) => r.bottom <= box.bottom + 0.5 && r.right <= box.right + 0.5));
    return inside && el.scrollHeight <= el.clientHeight + 1 ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : 'overflowing';
  })).toMatch(new RegExp(`^(${[1, 2, 3].map((n) => all.slice(0, n).join(' · ').replace(/[()]/g, '\\$&')).join('|')})$`));
  // On this stock the three do not fit in two lines: the light is left off whole, the floor kept whole.
  expect(await care.innerText().then((t) => t.replace(/\s+/g, ' ').trim())).toBe('cooler six months Nov–Apr · floor 6.5 °C (1 in 100, NASA POWER)');
  // A wider stock (4 × 2 in) holds all three: the line is fitted again for the new label.
  await page.selectOption('#lb-sheet', '5163');
  await expect.poll(async () => (await page.locator('.page .label .care').first().innerText()).replace(/\s+/g, ' ').trim()).toBe(all.join(' · '));
});

test('r81a W8: a blank pre-treatment is "not stated", as the other blanks are', async ({ page }) => {
  await page.goto('/propagation/new'); await ready(page);
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '12'); // the one figure a batch needs; every optional box is left blank
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  const grid = page.locator('.factgrid');
  await expect(grid.locator('div', { hasText: /^Pre-treatment/ })).toHaveText('Pre-treatmentnot stated');
  await expect(grid.locator('div', { hasText: /^Medium/ })).toHaveText('Mediumnot stated');
});
