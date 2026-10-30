/**
 * Round eighty-two, agent D: the grower's record on the device, as the independent reviews found it (review 1's 14, 15,
 * 16, 18 and 25, review 2's 4). Each test failed on r82base, as its comment says.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready, addPlant, localDay } from './helpers/smoke';
import { writeWait, allowWrites } from './helpers/pace';

// The app's own writes and routes only: no service worker stands between the page and a route's answer.
test.use({ serviceWorkers: 'block' });

/** A browser that has not promised to keep the site's data, as most have not: the reminders' own condition. */
const notPersisted = () => {
  const s = navigator.storage as StorageManager & { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
  if (s) { s.persisted = () => Promise.resolve(false); s.persist = () => Promise.resolve(false); }
};
const plants = (n: number): Row[] => {
  const rows: Row[] = [['location', 'gh', 'name', 'Bench']];
  for (let i = 1; i <= n; i++) rows.push(['accession', `t${i}`, 'acc', `2026-000${i}`], ['accession', `t${i}`, 'taxonName', 'Copiapoa cinerea'], ['accession', `t${i}`, 'status', 'growing'], ['accession', `t${i}`, 'nameKind', 'species'], ['accession', `t${i}`, 'locationId', 'gh']);
  return rows;
};
/** The reminders to back up on screen now: the layer's line, the plants list's line, the backup page's card, a toast asking for one. */
const reminders = async (page: Page): Promise<string[]> => page.evaluate(() => {
  const seen = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;
  const out: string[] = [];
  if (seen(document.querySelector('#backup-nudge'))) out.push('nudge');
  if (seen(document.querySelector('p.keepline'))) out.push('keepline');
  if (seen(document.querySelector('.cult.warn'))) out.push('backup-card');
  const t = document.querySelector('.toast');
  if (t && /take a backup|Back up/.test(t.textContent ?? '')) out.push('toast');
  return out;
});

test('one backup reminder at a time, none over an empty collection, and a restore counted as a backup (review 1\'s 15)', async ({ page: tab, context, browser, baseURL }) => {
  let page = tab;
  allowWrites(60_000);
  await context.addInitScript(notPersisted);
  // Empty: nothing to keep, nothing asked for. r82base: "Kept in this browser only: back up" over an empty list, and the
  // backup page's "Take a backup now" card.
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.empty, .emptybox, #plants-empty').first()).toBeVisible({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(300); // a negative: the line would be drawn with the page
  expect(await reminders(page)).toEqual([]);
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('.secrule', { hasText: 'Take a backup' })).toBeVisible();
  expect(await reminders(page)).toEqual([]);
  // Six plants and no backup: the layer's line on My plants, and nothing beside it. r82base: the line and "Kept in this
  // browser only: back up", and the browser's answer as a toast asking for a backup too.
  await inject(page, plants(6), Date.now() - 86_400_000, 'r82dddddddddddd0');
  await page.goto('/plants'); await ready(page);
  // Both at once: the toast is shown for a while from the page's load, and under a loaded machine the nudge's wait outlasted
  // it (round 83's merge, one flake in a whole run).
  await Promise.all([
    expect(page.locator('#backup-nudge')).toContainText('6 plants and no backup yet', { timeout: writeWait(10_000, 50) }),
    expect(page.locator('.toast')).toContainText('This browser may clear your plants to free space', { timeout: writeWait(15_000, 50) })
  ]);
  expect(await reminders(page)).toEqual(['nudge']);
  await expect(page.locator('.toast')).not.toContainText('take a backup');
  // Today says it in its own line, once: the layer's line is not added to it (r82base: both).
  await page.goto('/today'); await ready(page);
  await page.waitForTimeout(300);
  await expect(page.locator('#backup-nudge')).toHaveCount(0);
  // A backup, and a Replace from it on another device: counted as a backup made there, said as a restore.
  await page.goto('/backup'); await ready(page);
  const dl = page.waitForEvent('download');
  await page.click('#bk-export');
  const path = await (await dl).path();
  // Another device, with nothing of this collection: the backup restored there by Replace.
  const other = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  await other.addInitScript(notPersisted);
  page = await other.newPage();
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('.secrule', { hasText: 'Take a backup' }).locator('.n')).toHaveText('never');
  await page.locator('#bk-file').setInputFiles(path!);
  await page.click('#bk-replace');
  await page.click('#bk-replace-yes');
  await expect(page).toHaveURL(/\/plants$/, { timeout: writeWait(20_000, 300) });
  await ready(page);
  await expect(page.locator('a.accrow')).toHaveCount(6, { timeout: writeWait(10_000, 100) });
  // r82base: "6 plants and no backup yet" right after restoring from one, with two more beside it.
  await page.waitForTimeout(500);
  await expect(page.locator('#backup-nudge')).toHaveCount(0);
  expect((await reminders(page)).length).toBeLessThanOrEqual(1);
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('.secrule', { hasText: 'Take a backup' }).locator('.n')).toHaveText('last today, restored from a file'); // r82base: "never"
  await other.close();
});

test('a batch just started shows its start as the log\'s first line, and its first count is named by its method (review 1\'s 16, review 2\'s 4) @phone', async ({ page }) => {
  allowWrites(30_000);
  await page.goto('/plants'); await ready(page);
  const today = localDay(0);
  await inject(page, [['sowing', 'sc1', 'no', `S${today.slice(0, 4)}-001`], ['sowing', 'sc1', 'taxonName', 'Echeveria affinis'], ['sowing', 'sc1', 'method', 'cutting'], ['sowing', 'sc1', 'sown', today], ['sowing', 'sc1', 'count', 6], ['sowing', 'sc1', 'status', 'active']], Date.now() - 3_600_000, 'r82dddddddddddd1');
  await page.goto(`/propagation/S${today.slice(0, 4)}-001`); await ready(page);
  // r82base: "0 entries" and "Nothing recorded yet."
  await expect(page.locator('#log-start')).toHaveText(new RegExp(`^\\s*${today}\\s*Started\\s6\\scuttings\\s*the batch's own record\\s*$`), { timeout: writeWait(10_000, 30) });
  await expect(page.locator('.secrule', { hasText: 'Log' }).locator('.n')).toHaveText('1 entry');
  await expect(page.getByText('Nothing recorded yet.')).toHaveCount(0);
  await expect(page.locator('#log-start .rm')).toHaveCount(0); // the batch's own record: not removed from here
  // Four struck, as the batch page counts them; Today says so in the batch's own words. r82base: "First seedlings up".
  await inject(page, [['event', 'g1', 'acc', 'sc1'], ['event', 'g1', 'd', today], ['event', 'g1', 't', 'germinate'], ['event', 'g1', 'n', 4]], Date.now() - 60_000, 'r82dddddddddddd1');
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#firsts')).toContainText(`First cuttings struck in S${today.slice(0, 4)}-001 Echeveria affinis: 4 counted, today.`, { timeout: writeWait(10_000, 30) });
  await expect(page.locator('#firsts')).not.toContainText('seedlings');
});

/** Whether two boxes share any area. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('the Undo toast never sits over a form\'s buttons: Water, then Record… (review 1\'s 14) @phone', async ({ page }) => {
  allowWrites(30_000);
  if (!/phone/.test(test.info().project.name)) await page.setViewportSize({ width: 489, height: 627 }); // the review's pane
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await page.evaluate(() => { document.body.style.paddingBottom = '1500px'; }); // room to bring the form's buttons to the toast's place
  await page.locator('#water-now').click();
  const t = page.locator('.toast');
  await expect(t).toContainText('Watering recorded', { timeout: writeWait(5_000, 40) });
  await page.getByRole('button', { name: 'Record…', exact: true }).click();
  const cancel = page.locator('form.evform .actions .btn', { hasText: 'Cancel' });
  await expect(cancel).toBeVisible();
  // The form's buttons brought to where the toast sits, as a short screen leaves them (r82base: the toast covered Cancel).
  const tb = (await t.boundingBox())!;
  const cb = (await cancel.boundingBox())!;
  await page.evaluate((dy) => window.scrollBy(0, dy), cb.y + cb.height / 2 - (tb.y + tb.height / 2));
  await expect.poll(async () => {
    const [tt, c, r] = [await t.boundingBox(), await cancel.boundingBox(), await page.locator('form.evform .actions .btn.pri').boundingBox()];
    return !!tt && !!c && !!r && (await t.textContent())!.includes('Watering recorded') && !overlap(tt, c) && !overlap(tt, r);
  }, { timeout: 5_000 }).toBe(true);
  // And the Undo is still there to press.
  await expect(t.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('the add form\'s pinned bar never hides the field being filled: the window shrinking under it, as a phone\'s keyboard opening does, brings it above the bar (review 1\'s 25) @phone', async ({ page }) => {
  await page.setViewportSize({ width: 489, height: 627 });
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  const bar = page.locator('.actions.sticky');
  const field = page.locator('#f-date');
  await expect(bar).toBeVisible();
  // Out of sight: under the bar, or below it (under the tab bar, past the window's foot).
  const under = async () => { const [b, f] = [await bar.boundingBox(), await field.boundingBox()]; return !!b && !!f && f.y + f.height > b.y; };
  // The field tapped where it shows above the bar (the review's pane: the bar's top edge already on its foot).
  const fb = (await field.boundingBox())!;
  await page.mouse.click(fb.x + 20, fb.y + 10);
  await expect(field).toBeFocused();
  // The keyboard takes the lower part of the window: the bar moves up with the window's foot, over the field.
  await page.setViewportSize({ width: 489, height: 520 });
  // r82base: the field stayed under the bar.
  await expect.poll(under, { timeout: 3_000 }).toBe(false);
  const [b, f] = [(await bar.boundingBox())!, (await field.boundingBox())!];
  expect(f.y + f.height).toBeLessThanOrEqual(b.y);
  expect(f.y).toBeGreaterThanOrEqual(0);
  await expect(field).toBeFocused();
});

/** A forecast answered for the site, its nights from now: `nights` are [days from now, minimum °C]. */
function forecast(nights: Array<[number, number]>) {
  const now = Date.now();
  const days = nights.map(([d, tmin]) => {
    const at = new Date(now + d * 86_400_000);
    const date = at.toISOString().slice(0, 10);
    return { date, tmin, tmax: tmin + 8, precipMm: 0, steps: 24, tminAt: `${date}T11:00:00Z` };
  });
  const firstFrost = days.find((x) => x.tmin <= 0)?.date;
  const firstCold = days.find((x) => x.tmin <= 3)?.date;
  const night = days.find((x) => x.date === (firstFrost ?? firstCold));
  const risk = firstFrost ? { level: 'frost', text: `Frost forecast: ${night!.tmin.toFixed(1)} °C around 06:00 Monday solar time (${firstFrost}, MET Norway).` }
    : firstCold ? { level: 'cold', text: `Cold night ahead: ${night!.tmin.toFixed(1)} °C around 06:00 Monday solar time (${firstCold}, MET Norway).` }
    : { level: 'none', text: 'No frost in the next 216 hours of forecast; coldest 9.0 °C around 06:00 Monday solar time (MET Norway).' };
  return { lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: new Date(now).toISOString(), days, hoursCovered: 216, offsetH: -5, firstFrost, firstCold }, alerts: [], alertsStatus: 'none', risk, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] };
}

test('the frost bar: a night within 72 hours or below a space\'s floor, dated, red only at freezing (review 1\'s 18)', async ({ page }) => {
  let answer = forecast([[1, 9], [9, 2.4]]);
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) }));
  await page.goto('/plants'); await ready(page);
  await page.evaluate(() => { localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Home' })); sessionStorage.clear(); });
  await inject(page, plants(1), Date.now() - 86_400_000, 'r82dddddddddddd2');
  // A cold night above freezing nine days out: no bar on every page (r82base: a red bar, "Cold night ahead").
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await page.waitForTimeout(800);
  await expect(page.locator('#frostbar')).toHaveCount(0);
  // The front page still says it, amber and dated.
  await page.goto('/'); await ready(page);
  const line = page.locator('.today .line', { hasText: 'Cold night ahead' });
  await expect(line).toContainText(/\((Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} [A-Z][a-z]+, \d{4}-\d\d-\d\d/);
  await expect(line).toHaveClass(/warn/);
  // A frost tomorrow night: the red bar, dated.
  answer = forecast([[1, -1.5]]);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#frostbar')).toContainText('Frost forecast: -1.5 °C');
  await expect(page.locator('#frostbar')).toContainText(/\((Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} [A-Z][a-z]+, /);
  await expect(page.locator('#frostbar')).not.toHaveClass(/warn/);
  // A cold night above freezing tomorrow: the bar, amber.
  answer = forecast([[1, 2.1]]);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#frostbar')).toContainText('Cold night ahead');
  await expect(page.locator('#frostbar')).toHaveClass(/warn/);
  // Six days out, 6 °C: below the bench's 8 °C floor, so the bar says so, with the space and the date.
  answer = forecast([[1, 12], [6, 6]]);
  await inject(page, [['location', 'gh', 'floorC', 8]], Date.now() - 60_000, 'r82dddddddddddd2');
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#frostbar')).toContainText("Forecast below Bench's 8.0 °C floor: 6.0 °C outside (");
  await expect(page.locator('#frostbar')).toHaveClass(/warn/);
});
