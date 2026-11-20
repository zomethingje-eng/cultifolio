/**
 * Round one hundred: a backup file opened on /backup while the collection is still opening. The preview ("What's in the
 * file" and Merge) is shown only after the collection is open, so what sits above it (the keep-your-plants card, which
 * appears once the collection holds plants) is laid out first and nothing moves the preview under a press.
 *
 * Round 99's gate (WebKit phone, r69p P5 on /backup): the summary was at 683 px at the press and 796 at the release, the
 * card having arrived after the preview; the press was lost. On effd066, with 1,000 plants folding while a one-plant file
 * was read, the preview was on the page before the card: FAILED.
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const HOUR = 3_600_000;

test('r100c: a file opened while the collection opens: the card is on the page before the preview @phone', async ({ page, browser }) => {
  test.setTimeout(120_000);
  // the file: one plant, from another device
  await page.goto('/plants'); await ready(page);
  await inject(page, [['accession', 'f1', 'acc', '2026-0001'], ['accession', 'f1', 'taxonName', 'Aloe vera'], ['accession', 'f1', 'status', 'growing']], Date.now() - HOUR, 'aaaaaaaaaaaa0001');
  await page.goto('/backup'); await ready(page);
  const dl = page.waitForEvent('download');
  await page.locator('#bk-export').click();
  const file = (await (await dl).path())!;

  // this device: many plants, so the collection takes a while to open
  const other = await browser.newContext({ serviceWorkers: 'block', viewport: page.viewportSize() ?? undefined });
  const b = await other.newPage();
  await b.goto('/plants'); await ready(b);
  const rows: Row[] = [];
  for (let i = 0; i < 1000; i++) {
    const id = `m${i}`;
    rows.push(['accession', id, 'acc', `2025-${String(i + 1).padStart(4, '0')}`], ['accession', id, 'taxonName', 'Mammillaria elongata'], ['accession', id, 'status', 'growing']);
  }
  await inject(b, rows, Date.now() - 2 * HOUR, 'bbbbbbbbbbbb0002');
  // record, as the preview first appears, whether the card is already there
  await b.addInitScript(() => {
    const w = window as unknown as { __order?: string };
    new MutationObserver(() => {
      if (w.__order || !document.getElementById('bk-preview')) return;
      w.__order = document.querySelector('.cult.warn') ? 'card first' : 'preview first';
    }).observe(document, { childList: true, subtree: true });
  });
  await b.goto('/backup', { waitUntil: 'commit' });
  await b.locator('#bk-file').setInputFiles(file);
  await expect(b.locator('#bk-preview')).toBeVisible({ timeout: 60_000 });
  expect(await b.evaluate(() => (window as unknown as { __order?: string }).__order)).toBe('card first');
  await other.close();
});
