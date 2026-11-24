/**
 * Round 106 (docs/PLAN-106.md; the first hand-off's round 4): the species page reordered around the grower's question.
 *
 * - The sections in the grower's order: what it is, at home (the table, then the cultivation cards, the first open),
 *   hardiness, the climate (one chart, the climate class and the figures by month folded under it), where it grows wild
 *   (with flowering), photographs, related, names and registers, the record. The section row says so in those words.
 * - The glance cards and the year strip are gone; "Habitat in short" holds the four figures, and its "Figures" link goes to
 *   the Climate section.
 * - "Show in my months" in both hemispheres: Copiapoa cinerea's habitat is southern, so a northern reader (or one whose
 *   hemisphere is not known) has the switch, which redraws the chart six months on and back; a southern reader has none,
 *   and the page says the habitat's months are theirs.
 * - Related: in each strip the tiles with a photograph come first.
 * - The hand-off asks that axe find no violations. axe is not among the project's packages (package.json is the owner's to
 *   change), so this test holds the page to the checks axe would make of a reorder, by hand: every id once, every button
 *   and link named, every image named or hidden, and no heading level skipped, with every fold open.
 *
 * On dd6265c: FAILED, every test. The page opened on the glance cards with the summary under them, its row read
 * "Hardiness · Climate class · At home · Cultivation · Climate · Habitat …", and the chart had no switch.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function noThirdParty(page: Page) { await page.route(/img\.cultifolio\.com|inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort())); }
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
/** Each selector follows the one before it in the page. */
const inOrder = (page: Page, sels: string[]) => page.evaluate((sels) => sels.map((s) => document.querySelector(s)).map((e, i, a) => (e ? (i === 0 ? true : !!a[i - 1] && !!(a[i - 1]!.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) : `missing ${sels[i]}`)), sels);

test('r106b 1: the sections in the grower\'s order, and the section row in their words @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const order = await inOrder(page, ['#s-summary', 'section.hline', 'nav.tabs', 'section#at-home', '#s-cultivation', 'section#hardiness', '#s-climate', 'figure.climo', '#year-lines', '#climate-class-fold', '#s-habitat', 'section#flowering', '#s-photos', '#s-related', '#s-registers', '#s-facts']);
  expect(order.every((x) => x === true), JSON.stringify(order)).toBe(true);
  await expect(page.locator('#s-summary')).toHaveText('What it is');
  await expect(page.locator('#s-habitat')).toHaveText('Where it grows wild');
  await expect(page.locator('nav.tabs a')).toHaveText(['What it is', 'At home', 'How cold', 'Climate', 'Where it grows', 'Photographs', 'Related', 'Names']);
  // The glance cards and the year strip are gone; the four figures are "Habitat in short"'s, and "Figures" goes to the chart.
  await expect(page.locator('#s-glance, .glance, .gseason')).toHaveCount(0);
  await expect(page.locator('section.hline a.figs')).toHaveAttribute('href', '#s-climate');
  // The first cultivation card is open; the climate class and the figures by month are closed folds.
  await expect(page.locator('details.cult.acc').first()).toHaveAttribute('open', '');
  await expect(page.locator('#climate-class-fold')).not.toHaveAttribute('open', '');
  await expect(page.locator('#climate-class-fold > summary')).toHaveText('Climate class and the Walter–Lieth diagram');
  await page.locator('#climate-class-fold > summary').click();
  await expect(page.locator('section#climate-class')).toBeVisible();
});

test('r106b 2: "Show in my months" for a northern reader moves the chart six months, and back', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const sw = page.getByRole('button', { name: 'Show in my months' });
  const cal = page.locator('figure.climo .cal');
  const desc = page.locator('figure.climo svg:visible desc');
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  await expect(cal).toHaveText('Habitat months, southern hemisphere');
  await expect(desc).toContainText('Warmest months January and February');
  await expect(page.locator('#year-hemi')).toContainText('Your hemisphere is not the habitat\'s');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await expect(cal).toHaveText('Your months, northern hemisphere: the habitat\'s moved by six');
  await expect(desc).toContainText('Warmest months July and August');
  await expect(desc).toContainText('coldest month January');
  await sw.click();
  await expect(cal).toHaveText('Habitat months, southern hemisphere');
  await expect(desc).toContainText('Warmest months January and February');
});

test('r106b 3: a southern reader has no switch, and is told the habitat\'s months are theirs', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/settings'); await ready(page);
  await page.fill('#site-lat', '-33.9');
  await page.fill('#site-lon', '18.4');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#year-hemi')).toContainText('Your hemisphere is the habitat\'s, so its months are yours. Your hemisphere from your site.');
  await expect(page.getByRole('button', { name: 'Show in my months' })).toHaveCount(0);
  await expect(page.locator('figure.climo .cal')).toHaveText('Habitat months, southern hemisphere');
});

test('r106b 4: related tiles with a photograph come first in each strip', async ({ page }) => {
  await noThirdParty(page);
  for (const slug of ['copiapoa-cinerea', 'copiapoa-humilis']) {
    await page.goto(`/species/${slug}`); await ready(page);
    const strips = await page.locator('.relstrip').evaluateAll((xs) => xs.map((s) => [...s.querySelectorAll('a.reltile:not(.more)')].map((t) => !!t.querySelector('img'))));
    expect(strips.length, slug).toBeGreaterThan(0);
    for (const s of strips) expect(s, `${slug}: ${JSON.stringify(s)}`).toEqual([...s].sort((a, b) => Number(b) - Number(a)));
  }
});

test('r106b 5: the reordered page, every fold open: ids once, controls and images named, no heading level skipped @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.evaluate(() => document.querySelectorAll('article.species details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const r = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const twice = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    const art = document.querySelector('article.species')!;
    const unnamed = [...art.querySelectorAll('button, a[href]')].filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || (e.textContent ?? '').trim() || e.querySelector('img[alt]:not([alt=""])'))).map((e) => e.outerHTML.slice(0, 80));
    const bareImg = [...art.querySelectorAll('img')].filter((e) => !e.hasAttribute('alt')).map((e) => e.outerHTML.slice(0, 80));
    const levels = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main [role="heading"]')].map((h) => Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)));
    const skips = levels.map((l, i) => (i && l > levels[i - 1] + 1 ? `h${levels[i - 1]} to h${l}` : '')).filter(Boolean);
    return { twice, unnamed, bareImg, skips };
  });
  expect(r).toEqual({ twice: [], unnamed: [], bareImg: [], skips: [] });
});
