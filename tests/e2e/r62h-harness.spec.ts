/**
 * Round sixty-two, agent H (triage decision 10): what the harness reviews found no test for.
 * - A batch page is keyed by its record, as the plant and place pages are, and only those two were tested
 *   (the round-sixty-one self-review's harness 1: `propagation/[id]`'s `{#key}` had no test at all).
 * - The front page writes no "this device has plants" hint from the sample collection (outside review A41, 7: the
 *   front page's own guard could be removed with every test green; r61g 6 reads the hint on /labels, not on /).
 * - The reference's photograph on a plant page offers "add your own", over a local image (outside review B14: the photo
 *   flow in smoke.spec.ts no longer waits for an outside host, so this part of it is here, on its own).
 *
 * Run against a server already up: PW_PORT=4196 PW_REUSE=1 npx playwright test tests/e2e/r62h-harness.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { inject, type Row } from './helpers/inject';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** A small solid PNG, so a photograph "loads" with no outside host (as r61w-pages.spec.ts makes one). */
function png(w: number, h: number): Buffer {
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 90);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const batch = (id: string, no: string, name: string, notes: string): Row[] => [['sowing', id, 'no', no], ['sowing', id, 'taxonName', name], ['sowing', id, 'method', 'seed'], ['sowing', id, 'sown', '2026-03-01'], ['sowing', id, 'count', 12], ['sowing', id, 'status', 'active'], ['sowing', id, 'notes', notes]];

test("a batch's edit form does not follow the shared-number link to another batch (propagation/[id]'s key; harness 1)", async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // "Leave this page? What you typed here will be lost."
  await page.goto('/propagation'); await ready(page);
  await inject(page, [...batch('s-a', 'S2026-042', 'Copiapoa cinerea', 'A: first sowing'), ...batch('s-b', 'S2026-042', 'Lithops lesliei', 'B: from the club')], Date.now() - 3_600_000);
  await page.goto('/propagation/s-a'); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#se-notes', 'A: typed, not saved');
  await page.locator('#shared-number a', { hasText: 'Lithops' }).first().click();
  await expect(page).toHaveURL(/\/propagation\/s-b$/);
  await expect(page.locator('h1')).toContainText('Lithops lesliei');
  await expect(page.locator('#se-notes')).toHaveCount(0); // the page is made afresh for the other batch: no form carried over
  await expect(page.locator('main')).toContainText('B: from the club');
  await page.goto('/propagation/s-a'); await ready(page);
  await expect(page.locator('main')).toContainText('A: first sowing'); // and nothing was saved to either
});

test('in the sample collection the front page writes no "this device has plants" hint (A41, 7)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull();
  await page.goto('/'); await ready(page);
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible({ timeout: 20_000 }); // the front page read the sample as a grower's
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull();
  // Leave loads the front page afresh (`location.href`) from the front page: the URL matches before that load has run, so
  // the test waits for the load itself; reading storage while it ran destroyed the context in the full run (round
  // sixty-two second pass; the harness's full run).
  const loaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await loaded; await ready(page);
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull(); // the grower's own collection is empty
});

test('a plant page with the reference\'s photograph on shows it, credited, offering "add your own" (B14, over a local image)', async ({ page }) => {
  await page.route(/inaturalist|wikimedia|api\.gbif\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(400, 300) }));
  await page.goto('/settings'); await ready(page);
  await page.check('#pref-refphotos'); // the species' photograph on a private page is opt-in (round twelve, A1)
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  // Hydrated first: a click before then has no handler, and the full run on a loaded machine failed here twice, still on
  // the form (round sixty-two second pass; the harness's full run).
  await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 15_000 });
  await ready(page);
  await expect(page.locator('.hero img.spthumb')).toBeVisible();
  await expect(page.locator('.hero button.cred')).toContainText('add your own');
  await page.locator('.hero button.cred').click();
  await expect(page.locator('#photos')).toBeInViewport();
  await expect(page.locator('#acc-photo-camera')).toBeAttached();
});
