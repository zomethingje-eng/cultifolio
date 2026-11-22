/**
 * Round 106 (docs/PLAN-106.md; the first hand-off's round 4, its rule check): the species page reordered loses no figure
 * and no source. Every figure the page held before the reorder (a number with its unit or what it counts) and every
 * source it named is still in the page's text after it, in a section, a fold or a "How" (the text of a closed fold is
 * in the page as served). The "before" was captured from the pages on dd6265c (round 105) with R106_CAPTURE=1, into
 * tests/e2e/fixtures/r106-figures-before.json, with each page's length at 1280 and on a phone.
 *
 * On dd6265c the test is its own capture, so it passes there by construction; it is the reorder it holds.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

test.use({ serviceWorkers: 'block' });

// The fixture corpus's five species pages: a habitat climate (two), pending (two) and refused (one).
const PAGES = ['copiapoa-cinerea', 'copiapoa-humilis', 'welwitschia-mirabilis', 'hesperocyparis-lusitanica', 'refusia-testii'];
const FILE = 'tests/e2e/fixtures/r106-figures-before.json';
const UNIT = String.raw`(?:°C|°F|mm|in\b|DLI|mol|%|records?\b|cells?\b|years?\b|observations?\b|photographs?\b|species\b|km\b|m\b)`;
const SOURCES = ['CHELSA', 'NASA POWER', 'WCVP', 'GBIF', 'iNaturalist', 'Wikipedia', 'Wikidata', 'Kew', 'OpenAlex', 'Wikimedia Commons', 'WFO', 'CITES', 'ChromoDB', 'IUCN', 'BHL', 'IPNI', 'POWO', 'Köppen'];

async function figures(page: Page) {
  // The article's text, folds and all, less the gauges' scales (a bar's drawn width, not a figure of the plant).
  const text = (await page.locator('article.species').evaluate((el) => (el as HTMLElement).textContent ?? ''))
    .replace(/\s+/g, ' ')
    .replace(/bar 0 to [\d,.]+ (?:mm|in|DLI)/g, '');
  const figs = [...new Set([...text.matchAll(new RegExp(String.raw`-?\d[\d,]*(?:\.\d+)?\s?${UNIT}`, 'g'))].map((m) => m[0].replace(/\s/g, ' ')))].sort();
  const srcs = SOURCES.filter((s) => text.includes(s));
  return { figs, srcs };
}

async function lengthAt(page: Page, width: number, height: number, slug: string) {
  await page.setViewportSize({ width, height });
  await page.goto(`/species/${slug}`);
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  return page.evaluate(() => document.documentElement.scrollHeight);
}

test('r106c: every figure and source the species page held before the reorder is still on it', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'the text is the same in every engine; read once');
  test.setTimeout(240_000);
  const capture = process.env.R106_CAPTURE === '1';
  const before: Record<string, { figs: string[]; srcs: string[]; desktop: number; phone: number }> = capture || !existsSync(FILE) ? {} : JSON.parse(readFileSync(FILE, 'utf8'));
  const now: typeof before = {};
  for (const slug of PAGES) {
    const r = await page.goto(`/species/${slug}`);
    if (!r || r.status() !== 200) continue;
    await page.locator('html[data-ready]').waitFor({ state: 'attached' });
    const f = await figures(page);
    now[slug] = { ...f, desktop: await lengthAt(page, 1280, 800, slug), phone: await lengthAt(page, 390, 844, slug) };
  }
  if (capture) {
    mkdirSync('tests/e2e/fixtures', { recursive: true });
    writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
    return;
  }
  expect(Object.keys(before).sort(), 'the capture holds every page').toEqual([...PAGES].sort());
  for (const [slug, b] of Object.entries(before)) {
    expect(now[slug], `${slug} still answers`).toBeTruthy();
    // A figure is the same figure with or without a space before its unit ("22 °C" in a card, "22°C" in a line).
    const flat = (xs: string[]) => new Set(xs.map((x) => x.replace(/\s/g, '')));
    const has = flat(now[slug].figs);
    expect([...flat(b.figs)].filter((x) => !has.has(x)), `${slug}: figures gone`).toEqual([]);
    expect(b.srcs.filter((x) => !now[slug].srcs.includes(x)), `${slug}: sources gone`).toEqual([]);
  }
  // The lengths, before and after, for the record (docs/REVIEW-ROUND-106.md).
  info.annotations.push({ type: 'lengths', description: JSON.stringify(Object.fromEntries(Object.entries(now).map(([s, x]) => [s, { desktop: [before[s]?.desktop, x.desktop], phone: [before[s]?.phone, x.phone] }]))) });
  console.log('r106c lengths', JSON.stringify(Object.fromEntries(Object.entries(now).map(([s, x]) => [s, { desktop: [before[s]?.desktop, x.desktop], phone: [before[s]?.phone, x.phone] }]))));
});
