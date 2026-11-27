/**
 * Round 130 (MYPLANTS 31, item 5; docs/REVIEW-ROUND-130.md): a plant's page holds "On <space>, against its habitat",
 * open under its figures: SPECIES 20's lens for the plant's space, a small chart, the fixed closing line and the species
 * page. A missing input is its prompt, never a figure; a plant with no space has no card. The fold of rounds fifty-eight
 * to 129 is the card's "how" and keeps every figure it held.
 *
 * On 9176178: FAILED, every test (no card; the fold, closed, was "Habitat vs this space").
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const FORBIDDEN = /\b(will|should|needs?|wants?|tolerates?|survive|die|safe)\b/i;
const plant = (id: string, no: string, loc: string | null): Row[] =>
  Object.entries({ acc: no, taxonName: 'Copiapoa cinerea', status: 'growing', nameKind: 'species', ...(loc ? { locationId: loc } : {}) }).map(([f, v]) => ['accession', id, f, v] as Row);

async function seed(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [
    ['location', 'gh', 'name', 'Glasshouse'], ['location', 'gh', 'type', 'greenhouse'], ['location', 'gh', 'floorC', 5], ['location', 'gh', 'floorHeld', true],
    ['location', 'b2', 'name', 'Bench 2'], ['location', 'b2', 'type', 'bench'], ['location', 'b2', 'parentId', 'gh'],
    ['location', 'ws', 'name', 'Kitchen sill'], ['location', 'ws', 'type', 'windowsill'],
    ...plant('p1', '2026-0001', 'b2'), ...plant('p2', '2026-0002', 'ws'), ...plant('p3', '2026-0003', null)
  ], Date.now() - 5 * DAY, 'r130bbbbbbbbb001');
}

test('r130b 1: a plant on a bench in a greenhouse: the card open, two figures a line, the closing line and the species page @phone', async ({ page }) => {
  await seed(page);
  await page.goto('/plants/2026-0001'); await ready(page);
  const card = page.locator('#compare-card');
  await expect(card.locator('h2')).toHaveText('On Bench 2, against its habitat');
  await expect(card.locator('#cmp-nights')).toContainText(/^Held at 5(\.0)? °C: [\d.]+ °C (under|over) its coolest month's average night \([\d.]+ °C\)\.$/);
  await expect(card).toContainText('It compares. It does not say what the plant will do.');
  await expect(card.getByRole('link', { name: 'The species page' })).toHaveAttribute('href', /\/species\/copiapoa-cinerea#year-panel$/);
  for (const t of await card.locator('p[id^=cmp-]').allTextContents()) expect(t).not.toMatch(FORBIDDEN);
  // the old fold is its "how", closed, with what it held
  await expect(page.locator('#habitat')).not.toHaveAttribute('open', '');
  await page.locator('#habitat > summary').click();
  await expect(page.locator('#habitat')).toContainText('Habitat rain season');
});

test('r130b 2: a windowsill with no light set: its prompt, never a figure; a plant with no space: no card', async ({ page }) => {
  await seed(page);
  await page.goto('/plants/2026-0002'); await ready(page);
  await expect(page.locator('#compare-card h2')).toHaveText('On Kitchen sill, against its habitat');
  await expect(page.locator('#cmp-ask a')).toHaveText('Set its light');
  await expect(page.locator('#cmp-ask a')).toHaveAttribute('href', '/places/ws?edit=1');
  await expect(page.locator('#cmp-light')).toHaveCount(0);
  await page.goto('/plants/2026-0003'); await ready(page);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#compare-card')).toHaveCount(0);
});
