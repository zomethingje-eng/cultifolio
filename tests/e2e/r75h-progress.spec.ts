/**
 * Round seventy-five, the harness (agent H): the wait that follows the store's progress (helpers/progress.ts), which
 * smoke-3's backup of four hundred plants now uses in place of a time worked out beforehand (WebKit on the owner's PC ran
 * past its 125 s once, still writing).
 *
 * Chromium is slowed twenty times over (a CDP CPU throttle, so the first test is Chromium's alone): the same merge of
 * 2,000 changes then takes several seconds, and a wait of one-second windows carries on through window after window
 * because the database keeps answering, where a fixed wait of one window fails. And a page whose database has gone quiet
 * fails after one window, with the check's own message, rather than waiting out the test.
 */
import { zipSync, strToU8 } from 'fflate';
import { test, expect, type Page } from '@playwright/test';
import { watchStorage, whileStoring, storageAnswers } from './helpers/progress';

test.use({ serviceWorkers: 'block' });

/** A backup of four hundred plants with a kilobyte of notes each, as smoke-3's test makes it. */
function backup(): Buffer {
  const wall = Date.now() - 3_600_000;
  const changes: unknown[] = [];
  let n = 0;
  const c = (kind: string, id: string, field: string, value: unknown) => changes.push({ t: `${wall + n}-${(n++ % 65536).toString(16).padStart(4, '0')}-abcdefabcdef0000`.replace(/^(\d{13})\d*/, '$1'), kind, id, field, value });
  const note = 'Grown hard on the south bench; watered when the pot is light. '.repeat(20);
  for (let i = 1; i <= 400; i++) {
    const id = `r-seed-${i}`;
    c('accession', id, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis');
    c('accession', id, 'status', 'growing');
    c('accession', id, 'acquired', '2025-03-01');
    c('accession', id, 'notes', `${i}: ${note}`);
    c('accession', id, 'acc', `2025-${String(i).padStart(4, '0')}`);
  }
  const manifest = { format: 'cultifolio-backup', v: 1, exported: new Date().toISOString(), counts: { changes: changes.length, accessions: 400, events: 0, locations: 0, sowings: 0, taxa: 0, photos: 0, photoBytes: 0 } };
  return Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'changes.json': strToU8(JSON.stringify(changes)) }));
}
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

// Up to three restores, each in a fresh context, until one takes more than one window (round seventy-seven, the merge).
// Under the 20x throttle the check's own look at the page is a task in the throttled renderer, and it can wait behind the
// merge's longer tasks until the merge is done: that restore counts as one window however long it lasted, so a single
// restore's count was flaky, on r77base too (1 restore in 4 of a 6 to 7 s merge, alone; the whole strict run, once). Each
// restore must still be waited for to its end; only the count is taken from the best of them.
test('r75h progress 1: a slow restore is waited for while the database answers, past any one window', { tag: '@chromium' }, async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const seen: string[] = [];
  let most = 0;
  for (let attempt = 1; attempt <= 3 && most <= 1; attempt++) {
    const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block', locale: 'en-GB' });
    const page = await ctx.newPage();
    await watchStorage(page);
    await page.goto('/backup');
    await ready(page);
    await page.locator('#bk-file').setInputFiles({ name: 'seed.cultifolio.zip', mimeType: 'application/zip', buffer: backup() });
    await expect(page.locator('.preview')).toContainText('400 plants');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    const t0 = Date.now();
    await page.click('#bk-merge');
    // One-second windows: the throttled merge takes many, and each that saw the database answer starts another.
    const windows = await whileStoring(page, (timeout) => expect(page.locator('#bk-done')).toContainText('400 plants', { timeout }), 1_000);
    const took = Date.now() - t0;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    seen.push(`${took} ms at a 20x throttle, ${windows} windows of 1 s`);
    most = Math.max(most, windows);
    await ctx.close();
  }
  test.info().annotations.push({ type: 'restore', description: seen.join('; ') });
  expect(most, seen.join('; ')).toBeGreaterThan(1); // a fixed wait of one window would have failed it
});

test('r75h progress 2: a page whose database has gone quiet fails after one window, with the check\'s own words', async ({ page }) => {
  await watchStorage(page);
  await page.goto('/backup');
  await ready(page);
  // Let the page's own opening reads finish, then read that nothing more is being answered.
  await expect.poll(async () => { const a = await storageAnswers(page); await page.waitForTimeout(1_000); return (await storageAnswers(page)) - a; }, { timeout: 20_000 }).toBe(0);
  expect(await storageAnswers(page)).toBeGreaterThan(0); // the counter is in the page and counted the opening
  const t0 = Date.now();
  const failed = await whileStoring(page, (timeout) => expect(page.locator('#bk-done')).toContainText('400 plants', { timeout }), 2_000).then(() => null, (e: Error) => e);
  expect(failed?.message).toContain('400 plants');
  expect(Date.now() - t0).toBeLessThan(10_000); // one quiet window, not the test's whole time
});
