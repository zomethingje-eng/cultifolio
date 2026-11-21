/**
 * Round 102 (docs/PLAN-102.md; the launch review's round 1): the front page says what the site is first. A visitor's `/`
 * opens on the pitch (an H1 with the index's count) and one large search box, then the day's figure as the proof, the
 * principles, Browse beside "Changed lately", six tiles and the record's invitation; no catalogue. Every catalogue address
 * (a grouping, a group opened, a chip, a letter) and a search's `/?q=` still draw what they drew.
 *
 * On e9f6d64 (round 100's app; 2e85918 changed no page): `/` opened on the lead's H1 ("The coldest night on record…"),
 * with the welcome, the strip and the catalogue's box, chips and rows under it, and the top bar's stand-in box beside the
 * page's own: tests 1, 2 and 3 FAILED; 4 to 6 passed then and pass now (they hold what must not move).
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'en-GB' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
/** The boxes a reader sees: text fields and the bar's stand-in, each drawn and on the screen's width. */
const boxesInView = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('input[type=search], main .frontsearch input, #topbar .site-search input, #topbar .tobox')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && r.top < innerHeight; }).length);

test('r102a 1: the pitch and the one search box are on the first screen, with no catalogue under them @phone', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(/^[\d,]+ species, and every figure says where it came from\.$/);
  const vh = page.viewportSize()!.height;
  for (const sel of ['h1', '#search']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.y + b.height, sel).toBeLessThanOrEqual(vh);
  }
  expect(await boxesInView(page)).toBe(1);
  // No catalogue on the bare address: no grouping, chips, letters or rows; the welcome card and the pitch list are gone.
  for (const gone of ['nav.seg', '.chiprow', '.letters', '.rows .grow', '#welcome', 'ul.pitch']) await expect(page.locator(gone), gone).toHaveCount(0);
  // The proof is the lead, as an H2 now, its mark on the number and unit alone.
  await expect(page.locator('h2#lead-h')).toContainText('The coldest night on record where');
  await expect(page.locator('#lead-h .leadfig')).toHaveText(/^−?\d+(\.\d)? °[CF]$/);
  // The invitation keeps the welcome's ways in, the example first by its id.
  await expect(page.locator('section.tracker #try-sample-home')).toBeVisible();
  await expect(page.locator('section.tracker a[href="/plants/new"]')).toBeVisible();
});

test('r102a 2: the counts are the index\'s, and the strip shows six at most', async ({ page }) => {
  // The catalogue's own head counts the index: the front page's must say the same.
  await page.goto('/?by=genus');
  await ready(page);
  // A visitor's catalogue address draws the facts line under the lead (or, with no lead, the head's count).
  const facts = (await page.locator('.factsline, .headwrap').first().innerText()).replace(/\s+/g, ' ');
  const [, total, climate] = /([\d,]+) (?:plant )?species.*?(?:for |· )([\d,]+)(?: of them| with habitat climate)/.exec(facts)!;
  await page.goto('/');
  await ready(page);
  await expect(page.locator('h1')).toContainText(`${total} species`);
  await expect(page.locator('.frontwhat')).toContainText(`for ${climate} of them`);
  await expect(page.locator('.browselate.front .latemore a').first()).toHaveText(`All ${total} species`);
  expect(await page.locator('section.featured .ftile').count()).toBeLessThanOrEqual(6);
  // "Changed lately" is one reader's sentence a round, three rounds.
  expect(await page.locator('.browselate.front .lateline').count()).toBe(3);
});

test('r102a 3: each "Try" link lands on a page that answers, and a search link fills the box', async ({ page, request }) => {
  await page.goto('/');
  await ready(page);
  const links = page.locator('.tries a');
  const n = await links.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const href = (await links.nth(i).getAttribute('href'))!;
    const r = await request.get(href, { maxRedirects: 0 });
    expect([200, 301, 302], href).toContain(r.status());
  }
  const search = page.locator('.tries a[href^="/?q="]');
  if (await search.count()) {
    const typed = decodeURIComponent((await search.first().getAttribute('href'))!.slice(4));
    await search.first().click();
    await expect(page.locator('#search')).toHaveValue(typed);
  }
});

test('r102a 4: every catalogue address and a search still draw what they drew @phone', async ({ page }) => {
  for (const addr of ['/?by=genus', '/?by=family', '/?by=origin', '/?by=genus&chip=climate']) {
    await page.goto(addr);
    await ready(page);
    await expect(page.locator('.rows .grow').first(), addr).toBeVisible();
    await expect(page.locator('.frontpitch'), addr).toHaveCount(0);
  }
  // The sitemap's form of a genus's address: its group opened, with its species.
  const genus = await page.locator('.rows .grow').first().getAttribute('id');
  await page.goto('/?by=genus');
  await ready(page);
  const first = (await page.locator('.rows .grow').first().getAttribute('id'))!.replace(/^g-/, '');
  await page.goto(`/?by=genus&open=${first}`);
  await ready(page);
  await expect(page.locator('.hgrid.opened .tile').first()).toBeVisible();
  expect(genus).toBeTruthy();
  // A search's address draws its results. Since round 104 typing on the front page opens the header's panel under the
  // box (r104b) and the page stays as it is; the panel's last row is this address.
  await page.goto('/?q=copiapoa');
  await ready(page);
  await expect(page.locator('.rows.hits .hitrow').first()).toBeVisible();
  await page.goto('/');
  await ready(page);
  await page.locator('#search').fill('copiapoa');
  await expect(page.locator('.frontsearch [role=option]').first()).toBeVisible();
  await expect(page.locator('.frontpitch')).toBeVisible();
  await expect(page.locator('.frontsearch [role=option]').last()).toHaveAttribute('href', '/?q=copiapoa');
});

test('r102a 5: the bar\'s stand-in box stays on a catalogue address, where the page\'s box is lower', async ({ page }) => {
  await page.goto('/?by=genus');
  await ready(page);
  await expect(page.locator('#topbar .tobox')).toBeVisible();
});

test('r102a 6: the page holds the checks a reviewer runs by hand: one H1, headings in order, every link and control named @phone', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const r = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const levels = [...main.querySelectorAll('h1, h2, h3')].map((h) => Number(h.tagName[1]));
    const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
    const unnamed = [...main.querySelectorAll<HTMLElement>('a[href], button, input')].filter((e) => !(e.getAttribute('aria-label') || e.textContent?.trim() || (e as HTMLInputElement).labels?.[0]?.textContent?.trim() || e.getAttribute('aria-hidden') === 'true' || e.getAttribute('tabindex') === '-1')).map((e) => e.outerHTML.slice(0, 80));
    const imgs = [...main.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
    return { first: levels[0], h1s: levels.filter((l) => l === 1).length, skips, unnamed, imgs };
  });
  expect(r.first).toBe(1);
  expect(r.h1s).toBe(1);
  expect(r.skips).toBe(0);
  expect(r.unnamed).toEqual([]);
  expect(r.imgs).toBe(0);
});
