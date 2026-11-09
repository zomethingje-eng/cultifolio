/**
 * Round eighty-seven, the stage 3 fixes, in the browser (the review of the tracker: B1, S2, S3, M3, M4, M5).
 *
 * 1. B1: a label's code with its plant's identity tag opens that plant only when it holds the number; a label printed
 *    for a plant renumbered since lists both plants and opens neither; with no tag, a number a renumbering moved a plant
 *    off lists both too; a tag no plant here has says the label names a plant this collection does not hold under that
 *    identity; a code printed by round eighty-six (the identity) still opens its plant; the list links the number's
 *    holder by its identity.
 * 2. M4: removing a Pollinated line a batch names as its cross says which batch first; the batch then says its line was
 *    removed, and brings it back. M3: a plant growing that still carries a deaccession is not shown as no longer held.
 * 3. S2: the Backup page says what the papers hold of the collection's 300 MB.
 * 4. M5: five wrong passcodes make the screen wait, and a reload does not reset the wait; a locked plant page is not
 *    titled by the plant's number and species. PBKDF2 at 600,000 rounds is timed with the CPU slowed sixfold.
 * 5. S3: stopping sync on a locked device says what opens the lock afterwards, and the key it synced with still opens it.
 *
 * Fails on the base (r87final, dd20377): the label pages open the plant holding the number; no #cross-named; the stale
 * deaccession shown; no #bk-papers; the wait gone on reload; the title the plant's; the key refused once sync stopped.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { fromAddress } from './helpers/address';
import { chromiumOnly } from './helpers/engines';
import { tag36 } from '../../src/lib/core/tag';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
/** The identity tag a label's code carries ($lib/ui/grow/qr's `idTag`). */
const idTag = (id: string) => tag36(`label:${id}`).slice(0, 6);
const plant = (id: string, no: string, name: string, more: Record<string, unknown> = {}): Row[] => Object.entries({ acc: no, taxonName: name, status: 'growing', nameKind: 'species', locationId: 'b1', ...more }).map(([f, v]) => ['accession', id, f, v] as Row);
const line = (id: string, acc: string, d: string, t: string, more: Record<string, unknown> = {}): Row[] => Object.entries({ acc, d, t, ...more }).map(([f, v]) => ['event', id, f, v] as Row);
async function open(page: Page, rows: Row[], writer: string) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [['location', 'b1', 'name', 'Bench'], ...rows], Date.now() - 40 * DAY, writer);
}

test('r87s3 1: a label opens its plant only by its tag; a renumbered plant\'s label lists both; another collection\'s label says so (B1) @phone', async ({ page }) => {
  // k1 holds 2026-0020; m1 held it before and was renumbered to 2026-0021, with the repair's line.
  await open(page, [...plant('k1', '2026-0020', 'Copiapoa cinerea'), ...plant('m1', '2026-0021', 'Copiapoa hypogaea'), ...line('e_r1', 'm1', '2026-10-01', 'note', { note: 'Renumbered from 2026-0020 to 2026-0021: another plant, recorded first, had been given 2026-0020 (on another device, or in a file merged in).' })], 'r87s3aaaaaaaaa01');
  // m1's label, printed when it was 2026-0020: both listed, neither opened.
  await page.goto(`/plants/2026-0020#i=${idTag('m1')}`); await ready(page);
  await expect(page.locator('#renumbered-to')).toContainText('This label was printed for a plant numbered 2026-0020 then, and it is numbered otherwise now; 2026-0020 is another plant\'s now.');
  await expect(page.locator('#label-choices li')).toHaveCount(2);
  await expect(page.locator('#label-choices li').first()).toContainText('2026-0021');
  await expect(page.locator('#label-choices li').first()).toContainText('the plant this label was printed for');
  await expect(page.locator('#label-choices li').nth(1)).toContainText('numbered 2026-0020 now');
  await expect(page.locator('.idcard')).toHaveCount(0);
  await page.locator('#label-choices li').first().locator('a').click();
  await expect(page).toHaveURL(/\/plants\/m1$/);
  await expect(page.locator('h1')).toContainText('Copiapoa hypogaea');
  // k1's own label: its plant.
  await page.goto(`/plants/2026-0020#i=${idTag('k1')}&s=copiapoa-cinerea&n=Copiapoa%20cinerea`); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#label-choices')).toHaveCount(0);
  // The number typed, with no tag: both, since a plant was moved off it.
  await page.goto('/plants/2026-0020'); await ready(page);
  await expect(page.locator('#renumbered-to')).toContainText('2026-0020 was renumbered');
  await expect(page.locator('#label-choices li')).toHaveCount(2);
  // m1's own number has no such past: it opens.
  await page.goto('/plants/2026-0021'); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa hypogaea');
  // A label from another collection: its tag is no plant's here.
  await page.goto('/plants/2026-0020#i=zz00zz&s=aloe-vera&n=Aloe%20vera'); await ready(page);
  await expect(page.locator('#label-foreign')).toHaveText("This label's code names a plant this collection does not hold under that identity; your 2026-0020 is another plant. It may be a label from someone else's collection.");
  await expect(page.locator('#label-choices li')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#foreign-label')).toContainText('Aloe vera');
  await expect(page).toHaveTitle('A plant label · Cultifolio');
  // A code printed by round eighty-six carries the identity, and still opens its plant.
  await page.goto('/plants/k1#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  // The plants list links the holder of a number with such a past by its identity.
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('a.accrow[href="/plants/k1"]')).toHaveCount(1);
  await expect(page.locator('a.accrow[href="/plants/2026-0021"]')).toHaveCount(1);
});

test('r87s3 2: a cross a batch names asks before it goes, and the batch says its line was removed; a stale deaccession is not shown (M4, M3)', async ({ page }) => {
  await open(page, [
    ...plant('p1', '2026-0001', 'Copiapoa cinerea'), ...plant('p2', '2026-0002', 'Copiapoa cinerea'),
    ...line('ex1', 'p1', '2026-04-01', 'pollinate', { pollen: 'p2' }),
    ...Object.entries({ no: 'S2026-001', taxonName: 'Copiapoa cinerea', method: 'seed', sown: '2026-05-01', count: 40, status: 'active', cross: 'ex1' }).map(([f, v]) => ['sowing', 's1', f, v] as Row),
    ...plant('q1', '2026-0003', 'Lithops lesliei', { deacc: 'given', deaccOn: '2026-10-02' }) // round 86's "Mark growing" left the reason
  ], 'r87s3aaaaaaaaa02');
  await page.goto('/plants/2026-0001'); await ready(page);
  const row = page.locator('.tlrow', { hasText: 'Pollinated' });
  await row.locator('button.rm').click();
  await expect(page.locator('#cross-named')).toHaveText("Batch S2026-001 names this cross as its seed's parents. Removing the line takes both parents off its seedlings and the cross out of batches.csv. Press Remove? again to remove it.");
  await row.locator('button.rm.confirm').click();
  await expect(page.locator('.tlrow', { hasText: 'Pollinated' })).toHaveCount(0);
  await page.goto('/propagation/S2026-001'); await ready(page);
  await expect(page.locator('#batch-cross')).toContainText('from a cross: the line it came from was removed');
  await page.locator('#batch-cross-back').click();
  await expect(page.locator('#batch-cross')).toContainText('seed from the cross');
  // M3
  await page.goto('/plants/2026-0003'); await ready(page);
  await expect(page.locator('h1')).toContainText('Lithops lesliei');
  await expect(page.locator('#no-longer-held')).toHaveCount(0);
  await page.goto('/plants/gone'); await ready(page);
  await expect(page.locator('main')).not.toContainText('2026-0003');
});

test('r87s3 3: the Backup page says what the papers hold of the collection\'s room (S2)', async ({ page }) => {
  await open(page, [...plant('p1', '2026-0001', 'Copiapoa cinerea'), ...Object.entries({ acc: 'p1', d: '2026-11-01', mime: 'application/pdf', fileName: 'permit.pdf', doc: 'cites', bytes: 3 * 1048576, sha: 'ab'.repeat(32) }).map(([f, v]) => ['photo', 'att1', f, v] as Row)], 'r87s3aaaaaaaaa03');
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('#bk-papers')).toHaveText('Papers kept with your plants: 3.0 MB of the 300 MB a collection keeps.');
});

test('r87s3 4: five wrong passcodes wait across a reload; a locked plant page keeps its title to itself; PBKDF2 timed slowed (M5) @phone', chromiumOnly('the CPU is slowed through the Chrome DevTools Protocol, which only Chromium speaks'), async ({ page, context, browserName }) => {
  test.setTimeout(120_000);
  await open(page, plant('l1', '2026-0001', 'Refusia testii'), 'r87s3aaaaaaaaa04');
  await page.goto('/backup'); await ready(page);
  const bk = page.waitForEvent('download');
  await page.locator('#bk-export').click();
  await bk;
  await page.goto('/settings'); await ready(page);
  await page.locator('#lock-pass1').fill('2468');
  await page.locator('#lock-pass2').fill('2468');
  await page.locator('#lock-set').click();
  await expect(page.locator('#lock-on')).toBeVisible();
  const two = await context.newPage();
  await two.goto('/plants/2026-0001'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await expect(two).toHaveTitle('Locked · Cultifolio');
  for (let i = 0; i < 5; i++) {
    await two.locator('#lock-pass').fill(`000${i}`);
    await two.locator('#lock-open').click();
    await expect(two.locator('#lock-msg')).toContainText(i < 4 ? 'not the passcode' : 'try again in 30 seconds');
  }
  await two.reload(); await ready(two);
  await expect(two.locator('#lock-open')).toContainText(/Wait \d+ s/);
  await two.locator('#lock-pass').fill('2468');
  await two.locator('#lock-open').click();
  await expect(two.locator('#lockscreen')).toBeVisible(); // still waiting: the right passcode is not tried
  await expect(two).toHaveTitle('Locked · Cultifolio');
  // One PBKDF2-SHA-256 check of 600,000 rounds, timed at the CPU slowed sixfold (a slow phone's), then as it is.
  const time = () => two.evaluate(async () => {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('2468'), 'PBKDF2', false, ['deriveBits']);
    const t0 = performance.now();
    await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(16), iterations: 600_000 }, base, 256);
    return performance.now() - t0;
  });
  const cdp = browserName === 'chromium' ? await context.newCDPSession(two) : null;
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const slow = await time();
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const fast = await time();
  console.log(`r87s3 4: PBKDF2-SHA-256 600,000 rounds: ${Math.round(slow)} ms with the CPU slowed sixfold, ${Math.round(fast)} ms as it is`);
  expect(slow).toBeLessThan(10_000);
});

test('r87s3 5: stopping sync on a locked device says what opens the lock after, and the key it synced with still does (S3)', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await fromAddress(ctx);
  const page = await ctx.newPage();
  await open(page, plant('l1', '2026-0001', 'Refusia testii'), 'r87s3aaaaaaaaa05');
  await page.goto('/sync'); await ready(page);
  await page.click('#sync-start');
  const key = (await page.locator('#vault-key').textContent())!.trim();
  await page.fill('#key-typeback', key.slice(-5).toLowerCase());
  await page.click('#sync-create');
  await expect(page.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: 20_000 });
  await page.goto('/settings'); await ready(page);
  await page.locator('#lock-pass1').fill('2468');
  await page.locator('#lock-pass2').fill('2468');
  await page.locator('#lock-set').click();
  await expect(page.locator('#lock-on')).toBeVisible();
  await page.goto('/sync'); await ready(page);
  await page.locator('#sync-forget').click();
  await expect(page.locator('#sync-forget-lock')).toContainText('After you stop, the key still opens the lock here');
  await expect(page.locator('#sync-forget-unlock')).toHaveAttribute('href', '/settings#lock');
  await expect(page.locator('#sync-forget-backup')).toHaveAttribute('href', '/backup');
  await page.locator('#sync-forget-yes').click();
  await expect(page.locator('#sync-start')).toBeVisible({ timeout: 15_000 });
  const two = await ctx.newPage();
  await two.goto('/plants'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await two.locator('#lock-forgot').click();
  await expect(two.locator('#lock-ways-here')).toContainText('stopped syncing while locked and kept the sync key it synced with');
  await two.locator('#lock-key').fill('NOT-THE-KEY');
  await two.locator('#lock-bykey').click();
  await expect(two.locator('#lock-ways')).toContainText("That is not this device's sync key.");
  await two.locator('#lock-key').fill(key.toLowerCase());
  await two.locator('#lock-bykey').click();
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  await ctx.close();
});
