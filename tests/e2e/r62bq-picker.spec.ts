/**
 * Round sixty-two, second pass, agent Q: the species picker after the verification review (search 4, 5; the grower
 * review, 9; the self-review's triage N2) and the front page's label for a name pasted with its author (search 3).
 * Adopted from /tmp/r62rev/out/tests/search--picker-capital.spec.ts (tests 1 to 3), triage-self--picker-search-refused
 * .spec.ts (tests 4 and 5) and search--front-author.spec.ts (the last test, which passes once W's page says "leaving
 * out"; see Q's report). The name service is the site's /api/names, answered here by the test.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** /api/names answered by the test, by the name asked, the way GBIF's suggest answers: a genus asked gives the genus row. */
async function names(p: Page, byName: Record<string, object[]>) {
  const asked: string[] = [];
  await p.route(/\/api\/names\?/, (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') ?? '';
    asked.push(q);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(byName[q.toLowerCase()] ?? []) });
  });
  return asked;
}
const GENUS = { key: 2659, canonicalName: 'Copiapoa', rank: 'GENUS', family: 'Cactaceae' };
const TENUISSIMA = { key: 5384050, canonicalName: 'Copiapoa tenuissima', rank: 'SPECIES', family: 'Cactaceae', status: 'ACCEPTED' };

test('a species typed with a capitalised epithet is asked about, and is not said to be missing from the backbone', async ({ page }) => {
  const asked = await names(page, { copiapoa: [GENUS], 'copiapoa tenuissima': [TENUISSIMA] });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa Tenuissima');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible();
  await input.blur();
  await page.waitForTimeout(800);
  await expect(page.locator('.picker .pill', { hasText: 'not in the backbone' })).toHaveCount(0); // base: said, though GBIF was never asked about the species
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 5384050');
  expect(asked.map((q) => q.toLowerCase())).toContain('copiapoa tenuissima'); // base: only "Copiapoa" is asked
});

test('a typo in a capitalised epithet still offers the species, as the same text in lower case does', async ({ page }) => {
  await names(page, { copiapoa: [GENUS] });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa cinereaa');
  await expect(page.locator('.picker [role=option]', { hasText: 'Copiapoa cinerea' }).first()).toBeVisible();
  await input.fill('Copiapoa Cinereaa');
  await expect(page.locator('.picker [role=option]', { hasText: 'kept as the cultivar' })).toBeVisible();
  await expect(page.locator('.picker [role=option]', { hasText: /Copiapoa cinerea\b(?!a)/ })).toHaveCount(1); // base: only "Copiapoa 'Cinereaa' kept as the cultivar"
  await expect(page.locator('.picker [role=option]', { hasText: /Copiapoa cinerea\b(?!a)/ })).toContainText('similar spelling');
});

test('a title-case common name with a typo is not offered as a genus', async ({ page }) => {
  await names(page, {});
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Snake Plnat');
  await page.waitForTimeout(1500);
  await expect(page.locator('.picker [role=option]', { hasText: '· genus' })).toHaveCount(0); // base: "Snake 'Plnat' · genus · 'Plnat' kept as the cultivar; no key filed"
});

for (const status of [503, 429]) test(`the picker says the reference search was not answered (${status}), not silence`, async ({ page, context }) => {
  await context.route('**/api/search?**', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'refused for the test' }) }));
  await context.route('**/api/names?**', (r) => r.abort());
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Copiapoa cinerea');
  await expect(page.locator('.picker .hint')).toContainText(/name service/);
  // base: "only the reference's own species are offered", though the reference's search failed too
  await expect(page.locator('.picker .hint')).toContainText(status === 429 ? "The reference's own search was not asked: this site asked this device to wait." : "The reference's own search did not answer.");
  await expect(page.locator('.picker .hint')).not.toContainText("reference's own species are offered");
});

test('a pick that leaves typed words out files them as the name as received (the grower review, 9)', async ({ page }) => {
  await names(page, {});
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa cinerea Pan de Azucar');
  const row = page.locator('.picker [role=option]', { hasText: 'has a species page' }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(input).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('.picker .hint')).toContainText('“Copiapoa cinerea Pan de Azucar”, is kept as the name as received');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('main')).toContainText('Copiapoa cinerea Pan de Azucar'); // base: the typed words gone
});

test('a genus followed by a capitalised word that is no species is read as the genus and a cultivar, said before Add files it (search 13)', async ({ page }) => {
  const ECHEVERIA = { key: 3084, canonicalName: 'Echeveria', rank: 'GENUS', family: 'Crassulaceae' };
  await names(page, { echeveria: [ECHEVERIA] });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Echeveria Lola');
  await expect(page.locator('.picker [role=option]').first()).toContainText("'Lola' kept as the cultivar");
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(input).toHaveValue("Echeveria 'Lola'"); // base: filed as the species "Echeveria lola" on the second Add
  await expect(page.locator('.picker .hint')).toContainText('read as the genus');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1')).toContainText('Lola');
});

test('a correct name with its author is not said to have matched nothing (search 3; needs W\'s sentence)', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const box = page.getByLabel('Search the whole species catalogue');
  await box.fill('Copiapoa cinerea Phil.');
  await expect(page.getByText('Copiapoa cinerea').first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.seccount.relaxed')).toContainText('Searched for “Copiapoa cinerea”, leaving out “Phil.”.');
  await expect(page.locator('.seccount.relaxed')).not.toContainText('Nothing matched'); // base: "Nothing matched “Copiapoa cinerea Phil.” as written. Showing results for “Copiapoa cinerea”."
});

test('a similar spelling is said on the front page (search 18; needs W\'s sentence)', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('Copiapoa cinereaa');
  await expect(page.locator('.seccount.relaxed')).toContainText('No name in the reference is spelt “Copiapoa cinereaa”; these are similar spellings.'); // base: nothing said
});
