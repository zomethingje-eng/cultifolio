/**
 * Round 126 (SPECIES 20, the lens, its Outdoors view; docs/REVIEW-ROUND-126.md).
 *
 * - "Compare with: Nothing | Outdoors" on the year panel. With no site set, Outdoors is a prompt to set it, and nothing is
 *   asked of the browser's location or of the site.
 * - With a site, the page asks the site for the one-degree square holding it (only the square's corner), reads the site's
 *   cell on the device, and says the comparison in lines that each name two figures, with the fixed closing line.
 * - The months are held on the reader's while comparing.
 *
 * On b1760eb: FAILED, every test (no "Compare with").
 */
import { test, expect, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
/** A tile whose every cell has nights of 3 °C in November to March and 10 °C otherwise, days 12 °C, 50 mm of rain a month. */
function tile(): Buffer {
  const b = Buffer.alloc(20 * 20 * 36 * 2);
  for (let c = 0; c < 400; c++) for (let m = 0; m < 12; m++) {
    const at = c * 72;
    b.writeInt16LE(120, at + m * 2);
    b.writeInt16LE([0, 1, 2, 10, 11].includes(m) ? 30 : 100, at + (12 + m) * 2);
    b.writeInt16LE(50, at + (24 + m) * 2);
  }
  return gzipSync(b);
}
async function withSite(page: Page) {
  await page.goto('/settings'); await ready(page);
  await page.fill('#site-lat', '51.48');
  await page.fill('#site-lon', '-0.29');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
}

test('r126b 1: with no site, Outdoors asks for one and asks nothing of the site @phone', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/site-climate')) asked.push(r.url()); });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('#lens-row').getByRole('button', { name: 'Outdoors' }).click();
  await expect(page.locator('#lens-card')).toContainText('Set your site in Settings to compare.');
  expect(asked).toEqual([]);
});

test('r126b 2: with a site, one square is asked; the lines name two figures each, and the months are held on yours', async ({ page }) => {
  const asked: string[] = [];
  await page.route('**/api/site-climate?**', (r) => { asked.push(new URL(r.request().url()).search); return r.fulfill({ status: 200, contentType: 'application/gzip', body: tile() }); });
  await withSite(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('#lens-row').getByRole('button', { name: 'Outdoors' }).click();
  await expect(page.locator('#lens-floor')).toContainText('your average night is below its cold floor');
  await expect(page.locator('#lens-floor')).toContainText('November to March');
  await expect(page.locator('#lens-rain')).toContainText('Your rain a year: 600 mm');
  await expect(page.locator('#lens-day')).toContainText('Your day length:');
  await expect(page.locator('#lens-card')).toContainText('It compares. It does not say what the plant will do.');
  await expect(page.locator('#lens-card')).not.toContainText(/\b(will (grow|survive|need)|needs|should)\b/);
  expect(asked).toEqual(['?sq=51,-1']); // the square's corner, nothing finer
  const its = page.getByRole('button', { name: 'Its months', exact: true });
  if (await its.count()) await expect(its).toHaveAttribute('aria-disabled', 'true');
});
