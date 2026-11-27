/**
 * Round eighty-seven, stage 2 (the integration) in the browser: the species page with every stage-2 section mounted, on
 * the fixture corpus. Copiapoa cinerea's fixture holds each new field (written by the build's own functions for the
 * habitat's figures, from the fixture's climate); Copiapoa humilis's holds none, so each of its lines says "not asked"
 * or "not worked out", never "none". Each section names its source and the day it was read; the section row lists the
 * new sections; a 320 px phone has no horizontal scroll; and paper keeps every section.
 *
 * Fails on the merge before the integration (933ead6), where no section was mounted on the page.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function noThirdParty(page: Page) { await page.route(/img\.cultifolio\.com|inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort())); }

/** Every section and line of stage 2, by its element, with what it must say of its source and day. */
const SECTIONS: Array<[string, RegExp[]]> = [
  ['section#hardiness', [/USDA zone of the habitat\s*11a/, /39 complete years, 1985–2024/, /H2/, /lowest night in 40 years/, /Lows from fixture/]],
  ['section#climate-class', [/BWk/, /Peel, Finlayson and McMahon \(2007\)/, /Walter–Lieth/, /The months read: fixture: synthetic Atacama-coast normals/]],
  ['section#flowering', [/iNaturalist, read 2026-11-09/, /52 observations/]],
  ['#wfo-line', [/WFO Plant List \(2026-06\)/, /accepted/, /World Flora Online, CC0; read 2026-11-09/]],
  // Round ninety (r90g): the fixture's BHL page was found in the title IPNI links the publication to, and the line says so.
  ['#first-published', [/Cactaceae 3: 86 \(1922\)/, /WCVP, RBG Kew, file of 2026-06-04/, /page by BHL’s resolver for this citation, in the BHL title IPNI links its publication to \(IPNI, RBG Kew\)/]],
  ['#elsewhere', [/Tropicos/, /IUCN Red List/, /Wikidata's item Q5168360, read 2026-11-09, CC0/]],
  ['#chromosome-line', [/2n = 22/, /version 3\.1 of 8 November 2026, CC BY 4\.0; read 2026-11-09/]],
  ['#risk-line', [/21% probability of being threatened/, /Kew's data of 1 February 2024, CC BY 4\.0; read 2026-11-09/, /A model's prediction, not an assessment/]],
  ['#cites-line', [/Listed in Appendix II of CITES \(the Appendices in force from 5 March 2026\)/, /CACTACEAE spp\./, /read 2026-11-09/]]
];

test('r87s2 1: every stage-2 section on the species page, each with its source and the day it was read, where the look puts it @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  for (const [sel, says] of SECTIONS) {
    const el = page.locator(sel);
    await expect(el, sel).toHaveCount(1);
    for (const s of says) await expect(el, `${sel} ${s}`).toContainText(s);
  }
  // Where the page puts them since round 106 (the grower's order): what it is, At home with the cultivation cards, the
  // hardiness, the climate with its class folded under the chart; flowering in "Where it grows wild"; WFO, the publication, Elsewhere and the chromosomes under Names and registers; the risk
  // and CITES under the record's facts.
  const order = await page.evaluate(() => ['#s-summary', '#s-cultivation', 'section#hardiness', '#s-climate', 'section#climate-class', '#s-habitat', 'section#flowering', '#s-registers', '#wfo-line', '#first-published', '#elsewhere', '#chromosome-line', '#s-facts', '#risk-line', '#cites-line'].map((s) => document.querySelector(s)).map((e, i, a) => (i === 0 ? true : !!(a[i - 1]!.compareDocumentPosition(e!) & Node.DOCUMENT_POSITION_FOLLOWING))));
  expect(order.every(Boolean), JSON.stringify(order)).toBe(true);
  // The links IUCN's and Species+'s pages by the ids the page's Wikidata item gives.
  await expect(page.locator('#risk-line a[href="https://www.iucnredlist.org/details/152240/0"]')).toHaveCount(1);
  await expect(page.locator('#cites-line a[href="https://speciesplus.net/#/taxon_concepts/4520"]')).toHaveCount(1);
  await expect(page.locator('#first-published a[href="https://www.biodiversitylibrary.org/page/100001"]')).toHaveCount(1);
  // Round 129: "At home, aim for" is gone into the year panel's lens; its old address lands on the panel.
  await expect(page.locator('section#at-home')).toHaveCount(0);
  await expect(page.locator('#year-panel #at-home')).toHaveCount(1);
});

test('r87s2 2: the section row lists the new sections, and each tab takes the reader to its section', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const tabs = page.locator('nav.tabs a');
  // Round 106 (the first hand-off's round 4): the grower's order, and the section names a grower uses.
  await expect(tabs).toHaveText(['What it is', 'At home', 'How cold', 'Climate', 'Where it grows', 'Photographs', 'Related', 'Names']);
  await tabs.filter({ hasText: 'At home' }).click();
  await expect(page).toHaveURL(/#s-cultivation$/); // round 129: the cultivation cards, "At home, aim for" being in the lens
  await expect(page.locator('nav.tabs a.on')).toHaveText('At home');
  await expect(page.locator('#s-cultivation')).toBeInViewport();
});

test('r87s2 3: a page whose record holds none of the new fields says "not asked" or "not worked out", never none @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-humilis'); await ready(page);
  await expect(page.locator('#risk-line')).toContainText('Predicted extinction risk not asked');
  await expect(page.locator('#cites-line')).toContainText('CITES not asked');
  await expect(page.locator('#chromosome-line')).toContainText('Chromosomes not asked');
  await expect(page.locator('#wfo-line')).toContainText('not asked');
  // Round ninety-two: flowering is counted under the page's GBIF keys, and this page has one: not counted yet.
  await expect(page.locator('#flowering-not-asked')).toContainText("Not asked: this page has not been counted from GBIF's download yet");
  await expect(page.locator('#elsewhere')).toContainText('not asked: this page has no Wikidata item');
  await expect(page.locator('section#hardiness')).toContainText('Not worked out for this page yet');
  await expect(page.locator('section#climate-class')).toContainText('No Köppen–Geiger class is worked out for this page yet');
  await expect(page.locator('#first-published')).toHaveCount(0); // no citation read: no line
  for (const sel of ['#risk-line', '#cites-line', '#chromosome-line', '#wfo-line', '#elsewhere', 'section#flowering', 'section#hardiness', 'section#climate-class']) {
    expect(await page.locator(sel).innerText(), sel).not.toMatch(/\bnone\b/i);
  }
});

test('r87s2 4: on a 320 px phone the new sections stack, with no horizontal scroll @phone-only', async ({ page }) => {
  await noThirdParty(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  for (const sel of ['section#hardiness', 'section#climate-class', 'section#flowering', '#elsewhere', '#risk-line', '#cites-line']) {
    await page.locator(sel).scrollIntoViewIfNeeded();
    const box = await page.locator(sel).boundingBox();
    expect(box!.x + box!.width, sel).toBeLessThanOrEqual(321);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('r87s2 5: paper keeps every stage-2 section, without the tabs', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  // A print fires beforeprint, which opens the folds (round 106 folded the climate class); emulateMedia alone does not, and
  // WebKit has no ::details-content for the print sheet to open them without the script.
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  for (const [sel] of SECTIONS) await expect(page.locator(sel), sel).toBeVisible();
  await expect(page.locator('nav.tabs')).toBeHidden(); // round eighty-four's paper, kept
});
