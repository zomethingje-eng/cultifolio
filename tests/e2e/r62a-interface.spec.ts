/**
 * Round sixty-two, agent A: the interface, Today and select mode, end to end (triage decisions 8, and parts of 1 and 2).
 *
 * Adopted from docs/review-61/tests/: a11y-perf--round61.spec.ts 1 to 6 and 8, 9 (7 is the species page's photo strip,
 * another agent's file) and grower--r61rev.spec.ts 1 and 3 (2 is the import's), each asserting the fixed behaviour. The
 * rest are this round's own: Today when the species sheets refuse or hang, Escape in select mode, a Move that empties a
 * filtered list, the toast's repeated sentence and its forced-colours fold, the tab bar at 320 px with 200% text, a
 * pruned done row, and the frost line's "use my location".
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { inject as sharedInject, type Row } from './helpers/inject';
import { framesSettled } from './helpers/settled';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 });
}
/** The shared seed helper, with this file's default wall and writer (round sixty-two; the harness's one write contract). */
async function inject(page: Page, rows: Row[], wall = Date.now() - 86_400_000, writer = 'r62aaaaaaaaaaaaa') {
  await sharedInject(page, rows, wall, writer);
}
const dayAgo = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** n plants on one place, each watered a month ago (so due); `at` names the place (id, name). */
function plants(n: number, at: [string, string] = ['gh', 'Greenhouse'], from = 1, taxon?: string): Row[] {
  const rows: Row[] = [['location', at[0], 'name', at[1]], ['location', at[0], 'type', 'greenhouse']];
  for (let i = from; i < from + n; i++) {
    const id = `ap${i}`;
    rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', taxon ?? (i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis')], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'locationId', at[0]]);
    rows.push(['event', `w${id}`, 'acc', id], ['event', `w${id}`, 'd', dayAgo(30)], ['event', `w${id}`, 't', 'water'], ['event', `w${id}`, 'note', null]);
  }
  return rows;
}
const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); });
async function seeded(page: Page, rows: Row[], path = '/plants') {
  await page.goto('/plants'); await ready(page);
  await inject(page, rows);
  await page.goto(path); await ready(page);
}
/**
 * A Chromium whose profile sets the text size (32 px is 200%), in a profile directory removed afterwards. The installed
 * Chrome first, when there is one, since a bundled Chromium may not read the profile's text size; and the preference is
 * checked before the test goes on (set through the DevTools protocol when the profile was not read): a browser that took
 * neither says nothing about the layout at that size, and the test is skipped with the reason rather than passed (round sixty-two; the verification review's triage-outside 5, B14).
 */
async function withTextSize<T>(baseURL: string | undefined, size: { width: number; height: number }, px: number, run: (page: Page, ctx: BrowserContext) => Promise<T>): Promise<T> {
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-r62a-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: px, default_fixed_font_size: Math.round(px * 0.8125) } } }));
  const opts = { baseURL, locale: 'en-GB', viewport: size, isMobile: true, hasTouch: true, serviceWorkers: 'block' as const };
  const ctx = await chromium.launchPersistentContext(dir, { ...opts, channel: 'chrome' }).catch(() => chromium.launchPersistentContext(dir, { ...opts, ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) }));
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(quiet);
    await page.goto('/about/how');
    const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    let text = await size();
    // A browser that did not read the profile is given the same setting through the DevTools protocol, which is what the
    // profile's text size sets; it lasts for the page's later navigations. Skipped only when neither took.
    if (text !== `${px}px`) {
      const cdp = await ctx.newCDPSession(page).catch(() => null);
      await cdp?.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: Math.round(px * 0.8125) } }).catch(() => undefined);
      await page.reload();
      text = await size();
    }
    test.skip(text !== `${px}px`, `preference not applied by this browser (its text is ${text}, not ${px}px)`);
    return await run(page, ctx);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ---- Today when the species sheets do not answer (decision 2; grower 1, a11y 2, A6) ---- */

const NOT_CHECKED = 'the species sheets did not answer. Every plant past its rhythm is listed';
for (const how of ['aborted', 'answering 503'] as const) {
  test(`r62a sheets: Today says the resting months were not checked when /api/sheets is ${how}, and "Check again" asks again`, async ({ page }) => {
    test.setTimeout(90_000);
    // One species, so one bucket: `sheetsFor` lets go of one failed bucket a call (agent A's report, "Needs from others").
    await seeded(page, plants(4, ['gh', 'Greenhouse'], 1, 'Copiapoa cinerea'));
    let asked = 0;
    let refuse = true;
    await page.route(/\/api\/sheets/, (r) => { asked++; if (!refuse) return r.continue(); return how === 'aborted' ? r.abort('internetdisconnected') : r.fulfill({ status: 503, body: 'busy' }); });
    await page.goto('/today'); await ready(page);
    const stop = page.locator('li.stop', { hasText: 'Greenhouse' });
    await expect(stop).toBeVisible({ timeout: 30_000 });
    // One line on the stop, with the stops, so nothing moves after them; the plants are all listed, with the Water button.
    await expect(stop.locator('.restnc')).toHaveCount(1);
    await expect(stop.locator('.restnc')).toContainText('Resting months not checked');
    await expect(stop.locator('.restnc')).toContainText(NOT_CHECKED);
    await expect(stop.getByRole('button', { name: 'Water 4 here' })).toBeVisible();
    const before = asked;
    expect(before).toBeGreaterThan(0);
    refuse = false;
    await stop.locator('.restnc').getByRole('button', { name: 'Check again' }).click();
    await expect(stop.locator('.restnc')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('#water')).not.toContainText('not checked');
    expect(asked).toBeGreaterThan(before); // asked again: the failed species were not marked asked
  });
}

test('r62a sheets: a sheets request still running after five seconds says so, and one that never answers is "not checked"', async ({ page }) => {
  test.setTimeout(90_000);
  await seeded(page, plants(2));
  await page.route(/\/api\/sheets/, () => { /* never answered */ });
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#water')).toContainText('Reading the species sheets…');
  await expect(page.locator('#water')).toContainText('Still reading the species sheets…', { timeout: 8_000 });
  await expect(page.locator('li.stop .restnc')).toContainText(NOT_CHECKED, { timeout: 30_000 });
});

test('r62a sheets (grower 3): the front page\'s line says the resting months were not checked', async ({ page }) => {
  await seeded(page, plants(2));
  await page.route(/\/api\/sheets/, (r) => r.abort('internetdisconnected'));
  await page.goto('/'); await ready(page);
  await expect(page.locator('.today .line.withact', { hasText: 'past their' })).toContainText('resting months not checked: the species sheets did not answer', { timeout: 30_000 });
});

/* ---- select mode (grower 4 and 10, a11y 1 and 3, A40) ---- */

test('r62a grower 4: "Select these" followed inside the app opens My plants in select mode', async ({ page }) => {
  await seeded(page, [...plants(2, ['b1', 'Bench 1']), ...plants(1, ['b2', 'Bench 2'], 3)], '/places/b1');
  await page.locator('#select-these').click(); // in the app, as a grower taps it
  await expect(page).toHaveURL(/\/plants\?place=b1/);
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
  await expect(page.getByRole('button', { name: 'Tick all 2' })).toBeVisible();
});

/** Tab through select mode's tick boxes; returns the ones whose row was entirely covered when focused. */
async function hiddenTicks(page: Page): Promise<string[]> {
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').focus(); await page.keyboard.press('Enter');
  await page.locator('.selrow').first().waitFor();
  const hidden: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement; if (!el.matches('.selrow input')) return null;
      const b = el.closest('label')!.getBoundingClientRect();
      const pts = [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4], [b.left + b.width / 2, b.top + b.height / 2]];
      const seen = pts.some(([x, y]) => { if (y < 0 || y >= innerHeight) return false; const h = document.elementFromPoint(x, y); return !!h && !!el.closest('label')!.contains(h); });
      return seen ? '' : el.closest('label')!.textContent!.trim().slice(0, 9);
    });
    if (r) hidden.push(r);
  }
  return hidden;
}

test('r62a a11y-perf 61-1: select mode at 390 x 844: no tick box reached by Tab is entirely under the select bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seeded(page, plants(12));
  expect(await page.locator('#main').count()).toBe(1);
  expect(await hiddenTicks(page)).toEqual([]);
  await expect(page.locator('.selbar')).toHaveAttribute('data-cover', 'bottom');
});

test('r62a a11y-perf 61-2: select mode at 390 x 844 with 200% text: no tick box reached by Tab is entirely under the bars', async ({ baseURL }) => {
  test.setTimeout(180_000);
  await withTextSize(baseURL, { width: 390, height: 844 }, 32, async (page) => {
    await seeded(page, plants(12));
    expect(await hiddenTicks(page)).toEqual([]);
  });
});

test('r62a a11y-perf 61-3: after Archive in select mode at 375 px, the focused Archive button is not under the toast', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seeded(page, plants(6));
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').nth(2).check();
  await page.locator('#sel-archive').click(); await page.locator('#sel-archive-yes').click();
  await page.locator('.toast .undo').waitFor();
  await expect(page.locator('#sel-archive')).toBeFocused();
  const covered = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const b = el.getBoundingClientRect(); const pts = [[b.left + 3, b.top + 3], [b.right - 3, b.top + 3], [b.left + 3, b.bottom - 3], [b.right - 3, b.bottom - 3], [b.left + b.width / 2, b.top + b.height / 2]]; return pts.some(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.toast')); });
  expect(covered).toBe(false);
});

test('r62a a11y-perf 61-9 (guard): keyboard only, Archive and its Undo put the plant back and keep focus on named controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seeded(page, plants(4));
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').focus(); await page.keyboard.press('Enter');
  await page.locator('.selrow input').nth(1).focus(); await page.keyboard.press('Space');
  await page.locator('#sel-archive').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#sel-archive-keep')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#sel-archive-yes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sel-archive')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('.toast .undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast [role=status]')).toContainText('Undone: 1 growing again');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await page.locator('#select-toggle').click();
  await expect(page.locator('a.accrow', { hasText: '2026-0003' })).toHaveCount(1);
});

test('r62a A40: Escape closes the Move panel and the Archive question, with focus back on their buttons', async ({ page }) => {
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-move').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#sel-loc')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sel-loc')).toHaveCount(0);
  await expect(page.locator('#sel-move')).toBeFocused();
  await page.locator('#sel-archive').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#sel-archive-keep')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sel-archive-yes')).toHaveCount(0);
  await expect(page.locator('#sel-archive')).toBeFocused();
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
});

test('r62a grower 10: a Move that empties a place-filtered list keeps select mode and its focus, and Undo brings them back', async ({ page }) => {
  await seeded(page, [...plants(2, ['b2', 'Bench 2']), ...plants(1, ['b3', 'Bench 3'], 3)], '/plants?place=b2&select=1');
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
  await page.getByRole('button', { name: 'Tick all 2' }).click();
  await page.locator('#sel-move').click();
  await page.locator('#sel-loc').selectOption({ label: 'Bench 3' });
  await page.locator('#sel-move-go').click();
  await expect(page.locator('.toast [role=status]')).toContainText('2 moved to Bench 3');
  await expect(page.locator('#main')).toContainText('No plants match.');
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(false);
  await expect(page.locator('#sel-move')).toBeFocused();
  await page.locator('.toast .undo').click();
  await expect(page.locator('.selrow')).toHaveCount(2);
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting');
});

test('r62a a11y 3: on a phone the toast clears the select bar', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seeded(page, plants(3));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click();
  await page.locator('.toast .undo').waitFor();
  const [toast, bar] = await page.evaluate(() => [document.querySelector('.toast')!.getBoundingClientRect().bottom, document.querySelector('.selbar')!.getBoundingClientRect().top]);
  expect(toast).toBeLessThanOrEqual(bar);
});

test('r62a P3: on a desktop the select bar sits at the window\'s foot, not a tab bar\'s height above it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await seeded(page, plants(20));
  await page.locator('#select-toggle').click();
  const gap = await page.locator('.selbar').evaluate((el) => innerHeight - el.getBoundingClientRect().bottom);
  expect(gap).toBeLessThan(30);
});

/* ---- Today (a11y 5, A37, A40) ---- */

test('r62a a11y-perf 61-4: Today\'s "Show N more" moves focus to the first chip it draws', async ({ page }) => {
  test.setTimeout(120_000);
  await seeded(page, plants(60, ['gh', 'Greenhouse'], 1, 'Haworthia cooperi'), '/today');
  const more = page.locator('.morechips').first();
  await more.waitFor({ timeout: 60_000 });
  await more.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#w-ap51')).toBeFocused();
});

test('r62a A40: Today\'s done row, pruned while focus is on its Undo, leaves focus on the stop\'s heading, or the section\'s', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seeded(page, plants(3, ['gh', 'Greenhouse'], 1, 'Haworthia cooperi'), '/today');
  const stop = page.locator('li.stop', { hasText: 'Greenhouse' });
  await stop.locator('#w-ap3').uncheck({ timeout: 30_000 }); // one left to water: the stop stays when its done row goes
  await stop.getByRole('button', { name: 'Water 2 of 3 here' }).click();
  await expect(stop.locator('.row.done button')).toBeFocused();
  await page.clock.fastForward('11:00');
  await expect(stop.locator('.row.done')).toHaveCount(0);
  await expect(stop.locator('h3')).toBeFocused();
  // Now the last plant: its done row is the stop's only content, and both go together.
  await stop.locator('#w-ap3').check();
  await stop.getByRole('button', { name: 'Water 1 here' }).click();
  await expect(page.locator('.row.done button')).toBeFocused();
  await page.clock.fastForward('11:00');
  await expect(page.locator('.row.done')).toHaveCount(0);
  expect(await page.evaluate(() => !!document.activeElement?.matches('#water-h, li.stop h3'))).toBe(true);
});

test('r62a a11y P3: Today\'s done-row chips wrap at 320 px with 200% text; nothing scrolls sideways', async ({ baseURL }) => {
  test.setTimeout(150_000);
  await withTextSize(baseURL, { width: 320, height: 700 }, 32, async (page) => {
    await seeded(page, plants(2, ['gh', 'Greenhouse'], 1, 'Conophytum minimum'), '/today');
    await page.locator('li.stop').getByRole('button', { name: /^Water 2 here/ }).click({ timeout: 30_000 });
    await expect(page.locator('.row.done')).toBeVisible();
    const [s, c] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(s).toBeLessThanOrEqual(c);
  });
});

test('r62a A40: on a phone nothing stands empty above "By place"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seeded(page, plants(2), '/today');
  await page.locator('li.stop').first().waitFor({ timeout: 30_000 });
  const gap = await page.evaluate(() => {
    const h = document.querySelector('#water .secrule')!.getBoundingClientRect().top;
    const above = [...document.querySelectorAll('#main > .page > *')].filter((e) => e.compareDocumentPosition(document.getElementById('water')!) & Node.DOCUMENT_POSITION_FOLLOWING).map((e) => e.getBoundingClientRect().bottom);
    return h - Math.max(...above);
  });
  expect(gap).toBeLessThan(40);
});

test('r62a grower: in the sample, Today\'s frost line offers "use my location"', async ({ page }) => {
  await seeded(page, plants(2), '/today');
  await expect(page.locator('#frost')).toContainText('No site set');
  await expect(page.locator('#frost').getByRole('button', { name: 'Use my location', exact: true })).toBeVisible();
});

/* ---- the toast (A38, A40) ---- */

test('r62a A38: a sentence said twice is announced twice (the live region empties, then says it again)', async ({ page }) => {
  await seeded(page, plants(2));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click();
  await expect(page.locator('.toast [role=status]')).toContainText('1 watered.');
  await page.evaluate(() => { const s = document.querySelector('.toastregion [role=status]')!; (window as unknown as { __said: string[] }).__said = []; new MutationObserver(() => (window as unknown as { __said: string[] }).__said.push(s.textContent ?? '')).observe(s, { childList: true, characterData: true, subtree: true }); });
  await page.locator('#sel-water').click();
  await expect(page.locator('.toast [role=status]')).toHaveText('Already recorded as watered today.');
  await page.locator('#sel-water').click();
  await page.waitForTimeout(300);
  const said = await page.evaluate(() => (window as unknown as { __said: string[] }).__said);
  expect(said.filter((t) => t === 'Already recorded as watered today.').length).toBe(2);
  await expect(page.locator('.toast [role=status]')).toHaveText('Already recorded as watered today.');
});

test('r62a A40: in forced colours the toast is drawn whole from its first frame (no fade over the select bar)', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, forcedColors: 'active', locale: 'en-GB' });
  await ctx.addInitScript(quiet);
  const page = await ctx.newPage();
  await seeded(page, plants(2));
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click();
  const s = await page.evaluate(() => { const t = getComputedStyle(document.querySelector('.toast')!); return { anim: t.animationName, opacity: t.opacity }; });
  expect(s.anim).toBe('none');
  expect(s.opacity).toBe('1');
  await ctx.close();
});

/* ---- the tab bar (A11) ---- */

/**
 * The grower's five tabs drawn and measured: they were counted before `html[data-grower]` swapped in the grower's set, and
 * the test failed 2 of 6 repeats with four (round sixty-two; the verification review's triage-outside 5). Then the web
 * font and two frames, for the bar's own fit to have run.
 */
async function growerTabs(page: Page) {
  await page.locator('html[data-grower]').waitFor({ state: 'attached', timeout: 30_000 });
  await expect(page.locator('#tabbar a:visible')).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
}
async function tabWords(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#tabbar a')].filter((a) => a.offsetParent).map((a) => {
    const s = a.querySelector('span')!;
    const shown = s.getClientRects().length > 0 && s.getBoundingClientRect().width > 2;
    // Each line the label is drawn in: a word broken across two lines has a line that starts mid-word.
    const r = document.createRange(); const lines = new Set<number>(); const breaks: string[] = [];
    const text = s.textContent ?? '';
    let lastTop: number | null = null;
    for (let i = 0; i < text.length && shown; i++) {
      r.setStart(s.firstChild!, i); r.setEnd(s.firstChild!, i + 1);
      const top = Math.round(r.getBoundingClientRect().top);
      if (lastTop !== null && top > lastTop + 2 && text[i - 1] !== ' ' && text[i] !== ' ') breaks.push(text.slice(0, i) + '/' + text.slice(i));
      lines.add(top); lastTop = top;
    }
    return { name: (a.textContent ?? '').trim(), shown, breaks, icon: !!a.querySelector('svg') && a.querySelector('svg')!.getBoundingClientRect().width > 0, overflow: s.scrollWidth > s.clientWidth + 1 };
  }));
}

test('r62a A11: at 320 px with 200% text no tab label breaks inside a word; when one would not fit, the tabs are icons named by their labels', async ({ baseURL }) => {
  test.setTimeout(120_000);
  await withTextSize(baseURL, { width: 320, height: 700 }, 32, async (page) => {
    await seeded(page, plants(1), '/plants');
    await growerTabs(page);
    const tabs = await tabWords(page);
    expect(tabs.length).toBe(5);
    for (const t of tabs) {
      expect(t.breaks, t.name).toEqual([]);
      expect(t.icon, t.name).toBe(true);
      if (t.shown) expect(t.overflow, t.name).toBe(false);
    }
    // Labels too long for their column: the bar shows icons, each tab still named by its label.
    expect(tabs.some((t) => !t.shown)).toBe(true);
    await expect(page.locator('#tabbar').getByRole('link', { name: 'Propagation' })).toBeAttached();
    await expect(page.locator('#tabbar').getByRole('link', { name: 'My plants' })).toBeAttached();
  });
});

test('r62a A11: at 390 px with 100% text every tab shows its label whole, beside its icon', async ({ browser, baseURL }) => {
  test.setTimeout(90_000); // a fresh context on a machine shared by seven agents: one repeat of six ran out at 30 s opening its page
  // A phone: its scroll bar is drawn over the page, so the bar has the whole 390 px.
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
  await ctx.addInitScript(quiet);
  const page = await ctx.newPage();
  await seeded(page, plants(1), '/plants');
  await growerTabs(page);
  const tabs = await tabWords(page);
  expect(tabs.length).toBe(5);
  for (const t of tabs) { expect(t.shown, t.name).toBe(true); expect(t.breaks, t.name).toEqual([]); expect(t.overflow, t.name).toBe(false); expect(t.icon, t.name).toBe(true); }
  await ctx.close();
});

/* ---- the front page while a grower's collection opens (a11y 4) ---- */

test('r62a a11y-perf 61-5: a returning grower\'s front page at 1280 shifts by less than 0.1 while it opens, and the visitor\'s head is never shown', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seeded(page, plants(8));
  await page.locator('a.accrow').first().waitFor();
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __sawHead: boolean };
    w.__cls = 0; w.__sawHead = false;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    const look = () => { const el = document.querySelector('#welcome, .headwrap'); if (el && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0) w.__sawHead = true; if (!document.documentElement.dataset.ready) requestAnimationFrame(look); };
    requestAnimationFrame(look);
  });
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Settled by the page's own signs, not a fixed pause (round sixty-two, at the merge; the words review's 24): the grower's
  // rows drawn, then fonts, two frames and a task.
  await page.goto('/'); await ready(page); await page.locator('a.accrow, a.tile').first().waitFor(); await framesSettled(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
  expect(await page.evaluate(() => (window as unknown as { __sawHead: boolean }).__sawHead)).toBe(false);
});

test('r62a a11y-perf 61-8 (guard): the toast\'s live region is in the accessibility tree, empty, before any toast', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const region = page.locator('.toastregion [role=status]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText('');
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 }) as { root: { nodeId: number } };
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.toastregion [role=status]' }) as { nodeId: number };
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false }) as { nodes: Array<{ ignored: boolean; role?: { value: string } }> };
  expect(nodes[0].ignored).toBe(false);
  expect(nodes[0].role?.value).toBe('status');
});

/* ---- P3: the sheet download is loaded when asked for (a11y-perf 9) ---- */

test('r62a P3: /plants does not load the backup module until the menu\'s Download is pressed', async ({ page }) => {
  await seeded(page, plants(2));
  const scripts: string[] = [];
  page.on('response', (r) => { if (r.url().endsWith('.js')) scripts.push(r.url()); });
  await page.goto('/plants'); await ready(page);
  await page.locator('a.accrow').first().waitFor();
  const before = scripts.length;
  const download = page.waitForEvent('download');
  await page.locator('#plants-menu-btn').click();
  await page.locator('#plants-sheet').click();
  await download;
  expect(scripts.length).toBeGreaterThan(before); // the module came on asking, not with the page
});
