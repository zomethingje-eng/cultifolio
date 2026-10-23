/**
 * Round eighty-one (U): the phone review's 6 to 10.
 *
 * 1. (P6) In landscape a phone is over 700 px wide, so the menu is the desktop's drop-down: 656 px tall on a 342 to 380 px
 *    screen, with Settings, Backup, Sync and the about links below the screen and a finger's drag scrolling the page
 *    under it. Now it is no taller than the window and scrolls itself.
 * 2. (P7) In landscape on a notched iPhone the top bar's two end buttons sat under the notch and the rounded corner: the
 *    bar padded itself 16 px inside a 47 px safe area. Now it is padded as the body is. Two tests: the safe areas emulated
 *    (Chromium's protocol only; Playwright's WebKit reports none), and in every engine the bar's padding following the
 *    body's.
 * 3. (P8) Back closed nothing that was open: with the photo viewer, the menu or the Record form open, the browser's Back
 *    left the page (and what was typed in the form). Now Back closes it and stays; closed by its own button, the next Back
 *    leaves the page as before; a link in the menu replaces the menu's entry, so Back from the next page comes back here.
 * 4. (P9) A HEIC photograph was refused with "That file is not an image this browser can read.", which said neither which
 *    file nor what to do. Now it is named, with the way forward.
 * 5. (P10) Under a finger at landscape and tablet widths: "Follow" 42 px wide, the search boxes 41 px tall, "Show all"
 *    17 px, the photograph's credit 23 px and a plant's number chip 25 px. Now 44 px each, the chips by an invisible
 *    margin (a finger 18 px above or below the chip's middle still presses it).
 *
 * On r81base: 1 FAILED (the menu's foot at 656 + 48 px; Settings out of reach); 2a FAILED (the menu button at x 16, inside
 * the 47 px margin); 2b passed (no insets outside Chromium: it guards that the bar keeps the body's padding); 3 FAILED
 * (Back left the page, three times); 4 FAILED (the file not named); 5 FAILED (Follow 42 px, the search box 41 px, the
 * chips missed).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
/** Photographs from other hosts fail at once, as the review's runs had them, rather than hanging on this machine's proxy. */
async function noThirdParty(page: Page) {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
}
/** A move inside the app, as a tap on a link is. */
async function visit(page: Page, href: string) {
  await page.evaluate((h) => { const a = document.createElement('a'); a.href = h; a.id = 'r81u-go'; a.textContent = 'go'; document.body.insertBefore(a, document.body.firstChild); }, href);
  await page.evaluate(() => document.getElementById('r81u-go')!.click());
}
const back = (page: Page) => page.evaluate(() => history.back());
const LANDSCAPE = { width: 740, height: 360 }; // a Galaxy S8 on its side, the review's shortest

test('r81u phone 1: in landscape the menu is no taller than the screen, and its last items are reached by scrolling it @phone', async ({ page }) => {
  await page.setViewportSize(LANDSCAPE);
  await page.goto('/plants'); await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.locator('#menu');
  await expect(menu).toBeVisible();
  const m = (await menu.boundingBox())!;
  expect(m.y + m.height, `menu ${JSON.stringify(m)}`).toBeLessThanOrEqual(LANDSCAPE.height);
  // Settings and Source are inside the menu, reached by scrolling the menu itself, not the page under it.
  const y0 = await page.evaluate(() => scrollY);
  await menu.evaluate((el) => el.scrollBy(0, 1000));
  expect(await menu.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(y0);
  const source = menu.getByRole('link', { name: 'Source' });
  const s = (await source.boundingBox())!;
  expect(s.y + s.height).toBeLessThanOrEqual(LANDSCAPE.height);
  await menu.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('r81u phone 2a: in landscape with a notch, the top bar\'s end buttons stand inside the safe area', { tag: '@chromium' }, async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the safe areas are emulated through Chromium\'s protocol');
  await page.setViewportSize({ width: 750, height: 342 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: 0, left: 47, right: 47, bottom: 21 } } as never);
  await page.goto('/plants'); await ready(page);
  const inset = await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:env(safe-area-inset-left);'; document.body.appendChild(d); const x = d.getBoundingClientRect().left; d.remove(); return x; });
  expect(inset, 'the emulated inset').toBe(47);
  const menuBtn = (await page.getByRole('button', { name: 'Menu' }).boundingBox())!;
  const add = (await page.locator('#topbar a.iconbtn[aria-label^="Add"]').last().boundingBox())!;
  expect(menuBtn.x).toBeGreaterThanOrEqual(47);
  expect(add.x + add.width).toBeLessThanOrEqual(750 - 47);
});

test("r81u phone 2b: the top bar is padded as the body is, in every engine @phone", async ({ page }) => {
  await page.setViewportSize({ width: 750, height: 342 });
  await page.goto('/plants'); await ready(page);
  const pad = await page.evaluate(() => { const b = getComputedStyle(document.body), t = getComputedStyle(document.getElementById('topbar')!); return { body: [b.paddingLeft, b.paddingRight], bar: [t.paddingLeft, t.paddingRight] }; });
  expect(pad.bar).toEqual(pad.body);
});

/** A plant with one photograph, made in the page, on its own page; the page before it in the history is /plants. */
async function plantWithPhoto(page: Page) {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  const url = page.url();
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d')!; x.fillStyle = '#3a7'; x.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg', 0.9).split(',')[1]; }), 'base64');
  await page.locator('input[type=file][multiple]').first().setInputFiles({ name: 'plant.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('button.heroimg')).toBeVisible({ timeout: 15_000 });
  await page.goto('/plants'); await ready(page);
  await visit(page, new URL(url).pathname);
  await expect(page).toHaveURL(url);
  await expect(page.locator('button.heroimg')).toBeVisible();
  return url;
}

test('r81u phone 3: Back closes the photo viewer, the menu and the Record form, and stays on the page @phone', async ({ page }) => {
  test.setTimeout(60_000);
  const url = await plantWithPhoto(page);
  // The viewer: Back closes it.
  await page.locator('button.heroimg').click();
  await expect(page.locator('.lb')).toBeVisible();
  await back(page);
  await expect(page.locator('.lb')).toBeHidden();
  await expect(page).toHaveURL(url);
  // Closed by its own button, nothing is left behind: Back then leaves the page, as before.
  await page.locator('button.heroimg').click();
  await expect(page.locator('.lb')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lb')).toBeHidden();
  await expect(page).toHaveURL(url);
  // The Record form: Back closes it, and the page stays.
  await page.getByRole('button', { name: 'Record…' }).click();
  await expect(page.locator('form.evform')).toBeVisible();
  await page.locator('#ev-note').fill('typed before Back');
  await back(page);
  await expect(page.locator('form.evform')).toBeHidden();
  await expect(page).toHaveURL(url);
  // The menu: Back closes it.
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('#menu')).toBeVisible();
  await back(page);
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page).toHaveURL(url);
  // A link in the menu replaces its entry: Back from that page comes back to this one, with the menu closed.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#menu').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await back(page);
  await expect(page).toHaveURL(url);
  await expect(page.locator('#menu')).toBeHidden();
  // And the next Back leaves the plant for the page before it: nothing open left an entry behind.
  await back(page);
  await expect(page).toHaveURL(/\/plants$/);
});

test('r81u phone 4: a HEIC photograph that cannot be read is named, with the way forward @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  // Not an image any engine here draws: what a HEIC is to a browser without the codec.
  const bytes = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64, 7)]);
  await page.locator('input[type=file][multiple]').first().setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: bytes });
  const err = page.locator('.add .err');
  await expect(err).toContainText('IMG_0001.HEIC is a HEIC photograph, which this browser cannot read.', { timeout: 15_000 });
  await expect(err).toContainText('choose it from Photos');
});

test('r81u phone 5: under a finger in landscape, Follow, the search box, "Show all", the credit and the number chip take 44 px @phone-only', async ({ page }) => {
  await noThirdParty(page);
  await page.setViewportSize({ width: 750, height: 342 });
  await page.goto('/plants'); await ready(page);
  test.skip(!(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)), "this engine's phone reports no coarse pointer");
  await inject(page, [['accession', 'r1', 'acc', '2026-0001'], ['accession', 'r1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r1', 'taxonKey', 5384013], ['accession', 'r1', 'status', 'growing'], ['accession', 'r1', 'nameKind', 'species']], Date.now() - 86_400_000);
  await page.reload(); await ready(page);
  await expect(page.locator('#plants-q')).toBeVisible();
  expect((await page.locator('#plants-q').boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const follow = (await page.getByRole('button', { name: /^Follow/ }).boundingBox())!;
  expect(follow.width).toBeGreaterThanOrEqual(43.5);
  expect(follow.height).toBeGreaterThanOrEqual(43.5);
  const showAll = page.getByRole('button', { name: /^Show all/ });
  if (await showAll.count()) expect((await showAll.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  /** What a finger 18 px above and below a chip's middle presses. */
  const pressed = async (sel: string) => {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    return page.evaluate(([x, ys]) => ys.map((y) => (document.elementFromPoint(x, y)?.closest('a') as HTMLAnchorElement | null)?.getAttribute('href') ?? null), [cx, [cy - 18, cy + 18]] as [number, number[]]);
  };
  const chip = page.locator('.mine a.accno').first();
  await expect(chip).toBeVisible();
  const chipHref = await chip.getAttribute('href');
  expect(await pressed('.mine a.accno')).toEqual([chipHref, chipHref]);
  const cred = page.locator('.hero a.cred').first();
  await expect(cred).toBeVisible({ timeout: 15_000 });
  const credHref = await cred.getAttribute('href');
  expect(await pressed('.hero a.cred')).toEqual([credHref, credHref]);
});
