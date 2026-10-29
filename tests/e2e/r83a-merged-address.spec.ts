/**
 * Round eighty-three, second part (A): the kept page of a merge, reached by the merged page's old address, says under its
 * name that the name is merged into it and is also an older name of another species by another author, with a link
 * (`/species/echeveria-peacockii` now moves to Echeveria desmetiana; Kew's file also files Echeveria peacockii Croucher ex
 * T.Moore & Mast. under Dudleya pulverulenta). The move itself is the server's (tests/unit/r83a-merged-address.test.ts, on
 * the live corpus's entries and records); the fixture's corpus holds neither page, so the line's data is put into the
 * page's data on a client-side visit, in the shape the server gives it (`wasMerged`, `wasShared` with `authors`).
 *
 * Written for WebKit and Firefox as well as Chromium: the service worker blocked (the route must see the data request),
 * every wait on what the page shows.
 *
 * FAILS on r83b: 1 (the line said "… so it names no one species here").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

const DUDLEYA = { slug: 'dudleya-pulverulenta', name: 'Dudleya pulverulenta' };
/** The page's data with the old-name line's fields as given. */
async function withWas(page: Page, was: Record<string, unknown>) {
  await page.route(/\/species\/copiapoa-cinerea\/__data\.json/, async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    const [first, ...rest] = body.split('\n');
    const j = JSON.parse(first) as { nodes: Array<{ type: string; data?: unknown[] }> };
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown>;
      if (!d.d) continue;
      Object.assign(d, was);
      n.data = JSON.parse(devalue.stringify(d));
    }
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !/^(content-length|transfer-encoding|content-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status(), headers, body: [JSON.stringify(j), ...rest].join('\n') });
  });
}
/** The species page by a client-side visit from its genus row, so its data comes through `__data.json`. */
async function open(page: Page) {
  await page.goto('/?by=genus&open=copiapoa'); await ready(page);
  await page.locator('html[data-collection="open"]').waitFor({ state: 'attached' });
  await page.locator('a.tile', { hasText: 'Copiapoa cinerea' }).click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
}

test('r83a 1: the kept page says the old name is merged into it, and is also another species\' older name by another author @phone', async ({ page }) => {
  await withWas(page, { was: 'Echeveria peacockii', wasMerged: true, wasShared: [{ ...DUDLEYA, authors: ['Croucher ex T.Moore & Mast.'] }] });
  await open(page);
  const line = page.locator('#was-synonym');
  await expect(line).toHaveText('Echeveria peacockii is the name of a page merged into this one. It is also an older name of Dudleya pulverulenta, by another author (Echeveria peacockii Croucher ex T.Moore & Mast.).'); // r83b: "… so it names no one species here."
  await expect(line.locator('a')).toHaveAttribute('href', '/species/dudleya-pulverulenta');
});

test('r83a 2: a holder whose record writes no author is said so, and a name no merge made reads as before', async ({ page }) => {
  await withWas(page, { was: 'Echeveria peacockii', wasMerged: true, wasShared: [{ ...DUDLEYA, authors: [] }] });
  await open(page);
  await expect(page.locator('#was-synonym')).toHaveText('Echeveria peacockii is the name of a page merged into this one. It is also an older name of Dudleya pulverulenta, with no author in its record.');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withWas(page, { was: 'Echeveria peacockii', wasMerged: false, wasShared: [DUDLEYA] });
  await open(page);
  await expect(page.locator('#was-synonym')).toHaveText('Echeveria peacockii is an older name of this species, and the reference holds it for another species too, Dudleya pulverulenta, so it names no one species here.');
});

test('r83a 4: a merged name no other page holds is said as merged, not as Kew\'s filing (Bisnaga hamatacantha) @phone', async ({ page }) => {
  // Round eighty-three, M: the kept page said "Kew's World Checklist files it under …" though Kew's file holds no row of
  // the name. FAILED on 841936c (A's head): that sentence.
  await withWas(page, { was: 'Bisnaga hamatacantha', wasMerged: true, wasShared: [] });
  await open(page);
  await expect(page.locator('#was-synonym')).toHaveText('Bisnaga hamatacantha is the name of a page merged into this one.');
});
