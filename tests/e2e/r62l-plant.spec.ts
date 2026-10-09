import { test, expect, type Page } from '@playwright/test';
import { injectChanges, type Stamped } from './helpers/inject';

/**
 * Round sixty-two (agent L): the plant page's own items of decisions 2, 4, 5 and 8, each failing on the round-sixty-one
 * base. Each test opens its own context, so the collection starts empty.
 *  - a "cf." plant's link reads "Compare: Copiapoa cinerea", and its habitat comparison is headed so (A21);
 *  - a name the reference answered it does not hold is "Name not in the reference", not "not checked" (the grower
 *    review's 9);
 *  - an "sp." plant's notes are its own, not every bare-genus plant's; notes written on the genus before are still shown
 *    and offered (A21);
 *  - the edit form says "As imported: 2017-08" under a partial date (the records review's 11);
 *  - a removed plant is named with its cultivar (the grower review's 11);
 *  - a record whose missing fields are all parked shows the Parked notice with Apply, not "waiting for a newer version"
 *    (the clock review's 3). This one also needs StateNote.svelte's <p> to be a <div> (L's report, "Needs from others"):
 *    a <details> inside a <p> is split off when the template is cloned, and every StateNote threw "Illegal invocation".
 */

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Changes with the given stamps, through the shared seed helper's write contract (arrival rows, ledger, parks, the fold counter); the next load folds them. */
const inject = (page: Page, rows: Stamped[], parked: string[] = []) => injectChanges(page, rows, parked);
const W = 'abcdefabcdef0000';
const stamp = (wall: number, count = 0, writer = W) => `${String(wall).padStart(13, '0')}-${count.toString(16).padStart(4, '0')}-${writer}`;
const plant = (id: string, wall: number, fields: Record<string, unknown>) => Object.entries(fields).map(([field, value], i) => ({ t: stamp(wall, i), kind: 'accession', id, field, value }));

test('a "cf." plant links and compares its habitat as "Compare: Copiapoa cinerea" (A21)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-cf', Date.now() - 3_600_000, { acc: '2026-0001', taxonName: 'Copiapoa cf. cinerea', status: 'growing' }));
  await page.goto('/plants/2026-0001'); await ready(page);
  await expect(page.locator('#species-link')).toHaveText('Compare: Copiapoa cinerea');
  await expect(page.locator('#species-link')).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await expect(page.locator('#habitat summary h2')).toHaveText('Compare: Copiapoa cinerea, habitat vs this place');
});

test('a name the reference answered it does not hold is "Name not in the reference", not "not checked" (grower 9)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-x', Date.now() - 3_600_000, { acc: '2026-0002', taxonName: 'Notaplantia fakeus', status: 'growing' }));
  await page.goto('/plants/2026-0002'); await ready(page);
  await expect(page.locator('#name-not-in-reference')).toHaveText('Name not in the reference');
  await expect(page.locator('.idcard .nc')).toHaveCount(0);
});

test('an "sp." plant\'s notes are its own; notes kept on the genus before are shown and can be kept for its name (A21)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const w = Date.now() - 3_600_000;
  await inject(page, [
    ...plant('r-sp1', w, { acc: '2026-0003', taxonName: 'Lithops sp. C 036', status: 'growing' }),
    ...plant('r-sp2', w + 10, { acc: '2026-0004', taxonName: 'Lithops sp. C 120', status: 'growing' }),
    { t: stamp(w + 20, 0), kind: 'taxon', id: 'lithops', field: 'name', value: 'Lithops' },
    { t: stamp(w + 20, 1), kind: 'taxon', id: 'lithops', field: 'myNotes', value: 'Written on the genus before' }
  ]);
  await page.goto('/plants/2026-0003'); await ready(page);
  await expect(page.locator('#shared-genus-notes')).toHaveText('Written on the genus before');
  await page.getByRole('button', { name: 'Keep them for this name' }).click();
  await page.fill('#taxon-notes', 'C 036: water in autumn');
  await page.locator('.cult .actions .btn.pri', { hasText: 'Save' }).last().click();
  await expect(page.locator('main')).toContainText('C 036: water in autumn');
  await page.goto('/plants/2026-0004'); await ready(page);
  await expect(page.locator('main')).not.toContainText('C 036: water in autumn');
  await expect(page.locator('#shared-genus-notes')).toHaveText('Written on the genus before');
});

test('the edit form says what a partial date was imported as (records 11); a removed plant is named with its cultivar (grower 11)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const w = Date.now() - 3_600_000;
  await inject(page, [
    ...plant('r-part', w, { acc: '2026-0005', taxonName: 'Copiapoa cinerea', status: 'growing', acquired: '2017-08' }),
    ...plant('r-gone', w + 10, { acc: '2026-0006', taxonName: 'Haworthia retusa', cultivar: 'King', status: 'growing' }),
    { t: stamp(w + 20), kind: 'accession', id: 'r-gone', field: '_deleted', value: true }
  ]);
  await page.goto('/plants/2026-0005'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await expect(page.locator('#ed-date-partial')).toHaveText('As imported: 2017-08. Pick a day only if you know it.');
  await page.goto('/plants/r-gone'); await ready(page);
  await expect(page.locator('#removed-plant')).toContainText("2026-0006 Haworthia retusa 'King' was removed.");
});

test('a plant whose missing fields are all parked shows the Parked notice with Apply, and Apply brings it back (clock 3)', async ({ page }) => {
  const thrown: string[] = [];
  page.on('pageerror', (e) => thrown.push(e.message));
  await page.goto('/plants'); await ready(page);
  const far = Date.now() + 365 * 86_400_000;
  const made = plant('r-fast', far, { acc: '2026-0007', taxonName: 'Copiapoa cinerea', status: 'growing' });
  // an edit placed past the creation's stamp (marked), made after the clock was put right
  const edit = { t: `${String(far).padStart(13, '0')}-800003-${W}`, kind: 'accession', id: 'r-fast', field: 'notes', value: 'repotted' };
  await inject(page, [...made, edit], made.map((c) => c.t));
  await page.goto('/plants/r-fast'); await ready(page);
  await expect(page.locator('#waiting-notice .word')).toHaveText('Parked');
  await expect(page.locator('main')).not.toContainText('newer version of the app');
  await page.getByRole('button', { name: /^Apply them now$/ }).click();
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#incomplete-notice')).toHaveCount(0);
  expect(thrown).toEqual([]); // StateNote's <details> inside a <p> threw "Illegal invocation" in every client render (see L's report)
});
