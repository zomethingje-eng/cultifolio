/**
 * Round eighty-seven (browse, C3) in the browser: the search box at the top of every page ($lib/browse/SiteSearch,
 * mounted in the layout's header). "/" puts the cursor there; it is a combobox (ARIA 1.2) whose arrows move through the
 * rows and whose Escape closes the list and then empties the box; its rows are Browse (a genus, a family, a country, a
 * region) and Species (the catalogue's search, unchanged: a typing error said as one); a full species name wins Enter
 * over a browse row; the empty box shows the searches chosen before, kept in this browser only, and can forget them.
 *
 * Over the fixture corpus. C13's five searches are held at unit level (tests/unit/r87c-search-parity.test.ts): the
 * fixture holds none of their species. Fails on the base (r85m head), which has no such box.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

const box = (p: Page) => p.getByRole('combobox', { name: 'Search the reference' });
const list = (p: Page) => p.getByRole('listbox', { name: 'Suggestions' });
/**
 * The box as a reader reaches it (round eighty-seven, the integration): where the bar has room for it, the box itself;
 * on a phone and a tablet (960 px or less) the bar's search is a button (the look's), which opens the box over the bar.
 */
async function openBox(p: Page) {
  const button = p.locator('#topbar .searchicon');
  if (await button.isVisible()) {
    await button.click();
    await expect(box(p)).toBeFocused();
  }
  await box(p).click();
}

test('r87c search 1: "/" focuses the box; rows in two groups; arrows, Escape and Tab as a combobox has them', async ({ page }) => {
  await page.goto('/browse');
  await ready(page);
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('copi');
  await expect(list(page)).toBeVisible();
  await expect(box(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(box(page)).toHaveAttribute('aria-controls', (await list(page).getAttribute('id'))!);
  await expect(list(page).getByRole('group', { name: 'Browse' }).getByRole('option').first()).toContainText('Copiapoa');
  await expect(list(page).getByRole('group', { name: 'Species' }).getByRole('option')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  const first = await box(page).getAttribute('aria-activedescendant');
  expect(first).toBeTruthy();
  await expect(page.locator(`#${first}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  expect(await box(page).getAttribute('aria-activedescendant')).not.toBe(first);
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(box(page)).toHaveValue('copi');
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveValue('');
  // "/" typed in another field is a slash there.
  await page.goto('/plants/new');
  await ready(page);
  const field = page.locator('#species-name');
  await field.click();
  await page.keyboard.type('a/b');
  await expect(field).toHaveValue('a/b');
});

test('r87c search 2: Enter opens the row marked, the first by default: the genus\'s page', async ({ page }) => {
  // From a species page: the front page's bar leads to that page's own box, which is the catalogue's (the look, r87l look 3).
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await box(page).fill('copiapoa');
  await expect(list(page).getByRole('group', { name: 'Browse' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/genus\/copiapoa$/);
  await expect(page.locator('h1')).toHaveText('Copiapoa');
});

test('r87c search 3: a full species name wins Enter over a browse row before it @phone', async ({ page }) => {
  // A browse row the server would put first for these words (none does in the fixture): the species still wins.
  await page.route(/\/api\/suggest\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [{ kind: 'genus', label: 'Welwitschia', sci: 'Welwitschia', sub: 'genus · 1 species', href: '/genus/welwitschia', n: 1 }] }) }));
  await page.goto('/browse');
  await ready(page);
  await openBox(page);
  await box(page).fill('Welwitschia mirabilis');
  await expect(list(page).getByRole('group', { name: 'Species' }).getByRole('option').first()).toContainText('Welwitschia mirabilis');
  await expect(list(page).getByRole('option').first()).toContainText('genus · 1 species');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/species\/welwitschia-mirabilis$/);
});

test('r87c search 4: a typing error is read and said; a region and a country are rows; the box remembers what was chosen, here only', async ({ page }) => {
  await page.goto('/browse');
  await ready(page);
  await box(page).fill('copiapao');
  const species = list(page).getByRole('group', { name: 'Species' });
  await expect(species.getByRole('option').first()).toContainText('Copiapoa');
  await expect(species).toContainText(/similar spelling|Showing results for/);
  await box(page).fill('namib');
  const browse = list(page).getByRole('group', { name: 'Browse' });
  await expect(browse.getByRole('option', { name: /Native to Namibia/ })).toHaveAttribute('href', '/browse?r=CPV,NAM');
  await browse.getByRole('option', { name: /Native to Namibia/ }).click();
  await expect(page).toHaveURL(/\/browse\?r=CPV,NAM$/);
  await expect(page.locator('h1')).toContainText('2 species');
  await ready(page);
  await box(page).click();
  const recent = list(page).getByRole('group', { name: 'Recent searches' });
  await expect(recent.getByRole('option').first()).toContainText('Native to Namibia');
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.recentSearches'))).toContain('/browse?r=CPV,NAM');
  await recent.getByRole('option', { name: 'Clear recent searches' }).click();
  await expect(list(page).getByRole('group', { name: 'Recent searches' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.recentSearches'))).toBeNull();
});

test('r87c search 5: on a phone the bar\'s button opens the box, the list fills the screen under the bar, and Cancel puts the page back @phone-only', async ({ page }) => {
  await page.goto('/browse');
  await ready(page);
  await expect(box(page)).toBeHidden(); // the bar's search is its button on a phone (the look)
  await openBox(page);
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await box(page).fill('cact');
  await expect(list(page).getByRole('option', { name: /Cactaceae/ })).toBeVisible();
  const r = await list(page).boundingBox();
  expect(r!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await page.getByRole('button', { name: 'Cancel' }).click();
  // The box is out of the bar again (its button and the page's name are), so it is found by its place, not its role.
  const field = page.locator('#topbar .site-search input');
  await expect(field).toHaveValue('');
  await expect(list(page)).toBeHidden();
  await expect(field).toBeHidden();
  await expect(page.locator('#topbar .searchicon')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('r87c search 6: where the bar\'s search is its button (a tablet), "/" opens the box there, once, and leaving it puts the bar back', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await expect(box(page)).toBeHidden();
  await expect(page.locator('#topbar .searchicon')).toBeVisible();
  // The key handled once (the layout's handler alone): its default prevented once, and no "/" typed into the box.
  await page.evaluate(() => {
    const w = window as unknown as { prevented: number };
    w.prevented = 0;
    const real = KeyboardEvent.prototype.preventDefault;
    KeyboardEvent.prototype.preventDefault = function (this: KeyboardEvent) { if (this.key === '/') w.prevented++; return real.call(this); };
  });
  await page.keyboard.press('/');
  await expect(box(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { prevented: number }).prevented)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeHidden();
  await expect(page.locator('#topbar .searchicon')).toBeVisible();
});

test('r87c search 7: a plant number typed in the box stays on this device, as the front page\'s search keeps it (/about/how#privacy)', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => { if (/\/api\/(search|suggest)\?/.test(r.url())) sent.push(r.url()); });
  await page.goto('/browse');
  await ready(page);
  await box(page).fill('2026-0013');
  await expect(list(page)).toContainText('Not searched: it is shaped like one of your plant numbers, which stay on this device.');
  await expect(list(page).getByRole('option', { name: 'Every species matching “2026-0013”' })).toBeVisible();
  // A name is asked as before: the guard is the number's shape, not every word.
  await box(page).fill('copiapoa');
  await expect(list(page).getByRole('group', { name: 'Species' }).getByRole('option').first()).toContainText('Copiapoa');
  expect(sent.filter((u) => u.includes('2026-0013'))).toEqual([]);
  expect(sent.some((u) => u.includes('copiapoa'))).toBe(true);
});

test('r87c search 8: the box is the look\'s, styled once: its edge, height and hint are the theme\'s tokens; "/" is handled once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const s = await page.evaluate(() => {
    const label = document.querySelector<HTMLElement>('#topbar .site-search label')!;
    const probe = document.createElement('i');
    probe.style.color = 'var(--edge)';
    document.documentElement.appendChild(probe);
    const edge = getComputedStyle(probe).color;
    probe.style.color = 'var(--kbd)';
    const kbd = getComputedStyle(probe).color;
    probe.remove();
    const l = getComputedStyle(label), input = getComputedStyle(label.querySelector('input')!), hint = getComputedStyle(label.querySelector('kbd')!);
    return { classes: label.className, border: l.borderTopColor, edge, height: l.height, radius: l.borderTopLeftRadius, inputBorder: input.borderTopWidth, hintBorder: hint.borderTopColor, kbd, hintFont: hint.fontFamily };
  });
  expect(s.classes).toContain('site-search-box');
  expect(s.border).toBe(s.edge);
  expect(s.height).toBe('34px');
  expect(s.radius).toBe('4px');
  expect(s.inputBorder).toBe('0px');
  expect(s.hintBorder).toBe(s.kbd);
  expect(s.hintFont).toMatch(/^"?Source Code Pro"?,/);
  await page.evaluate(() => {
    const w = window as unknown as { prevented: number };
    w.prevented = 0;
    const real = KeyboardEvent.prototype.preventDefault;
    KeyboardEvent.prototype.preventDefault = function (this: KeyboardEvent) { if (this.key === '/') w.prevented++; return real.call(this); };
  });
  await page.locator('body').press('/');
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { prevented: number }).prevented)).toBe(1);
});
