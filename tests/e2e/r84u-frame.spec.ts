/**
 * Round eighty-four, agent U: the collection's pages and the app's frame, as the three reviews of ba78fb9 found them.
 * Each test failed on r84base, as its comment says (checked by running this file against a build of r84base).
 *
 * - A14: Today said "backup -1 d ago" after 8 pm in Pittsburgh (the UTC date of an instant against the local day).
 * - W8: right after a restore that counted as a backup, /backup still said "never". And A13: the restore's preview read
 *   "Nothing here is removed.The file's site, units are applied".
 * - P2, A12, B4: My plants moved as it opened: the footer drawn under "Opening your collection…" and pushed off by the
 *   list, and the backup line drawn above the title a moment after it.
 * - A17: at 640 x 400 (a laptop at 200% zoom) no main navigation but the menu.
 * - P3: in landscape on a notched iPhone the top bar ran into the right inset on a page with the Back button.
 * - P4: the compare pill on every page, over a plant's lines.
 * - P8: a link-like button in a sentence made its line 44 px tall under a finger.
 * - A13: the catalogue's "No climate" chip read in pieces.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { writeWait, allowWrites, inWebKit } from './helpers/pace';
import { positionsFromStart, positionMoves } from './helpers/positions';

// The app's own routes only: no service worker stands between the page and what it reads.
test.use({ serviceWorkers: 'block' });

/** A browser that has not promised to keep the site's data, as most have not: the backup line's own condition. */
const notPersisted = () => {
  const s = navigator.storage as StorageManager & { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
  if (s) { s.persisted = () => Promise.resolve(false); s.persist = () => Promise.resolve(false); }
};
const plants = (n: number, year = new Date().getFullYear()): Row[] => {
  const rows: Row[] = [['location', 'gh', 'name', 'Bench']];
  for (let i = 1; i <= n; i++) rows.push(['accession', `t${i}`, 'acc', `${year}-${String(i).padStart(4, '0')}`], ['accession', `t${i}`, 'taxonName', i % 3 ? 'Copiapoa cinerea' : 'Echeveria elegans'], ['accession', `t${i}`, 'status', 'growing'], ['accession', `t${i}`, 'nameKind', 'species'], ['accession', `t${i}`, 'locationId', 'gh']);
  return rows;
};
/** A meta record written as the app writes it, in the collection's own database (the page has made its stores). */
async function setMeta(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(async ({ key, value }) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = d.transaction(['meta'], 'readwrite'); // raw-ok: a meta mark (lastBackup, as the backup page writes it), no change and no arrival row
    tx.objectStore('meta').put(value, key); // raw-ok: the same mark
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    d.close();
  }, { key, value });
}
/** The page's collection open, its stores made: the helpers write into them. */
async function opened(page: Page, path = '/plants'): Promise<void> {
  await page.goto(path); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: writeWait(15_000, 50) });
}

test.describe('A14: an instant against the reader\'s day', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('at 9.30 pm in Pittsburgh a backup taken at 9 pm is "today" on Today', async ({ page }) => {
    allowWrites(30_000);
    // 21:30 on 29 October in New York is 01:30 on the 30th in UTC; the backup at 21:00 is the 30th in UTC.
    await page.clock.setFixedTime(new Date('2026-10-30T01:30:00Z'));
    await opened(page, '/today');
    await inject(page, plants(1, 2026), Date.parse('2026-10-29T12:00:00Z'), 'r84uuuuuuuuuuuu1');
    await setMeta(page, 'lastBackup', '2026-10-30T01:00:00.000Z');
    await page.goto('/today'); await ready(page);
    const line = page.locator('.today .line', { hasText: 'Kept on this device' });
    await expect(line).toContainText('Kept on this device: backup today', { timeout: writeWait(15_000, 100) }); // r84base: "backup -1 d ago"
    await expect(line).not.toContainText('-1');
  });
});

test('W8 and A13: a merge into an empty device counts as a backup at once, and its preview reads as sentences', async ({ page: first, browser, baseURL }) => {
  allowWrites(60_000);
  // A device with a plant, a site and units: its backup carries device.json.
  await opened(first, '/plants');
  await inject(first, plants(2), Date.now() - 86_400_000, 'r84uuuuuuuuuuuu2');
  await first.evaluate(() => { localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Mt. Lebanon' })); document.cookie = 'cultifolio.units=us; path=/'; });
  await first.goto('/backup'); await ready(first);
  await expect(first.locator('#bk-export')).toBeEnabled({ timeout: writeWait(10_000, 50) });
  const dl = first.waitForEvent('download');
  await first.click('#bk-export');
  const file = await (await dl).path();
  // Another device with nothing: the file's site and units are its own to apply.
  const other = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await other.newPage();
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('.secrule', { hasText: 'Take a backup' }).locator('.n')).toHaveText('never', { timeout: writeWait(10_000, 20) });
  await page.locator('#bk-file').setInputFiles(file!);
  const preview = page.locator('#bk-preview');
  // r84base: "Nothing here is removed.The file's site, units are applied, since this device has none."
  await expect(preview).toContainText("Nothing here is removed. The file's site and units are applied, since this device has none.");
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText('Merged:', { timeout: writeWait(15_000, 200) });
  // r84base: still "never" until a reload.
  await expect(page.locator('.secrule', { hasText: 'Take a backup' }).locator('.n')).toHaveText('last today, restored from a file');
  await other.close();
});

test('P2, A12, B4: My plants opens without moving: the footer waits for the list, the backup line comes with it @phone', async ({ context, page }) => {
  allowWrites(120_000);
  const n = inWebKit() ? 60 : 200;
  await context.addInitScript(notPersisted);
  await opened(page, '/plants');
  await inject(page, plants(n), Date.now() - 86_400_000, 'r84uuuuuuuuuuuu3');
  // Every frame from the first, in every engine: the title, the list and the footer.
  await positionsFromStart(context, ['header.phead', 'footer.credits', '.plantstools', 'a.accrow']);
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('a.accrow').first()).toBeVisible({ timeout: writeWait(15_000, n * 5) });
  await expect(page.locator('#backup-nudge')).toContainText(`${n} plants and no backup yet`);
  await page.waitForTimeout(800); // a negative: a late notice would move what is drawn
  const { moves, frames } = await positionMoves(page);
  expect(frames).toBeGreaterThan(5);
  // r84base: header.phead moved 93 px down as the backup line arrived above it; the footer, drawn in view under
  // "Opening your collection…", was pushed off by the list.
  expect(moves, JSON.stringify(moves)).toEqual([]);
  // The line is under the search, not above the title.
  const [title, line] = await Promise.all([page.locator('header.phead').boundingBox(), page.locator('#backup-nudge').boundingBox()]);
  expect(line!.y).toBeGreaterThan(title!.y + title!.height);
});

test('P2: a cold load of 400 plants on a throttled phone shifts nothing (layout-shift reading) @phone-only', { tag: '@chromium' }, async ({ context, page }) => {
  test.setTimeout(120_000);
  await context.addInitScript(notPersisted);
  await opened(page, '/plants');
  await inject(page, plants(400), Date.now() - 86_400_000, 'r84uuuuuuuuuuuu4'); // no snapshot: the load folds the whole log
  await context.addInitScript(() => {
    const w = window as unknown as { __cls: Array<{ v: number; src: string[] }> };
    w.__cls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) if (!e.hadRecentInput) w.__cls.push({ v: e.value, src: (e.sources ?? []).map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}` : String(s.node?.nodeName))) }); }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.goto('/plants'); await ready(page);
    await expect(page.locator('a.accrow').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const shifts = await page.evaluate(() => (window as unknown as { __cls: Array<{ v: number; src: string[] }> }).__cls);
  const cls = shifts.reduce((a, s) => a + s.v, 0);
  console.log(`r84u P2: CLS ${cls.toFixed(4)} on a cold load of 400 plants at CPU x4 ${JSON.stringify(shifts)}`);
  expect(cls).toBeLessThan(0.01); // r84base: 0.105 (the backup line over the title), 0.29 to 0.39 in the reviews' runs (the footer)
});

for (const [width, height] of [[640, 400], [568, 320]] as const) test.describe(`A17: the main navigation at ${width} x ${height}`, () => {
  test.use({ viewport: { width, height } });
  test(`the five places are in the top bar at ${width} x ${height}, whole, and the bar fits the window`, async ({ page }) => {
    for (const path of ['/', '/plants', '/species/copiapoa-cinerea']) {
      await page.goto(path); await ready(page);
      const main = page.getByRole('navigation', { name: 'Main' });
      await expect(main, path).toBeVisible(); // r84base: hidden (and the tab bar too, under 480 px tall)
      for (const name of ['Species', 'My plants', 'My spaces', 'Propagation', 'Today']) {
        const box = await main.getByRole('link', { name, exact: true }).boundingBox();
        expect(box, `${path} ${name}`).not.toBeNull();
        expect(box!.x + box!.width, `${path} ${name}`).toBeLessThanOrEqual(width);
      }
      const over = await page.evaluate(() => { const bar = document.getElementById('topbar')!; return [...bar.children].map((c) => c.getBoundingClientRect().right).filter((r) => r > innerWidth + 0.5); });
      expect(over, path).toEqual([]);
    }
  });
});

test.describe('P3: the top bar clear of the notch in landscape', () => {
  test.use({ viewport: { width: 750, height: 342 }, isMobile: true, hasTouch: true });
  test('on a species page, with Back, every control ends inside the right inset', { tag: '@chromium' }, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    // The iPhone 13's landscape insets, 47 px each side, as the phone review emulated them.
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 47, right: 47, top: 0, bottom: 21 } });
    await page.goto('/plants'); await ready(page);
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
    const r = await page.evaluate(() => {
      const bar = document.getElementById('topbar')!;
      const pad = parseFloat(getComputedStyle(bar).paddingRight);
      return { pad, right: Math.max(...[...bar.children].map((c) => c.getBoundingClientRect().right)), width: innerWidth };
    });
    expect(r.pad).toBeGreaterThanOrEqual(47); // the inset is applied
    expect(r.right, JSON.stringify(r)).toBeLessThanOrEqual(r.width - 47); // r84base: 730, 27 px into the inset
  });
});

test('P4: the compare pill on species pages only, not over a grower\'s pages @phone', async ({ page }) => {
  test.setTimeout(60_000); // six pages, a species page among them
  await page.goto('/'); await ready(page);
  await page.evaluate(() => localStorage.setItem('cultifolio.compare', JSON.stringify([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }])));
  const pill = page.locator('.cmppill, .tray').filter({ visible: true });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(pill).toHaveCount(1);
  for (const path of ['/plants', '/today', '/places', '/']) {
    await page.goto(path); await ready(page);
    await page.waitForTimeout(200); // a negative: the pill is drawn on mount
    await expect(pill, path).toHaveCount(0); // r84base: on every page
  }
});

test('P8: a link-like button in a sentence keeps the sentence\'s line, and still takes a finger @phone-only', async ({ context, page }) => {
  allowWrites(30_000);
  await context.addInitScript(notPersisted);
  await opened(page, '/plants');
  await inject(page, plants(6), Date.now() - 86_400_000, 'r84uuuuuuuuuuuu5');
  await page.goto('/plants'); await ready(page);
  const hide = page.locator('#backup-nudge button', { hasText: 'Not now' });
  await expect(hide).toBeVisible({ timeout: writeWait(10_000, 50) });
  const m = await hide.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(b.parentElement!).lineHeight) || 20;
    // The finger's target: points 18 px above and below the word's middle are still the button.
    const at = (dy: number) => { const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2 + dy); return !!el && (el === b || b.contains(el)); };
    return { h: r.height, lh, up: at(-18), down: at(18) };
  });
  expect(m.h, JSON.stringify(m)).toBeLessThanOrEqual(m.lh + 4); // r84base: 44 px, a line that tall
  expect(m.up && m.down, JSON.stringify(m)).toBe(true);
});

test('A13: the catalogue\'s chips are each named in one phrase', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const chips = page.getByRole('navigation', { name: 'Filter the catalogue' });
  // r84base: "No climate , 2" from its parts, and "No climate , 9,711 , 919 not checked" on the live corpus.
  await expect(chips.getByRole('link', { name: /^No climate: [\d,]+ species(, [\d,]+ of them not checked)?$/ })).toHaveCount(1);
  await expect(chips.getByRole('link', { name: /^All: [\d,]+ species$/ })).toHaveCount(1);
  await expect(chips.getByRole('link', { name: /^Climate known: [\d,]+ species$/ })).toHaveCount(1);
});
