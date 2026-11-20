/**
 * Round ninety-nine (docs/REVIEW-ROUND-99.md): the collection encrypted on the device, in the browser. Turned on in Settings
 * under the lock's passcode (8 characters or more, with a way back), the browser's database holds no plant name or note;
 * a new tab is locked and its passcode opens the collection as it was; a reload of an unlocked tab takes the key from
 * another open tab, and with none open it asks; turned off, the records are plain again and the collection the same. And
 * with no sync key, the lock screen deletes the collection on this device so a backup file can be restored.
 *
 * On e89438b: Settings had no #seal-on-btn, and the database held every value plain; every case FAILED.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const PASS = 'a long passcode 99';
const plant = (id: string, no: string, name: string, notes: string): Row[] => Object.entries({ acc: no, taxonName: name, status: 'growing', nameKind: 'species', locationId: 'b1', notes }).map(([f, v]) => ['accession', id, f, v] as Row);

async function open(page: Page, writer: string) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [['location', 'b1', 'name', 'Bench'], ...plant('s1', '2026-0001', 'Refusia sealii', 'kept under glass, Zq7')], Date.now() - 40 * DAY, writer);
}
/** Every change in the browser's database, as stored, and its text. */
async function stored(page: Page): Promise<{ n: number; withValue: number; text: string }> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('cultifolio');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction('changes').objectStore('changes').getAll();
      q.onsuccess = () => {
        const all = q.result as Array<Record<string, unknown>>;
        const text = all.map((c) => JSON.stringify(c, (_k, v) => (v instanceof Uint8Array ? Array.from(v, (b) => String.fromCharCode(b)).join('') : v))).join('\n');
        db.close();
        resolve({ n: all.length, withValue: all.filter((c) => 'value' in c).length, text });
      };
    };
  }));
}
async function lockAndEncrypt(page: Page) {
  // the way back: a backup made today
  await page.goto('/backup'); await ready(page);
  const bk = page.waitForEvent('download');
  await page.locator('#bk-export').click();
  const file = (await (await bk).path())!;
  await page.goto('/settings'); await ready(page);
  await page.locator('#lock-pass1').fill(PASS);
  await page.locator('#lock-pass2').fill(PASS);
  await page.locator('#lock-set').click();
  await expect(page.locator('#lock-on')).toBeVisible();
  // a short passcode is refused for encryption; the lock's own passcode, ticked, is taken
  await page.locator('#seal-pass').fill(PASS);
  await page.locator('#seal-on-btn').click();
  await expect(page.locator('#seal-msg')).toContainText('Tick the box first');
  await page.locator('#seal-sure').check();
  await page.locator('#seal-on-btn').click();
  await expect(page.locator('#seal-msg')).toContainText('is encrypted', { timeout: 20_000 });
  await expect(page.locator('#seal-on')).toBeVisible();
  return file;
}

test('r99c 1: encrypted: nothing plain in the database; a new tab asks; a reload takes the key from an open tab, or asks; decrypted, the same', async ({ page, context }) => {
  test.setTimeout(120_000);
  await open(page, 'r99cccccccccc001');
  const plain = await stored(page);
  expect(plain.text).toContain('Refusia sealii');
  await lockAndEncrypt(page);
  const sealed = await stored(page);
  expect(sealed.n).toBe(plain.n);
  expect(sealed.withValue).toBe(0);
  expect(sealed.text).not.toContain('Refusia');
  expect(sealed.text).not.toContain('Zq7');
  // a new tab: locked, the wrong passcode opens nothing, the right one opens the collection as it was
  const two = await context.newPage();
  await two.goto('/plants'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await expect(two.locator('#lock-sealed-what')).toContainText('encrypted under the passcode');
  await two.locator('#lock-pass').fill('not the passcode');
  await two.locator('#lock-open').click();
  await expect(two.locator('#lock-msg')).toContainText('not the passcode');
  await two.locator('#lock-pass').fill(PASS);
  await two.locator('#lock-open').click();
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  await expect(two.locator('a.accrow')).toHaveCount(1);
  await expect(two.locator('a.accrow')).toContainText('Refusia sealii');
  // a reload of an unlocked tab, with another open: the key handed over, no passcode asked
  await two.reload(); await ready(two);
  await expect(two.locator('a.accrow')).toContainText('Refusia sealii');
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  // with no other tab open, a reload asks
  await page.close();
  await two.reload(); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await two.locator('#lock-pass').fill(PASS);
  await two.locator('#lock-open').click();
  await expect(two.locator('a.accrow')).toContainText('Refusia sealii');
  // decrypted: plain again, the collection the same, the lock still on (a new page load in the only open tab asks again)
  await two.goto('/settings'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await two.locator('#lock-pass').fill(PASS);
  await two.locator('#lock-open').click();
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  await two.locator('#seal-pass').fill(PASS);
  await two.locator('#seal-off').click();
  await expect(two.locator('#seal-msg')).toContainText('no longer encrypted', { timeout: 20_000 });
  const back = await stored(two);
  expect(back.withValue).toBe(back.n);
  expect(back.text).toContain('Refusia sealii');
  await expect(two.locator('#lock-on')).toBeVisible();
  await two.goto('/plants'); await ready(two);
  await expect(two.locator('a.accrow')).toContainText('Refusia sealii');
});

test('r99c 2: forgotten, with no sync key: the lock screen deletes the collection here so a backup file can be restored', async ({ page, context }) => {
  test.setTimeout(120_000);
  await open(page, 'r99cccccccccc002');
  await lockAndEncrypt(page);
  await page.close();
  const two = await context.newPage();
  await two.goto('/today'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await two.locator('#lock-forgot').click();
  await expect(two.locator('#lock-ways-here')).toContainText('encrypted under the passcode');
  await expect(two.locator('#lock-file')).toHaveCount(0); // a backup file cannot open it
  await two.locator('#lock-erase').click();
  await expect(two.locator('#lock-ways')).toContainText('Tick the box first');
  await two.locator('#lock-erase-sure').check();
  await two.locator('#lock-erase').click();
  await two.waitForURL(/\/backup$/, { timeout: 20_000 }); await ready(two);
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  expect((await stored(two)).n).toBe(0);
});
