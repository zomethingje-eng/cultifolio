/**
 * Round eighty-seven, stage 3 (t2): lineage, batches, flowering and the photo walk in the browser.
 *
 * 1. A cross recorded on the seed parent (Record…, Pollinated, with its pollen parent), sown from its plant's page, the
 *    batch counted and potted up: the plant raised keeps its species name and says the cross beside it, both parents
 *    linked, seed parent first; the parents list it among their offspring; a parent removed is still named and linked.
 * 2. An offset added from its mother's page ("Add an offset or cutting"): the link both ways; a graft line's plants.
 * 3. A batch's checkpoints and its losses by cause, as tables; stacked on a phone with no sideways scroll.
 * 4. Today's "Flowered this week in past years", and the flowering calendar; the calendar stacked on a phone.
 * 5. The photo walk: a photograph, a name, next; each a plant with its photograph, in the space chosen; nothing sent
 *    anywhere but this site, and no photograph sent at all; the camera input on a phone.
 *
 * Fails on the base (r87s2 head): none of these exist there.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready, localDay, more } from './helpers/smoke';
import { allowWrites } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

const Y = localDay(0).slice(0, 4);
const plant = (id: string, no: string, name: string, more: Record<string, unknown> = {}): Row[] => Object.entries({ acc: no, taxonName: name, status: 'growing', nameKind: 'species', ...more }).map(([f, v]) => ['accession', id, f, v] as Row);
const line = (id: string, acc: string, d: string, t: string, more: Record<string, unknown> = {}): Row[] => Object.entries({ acc, d, t, ...more }).map(([f, v]) => ['event', id, f, v] as Row);
async function seed(page: Page, rows: Row[], writer = 'r87t2aaaaaaaaaa0') {
  await page.goto('/plants'); await ready(page);
  await inject(page, rows, Date.now() - 86_400_000, writer);
}
/** No sideways scroll at this width. */
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('a cross recorded, sown and potted up: the plant keeps its species name, the cross beside it, both parents linked both ways', async ({ page }) => {
  allowWrites(60_000);
  await seed(page, [...plant('rA', `${Y}-0101`, 'Ariocarpus retusus'), ...plant('rB', `${Y}-0102`, 'Ariocarpus trigonus')]);
  await page.goto(`/plants/${Y}-0101`); await ready(page);
  await page.getByRole('button', { name: 'Record…' }).click();
  await page.locator('#ev-type').selectOption('pollinate');
  await page.locator('#ev-date').fill(localDay(-30));
  await page.locator('#ev-pollen').selectOption({ label: `${Y}-0102 · Ariocarpus trigonus` });
  await page.locator('.evform').getByRole('button', { name: 'Record', exact: true }).click();
  // The line says the pollen parent; the lineage lists the cross with a way to sow it.
  await expect(page.locator('.tlrow', { hasText: 'Pollinated' })).toContainText(`× ${Y}-0102 (pollen parent)`);
  const cross = page.locator('#crosses + .crosses li');
  await expect(cross).toContainText(`this plant × ${Y}-0102`);
  await expect(cross).toContainText('not sown yet');
  await cross.getByRole('link', { name: 'Sow seed from this cross' }).click();
  await expect(page).toHaveURL(/\/propagation\/new\?cross=/);
  await ready(page);
  // The batch is filed under the seed parent's species name; the cross is said beside it.
  await expect(page.locator('#s-cross-help')).toContainText(`Seed parent ${Y}-0101`);
  await expect(page.locator('#species-name')).toHaveValue('Ariocarpus retusus');
  await expect(page.locator('#s-from')).toHaveValue(`own cross ${Y}-0101 × ${Y}-0102, ${localDay(-30)}`);
  await page.locator('#s-count').fill('20');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await expect(page.locator('#batch-cross')).toContainText(`seed from the cross ${Y}-0101 × ${Y}-0102, ${localDay(-30)}`);
  await expect(page.locator('h1.sci')).toContainText('Ariocarpus retusus');
  // Counted, then split into plants: one potted up.
  await page.locator('#g-n').fill('6');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('#checkpoints + table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.locator('#p-n').fill('1');
  await page.locator('form.fields').getByRole('button', { name: /^Pot up/ }).click();
  const raised = page.locator('.potnotice a.mono').first();
  await expect(raised).toBeVisible();
  await raised.click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await ready(page);
  // The species name stays the reference's; the cross is beside it.
  await expect(page.locator('h1.sci')).toContainText('Ariocarpus retusus');
  await expect(page.locator('h1.sci')).not.toContainText('×');
  await expect(page.locator('#cross-of')).toHaveText(`cross ${Y}-0101 × ${Y}-0102`);
  const lin = page.locator('#lineage + table');
  await expect(lin.locator('tr.par')).toHaveCount(2);
  await expect(lin.locator('tr.par').nth(0)).toContainText(`Seed parent${Y}-0101 Ariocarpus retusus`);
  await expect(lin.locator('tr.par').nth(1)).toContainText(`Pollen parent${Y}-0102 Ariocarpus trigonus`);
  const child = page.url().split('/').pop()!;
  // Both parents list it among their offspring.
  for (const no of [`${Y}-0101`, `${Y}-0102`]) {
    await page.goto(`/plants/${no}`); await ready(page);
    await expect(page.locator('#lineage + table tr.kid')).toContainText(child);
  }
  await expect(page.locator('#lineage + table tr.kid')).toContainText('from a cross, as pollen parent');
  // The pollen parent removed: the child still names it, marked, and links its page, which offers it back.
  await inject(page, [['accession', 'rB', '_deleted', true]], Date.now(), 'r87t2bbbbbbbbbb0');
  await page.goto(`/plants/${child}`); await ready(page);
  const pollen = page.locator('#lineage + table tr.par').nth(1);
  await expect(pollen).toContainText('(removed)');
  await pollen.locator('a.pref').click();
  await expect(page.locator('#removed-plant')).toBeVisible();
});

test('an offset added from its mother\'s page, and a graft line\'s plants: the links both ways @phone', async ({ page }) => {
  allowWrites(60_000);
  await seed(page, [...plant('rM', `${Y}-0201`, 'Haworthia truncata'), ...plant('rS', `${Y}-0202`, 'Pereskiopsis spathulata'), ...plant('rG', `${Y}-0203`, 'Ariocarpus agavoides'), ...line('eG', 'rG', localDay(-5), 'graft', { scion: 'rM', stock: 'rS' })]);
  await page.goto(`/plants/${Y}-0201`); await ready(page);
  await more(page, 'Add an offset or cutting');
  await expect(page).toHaveURL(/\/plants\/new\?mother=rM/);
  await ready(page);
  await expect(page.locator('#f-mother')).toHaveValue('rM');
  await expect(page.locator('#species-name')).toHaveValue('Haworthia truncata');
  await page.locator('#f-mother-how').selectOption('division');
  await page.getByRole('button', { name: /^Add/ }).first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await ready(page);
  await expect(page.locator('#lineage + table tr.par')).toContainText(`Taken from${Y}-0201 Haworthia truncata`);
  await expect(page.locator('#lineage + table tr.par')).toContainText('a division');
  const off = page.url().split('/').pop()!;
  await page.goto(`/plants/${Y}-0201`); await ready(page);
  const kids = page.locator('#lineage + table tr.kid');
  await expect(kids).toHaveCount(2);
  await expect(kids.filter({ hasText: off })).toContainText('a division of this plant');
  await expect(kids.filter({ hasText: `${Y}-0203` })).toContainText('grafted, its scion from this plant');
  expect(await noSideways(page)).toBe(true);
  await page.goto(`/plants/${Y}-0203`); await ready(page);
  await expect(page.locator('#lineage + table tr.par')).toHaveCount(2);
  await expect(page.locator('.tlrow', { hasText: 'Grafted' })).toContainText(`scion from ${Y}-0201`);
  await expect(page.locator('.tlrow', { hasText: 'Grafted' })).toContainText(`on stock ${Y}-0202`);
});

test('a batch\'s checkpoints and its losses by cause, as tables; stacked on a phone @phone', async ({ page }) => {
  const s = (f: string, v: unknown): Row => ['sowing', 'sB', f, v];
  await seed(page, [
    s('no', `S${Y}-031`), s('taxonName', 'Lithops lesliei'), s('method', 'seed'), s('sown', localDay(-60)), s('count', 20), s('status', 'active'),
    ...line('g1', 'sB', localDay(-50), 'germinate', { n: 4 }), ...line('g2', 'sB', localDay(-40), 'germinate', { n: 12 }),
    ...line('l1', 'sB', localDay(-35), 'loss', { n: 2, cause: 'Damping-off' }), ...line('l2', 'sB', localDay(-34), 'loss', { n: 1, cause: 'damping-off' }), ...line('l3', 'sB', localDay(-33), 'loss', { n: 1 }),
    ...line('g3', 'sB', localDay(-20), 'germinate', { n: 14 })
  ]);
  await page.goto(`/propagation/S${Y}-031`); await ready(page);
  const rows = page.locator('#checkpoints + table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('14');
  await expect(rows.nth(2).locator('td').nth(2)).toHaveText('70%');
  await expect(rows.nth(2).locator('td').last()).toHaveText('10'); // 14 up, 4 lost, none potted
  const causes = page.locator('#losses + table tbody tr');
  await expect(causes).toHaveCount(2);
  await expect(causes.nth(0)).toContainText('Damping-off');
  await expect(causes.nth(0).locator('td').first()).toHaveText('3');
  await expect(causes.nth(1)).toContainText('not stated');
  // The loss form offers the usual causes.
  await expect(page.locator('#l-cause')).toHaveAttribute('list', 'l-causes');
  expect(await noSideways(page)).toBe(true);
});

test('flowered this week in past years on Today, and the flowering calendar @phone', async ({ page }) => {
  const lastYear = `${Number(Y) - 1}${localDay(-1).slice(4)}`;
  const twoBack = `${Number(Y) - 2}${localDay(2).slice(4)}`;
  await seed(page, [
    ...plant('rF', `${Y}-0301`, 'Gethyllis villosa'), ...line('f1', 'rF', lastYear, 'flower'), ...line('f2', 'rF', twoBack, 'flower'),
    ...plant('rN', `${Y}-0302`, 'Boophone disticha'), ...line('f3', 'rN', `${Number(Y) - 1}-01-15`, 'flower'),
    ...plant('rP', `${Y}-0303`, 'Haemanthus coccineus'), ...line('f4', 'rP', localDay(0), 'flower') // this year's: on its own page, not here
  ]);
  await page.goto('/today'); await ready(page);
  const fb = page.locator('#flowered-before');
  await expect(fb).toBeVisible({ timeout: 15_000 });
  await expect(fb.locator('li')).toHaveCount(1);
  await expect(fb.locator('li')).toContainText(`${Y}-0301`);
  await expect(fb.locator('li')).toContainText(`${lastYear}, ${twoBack}`);
  await fb.getByRole('link', { name: 'The flowering calendar' }).click();
  await expect(page).toHaveURL(/\/plants\/flowering$/);
  await ready(page);
  const rows = page.locator('#flowering-calendar tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(`${Y}-0302`); // January first
  const m = Number(lastYear.slice(5, 7));
  const gethyllis = rows.filter({ hasText: `${Y}-0301` });
  if (Number(twoBack.slice(5, 7)) === m) await expect(gethyllis.locator('td').nth(m - 1)).toContainText('2');
  expect(await noSideways(page)).toBe(true);
});

test('the photo walk: a photograph, a name, next; a plant each with its photograph, nothing sent to identify it @phone', async ({ page }) => {
  allowWrites(60_000);
  const offsite: string[] = [];
  const sent: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) offsite.push(r.url());
    const body = r.postDataBuffer();
    if (body && body.length > 2000) sent.push(`${r.method()} ${u.pathname} ${body.length}`);
  });
  await page.goto('/plants'); await ready(page);
  await inject(page, [['location', 'win', 'name', 'Kitchen window']], Date.now() - 1000, 'r87t2cccccccccc0');
  await page.goto('/plants/walk'); await ready(page);
  await expect(page.locator('#walk-how')).toContainText('Nothing identifies the plant from it');
  // On a phone the camera opens directly.
  await expect(page.locator('#walk-camera')).toHaveAttribute('capture', 'environment');
  const img = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d')!; g.fillStyle = '#2a6'; g.fillRect(0, 0, 320, 240); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }), 'base64');
  await page.locator('#walk-loc').selectOption({ label: 'Kitchen window' });
  for (const name of ['Copiapoa cinerea', 'Lithops lesliei']) {
    await page.locator('#walk-camera').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: img });
    await expect(page.locator('img.pv')).toBeVisible();
    await page.locator('#walk-name').fill(name);
    await page.locator('#walk-name').blur();
    const add = page.locator('#walk-add');
    await add.click();
    // A name the reference does not answer for here is asked about once, as the add form asks; the second press keeps it.
    const done = page.locator('#walk-added li', { hasText: name });
    await Promise.race([done.waitFor(), page.locator('#walk-add', { hasText: 'as typed' }).waitFor()]);
    if (!(await done.isVisible())) await add.click();
    await expect(page.locator('#walk-last')).toContainText('added with its photograph. Next plant.');
    await expect(page.locator('#walk-added li', { hasText: name })).toBeVisible();
    await expect(page.locator('img.pv')).toHaveCount(0);
  }
  const added = page.locator('#walk-added li');
  await expect(added).toHaveCount(2);
  await expect(added.first()).toContainText('with its photograph');
  await added.first().getByRole('link').click();
  await ready(page);
  await expect(page.locator('.idcard .place, .vern .place')).toContainText('Kitchen window');
  await expect(page.locator('#photos ~ .phgrid .ph')).toHaveCount(1);
  expect(offsite).toEqual([]);
  expect(sent).toEqual([]);
});
