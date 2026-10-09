import { test, expect, type Page } from '@playwright/test';
import { injectChanges, type Stamped } from './helpers/inject';

/**
 * Round sixty-two, second pass (agent L): the plant and place pages' items, each failing on the first pass.
 *  - a hybrid's page names the parents its record states while the index is asked, never "parentage not stated" (the
 *    self-review's N5, the grower review's 11);
 *  - a cf. plant's species notes are labelled as the compared species' (the grower review).
 * (A third case, the place page's "not asked" alerts, went at the merge: the forecast route no longer answers 'held'.)
 */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
const inject = (page: Page, rows: Stamped[]) => injectChanges(page, rows, []);
const W = 'abcdefabcdef0000';
const stamp = (wall: number, count = 0) => `${String(wall).padStart(13, '0')}-${count.toString(16).padStart(4, '0')}-${W}`;
const plant = (id: string, wall: number, fields: Record<string, unknown>) => Object.entries(fields).map(([field, value], i) => ({ t: stamp(wall, i), kind: 'accession', id, field, value }));

test('a hybrid names the parents its record states while the index is asked (N5)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-hy', Date.now() - 3_600_000, { acc: '2026-0011', taxonName: 'Gasteraloe', cultivar: 'Green Ice', nameKind: 'hybrid', parentage: 'Gasteria batesiana × Aloe aristata', status: 'growing' }));
  // the index answers slowly
  await page.context().route(/\/api\/entries/, async (r) => { await new Promise((f) => setTimeout(f, 4000)); await r.continue(); });
  await page.goto('/plants/2026-0011'); await ready(page);
  const line = page.locator('.parentage');
  await expect(line).toContainText('Gasteria batesiana', { timeout: 2000 });
  await expect(line).toContainText('Aloe aristata');
  await expect(line).not.toContainText('parentage not stated');
});

test('a cf. plant\'s species notes are labelled as the compared species\' notes', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-cf2', Date.now() - 3_600_000, { acc: '2026-0012', taxonName: 'Copiapoa cf. cinerea', status: 'growing' }));
  await page.goto('/plants/2026-0012'); await ready(page);
  await expect(page.locator('#species-notes-head')).toContainText('My notes on Copiapoa cinerea, the species it is compared with');
  await expect(page.locator('#species-notes-head')).toContainText('shared by every plant of that species you own');
});
