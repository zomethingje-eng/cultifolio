/**
 * Round 112 (MYPLANTS 25, the owner's tracker review of 23 November 2026): the species suggestions on "Add a plant".
 *
 * 1. The list is solid: its own background (never transparent), a border, over the fields beneath it, in both themes.
 *    The look's "No cards" rule (theme.css) made the list's `.card` transparent, and its rows printed over Space and
 *    Acquired.
 * 2. Nothing moves once shown: with the reference's search held back two seconds and GBIF's names answered at once, the
 *    species pages' group is first from the start ("Looking…" in its place) and its first line does not move when the
 *    search answers; GBIF's names are never the first row.
 * 3. The same with GBIF's names held back: the first species page row does not move when they answer.
 * 4. A stale answer is dropped: the search for "welw", answered after the field holds "lithops les", draws nothing.
 * 5. GBIF's other names sit behind one row, "N more names in GBIF ›", which opens them in place below every row shown.
 * 6. The six queries of the review, against this build's own search with GBIF's names answered first (a fossil genus,
 *    Welwitschiapites, at their head, as the review saw): each list begins with a species page.
 * 7. Keyboard alone: arrows move, Enter picks, Enter on the "more" row opens it; the combobox's own attributes hold
 *    (axe is not among the project's packages: package.json is the owner's to change).
 * 8. Every row is at least 48 px tall.
 *
 * On 1764df3: 1 (transparent), 2 (GBIF's names drawn first, the pages inserted above them), 5 (every GBIF name shown, no
 * "more" row), 6 (Welwitschiapites first for "welw" while the search was out) and 8 (37 px) FAILED.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const later = (ms: number) => new Promise((res) => setTimeout(res, ms));
const entry = (o: Record<string, unknown>) => ({ family: 'Welwitschiaceae', origin: ['Namibia'], photos: 0, open: 3, climate: 'ok', ...o });
const WELW = entry({ key: 'k339841', slug: 'welwitschia-mirabilis', name: 'Welwitschia mirabilis', gbif: 5275521, yr: 'summer' });
const row = (key: number, name: string, rank = 'SPECIES', family = 'Welwitschiaceae') => ({ key, canonicalName: name, family, rank, status: 'ACCEPTED' });
const FOSSIL = [row(11695027, 'Welwitschiapites', 'GENUS'), row(2653230, 'Welwitschia', 'GENUS'), row(3118121, 'Welwitschiella', 'GENUS', 'Asteraceae')];

async function open(page: Page) {
  await page.goto('/plants/new');
  await ready(page);
}
const menu = (page: Page) => page.locator('.picker .menu');
const top = async (page: Page, sel: string) => (await menu(page).locator(sel).first().boundingBox())!.y;

test('r112b 1: the list has its own solid background and a border, in both themes', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, (r) => json(r, [WELW]));
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await page.locator('#species-name').fill('welw');
    await expect(menu(page).locator('[role=option]').first()).toBeVisible();
    const css = await menu(page).evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderTopWidth }; });
    expect(css.bg, scheme).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/); // on 1764df3: rgba(0, 0, 0, 0)
    expect(css.bg, scheme).not.toMatch(/rgba\([^)]*, 0(\.\d+)?\)$/);
    expect(css.border, scheme).toBe('1px');
    // Over the field beneath it: the list's own colour is what is seen at a point inside it.
    const box = (await menu(page).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e?.closest('.picker .menu'); }, [box.x + box.width - 12, box.y + box.height - 8]);
    expect(hit, scheme).toBe(true);
  }
});

test('r112b 2: with the search held back two seconds, the species pages are first from the start and do not move @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, async (r) => { await later(2000); await json(r, [WELW]); });
  await open(page);
  await page.locator('#species-name').fill('welw');
  await expect(menu(page).locator('li.grp').first()).toHaveText('Species pages');
  await expect(menu(page).locator('li.wait').first()).toHaveText('Looking…');
  const before = await top(page, 'li.grp');
  // GBIF's names answered first: none of them is a row of its own yet, and none is first.
  await expect(menu(page).locator('[role=option]').first()).toHaveText(/3 more names in GBIF/);
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschia mirabilis' })).toBeVisible({ timeout: 5000 });
  expect(await top(page, 'li.grp')).toBe(before);
  await expect(menu(page).locator('[role=option]').first()).toContainText('Welwitschia mirabilis');
});

test('r112b 3: with GBIF\'s names held back, the first species page does not move when they answer', async ({ page }) => {
  await page.route(/\/api\/names\?/, async (r) => { await later(2000); await json(r, FOSSIL); });
  await page.route(/\/api\/search\?/, (r) => json(r, [WELW]));
  await open(page);
  await page.locator('#species-name').fill('welw');
  const first = menu(page).locator('[role=option]').first();
  await expect(first).toContainText('Welwitschia mirabilis');
  const before = (await first.boundingBox())!.y;
  await expect(menu(page).locator('[role=option]', { hasText: /more names in GBIF/ })).toBeVisible({ timeout: 5000 });
  expect((await first.boundingBox())!.y).toBe(before);
  await expect(first).toContainText('Welwitschia mirabilis');
});

test('r112b 4: an answer to an older query than the field\'s is dropped', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, []));
  await page.route(/\/api\/search\?/, async (r) => {
    if (/q=welw/.test(r.request().url())) { await later(1500); return json(r, [WELW]); }
    return json(r, [entry({ key: 'k9', slug: 'lithops-lesliei', name: 'Lithops lesliei', gbif: 3084781, family: 'Aizoaceae' })]);
  });
  await open(page);
  const field = page.locator('#species-name');
  await field.fill('welw');
  await later(300);
  await field.fill('lithops les');
  await expect(menu(page).locator('[role=option]').first()).toContainText('Lithops lesliei');
  await later(1800);
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschia' })).toHaveCount(0);
});

test('r112b 5: GBIF\'s other names open in place, below every row shown', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, (r) => json(r, [WELW]));
  await open(page);
  await page.locator('#species-name').fill('welw');
  const more = menu(page).locator('[role=option]', { hasText: /3 more names in GBIF/ });
  await expect(more).toBeVisible();
  await expect(menu(page).locator('[role=option]').first()).toContainText('Welwitschia mirabilis'); // both answered
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschiapites' })).toHaveCount(0); // on 1764df3: shown
  // The first row's place in the list (its offset, whatever the list or the page scrolls) does not change.
  const firstY = await menu(page).locator('[role=option]').first().evaluate((e) => (e as HTMLElement).offsetTop);
  await more.click();
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschiapites' })).toBeVisible();
  expect(await menu(page).locator('[role=option]').first().evaluate((e) => (e as HTMLElement).offsetTop)).toBe(firstY);
  await expect(menu(page).locator('[role=option]').first()).toContainText('Welwitschia mirabilis');
  await expect(page.locator('#species-name')).toHaveValue('welw'); // opening it picked nothing
});

// The species page each of the review's queries found on the live site on 23 November 2026. The browser suite's corpus is
// a few fixture pages, so the search answers with that page, 800 ms after GBIF's names, which come first.
const FOUND: Record<string, Record<string, unknown>> = {
  welw: WELW,
  'lithops les': entry({ key: 'k1', slug: 'lithops-lesliei', name: 'Lithops lesliei', gbif: 3084781, family: 'Aizoaceae' }),
  mammillaria: entry({ key: 'k2', slug: 'mammillaria-elongata', name: 'Mammillaria elongata', gbif: 5383780, family: 'Cactaceae' }),
  'jade plant': entry({ key: 'k3', slug: 'crassula-ovata', name: 'Crassula ovata', gbif: 5362063, family: 'Crassulaceae', common: 'Jade plant' }),
  echiveria: entry({ key: 'k4', slug: 'echeveria-elegans', name: 'Echeveria elegans', gbif: 5361920, family: 'Crassulaceae' }),
  'Crassula ovata Gollum': entry({ key: 'k3', slug: 'crassula-ovata', name: 'Crassula ovata', gbif: 5362063, family: 'Crassulaceae', common: 'Jade plant' })
};
for (const q of Object.keys(FOUND)) {
  test(`r112b 6: "${q}" begins with a species page, GBIF's names answered first`, async ({ page }) => {
    // GBIF's names at once, a fossil genus first, as the review saw for "welw"; the search 800 ms later.
    await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
    await page.route(/\/api\/search\?/, async (r) => { await later(800); await json(r, [FOUND[q]]); });
    await open(page);
    await page.locator('#species-name').fill(q);
    const first = menu(page).locator('[role=option]').first();
    await expect(first.locator('.sr')).toHaveText(/has a species page/, { timeout: 15_000 });
    await expect(first).not.toContainText('Welwitschiapites');
  });
}

test('r112b 7: keyboard alone moves, picks, and opens the "more" row; the combobox holds its attributes', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, (r) => json(r, [WELW]));
  // Both answered before the arrows: the highlight held across a late answer is r112b 9's.
  await open(page);
  const field = page.locator('#species-name');
  await field.fill('welw');
  await expect(menu(page).locator('[role=option]', { hasText: /more names in GBIF/ })).toBeVisible();
  await expect(menu(page).locator('[role=option]').first()).toContainText('Welwitschia mirabilis');
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expect(field).toHaveAttribute('aria-controls', (await menu(page).getAttribute('id'))!);
  await field.press('ArrowDown');
  await field.press('ArrowDown');
  const active = await field.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${active}`)).toHaveText(/more names in GBIF/);
  await field.press('Enter');
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschiapites' })).toBeVisible();
  // Every option's id once, and the headings and waiting lines are no options.
  const ids = await menu(page).locator('[role=option]').evaluateAll((els) => els.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(menu(page).locator('li.grp[role=option], li.wait[role=option]')).toHaveCount(0);
  // Up to the species page, by the arrows alone (the highlight starts where the "more" row was).
  for (let n = 0; n < 5; n++) {
    const at = await field.getAttribute('aria-activedescendant');
    if (at && /Welwitschia mirabilis/.test((await page.locator(`#${at}`).textContent()) ?? '')) break;
    await field.press('ArrowUp');
    await expect(field).not.toHaveAttribute('aria-activedescendant', at ?? '');
  }
  await field.press('Enter');
  await expect(field).toHaveValue('Welwitschia mirabilis');
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5275521');
});

test('r112b 8: every row is at least 48 px tall @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, (r) => json(r, [WELW]));
  await open(page);
  await page.locator('#species-name').fill('welw');
  await expect(menu(page).locator('[role=option]').nth(1)).toBeVisible();
  const heights = await menu(page).locator('[role=option]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(48); // on 1764df3: 37
});

test('r112b 9: a highlighted row keeps its highlight when the species pages arrive above it; Enter does what was highlighted', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  await page.route(/\/api\/names\?/, (r) => json(r, FOSSIL));
  await page.route(/\/api\/search\?/, async (r) => { await held; await json(r, [WELW]); });
  await open(page);
  const field = page.locator('#species-name');
  await field.fill('welw');
  await expect(menu(page).locator('[role=option]').first()).toHaveText(/more names in GBIF/);
  await field.press('ArrowDown'); // the "more" row, the only row yet
  const at = await field.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${at}`)).toHaveText(/more names in GBIF/);
  release();
  await expect(menu(page).locator('[role=option]').first()).toContainText('Welwitschia mirabilis');
  const now = await field.getAttribute('aria-activedescendant');
  await expect(page.locator(`#${now}`)).toHaveText(/more names in GBIF/); // on 1764df3's base of round 112: the species page
  await field.press('Enter');
  await expect(menu(page).locator('[role=option]', { hasText: 'Welwitschiapites' })).toBeVisible();
  await expect(field).toHaveValue('welw');
});
