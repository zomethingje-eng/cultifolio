/**
 * Round eighty-five, the merge (agent M): what the merge did to pages, in the browser. Each FAILED on r85base:
 *
 * 1. W12: /labels draws its preview once the collection is open, the footer waiting for it; on r85base the list's arrival shifted the preview
 *    (0.039 here, 0.081 in review W's runs). Read with a layout-shift observer: Chromium's alone.
 * 2. W11: two plants of one species are "2 plants" on the front page's tile, not "× 2".
 * 3. W11: compare says a failed photograph in its box, with the name, never a blank slab.
 * 4. S9: the front page's chip says "not asked" for a page with no GBIF key, apart from "not checked".
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { framesSettled } from './helpers/settled';
import { chromiumOnly } from './helpers/engines';

test.use({ serviceWorkers: 'block' });
const SHIFTS = 'a layout-shift reading, which only Chromium reports; the preview drawn once the collection is open is what every engine draws';
const plants = (n: number, name = (i: number) => (i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis')): Row[] => Array.from({ length: n }, (_, k) => k + 1).flatMap((i) => [['accession', `p${i}`, 'taxonName', name(i)], ['accession', `p${i}`, 'status', 'growing'], ['accession', `p${i}`, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', `p${i}`, 'acquired', '2025-03-01']] as Row[]);

test('r85m 1: /labels does not move as its plants arrive (W12) @phone', chromiumOnly(SHIFTS), async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(30), Date.now() - 86_400_000, 'mmmmmmmmmmmmmmm1');
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number[] };
    w.__cls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('.picklist label.pick')).toHaveCount(30, { timeout: 20_000 });
  await expect(page.locator('.sheets')).toBeAttached(); // the preview, drawn once the collection is open
  await framesSettled(page);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number[] }).__cls.reduce((a, b) => a + b, 0));
  console.log(`r85m 1: CLS ${cls.toFixed(6)}`);
  expect(cls).toBeLessThan(0.005); // r85base: 0.039
});

test('r85m 2: two plants of one species are counted in words on the front page (W11) @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(2, () => 'Copiapoa cinerea'), Date.now() - 86_400_000, 'mmmmmmmmmmmmmmm2');
  await page.goto('/'); await ready(page);
  await expect(page.locator('a.tile .ownchip').first()).toHaveText('2 plants'); // r85base: "× 2"
});

test('r85m 3: compare says a photograph that did not load, in its box (W11) @phone', async ({ page }) => {
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r) => r.abort());
  await page.goto('/compare?s=copiapoa-cinerea,welwitschia-mirabilis'); await ready(page);
  await expect(page.locator('.head .hero', { hasText: 'photograph did not load' }).first()).toBeVisible(); // r85base: an empty box
});

test('r85m 4: the climate chip says not asked apart from not checked (S9) @phone', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await expect(page.locator('.chiprow a[href*="chip=noclimate"]')).toContainText('1 not asked'); // r85base: "2 not checked"
});

test('r85m 5: a second pasted list adds its lines imported before as new plants, on one press (K\'s W10, in the browser) @phone', async ({ page }) => {
  const paste = async () => {
    await page.goto('/plants/import'); await ready(page);
    await page.fill('#imp-text', 'Copiapoa cinerea\nWelwitschia mirabilis');
    await page.click('#imp-check');
  };
  await paste();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('2 plants added');
  await paste();
  await expect(page.locator('#imp-done-lines')).toContainText('2 lines were imported before');
  await page.locator('#imp-add-done').click(); // "They are new plants: add all 2"
  await expect(page.locator('#imp-add')).toContainText('Add 2', { timeout: 15_000 });
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('2 plants added');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('a.accrow')).toHaveCount(4, { timeout: 15_000 });
});
