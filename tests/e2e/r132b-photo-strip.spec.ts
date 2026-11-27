/**
 * Round 132 (MYPLANTS 31, item 1; docs/REVIEW-ROUND-132.md): under a plant's leading photograph, the strip by month,
 * "First beside latest" setting the oldest and the newest side by side, and a camera button ("+ Photo") that opens the
 * page's own photo box.
 *
 * On 8d52011: FAILED (the strip's button was "Compare", and the strip had no way to add a photograph).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
async function jpegs(p: Page): Promise<Buffer[]> {
  const b64 = await p.evaluate(() => ['#2a6', '#c63'].map((fill) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d')!; g.fillStyle = fill; g.fillRect(0, 0, 640, 480);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }));
  return b64.map((s) => Buffer.from(s, 'base64'));
}

test('r132b 1: the strip under the leading photograph: First beside latest, and + Photo opens the photo box @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, Object.entries({ acc: '2026-0001', taxonName: 'Copiapoa cinerea', status: 'growing', nameKind: 'species' }).map(([f, v]) => ['accession', 'p1', f, v] as Row), Date.now() - 86_400_000, 'r132bbbbbbbbb001');
  await page.goto('/plants/2026-0001'); await ready(page);
  const [a, b] = await jpegs(page);
  await page.locator('#acc-photo-file').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: a }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: b }]);
  await expect(page.locator('#photo-timeline .strip li')).toHaveCount(2);
  await page.reload(); await ready(page);
  const tl = page.locator('#photo-timeline');
  await expect(tl.locator('#ptl-compare')).toHaveText('First beside latest');
  await tl.locator('#ptl-compare').click();
  await expect(page.locator('#ptl-pair figure')).toHaveCount(2);
  await expect(tl.locator('#ptl-compare')).toHaveText('Close');
  await expect(page.locator('#acc-photo-file')).toHaveCount(0); // the photo box is closed once photographs are there
  await tl.locator('#ptl-add').click();
  await expect(page.locator('#acc-photo-camera')).toBeAttached();
});
