import { test, expect, type Page } from '@playwright/test';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

/**
 * Round sixty-four, agent W: what Safari's engine and Firefox met in the first all-engines run, each reproduced here in
 * Chromium by giving the page the other engine's behaviour (an init script that stubs the API), so the fault is held in
 * every run, not only when WebKit and Firefox are installed.
 *
 * - Firefox asks the grower before it answers `navigator.storage.persist()`, and a page left open answers nothing: the
 *   collection's load waited for that answer, so the add form never took the species it was opened with and the example
 *   collection was never set out ("Setting it out…" for good).
 * - Safari's engine in a Private Browsing window refuses a Blob in IndexedDB ("Error preparing Blob/File data to be stored
 *   in object store"): a photograph could not be added at all.
 * - On a first visit, Safari's engine reloaded the page a second or two in, when the first service worker took control:
 *   a worker had been told to take over a page no worker served, and a place or a plant just typed was lost.
 */

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

/** Firefox's `persist()` with its question unanswered: a promise that never settles. */
function persistAsks(): void {
  try { Object.defineProperty(StorageManager.prototype, 'persist', { value: () => new Promise<boolean>(() => {}), configurable: true }); } catch { /* no storage manager */ }
}

test('r64w 1: with the browser still asking whether to keep the data (Firefox), the add form takes its species and the example is set out', async ({ page }) => {
  test.setTimeout(60_000);
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await page.addInitScript(persistAsks);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  // Base: the form waited for the collection, which waited for the answer, and the name never came.
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea', { timeout: 10_000 });
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  // Base: "Setting out the example collection…" for good.
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
});

/** Safari's engine in a Private Browsing window: a put of a value holding a Blob is refused. */
function blobsRefused(): void {
  const refuse = (v: unknown) => !!v && typeof v === 'object' && Object.values(v as Record<string, unknown>).some((x) => x instanceof Blob);
  for (const m of ['put', 'add'] as const) {
    const orig = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (refuse(value)) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
      return orig.call(this, value, key);
    } as typeof orig;
  }
}

/** A small JPEG drawn on a canvas in the page. */
async function jpeg(p: Page): Promise<Buffer> {
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a6'; g.fillRect(0, 0, 640, 480);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

test('r64w 2: where the browser refuses a Blob in its database (Safari, Private Browsing), a photograph is kept as bytes and shown, and survives a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(blobsRefused);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await ready(page);
  await page.locator('#acc-photo-file').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page) });
  // Base: "Error preparing Blob/File data to be stored in object store" under the add row, and no photograph.
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  await expect(page.locator('main')).not.toContainText('Error preparing Blob');
  await page.reload();
  await ready(page);
  await expect(page.locator('.phgrid .ph img')).toHaveCount(1);
  await expect.poll(() => page.locator('.phgrid .ph img').first().evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

/** Safari's engine on a first visit, as the page saw it: its registration answered with the first worker as the one waiting. */
function firstWorkerWaiting(): void {
  const n = Number(sessionStorage.getItem('__loads') ?? 0) + 1;
  sessionStorage.setItem('__loads', String(n));
  const orig = ServiceWorkerContainer.prototype.register;
  ServiceWorkerContainer.prototype.register = function (this: ServiceWorkerContainer, ...a: Parameters<typeof orig>) {
    return orig.apply(this, a).then((reg) => {
      const w = reg.installing ?? reg.waiting;
      if (w && !navigator.serviceWorker.controller) Object.defineProperty(reg, 'waiting', { get: () => w, configurable: true });
      return reg;
    });
  } as typeof orig;
}

test('r64w 3: a first visit is not reloaded when the first service worker takes control, so what was typed stays', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(firstWorkerWaiting);
  await page.goto('/plants/new');
  await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  // The worker installs and claims the page (within the four seconds in which a take-over reloads at once, here); a reload
  // asked for at that moment has begun a second later.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await page.waitForLoadState('load');
  // Base: loaded twice, and the name typed was gone.
  expect(await page.evaluate(() => sessionStorage.getItem('__loads'))).toBe('1');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
});
