/**
 * Round sixty-three, the harness (H2): the phone's own layout, on the phone projects only (`@phone-only`).
 *
 * Round sixty-two's first-screen claim held at 390 x 844 and failed on the owner's iPhone, whose Safari page is about
 * 390 x 664: no test ran at the size of the page a phone shows. These run at the project's own device (the `phone`
 * project: Chromium with the iPhone 13's page, touch and user agent; `phone-webkit`: Safari's engine with the same
 * profile, when PW_BROWSERS names webkit), and assert what a phone needs and a desktop run cannot see: nothing scrolls
 * sideways, the tab bar sits at the window's foot and opens a page at a tap, no text field is small enough for Safari to
 * zoom the page on focus, and select mode's bar is not under the tab bar. The first screen's catalogue row is agent V's
 * (tests/e2e/r63v-first-screen.spec.ts, tagged `@phone` so it runs here too).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';

const phone = { tag: '@phone-only' };

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
});

/** The page is wider than the window: the reader would scroll sideways. */
async function sideways(page: Page): Promise<string | null> {
  const [s, c] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  return s > c ? `${page.url()} ${s} > ${c}` : null;
}
/** The tab bar's box, and the window's height. */
async function tabbar(page: Page) {
  return page.evaluate(() => {
    const r = document.getElementById('tabbar')!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, win: innerHeight };
  });
}

type Row = [string, string, string, unknown];
function plants(n: number): Row[] {
  const rows: Row[] = [['location', 'gh', 'name', 'Greenhouse'], ['location', 'gh', 'type', 'greenhouse']];
  for (let i = 1; i <= n; i++) {
    const id = `ph${i}`;
    rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis'], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'locationId', 'gh']);
  }
  return rows;
}

test('r63h phone 1: the front page fits the phone: nothing scrolls sideways, the search is on the first screen, and the tab bar sits at the window\'s foot', phone, async ({ page }) => {
  await page.goto('/'); await ready(page);
  expect(await sideways(page)).toBeNull();
  const bar = await tabbar(page);
  expect(bar.height).toBeGreaterThan(0);
  expect(Math.abs(bar.bottom - bar.win)).toBeLessThanOrEqual(1);
  const search = await page.locator('input.searchbar').boundingBox();
  expect(search).not.toBeNull();
  expect(search!.y).toBeGreaterThanOrEqual(0);
  expect(search!.y + search!.height).toBeLessThanOrEqual(bar.top);
});

test('r63h phone 2: a tab tapped with a finger opens its page, and a species page fits the width with its name on the first screen', phone, async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.locator('#tabbar a[href="/plants"]').tap();
  await expect(page).toHaveURL(/\/plants$/);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  expect(await sideways(page)).toBeNull();
  const h1 = await page.locator('h1').first().boundingBox();
  const bar = await tabbar(page);
  expect(h1).not.toBeNull();
  expect(h1!.y + h1!.height).toBeLessThanOrEqual(bar.top);
});

test('r63h phone 3: no text field is under 16 px, so Safari never zooms the page when one is focused', phone, async ({ page }) => {
  // iOS zooms in on a focused field whose text is under 16 px and leaves the page zoomed (round forty-nine, 3; the rule is
  // in theme.css at the phone's width). A page's own scoped rule outranked it once (round fifty-one, 4): this reads the
  // fields every phone page draws, as drawn.
  // On a fresh device an empty Places opens the example collection by itself (round sixty-three, V2), and its load cut
  // this reading off ("Execution context was destroyed"): this reads the grower's own pages, as a tab that has seen the
  // example finds them (round sixty-three, the fix pass).
  await page.context().addInitScript(ownPages);
  const small: string[] = [];
  let read = 0;
  for (const path of ['/', '/plants', '/plants/new', '/places', '/propagation/new', '/labels', '/settings', '/compare']) {
    await page.goto(path); await ready(page);
    const fields = await page.evaluate((p) => [...document.querySelectorAll('input, textarea, select')]
      .filter((el) => !/^(checkbox|radio|range|file|hidden|button|submit|reset|color|image)$/.test((el as HTMLInputElement).type ?? ''))
      .filter((el) => (el as HTMLElement).getClientRects().length > 0)
      .map((el) => ({ px: parseFloat(getComputedStyle(el).fontSize), name: `${p} ${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${(el as HTMLInputElement).name ? `[name=${(el as HTMLInputElement).name}]` : ''}` })), path);
    read += fields.length;
    small.push(...fields.filter(({ px }) => px < 16).map(({ px, name }) => `${name} ${px}px`));
  }
  expect(read).toBeGreaterThan(10); // the pages drew their fields: an empty reading proves nothing
  expect(small).toEqual([]);
});

test('r63h phone 4: with plants, My plants and Today fit the width, and select mode\'s bar is clear of the tab bar', phone, async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(6), Date.now() - 86_400_000, 'r63hphone0000000');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('a.accrow')).toHaveCount(6);
  expect(await sideways(page)).toBeNull();
  await page.locator('#select-toggle').tap();
  await page.locator('.selrow input').first().tap();
  await expect(page.locator('.selbar')).toBeVisible();
  const sel = (await page.locator('.selbar').boundingBox())!;
  const bar = await tabbar(page);
  // Either the bar sits above the tab bar, or the tab bar has stepped away and the select bar is on the window.
  const tabShown = await page.locator('#tabbar').evaluate((el) => !el.classList.contains('away') && getComputedStyle(el).display !== 'none');
  expect(sel.y + sel.height).toBeLessThanOrEqual((tabShown ? bar.top : bar.win) + 1);
  expect(sel.y).toBeGreaterThanOrEqual(0);
  expect(await sideways(page)).toBeNull();
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#water')).not.toHaveClass(/waiting/, { timeout: 30_000 });
  expect(await sideways(page)).toBeNull();
});
