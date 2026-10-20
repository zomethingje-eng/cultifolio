/**
 * Round seventy-three, agent P, for K's `occurrences.keys` (a page's records also read from other GBIF keys of the same
 * plant, and two merged pages): the species page names each key with its Kew reading and source, lists a plant recorded
 * under another key or the merged page's old name among yours, and shows the notes and following kept under the old
 * name. The fixture's dossiers carry no keys, so the field is put into the page's data on a client-side visit, in the
 * shape K's schema gives it. On r73base none of it is drawn.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

const KEYS = [
  { key: 999001, name: 'Copiapoa veterana Backeb.', kew: 'a synonym Kew marks homotypic', n: 12, from: 'api', slug: 'copiapoa-veterana' },
  { key: 999002, name: 'Copiapoa cinerea Phil.', kew: 'the same name by the same author', n: 1, from: 'download' }
];

async function withKeys(page: Page, keys: unknown) {
  await page.route(/\/species\/copiapoa-cinerea\/__data\.json/, async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    const [first, ...rest] = body.split('\n');
    const j = JSON.parse(first) as { nodes: Array<{ type: string; data?: unknown[] }> };
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as { d?: { occurrences: Record<string, unknown> } };
      if (!d.d) continue;
      if (keys) d.d.occurrences.keys = keys;
      n.data = JSON.parse(devalue.stringify(d));
    }
    // Every line kept: data the server streams after the first line (a promise it had not yet settled) is the rest of the
    // answer, and a page given the first line alone waits for it; and the length and transfer headers described the old
    // body (round seventy-seven: in WebKit the visit sometimes never landed).
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !/^(content-length|transfer-encoding|content-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status(), headers, body: [JSON.stringify(j), ...rest].join('\n') });
  });
}
/** The species page by a client-side visit from its genus row, so its data comes through `__data.json`. */
async function open(page: Page) {
  await page.goto('/?by=genus&open=copiapoa'); await ready(page);
  // The collection open first (round seventy-nine): a device whose plants were written behind the page's back (`inject`)
  // has not yet set the front page's hint, so the page is drawn as a visitor's and redrawn as a grower's when the
  // collection opens, and the tile moves. In the owner's WebKit run that move came during the click on the tile: the
  // hover's preload asked for the page's data (the routed `__data.json`) and the click itself never landed, so the
  // address never changed.
  await page.locator('html[data-collection="open"]').waitFor({ state: 'attached' });
  await page.locator('a.tile', { hasText: 'Copiapoa cinerea' }).click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
}

test('r73p keys 1: each other key is named with its reading and source; plants and notes under the old name are the page\'s', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [
    ['accession', 'r-k', 'acc', '2026-0001'], ['accession', 'r-k', 'taxonName', 'Copiapoa veterana'], ['accession', 'r-k', 'taxonKey', 999001], ['accession', 'r-k', 'status', 'growing'],
    ['accession', 'r-s', 'acc', '2026-0002'], ['accession', 'r-s', 'taxonName', 'Copiapoa veterana'], ['accession', 'r-s', 'status', 'growing'],
    ['accession', 'r-o', 'acc', '2026-0003'], ['accession', 'r-o', 'taxonName', 'Copiapoa other'], ['accession', 'r-o', 'taxonKey', 999002], ['accession', 'r-o', 'status', 'growing'],
    ['taxon', 'copiapoa-veterana', 'name', 'Copiapoa veterana'], ['taxon', 'copiapoa-veterana', 'myNotes', 'Kept dry from October.'], ['taxon', 'copiapoa-veterana', 'followed', true]
  ], Date.now() - 3_600_000);
  await withKeys(page, KEYS);
  await open(page);
  const keys = page.locator('#other-keys');
  await expect(keys).toContainText("Records also from GBIF's key 999001 (Copiapoa veterana Backeb.): a synonym Kew marks homotypic; 12 records, from GBIF's search API on the day of the build.");
  await expect(keys).toContainText("Records also from GBIF's key 999002 (Copiapoa cinerea Phil.): the same name by the same author; 1 record, from GBIF's download.");
  await expect(keys.locator('a', { hasText: '999001' })).toHaveAttribute('href', 'https://www.gbif.org/species/999001');
  // Yours: by the other key (2026-0001, 2026-0003) and by the merged page's old address (2026-0002).
  for (const no of ['2026-0001', '2026-0002', '2026-0003']) await expect(page.locator('.vern.mine:not(.compared) a.accno', { hasText: no })).toBeVisible();
  const old = page.locator('#old-taxon-copiapoa-veterana');
  await expect(old).toContainText('Copiapoa veterana Backeb.');
  await expect(old).toContainText('Kept dry from October.');
  await expect(old).toContainText('You follow it under that name.');
});

test('r73p keys 2: a dossier without the field draws none of it (guard)', async ({ page }) => {
  await withKeys(page, null);
  await open(page);
  await expect(page.locator('#other-keys')).toHaveCount(0);
  await expect(page.locator('.oldtaxon')).toHaveCount(0);
});
