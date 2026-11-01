/**
 * Round eighty-five, agent U: the collection's pages and the frame, as the reviews of 08094db found them. Each test failed
 * on r85base, as its comment says (checked by running this file against a build of r85base).
 *
 * - W8: the "You grow" tile of a plant filed under a genus read "loading…" for good.
 * - W7: with one species picked, the desktop tray's "pick one more" was plain text, and the species page's "In compare ✓"
 *   took the species out when pressed.
 * - W14, P7: the top bar's crumb cut "SPECIES" to "SPECIE" with no ellipsis at 640 x 400, and at 320 px left the
 *   species' name as an ellipsis alone.
 * - A19: Today said "backup today" for a backup mark it could not read.
 * - A17, C7: a photograph the server failed to hand over was told only to the console; the status card said "Synced,
 *   everything on the server is here".
 * - A16h: the search box had no arrow keys, and a letter of the index whose rows were being fetched showed nothing.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready, syncRun } from './helpers/smoke';
import { fromAddress } from './helpers/address';
import { writeWait, allowWrites } from './helpers/pace';

// The app's own routes only: no service worker stands between the page and what a route holds back.
test.use({ serviceWorkers: 'block' });

/** The page's collection open, its stores made: the helpers write into them. */
async function opened(page: Page, path = '/plants'): Promise<void> {
  await page.goto(path); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: writeWait(15_000, 50) });
}
/** A meta record written as the app writes it. */
async function setMeta(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(async ({ key, value }) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = d.transaction(['meta'], 'readwrite'); // raw-ok: a meta mark (lastBackup, as the backup page writes it), no change and no arrival row
    tx.objectStore('meta').put(value, key); // raw-ok: the same mark
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    d.close();
  }, { key, value });
}
const plant = (id: string, acc: string, name: string, extra: Row[] = []): Row[] => [['accession', id, 'acc', acc], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ...extra];

test('W8: a plant filed under its genus has a genus tile, never "loading…" @phone', async ({ page }) => {
  allowWrites(30_000);
  await opened(page, '/');
  await inject(page, [...plant('g1', '2026-0001', 'Echeveria', [['accession', 'g1', 'cultivar', 'Lola'], ['accession', 'g1', 'nameKind', 'cultivar']]), ...plant('s1', '2026-0002', 'Copiapoa cinerea', [['accession', 's1', 'nameKind', 'species']])], Date.now() - 86_400_000, 'r85uuuuuuuuuuuu1');
  await page.goto('/'); await ready(page);
  const tile = page.locator('.hgrid.mine a.tile', { hasText: 'Echeveria' });
  await expect(tile).toBeVisible({ timeout: writeWait(15_000, 50) });
  // The species' tile has settled (its photograph or its placeholder), so the genus's has had every chance to.
  await expect(page.locator('.hgrid.mine a.tile', { hasText: 'Copiapoa cinerea' }).locator('.im')).not.toHaveText(/loading…/);
  await expect(tile.locator('.im')).toContainText('genus'); // r85base: "loading…", for good
  await expect(tile.locator('.im')).not.toContainText('loading');
  await expect(tile.locator('.fig')).toHaveText('genus: its row of the catalogue');
});

test('W7: with one species picked, the desktop tray leads to the compare page, and the button says it removes', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const tray = page.locator('.tray');
  await expect(tray).toContainText('pick one more');
  // The button now says what a press does (r85base: "In compare ✓").
  const remove = page.getByRole('button', { name: 'Remove from compare' });
  await expect(remove).toBeVisible();
  // The tray's "pick one more" is the way on (r85base: plain text, no link).
  const more = tray.getByRole('link', { name: /pick one more/ });
  await expect(more).toHaveAttribute('href', '/compare');
  // A target as tall as the tray's other controls (the theme's tap size).
  const [box, clear] = await Promise.all([more.boundingBox(), tray.getByRole('button', { name: 'Clear the compare tray' }).boundingBox()]);
  expect(box!.height).toBeGreaterThanOrEqual(clear!.height - 0.5);
  await more.click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.locator('.emptybox')).toContainText('In the tray: Copiapoa cinerea');
  // And Remove from compare takes it out, and the button says Compare again.
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.getByRole('button', { name: 'Remove from compare' }).click();
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeVisible();
  await expect(page.locator('.tray')).toHaveCount(0);
});

/** The crumb as drawn: each part's box against the nav's, whether it is cut, and whether a cut is marked. */
async function crumb(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav.crumb')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('nav.crumb li')].filter((li) => li.getClientRects().length).map((li, i, all) => {
      const r = li.getBoundingClientRect();
      const s = getComputedStyle(li);
      return { text: li.textContent!.replace(/\s+/g, ' ').trim(), last: i === all.length - 1, left: r.left, right: r.right, navLeft: nav.left, navRight: nav.right, width: r.width, cut: li.scrollWidth > li.clientWidth + 1, ellipsis: s.textOverflow === 'ellipsis' && s.overflow === 'hidden' };
    });
  });
}

test.describe('W14, P7: the crumb at 640 x 400', () => {
  test.use({ viewport: { width: 640, height: 400 } });
  test('where the five places are in the bar, the crumb is read and not drawn, and nothing in the bar is cut', async ({ page }) => {
    for (const path of ['/plants', '/species/copiapoa-cinerea']) {
      await page.goto(path); await ready(page);
      const drawn = await page.evaluate(() => { const ol = document.querySelector('nav.crumb ol')!; const r = ol.getBoundingClientRect(); return { w: r.width, h: r.height, text: ol.textContent!.trim() }; });
      expect(drawn.w * drawn.h, `${path} ${JSON.stringify(drawn)}`).toBeLessThanOrEqual(1); // r85base: "SPECIE", cut with no mark
      // Still the page's trail to a screen reader.
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(path === '/plants' ? 'My plants' : 'Copiapoa cinerea');
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: path === '/plants' ? 'My plants' : 'Species', exact: true })).toHaveAttribute('aria-current', 'page');
    }
  });
});

for (const [width, height] of [[320, 568], [390, 664], [768, 1024], [1280, 800]] as const) test.describe(`W14, P7: the crumb at ${width} x ${height}`, () => {
  test.use({ viewport: { width, height } });
  test(`every part shown is whole or ends in an ellipsis, and the species' name shows (${width} x ${height})`, async ({ page }) => {
    await page.goto('/plants'); await ready(page);
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    const parts = await crumb(page);
    expect(parts.length, JSON.stringify(parts)).toBeGreaterThan(0);
    for (const p of parts) {
      // Inside the nav's box: a part past its right edge is clipped by the nav with no mark (r85base: "SPECIE").
      expect(p.right, JSON.stringify(p)).toBeLessThanOrEqual(p.navRight + 1);
      if (!p.last) expect(p.cut, JSON.stringify(p)).toBe(false);
      else if (p.cut) expect(p.ellipsis, JSON.stringify(p)).toBe(true);
    }
    // The page's own name is what the crumb shows, not an ellipsis alone (r85base at 320: "SPECIES ›…").
    const last = parts.find((p) => p.last)!;
    expect(last.text).toContain('Copiapoa');
    expect(last.width, JSON.stringify(parts)).toBeGreaterThanOrEqual(60);
  });
});

test.describe('A19: a backup mark Today cannot read', () => {
  test('is said as that, never "backup today"', async ({ page }) => {
    allowWrites(30_000);
    await opened(page, '/today');
    await inject(page, plant('t1', '2026-0001', 'Copiapoa cinerea', [['accession', 't1', 'nameKind', 'species']]), Date.now() - 86_400_000, 'r85uuuuuuuuuuuu2');
    await setMeta(page, 'lastBackup', 'not a date');
    await page.goto('/today'); await ready(page);
    const line = page.locator('.today .line', { hasText: 'Kept on this device' });
    await expect(line).toContainText('Kept on this device: a backup of a date this device cannot read', { timeout: writeWait(15_000, 50) }); // r85base: "backup today"
    await expect(line).not.toContainText('backup today');
  });
});

test('A17, C7: a photograph the server fails to hand over is said on the status card, and the next sync brings it', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  allowWrites(60_000);
  // Device A: a plant with a photograph, synced.
  const A = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  await fromAddress(A);
  const a = await A.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(a);
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 20_000 });
  const jpeg = await a.screenshot({ type: 'jpeg', quality: 60 });
  await a.locator('#acc-photo-file').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(a.locator('#photo-timeline .strip li, .phgrid .ph').first()).toBeVisible();
  await a.goto('/sync'); await ready(a);
  await a.click('#sync-start');
  const key = (await a.locator('#vault-key').textContent())!.trim();
  await a.fill('#key-typeback', key.slice(-5).toLowerCase());
  await a.click('#sync-create');
  const statusA = a.locator('.card', { hasText: 'Status' });
  await expect(statusA).toContainText('Synced', { timeout: 30_000 });
  await expect(a.locator('.card', { hasText: 'Waiting to send' })).toContainText('0', { timeout: 30_000 });
  await A.close();
  // Device B joins while the server answers every photograph with its own error page.
  const B = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  await fromAddress(B);
  const failing = (route: import('@playwright/test').Route) => (route.request().method() === 'GET' ? route.fulfill({ status: 500, body: 'error code: 500' }) : route.continue());
  await B.route('**/api/sync/photo/**', failing);
  const b = await B.newPage();
  await b.goto('/sync'); await ready(b);
  await b.click('#sync-have-key');
  await b.fill('#sync-key', key.toLowerCase());
  await b.click('#sync-join');
  const status = b.locator('.card', { hasText: 'Status' });
  await expect(status).toContainText('Synced', { timeout: 30_000 });
  // r85base: "everything on the server just now is here", the photograph told only to the console.
  await expect(status).toContainText('1 photograph was not received this run; asked for again at the next sync');
  await expect(status).not.toContainText('everything on the server');
  // The server answers again: the next sync brings it, and the line goes.
  await B.unroute('**/api/sync/photo/**', failing);
  await syncRun(b);
  await expect(status).toContainText('everything on the server');
  await expect(status).not.toContainText('not received');
  await B.close();
});

test('A16h: Down from the search box reaches the matches, Up and Escape come back', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const box = page.getByRole('searchbox', { name: 'Search the whole species catalogue' });
  await box.fill('Copiapoa');
  const hits = page.locator('.rows.hits a.hitrow');
  await expect(hits.nth(1)).toBeVisible({ timeout: 15_000 });
  await box.press('ArrowDown');
  await expect(hits.nth(0)).toBeFocused(); // r85base: the box kept the focus
  await page.keyboard.press('ArrowDown');
  await expect(hits.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(hits.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(box).toBeFocused();
  await box.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('Copiapoa');
});

test('A16h: a letter whose rows are being fetched says so until they come', async ({ page }) => {
  // The window opened at W: the rows from C are fetched when C is pressed.
  await page.goto('/?by=genus&from=W'); await ready(page);
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/api/rows**', async (route) => { await held; await route.continue(); });
  const letters = page.getByRole('navigation', { name: 'Jump to a letter' });
  await letters.getByRole('link', { name: 'C', exact: true }).click();
  await expect(letters.locator('a.busy')).toHaveText('C'); // r85base: nothing marked
  await expect(letters).toHaveAttribute('aria-busy', 'true');
  await expect(letters.getByRole('status')).toHaveText('Fetching the rows from C…');
  release();
  await expect(page.locator('#l-C')).toBeVisible({ timeout: 15_000 });
  await expect(letters.locator('a.busy')).toHaveCount(0);
  await expect(letters).not.toHaveAttribute('aria-busy', 'true');
});
