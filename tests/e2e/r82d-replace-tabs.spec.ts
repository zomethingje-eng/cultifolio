/**
 * Round eighty-two, the independent review's 1: a Replace from a backup resumed by two tabs could lose photographs. The
 * switch (vault.ts `promote`) sets a flag, replaces the live log and copies the photographs one by one; a tab opened
 * meanwhile saw the flag and ran the same copy, wiping what the first had copied, and once it was closed part-way those
 * photographs were gone. Now the Replace holds a Web Lock (`cultifolio-replace`) from the staging to the end of its
 * switch, and a tab that opens the vault while the flag is up waits for it, says so, and reads the flag again.
 *
 * Here: a plant with six photographs, a backup of it, and a Replace from that backup with the switch's reads of the
 * staged photographs slowed (each answered 500 ms late, 1,500 in WebKit, by an init script, so the switch lasts a few seconds in every
 * engine). Test 1: once two photographs are in, a second tab opens the collection and is closed as soon as the device
 * holds fewer photographs than it did (or after a while), as the review's tab B was; at the end the device holds the
 * backup's six photographs, each its own file, and every record. Test 2: a tab opened during the switch says it waits for
 * another tab, and then shows the plant with its six photographs. Both failed on r82base in Chromium: test 1 ended with 3
 * of the 6 photographs (the second tab's wipe took the three copied before it opened), test 2 never said it waited.
 *
 * Every engine the app supports has Web Locks (Chromium 69, Firefox 96, Safari 15.4); the spec asserts the API is there,
 * so an engine without it fails here rather than pass on the copy's own safety (tests/unit/r82d-replace-tabs.test.ts runs
 * the copy twice at once without the lock, as such an engine would).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';
import { writeWait, allowWrites, inWebKit } from './helpers/pace';

// The photographs are the app's own writes, never a route's; no service worker stands between the pages and the server,
// and WebKit's report of an error its worker answered is not met.
test.use({ serviceWorkers: 'block' });

const SLOW_KEY = 'e2e.slowStagedPhotoReads';
/**
 * In every page: while localStorage names a delay, each read of a photograph from the staging database answers that much
 * later, so a switch copies one photograph every so often, and a tab that wipes what was copied (r82base) has a moment
 * before it copies the first back.
 */
function slowStagedPhotos(key: string): void {
  const slow = new WeakSet<IDBRequest>();
  const realGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['get']>) {
    const req = realGet.apply(this, args);
    try { if (this.name === 'photos' && this.transaction.db.name === 'cultifolio-staging' && Number(localStorage.getItem(key))) slow.add(req); } catch { /* no storage: not slowed */ }
    return req;
  };
  const realAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, o?: boolean | AddEventListenerOptions) {
    if (fn && type === 'success' && this instanceof IDBRequest && slow.has(this)) {
      const ms = Number(localStorage.getItem(key)) || 0;
      const call = fn;
      const late = (ev: Event) => { setTimeout(() => (typeof call === 'function' ? call.call(this, ev) : call.handleEvent(ev)), ms); };
      return realAdd.call(this, type, late, o);
    }
    return realAdd.call(this, type, fn, o);
  };
}

/** The grower's own database, read raw: the flag, the photographs (id and both sizes, so six files are six), the plants. */
const state = (p: Page) => p.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  try {
    const tx = db.transaction(['meta', 'photos', 'changes']);
    const req = <T>(r: IDBRequest<T>) => new Promise<T>((res) => { r.onsuccess = () => res(r.result); });
    const [flag, photos, changes] = await Promise.all([
      req(tx.objectStore('meta').get('staging-pending')),
      req(tx.objectStore('photos').getAll()) as Promise<Array<{ id: string; blob?: Blob; thumb?: Blob; full?: ArrayBuffer; small?: ArrayBuffer }>>,
      req(tx.objectStore('changes').getAll()) as Promise<Array<{ kind: string; id: string; field: string }>>
    ]);
    const files = photos.map((x) => (x.full ? `${x.id}:${x.full.byteLength}:${x.small!.byteLength}` : `${x.id}:${x.blob!.size}:${x.thumb!.size}`)).sort();
    const plants = [...new Set(changes.filter((c) => c.kind === 'accession').map((c) => c.id))];
    return { flag: !!flag, files, plants, changes: changes.length };
  } finally { db.close(); }
});

/** A plant with six photographs and a backup of it; then the Replace from that backup, its live photographs' writes slowed, up to the moment its switch has begun. */
async function replaceBegun(page: Page): Promise<{ acc: string; before: Awaited<ReturnType<typeof state>> }> {
  allowWrites(120_000);
  test.setTimeout(test.info().timeout + 60_000);
  await page.context().addInitScript(slowStagedPhotos, SLOW_KEY);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  // Every engine the app supports has Web Locks: one without them fails here, rather than pass on the copy's own safety.
  expect(await page.evaluate(() => typeof navigator.locks?.request)).toBe('function');
  await addPlant(page);
  const acc = page.url().split('/').pop()!;
  for (let i = 0; i < 6; i++) {
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 40 + i * 10 });
    await page.locator('#acc-photo-file').setInputFiles({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: jpeg });
    await expect(page.locator('.phgrid .ph')).toHaveCount(i + 1, { timeout: writeWait(10_000, 60) });
  }
  const before = await state(page);
  expect(new Set(before.files.map((f) => f.split(':')[0])).size).toBe(6);
  await page.goto('/backup'); await ready(page);
  const dl = page.waitForEvent('download');
  await page.click('#bk-export');
  const path = await (await dl).path();
  await page.locator('#bk-file').setInputFiles(path!);
  await page.click('#bk-replace');
  // Half a second a photograph; in WebKit, where a second tab takes longer to open, a second and a half, so it opens
  // while the switch still runs.
  await page.evaluate(([k, ms]) => localStorage.setItem(k, ms), [SLOW_KEY, inWebKit() ? '1500' : '500']);
  await page.click('#bk-replace-yes');
  await expect.poll(async () => (await state(page)).flag, { timeout: writeWait(20_000, 200), intervals: [50] }).toBe(true);
  return { acc, before };
}
/** The switch ends: the first tab lands on the plants list, and the flag is down. */
async function replaceDone(page: Page): Promise<Awaited<ReturnType<typeof state>>> {
  await expect(page).toHaveURL(/\/plants$/, { timeout: writeWait(30_000, 400) });
  await page.evaluate((k) => localStorage.removeItem(k), SLOW_KEY);
  await expect.poll(async () => (await state(page)).flag, { timeout: writeWait(20_000, 100) }).toBe(false);
  const left = await page.evaluate(async () => (await indexedDB.databases?.())?.map((d) => d.name) ?? null);
  if (left) expect(left).not.toContain('cultifolio-staging'); // nothing of the staging copy is left behind
  return state(page);
}

test('a Replace from a backup with photographs, with a second tab opened during its switch and closed part-way, keeps every photograph (the independent review\'s 1)', async ({ page, context, browserName }) => {
  const { before } = await replaceBegun(page);
  // The second tab opens once two photographs are in, and is closed as soon as the photographs on the device are fewer
  // than they were (r82base: its own copy's wipe; it would copy them back one by one), or after a while if they never
  // are, as long as the switch is under way.
  await expect.poll(async () => (await state(page)).files.length, { timeout: writeWait(20_000, 100), intervals: [50] }).toBeGreaterThanOrEqual(2);
  const closed = await context.newPage();
  await closed.goto('/plants', { waitUntil: 'commit' });
  const opened = await state(page);
  let most = opened.files.length;
  let fewer = false;
  const t0 = Date.now();
  for (let st = opened; st.flag && Date.now() - t0 < (browserName === 'webkit' ? 3_000 : 1_500); st = await state(page)) {
    if (st.files.length < most) { fewer = true; break; }
    most = Math.max(most, st.files.length);
  }
  await closed.close();
  const after = await replaceDone(page);
  expect(opened.flag, 'the second tab was opened during the switch').toBe(true);
  expect(after.files).toEqual(before.files);
  expect(fewer, 'no copy but the first tab\'s took photographs away').toBe(false);
  expect(after.plants).toEqual(before.plants);
  expect(after.changes).toBe(before.changes);
});

test('a tab opened during a Replace\'s switch waits for it, says so, and then shows the collection with its photographs (the independent review\'s 1)', async ({ page, context }) => {
  const { acc, before } = await replaceBegun(page);
  const other = await context.newPage();
  await other.goto('/plants', { waitUntil: 'commit' });
  await expect(other.locator('.vaultnote')).toContainText('A replacement from a backup is being copied in another tab of this browser', { timeout: writeWait(10_000, 50) });
  const after = await replaceDone(page);
  expect(after.files).toEqual(before.files);
  await expect(other.locator('.vaultnote')).toHaveCount(0, { timeout: writeWait(10_000, 100) });
  await expect(other.locator('a.accrow')).toHaveCount(1, { timeout: writeWait(10_000, 100) });
  await other.goto(`/plants/${acc}`); await ready(other);
  await expect(other.locator('.phgrid .ph')).toHaveCount(6, { timeout: writeWait(10_000, 100) });
});
