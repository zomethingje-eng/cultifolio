/**
 * Round 120 (MYPLANTS 28, docs/REVIEW-ROUND-120.md): Today, space by space, in the hand-off's own cases.
 *
 * - The spaces follow the walking order, those with something to look at first; the rest follow, with their pill.
 * - A plant past its rhythm opens ticked; one listed only for a look (missed at an audit) opens unticked.
 * - Done with a mix records one watering and one "left dry", and Undo takes both back.
 * - Left dry on a 14-day rhythm, a plant is listed again after 7 days; on a 4-day rhythm, after 3.
 * - "Since watered" is unchanged by a "left dry".
 * - Waterings 10 days apart, four of them: "You have watered it about every 10 days." With two gaps, no line.
 * - Finishing a space opens the next; finishing the last shows the caught-up line.
 *
 * On 19ec7a8: FAILED, every test (stops of chips with "Water N here", no Done, no "left dry").
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const ago = (n: number) => { const d = new Date(Date.now() - n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plant = (id: string, no: string, loc: string, more: Record<string, unknown> = {}): Row[] =>
  Object.entries({ acc: no, taxonName: 'Refusia testii', status: 'growing', nameKind: 'species', locationId: loc, ...more }).map(([f, v]) => ['accession', id, f, v] as Row);
let ev = 0;
const event = (acc: string, d: string, t: string, note?: string): Row[] => { const id = `ev${++ev}r120`; return [['event', id, 'acc', acc], ['event', id, 'd', d], ['event', id, 't', t], ...(note ? [['event', id, 'note', note] as Row] : [])]; };
const space = (id: string, name: string, sort: number): Row[] => [['location', id, 'name', name], ['location', id, 'type', 'bench'], ['location', id, 'sort', sort]];

async function open(page: Page, rows: Row[], writer: string) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, rows, Date.now() - 60 * DAY, writer);
  await page.goto('/today'); await ready(page);
}

test('r120b 1: spaces in walking order, those to look at first; the rest follow with their pill @phone', async ({ page }) => {
  await open(page, [
    ...space('s1', 'Bench 1', 1), ...space('s2', 'Bench 2', 2), ...space('s3', 'Cold frame', 3),
    ...plant('p1', '2026-0001', 's1', { waterDays: 14 }), ...event('p1', ago(2), 'water'),
    ...plant('p2', '2026-0002', 's2', { waterDays: 14 }), ...event('p2', ago(20), 'water'),
    ...plant('p3', '2026-0003', 's3', { waterDays: 14 }), ...event('p3', ago(30), 'water')
  ], 'r120bbbbbbbbb001');
  const names = page.locator('#water .stop .sname');
  await expect(names).toHaveText(['Bench 2', 'Cold frame', 'Bench 1']);
  await expect(page.locator('#today-count')).toContainText('2 spaces to look at');
  await expect(page.locator('#stop-s2 .spacestate')).toHaveText('1 to look at');
  await expect(page.locator('#stop-s1 .spacestate')).toHaveText(/^next due /);
  await expect(page.locator('#stop-s2 .spacehead')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#stop-s3 .spacehead')).toHaveAttribute('aria-expanded', 'false');
});

test('r120b 2: past its rhythm opens ticked, missed at an audit unticked; Done records both, Undo takes both back; the next space opens @phone', async ({ page }) => {
  await open(page, [
    ...space('s1', 'Bench 1', 1), ...space('s2', 'Bench 2', 2),
    ...plant('p1', '2026-0001', 's1', { waterDays: 14 }), ...event('p1', ago(20), 'water'),
    ...plant('p2', '2026-0002', 's1', { waterDays: 14 }), ...event('p2', ago(3), 'water'), ...event('p2', ago(1), 'audit', 'not seen'),
    ...plant('p3', '2026-0003', 's2', { waterDays: 14 }), ...event('p3', ago(30), 'water')
  ], 'r120bbbbbbbbb002');
  const b1 = page.locator('#stop-s1');
  await expect(b1.locator('#w-p1')).toBeChecked();
  await expect(b1.locator('#w-p2')).not.toBeChecked();
  const done = b1.getByRole('button', { name: /^Done · / });
  await expect(done).toHaveText('Done · 1 watered, 1 left dry');
  // keyboard alone: the box, then Done
  await b1.locator('#w-p2').focus(); await page.keyboard.press('Space');
  await expect(done).toHaveText('Done · 2 watered');
  await page.keyboard.press('Space');
  await done.focus(); await page.keyboard.press('Enter');
  await expect(b1.locator('.row.done')).toContainText('Done · 1 watered, 1 left dry');
  await expect(page.locator('#stop-s2 .spacehead')).toHaveAttribute('aria-expanded', 'true');
  // the space's Undo, then the plant's log (a full load would drop the Done line, which lives for the app's visit)
  await page.locator('#stop-s1 .row.done').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#stop-s1 .row.done')).toHaveCount(0);
  await expect(page.locator('#stop-s1 .spacestate')).toHaveText('2 to look at');
  await page.goto('/plants/2026-0002'); await ready(page);
  await expect(page.locator('.tl')).not.toContainText('Looked at, left dry');
  // finishing the last space shows the caught-up line
  await page.goto('/today'); await ready(page);
  for (const id of ['s1', 's2']) {
    const s = page.locator(`#stop-${id}`);
    if (await s.locator('.spacehead[aria-expanded="false"]').count()) await s.locator('.spacehead').click();
    await s.getByRole('button', { name: /^Done · / }).click();
    await expect(s.locator('.row.done')).toBeVisible();
  }
  await expect(page.locator('#nothing')).toContainText('All caught up.');
  await page.goto('/plants/2026-0002'); await ready(page);
  await expect(page.locator('.tl')).toContainText('Looked at, left dry'); // the unticked plant's line
});

test('r120b 3: left dry holds half the rhythm, at least three days, and leaves "since watered" alone', async ({ page }) => {
  await open(page, [
    ...space('s1', 'Bench 1', 1),
    ...plant('a6', '2026-0001', 's1', { waterDays: 14 }), ...event('a6', ago(20), 'water'), ...event('a6', ago(6), 'dry'),
    ...plant('a7', '2026-0002', 's1', { waterDays: 14 }), ...event('a7', ago(20), 'water'), ...event('a7', ago(7), 'dry'),
    ...plant('b2', '2026-0003', 's1', { waterDays: 4 }), ...event('b2', ago(10), 'water'), ...event('b2', ago(2), 'dry'),
    ...plant('b3', '2026-0004', 's1', { waterDays: 4 }), ...event('b3', ago(10), 'water'), ...event('b3', ago(3), 'dry')
  ], 'r120bbbbbbbbb003');
  const s = page.locator('#stop-s1');
  await expect(s.locator('.look')).toHaveCount(2);
  await expect(s.locator('#w-a7')).toBeVisible();
  await expect(s.locator('#w-b3')).toBeVisible();
  await page.goto('/plants/2026-0001'); await ready(page);
  await expect(page.locator('.cards .card', { hasText: 'Since watered' }).locator('.val')).toHaveText(/^20/);
});

test('r120b 4: a row opens its reason, with "about every 10 days" only from three gaps', async ({ page }) => {
  await open(page, [
    ...space('s1', 'Bench 1', 1),
    ...plant('g4', '2026-0001', 's1', { waterDays: 14 }), ...event('g4', ago(50), 'water'), ...event('g4', ago(40), 'water'), ...event('g4', ago(30), 'water'), ...event('g4', ago(20), 'water'),
    ...plant('g2', '2026-0002', 's1', { waterDays: 14 }), ...event('g2', ago(40), 'water'), ...event('g2', ago(30), 'water'), ...event('g2', ago(20), 'water')
  ], 'r120bbbbbbbbb004');
  const s = page.locator('#stop-s1');
  await s.locator('.look', { hasText: '2026-0001' }).locator('.lookrow').click();
  await expect(s.locator('#why-g4')).toContainText('You have watered it about every 10 days.');
  await s.locator('.look', { hasText: '2026-0002' }).locator('.lookrow').click();
  await expect(s.locator('#why-g2')).not.toContainText('about every');
});
