/**
 * Round eighty-six, the ranges agent: what the species page says of its range, rendered.
 *
 * - Review D2: Kew's own words for where the plant grows (`distribution.kew.area`) are shown, quoted, and beside the typical
 *   spot of a page from few records: the Poor Knights lily's Auckland beside "New Zealand (Poor Knights Is., Hen I.)".
 * - The plan's B16: a range Kew gives only as a level-2 region ("Mexico", Agave calodonta's) is said as Kew's, wider than
 *   any region records are tested against, not "country level".
 *
 * Copiapoa humilis by a client-side visit, its data changed on the way in (the r82u pattern). On r86base: FAILED (no Kew
 * area row; the few-records sentence named no Kew area; the range source said "country level only").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const noThirdParty = (page: Page) => page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r: Route) => r.abort());
async function rewrite(page: Page, path: RegExp, change: (d: Record<string, unknown>) => void) {
  await page.route(path, async (route: Route) => {
    const res = await route.fetch();
    const [first, ...rest] = (await res.text()).split('\n');
    const j = JSON.parse(first) as { nodes?: Array<{ type: string; data?: unknown[] } | null> };
    for (const n of j.nodes ?? []) {
      if (!n || n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown>;
      change(d);
      n.data = JSON.parse(devalue.stringify(d));
    }
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !/^(content-length|transfer-encoding|content-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status(), headers, body: [JSON.stringify(j), ...rest].join('\n') });
  });
}
type Dossier = { climate: Record<string, unknown>; distribution: Record<string, unknown>; occurrences: Record<string, unknown> };
async function humilis(page: Page, change: (d: Dossier) => void) {
  await rewrite(page, /\/species\/copiapoa-humilis\/__data\.json/, (x) => { if (x.d) change(x.d as Dossier); });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('a.reltile[href="/species/copiapoa-humilis"]').first().click();
  await expect(page).toHaveURL(/\/species\/copiapoa-humilis$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
}

test("r86r 1: Kew's area is shown, and beside the typical spot of a page from few records @phone", async ({ page }) => {
  await noThirdParty(page);
  await humilis(page, (d) => {
    d.climate.records = 5; d.climate.cells = 3; d.climate.place = 'Auckland, New Zealand';
    d.distribution.kew = { ...(d.distribution.kew as object), area: 'New Zealand (Poor Knights Is., Hen I.)' };
  });
  await expect(page.locator('#kew-area')).toHaveText("Range in Kew's words“New Zealand (Poor Knights Is., Hen I.)” · quoted from WCVP, RBG Kew (CC BY 4.0); not derived here");
  await expect(page.locator('#few-records')).toContainText("The typical spot, where the cold figures are read, is in Auckland, New Zealand (Natural Earth's provinces); Kew gives its area as “New Zealand (Poor Knights Is., Hen I.)” (WCVP).");
  // A page whose dossier holds no area (built before the walk) shows neither (guard).
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#kew-area')).toHaveCount(0);
});

test('r86r 2: a range Kew gives only as Mexico is said as Kew\'s, never "country level" @phone', async ({ page }) => {
  await noThirdParty(page);
  await humilis(page, (d) => {
    d.distribution.native = [{ name: 'Mexico' }];
    d.distribution.boxes = [];
    d.distribution.kew = { ...(d.distribution.kew as object), area: 'Mexico (?)' };
    d.climate = { status: 'none', detail: 'native range given by Kew only as Mexico, with no level-3 region to test records against, so no record is placed in the range' };
    d.occurrences = { ...d.occurrences, rangeTested: false };
  });
  const factgrid = page.locator('.factgrid');
  await expect(factgrid).toContainText('Kew gives the native range only as Mexico (in its words, “Mexico (?)”), wider than any region records are tested against, so records are not tested against it.');
  await expect(factgrid).not.toContainText('country level');
});
