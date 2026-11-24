/**
 * Round 103 (docs/PLAN-103.md; the launch review's round 2): the top of a species page. The habitat in short is on a
 * desktop's first screen with its four figures, each with its source, and the records it is read from; a pending page says
 * pending there. A dotted word opens its meaning by keyboard and by touch, is described by it while open, closes on Escape,
 * and its "More" lands on its glossary entry. Every page's title describes it.
 *
 * On f7f2867: the strip was hidden from 641 px (the glance cards begin at y 753 on cultifolio.com at 1024 × 768, 1280 × 800
 * and 1440 × 900), there were no tips, and a page without a habitat climate was titled by its name: every test FAILED.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'en-GB', serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

for (const [width, height] of [[1024, 768], [1280, 800], [1440, 900]] as const) {
  test(`r103d 1: at ${width} × ${height} the habitat in short is on the first screen, each figure with its source`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const line = page.locator('section.hline');
    await expect(line).toBeVisible();
    const b = (await line.boundingBox())!;
    // Round 114: the habitat's figures on the first screen are "Habitat in brief"'s, which comes first; its first three
    // lines are on it. The six answers follow it.
    const br = (await page.locator('section.brief').boundingBox())!;
    expect(br.y + 72, `brief at ${br.y} of ${height}`).toBeLessThanOrEqual(height);
    expect(b.y).toBeGreaterThan(br.y);
    const figs = line.locator('dl > div');
    await expect(figs).toHaveCount(6);
    for (const [i, src] of ['NASA POWER', 'CHELSA, NASA POWER', 'CHELSA', 'CHELSA', 'CHELSA', 'ETOPO 2022'].entries()) await expect(figs.nth(i).locator('dd i')).toHaveText(src);
    await expect(line.locator('.hfrom')).toHaveText(/^The wild habitat’s figures, from [\d,]+ records? in [\d,]+ grid cells? · How$/);
  });
}

test('r103d 2: a pending page says pending in the strip, not none (rule 2) @phone', async ({ page }) => {
  await page.goto('/species/welwitschia-mirabilis');
  await ready(page);
  await expect(page.locator('#hline-state')).toHaveText('Habitat climate pending. It has not been derived yet; this is not a refusal.');
  // Round 114: the six answers' row is kept, a dash in each slot, no figure.
  await expect(page.locator('section.hline dl.dashes dd')).toHaveText(['–', '–', '–', '–', '–', '–']);
  await expect(page.locator('.idcard .pill', { hasText: 'Climate pending' })).toHaveCount(0); // said once, in the strip
});

test('r103d 3: a dotted word opens by keyboard, is described while open, closes on Escape, and "More" lands on its entry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const word = page.locator('section.hline button.tw', { hasText: 'Cold floor' });
  await word.focus();
  await expect(word).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(word).toHaveAttribute('aria-expanded', 'true');
  const tip = page.locator(`#${await word.getAttribute('aria-describedby')}`);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('The 1st-percentile night at a typical spot in the range, from NASA POWER');
  await page.keyboard.press('Escape');
  await expect(word).toHaveAttribute('aria-expanded', 'false');
  await expect(word).not.toHaveAttribute('aria-describedby', /./);
  // Open again with Space, and follow "More".
  await word.focus();
  await page.keyboard.press('Space');
  await page.locator('section.hline .tip a', { hasText: 'More' }).click();
  await page.waitForURL(/\/about\/how#term-cold-floor$/);
  await expect(page.locator('#term-cold-floor dt')).toHaveText('Cold floor');
});

test('r103d 4: on a phone a tap opens a word\'s meaning and a tap elsewhere closes it @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const word = page.locator('section.hline button.tw', { hasText: 'DLI' });
  await word.click();
  await expect(page.locator('section.hline .tip:not([hidden])')).toContainText('Daily light integral');
  await page.locator('h1').click();
  await expect(page.locator('section.hline .tip:not([hidden])')).toHaveCount(0);
});

test('r103d 5: every word of art in the cards is a tip, named and reachable by Tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const words = (await page.locator('button.tw').allTextContents()).map((w) => w.trim()); // the climate note's are in a folded section
  for (const w of ['Cold floor', 'DLI', 'a typical spot in the range', 'cells', '10th–90th percentile span']) expect(words, w).toContain(w);
  for (const b of await page.locator('button.tw').all()) expect(await b.getAttribute('tabindex')).not.toBe('-1');
});

test('r103d 6: every fixture page\'s title says what it holds, within 60 characters before the site\'s name', async ({ page }) => {
  for (const [slug, want] of [
    // Round 114 (SPECIES 18 d, the owner's call 1): a page with a hardiness zone or its daily extremes says so, past 60.
    ['copiapoa-cinerea', 'Copiapoa cinerea: hardiness zone, minimum temperature, habitat climate'],
    ['welwitschia-mirabilis', 'Welwitschia mirabilis: native range and photographs'],
    ['refusia-testii', 'Refusia testii: native range'],
    ['hesperocyparis-lusitanica', 'Hesperocyparis lusitanica (Mexican cypress): native range']
  ] as const) {
    await page.goto(`/species/${slug}`);
    await ready(page);
    await expect(page, slug).toHaveTitle(`${want} · Cultifolio`);
    await expect(page.locator('meta[property="og:title"]'), slug).toHaveAttribute('content', want);
    if (!want.includes('hardiness zone')) expect(want.length).toBeLessThanOrEqual(60);
  }
});
