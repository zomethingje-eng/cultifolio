/** Round-5 grower flows against vite dev: first plant, Species tab switch, follow, bench, events, photo, labels, frost, sowing, backup, offline, keyboard. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/r5';
const log: string[] = [];
const note = (s: string) => { log.push(s); console.log(s); };
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${OUT}/flow-${name}.png`, fullPage: full });
const text = (page: Page, sel: string) => page.locator(sel).first().innerText().catch(() => '(none)');

test.afterAll(() => fs.appendFileSync(`${OUT}/flows.log`, log.join('\n') + '\n'));

test('first visit, first plant, species tab switch, follow, browse', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await shot(page, 'home-empty-390');
  note(`HOME empty head: ${await text(page, '.secsub')} | ${await text(page, '.seccount')} | welcome: ${await text(page, '#welcome')}`);
  await page.fill('.searchbar', 'copiapoa');
  await page.waitForTimeout(800);
  await shot(page, 'home-search-390');
  note(`HOME search seccount: ${await text(page, '.seccount')}`);
  await page.locator('a.tile').first().click();
  await expect(page).toHaveURL(/species\/copiapoa/);
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await shot(page, 'plants-new-prefilled-390');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, 'plant-landing-390');
  note(`PLANT landing text:\n${await page.locator('main, body').first().innerText()}`);
  // species tab now shows mine
  await page.goto('/');
  await expect(page.locator('.tile').first()).toBeVisible();
  note(`HOME after add: ${await text(page, '.secsub')} | ${await text(page, '.seccount')} | headings: ${(await page.locator('h2').allInnerTexts()).join(' / ')}`);
  await shot(page, 'home-mine-390');
  // follow a second species
  await page.goto('/species/welwitschia-mirabilis');
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('button', { name: /Following/ })).toBeVisible();
  await page.goto('/');
  await expect(page.locator('h2', { hasText: 'Following' })).toBeVisible();
  note(`HOME after follow: ${await text(page, '.seccount')} | headings: ${(await page.locator('h2').allInnerTexts()).join(' / ')} | tiles: ${(await page.locator('.tile .nm').allInnerTexts()).join(', ')}`);
  await shot(page, 'home-follow-390');
  // browse all
  await page.getByRole('button', { name: /Browse all/ }).click();
  await page.waitForTimeout(800);
  note(`HOME browse: ${await text(page, '.secsub')} | ${await text(page, '.seccount')} | chips: ${(await page.locator('.chipbtn').allInnerTexts()).join(' | ')}`);
  await shot(page, 'home-browse-390');
  await page.getByRole('button', { name: 'Back to your species' }).first().click();
  await page.waitForTimeout(300);
  note(`HOME back: ${await text(page, '.seccount')} | headings: ${(await page.locator('h2').allInnerTexts()).join(' / ')}`);
  // unfollow from the species page, and the tile goes
  await page.goto('/species/welwitschia-mirabilis');
  await page.getByRole('button', { name: /Following/ }).click();
  await page.goto('/');
  await page.waitForTimeout(500);
  note(`HOME after unfollow: ${await text(page, '.seccount')} | headings: ${(await page.locator('h2').allInnerTexts()).join(' / ')}`);
  // welcome flag survives? reload home in this ctx
  await page.reload();
  note(`HOME reload welcome present: ${await page.locator('#welcome').count()}`);
  await ctx.close();
});

test('bench with coordinates, move, event, photo, labels, frost', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  // a bench with coordinates
  await page.goto('/benches');
  await page.getByRole('button', { name: 'New location' }).click();
  await shot(page, 'bench-new-form');
  note(`BENCH new form fields: ${(await page.locator('form label, form .lbl').allInnerTexts()).join(' | ')}`);
  await page.fill('#loc-name', 'Greenhouse');
  await page.selectOption('#loc-kind', 'greenhouse').catch(async () => note('BENCH kind greenhouse not an option: ' + (await page.locator('#loc-kind option').allInnerTexts()).join(',')));
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree .row', { hasText: 'Greenhouse' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-lat', '51.5');
  await page.fill('#e-lon', '-0.12');
  await page.fill('#e-floor', '5');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(500);
  await shot(page, 'bench-page');
  note(`BENCH page text:\n${await page.locator('main, body').first().innerText()}`);
  // move the plant onto it
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await shot(page, 'plant-move-form', false);
  const opts = await page.locator('select option').allInnerTexts();
  note(`MOVE options: ${opts.join(', ')}`);
  const sel = page.locator('#mv-loc, select').first();
  const v = await page.locator('select option', { hasText: 'Greenhouse' }).first().getAttribute('value');
  await sel.selectOption(v!);
  await page.getByRole('button', { name: 'Move', exact: true }).last().click();
  await expect(page.locator('.idcard .pill', { hasText: 'Greenhouse' })).toBeVisible();
  // log an event
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await shot(page, 'plant-water-form', false);
  await page.fill('#ev-note', 'first drink');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'first drink' })).toBeVisible();
  // photo
  await page.setViewportSize({ width: 1800, height: 1200 });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 70 });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.locator('#acc-photo-file').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  await page.waitForTimeout(500);
  await shot(page, 'plant-full');
  note(`PLANT page after bench+event+photo:\n${await page.locator('main, body').first().innerText()}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForTimeout(800);
  await shot(page, 'plant-full-390');
  await page.setViewportSize({ width: 1000, height: 900 });
  // species page shows my photo + ownership
  await page.goto('/species/copiapoa-cinerea');
  await page.waitForTimeout(500);
  note(`SPECIES after own: pills ${(await page.locator('.pills .pill').allInnerTexts()).join(' | ')} ; yours ${await text(page, '.mine')} ; note foot: ${await text(page, '#gen-note .foot')}`);
  await shot(page, 'species-owned');
  // labels
  await page.goto(`/plants/${acc}`);
  await page.getByRole('link', { name: 'Label' }).click();
  await expect(page).toHaveURL(/\/labels\?acc=/);
  await page.waitForTimeout(500);
  await shot(page, 'labels');
  note(`LABELS text:\n${await page.locator('main, body').first().innerText()}`);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  await shot(page, 'labels-print');
  const printVis = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#topbar, #tabbar, nav, footer, .pick, .page')].map((e) => `${e.tagName}.${e.className}#${e.id} ${getComputedStyle(e).display}`));
  note(`LABELS print visibility: ${printVis.join(' ; ')}`);
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/labels');
  await page.waitForTimeout(500);
  await shot(page, 'labels-390');
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  note(`LABELS 390 overflow: ${JSON.stringify(ov)}`);
  await page.setViewportSize({ width: 1000, height: 900 });
  // frost
  const reqs: string[] = [];
  page.on('request', (r) => { if (r.url().includes('forecast')) reqs.push(r.url()); });
  await page.goto('/frost');
  await page.waitForTimeout(1500);
  await shot(page, 'frost');
  note(`FROST text:\n${await page.locator('main, body').first().innerText()}\nFROST requests: ${reqs.join(', ')}`);
  const fr = await page.request.get('/api/forecast?lat=51.5&lon=-0.12');
  note(`FROST api status ${fr.status()} body ${(await fr.text()).slice(0, 400)}`);
  await page.goto('/benches');
  await page.locator('.tree .row', { hasText: 'Greenhouse' }).click();
  await page.waitForTimeout(1500);
  await shot(page, 'bench-frost');
  note(`BENCH after frost:\n${await page.locator('main, body').first().innerText()}`);
  note(`PAGEERRORS: ${errs.join(' | ') || '-'}`);
  await ctx.close();
});

test('sowing: sow from species page, germination, pot up', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Sow seed' }).click();
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await shot(page, 'sow-new-390');
  note(`SOW form labels: ${(await page.locator('form label, form .lbl').allInnerTexts()).join(' | ')}`);
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-\d{3}$/);
  await shot(page, 'sow-page-390');
  note(`SOW page (no count):\n${await page.locator('main, body').first().innerText()}`);
  await page.fill('#g-n', '3');
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.waitForTimeout(400);
  note(`SOW after count:\n${await page.locator('main, body').first().innerText()}`);
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await shot(page, 'sow-potup-390', false);
  await page.fill('#p-n', '2');
  await page.getByRole('button', { name: /Pot up 2/ }).click();
  await page.waitForTimeout(400);
  await shot(page, 'sow-done-390');
  note(`SOW after pot up:\n${await page.locator('main, body').first().innerText()}`);
  await page.goto('/sowings');
  await shot(page, 'sowings-list-390');
  note(`SOWINGS list:\n${await page.locator('main, body').first().innerText()}`);
  await page.goto('/');
  note(`HOME after potting: ${await text(page, '.seccount')} | ${(await page.locator('.tile .nm').allInnerTexts()).join(', ')}`);
  await ctx.close();
});

test('backup export, fresh context import, compare counts', async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const a = await A.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await a.getByRole('button', { name: 'Add a note' }).click();
  await a.fill('#acc-notes', 'note on the plant');
  await a.locator('#acc-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  const jpeg = await a.screenshot({ type: 'jpeg', quality: 60 });
  await a.locator('#acc-photo-file').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(a.locator('.phgrid .ph')).toHaveCount(1);
  await a.goto('/species/welwitschia-mirabilis');
  await a.getByRole('button', { name: 'Follow' }).click();
  await expect(a.getByRole('button', { name: /Following/ })).toBeVisible();
  await a.getByRole('button', { name: 'Write what you know' }).click();
  await a.fill('#my-notes', 'species note');
  await a.locator('#my-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  await a.waitForTimeout(300);
  const dump = (p: Page) => p.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const stores = [...db.objectStoreNames];
    const out: Record<string, number> = {};
    for (const s of stores) out[s] = await new Promise<number>((res) => { const r = db.transaction(s).objectStore(s).count(); r.onsuccess = () => res(r.result); });
    return out;
  });
  const before = await dump(a);
  await a.goto('/backup');
  await shot(a, 'backup');
  note(`BACKUP text:\n${await a.locator('main, body').first().innerText()}`);
  const dl = a.waitForEvent('download');
  await a.click('#bk-export');
  const file = await dl;
  const path = (await file.path())!;
  note(`BACKUP file ${file.suggestedFilename()} ${fs.statSync(path).size} bytes; stores before ${JSON.stringify(before)}`);
  const B = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await B.newPage();
  await b.goto('/backup');
  await b.locator('#bk-file').setInputFiles(path);
  await b.waitForTimeout(800);
  await shot(b, 'backup-preview-390');
  note(`BACKUP preview: ${await text(b, '.preview')}`);
  await b.click('#bk-merge');
  await expect(b.locator('#bk-done')).toBeVisible();
  note(`BACKUP done: ${await text(b, '#bk-done')}`);
  const after = await dump(b);
  note(`BACKUP stores after ${JSON.stringify(after)}`);
  await b.goto('/');
  await b.waitForTimeout(600);
  note(`BACKUP home after import: ${await text(b, '.seccount')} | ${(await b.locator('h2').allInnerTexts()).join(' / ')}`);
  await b.goto('/species/welwitschia-mirabilis');
  await b.waitForTimeout(600);
  note(`BACKUP species note after import: ${await text(b, '.cult .body')} ; follow button: ${await b.getByRole('button', { name: /Follow/ }).innerText()}`);
  await b.goto('/plants');
  await b.waitForTimeout(600);
  await shot(b, 'plants-after-import-390');
  await A.close(); await B.close();
});

test('offline: cached species page reloads, uncached one falls to the offline page', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready).catch((e) => note('SW ready failed: ' + e));
  await page.goto('/species/copiapoa-cinerea');
  await page.waitForTimeout(1500);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const out: string[] = []; for (const k of ks) { const c = await caches.open(k); out.push(...(await c.keys()).map((r) => new URL(r.url).pathname)); } return { ks, n: out.length, some: out.filter((u) => !u.startsWith('/_app')).slice(0, 30) }; });
  note(`OFFLINE cache: ${JSON.stringify(cached)}`);
  await ctx.route('**/*', (r) => r.abort());
  await page.reload().catch((e) => note('reload threw ' + e.message));
  await page.waitForTimeout(1500);
  await shot(page, 'offline-species-390');
  note(`OFFLINE cached species h1: ${await text(page, 'h1')} | body head: ${(await page.locator('body').innerText()).slice(0, 300)}`);
  await page.goto('/species/welwitschia-mirabilis').catch((e) => note('goto threw ' + e.message));
  await page.waitForTimeout(1500);
  await shot(page, 'offline-uncached-390');
  note(`OFFLINE uncached h1: ${await text(page, 'h1')} | body: ${(await page.locator('body').innerText().catch(() => '(none)')).slice(0, 400)}`);
  await page.goto('/plants').catch((e) => note('goto plants threw ' + e.message));
  await page.waitForTimeout(1500);
  note(`OFFLINE /plants h1: ${await text(page, 'h1')} | ${(await page.locator('body').innerText().catch(() => '(none)')).slice(0, 200)}`);
  await ctx.close();
});

test('keyboard-only add-plant form', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/plants/new');
  const order: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}#${e.id}.${(e.className || '').toString().split(' ')[0]} "${(e.textContent || (e as HTMLInputElement).placeholder || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)} outline=${cs.outlineStyle}/${cs.outlineWidth} shadow=${cs.boxShadow !== 'none'}`; });
    order.push(d);
  }
  note(`KEYBOARD tab order:\n${order.join('\n')}`);
  // type a name, arrow through the picker, enter, fill, submit with Enter
  await page.locator('#species-name').focus();
  await page.keyboard.type('Copiapoa cin');
  await page.waitForTimeout(600);
  await shot(page, 'picker-open', false);
  note(`PICKER contents: ${await text(page, '.picker')}`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  note(`PICKER after ArrowDown+Enter: value=${await page.locator('#species-name').inputValue()} url=${page.url()} picker=${await text(page, '.picker')}`);
  await page.locator('#species-name').focus();
  await page.keyboard.press('Tab');
  await shot(page, 'picker-tabbed', false);
  const focused = await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`);
  note(`PICKER focus after Tab: ${focused}`);
  await page.locator('#f-field').focus();
  await page.keyboard.type('KK 1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  note(`KEYBOARD Enter submits: url=${page.url()}`);
  await ctx.close();
});
