/**
 * Round 119 (MYPLANTS 27, docs/REVIEW-ROUND-119.md): the first ten minutes.
 *
 * - An empty My plants: three ways in (Add a plant first), "What you get", the example a quiet link, joining a sync and
 *   restoring a backup; no numbered steps and no site asked.
 * - On a phone the top bar's + opens the ways in with Sow seed; Escape closes it. On a desktop it is the add form's link.
 * - A plant added: "Added as <number>" with Undo; the card names the spaces as chips, one tap places the plant and the
 *   comparison shows at once with the fixed line; three small steps, Placed marked once placed.
 *
 * On 19ec7a8: FAILED, every test (the numbered steps, a toast "<number> added" with no Undo, a select and "Use this space").
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { allowWrites } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

async function space(page: Page, name: string) {
  await page.goto('/places'); await ready(page);
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', name);
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: name })).toBeVisible();
}

test('r119b 1: an empty My plants is three ways in, what you get and quiet links, and asks nothing first @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const ways = page.locator('#first-ways a.way');
  await expect(ways).toHaveCount(3);
  await expect(ways.nth(0)).toHaveAttribute('href', '/plants/new');
  await expect(ways.nth(1)).toHaveAttribute('href', '/plants/walk');
  await expect(ways.nth(2)).toHaveAttribute('href', '/plants/import');
  await expect(page.locator('#first-ways .gets dt')).toHaveText(['A number and a label', 'Today', 'Its habitat beside your space']);
  await expect(page.locator('#try-sample')).toHaveClass(/linkish/);
  await expect(page.locator('#first-moving a')).toHaveText(['Join your sync', 'restore a backup']);
  await expect(page.locator('#first-ways a[href="/settings#site"], #first-ways a[href="/places#add"]')).toHaveCount(0);
  for (const w of await ways.all()) expect((await w.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test('r119b 2: on a phone the + opens four ways in, Escape closes it; on a desktop it is the add form @phone', async ({ page }) => {
  await page.goto('/today'); await ready(page);
  const plus = page.locator('#topbar a.addbtn');
  const vw = page.viewportSize()!.width;
  if (vw <= 900) {
    await plus.click();
    const menu = page.getByRole('dialog', { name: 'Add' });
    await expect(menu.locator('a.way')).toHaveText([/Add a plant/, /Photo walk/, /Import a list/, /Sow seed/]);
    await expect(plus).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(plus).toBeFocused();
    await plus.click();
    await menu.getByRole('link', { name: /Sow seed/ }).click();
    await expect(page).toHaveURL(/\/propagation\/new$/);
  } else {
    await plus.click();
    await expect(page).toHaveURL(/\/plants\/new$/);
  }
});

test('r119b 3: a plant added says "Added as" with Undo; one tap on a space chip places it and the comparison shows', async ({ page }) => {
  allowWrites(30_000);
  await space(page, 'Bench 2');
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await ready(page);
  await page.selectOption('#f-loc', { label: 'No space' });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const no = page.url().split('/').pop()!;
  const toast = page.locator('.toast');
  await expect(toast).toContainText(`Added as ${no}`);
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
  const steps = page.locator('#setup-steps .setuprow');
  await expect(steps.locator('.t')).toHaveText(['Placed', 'Photograph', 'First measurement']);
  const card = page.locator('#payoff');
  await card.locator('#payoff-chips').getByRole('button', { name: 'Bench 2', exact: true }).click();
  await expect(page.locator('#payoff-line')).toContainText('Your Bench 2');
  await expect(card.locator('#payoff-chips')).toHaveCount(0);
  await expect(steps.first()).toHaveClass(/done/);
  await expect(steps.first()).toHaveAccessibleName('Placed, done');
});

test('r119b 4: Undo on "Added as" removes the plant and opens the list', async ({ page }) => {
  allowWrites(30_000);
  await page.goto('/plants/new?species=Copiapoa%20cinerea'); await ready(page);
  await page.selectOption('#f-loc', { label: 'No space' });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await expect(page.locator('#first-ways')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('removed; its number stays reserved');
});
