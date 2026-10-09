/**
 * Round sixty-three, agent U (U3): paper. Each page that prints was printed to PDF in Chromium and looked at (the labels
 * page at each of its four sheets, a plant page, a species page, Today, the front page and the plants list, in the light
 * and the dark theme). What these pin:
 * - in the dark theme the figures printed near-white on white paper, since no browser prints the dark ground by default:
 *   paper now takes the light theme's colours, whether the dark theme is the system's or chosen in Settings;
 * - nothing on paper is sticky or fixed (Firefox and Safari can draw such a bar again on each sheet);
 * - a card's edge on paper is an outline, not its shadow, which Firefox and Safari leave off with the backgrounds.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => {
  await context.route(/inaturalist|wikimedia|staticflickr|gbif\.org\/.*\.(jpe?g|png)|api\.gbif\.org\/v1\/image/, (r) => r.abort());
});

const LIGHT_INK = 'rgb(22, 33, 29)'; // --ink of the light theme

for (const how of ['system', 'chosen'] as const) {
  test(`r63u U3: in the dark theme (${how === 'system' ? 'the system\'s' : 'chosen in Settings'}), a species page prints in the light theme's colours`, async ({ page }) => {
    const scheme = how === 'system' ? 'dark' : 'light'; // chosen: dark by the setting on a light system
    await page.emulateMedia({ colorScheme: scheme });
    if (how === 'chosen') await page.addInitScript(() => { try { localStorage.setItem('cultifolio.theme', 'dark'); } catch { /* fine */ } });
    await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); await ready(page);
    if (how === 'chosen') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    // On screen the page is dark: the test is about paper, not about the theme having taken.
    expect(await page.evaluate(() => getComputedStyle(document.body).color)).not.toBe(LIGHT_INK);
    await page.emulateMedia({ media: 'print', colorScheme: scheme });
    const c = await page.evaluate(() => ({
      body: getComputedStyle(document.body).color,
      figure: getComputedStyle(document.querySelector('.card .val, h1') as Element).color,
      card: getComputedStyle(document.querySelector('.card, .idcard') as Element).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme
    }));
    expect(c.body).toBe(LIGHT_INK); // the first run: rgb(232, 238, 235), near-white
    expect(c.figure).toBe(LIGHT_INK);
    expect(c.card).toBe('rgb(255, 255, 255)');
    expect(c.scheme).toBe('light');
  });
}

test('r63u U3: on paper nothing is sticky or fixed, and the cards have an edge that is not a shadow', async ({ page }) => {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); await ready(page);
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const stuck = [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return (s.position === 'fixed' || s.position === 'sticky') && s.display !== 'none' && (e as HTMLElement).offsetParent !== null; }).map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
    const cards = [...document.querySelectorAll('.card, .idcard, .factgrid, .climo')].map((e) => { const s = getComputedStyle(e); return { shadow: s.boxShadow, outline: s.outlineStyle }; });
    return { stuck, cards };
  });
  expect(r.stuck).toEqual([]);
  expect(r.cards.length).toBeGreaterThan(0);
  for (const c of r.cards) { expect(c.shadow).toBe('none'); expect(c.outline).toBe('solid'); }
});
