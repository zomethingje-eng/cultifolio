/**
 * Round sixty-one, agent A: accessibility, Today, select mode and the place filter, end to end (decisions 11 and 12).
 *
 * Adopted from docs/review-60/tests/: a11y-perf--round60.spec.ts (findings 1, 2, 5, 6 and 7; 4 and 9 are the sample bar
 * and the locked pages, agent G's and the lead's; the refusal pills of 7 are agent W's) and harness--also-today.spec.ts,
 * each now asserting the fixed behaviour. The rest are this round's own: the toast's way back, Move with no place chosen,
 * Archive's Undo, the place filter and select by place, focus after Today's "Water N here", the menu's Download and the
 * Wanted note, the select bar at a short height, Today's chips paged at 50 and its photo count.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject as injectRows } from './helpers/inject';
import { framesSettled } from './helpers/settled';
import { textSize, textSizeHeld } from './helpers/text-size';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
type Row = [string, string, string, unknown];
/** The shared helper (./helpers/inject.ts) with this file's defaults: it writes the arrival order and moves the fold
 *  counter in the one transaction, so the second delete after a 500 ms pause that stood here is gone (round sixty-two; harness 2, A44). */
async function inject(page: Page, rows: Row[], wall = Date.now() - 86_400_000, writer = 'r61aaaaaaaaaaaaa') {
  await injectRows(page, rows, wall, writer);
}
const dayAgo = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** n plants on one place, each watered a month ago; `at` names the place (id, name). */
function plants(n: number, at: [string, string] = ['gh', 'Greenhouse'], from = 1, taxon?: string): Row[] {
  const rows: Row[] = [['location', at[0], 'name', at[1]], ['location', at[0], 'type', 'greenhouse']];
  const old = dayAgo(30);
  for (let i = from; i < from + n; i++) {
    const id = `ap${i}`;
    rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', taxon ?? (i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis')], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'locationId', at[0]]);
    rows.push(['event', `w${id}`, 'acc', id], ['event', `w${id}`, 'd', old], ['event', `w${id}`, 't', 'water'], ['event', `w${id}`, 'note', null]);
  }
  return rows;
}
/** Keep the one-time persistence toast and the backup nudge out of the way of the test's own toasts. */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
});
async function seeded(page: Page, rows: Row[], path = '/plants') {
  await page.goto('/plants'); await ready(page);
  await inject(page, rows);
  await page.goto(path); await ready(page);
}

test('r61a a11y-perf 2: Water in select mode keeps keyboard focus on a control, and Tab then reaches the toast\'s Undo', async ({ page }) => {
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast .undo')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused();
});

test('r61a a11y-perf 1: a toast with an action raised by a pointer is never a keyboard trap', async ({ page }) => {
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click(); // with a pointer
  await expect(page.locator('.toast .undo')).toBeVisible();
  await page.locator('.toast .undo').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.toast'))).toBe(false);
});

test('r61a 1b: a toast raised with focus on the page body lets Tab out of its last button, and its timer waits while focus is on it', async ({ page }) => {
  // The page's clock is Playwright's, so the 35 s hold and the toast's going are jumped over, not waited for in real
  // time (round sixty-two; the verification triage-self review, N10).
  await page.clock.install();
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.locator('#sel-water').dispatchEvent('click'); // the click without moving focus: the toast has no origin
  await expect(page.locator('.toast .undo')).toBeVisible();
  await expect(page.locator('.toast .skipback')).toHaveCount(0);
  await page.locator('.toast .undo').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.toast'))).toBe(false);
  // Focus parked on the Undo holds the timer for as long as it stays (the cap is the pointer's alone since round sixty-two;
  // the accessibility review, 9); once focus leaves, the toast goes, and focus does not fall to the body.
  await page.locator('.toast .undo').focus().catch(() => {});
  await page.clock.fastForward(35_000); // past the pointer's 30 s cap: focus alone holds it
  await expect(page.locator('.toast .undo')).toBeVisible();
  await expect(page.locator('.toast .undo')).toBeFocused();
  await page.keyboard.press('Tab');
  // Focus came to Undo from the page this time, so "Back to where you were" is offered after it: Tab past it too.
  if (await page.evaluate(() => !!document.activeElement?.closest('.toast'))) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.toast'))).toBe(false);
  await page.clock.fastForward(9_000); // what was left of its 8 s, and more
  await expect(page.locator('.toast')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
});

test('r61a a11y-perf 6: in forced colours the current tab is HighlightText on Highlight, and the toast has an edge', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, forcedColors: 'active', colorScheme: 'dark', locale: 'en-GB' });
  await ctx.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
  const page = await ctx.newPage();
  await seeded(page, plants(2));
  const c = await page.evaluate(() => {
    const a = document.querySelector('#tabbar a[aria-current="page"]')!;
    const probe = document.createElement('span'); probe.style.color = 'HighlightText'; document.body.appendChild(probe);
    const want = getComputedStyle(probe).color; probe.remove();
    return { got: getComputedStyle(a).color, want };
  });
  expect(c.got).toBe(c.want);
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click();
  await expect(page.locator('.toast')).toBeVisible();
  const edge = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.toast')!); return [s.borderTopStyle, parseFloat(s.borderTopWidth)]; });
  expect(edge[0]).toBe('solid');
  expect(edge[1]).toBeGreaterThan(0);
  await ctx.close();
});

test('r61a a11y-perf 5: Today with 300 plants does not shift as the collection opens (CLS under 0.1 at 4x CPU)', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(300));
  await page.goto('/plants'); await expect(page.locator('a.accrow').first()).toBeVisible({ timeout: 60_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto('/today'); await ready(page);
  // Every section Today holds until the collection and the sheets are read, by its own sign: the watering list no
  // longer waiting, the frost strip and the last section (#rest, with the calendar) drawn; then the frames settled,
  // not a fixed pause (round sixty-two; the round-sixty-one self-review's triage 6).
  await expect(page.locator('#water')).not.toHaveClass(/waiting/, { timeout: 60_000 });
  await expect(page.locator('#frost .froststrip, #frost .risk')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#rest #calendar')).toBeAttached({ timeout: 60_000 });
  await framesSettled(page);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
});

test('r61a a11y-perf 7: at 320 px with 200% text, the Wanted note form, Today\'s calendar button and the Move picker do not scroll sideways, and the sort is not clipped', async ({ baseURL }) => {
  test.setTimeout(120_000);
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-r61a-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
    await page.goto('/plants'); await ready(page);
    // The text size first: Windows' bundled Chromium does not read the profile, and this test passed there at 16 px (round sixty-three; harness H4).
    const text = await textSize(page, 32);
    test.skip(text !== '32px', `preference not applied by this browser (its text is ${text}, not 32px)`);
    await inject(page, [...plants(2), ['taxon', 'refusia-testii', 'name', 'Refusia testii'], ['taxon', 'refusia-testii', 'followed', true]]);
    const wide: string[] = [];
    const sideways = async (label: string) => { const [s, c] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (s > c) wide.push(`${label} ${s}>${c}`); };
    await page.goto('/plants'); await ready(page);
    await textSizeHeld(page, 32, '/plants'); // on every page measured, not the first alone (round sixty-three; R3 5)
    // The sort shows its whole option: the select is as wide as its words, or the row.
    const sort = await page.locator('#plants-sort').evaluate((el) => { const s = el as unknown as HTMLSelectElement; return { w: s.clientWidth, sw: s.scrollWidth, row: s.parentElement!.clientWidth }; });
    expect(sort.w).toBeGreaterThan(100);
    await page.locator('#wanted button.linkish').first().click();
    await sideways('Wanted form');
    await page.goto('/today'); await ready(page);
    await textSizeHeld(page, 32, '/today');
    await page.locator('#calendar summary').click();
    await sideways('calendar');
    await page.goto('/plants'); await ready(page);
    await textSizeHeld(page, 32, '/plants, to move');
    await page.locator('#select-toggle').click(); await page.locator('.selrow input').first().check(); await page.locator('#sel-move').click();
    await sideways('select: move');
    expect(wide).toEqual([]);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true }); // the profile made for this test, not one per run left in /tmp (round sixty-two; outside review A)
  }
});

test('r61a harness 3: a first flowering stays visible on Today when Today itself has no line to draw', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.locator('.quickbar .more').click();
  await page.locator('.quickbar').getByRole('button', { name: 'Flower', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Flowered' })).toHaveCount(1);
  await page.goto('/today');
  await ready(page);
  await expect(page.locator('#firsts')).toBeVisible();
  await expect(page.locator('#firsts')).toContainText('First flowers on');
  for (let i = 0; i < 5; i++) {
    const hide = page.locator('.today button', { hasText: 'Hide' });
    if (!(await hide.count())) break;
    await hide.first().click();
  }
  await expect(page.locator('.today')).toHaveCount(0);
  await expect(page.locator('#firsts')).toBeVisible();
  await expect(page.locator('#rest-h')).toBeVisible();
});

test('r61a 9: Move starts with no place chosen, focus goes to the picker and back to "Move to a place", and Tab reaches Undo', async ({ page }) => {
  await seeded(page, [...plants(2), ['location', 'b2', 'name', 'Bench 2'], ['location', 'b2', 'type', 'bench']]);
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-move').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sel-loc')).toBeFocused();
  expect(await page.locator('#sel-loc').inputValue()).toBe('');
  const go = page.locator('#sel-move-go');
  await expect(go).toHaveAttribute('aria-disabled', 'true');
  await go.focus();
  await page.keyboard.press('Enter'); // nothing chosen: nothing moves, and the reason is said
  await expect(page.locator('.selbar')).toContainText('Choose a place first');
  await expect(page.locator('.toast')).toBeHidden();
  await page.selectOption('#sel-loc', 'b2');
  await expect(go).not.toHaveAttribute('aria-disabled', 'true');
  await go.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('1 moved to Bench 2.');
  await expect(page.locator('#sel-move')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Undone: back where they were.');
  await expect(page.locator('#sel-move')).toBeFocused();
  // "No place" is a choice of its own
  await page.locator('#sel-move').click();
  await page.selectOption('#sel-loc', 'none');
  await page.locator('#sel-move-go').click();
  await expect(page.locator('.toast')).toContainText('1 moved to no place.');
});

test('r61a G8: Archive in select mode has an Undo that puts the plants back to growing and takes the lines away', async ({ page }) => {
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').nth(0).check();
  await page.locator('.selrow input').nth(1).check();
  await page.locator('#sel-archive').click();
  await page.locator('#sel-archive-yes').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('2 archived, and logged.');
  await expect(page.locator('.phead .fullcount')).toHaveText('1 growing');
  await expect(page.locator('#sel-archive')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Undone: 2 growing again, the archive lines removed.');
  await expect(page.locator('.phead .fullcount')).toHaveText('3 growing');
  await page.goto('/plants/2026-0001');
  await ready(page);
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(0);
});

test('r61a 12: a place filter by address, select mode from it, and a search that names a place lists that place only', async ({ page }) => {
  const rows: Row[] = [
    ...plants(2, ['gh', 'Greenhouse']),
    ['location', 'b1', 'name', 'Bench 1'], ['location', 'b1', 'type', 'bench'], ['location', 'b1', 'parentId', 'gh'],
    ['location', 'b2', 'name', 'Bench 2'], ['location', 'b2', 'type', 'bench'], ['location', 'b2', 'parentId', 'gh'],
    ...plants(3, ['b2x', 'Shelf'], 10).slice(2) // three plants first placed on an unnamed id, moved below
  ];
  for (const i of [10, 11, 12]) rows.push(['accession', `ap${i}`, 'locationId', i === 12 ? 'b1' : 'b2']);
  // one on Bench 1 whose number and notes carry a "2": a word search for "bench 2" finds it, the place does not
  rows.push(['accession', 'ap12', 'notes', 'from bench 2 last year']);
  await seeded(page, rows, '/plants?place=b2&select=1');
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
  await expect(page.locator('.selrow')).toHaveCount(2);
  await expect(page.locator('#plants-place')).toHaveValue('b2');
  await expect(page).toHaveURL(/\/plants\?place=b2$/);
  // the parent place lists what is inside it too
  await page.goto('/plants?place=gh'); await ready(page);
  await expect(page.locator('a.accrow')).toHaveCount(5);
  // a search that names a place lists that place, not every plant with "bench" and "2" somewhere
  await page.goto('/plants'); await ready(page);
  await page.fill('#plants-q', 'bench 2');
  await expect(page.locator('a.accrow')).toHaveCount(2);
  await expect(page.locator('#q-place')).toContainText('Greenhouse › Bench 2');
  await page.locator('#select-toggle').click();
  await page.getByRole('button', { name: 'Tick all 2' }).click();
  await expect(page.locator('.selhead')).toContainText('2 ticked');
  // and the words instead, when that is what was meant
  await page.locator('#q-words').click();
  await expect(page.locator('.selrow')).toHaveCount(3);
});

test('r61a a11y 2: after Today\'s "Water N here" focus is on the stop\'s Undo, not the page', async ({ page }) => {
  // Welwitschia only: the fixture's Copiapoa cinerea rests now by its sheet, and is listed apart
  await seeded(page, plants(2, ['gh', 'Greenhouse'], 1, 'Welwitschia mirabilis'), '/today');
  const stop = page.locator('#water .stop', { hasText: 'Greenhouse' });
  const btn = stop.getByRole('button', { name: 'Water 2 here' });
  await expect(btn).toHaveAttribute('aria-disabled', 'false');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toBeVisible();
  await expect(stop.locator('.row.done button')).toBeFocused();
});

test('r61a a11y 2: the menu\'s Download returns focus to the menu button, and Wanted Save to its Edit', async ({ page }) => {
  await seeded(page, [...plants(2), ['taxon', 'welwitschia-mirabilis-x', 'name', 'Lithops lesliei'], ['taxon', 'welwitschia-mirabilis-x', 'followed', true]]);
  await page.locator('#plants-menu-btn').click();
  const dl = page.waitForEvent('download');
  await page.locator('#plants-sheet').focus();
  await page.keyboard.press('Enter');
  await dl;
  await expect(page.locator('#plants-menu-btn')).toBeFocused();
  const add = page.locator('#wanted').getByRole('button', { name: 'Add a note for Lithops lesliei' });
  await expect(add).toHaveAttribute('aria-expanded', 'false');
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#wanted').getByLabel('Note', { exact: true }).fill('a seedling');
  await page.locator('#wanted').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#wanted').getByRole('button', { name: 'Edit the note for Lithops lesliei' })).toBeFocused();
});

test('r61a a11y-perf 8: under 480 px tall the select bar does not stick over the list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  expect(await page.locator('.selbar').evaluate((el) => getComputedStyle(el).position)).toBe('static');
});

test('r61a a11y-perf 15: a stop with more than 50 plants draws 50 chips and says how many more, and shows them on asking', async ({ page }) => {
  test.setTimeout(120_000);
  await seeded(page, plants(60, ['gh', 'Greenhouse'], 1, 'Welwitschia mirabilis'), '/today');
  const stop = page.locator('#water .stop', { hasText: 'Greenhouse' });
  await expect(stop.getByRole('button', { name: 'Water 60 here' })).toBeVisible({ timeout: 60_000 });
  await expect(stop.locator('.chip.tick')).toHaveCount(50);
  await stop.getByRole('button', { name: /^Show 10 more/ }).click();
  await expect(stop.locator('.chip.tick')).toHaveCount(60);
});

test('r61a G11: Today\'s photograph count and the list its line opens agree', async ({ page }) => {
  const rows = plants(3);
  rows.push(['accession', 'ap1', 'acquired', dayAgo(400)], ['accession', 'ap2', 'acquired', dayAgo(400)], ['accession', 'ap3', 'acquired', dayAgo(20)]);
  await seeded(page, rows, '/');
  const line = page.locator('.today .line', { hasText: 'without a photograph' });
  await expect(line).toContainText('2 of 3 plants');
  await line.click();
  await expect(page).toHaveURL(/\/plants\?show=nophoto$/);
  await expect(page.locator('a.accrow')).toHaveCount(2);
  await expect(page.locator('.chipbtn', { hasText: 'No photo in 12 months' })).toContainText('2');
});
