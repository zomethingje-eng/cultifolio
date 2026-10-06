/**
 * Review of round sixty, area "visitor-words": two things a stranger sees on the public pages. Both tests FAIL on
 * 21257b7 (reproductions; reproduced by script against the shared build at 127.0.0.1:4173 with the fixture corpus).
 *
 * Lives in tests/e2e/. Run: PW_REUSE=1 npx playwright test tests/e2e/visitor-words--pages.spec.ts
 */
import { test, expect } from '@playwright/test';
import zlib from 'node:zlib';

/** A small solid PNG, so a photograph "loads" with no outside host (the hosts are unreachable from a test). */
function png(w: number, h: number): Buffer {
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 90);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
  test("a species page's photograph shows its credit (author and licence) on a phone, not under the name card", async ({ page }) => {
    await page.route(/inaturalist|wikimedia|api\.gbif\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(400, 300) }));
    await page.goto('/species/copiapoa-cinerea');
    await page.locator('html[data-ready]').waitFor({ state: 'attached' });
    const cred = page.locator('.hero .cred');
    await expect(cred).toContainText('CC BY');
    // Today: elementFromPoint at the credit's left, middle and right is the .idcard each time (margin -30px over the hero).
    const onTop = await cred.evaluate((c) => {
      const r = c.getBoundingClientRect();
      return [r.left + 4, r.left + r.width / 2, r.right - 4].map((x) => { const e = document.elementFromPoint(x, r.top + r.height / 2); return !!e && (e === c || c.contains(e)); });
    });
    expect(onTop).toEqual([true, true, true]);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });
  test('the front page\'s "This is what every species page shows" chart names CHELSA where a reader can see it', async ({ page }) => {
    await page.goto('/');
    await page.locator('html[data-ready]').waitFor({ state: 'attached' });
    const fig = page.locator('section.feature figure.climo');
    await expect(fig).toBeVisible();
    // Today the chart's visible text names only NASA POWER (for the two edge marks); "CHELSA" is in the SVG <desc> alone,
    // so RH 78%, the rain bars and the day and night lines carry no visible source, two lines under "Every figure names its source".
    expect(await fig.evaluate((f) => (f as HTMLElement).innerText)).toMatch(/CHELSA/);
  });
});
