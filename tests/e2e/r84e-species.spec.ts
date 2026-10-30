/**
 * Round eighty-four, agent E: the species page in the browser.
 *
 * 1. The climate chart at 360 and 320 px is drawn at its shown width, its labels at least 10 px tall (P1). FAILED on
 *    r84base: 4.9 and 4.3 px.
 * 2. On a desktop the four habitat figures fill their row (W3). FAILED on r84base: four of six 153 px tracks.
 * 3. On a phone the habitat in four figures is on the first screen, above the photographs (the owner's decision 3).
 *    FAILED on r84base: none.
 * 4. Paper opens the cultivation sheets, with a script and without one, and the screen is as it was after (W10, A11).
 *    FAILED on r84base: closed.
 * 5. Each map is tied to its caption (B8); "Where this page came from" shows that it opens (W7). FAILED on r84base.
 * 6. With scripts off, the unit switch that cannot work is not shown (A13). FAILED on r84base: shown, pressed.
 * 7. "Not checked" once per source on a page of refusals (A10). FAILED on r84base: the climate's three times.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const quiet = (p: Page) => p.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort()));
const ready = (p: Page) => p.locator('html[data-ready]').waitFor({ state: 'attached' });

for (const width of [360, 320]) {
  test(`r84e 1: the climate chart at ${width} px is drawn at its width, its labels readable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await quiet(page);
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const svg = page.locator('figure.climo svg');
    await svg.scrollIntoViewIfNeeded();
    // Drawn again at the measured width once the page has its scripts: the viewBox's width is the shown width less 20.
    await expect.poll(async () => svg.evaluate((s) => (s as SVGSVGElement).viewBox.baseVal.width)).toBeLessThan(width);
    const heights = await page.locator('figure.climo svg text.tick, figure.climo svg text.month, figure.climo svg text.extlab').evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(10);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(10); // r84base: 4.9 px at 360, 4.3 at 320
    // The extremes' labels stay inside the chart.
    const box = await svg.boundingBox();
    for (const r of await page.locator('figure.climo svg text.extlab').evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect().left))) expect(r).toBeGreaterThanOrEqual(box!.x);
  });
}

test('r84e 2: on a desktop the four habitat figures fill their row, the season card under them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  const grid = page.locator('.glance .gcards');
  const cards = grid.locator(':scope > .card');
  await expect(cards).toHaveCount(4);
  const g = (await grid.boundingBox())!;
  const boxes = await cards.evaluateAll((xs) => xs.map((x) => x.getBoundingClientRect()));
  for (const b of boxes) expect(b.width).toBeGreaterThan(200); // r84base: 153 px
  expect(Math.abs(boxes[3].right - (g.x + g.width))).toBeLessThan(2); // the last card ends the row
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
  await expect(page.locator('.glance .gseason .card.season')).toBeVisible();
});

test('r84e 3: on a phone the habitat in four figures is on the first screen, above the photographs @phone-only', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  const line = page.locator('section.hline');
  await expect(line).toBeVisible();
  await expect(line.locator('dt')).toHaveText(['Cold floor', 'Rain', 'Open-sky light', 'Season']);
  await expect(line.locator('dd').first()).toContainText('1 night in 100 colder');
  await expect(line.locator('dd').first()).toContainText('NASA POWER');
  const top = (await line.boundingBox())!.y;
  expect(top).toBeLessThan(page.viewportSize()!.height - 120); // its first figures are on the first screen
  const strip = await page.locator('a.thumbstrip').boundingBox();
  if (strip) expect(top).toBeLessThan(strip.y);
  // On a desktop it is not shown: the cards are on the first screen there.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(line).toBeHidden();
});

test('r84e 4: paper opens the cultivation sheets, by the script and by the sheet alone, and the screen is as it was after', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const sheets = page.locator('details.acc');
  expect(await sheets.count()).toBeGreaterThan(2);
  // The print sheet alone (no script event): the bodies take room on paper.
  await page.emulateMedia({ media: 'print' });
  // Only an engine with `::details-content` (Chromium 131, Safari 18.4) can open a closed <details> from a style sheet;
  // Firefox prints through the event below (the merge: the owner's PC runs this spec in every engine).
  if (await page.evaluate(() => CSS.supports('selector(::details-content)'))) {
    const shown = await sheets.evaluateAll((xs) => xs.map((x) => x.querySelector('.body')!.getBoundingClientRect().height));
    for (const h of shown) expect(h).toBeGreaterThan(10); // r84base: 0, closed
  }
  await expect(page.locator('.idcard .acts').first()).toBeHidden();
  await expect(page.locator('nav.tabs')).toBeHidden();
  // The script: opened for the print, closed after it.
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  expect(await sheets.evaluateAll((xs) => xs.every((x) => (x as HTMLDetailsElement).open))).toBe(true);
  await expect(page.locator('details.figures')).toHaveAttribute('open', '');
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  expect(await sheets.evaluateAll((xs) => xs.some((x) => (x as HTMLDetailsElement).open))).toBe(false);
});

test('r84e 5: each map is described by its caption; the record of sources shows that it opens', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  for (const [svg, words] of [['svg.map-world', 'Native range'], ['svg.map-region', 'Openly licensed records']] as const) {
    const id = await page.locator(`.mapbox ${svg}`).getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    await expect(page.locator(`#${id}`)).toContainText(words);
  }
  const summary = page.locator('details.prov > summary');
  expect(await summary.evaluate((s) => getComputedStyle(s, '::before').content)).toMatch(/›/);
  await expect(summary.locator('.op')).toHaveText('open');
  await summary.click();
  await expect(summary.locator('.op')).toBeHidden();
});

test('r84e 6: with scripts off the unit switch, which needs them, is not shown', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.glance .useg')).toBeHidden(); // r84base: visible, "°C" pressed, doing nothing
  await expect(page.locator('.glance .card').first()).toBeVisible();
  await ctx.close();
});

test('r84e 7: on a page of refusals each source says "not checked" once', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/refusia-testii');
  await ready(page);
  const text = await page.locator('article.species').innerText();
  // The climate's refusal: the mark under the name; the sheet and the climate section say what follows, not the word again.
  expect(text.match(/Climate not checked/g)?.length).toBe(1);
  expect(text.match(/not checked/gi)?.length).toBeLessThanOrEqual(4); // climate, photographs, the genus's summary, the records; r84base: 6
  await expect(page.locator('#climate-refused')).toContainText('Climate not read.');
  await expect(page.locator('#s-cultivation ~ .note-slot')).toContainText('No sheet: the habitat climate was not read');
});
