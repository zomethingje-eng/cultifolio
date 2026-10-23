/**
 * Round eighty-one (U): the compare tray (the desktop review's 2, the phone review's 2 and 5).
 *
 * 1. With one species in the tray, the tray's way to Compare (the phone's pill, the desktop's page with "pick one more")
 *    opens `/compare` with no columns; a species picked in the page's own field went to `/compare?s=<that one>` and the
 *    tray's species was dropped. Now the tray's species comes first: `?s=<tray>,<picked>`, two columns.
 * 2. On a phone, the pill "Compare 1, pick one more" stood over the add form's pinned bar, covering "Save and add another"
 *    and most of Add (and the batch form's bar). Now it steps aside while a page shows a pinned bar: what is at Add's
 *    centre is Add.
 * 3. On a phone, the toast after Water all ("Watered 1 plant. Undo") landed on the pill. Now it stands above it.
 *
 * On r81base: 1 FAILED (one column, `?s=copiapoa-humilis`); 2 FAILED (the pill's link at Add's centre); 3 FAILED (the toast
 * and the pill overlap).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { inject } from './helpers/inject';

/** One species in the tray, as after one press of Compare on a species page. */
async function trayOfOne(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.compare', JSON.stringify([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }])); } catch { /* none */ } });
}
const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("r81u compare 1: a species picked on the compare page joins the tray's one, which comes first @phone", async ({ page }) => {
  await trayOfOne(page);
  await page.goto('/compare'); await ready(page);
  await expect(page.locator('.emptybox')).toContainText('In the tray: Copiapoa cinerea');
  await page.locator('#cmp-q').fill('Copiapoa humilis');
  const hit = page.locator('.picker .found a', { hasText: 'Copiapoa humilis' });
  await expect(hit).toBeVisible({ timeout: 15_000 });
  expect(await hit.getAttribute('href')).toBe('/compare?s=copiapoa-cinerea,copiapoa-humilis');
  await hit.click();
  await expect(page).toHaveURL(/\/compare\?s=copiapoa-cinerea,copiapoa-humilis$/);
  await expect(page.locator('.cmp .head .nm')).toHaveCount(2);
  await expect(page.locator('.cmp .head .nm').first()).toContainText('Copiapoa cinerea');
});

test('r81u compare 2: on a phone the tray\'s pill steps aside for the add form\'s and the batch form\'s pinned bars @phone-only', async ({ page }) => {
  await trayOfOne(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('.cmppill')).toBeVisible();
  for (const [to, button] of [['/plants/new?species=Copiapoa%20cinerea&key=5384013', /^Add/], ['/propagation/new', /^Start batch/]] as Array<[string, RegExp]>) {
    await page.goto(to); await ready(page);
    const add = page.getByRole('button', { name: button }).last();
    await expect(add).toBeVisible();
    const b = (await add.boundingBox())!;
    // What a finger at the button's centre meets is the button, not the pill.
    const atCentre = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.closest('button, a')?.textContent ?? el.tagName).trim() : 'nothing'; }, [b.x + b.width / 2, b.y + b.height / 2]);
    expect(atCentre, to).toMatch(button);
    await expect(page.locator('.cmppill'), to).toBeHidden();
  }
  // The tray itself is kept: the pill is back on a page with no pinned bar.
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.cmppill')).toBeVisible();
});

test("r81u compare 3: on a phone the toast after Water all stands above the tray's pill, not on it @phone-only", async ({ page }) => {
  await trayOfOne(page);
  await page.goto('/places'); await ready(page);
  await inject(page, [['location', 'gh', 'name', 'Greenhouse'], ['accession', 'r1', 'acc', '2026-0001'], ['accession', 'r1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r1', 'status', 'growing'], ['accession', 'r1', 'nameKind', 'species'], ['accession', 'r1', 'locationId', 'gh']], Date.now() - 86_400_000);
  await page.goto('/places/gh'); await ready(page);
  await expect(page.locator('.cmppill')).toBeVisible();
  await page.getByRole('button', { name: /^Water all/ }).first().click();
  const toast = page.locator('.toast:not(.quiet)');
  await expect(toast).toContainText(/Watered/);
  const t = await box(page, '.toast:not(.quiet)');
  const p = await box(page, '.cmppill');
  expect(overlap(t, p), `toast ${JSON.stringify(t)} pill ${JSON.stringify(p)}`).toBe(false);
  expect(t.y + t.height).toBeLessThanOrEqual(p.y);
});
