/**
 * Round seventy-five, agent G (the owner: "looks a little odd"): on /species/abelmoschus-esculentus the Habitat card's
 * "Native" cell holds three native regions and some eighty introduced ones. The cell was made full-width only when the
 * native regions alone ran past four, so this list ran as one long, narrow column beside the short "Map marker" cell,
 * the rest of the row empty. Every region the cell lists now counts. The fixture's pages have one region each, so okra's
 * shape is put into the page's data on a client-side visit. On r75base the cell is a column about a quarter of the
 * grid's width.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

const NATIVE = [{ code: 'BAN', name: 'Bangladesh' }, { code: 'IND', name: 'India' }, { code: 'WHM', name: 'West Himalaya' }];
const INTRODUCED = ('Albania, Bulgaria, Greece, Italy, Spain, Portugal, France, Corse, Sardegna, Sicilia, Kriti, Cyprus, Turkey, Egypt, Libya, Tunisia, ' +
  'Algeria, Morocco, Canary Is., Madeira, Cape Verde, Senegal, Gambia, Mali, Niger, Chad, Sudan, Ethiopia, Kenya, Tanzania, Uganda, Rwanda, Burundi, ' +
  'Angola, Zambia, Malawi, Mozambique, Zimbabwe, Botswana, Namibia, Cape Provinces, KwaZulu-Natal, Madagascar, Mauritius, Réunion, Seychelles, Comoros, ' +
  'Saudi Arabia, Yemen, Oman, Iran, Iraq, Pakistan, Sri Lanka, Myanmar, Thailand, Vietnam, Cambodia, Laos, Malaya, Sumatera, Jawa, Borneo, Philippines, ' +
  'Taiwan, China Southeast, Japan, New Guinea, Queensland, Fiji, Samoa, Hawaii, Mexico Southeast, Cuba, Jamaica, Haiti, Puerto Rico, Trinidad-Tobago, ' +
  'Venezuela, Colombia').split(', ').map((name) => ({ name }));

async function okraRange(page: Page) {
  await page.route(/\/species\/copiapoa-cinerea\/__data\.json/, async (route: Route) => {
    const res = await route.fetch();
    const j = JSON.parse((await res.text()).split('\n')[0]) as { nodes: Array<{ type: string; data?: unknown[] }> };
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as { d?: { distribution: Record<string, unknown> } };
      if (!d.d) continue;
      d.d.distribution.native = NATIVE;
      d.d.distribution.introduced = INTRODUCED;
      n.data = JSON.parse(devalue.stringify(d));
    }
    await route.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.goto('/?by=genus&open=copiapoa'); await ready(page);
  await page.locator('a.tile', { hasText: 'Copiapoa cinerea' }).click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('.factgrid')).toContainText('Bangladesh, India, West Himalaya');
}
const nativeCell = (page: Page) => page.locator('.factgrid > div', { has: page.locator('b', { hasText: /^Native$/ }) });

test('r75g range 1: at desktop width a long region list spans the fact grid, not a narrow column, and keeps every region', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await okraRange(page);
  const grid = (await page.locator('.factgrid').boundingBox())!;
  const cell = (await nativeCell(page).boundingBox())!;
  expect(cell.width / grid.width).toBeGreaterThan(0.9);
  expect(cell.height).toBeLessThan(260); // the list flows across the row; as a column it ran to well over a thousand pixels
  const text = await nativeCell(page).innerText();
  for (const r of INTRODUCED) expect(text).toContain(r.name); // every region shown, nothing cut
  expect(text).toContain('introduced: Albania, Bulgaria');
  // The marker's cell takes its own row beside no blank: as wide as the grid too.
  const marker = page.locator('.factgrid > div', { has: page.locator('b', { hasText: /^Map marker$/ }) });
  if (await marker.count()) expect((await marker.boundingBox())!.width / grid.width).toBeGreaterThan(0.9);
  await ctx.close();
});

test('r75g range 2: on a phone the same list wraps inside the page, no sideways scroll', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await okraRange(page);
  await expect(nativeCell(page)).toContainText('Colombia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ctx.close();
});
