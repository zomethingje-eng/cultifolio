// smoke.spec.ts, the fourth part: round sixty: records by identity, held changes, print, focus, larger text (round seventy-two: split into four files that run in parallel, each in order).
import { test, expect } from '@playwright/test';
import { inject } from './helpers/inject';
import { textSize, textSizeHeld } from './helpers/text-size';
import { smokeSetup, ready, addPlant, localDay, more } from './helpers/smoke';

smokeSetup();

/* ---------------------------------------------------------------- round sixty: records by identity, held changes, print, focus, larger text */

/* `inject`, the changes written straight into this device's log as another device's sync would leave them, is the shared
   helper in ./helpers/inject.ts: it writes their arrival order and moves the fold counter (round sixty-two; harness 2). */

test('round sixty: a number two plants share opens a chooser; the list, the notice and the labels link each plant by its identity (decision 3)', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await inject(page, [['accession', 'r-two-a', 'acc', '2026-0042'], ['accession', 'r-two-a', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r-two-a', 'status', 'growing'], ['accession', 'r-two-b', 'acc', '2026-0042'], ['accession', 'r-two-b', 'taxonName', 'Welwitschia mirabilis'], ['accession', 'r-two-b', 'status', 'growing']], Date.now() - 3_600_000);
  await page.goto('/plants');
  // every row by its identity while the number is shared: by number, both rows opened the same plant
  await expect(page.locator('a.accrow')).toHaveCount(2);
  await expect(page.locator('a.accrow[href="/plants/r-two-a"]')).toHaveCount(1);
  await expect(page.locator('a.accrow[href="/plants/r-two-b"]')).toHaveCount(1);
  await expect(page.locator('a.accrow[href="/plants/2026-0042"]')).toHaveCount(0);
  // the bare number lists both, by identity, with what tells them apart
  await page.goto('/plants/2026-0042');
  const chooser = page.locator('#number-chooser li');
  await expect(chooser).toHaveCount(2);
  await expect(page.locator('#number-chooser')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#number-chooser')).toContainText('Welwitschia mirabilis');
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toHaveCount(0); // nothing to water until one is chosen
  await chooser.filter({ hasText: 'Welwitschia' }).locator('a').click();
  await expect(page).toHaveURL(/\/plants\/r-two-b$/);
  await expect(page.locator('h1')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('h1')).toContainText('2026-0042 Welwitschia'); // a space between the number and the name, for a screen reader too (round sixty; the accessibility review, 12)
  // the shared-number notice links the other plant by its identity
  await expect(page.locator('#shared-number a[href="/plants/r-two-a"]')).toContainText('Copiapoa cinerea');
  // a label link by that number picks neither, and says so
  await page.goto('/labels?acc=2026-0042');
  await expect(page.locator('#lb-ambiguous')).toContainText('2026-0042');
  await expect(page.locator('.pick input:checked')).toHaveCount(0);
});

test('round sixty: changes dated ahead of this device\'s clock are said wherever records are listed, with the way to the details (decision 2)', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#held-notice')).toHaveCount(0);
  // a plant from a device whose clock runs a day ahead: in the log, not yet on screen
  await inject(page, [['accession', 'r-ahead', 'acc', '2026-0077'], ['accession', 'r-ahead', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r-ahead', 'status', 'growing']], Date.now() + 86_400_000);
  await page.goto('/plants');
  await expect(page.locator('#held-notice')).toContainText("3 changes from a device whose clock runs ahead are waiting. They appear when this device's date reaches them.");
  await expect(page.locator('a.accrow')).toHaveCount(0);
  await page.goto('/today');
  await expect(page.locator('#held-notice')).toContainText('3 changes from a device whose clock runs ahead are waiting');
  await page.locator('#held-notice a').click();
  await expect(page).toHaveURL(/\/sync#held$/);
  await expect(page.locator('#held')).toContainText('3 changes from a device whose clock runs ahead are waiting'); // said with sync off too
});

test('round sixty: a printed page carries the page alone: the install card, the clock and frost bars and the toast are hidden on paper (the self-review\'s 6)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  // the second day: the install card shows
  await page.evaluate(() => { localStorage.setItem('cultifolio.visits', '1'); localStorage.setItem('cultifolio.lastVisit', '2000-01-01'); });
  await page.goto('/labels');
  await ready(page);
  // the browser's offer, once the card is listening for it (the page is drawn on the device, after its scripts)
  await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt'))); return page.locator('.install').count(); }).toBe(1);
  await expect(page.locator('.page .label').first()).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const shown = await page.evaluate(() => ['.install', '#topbar', '#tabbar', '.toastregion'].map((s) => { const el = document.querySelector(s); return el ? `${s} ${getComputedStyle(el).display}` : `${s} none`; }));
  expect(shown).toEqual(['.install none', '#topbar none', '#tabbar none', '.toastregion none']);
  // and the first label sits at the sheet's top, not under a card: the sheet is the first thing on the paper
  const top = await page.evaluate(() => document.querySelector('.page')!.getBoundingClientRect().top + scrollY);
  expect(top).toBeLessThan(2);
  await page.emulateMedia({ media: 'screen' });
});

test('round sixty: watering by keyboard keeps focus on the button, the toast\'s Undo is the next Tab, and Undo on Today returns focus to the stop\'s Water button (the accessibility review, 1; the outside review\'s A35)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  for (let i = 0; i < 3; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page); await addPlant(page); }
  // the list's Water by keyboard: focus stays on it while it saves and after
  await page.goto('/plants');
  const water = page.locator('.accline').first().getByRole('button', { name: /watered today/ });
  await water.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('watered');
  await expect(water).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused(); // the Undo is the next stop, not 23 Shift+Tabs away
  await page.keyboard.press('Enter');
  await expect(water).toBeFocused(); // back where the grower was
  // Today, twenty-two days on: Undo on a stop puts focus on that stop's Water button, not its heading
  await page.evaluate(() => localStorage.setItem('__shift', String(22 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No space' });
  const head = stop.locator('.head').getByRole('button', { name: /^Water/ });
  await expect(head).toBeEnabled();
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toContainText('Watered just now');
  await stop.locator('.row.done').getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toHaveCount(0);
  await expect(stop.locator('.head button.water')).toBeFocused();
  await C.close();
});

test('round sixty: Today with nothing ticked says so, never "Water these 0"; the done mark is said only when nothing ticked is left (the grower review, 4)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  for (let i = 0; i < 2; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page); await addPlant(page); }
  await page.goto('/today');
  await expect(page.locator('#first-weeks')).toContainText('counted from the day it was added'); // the first weeks say what will show here (the grower review, 6)
  await page.evaluate(() => localStorage.setItem('__shift', String(22 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No space' });
  await expect(stop.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  for (const box of await stop.locator('.chip.tick input').all()) await box.uncheck();
  await expect(stop.locator('.head')).toContainText('None ticked');
  await expect(stop.locator('.head').getByRole('button')).toHaveCount(0);
  await expect(stop.locator('.donemark')).toHaveCount(0);
  // the tick box is a finger's target of its own, apart from the plant link
  const tick = await stop.locator('.chip.tick .tickbox').first().boundingBox();
  expect(tick!.height).toBeGreaterThanOrEqual(36);
  expect(tick!.width).toBeGreaterThanOrEqual(36);
  await C.close();
});

test('round sixty: at 320 px with the browser\'s text at 200%, the phone\'s tab bar keeps Today on screen and the private pages do not scroll sideways (the accessibility review, 5)', async ({ baseURL }) => {
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  // The browser's own text size, as a reader sets it: a profile preference, not a style the page could tell apart.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-text200-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
    // The preference first, the layout after: a browser that does not read the profile's text size (the bundled Chromium on
    // Windows, outside review B14) says nothing about the layout at 200%, and is not a failure of it (round sixty-two).
    const text = await textSize(page, 32); // the profile, or CDP where Windows' bundled Chromium ignores it (round sixty-three; harness H4)
    test.skip(text !== '32px', `preference not applied by this browser (its text is ${text}, not 32px)`);
    await addPlant(page);
    const plant = new URL(page.url()).pathname;
    await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
    await page.fill('#s-count', '10');
    await page.getByRole('button', { name: 'Start batch' }).click();
    await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
    const batch = new URL(page.url()).pathname;
    const sideways: string[] = [];
    for (const route of ['/plants', plant, '/today', '/places', '/propagation', batch, '/settings', '/sync', '/backup']) {
      await page.goto(route);
      await expect(page.locator('#tabbar')).toBeVisible();
      await textSizeHeld(page, 32, route); // on every page measured, not the first alone (round sixty-three; R3 5)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (w[0] > w[1]) sideways.push(`${route} ${w[0]}>${w[1]}`);
      const today = await page.locator('#tabbar a', { hasText: 'Today' }).boundingBox();
      expect(today, route).not.toBeNull();
      expect(today!.x + today!.width, route).toBeLessThanOrEqual(321);
      // and every tab's word inside its own cell, on the screen: at 200% "Today" was pushed past the edge of a bar nobody can scroll
      const spill = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#tabbar a')].filter((a) => a.offsetParent).map((a) => { const r = a.getBoundingClientRect(), t = a.querySelector('span')!.getBoundingClientRect(); return t.right > Math.min(r.right, innerWidth) + 1 || t.left < r.left - 1 ? a.textContent!.trim() : ''; }).filter(Boolean));
      expect(spill, route).toEqual([]);
    }
    expect(sideways).toEqual([]);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* The harness review's proposed tests (docs/review-59/tests/mut--zz-proposed.spec.ts), adopted in round sixty. */

test('round sixty: a numbering choice made before the collection opens is kept, at a 6x CPU throttle (the harness review, 12)', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await page.goto('/settings', { waitUntil: 'commit' });
    await page.locator('html[data-ready]').waitFor({ state: 'attached' });
    // The controls wait for the collection, whose scheme they show (disabled until then), and the stored scheme never
    // overwrites a field the grower touched: before round sixty a choice made here was reset under the grower.
    await page.getByRole('button', { name: /Prefix/ }).click({ timeout: 60_000 });
    await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf', { timeout: 30_000 });
    await expect(page.locator('.accno')).toHaveText('JF-0001', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Prefix/ })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});

test('round sixty: with the collection slow to open, the numbering controls wait for it and a choice made then is kept (the harness review, 12)', async ({ page }) => {
  // The database opens 1.5 s late, as on a slow phone: the stored scheme arrives after the page can be touched.
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), 1500) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  });
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /Prefix/ }).click({ timeout: 15_000 }); // as soon as it can be pressed
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf');
  await expect(page.locator('.accno')).toHaveText('JF-0001');
  await expect(page.getByRole('button', { name: /Prefix/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[placeholder="your initials or the collection\'s"]')).toHaveValue('jf');
});

test('round sixty: a navigation with a query is not kept as the plain page\'s offline copy (E08)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('html[data-worker]').waitFor({ state: 'attached' }); // the first page counted before the second loads
  await page.reload(); // the second page registers the worker (round seventy-three: a first page alone does not)
  await page.locator('html[data-worker="on"]').waitFor({ state: 'attached' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/?by=origin');
  await expect(page.getByRole('link', { name: 'Origin' })).toHaveAttribute('aria-current', 'page');
  await page.goto('/about/how'); // a page that is kept: once it is in the cache, the navigation before it has been dealt with too
  const plain = await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        if (await c.match('/about/how', { ignoreVary: true })) {
          const r = await c.match('/', { ignoreVary: true, ignoreSearch: true });
          return r ? await r.text() : '';
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('/about/how was never kept');
  });
  expect(plain).not.toContain('href="?by=origin" aria-current="page"');
  await ctx.close();
});

test('round sixty: the place form refuses a floor that is not a temperature, and writes nothing (E03)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Floor bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a', { hasText: 'Floor bench' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#e-floor', 'abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toContainText('is not a temperature');
  await expect(page.locator('#e-floor')).toBeFocused();
  await page.reload();
  await expect(page.locator('h1')).toContainText('Floor bench');
  await expect(page.locator('main')).not.toContainText('abc'); // nothing was written
});

test('round sixty: a death has an Undo; "Record…", not "Log"; Since watered says today, not 0 d (the grower review, 12 and 16)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await expect(page.getByRole('button', { name: 'Record…', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.card', { hasText: 'Since watered' }).locator('.val')).toHaveText('today');
  await more(page, 'Died…');
  await page.fill('#ev-cause', 'rot');
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('.toast')).toContainText('Death recorded');
  await expect(page.locator('.tlrow', { hasText: 'rot' })).toBeVisible();
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('growing again');
  await expect(page.locator('.tlrow', { hasText: 'rot' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible(); // growing: Water leads again
});

test('round sixty: places are added one after another with the parent and the kind kept, and a plant with no place is given one from the list (the grower review, 14 and 17)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Greenhouse');
  await page.selectOption('#loc-kind', 'greenhouse');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree a', { hasText: 'Greenhouse' })).toBeVisible();
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Bench 1');
  await page.selectOption('#loc-kind', 'bench');
  await page.selectOption('#loc-parent', { label: 'Greenhouse' });
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await expect(page.locator('#loc-added')).toContainText('Bench 1 added inside Greenhouse');
  await expect(page.locator('#loc-name')).toHaveValue('');
  await expect(page.locator('#loc-name')).toBeFocused();
  await expect(page.locator('#loc-kind')).toHaveValue('bench'); // kept for the next
  await page.fill('#loc-name', 'Bench 2');
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await expect(page.locator('#loc-added')).toContainText('Bench 2 added inside Greenhouse');
  await expect(page.locator('.tree a', { hasText: 'Bench 2' })).toBeVisible();
  // a plant with no place: the line offers a place to pick, and the pick moves it with an Undo
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.selectOption('#f-loc', { label: 'No space' });
  await addPlant(page);
  await page.goto('/places');
  await expect(page.locator('#unplaced')).toContainText('1 growing plant has no space.');
  await page.locator('#unplaced').getByRole('button', { name: 'Give it one' }).click();
  const opt = await page.locator('#unplaced-list option', { hasText: 'Bench 2' }).getAttribute('value');
  await page.locator('#unplaced-list select').selectOption(opt!);
  await expect(page.locator('.toast')).toContainText('moved to Greenhouse › Bench 2');
  await expect(page.locator('#unplaced')).toHaveCount(0);
});

test('round sixty: "Save and add another" keeps the last watering, and its toast offers Undo above the pinned buttons, never over them (the grower review, 3 and 6)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-watered', localDay(-3));
  await page.getByRole('button', { name: 'Save and add another' }).click();
  await expect(page.locator('.toast')).toContainText('added');
  await expect(page.locator('.toast').getByRole('button', { name: 'Undo' })).toBeVisible(); // mid-batch, Undo, not Open: Open left the form behind
  const toastBox = (await page.locator('.toast').boundingBox())!;
  const another = (await page.getByRole('button', { name: 'Save and add another' }).boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(another.y); // above the bar, not over its buttons
  await expect(page.locator('#f-watered')).toHaveValue(localDay(-3)); // kept for the next plant
  await page.goto('/plants');
  await expect(page.locator('.accrow .fig', { hasText: 'watered 3 d ago' })).toHaveCount(1); // Today and the list count from it
});

// Round seventy-four: the species shown whole this test began with is gone from the front page (the owner's decision 3);
// r61w-pages and r62w-words say it is not drawn. The welcome's way into the example and the search's half stay.
test('round sixty: a visitor is offered the example from the front page, and a search that matched nothing as written says what it searched', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#try-sample-home')).toBeVisible();
  // a variety the reference files under its species: nothing as written, the species on the retry, and the page says so
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.fill('.toolrow .searchbar', 'Copiapoa cinerea var. nonexista');
  await expect(page.locator('.relaxed')).toContainText('Showing results for “Copiapoa cinerea”');
  await expect(page.locator('.hitrow').first()).toContainText('Copiapoa cinerea');
});

test('round sixty: Today draws "Also today" only when something is under it', async ({ page }) => {
  await page.goto('/today');
  await ready(page);
  await expect(page.locator('#rest-h')).toBeHidden();
});
