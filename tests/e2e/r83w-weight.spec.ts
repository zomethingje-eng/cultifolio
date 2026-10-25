/**
 * Round eighty-three (W): the species page's weight. Its HTML carries the regional map drawn once, by the server, each
 * record a dot of one short path, and no longer the records' places in its data a second time; the scoping class is
 * `s<hash>`; app.html sends no comment. Nothing a reader had is lost: the map is named and drawn with scripts off, kept as
 * the server drew it once the page takes over, drawn in the theme's colours in the dark and on paper, and a species page
 * read online opens offline with its styles, now also one read by a link from another species page.
 *
 * On r83base: 1 FAILED (a circle a record, the points in the data, Svelte's scoping class, app.html's comments);
 * 2 passes (it guards the hand-over, counting a record as either mark); 3 FAILED (no dot is a path); 4 FAILED (the second
 * species, read by a link from the first, said "No connection" offline: its page's own stylesheet had never been fetched,
 * the first page carrying it in its HTML, so the offline page could not load its scripts; the install now keeps it).
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { cuttableNetwork, type Cut } from './helpers/cut';
import { controlledBy } from './helpers/controlled';

/** The fixture's photographs are made-up addresses on the real hosts: answered here with a pixel, so the console holds the page's own faults only. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const pixels = (p: Page) => p.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
const DOT = /<path d="M-?[\d.]+ ?-?[\d.]+h0"/g;
/** A record on the map, as this round draws it or as the rounds before did (a circle each), for the tests that guard what did not change. */
const RECORD = /<path d="M-?[\d.]+ ?-?[\d.]+h0"|<circle class="occ"/g;
const RECORDS = '.mapbox svg.map-region g.occ path, .mapbox svg.map-region circle.occ';

test.describe('the page as sent', () => {
  test.use({ serviceWorkers: 'block' });

  test('r83w weight 1: the HTML carries the map once, a dot a record, the short scoping class, and no comment of app.html', async ({ request }) => {
    const html = await (await request.get('/species/copiapoa-cinerea')).text();
    const head = html.slice(0, html.indexOf('</head>'));
    const body = html.slice(html.indexOf('<body'));
    const start = body.indexOf('kit.start(');
    const markup = body.slice(0, start), data = body.slice(start);
    // The regional map, drawn in the markup: the fixture's 52 open records, each a dot of one short path.
    const map = markup.slice(markup.indexOf('<svg class="map map-region"'), markup.indexOf('</svg>', markup.indexOf('<svg class="map map-region"')));
    expect(map).toContain('aria-label="Openly licensed records of Copiapoa cinerea"');
    expect(map.match(DOT)?.length).toBe(52); // base: a circle a record
    expect(map).not.toContain('<circle class="occ"');
    // Its mark is replaced in the markup and stands only in the data; the records' places are not in the data.
    expect(markup).not.toContain('data-drawn');
    expect(data).toContain('regionMark:');
    expect(data).not.toMatch(/\bpoints:\[/); // base: the 52 places again
    // The scoping class is this round's short one, on the markup's elements (about 900 on a rich page).
    expect(markup).not.toMatch(/class="[^"]*\bsvelte-[a-z0-9]{5,8}\b/); // base: svelte-<hash>
    expect(head).toMatch(/<style[\s>]/); // the page's own sheets stay in its head (measured: as files, its first paint came later)
    // app.html's two comments were 2.7 kB of every page.
    expect(html).not.toContain("The example's flag is taken off here");
    expect(html).not.toContain('A page about your own plants is drawn only on the device');
  });

  test('r83w weight 2: the map the server drew is the one the page keeps once its scripts take over, by address, and drawn again the same by a link @phone', async ({ page, browser }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await pixels(page);
    // With scripts off: named, with its dots, and the caption.
    const off = await browser.newPage({ javaScriptEnabled: false });
    await off.goto('/species/copiapoa-cinerea');
    const served = await off.locator('.mapbox svg.map-region').evaluate((x) => x.outerHTML);
    await expect(off.locator('.mapbox svg.map-region')).toHaveAttribute('role', 'img');
    expect(served.match(RECORD)?.length).toBe(52);
    await off.close();
    // With scripts: the very element the server sent is kept (none is taken out of the page as it takes over).
    await page.addInitScript(() => {
      const w = window as unknown as { __mapGone: number };
      w.__mapGone = 0;
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n instanceof Element && (n.matches('.mapwrap, svg.map-region') || n.querySelector?.('svg.map-region'))) w.__mapGone++; }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    expect(await page.locator('.mapbox svg.map-region').evaluate((x) => x.outerHTML)).toBe(served);
    expect(await page.evaluate(() => (window as unknown as { __mapGone: number }).__mapGone)).toBe(0);
    // A move inside the app: the page draws the next map from its data, and back again the first, as the server drew it.
    await page.locator('#s-related ~ .relstrip a', { hasText: 'Copiapoa humilis' }).first().click();
    await expect(page.locator('.mapbox svg.map-region')).toHaveAttribute('aria-label', 'Openly licensed records of Copiapoa humilis');
    expect(await page.locator(RECORDS).count()).toBe(52);
    await page.goBack();
    await expect(page.locator('.mapbox svg.map-region')).toHaveAttribute('aria-label', 'Openly licensed records of Copiapoa cinerea');
    expect(await page.locator('.mapbox svg.map-region').evaluate((x) => x.outerHTML)).toBe(served);
    expect(errors).toEqual([]);
  });

  test('r83w weight 3: the dots are drawn in the theme\'s accent, half transparent and round, in the dark and on paper @phone', async ({ page }) => {
    await pixels(page);
    const dot = () => page.locator('.mapbox svg.map-region g.occ path').first().evaluate((x) => { const s = getComputedStyle(x); return { stroke: s.stroke, opacity: s.strokeOpacity, cap: s.strokeLinecap, fill: s.fill, width: Number(x.closest('g')!.getAttribute('stroke-width')) }; });
    const accent = () => page.evaluate(() => { const t = document.createElement('span'); t.style.color = 'var(--accent)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, media: 'screen' });
      await page.goto('/species/copiapoa-cinerea'); await ready(page);
      const d = await dot();
      expect(d).toMatchObject({ stroke: await accent(), opacity: '0.5', cap: 'round', fill: 'none' });
      expect(d.width).toBeGreaterThan(0);
      // And painted: a path of no length is drawn only by its round cap, so the map is taken as the engine paints it with
      // the dots and without, and the two must differ by the dots' pixels (52 dots of about 3 px across, 300 or more).
      const map = page.locator('.mapbox svg.map-region');
      await map.scrollIntoViewIfNeeded();
      const withDots = [...(await map.screenshot())];
      await page.addStyleTag({ content: '.map g.occ { display: none }' });
      const without = [...(await map.screenshot())];
      const changed = await page.evaluate(async ([a, b]) => {
        const read = (bytes: number[]) => new Promise<ImageData>((ok, no) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d')!; x.drawImage(im, 0, 0); ok(x.getImageData(0, 0, im.width, im.height)); }; im.onerror = no; im.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' })); });
        const [p, q] = await Promise.all([read(a), read(b)]);
        let n = 0;
        for (let i = 0; i < Math.min(p.data.length, q.data.length); i += 4) if (Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2]) > 24) n++;
        return n;
      }, [withDots, without]);
      expect(changed, `${scheme}: pixels the dots paint`).toBeGreaterThan(100);
    }
    // On paper, in the dark theme: the print palette's accent, as every other mark of the page.
    await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
    expect((await dot()).stroke).toBe('rgb(18, 121, 90)'); // --accent on paper, #12795a (theme.css)
    await expect(page.locator('.mapbox svg.map-region')).toBeVisible();
  });
});

test.describe('offline', () => {
  let net: Cut;
  test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
  test.afterEach(async () => { await net.close(); });

  async function fresh(browser: Browser) {
    const use = test.info().project.use;
    const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB', viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor });
    return { ctx, page: await ctx.newPage() };
  }

  test('r83w weight 4: two species read online, one by its address and one by a link from it, open offline by their addresses, with their maps and styles @phone', async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await fresh(browser);
    await page.goto('/plants'); await ready(page);
    await controlledBy(page);
    await expect.poll(() => page.evaluate(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match('/offline')) return true; return false; }), { timeout: 30_000 }).toBe(true);
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    await page.locator('#s-related ~ .relstrip a', { hasText: 'Copiapoa humilis' }).first().click();
    await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
    // The worker's writes are done before the network goes: the first page, and the second page's data.
    await expect.poll(() => page.evaluate(async () => { const urls: string[] = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname); return urls.includes('/species/copiapoa-humilis/__data.json') && urls.includes('/species/copiapoa-cinerea'); }), { timeout: 10_000 }).toBe(true);
    await page.goto('/about/how'); await ready(page);
    net.cut();
    // Each once: the offline page opens a page kept as its data once a minute for an address (src/lib/ui/offline-kept.ts).
    for (const [slug, name] of [['copiapoa-cinerea', 'Copiapoa cinerea'], ['copiapoa-humilis', 'Copiapoa humilis']]) {
      await page.goto(`/species/${slug}`);
      await expect(page.locator('h1').first(), slug).toContainText(name, { timeout: 15_000 }); // base: the second said "No connection"
      await expect(page.locator('.mapbox svg.map-region'), slug).toHaveAttribute('aria-label', `Openly licensed records of ${name}`);
      expect(await page.locator(RECORDS).count(), slug).toBe(52);
      // A rule of the page's own sheet (the section row pinned under the bar) and one of the layout's (the map's sea).
      expect(await page.locator('nav.tabs').evaluate((x) => getComputedStyle(x).position), slug).toBe('sticky');
      expect(await page.locator('.mapbox svg.map-region').evaluate((x) => getComputedStyle(x).aspectRatio), slug).toBe('3 / 2');
    }
    await ctx.close();
  });
});
