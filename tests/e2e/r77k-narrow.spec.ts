/**
 * Round seventy-seven (K): a search the server cannot list from its key files, every word of it too common (the answer
 * carries `X-Search-Narrow: 1` and no hits), is said as that wherever the reference's search is asked: the front page asks
 * for another letter or word and never says nothing matches; Compare's picker says the same; the add form's species
 * picker says the reference's species were too many to list, and offers the backbone's names. The fixture corpus has no
 * key files, so the server's answer is given here as the key files give it (tests/unit/r77k-search-files.test.ts proves
 * the server's side). FAILS on r77base: no page reads the header, and the front page said "Nothing in the reference
 * matches".
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** The key files' answer to a query of very common words: no hits, said in the header (and in the body under shape 2). */
async function narrow(p: Page) {
  await p.route(/\/api\/search\?/, (r) => {
    const shaped = new URL(r.request().url()).searchParams.get('shape') === '2';
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-search-narrow': '1' }, body: shaped ? '{"hits":[],"narrow":true}' : '[]' });
  });
}

test('the front page asks for another letter or word, never "nothing matches" @phone', async ({ page }) => {
  await narrow(page);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('cape provinces');
  const said = page.getByText('Too many species match “cape provinces” to list them all. Type another letter or another word to narrow it.');
  await expect(said).toBeVisible();
  await expect(page.getByText('Nothing in the reference matches')).toHaveCount(0);
  await expect(page.locator('.seccount.relaxed')).toHaveCount(0);
});

test('Compare\'s picker says so too @phone', async ({ page }) => {
  await narrow(page);
  await page.goto('/compare');
  await ready(page);
  await page.locator('#cmp-q').fill('cape provinces');
  await expect(page.getByText('Too many species match “cape provinces” to list them. Type another letter or word.')).toBeVisible();
});

test('the add form\'s species picker says the reference\'s species were too many, and offers the backbone\'s names @phone', async ({ page }) => {
  await narrow(page);
  await page.route(/\/api\/names\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('cape provinces');
  await expect(page.locator('.picker .hint')).toContainText("Too many of the reference's species match what is typed to list them; type another letter or word, so only the backbone's names are offered.");
});
