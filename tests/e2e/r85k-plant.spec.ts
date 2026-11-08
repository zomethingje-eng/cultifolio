/**
 * Round eighty-five (K): a plant finds its page by its key when its name has none, and says so.
 *
 * 1. C4, S2 (review-c, review-s): a plant recorded under GBIF's name for a page's key (Kew's name heads the page) opens
 *    on that page's figures, says "Filed under GBIF's name for its key", links the page's own address, shows no "key
 *    differs" notice, and files under the page's name in one tap, the old name kept as received. The sheet the build
 *    files under GBIF's name (`via: 'gbif'`) is routed here, as a corpus walked with this round's code serves it.
 * 2. The same sheet does not answer a plant of another key: "No species page under this name".
 * 3. W2, A11 (review-w, outside review A): "Trichocereus pachanoi", whose form a page holds as an older name, is said
 *    so when the grower asks, and can be filed there.
 * 4. A16a: a plant whose record carries the add form's answer (`olderOf`) says it at once; an edit of the name clears it.
 *
 * FAILS on r85base: 1 (the sheet is shown with nothing said of the name, and no way to file it), 2 (the page is taken
 * whatever the key), 3 ("nor is it an older name of one"), 4 ("No species page under this name").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { injectChanges } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const W = 'abcdefabcdef0000';
const stamp = (wall: number, count = 0) => `${String(wall).padStart(13, '0')}-${count.toString(16).padStart(4, '0')}-${W}`;
const plant = (id: string, wall: number, fields: Record<string, unknown>) => Object.entries(fields).map(([field, value], i) => ({ t: stamp(wall, i), kind: 'accession', id, field, value }));
const json = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const press = async (page: Page, loc: ReturnType<Page['locator']>) => { if (test.info().project.name.startsWith('phone')) await loc.tap(); else await loc.click(); };
async function seed(page: Page, id: string, fields: Record<string, unknown>) {
  await page.goto('/plants'); await ready(page);
  await injectChanges(page, plant(id, Date.now() - 3_600_000, { status: 'growing', ...fields }));
  await page.goto(`/plants/${fields.acc}`); await ready(page);
}
/** Every sheet bucket answered as the corpus answers it, with a copy of Copiapoa cinerea's sheet under another name. */
async function aliasRoute(page: Page, copy: Record<string, unknown>) {
  await page.route(/\/api\/sheets\?/, async (r) => {
    const res = await r.fetch();
    const sheets = (await res.json()) as Array<Record<string, unknown>>;
    await json(r, [...sheets, copy]);
  });
}
const CINEREA_COPY = { key: 'k9', gbif: 77001, slug: 'copiapoa-oldname', via: 'gbif', page: 'copiapoa-cinerea', name: { scientific: 'Copiapoa cinerea', family: 'Cactaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' } };

test('r85k-p 1: a plant under GBIF\'s name for a page\'s key opens on that page, says so, and files there in one tap @phone', async ({ page }) => {
  await aliasRoute(page, CINEREA_COPY);
  await seed(page, 'r-old', { acc: '2026-0051', taxonName: 'Copiapoa oldname', taxonKey: 77001 });
  // Round eighty-six (review-w W1): one set of words for GBIF's name on every surface, "GBIF's name for <page>".
  await expect(page.locator('#found-by')).toHaveText("GBIF's name for Copiapoa cinerea"); // base: nothing said
  await expect(page.locator('#found-by a')).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await expect(page.locator('#name-not-in-reference')).toHaveCount(0);
  await expect(page.locator('#key-differs')).toHaveCount(0);
  await press(page, page.locator('#file-under-older'));
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.idcard .vern').first()).toContainText('received as Copiapoa oldname');
  await expect(page.locator('.tl')).toContainText("Renamed from Copiapoa oldname to Copiapoa cinerea (the reference's name; the old one is GBIF's name for its key)");
});

test('r85k-p 2: the copy under GBIF\'s name does not answer a plant of another key', async ({ page }) => {
  await aliasRoute(page, CINEREA_COPY);
  await seed(page, 'r-other', { acc: '2026-0052', taxonName: 'Copiapoa oldname', taxonKey: 99999 });
  await expect(page.locator('#name-not-in-reference')).toHaveText('No species page under this name'); // base: Copiapoa cinerea's figures
  await expect(page.locator('#found-by')).toHaveCount(0);
});

test('r85k-p 3: a name whose form a page holds as an older name is said so, and can be filed there @phone', async ({ page }) => {
  await page.route(/\/api\/search\?/, (r) => json(r, [{ key: 'k2783497', slug: 'echinopsis-macrogona', name: 'Echinopsis macrogona', gbif: 3952140, family: 'Cactaceae', origin: ['Peru'], photos: 0, open: 3, climate: 'ok', syn: ['Cereus macrogonus', 'Trichocereus pachanoi f. peruvianus'] }]));
  await seed(page, 'r-tp', { acc: '2026-0053', taxonName: 'Trichocereus pachanoi', taxonKey: 7282455 });
  await press(page, page.locator('#look-older'));
  await expect(page.locator('#older-name-of')).toHaveText('A name below it, Trichocereus pachanoi f. peruvianus, is an older name of Echinopsis macrogona'); // base: ", nor is it an older name of one"
  await press(page, page.locator('#file-under-older'));
  await expect(page.locator('h1.sci')).toContainText('Echinopsis macrogona');
  await expect(page.locator('.idcard .vern').first()).toContainText('received as Trichocereus pachanoi');
});

test('r85k-p 4: a plant carrying the add form\'s answer says it at once; an edit of the name clears it @phone', async ({ page }) => {
  let searched = false;
  await page.route(/\/api\/search\?/, (r) => { searched = true; return json(r, []); });
  await seed(page, 'r-aa', { acc: '2026-0054', taxonName: 'Copiapoa olderone', taxonKey: 2777555, olderOf: 'Copiapoa cinerea' });
  await expect(page.locator('#found-by')).toHaveText('An older name of Copiapoa cinerea'); // base: "No species page under this name"
  await expect(page.locator('#key-differs')).toHaveCount(0);
  expect(searched).toBe(false); // found by hash group, never by sending the name
  // The habitat is the page's: Copiapoa cinerea has a climate in the fixture corpus.
  await expect(page.locator('.card', { hasText: 'Habitat rain season' }).locator('.val')).not.toHaveText(/No species page|…/);
  await press(page, page.getByRole('button', { name: /More for this plant/ }));
  await press(page, page.getByRole('menuitem', { name: 'Edit' }));
  await page.locator('#ed-name').fill('Copiapoa humilis');
  await page.locator('#ed-name').press('Tab');
  // Checked as the add form checks a name (round eighty-six, the final review's U4): the search answers nothing here, and
  // once the check has concluded the line says Save keeps the name as typed.
  await expect(page.locator('.editform .picker .hint', { hasText: /press “Save” to keep exactly what you typed/ })).toBeVisible({ timeout: 15_000 });
  await press(page, page.locator('form .actions.wide button[type=submit]'));
  await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
  await expect(page.locator('#found-by')).toHaveCount(0);
  // Polled: the cleared mark is the very line awaited, and WebKit's IndexedDB writes it after the page shows the new name.
  await expect.poll(() => page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === 'olderOf').sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }), { timeout: 15_000 }).toEqual(['Copiapoa cinerea', null]);
});
