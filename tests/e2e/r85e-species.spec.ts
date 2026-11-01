/**
 * Round eighty-five, agent E: the species page in the browser. Each fails on r85base; how is said beside it.
 *
 * 1. B3, P3: on the short phones the reviews name (320 by 568, 320 by 700, 375 by 667, and 390 by 664), the habitat's four
 *    figures are on the first screen, above the tab bar, after the one primary action and before the secondary ones; the
 *    optional names and the classification fold into one line that opens. r85base: the line under the bar at 320 by 568.
 * 2. P4, B4, A16g: "Figures ›" and the DLI help take a finger's 44 by 44 px, and their line keeps its height. r85base: 51 by 19.
 * 3. W1, P1, C1, A1: an old name's line says whose verdict it is, never "the GBIF backbone accepts this species as".
 * 4. W5, A16e: the figures by month are twelve rows, the table whole on a desktop and on paper; print asks for the
 *    gallery's photographs. r85base: five rows of twelve months, cut at the scroll box.
 * 5. P6: at 200% text the chart's ticks do not meet and its labels are not cut at the left. r85base: overlapping.
 * 6. A20: with scripts off a phone shows the chart drawn for a phone, its words at least 9 px. r85base: 4.6 px.
 * 7. W13, S9: a page without GBIF's records says "not asked" where its records would be, and "Not compared". (The fixture
 *    has no such page; the words are the unit tests'.)
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const quiet = (p: Page) => p.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort()));
const ready = (p: Page) => p.locator('html[data-ready]').waitFor({ state: 'attached' });

for (const [width, height] of [[320, 568], [320, 700], [375, 667], [390, 664]]) {
  test(`r85e 1: at ${width} by ${height} the habitat's figures are on the first screen, before the secondary actions @phone-only`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await quiet(page);
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const line = page.locator('section.hline');
    await expect(line).toBeVisible();
    const l = (await line.boundingBox())!;
    const bar = (await page.locator('#tabbar').boundingBox())!;
    expect(l.y + l.height, JSON.stringify({ l, bar })).toBeLessThanOrEqual(bar.y + 1); // r85base: 581 against 511 at 320 by 568
    // After the one primary action, before the secondary ones.
    const add = (await page.locator('.idcard .acts .btn.pri').boundingBox())!;
    const acts2 = (await page.locator('.idcard .acts2').boundingBox())!;
    expect(add.y + add.height).toBeLessThanOrEqual(l.y);
    expect(acts2.y).toBeGreaterThanOrEqual(l.y + l.height - 1);
    // The names and the classification in one line that opens, with what it folds.
    const more = page.locator('details.pmore');
    await expect(more).toBeVisible();
    await expect(page.locator('.idcard .vern.meta')).toBeHidden();
    await more.locator('summary').click();
    await expect(more.locator('.pline').first()).toBeVisible();
    await expect(more).toContainText('Cactaceae');
  });
}

test('r85e 2: "Figures ›" and the DLI help take 44 by 44 px under a finger, and their lines keep their height @phone-only', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  for (const sel of ['section.hline a.figs', '.glance a.help']) {
    const a = page.locator(sel).first();
    await a.scrollIntoViewIfNeeded();
    const r = await a.evaluate((e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e, '::after'); return { w: Math.max(b.width, parseFloat(s.width) || 0), h: Math.max(b.height, parseFloat(s.height) || 0), own: b.height, pos: s.position }; });
    expect(r.pos, sel).toBe('absolute');
    expect(r.w, sel).toBeGreaterThanOrEqual(44);
    expect(r.h, sel).toBeGreaterThanOrEqual(44); // r85base: 19 and 22, no margin
    expect(r.own, sel).toBeLessThan(30); // the line's own height is kept
    // The margin is pressable: a tap 18 px under the word's middle lands on the link.
    const b = (await a.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent ?? null, [b.x + b.width / 2, b.y + b.height / 2 + 18]);
    expect(hit, sel).toBe(await a.textContent());
  }
});

test("r85e 3: an old name's line says whose verdict it is, never that GBIF's backbone accepts the heading", async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea?was=Echinocactus%20cinereus');
  const line = page.locator('#was-synonym');
  await expect(line).toBeVisible();
  await expect(line).not.toContainText('accepts this species as'); // r85base: "is a synonym: the GBIF backbone accepts this species as Copiapoa cinerea"
  await expect(line).toContainText("Echinocactus cinereus is an older name of this species in GBIF's backbone, which files it under Copiapoa cinerea. Kew's World Checklist does not list it among this species' synonyms.");
  await expect(line.locator('i')).toHaveText('Copiapoa cinerea');
  // A page without a GBIF key: Kew's verdict, as before.
  await page.goto('/species/hesperocyparis-lusitanica?was=Cupressus%20lusitanica');
  await expect(page.locator('#was-synonym')).toContainText("Kew's World Checklist files it under Hesperocyparis lusitanica");
});

test('r85e 4: the figures by month are twelve rows, whole on a desktop and on paper; print asks for the gallery', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await page.locator('details.figures > summary').click();
  const rows = page.locator('table.wx tbody tr');
  await expect(rows).toHaveCount(12); // r85base: 5
  await expect(rows.first().locator('td').first()).toHaveText('Jan');
  await expect(page.locator('table.wx thead th')).toHaveText(['Month', 'Day °C', 'Night °C', 'Rain mm', 'DLI', 'RH %']);
  const fits = () => page.locator('.figures .scroll-x').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  expect(await fits()).toBe(true); // r85base: 1,430 px in 980
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect(await fits()).toBe(true);
  expect(await page.locator('article.species img[loading="lazy"]').count()).toBe(0); // each photograph asked for before the sheet
});

test('r85e 5: at 200% text the chart\'s ticks do not meet and its labels are not cut at the left @phone', async ({ page }) => {
  await quiet(page);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const fig = page.locator('figure.climo');
  await fig.scrollIntoViewIfNeeded();
  await expect.poll(() => fig.locator('svg').count()).toBe(1);
  // Each panel's ticks, top to bottom, do not overlap one another, and none starts left of the chart.
  await expect.poll(async () => fig.locator('svg').evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    const ticks = [...svg.querySelectorAll('text.tick')].map((t) => t.getBoundingClientRect());
    let meet = 0;
    for (let i = 1; i < ticks.length; i++) { const a = ticks[i - 1], b = ticks[i]; if (Math.abs(a.left - b.left) < 40 && a.top < b.bottom && b.top < a.bottom) meet++; }
    const cut = ticks.filter((t) => t.left < box.left - 0.5).length;
    const small = Math.min(...ticks.map((t) => t.height));
    return { meet, cut, readable: small >= 12 };
  })).toEqual({ meet: 0, cut: 0, readable: true });
});

test('r85e 6: with scripts off a phone shows the chart drawn for a phone, its words readable', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-GB' });
  const page = await ctx.newPage();
  await page.goto('/species/copiapoa-cinerea');
  const svg = page.locator('figure.climo svg:visible');
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveClass(/narrow/);
  const small = await svg.evaluate((s) => Math.min(...[...s.querySelectorAll('text.tick, text.month')].map((t) => t.getBoundingClientRect().height)));
  expect(small).toBeGreaterThanOrEqual(9); // r85base: 4.6 px, the 720-unit chart shrunk
  await ctx.close();
});
