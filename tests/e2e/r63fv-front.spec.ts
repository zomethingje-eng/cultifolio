/**
 * Round sixty-three, the fix pass (fixer V; review R1, finding 8): two smaller points on the front page.
 * - On a phone the desktop's copy of the photo strip is hidden, and its first three photographs were fetched anyway
 *   (eager images are fetched inside `display: none`), two of them at high priority: below the desktop's width that
 *   copy's picture names an inline pixel instead.
 * - A photograph's placeholder printed its dark-theme initial (light) on white paper: paper takes its light tint.
 * And finding 6b: the grower's own tiles on the front page ("your species") name the photograph's licence and author,
 * as the catalogue's tiles do since round sixty-three, instead of only its host.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r63fv-front.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
/** Outside photographs answered with one pixel: the harness has no outside network, and a refused photograph is drawn as a placeholder. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
async function photos(page: Page) {
  await page.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u.href) && !u.href.startsWith('data:'), (r) => r.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL }));
}
/** The strip's first photographs, by copy: what each image is showing (its chosen source). */
const sources = (page: Page, which: 'wideonly' | 'phoneonly') => page.evaluate((w) => [...document.querySelectorAll<HTMLImageElement>(`.featured.${w} img`)].slice(0, 3).map((i) => i.currentSrc || i.src), which);

test('r63fv front 1: on a phone the hidden desktop strip fetches no photograph; on a desktop it shows them', async ({ browser, baseURL }) => {
  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  const p = await phone.newPage();
  await photos(p);
  await p.goto('/'); await ready(p);
  const wide = await sources(p, 'wideonly');
  expect(wide.length).toBeGreaterThan(0);
  for (const s of wide) expect(s.startsWith('data:')).toBe(true);
  await phone.close();
  const desk = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const d = await desk.newPage();
  await photos(d);
  await d.goto('/'); await ready(d);
  const shown = await sources(d, 'wideonly');
  expect(shown.length).toBeGreaterThan(0);
  for (const s of shown) expect(s.startsWith('http')).toBe(true);
  await desk.close();
});

test('r63fv front 2: a photograph\'s placeholder prints dark on white in the dark theme', { tag: '@chromium' }, async ({ page }) => {
  // Every outside photograph refused, so the strip draws its placeholders.
  await page.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u.href), (r) => r.abort());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/'); await ready(page);
  const ini = page.locator('.featured .ph .ini').first();
  await expect(ini).toBeAttached({ timeout: 20_000 });
  const lightness = () => ini.evaluate((el) => { const [r, g, b] = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255; });
  expect(await lightness()).toBeGreaterThan(0.6); // on screen, the dark theme's light initial
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  expect(await lightness()).toBeLessThan(0.45); // on paper, the light theme's dark one
});

test('r63fv front 3: a grower\'s own tiles on the front page credit the photograph as the catalogue\'s do (R1, 6b)', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.prefs', JSON.stringify({ referencePhotos: true })); localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
  await photos(page);
  // The index's entries as a corpus built this round carries them: a thumbnail and its short credit, licence first.
  await page.route('**/api/entries?*', async (r) => {
    const res = await r.fetch();
    const all = (await res.json()) as Array<Record<string, unknown>>;
    await r.fulfill({ response: res, json: all.map((e) => ({ ...e, thumb: e.thumb ?? 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/small.jpg', credit: 'CC BY, Jane Doe' })) });
  });
  await page.goto('/plants'); await ready(page);
  await inject(page, [['accession', 'r63fvc', 'acc', '2026-0001'], ['accession', 'r63fvc', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r63fvc', 'status', 'growing'], ['accession', 'r63fvc', 'nameKind', 'species']], Date.now() - 86_400_000, 'r63fvcreditaaaaa');
  await page.goto('/'); await ready(page);
  const cred = page.locator('a.tile .cred').first();
  await expect(cred).toHaveText('Photo: CC BY, Jane Doe', { timeout: 20_000 });
});
