/**
 * Round 127 (SPECIES 20, the lens's views that read the reader's spaces; docs/REVIEW-ROUND-127.md), on Copiapoa
 * cinerea's page in the test corpus (its figures read from the page's own JSON; the hand-off's Welwitschia figures are
 * checked exactly in r127a):
 *
 * - With a plant of the species in a greenhouse held at 5 °C, the panel opens on Greenhouse: its lines name the held
 *   temperature against the cold floor and the coolest nights, with "Light under glass is not estimated.", and nothing is
 *   asked of the site.
 * - With no plant, the view used last opens; Windowsill reads a space's light and its winter night; Under lights draws
 *   the table and marks the lamp's cell. A view whose space lacks its input names the input and links to where it is set.
 * - A space's light typed in lux is saved as µmol/m²/s (× 0.0185).
 *
 * On 1486d7c: FAILED, every test (the row held Nothing and Outdoors only).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const SLUG = '/species/copiapoa-cinerea';
type Hab = { tmax: number; tmin: number; dli: number };
/** The page's habitat months, from its own JSON link, and the figures the lines are made of. */
async function habitat(page: Page) {
  const panel = page.locator('#year-panel');
  await panel.getByRole('button', { name: 'Table', exact: true }).click(); // the panel's JSON link is beside its table
  const href = await panel.locator('a[href^="/api/dossier/"]').getAttribute('href');
  await panel.getByRole('button', { name: 'Chart', exact: true }).click();
  const j = await (await page.request.get(href!)).json();
  const m = j.climate.months as Hab[];
  const dli = m.map((x) => x.dli);
  return { floor: j.climate.extremes?.minP01 as number, cool: Math.min(...m.map((x) => x.tmin)), dark: Math.min(...dli), bright: Math.max(...dli) };
}
const c1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const FORBIDDEN = /\b(will|should|needs?|wants?|tolerates?|survive|die|safe)\b/i;
const space = (id: string, f: Record<string, unknown>): Row[] => Object.entries(f).map(([k, v]) => ['location', id, k, v] as Row);

async function seed(page: Page, rows: Row[]) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, rows, Date.now() - 5 * DAY, 'r127bbbbbbbbb001');
}
function watchSite(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/site-climate')) asked.push(r.url()); });
  return asked;
}

test('r127b 1: a plant in a greenhouse held at 5 °C opens Greenhouse; two figures a line, nothing asked @phone', async ({ page }) => {
  await seed(page, [
    ...space('gh', { name: 'Glasshouse', type: 'greenhouse', floorC: 5, floorHeld: true }),
    ...Object.entries({ acc: '2026-0001', taxonName: 'Copiapoa cinerea', status: 'growing', nameKind: 'species', locationId: 'gh' }).map(([f, v]) => ['accession', 'p1', f, v] as Row)
  ]);
  const asked = watchSite(page);
  await page.goto(SLUG); await ready(page);
  await expect(page.locator('#lens-row').getByRole('button', { name: 'Greenhouse' })).toHaveAttribute('aria-pressed', 'true');
  const h = await habitat(page);
  const vs = (its: number) => { const d = Math.round((5 - its) * 10) / 10; return d === 0 ? 'at' : `${c1(Math.abs(d))} °C ${d < 0 ? 'under' : 'over'}`; };
  await expect(page.locator('#lens-floor')).toContainText(`${vs(h.floor)} its cold floor (${c1(h.floor)} °C).`);
  await expect(page.locator('#lens-nights')).toContainText(`${vs(h.cool)} its coolest month's average night (${c1(h.cool)} °C).`);
  await expect(page.locator('#lens-card')).toContainText('Light under glass is not estimated.');
  await expect(page.locator('#lens-card')).toContainText('It compares. It does not say what the plant will do.');
  for (const t of await page.locator('#lens-card p[id^=lens-]').allTextContents()) expect(t).not.toMatch(FORBIDDEN);
  expect(asked).toEqual([]);
});

test('r127b 2: with no plant the view used last opens; Windowsill and Under lights read the space, or ask for its input', async ({ page }) => {
  await seed(page, [
    ...space('ws', { name: 'Kitchen sill', type: 'windowsill', ppfd: 296, lightHours: 8, floorC: 15 }),
    ...space('sh', { name: 'Shelf 1', type: 'shelf', ppfd: 300, lightHours: 14 }),
    ...space('rm', { name: 'Spare room', type: 'room' })
  ]);
  const asked = watchSite(page);
  await page.goto(SLUG); await ready(page);
  const row = page.locator('#lens-row');
  await expect(row.getByRole('button', { name: 'Nothing' })).toHaveAttribute('aria-pressed', 'true'); // neither: Nothing
  await row.getByRole('button', { name: 'Windowsill' }).click();
  await page.locator('#lens-space').selectOption({ label: 'Kitchen sill' });
  const h = await habitat(page);
  const mol = (296 * 8 * 3600) / 1e6;
  await expect(page.locator('#lens-light')).toContainText(`8.5 mol a day: ${Math.round((mol / h.dark) * 100)}% of its darkest month (${c1(h.dark)}) and ${Math.round((mol / h.bright) * 100)}% of its brightest (${c1(h.bright)})`);
  const dn = Math.round((15 - h.cool) * 10) / 10;
  await expect(page.locator('#lens-nights')).toContainText(dn === 0 ? 'the same as' : `${c1(Math.abs(dn))} °C ${dn > 0 ? 'warmer' : 'cooler'} than`);
  await page.locator('#lens-space').selectOption({ label: 'Spare room' });
  await expect(page.locator('#lens-ask')).toContainText('Set the light at Spare room and its hours');
  await expect(page.locator('#lens-ask a')).toHaveAttribute('href', '/places/rm');
  await expect(page.locator('#lens-light')).toHaveCount(0);
  await page.reload(); await ready(page);
  await expect(row.getByRole('button', { name: 'Windowsill' })).toHaveAttribute('aria-pressed', 'true'); // the view used last
  await row.getByRole('button', { name: 'Under lights' }).click();
  const table = page.locator('#lamp-table');
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText(String(Math.round((h.dark * 0.25 * 1e6) / (12 * 3600))));
  await expect(table.locator('tbody tr').nth(4)).toContainText("The year's mean");
  await expect(page.locator('#lens-lamp')).toContainText(`15.1 mol a day: ${Math.round((15.12 / h.dark) * 100)}% of its darkest month (${c1(h.dark)})`);
  expect(asked).toEqual([]);
});

test('r127b 3: a light reading typed in lux is saved as µmol/m²/s', async ({ page }) => {
  await seed(page, space('ws', { name: 'Kitchen sill', type: 'windowsill', lightHours: 8 }));
  await page.goto('/places/ws'); await ready(page);
  await page.locator('#space-menu-btn').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#e-ppfd-unit').selectOption('lux');
  await page.fill('#e-ppfd', '16000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-ppfd')).toHaveCount(0, { timeout: 15_000 }); // the form closes once the save is written (WebKit, once, left the page before it)
  await page.goto(SLUG); await ready(page);
  await page.locator('#lens-row').getByRole('button', { name: 'Windowsill' }).click();
  await expect(page.locator('#lens-light')).toContainText('296 µmol/m²/s for 8 h is 8.5 mol a day');
});
