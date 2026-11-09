/**
 * Round eighty-seven (t1): identity and provenance on the plant's page (the plan's F1, F2, F3, F6).
 *
 * 1. No longer held: a plant given away is recorded with its reason, day and note; its page stays and says so first; it
 *    is listed under "No longer held"; Restore brings it back, and the log says each step.
 * 2. A death recorded through Died… is the plant's deaccession too, listed under "Died".
 * 3. Items: an offset split off a plant is item A of its accession, a plant of its own under 2026-0012/A, with the
 *    accession's provenance; the address with a bare "/" finds it; an edit of the collector on the item is the accession's.
 * 4. A field number read as code and number, with a BCSS lookup the page links and never asks; nothing goes to BCSS.
 * 5. Edit: ITF2's codes, refused where ITF2 or the provenance word forbids them; the collection, the identification,
 *    earlier holders and a clone shown; a rename keeps the earlier name and its day.
 * 6. On a phone, "No longer held" fits 320 px wide without a sideways scroll.
 *
 * FAILS on the base (r85m head): none of these fields, forms or pages exist.
 */
import { test, expect, type Page } from '@playwright/test';
import { injectChanges } from './helpers/inject';
import { ready, localDay } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const W = 'abcdefabcdef0000';
const stamp = (wall: number, count = 0) => `${String(wall).padStart(13, '0')}-${count.toString(16).padStart(4, '0')}-${W}`;
const plant = (id: string, wall: number, fields: Record<string, unknown>) => Object.entries(fields).map(([field, value], i) => ({ t: stamp(wall, i), kind: 'accession', id, field, value }));
async function seed(page: Page, plants: Array<[string, Record<string, unknown>]>, open: string) {
  await page.goto('/plants'); await ready(page);
  let wall = Date.now() - 3_600_000;
  await injectChanges(page, plants.flatMap(([id, f]) => plant(id, (wall += 1000), { status: 'growing', ...f })));
  await page.goto(open); await ready(page);
  // The collection opened, on a loaded machine slower than an assertion's default wait.
  await expect(page.locator('main')).not.toContainText('Opening your collection', { timeout: 30_000 });
}
const menu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /More for this plant/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('r87t1 1: a plant given away is kept, listed under No longer held, and restored @phone', async ({ page }) => {
  await seed(page, [['r-giv', { acc: '2026-0031', taxonName: 'Aloe vera' }]], '/plants/2026-0031');
  await expect(page.locator('#no-longer-held')).toHaveCount(0);
  await page.locator('#deacc-open').click();
  await page.locator('#deacc-reason').selectOption('given');
  await page.locator('#deacc-note').fill('to the society plant sale');
  await page.locator('#deacc-save').click();
  await expect(page.locator('.toast')).toContainText('2026-0031 is no longer held (given away); its record is kept.');
  await expect(page.locator('#no-longer-held')).toContainText(`No longer held since ${localDay(0)}: given away. to the society plant sale`);
  await expect(page.locator('.tl')).toContainText('No longer held: given away; to the society plant sale');
  await expect(page.locator('h1.sci')).toContainText('Aloe vera'); // the page stays
  await page.goto('/plants/gone'); await ready(page);
  await expect(page.locator('#gone-given')).toHaveText('Given away');
  const row = page.locator('.gonelist tr', { hasText: '2026-0031' });
  await expect(row).toContainText('to the society plant sale');
  await expect(row).toContainText(localDay(0));
  await row.getByRole('link', { name: '2026-0031' }).click();
  await expect(page).toHaveURL(/\/plants\/2026-0031$/);
  await page.locator('#restore-held').click();
  await expect(page.locator('#no-longer-held')).toHaveCount(0);
  await expect(page.locator('.tl')).toContainText(`Held again (it was recorded as given away on ${localDay(0)})`);
  await page.goto('/plants/gone'); await ready(page);
  await expect(page.locator('#gone-empty')).toBeVisible();
});

test('r87t1 2: a death recorded through Died… is listed under No longer held, died', async ({ page }) => {
  await seed(page, [['r-die', { acc: '2026-0032', taxonName: 'Conophytum minimum' }]], '/plants/2026-0032');
  await menu(page, 'Died…');
  await page.locator('#ev-cause').fill('rot');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('#no-longer-held')).toContainText(`No longer held since ${localDay(0)}: died.`);
  await page.goto('/plants/gone'); await ready(page);
  await expect(page.locator('#gone-died')).toHaveText('Died');
  await expect(page.locator('.gonelist')).toContainText('2026-0032');
});

test('r87t1 3: an offset split off is item A of its accession, with its provenance, a plant of its own', async ({ page }) => {
  await seed(page, [['r-acc', { acc: '2026-0012', taxonName: 'Lithops lesliei', provenance: 'f1', fieldNumber: 'SB 829', collector: 'Brack, S.' }]], '/plants/2026-0012');
  await menu(page, 'Split off an item…');
  await page.locator('#split-how').selectOption('offset');
  await page.locator('#split-save').click();
  await expect(page.locator('.toast')).toContainText('2026-0012/A split off');
  await expect(page.locator('.tl')).toContainText('Item 2026-0012/A split off (offset)');
  await expect(page.locator('#accession-plants')).toContainText('2026-0012 (this one), 2026-0012/A');
  await page.locator('#accession-plants a', { hasText: '2026-0012/A' }).click();
  await expect(page).toHaveURL(/\/plants\/2026-0012%2FA$/);
  await expect(page.locator('#item-of')).toHaveText('item A of 2026-0012');
  await expect(page.locator('#field-number')).toContainText('SB 829');
  await expect(page.locator('#collection')).toContainText('by Brack, S.');
  await expect(page.locator('.tl')).toContainText('Split off 2026-0012 as item A of 2026-0012 (offset)');
  // The number with a bare "/", as an older version links it, finds the item.
  await page.goto('/plants/2026-0012/A'); await ready(page);
  await expect(page).toHaveURL(/\/plants\/2026-0012%2FA$/);
  await expect(page.locator('#item-of')).toBeVisible();
  // The collector is the accession's: changed on the item, it is changed on the plant holding the number.
  await menu(page, 'Edit');
  await expect(page.locator('#ed-shared')).toContainText('saved on its 2 plants');
  await page.locator('#ed-collector').fill('Brack, S., Lavranos, J.');
  await page.locator('.editform button[type=submit]').click();
  await expect(page.locator('#collection')).toContainText('by Brack, S., Lavranos, J.');
  await page.goto('/plants/2026-0012'); await ready(page);
  await expect(page.locator('#collection')).toContainText('by Brack, S., Lavranos, J.');
  // A second offset takes the next letter.
  await menu(page, 'Split off an item…');
  await page.locator('#split-save').click();
  await expect(page.locator('#accession-plants')).toContainText('2026-0012/A, 2026-0012/B');
});

test('r87t1 4: a field number read as code and number, with a lookup the grower presses and the page never asks', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (/bcss/i.test(r.url())) asked.push(r.url()); });
  await seed(page, [['r-fn', { acc: '2026-0033', taxonName: 'Lithops karasmontana', fieldNumber: 'KK1398' }]], '/plants/2026-0033');
  await expect(page.locator('#field-number')).toContainText("KK1398 · collector's code KK, number 1398");
  const link = page.locator('#bcss-lookup');
  await expect(link).toHaveText('Look up at BCSS Field Number Database');
  await expect(link).toHaveAttribute('href', 'https://fieldnos.bcss.org.uk/fieldno.php?FieldNo=KK1398');
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  await expect(link).toHaveAttribute('target', '_blank');
  expect(asked).toEqual([]);
});

test('r87t1 5: ITF2 codes, the collection and the identification on Edit; a rename keeps the earlier name', async ({ page }) => {
  await seed(page, [['r-ed', { acc: '2026-0034', taxonName: 'Mammillaria cf. bombycina', provenance: 'wild' }]], '/plants/2026-0034');
  await expect(page.locator('#itf2-provenance')).toContainText('W: of wild source (read from the provenance)');
  await expect(page.locator('#id-qualifier')).toContainText('cf.: compare with (ITF2 cf.)');
  await menu(page, 'Edit');
  await page.locator('#ed-prot').selectOption('G');
  await page.locator('.editform button[type=submit]').click();
  await expect(page.locator('#ed-ident-bad')).toContainText('G: not of wild source does not go with the provenance "wild-collected"');
  await page.locator('#ed-prot').selectOption('W');
  await page.locator('#ed-prohis').selectOption('I');
  await page.locator('#ed-collected').fill('198511');
  await page.locator('#ed-ex').fill('ex Devon, ex Mesa Garden');
  await page.locator('#ed-clone').fill('clone A');
  await page.locator('#ed-vlev').selectOption('2');
  await page.locator('#ed-idby').fill('Hunt, D.');
  await page.locator('#ed-idon').fill('2019-03');
  await page.locator('.editform button[type=submit]').click();
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.locator('#itf2-provenance')).toHaveText('ITF2W: of wild source; I: an individual wild plant');
  await expect(page.locator('#collection')).toContainText('collector not stated, 1985-11');
  await expect(page.locator('#ex-chain')).toContainText('ex Devon, ex Mesa Garden');
  await expect(page.locator('#clone-name')).toHaveText('clone clone A');
  await expect(page.locator('#identification')).toContainText('level 2: by a competent person with a library or herbarium, by Hunt, D., 2019-03');
  // A rename: the name it had is kept with the day.
  await menu(page, 'Edit');
  await page.locator('#ed-name').fill('Mammillaria bombycina');
  await page.locator('.editform button[type=submit]').click();
  await page.locator('.editform button[type=submit]').click(); // the name check's second press keeps the name as typed
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.locator('#earlier-names')).toContainText(`Mammillaria cf. bombycina, until ${localDay(0)} (identified by Hunt, D., 2019-03)`);
});

test('r87t1 6: No longer held fits a 320 px phone @phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page, [['r-p1', { acc: '2026-0035', taxonName: 'Haworthia truncata', status: 'archived', deacc: 'lost', deaccOn: '2026-06', deaccNote: 'a long note about the shelf it was last seen on, by the window' }]], '/plants/gone');
  await expect(page.locator('#gone-lost')).toHaveText('Lost');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
