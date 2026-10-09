/**
 * Round sixty-two, decision 3: the species picker asks about the species part as typed, files a key only when the name
 * filed is the picked taxon's, says a similar spelling as that, offers the genus for a genus followed by capitalised
 * words, and says a refusal as "not asked" with the server's own reason (the corpus review, 2 and 3; the server review,
 * 1 and 7; A7, A8, B3). Adopted from docs/review-61/tests/corpus--picker-author.spec.ts (its two tests first). The name
 * service is the site's /api/names, answered here by the test (GBIF is not reachable from the test server).
 */
import { test, expect, type Page } from '@playwright/test';

// The service worker is not under test here, and once it controls the page its fetches pass by `page.route`, so a later
// request went to the real server (whose GBIF is out of reach: "did not answer") in a full run (round sixty-two, at the merge).
test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** /api/names answered by the test: `rows` for a 200, or a status and body. Every name asked is collected. */
async function names(p: Page, answer: { rows?: object[]; status?: number; body?: object } = { rows: [] }) {
  const asked: string[] = [];
  await p.route(/\/api\/names\?/, (r) => {
    asked.push(new URL(r.request().url()).searchParams.get('q') ?? '');
    return r.fulfill({ status: answer.status ?? 200, contentType: 'application/json', body: JSON.stringify(answer.rows ?? answer.body ?? []) });
  });
  return asked;
}
const option = (p: Page, text: string | RegExp) => p.locator('.picker [role=option]', { hasText: text });

test('the picker offers the species for a name pasted with its author, asking about the species part as typed', async ({ page }) => {
  const asked = await names(page);
  const searched: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/search?')) searched.push(new URL(r.url()).searchParams.get('q') ?? ''); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Copiapoa cinerea Britton & Rose');
  await expect(option(page, 'has a species page').first()).toBeVisible(); // base: no option (the lower-cased paste was answered only by the retry)
  // Changed in round sixty-two's second pass (the verification review's search 6): the catalogue is sent the text whole,
  // as the catalogue's own search box sends it, and its reading leaves the author out; the name service the species part.
  expect(searched).toContain('Copiapoa cinerea Britton & Rose'); // base: "copiapoa cinerea britton & rose"
  expect(asked).toEqual(['Copiapoa cinerea']);
});

test('a half-typed rank is not written into the name by a pick, and the key is filed', async ({ page }) => {
  await names(page);
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa cinerea var');
  const opt = option(page, 'has a species page').first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(input).toHaveValue('Copiapoa cinerea'); // base: "Copiapoa cinerea var"
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 5384013');
});

test('a qualifier and an unknown variety keep what was typed and file no key, and the row says so (B3)', async ({ page }) => {
  const asked = await names(page, { rows: [{ key: 5384013, canonicalName: 'Copiapoa cinerea', rank: 'SPECIES', family: 'Cactaceae' }] });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa cf. cinerea');
  const cf = option(page, 'compared species is in the reference; no key filed').first();
  await expect(cf).toBeVisible();
  expect(asked).toEqual(['Copiapoa cinerea']); // base: "Copiapoa cf. cinerea"
  await cf.click();
  await expect(input).toHaveValue('Copiapoa cf. cinerea'); // base: "Copiapoa cinerea"
  await expect(page.locator('.picker .pill', { hasText: 'no key filed' })).toBeVisible();
  await expect(page.locator('.picker .pill.ok')).toHaveCount(0);

  await input.fill('Copiapoa cinerea var. invented');
  // "Compared" is the wording of cf. and aff. only (round sixty-two's second pass; the grower review, 9).
  const v = option(page, 'its species is in the reference; no key filed').first();
  await expect(v).toBeVisible();
  await v.click();
  await expect(input).toHaveValue('Copiapoa cinerea var. invented');
  await expect(page.locator('.picker .pill', { hasText: 'no key filed' })).toBeVisible(); // base: GBIF 5384013, the species' key
  // One Add files it: a pick that filed no key on purpose is not asked about again.
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea var. invented');
});

test('a genus followed by capitalised words is offered as the genus with the rest as a cultivar, first (A7)', async ({ page }) => {
  const asked = await names(page, { rows: [{ key: 3084, canonicalName: 'Echeveria', rank: 'GENUS', family: 'Crassulaceae' }, { key: 3085, canonicalName: 'Echeveria lilacina', rank: 'SPECIES' }] });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Echeveria Lola');
  const first = page.locator('.picker [role=option]').first();
  await expect(first).toContainText("'Lola' kept as the cultivar"); // base: no such row
  expect(asked).toEqual(['Echeveria lola']); // the species it may be is asked first (round sixty-two's second pass; search 4)
  await expect(option(page, 'Echeveria lilacina')).toHaveCount(0); // not a species begun by what was typed
  await first.click();
  await expect(input).toHaveValue("Echeveria 'Lola'");
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 3084');
});

test('a reference row found by a similar spelling says so (A7, B2)', async ({ page }) => {
  await names(page);
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Copiapoa cinereaa');
  await expect(option(page, 'similar spelling').first()).toBeVisible(); // base: "has a species page"
  await expect(option(page, 'has a species page')).toHaveCount(0);
});

test('a refusal is "not asked", with the server\'s own reason; a failure is "did not answer" (server 1 and 7, A8)', async ({ page }) => {
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  const hint = page.locator('.picker .hint.svc');
  const cases: Array<[number, object, string]> = [
    [400, { error: 'a name is letters and their marks, spaces, full stops, apostrophes, hyphens, & and ×' }, 'The name service was not asked: what is typed is not a name it can look up.'],
    [429, { error: 'too many requests from this address; wait and try again' }, 'The name service was not asked: too many requests from this address; wait and try again.'],
    [429, { error: "not asked: this address has used its part of this site's calls for this minute", held: true }, "The name service was not asked: this address has used its part of this site's calls for this minute."],
    [503, { error: "not asked: this site's calls are used up for this minute", held: true }, "The name service was not asked: this site's calls are used up for this minute."],
    [502, { error: 'backbone unreachable' }, 'The name service did not answer, so only']
  ];
  for (const [i, [status, body, said]] of cases.entries()) {
    await page.unroute(/\/api\/names\?/);
    await names(page, { status, body });
    await input.fill(`Lithops lesliei${'abcde'[i]}`);
    await expect(hint).toContainText(said); // base: "The name service did not answer" for all but the held 503
  }
});
