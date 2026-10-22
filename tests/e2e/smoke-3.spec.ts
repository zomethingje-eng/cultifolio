// smoke.spec.ts, the third part: the round after deploy: search, first screen, related, compare, card, today (round seventy-two: split into four files that run in parallel, each in order).
import { zipSync, strToU8 } from 'fflate';
import { test, expect } from '@playwright/test';
import { controlledBy } from './helpers/controlled';
import { inject, wipe } from './helpers/inject';
import { fromAddress } from './helpers/address';
import { allowWrites, writeWait, WEBKIT_MS_PER_REQUEST } from './helpers/pace';
import { traceSave, markSave } from './helpers/save-trace';
import { watchStorage, whileStoring } from './helpers/progress';
import { smokeSetup, ready, addPlant, localDay, year, more, syncRun, WEBKIT_OFFLINE } from './helpers/smoke';

smokeSetup();

/* ---------------------------------------------------------------- the round after deploy: search, first screen, related, compare, card, today */

test('search forgives a typing error, ranks the genus first, and the picker does the same', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // a value typed before hydration is dropped when the bound input hydrates
  await page.fill('.searchbar', 'copiapao');
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await page.fill('.searchbar', 'welwit mirab');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.fill('.searchbar', 'namibia');
  await expect(page.locator('.hitrow .nm', { hasText: 'Welwitschia' })).toBeVisible();
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapao cin');
  await expect(page.getByRole('option', { name: /Copiapoa cinerea/ })).toBeVisible();
});

test('the species page answers in the first screen and relates the species by genus and by climate', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('6.5');
  await expect(glance.locator('.card.cold')).toContainText('Record low 4.0 °C in 40 years'); // the figure says what it is (round sixty)
  await expect(glance.locator('.card:not(.season)', { hasText: 'Rain' })).toContainText('72');
  // related: the nearest habitat climate from the index, with the rule beside it
  await expect(page.locator('#s-related')).toBeVisible();
  await expect(page.locator('.relhead', { hasText: 'Similar habitat climate' })).toContainText('nearest by mean daily high, mean nightly low and rain, month by month');
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Copiapoa humilis' })).toHaveCount(2); // the one other Copiapoa, and the nearest climate: both strips
  await expect(page.locator('.relhead', { hasText: 'Other Copiapoa' })).toBeVisible();
  // a species without a derived climate is never "near", whatever the index says
  await page.goto('/species/copiapoa-humilis'); // its index entry points at Welwitschia (climate pending) as well as C. cinerea
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Copiapoa cinerea' })).toHaveCount(2);
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Welwitschia' })).toHaveCount(0);
});

test('compare: three species side by side, a refusal named in every empty cell, the tray remembered in this browser', async ({ page }) => {
  // Each page hydrated before its button is pressed: a press on the server's HTML has no handler (round sixty-four; in
  // the Firefox run the second press did nothing).
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('.tray')).toContainText('pick one more');
  await page.goto('/species/refusia-testii'); await ready(page);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.locator('.tray a', { hasText: 'Compare 2' }).click();
  await expect(page).toHaveURL(/\/compare\?s=copiapoa-cinerea,refusia-testii$/);
  await expect(page.locator('.head .cell')).toHaveCount(2);
  await expect(page.locator('.tray')).toHaveCount(0); // not on the compare page itself
  const refusia = page.locator('.row').nth(1).locator('.cell').nth(1);
  await expect(refusia).toContainText('not checked');
  await expect(refusia).not.toContainText('–');
  await page.goto('/compare');
  await expect(page.locator('.emptybox')).toContainText('Copiapoa cinerea, Refusia testii');
  await page.goto('/compare?s=copiapoa-cinerea,no-such-plant');
  await expect(page.locator('.notice')).toContainText('Not in the reference: no-such-plant');
});

test('the share card is a PNG with the figures and the link drawn in, and is offered only where there is a climate', async ({ page }) => {
  // Chromium on Windows offers the system share sheet for files, and the card went there instead of to a download the
  // test waited thirty seconds for (round fifty-nine; the second outside review's Windows run). The download path is
  // tested with no share; the share path below, with one that records what it was given.
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
  await page.goto('/species/refusia-testii');
  await expect(page.getByRole('button', { name: 'Share card' })).toHaveCount(0);
  await page.goto('/species/copiapoa-cinerea'); await ready(page); // hydrated: a press on the server's HTML has no handler (round sixty-four)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share card' }).click()]);
  expect(dl.suggestedFilename()).toBe('copiapoa-cinerea-climate.png');
  const path = await dl.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(20_000);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your downloads' }) /* the toast's live region is always in the page now, empty (round sixty) */).toContainText('Saved to your downloads');
  // Where the browser can share a file, the card goes to the share sheet, as a PNG under the same name
  await page.evaluate(() => {
    const w = window as unknown as { __shared?: { name: string; type: string; size: number } };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d: ShareData) => { const f = d.files![0]; w.__shared = { name: f.name, type: f.type, size: f.size }; }, configurable: true });
  });
  await page.getByRole('button', { name: 'Share card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Shared.' })).toContainText('Shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared?: { name: string; type: string; size: number } }).__shared);
  expect(shared).toMatchObject({ name: 'copiapoa-cinerea-climate.png', type: 'image/png' });
  expect(shared!.size).toBeGreaterThan(20_000);
});

test('a grower\'s home says what needs them: sowings in the tray and plants without a photograph, each a link', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  // acquired seven months ago: the photograph line counts records older than six months, not a plant filed today (round forty-nine, 3)
  const ago = new Date(); ago.setMonth(ago.getMonth() - 7);
  await page.fill('#f-date', `${ago.getFullYear()}-${String(ago.getMonth() + 1).padStart(2, '0')}-${String(ago.getDate()).padStart(2, '0')}`);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  const today = page.locator('.today');
  await expect(today.locator('.line', { hasText: 'without a photograph in the last twelve months' })).toBeVisible();
  await expect(today).toContainText('Frost watch needs a site');
  await today.locator('.line', { hasText: 'without a photograph' }).click();
  await expect(page).toHaveURL(/\/plants\?show=nophoto$/);
  // one plant: the list is the plant, with no chips until there are two to tell apart (round fifty-eight)
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.locator('.chipbtn')).toHaveCount(0);
  // a plant last watered a month ago, by its log: Today says so, in the words of the plants list's Due chip (round twenty-four, 11)
  await expect(today).toHaveCount(0);
  await page.locator('.accrow').first().click();
  await page.locator('.quickbar .btn', { hasText: /^Record…$/ }).click(); // a dated watering goes through Log; Water is one tap for today (round forty-nine, 3)
  await page.selectOption('#ev-type', 'water');
  // exactly twenty-one days: the default watering rhythm's boundary, which the list and Today both include (round twenty-five, 2; round fifty-eight)
  const d = new Date(); d.setDate(d.getDate() - 21);
  const threeWeeks = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.fill('#ev-date', threeWeeks);
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible(); // the write is on screen before the page is left (round twenty-five, 3)
  await expect(page.locator('.card', { hasText: 'Since watered' })).toContainText('21');
  // a fresh load, from the vault, on both surfaces: the row, the chip and Today read the one figure
  await page.goto('/plants');
  await expect(page.locator('.accrow .fig', { hasText: 'watered 21 d ago' })).toBeVisible();
  await expect(page.locator('.accrow .fig.due')).toHaveCount(1);
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('.today .line', { hasText: '1 of 1 plants past their watering rhythm' })).toBeVisible(); // watered once, 21 days ago: overdue, not "no watering recorded" (round fifty-three, 3)
  await page.locator('.today .line', { hasText: 'past their watering rhythm' }).click();
  await expect(page).toHaveURL(/\/today#water$/);
  await expect(page.locator('#water .stop .row.warn a, #water .stop .row.resting a')).toHaveCount(1); // a Copiapoa in October is in its habitat's dry season by the sheet: its own row (round fifty-four, 4)
  await expect(page.locator('#water .stop h3')).toContainText('No space');
  await page.goto('/plants?show=due');
  await expect(page.locator('.accrow')).toHaveCount(1);
  // a future-dated line is refused with a sentence and never becomes the last watering (round twenty-five, 1)
  await page.locator('.accrow').first().click();
  await page.locator('.quickbar .btn', { hasText: /^Record…$/ }).click();
  await page.selectOption('#ev-type', 'water');
  await page.fill('#ev-date', '2099-01-01');
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('#ev-bad')).toContainText('2099-01-01 is in the future');
  await expect(page.locator('.tlrow', { hasText: '2099-01-01' })).toHaveCount(0);
});

test('the install bar waits for a second day, and stays away for thirty days once dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.install')).toHaveCount(0);
  await page.goto('/');
  // two loads in one sitting are one visit: a visit is a day
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.visits'))).toBe('1');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toHaveCount(0);
  // the next day
  await page.evaluate(() => localStorage.setItem('cultifolio.lastVisit', '2000-01-01'));
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.visits'))).toBe('2');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toBeVisible();
  await page.locator('.install button', { hasText: 'Not now' }).click();
  await expect(page.locator('.install')).toHaveCount(0);
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toHaveCount(0);
});

test('settings: units switch every figure and sentence, survive a reload through the cookie, and a species figure flips them too', async ({ page }) => {
  // an en-US browser with no cookie is Fahrenheit from the first byte; this British one is metric
  const us = await page.request.get('/species/copiapoa-cinerea', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
  expect(await us.text()).toContain('43.7<span class="u">°F');
  await page.goto('/species/copiapoa-cinerea');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('.glance .card', { hasText: 'Cold floor' })).toContainText('6.5');
  await page.locator('.glance .useg button', { hasText: '°F' }).click();
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('43.7');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('°F');
  await expect(glance.locator('.card.season')).not.toContainText('°C');
  await expect(glance.locator('.card:not(.season)', { hasText: 'Rain' })).toContainText('2.8');
  await expect(page.locator('.climo .panel').first()).toHaveText('°F · day and night');
  // the cookie carries it: a fresh load is Fahrenheit from the server, no flash
  const html = await (await page.request.get('/species/copiapoa-cinerea')).text();
  expect(html).toContain('43.7');
  expect(html).not.toMatch(/6\.5<span class="u">°C/);
  await page.goto('/settings');
  await ready(page);
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '°C and mm' }).click();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.glance .card', { hasText: 'Cold floor' })).toContainText('6.5');
});

test('settings: numbering is previewed and saved as the vault setting; appearance is applied at once', async ({ page }) => {
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /Prefix/ }).click();
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf');
  await expect(page.locator('.accno')).toHaveText('JF-0001');
  await page.getByRole('button', { name: 'Save numbering', exact: true }).click();
  await expect(page.getByText(/the next plant is JF-0001/)).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/JF-0001$/);
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: 'Dark' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByRole('button', { name: 'Follow the system' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test('the species page reads in reference order: the facts and the figures, then the quoted summary and the genus, then the cards closed to one line each', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // The figures come before the encyclopedia's paragraph since round forty: what is derived here is what the page is for.
  const order = await page.locator('h2.sec').allInnerTexts();
  expect(order.slice(0, 4).map((t) => t.replace(/\s+/g, ' ').toLowerCase())).toEqual(['at a glance', 'summary', 'about the genus · copiapoa', 'cultivation']);
  await expect(page.locator('#s-genus + .sumbody')).toContainText('Copiapoa is a genus of cactus');
  // the id card is the name, the common names and one line of family · origin · archetype; the facts grid sits at the foot since round fifty
  await expect(page.locator('.idcard .vern.meta')).toContainText('Cactaceae');
  await expect(page.locator('.idcard')).not.toContainText('Described by');
  await expect(page.locator('#s-facts + .facts .fact', { hasText: 'Described by' })).toContainText('(Phil.) Britton & Rose');
  await expect(page.locator('#s-facts + .facts .fact', { hasText: 'Wild records' })).toContainText('352 in range');
  // one primary action; the other verbs are a quieter row under it
  await expect(page.locator('.idcard .acts .btn.pri')).toHaveText('Add one to my plants');
  await expect(page.locator('.idcard .acts2 .btn').first()).toHaveText('Sow seed');
  // the cards: all closed at rest to their name since round sixty (the first screen's season card says the reading),
  // opened with a click and no JavaScript needed
  const cards = page.locator('details.acc');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).not.toHaveAttribute('open', '');
  await expect(cards.nth(1)).not.toHaveAttribute('open', '');
  await expect(cards.nth(1).locator('> summary')).toContainText('Rain');
  await cards.nth(1).locator('> summary').click();
  await expect(cards.nth(1)).toHaveAttribute('open', '');
  // the method sits behind one disclosure for the section, closed at rest
  const how = page.locator('details.howmade');
  await expect(how).toHaveCount(1);
  await expect(how).not.toHaveAttribute('open', '');
  await how.locator('summary').click();
  await expect(how.locator('.whyline').first()).toBeVisible();
  // a genus Wikipedia refused is "not checked", not silence
  await page.goto('/species/refusia-testii');
  await expect(page.locator('#s-genus + .notice')).toContainText('Not checked');
});

test('a visitor sees all five places in the top bar, the menu and, since round sixty-three, the phone\'s tab bar (round sixty; the visitor review; round sixty-three, V1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'My spaces', 'Propagation', 'Today']);
  // On a phone a visitor's tabs are the grower's five: an empty Today, My spaces or Propagation offers the example collection (round sixty-three, V1 and V2; a button since round seventy-four).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'My plants', 'My spaces', 'Propagation', 'Today']);
  await page.setViewportSize({ width: 1280, height: 800 });
  // a click that lands before hydration opens nothing: poll the button's own state rather than the first click
  await expect.poll(async () => { await page.getByRole('button', { name: 'Menu' }).click(); return page.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded'); }).toBe('true');
  await expect(page.locator('#menu').getByRole('link', { name: 'My spaces', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // the species page says what it is, once, under the name
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.derived')).toContainText('nothing about this species is written for its page by a person or by AI');
  await expect(page.locator('.pill', { hasText: 'open records' })).toHaveCount(0); // the fact strip says it
  await expect(page.locator('.facts')).toContainText('52 open');
  await expect(page.locator('h2.sec#s-glance')).toHaveCount(1); // the heading is there for the section bar and readers; the figures speak for themselves on screen
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/plants');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'My spaces', 'Propagation', 'Today']);
  // a grower's five, from the first plant, and on the next page load too (the hint is read before the first render)
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'My plants', 'My spaces', 'Propagation', 'Today']);
  await page.goto('/');
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'My plants', 'My spaces', 'Propagation', 'Today']);
});

test('the collection\'s pages need nothing from the server to open: a plant page loads offline, whatever the units', async ({ browser, baseURL, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_OFFLINE);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/plants'); // lets the service worker install and precache the shells
  await controlledBy(page); // in control before going offline: a fixed 15 s ran out in Firefox (round sixty-nine; R46-30)
  await ctx.addCookies([{ name: 'cultifolio.units', value: 'us', url: baseURL! }]);
  await ctx.setOffline(true);
  await page.goto(`/plants/${acc}`);
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible({ timeout: 15000 });
  // the settings shell was cached in metric; the units came from the cookie, not from the cached HTML or a server the page could not reach
  await page.goto('/settings');
  await ready(page);
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test('the batch page checks what it is told: no count above the seeds sown or below the last count, no loss or potting beyond the pot, no future dates; a wrong entry can be removed', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '10');
  await page.fill('#s-date', '2099-01-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-date-bad')).toContainText('in the future');
  await expect(page).toHaveURL(/\/propagation\/new/);
  await page.fill('#s-date', '2026-09-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S2026-\d{3}$/);
  // a count above what went in
  await page.fill('#g-n', '15');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.refuse').first()).toContainText('more than the 10 that went in');
  await page.fill('#g-n', '6');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.card', { hasText: 'Germinated' })).toContainText('6');
  // a count below the last count is not a count: losses are recorded as losses
  await page.fill('#g-n', '2');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.refuse').first()).toContainText('fewer than the 6 already counted');
  // a loss beyond the pot, then a real one
  await page.fill('#l-n', '30');
  await page.getByRole('button', { name: 'Record loss' }).click();
  await expect(page.locator('.refuse', { hasText: 'Only 6 in the pot to lose' })).toBeVisible();
  await page.fill('#l-n', '1');
  await page.getByRole('button', { name: 'Record loss' }).click();
  await expect(page.locator('.card', { hasText: 'Still in the pot' })).toContainText('5');
  // potting more than the pot holds is refused before any number is minted
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '50');
  await page.getByRole('button', { name: /^Pot up 50/ }).click();
  await expect(page.locator('.refuse', { hasText: 'Only 5 in the pot; each potted plant gets a number' })).toBeVisible();
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(0);
  await page.goBack();
  // a slip in the log can be taken out again
  const rows = page.locator('.tlrow');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);
  await rows.first().locator('.rm').click();
  await rows.first().locator('.rm.confirm').click();
  await expect(rows).toHaveCount(before - 1);
});

test('the front page offline asks for the catalogue once and offers a retry, never a loop', async ({ browser, browserName }) => {
  // Only Chromium lets a route see a service worker's own fetch (the config's worker network events): in Firefox the worker
  // fetched the bucket past the route, the server answered, and "not reached" could never be said. There the page's own
  // fetches are the whole test, without the worker (round sixty-four; the Firefox run).
  const withWorker = browserName === 'chromium';
  const ctx = await browser.newContext(withWorker ? {} : { serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  if (withWorker) await page.evaluate(() => navigator.serviceWorker.ready); // a collection page registers it (round seventy-three)
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // The reference unreachable: the route is on the context, so the worker's own fetch of the bucket fails too (worker network events are on in the config).
  let calls = 0;
  await ctx.route(/\/api\/(index|entries)/, (r) => { calls++; r.abort(); });
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('.tile .im.ph', { hasText: 'reference not reached' })).toBeVisible();
  await page.waitForTimeout(1500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(calls).toBeLessThanOrEqual(4); // the page's fetch and the worker's, once each: no loop
  await ctx.unroute(/\/api\/(index|entries)/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await ctx.close();
});

test('settings previews the next number from the numbers given, and an edited acquisition date follows into the log', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/plants/new?species=Copiapoa%20humilis&key=5384999'); await ready(page);
  await addPlant(page);
  await page.goto('/settings');
  await ready(page);
  await expect(page.locator('.accno')).toHaveText(/-0003$/);
  await page.goto(`/plants/${year()}-0001`);
  await more(page, 'Edit');
  await page.fill('#ed-date', '2024-03-07');
  await page.fill('#ed-from', 'A nursery');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Acquired' })).toContainText('2024-03-07');
  await expect(page.locator('.tlrow', { hasText: 'Acquired' })).toContainText('from A nursery');
});

test('keyboard: the menu keeps Tab inside and Escape returns focus; Enter in the species field never files a plant; the search opens its first match on Enter', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect.poll(async () => { await menu.focus(); await page.keyboard.press('Enter'); return menu.getAttribute('aria-expanded'); }).toBe('true'); // before hydration the key does nothing
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Species');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Source');
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Species');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Menu');
  // the search: Enter opens the first match
  await page.fill('.searchbar', 'copiapoa hum');
  await expect(page.locator('.hitrow').first()).toBeVisible();
  await page.locator('.searchbar').press('Enter');
  await expect(page).toHaveURL(/\/species\/copiapoa-humilis$/);
  // back keeps the search
  await page.goBack();
  await expect(page.locator('.searchbar')).toHaveValue('copiapoa hum');
  // Enter in a filled species field does nothing; Add files it
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.locator('#species-name').press('Enter');
  await expect(page).toHaveURL(/\/plants\/new/);
});

test('two tabs adding at once get two numbers, and each tab sees the other\'s plant (round seven, 1)', async ({ page, context }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  const other = await context.newPage();
  await other.goto('/plants/new?species=Copiapoa%20humilis&key=5384999'); await ready(other);
  await expect(page.locator('.accno').first()).toHaveText(`${year()}-0001`);
  await expect(other.locator('.accno').first()).toHaveText(`${year()}-0001`); // both tabs promise the same next number
  await Promise.all([page.getByRole('button', { name: /^Add/ }).click(), other.getByRole('button', { name: /^Add/ }).click()]);
  await expect(page).toHaveURL(new RegExp(`/plants/${year()}-000[12]$`));
  await expect(other).toHaveURL(new RegExp(`/plants/${year()}-000[12]$`));
  expect(page.url()).not.toBe(other.url()); // the vault, not the tab, hands out numbers
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(2); // the other tab's plant is here without a reload of the vault
  await expect(page.locator('.seccount').first()).toHaveText('2 growing'); // "N growing" alone: "plant numbers" beside it left growers asking why the two differ (round sixty; the grower review, 16)
  await other.close();
});

test('editing a plant to another species replaces its habitat figures and links its species page only when the reference has one (round seven, 4 and 9)', async ({ page }, testInfo) => {
  // Flaky in WebKit on the owner's PC (IND-8): this Save left the form open for ten seconds. The Save is recorded, and
  // the record attached if the test fails (helpers/save-trace.ts); r70p-save-moves.spec.ts holds the cause found here.
  await traceSave(page, testInfo);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No rainy season');
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Welwitschia mirabilis');
  await page.locator('#ed-name').blur();
  await markSave(page, 'click Save');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h1.sci')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).not.toContainText('No rainy season to read72 mm'); // the old species' figures are gone, not kept under the new name
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveAttribute('href', '/species/welwitschia-mirabilis');
  // a name the reference does not hold: no link to a 404
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Aloe polyphylla');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No species page');
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveCount(0);
});

test('a germination count that potted plants rest on cannot be removed; bottom heat outside a propagator\'s range is refused (round seven, 5 and 14)', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '20');
  await page.fill('#s-heat', '77');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-heat-bad')).toContainText('did you mean 77 °F');
  await page.fill('#s-heat', '25');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '5');
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  const countRow = page.locator('.tlrow', { hasText: 'Germination count' });
  await expect(countRow.locator('.x', { hasText: 'kept' })).toBeVisible();
  await expect(countRow.locator('.rm')).toHaveCount(0);
  await page.fill('#g-n', '8');
  await page.getByRole('button', { name: 'Record count' }).click();
  // with a later count of 8 the count of 5 is no longer load-bearing and can go
  await expect(page.locator('.tlrow', { hasText: 'Germination count 5' }).locator('.rm')).toHaveCount(1);
});

test('the one search box finds a plant by its number, and the cold floor is one figure everywhere it appears (round seven, 18 and 1)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // a value typed before hydration is dropped when the bound input hydrates
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.locator('.searchbar').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/plants/${year()}-0001$`));
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.glance .card.cold');
  await expect(glance).toContainText('6.5');
  await expect(page.locator('.cult', { hasText: /^Warmth and air/ }).first().locator('.body')).toContainText('Cold floor: 6.5 °C');
});

test('a link that pairs a species with another species\' key is corrected at the form, and the plant page shows the species named (round eleven, 2)', async ({ page }) => {
  // Copiapoa cinerea with Copiapoa humilis's key: the reference's own key for the name is kept, not the one in the link.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384999'); await ready(page);
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('The sheet'); // the habitat is read, by name
  await more(page, 'Edit');
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible(); // the record carries cinerea's key
  // The same at the sowing form; and a name below species rank keeps the key it was given (the reference has none for it).
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384999'); await ready(page);
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea%20subsp.%20test&key=777'); await ready(page);
  await expect(page.locator('.pill', { hasText: 'GBIF 777' })).toBeVisible();
});

test('a species page opened from the catalogue starts at its top, on a short screen too (round eleven)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 }); // the section tabs sit below the fold, where a scrollIntoView on them pulled the page down on arrival
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.grow', { hasText: 'Copiapoa' }).click();
  await page.locator('a.tile').first().click();
  await expect(page).toHaveURL(/\/species\//);
  // The page has drawn and gone quiet, so anything that would scroll it has run (round sixty; the harness review, 14: a fixed 600 ms).
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('the catalogue renders a window of rows and the letter index lands on its heading, by tap and by link (round seven, 23)', async ({ page }) => {
  await page.goto('/');
  const letters = await page.locator('nav.letters a').allInnerTexts();
  expect(letters.length).toBeGreaterThan(1);
  const last = letters[letters.length - 1];
  await page.locator('nav.letters a', { hasText: new RegExp(`^${last}$`) }).click();
  await expect(page).toHaveURL(new RegExp(`#l-${last}$`));
  // in view and not behind the sticky bars (the fixtures' page is too short to scroll a heading to the top; the corpus build was checked by hand at 120 px)
  const pos = await page.evaluate((l) => { const r = document.getElementById(`l-${l}`)!.getBoundingClientRect(); return { top: r.top, h: window.innerHeight, bar: document.querySelector('#topbar')!.getBoundingClientRect().bottom }; }, last);
  expect(pos.top).toBeGreaterThanOrEqual(pos.bar);
  expect(pos.top).toBeLessThan(pos.h);
  await page.goto('/about/how');
  await page.goto(`/#l-${letters[0]}`);
  await expect(page.locator(`#l-${letters[0]}`)).toBeVisible();
  await expect(page.locator('a.grow').first()).toBeVisible();
  // the "more" control only exists past the first window; the fixtures fit in one
  await expect(page.locator('.more')).toHaveCount(0);
});

test('two tabs whose clocks read the same millisecond still make two plants: each tab is its own writer (round eight, 1)', async ({ page, context }) => {
  // Both tabs' clocks stopped at one instant: every stamp either tab makes has the same wall time, so only the writer tag can tell them apart.
  const frozen = Date.parse('2026-09-25T16:30:00.000Z');
  await page.clock.setFixedTime(frozen); // Date.now() stands still; timers still run
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  const other = await context.newPage();
  await other.clock.setFixedTime(frozen);
  await other.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(other);
  await expect(page.locator('.accno').first()).toHaveText('2026-0001');
  await expect(other.locator('.accno').first()).toHaveText('2026-0001');
  await Promise.all([page.getByRole('button', { name: /^Add/ }).click(), other.getByRole('button', { name: /^Add/ }).click()]);
  await expect(page).toHaveURL(/\/plants\/2026-000[12]$/);
  await expect(other).toHaveURL(/\/plants\/2026-000[12]$/);
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(2); // both records exist: their stamps differ by writer, not by time
  await expect(page.locator('.accrow', { hasText: 'Copiapoa' })).toHaveCount(1);
  await expect(page.locator('.accrow', { hasText: 'Welwitschia' })).toHaveCount(1);
  await other.close();
});

test('no page address goes out as a referrer: the policy is on every document and every response (round sixteen, 9 and 15)', async ({ page }) => {
  // Playwright reports a request's headers as the page framed them, before the browser applies the referrer policy, so the
  // wire itself is not observable here; it was checked once with a logging proxy in front of the server (no Referer on any
  // font, API or data request). What is checked on every run: the policy is declared on the document and on every response.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  expect(await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute('content'))).toBe('no-referrer');
  for (const path of ['/plants', '/about/how', '/offline', '/api/corpus']) {
    const r = await page.request.get(path);
    expect(r.headers()['referrer-policy'], path).toBe('no-referrer');
    expect(r.headers()['x-frame-options'], path).toBe('DENY');
  }
});

test('the hemisphere cookie rides only on species and compare pages, never on sync or the API (round sixteen, 11)', async ({ page, baseURL }) => {
  await page.goto('/settings');
  await ready(page);
  await page.getByLabel('Latitude').fill('-33.9');
  await page.getByLabel('Longitude').fill('18.4');
  await page.locator('#site').locator('..').getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  const on = async (path: string) => { await page.goto(path); return page.evaluate(() => document.cookie); };
  expect(await on('/species/copiapoa-cinerea')).toContain('cultifolio.hemi=s');
  expect(await on('/compare')).toContain('cultifolio.hemi=s');
  expect(await on('/plants')).not.toContain('cultifolio.hemi');
  expect(await on('/sync')).not.toContain('cultifolio.hemi');
  // the cookies the browser would attach to an API or sync request: the units, never the hemisphere
  const origin = new URL(baseURL!).origin; // the server under test, on whatever port it was given (round sixty-one; docs/review-60/harness.md 18)
  const jar = await page.context().cookies([`${origin}/api/sync/log`, `${origin}/api/sheets`]);
  expect(jar.map((c) => c.name)).not.toContain('cultifolio.hemi');
  const species = await page.context().cookies([`${origin}/species/copiapoa-cinerea`]);
  expect(species.map((c) => c.name)).toContain('cultifolio.hemi');
});

// The service worker answers these requests itself once it controls the page, and only Chromium lets a route see a worker's own fetch (the config's worker network events): in Firefox the route never saw them and the real server answered. The test is about the pages' words, not the shell (round sixty-four; the Firefox run).
test.describe('a slow sheet, routed without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a place chosen on the add form while the reference is still answering is kept, not overwritten by the last-used default (round seventeen, A3)', async ({ page }) => {
  await page.goto('/places');
  for (const n of ['Greenhouse', 'Cold frame']) {
    await page.getByRole('button', { name: 'New space' }).click();
    await page.fill('#loc-name', n);
    await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.tree .row', { hasText: n })).toBeVisible();
  }
  // make Greenhouse the last-used place
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  const ghValue = await page.locator('#f-loc option', { hasText: 'Greenhouse' }).getAttribute('value');
  await page.selectOption('#f-loc', ghValue!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // the reference's answer is slow this time; the grower picks Cold frame before it lands
  await page.context().route(/\/api\/sheets/, async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
  const slow = page.waitForResponse(/\/api\/sheets/);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await expect(page.locator('#f-loc')).toHaveValue(ghValue!); // the default, at once
  const cfValue = await page.locator('#f-loc option', { hasText: 'Cold frame' }).getAttribute('value');
  await page.selectOption('#f-loc', cfValue!);
  // The reference's slow answer has landed and the page has drawn after it, rather than a fixed 2.2 s (round sixty; the harness review, 14).
  await slow;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#f-loc')).toHaveValue(cfValue!); // still the grower's choice after the reference answered
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('main')).toContainText('Cold frame');
});
});

test('a species page you grow six of does not scroll sideways on a phone (round seventeen, 11)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-count', '6');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants$/, { timeout: writeWait(5_000, 400) }); // six plants, about 370 requests: some 7 s in Safari's engine (helpers/pace.ts)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/species/copiapoa-cinerea');
  // three numbers and a count: the rest are one tap away on My plants (round fifty, 3)
  await expect(page.locator('.mine .accno')).toHaveCount(3);
  await expect(page.locator('.mine')).toContainText('+3');
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, mine: document.querySelector('.mine')!.scrollWidth }));
  expect(w.doc).toBeLessThanOrEqual(390);
  expect(w.mine).toBeLessThanOrEqual(390);
});

test('round twenty-three: a name the reference does not hold is added on the second Add and marked; an edit to a hybrid renames and logs it; a removed place says where its plants went and their logs say so; a batch status change is logged', async ({ page }) => {
  // Some sixty steps over ten pages: Safari's engine on the PC ran out of 30 s at the last of them (round sixty-five; the
  // all-engines rerun), where Chromium here takes about 9.
  test.setTimeout(60_000);
  // The name service is not reachable here (no upstream), so a name outside the fixture corpus resolves to nothing: the
  // first Add arms the field and asks, the second keeps exactly what was typed (round twenty-three, 4).
  await page.goto('/plants/new'); await ready(page);
  // In Safari's engine the first Add left the field unarmed: pressed before the page had its handlers, or as the line the
  // name check writes under the field pushed the button down. Hydrated first, and the check's answer on screen (its pill)
  // before Add is pressed (round sixty-five; the all-engines rerun).
  await ready(page);
  await page.fill('#species-name', 'Notaplantia fakeus');
  await page.locator('#species-name').blur();
  // The check's answer is on screen before Add: its pill, or, when the name service did not answer (as here, with no
  // upstream), its sentence saying so, which comes without a pill (round sixty-five; the strict run, where waiting for the
  // pill alone failed two times in five). 15 s, as the import's name checks have.
  await expect(page.locator('.picker .pill.warn').or(page.getByRole('status').filter({ hasText: 'The name service did not answer' })).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('.picker .hint', { hasText: /press (?:Add|“Add[^”]*”) to keep exactly what you typed/ })).toBeVisible();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await expect(page.locator('h1.sci')).toContainText('Notaplantia fakeus');
  await expect(page.locator('#name-not-in-reference')).toHaveText('Name not in the reference');

  // Edited into a cross: filed under the genus, the parents kept, and the log says what it was called before (round twenty-three, 3)
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Notaplantia fakeus x N. altera');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h1.sci')).toContainText('Notaplantia');
  await expect(page.locator('h1.sci')).not.toContainText('fakeus');
  await expect(page.locator('.idcard .kind', { hasText: 'hybrid' })).toBeVisible();
  await expect(page.locator('.factgrid', { hasText: 'Parentage' })).toContainText('Notaplantia fakeus × Notaplantia altera');
  await expect(page.locator('.tlrow', { hasText: 'Renamed from Notaplantia fakeus to Notaplantia' })).toContainText('now a hybrid');

  // A place inside a place: removing the inner one moves its plant up, says so, and writes the move on the plant's log (round twenty-three, 2)
  await page.goto('/places');
  await ready(page);
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Porch');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Porch' })).toBeVisible();
  await page.getByRole('button', { name: 'New space' }).click();
  await expect(page.locator('#loc-kind')).toHaveValue(''); // the kind is chosen per place, never carried from the last one or defaulted (round twenty-three, 19; round twenty-six, 16)
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
  const porch = await page.locator('#loc-parent option', { hasText: 'Porch' }).getAttribute('value');
  await page.selectOption('#loc-parent', porch!);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible(); // the write is on screen before the page is left
  await page.goto(`/plants/${acc}`);
  await page.locator('.quickbar .btn', { hasText: /^Move$/ }).click();
  const frame = await page.locator('#mv-loc option', { hasText: 'Cold frame' }).getAttribute('value');
  await page.selectOption('#mv-loc', frame!);
  await page.locator('.evform .btn.pri', { hasText: 'Move' }).click();
  await expect(page.locator('.idcard')).toContainText('Cold frame');
  // The removal says where the plants went in a toast raised as the app's own navigation to /places begins, and a toast
  // goes at a navigation landing more than 600 ms after it was raised (toast.svelte.ts, onNavigate): with the navigation
  // held 800 ms the sentence below was gone (round seventy-three). What is tested is the sentence, not the time, so
  // Date.now() is held still from here; timers run.
  await page.clock.setFixedTime(Date.now());
  await page.goto(`/places/${frame}`);
  await page.getByRole('button', { name: 'Remove space' }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.locator('.toast')).toContainText('1 plant moved up to Porch');
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.idcard')).toContainText('Porch');
  await expect(page.locator('.tlrow', { hasText: 'Cold frame was removed' })).toBeVisible();

  // A batch marked failed: the log says so and the page says it happened (round twenty-three, 16)
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '6');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  await page.getByRole('button', { name: 'Mark failed' }).click();
  await page.getByRole('button', { name: 'Yes, mark failed' }).click(); // asks first (round forty-nine, 3)
  await expect(page.locator('.toast')).toContainText('Marked failed');
  await expect(page.locator('.tlrow', { hasText: 'Marked failed' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'failed' }).first()).toBeVisible();
  // the plants list keeps its query, chip and sort in the URL, matches every word, and searches notes (round twenty-five, 11)
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.fill('#acc-notes', 'looks etiolated on the porch');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.cult .body', { hasText: 'looks etiolated' })).toBeVisible();
  // a second plant: the sort menu shows from two plants on (round fifty-eight)
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(page);
  await addPlant(page);
  await page.goto('/plants');
  await page.fill('#plants-q', 'etiolated porch');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page).toHaveURL(/\/plants\?q=etiolated\+porch$/);
  await page.selectOption('#plants-sort', 'name');
  await expect(page).toHaveURL(/sort=name/);
  await page.locator('.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/plants\?q=etiolated\+porch&sort=name$/);
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.locator('#plants-q')).toHaveValue('etiolated porch');
  await expect(page.locator('#plants-sort')).toHaveValue('name');
});

test('round twenty-eight: a batch edit saves its medium and container, keeps the seed fields across a method switch, judges its date and count; the field number and the lot travel apart; Mark done asks while plants are in the pot', async ({ page }) => {
  await page.goto('/propagation/new'); await ready(page);
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '10');
  await page.fill('#s-from', 'Kakteen Haage');
  await page.fill('#s-fn', 'KK 1462');
  await page.fill('#s-ref', 'H-2026-77');
  await page.fill('#s-medium', 'pumice');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  const url = page.url();
  // the header: source, field number and lot, each set off with its separator (round twenty-eight, 14)
  await expect(page.locator('.idcard .vern').first()).toContainText('from Kakteen Haage · KK 1462 · lot H-2026-77 · seed provenance not stated');
  // no count yet is not 0 % (round twenty-eight, 3)
  await expect(page.locator('.cards .card', { hasText: 'Germinated' })).toContainText('–');
  await expect(page.locator('.cards .card', { hasText: 'Germinated' })).not.toContainText('0%');
  // edit: method to cuttings hides the seed fields but keeps them; medium and container are saved (round twenty-eight, 1 and 2)
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#se-method', 'cutting');
  await expect(page.locator('#se-fn')).toHaveCount(0);
  await page.fill('#se-medium', 'perlite');
  await page.fill('#se-container', '9 cm square');
  await page.getByRole('button', { name: 'Save' }).click();
  // The form closes when the write has landed; a reload before then cancels it (round fifty-nine: failed twice on a Windows run).
  await expect(page.locator('#se-method')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cards .card', { hasText: 'Struck' }).first()).toBeVisible();
  await expect(page.locator('.idcard .vern').first()).not.toContainText('KK 1462'); // hidden for cuttings, not gone
  await expect(page.getByText('perlite')).toBeVisible();
  await expect(page.getByText('9 cm square')).toBeVisible();
  // and back to seed: the seed fields are still there, the provenance is a seed one again
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#se-method', 'seed');
  await expect(page.locator('#se-fn')).toHaveValue('KK 1462');
  await expect(page.locator('#se-ref')).toHaveValue('H-2026-77');
  await expect(page.locator('#se-prov')).toHaveValue('unknown');
  // the edit form judges what it is told (round twenty-eight, 5): a start date in the future
  await page.fill('#se-date', '2099-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toContainText('2099-01-01 is in the future');
  await page.fill('#se-date', localDay(-10)); // sown ten days ago; the count below is today's
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toHaveCount(0);
  await expect(page.locator('.idcard .vern').first()).toContainText('KK 1462 · lot H-2026-77');
  // count 6, then the started count cannot go below it
  await page.fill('#g-n', '6');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('60%')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#se-count', '4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toContainText('4 started is fewer than the 6 already counted');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // a potting dated before the first count is refused (round twenty-eight, 6)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  const yesterday = localDay(-1); // the app's calendar is local; toISOString() is UTC and was a day ahead for four evening hours (round thirty, R1-3)
  await page.fill('#p-date', yesterday);
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('form', { has: page.locator('#p-n') })).toContainText('is before the first count that found anything up');
  await page.fill('#p-date', localDay(0));
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  // the potted plant carries the field number as its own and the lot as its reference (round twenty-eight, 4)
  await page.locator('.rows a.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.fnchip', { hasText: 'KK 1462' })).toBeVisible();
  await expect(page.locator('.fnchip', { hasText: 'H-2026-77' })).toHaveCount(0);
  await expect(page.getByText('H-2026-77')).toBeVisible();
  // Mark done with plants still in the pot asks first (round twenty-eight, 10)
  await page.goto(url);
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(page.locator('#done-ask')).toContainText('4 still in the pot');
  await expect(page.locator('.pill', { hasText: 'in progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep open' }).click();
  await expect(page.locator('.pill', { hasText: 'in progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done anyway' }).click();
  await expect(page.locator('.pill', { hasText: 'done' }).first()).toBeVisible();
});

/**
 * Round seventy-six: on the owner's PC, WebKit's second restore of the 400 plants never began. The page had been opened by
 * address after the wipe, the file chosen and its preview drawn, and the press on Merge left the buttons enabled: the press
 * landed while the page was still settling as its collection opened, and nothing ran (the trace's snapshots, before and
 * after the press). The page is now waited for, then its collection, and the press is checked to have begun the merge.
 */
async function mergeBackup(page: import('@playwright/test').Page) {
  await page.click('#bk-merge');
  const begun = () => page.evaluate(() => { const b = document.querySelector<HTMLButtonElement>('#bk-merge'); return !b || b.disabled || !!document.querySelector('#bk-done'); });
  if (!(await expect.poll(begun, { timeout: 3000 }).toBe(true).then(() => true, () => false))) await page.click('#bk-merge');
}
test('round twenty-eight: a backup of four hundred plants with long notes is written and read under the site\'s CSP, and a plant whose stored date is in the future can still be edited', async ({ page }, testInfo) => {
  // Flaky in WebKit on the owner's PC (IND-8): the price edit's Save at the end left the form open for ten seconds. The
  // Save is recorded, and the record attached if the test fails (helpers/save-trace.ts).
  await traceSave(page, testInfo);
  // The restores below are waited for while the database keeps answering, not for a time worked out beforehand (round
  // seventy-five; helpers/progress.ts): WebKit's first restore ran past its 125 s on the owner's PC, still writing.
  await watchStorage(page);
  // Four hundred plants with a kilobyte of notes each: changes.json past the sizes at which fflate's asynchronous
  // writer (160 kB) and reader (512 kB) hand the work to a blob: worker, which worker-src 'self' refuses (round twenty-eight, 0).
  const wall = Date.now() - 3_600_000;
  const changes: unknown[] = [];
  let n = 0;
  const c = (kind: string, id: string, field: string, value: unknown) => changes.push({ t: `${wall + n}-${(n++ % 65536).toString(16).padStart(4, '0')}-abcdefabcdef0000`.replace(/^(\d{13})\d*/, '$1'), kind, id, field, value });
  const note = 'Grown hard on the south bench; watered when the pot is light. '.repeat(20);
  for (let i = 1; i <= 400; i++) {
    const id = `r-seed-${i}`;
    c('accession', id, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis');
    c('accession', id, 'status', 'growing');
    c('accession', id, 'acquired', i === 400 ? '2099-01-01' : '2025-03-01');
    c('accession', id, 'notes', `${i}: ${note}`);
    c('accession', id, 'acc', `2025-${String(i).padStart(4, '0')}`);
  }
  const json = JSON.stringify(changes);
  expect(json.length).toBeGreaterThan(524_288);
  // a backup zip as the app writes one: the manifest and the log (since round fifty-seven only the zip is read)
  const manifest = { format: 'cultifolio-backup', v: 1, exported: new Date().toISOString(), counts: { changes: changes.length, accessions: 400, events: 0, locations: 0, sowings: 0, taxa: 0, photos: 0, photoBytes: 0 } };
  const seed = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'changes.json': strToU8(json) }));
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('#bk-export')).toBeEnabled(); // the collection has opened
  await page.locator('#bk-file').setInputFiles({ name: 'seed.cultifolio.zip', mimeType: 'application/zip', buffer: seed });
  await expect(page.locator('.preview')).toContainText('400 plants');
  // Two thousand changes in one write, about 6,000 IndexedDB requests: two minutes at Safari's engine's pace (helpers/pace.ts),
  // and the test is given twice that, as an outer bound only. The wait itself goes on while the database answers.
  allowWrites(2 * 6_000 * WEBKIT_MS_PER_REQUEST);
  await mergeBackup(page);
  await whileStoring(page, (timeout) => expect(page.locator('#bk-done')).toContainText('400 plants', { timeout }), 45_000);
  // the backup is written
  const dl = page.waitForEvent('download');
  await page.click('#bk-export');
  const file = await dl;
  const path = (await file.path())!;
  await expect(page.locator('.secrule .n', { hasText: 'last today' })).toBeVisible();
  // wiped, then read back
  await wipe(page); // the snapshot and the arrival rows go with the log (round sixty-seven; triage-66 H7)
  await page.goto('/backup'); await ready(page);
  await expect(page.locator('#bk-export')).toBeEnabled(); // the collection has opened
  await page.locator('#bk-file').setInputFiles(path);
  await expect(page.locator('.preview')).toContainText('400 plants');
  // Two thousand changes in one write, about 6,000 IndexedDB requests: two minutes at Safari's engine's pace (helpers/pace.ts),
  // and the test is given twice that, as an outer bound only. The wait itself goes on while the database answers.
  allowWrites(2 * 6_000 * WEBKIT_MS_PER_REQUEST);
  await mergeBackup(page);
  await whileStoring(page, (timeout) => expect(page.locator('#bk-done')).toContainText('400 plants', { timeout }), 45_000);
  // Opening the collection then reads the two restores' 4,000 arrivals one change at a time after the snapshot (4,018
  // requests, counted in Chromium): over a minute at Safari's engine's pace, where the page said "Opening your
  // collection…" past the 10 s, both times (round sixty-six; the all-engines run; helpers/pace.ts).
  allowWrites(2 * 4_000 * WEBKIT_MS_PER_REQUEST);
  await page.goto('/plants');
  await whileStoring(page, (timeout) => expect(page.locator('.seccount').first()).toContainText('400', { timeout }), 45_000);
  // a plant whose stored acquired date is in the future (an older file) can have its price edited; only a date this edit types is judged (round twenty-eight, 0)
  await page.goto('/plants/2025-0400');
  await more(page, 'Edit');
  await page.fill('#ed-price', '12');
  await markSave(page, 'click Save');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ed-date-bad')).toHaveCount(0);
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.getByText('12', { exact: false }).first()).toBeVisible();
});

test('round twenty-nine: the photo viewer removes the photograph it shows after a date edit re-sorts the set, with Undo; three photographs added at once keep their progress on screen', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  const acc = page.url().split('/').pop()!;
  await page.setViewportSize({ width: 640, height: 480 });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 60 });
  await page.setViewportSize({ width: 1180, height: 900 });
  // three at once: the add control stays on screen while the second and third store (round twenty-nine, 12)
  await page.locator('#acc-photo-file').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'c.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
  await expect(page.locator('.phgrid .ph')).toHaveCount(3);
  await expect(page.locator('.addrow')).toBeVisible();
  await expect(page.locator('.addrow')).toContainText('Added 3');
  // open the first, date it back to 2019 (it re-sorts to the end), then Remove: the 2019 one must be the one removed (round twenty-nine, 1)
  await page.locator('.phgrid .ph').first().click();
  await expect(page.getByRole('dialog')).toContainText('1 of 3');
  await page.getByRole('button', { name: 'Caption / date' }).click();
  await page.fill('#lb-caption', 'Oldest');
  await page.fill('#lb-date', '2019-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('Oldest');
  await expect(page.getByRole('dialog')).toContainText('3 of 3'); // the viewer followed the photograph to its new place
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.phgrid .ph')).toHaveCount(2);
  await expect(page.locator('.phgrid .pd', { hasText: '2019-01-01' })).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Photograph removed');
  await page.locator('.toast .undo').click();
  await expect(page.locator('.phgrid .ph')).toHaveCount(3);
  await expect(page.locator('.phgrid .pd', { hasText: '2019-01-01' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.phgrid .ph')).toHaveCount(3); // the pixels came back with the record
  await page.locator('.phgrid .ph').last().click();
  await expect(page.locator('.stage img')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Oldest');
  expect(acc).toMatch(/\d{4}-\d{4}/);
});

test('round twenty-nine: a potting is judged by what was in the pot on its day, a count cannot go if a later potting rested on it, and an edit to the medium alone is not refused for a stored date', async ({ page }) => {
  await page.goto('/propagation/new'); await ready(page);
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '10');
  const day = (back: number) => localDay(-back);
  await page.fill('#s-date', day(30));
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  // 1 up on day −20, 8 up on day −5
  await page.fill('#g-date', day(20));
  await page.fill('#g-n', '1');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('10%')).toBeVisible();
  await page.fill('#g-date', day(5));
  await page.fill('#g-n', '8');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('80%')).toBeVisible();
  // potting 2 dated day −10: only 1 was up then (round twenty-nine, 5)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.fill('#p-date', day(10));
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('form', { has: page.locator('#p-n') })).toContainText(`Only 1 was in the pot on ${day(10)}`);
  await page.fill('#p-n', '1');
  await page.getByRole('button', { name: 'Pot up 1' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 1:/ })).toBeVisible();
  // the day −20 count cannot go: the potting on day −10 rests on it, whatever the totals say
  const row = page.locator('.tl .tlrow', { hasText: day(20) }).first();
  await expect(row).toContainText('kept: the potted plants rest on it');
  // an edit to the medium alone, on a batch whose stored date is fine, saves; the check reads only what was typed
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#se-medium', 'grit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toHaveCount(0);
  await expect(page.getByText('grit')).toBeVisible();
});

test('round thirty-four: a genus address opens the catalogue for a grower with plants, not their own list', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  // the front page is the grower's own species now
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Your species' })).toHaveAttribute('aria-pressed', 'true');
  // but the genus page's own address (the sitemap's, a shared link's) shows the genus
  await page.goto('/?by=genus&open=copiapoa');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page).toHaveTitle(/^Copiapoa/);
  await expect(page.locator('.grow.open', { hasText: 'Copiapoa' })).toBeVisible();
  await expect(page.locator('a.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  // and "Your species" is one click away
  await page.getByRole('button', { name: 'Your species' }).click();
  await expect(page.locator('a.tile', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await expect(page.locator('.grow')).toHaveCount(0);
});

test('round thirty-seven: the old-name line shows for a variety of a listed older name, and for nothing the record does not hold', async ({ page }) => {
  // The record lists Echinocactus cinereus; the address named a variety of it (R1-8).
  await page.goto('/species/copiapoa-cinerea?was=Echinocactus%20cinereus%20var.%20columna-alba');
  await expect(page.locator('#was-synonym')).toContainText('Echinocactus cinereus var. columna-alba is a variety under an older name of this species');
  // The older name itself, as before.
  await page.goto('/species/copiapoa-cinerea?was=Echinocactus%20cinereus');
  await expect(page.locator('#was-synonym')).toContainText('is a synonym');
  // A name the record does not hold is not printed as fact, trinomial or not.
  await page.goto('/species/copiapoa-cinerea?was=Copiapoa%20bogus%20var.%20alba');
  await expect(page.locator('#was-synonym')).toHaveCount(0);
});

test('round thirty-seven: the hemisphere notice is one sentence with its spaces, and counts the cells as the split does', async ({ page }) => {
  // Server-rendered text, read before hydration can repaint it: the boundary comment of a block ate the space before "and" (R2-2).
  const r = await page.request.get('/species/copiapoa-humilis');
  const html = await r.text();
  const m = /<p class="notice small" id="hemispheres">([^<]*)<\/p>/.exec(html);
  expect(m, 'the notice is rendered').toBeTruthy();
  expect(m![1]).toContain('the 8 cells at least 10° north of it have seasons six months apart');
  expect(m![1]).toContain('across the 37 cells that remain: the 31 at least 10° south and the 6 within 10° of the equator, which stay in either way.');
  expect(m![1]).not.toMatch(/southand|northand/);
});

test('round thirty-eight: a monotypic genus does not quote the species paragraph twice', async ({ page }) => {
  // The genus article is the species article: the "About the genus" block would repeat the Summary one heading down (R2-3).
  await page.goto('/species/welwitschia-mirabilis');
  await expect(page.locator('#s-summary + .sumbody')).toContainText('Welwitschia is a monotypic genus');
  await expect(page.locator('#s-genus')).toHaveCount(0);
  // A genus with its own article keeps its block.
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('#s-genus + .sumbody')).toContainText('Copiapoa is a genus of cactus');
});

test('round forty: on "Your species" the search box stays on the device; the catalogue is one deliberate step away; punctuation and chips in a catalogue search', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  const searches: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/search')) searches.push(r.url()); });
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.getByRole('button', { name: 'Your species' })).toHaveAttribute('aria-pressed', 'true');
  // A number, a field number, a name: found on the device, and nothing goes to the server or the URL (R2-1).
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.fill('.searchbar', 'copiapoa');
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(searches).toEqual([]);
  expect(page.url()).not.toContain('q=');
  // The catalogue is one explicit step away, and that step is the one that sends the text.
  await page.locator('#search-catalogue').click();
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa humilis' })).toBeVisible();
  expect(searches.length).toBeGreaterThan(0);
  expect(page.url()).toContain('q=copiapoa');
  // On the catalogue view too, a plant's number and anything shaped like one stays on the device (round forty-nine, 3; round thirty-five, R1-2).
  const sent = searches.length;
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.fill('.searchbar', '2031-07');
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(searches.length).toBe(sent);
  expect(page.url()).not.toContain('q=');
  // Punctuation an iPhone types is not a refusal (R1-1).
  await page.fill('.searchbar', 'copiapoa, ’cinerea’');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  // A chip that is on filters the search too (R1-4).
  await page.fill('.searchbar', '');
  await page.locator('.chipbtn', { hasText: 'Without climate' }).click();
  await expect(page.locator('.chipbtn.on')).toContainText('Without climate');
  await page.fill('.searchbar', 'copiapoa');
  await expect(page.locator('.emptybox')).toContainText('with the chip on (2 without it)');
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  // The grouping links keep the chip.
  await page.fill('.searchbar', '');
  await page.locator('nav.seg[aria-label="Group by"] a', { hasText: 'Family' }).click();
  await expect(page).toHaveURL(/by=family.*chip=noclimate|chip=noclimate.*by=family/);
});

test('round forty: a measurement typed in inches is stored in millimetres and read back in the reader\'s units (R2-2)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /°F and inches/ }).click();
  await page.goto(`/plants/${year()}-0001`);
  await page.locator('.quickbar .more').click();
  await page.getByRole('button', { name: 'Measure', exact: true }).click();
  await expect(page.locator('.measures label').first()).toContainText('(in)');
  await page.locator('.measures input').first().fill('2');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.card', { hasText: 'Diameter' })).toContainText('2');
  await expect(page.locator('.card', { hasText: 'Diameter' }).locator('.u')).toContainText('in');
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /°C and mm/ }).click();
  await page.goto(`/plants/${year()}-0001`);
  await expect(page.locator('.card', { hasText: 'Diameter' })).toContainText('50.8');
  await expect(page.locator('.tlrow', { hasText: 'Measure' })).toContainText('Diameter 50.8 mm');
});

test('round forty-one: a batch gets a label from its own page, with the sowing line on it (R10)', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '20');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  const no = page.url().split('/').pop()!;
  await page.getByRole('link', { name: 'Label' }).click();
  await expect(page).toHaveURL(/\/labels\?batch=/);
  await expect(page.locator('#batch-picks .pick input')).toBeChecked();
  await expect(page.locator('.sheets .label', { hasText: no })).toHaveCount(1);
  await expect(page.locator('.sheets .label', { hasText: no }).locator('.src').first()).toContainText('20 seeds');
});

test('round forty-one, as round fifty-eight has it: the site is a first-visit step on the empty plants list, not a step on every plant; a plant with no place offers "Give it a place"', async ({ page }) => {
  await page.goto('/plants');
  const steps = page.locator('.firststeps');
  await expect(steps.locator('a', { hasText: 'Your location for the frost watch' })).toHaveAttribute('href', '/settings#site');
  await expect(page.locator('#plants-sort')).toHaveCount(0); // no sort menu over nothing
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await addPlant(page);
  const setup = page.locator('.setup');
  await expect(setup.locator('.setuprow', { hasText: 'Give it a space' })).toBeVisible();
  await expect(setup.locator('.setuprow', { hasText: 'Set your site' })).toHaveCount(0);
});

test('round forty-two: the species photograph is preloaded from the head, one size by surface, in a box that is laid out before it lands (1)', async ({ page }) => {
  // The photograph's host is never reached here; the request is held open so the box is measured before anything arrives.
  await page.route(/inaturalist-open-data\.s3\.amazonaws\.com/, () => new Promise(() => {}));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); // the held request means the load event never fires
  await expect(page.locator('head link[rel="preload"][as="image"][media="(max-width: 640px)"]')).toHaveAttribute('href', /photos\/900\/medium\.jpg$/);
  await expect(page.locator('head link[rel="preload"][as="image"][media="(min-width: 641px)"]')).toHaveAttribute('imagesrcset', /medium\.jpg 500w, .*large\.jpg 1024w/);
  await expect(page.locator('head link[rel="preconnect"]')).toHaveAttribute('href', 'https://inaturalist-open-data.s3.amazonaws.com');
  const box = await page.locator('.hero.photo').boundingBox();
  expect(box?.height).toBe(150);
  // the phone's source is the medium file alone; the wide screen's img chooses between medium and large for a 480 px box
  await expect(page.locator('.hero.photo source')).toHaveAttribute('srcset', /photos\/900\/medium\.jpg$/);
  await expect(page.locator('.hero.photo source')).toHaveAttribute('media', '(max-width: 640px)');
  await expect(page.locator('.hero.photo img')).toHaveAttribute('srcset', /medium\.jpg 500w, .*large\.jpg 1024w/);
  await expect(page.locator('.hero.photo img')).toHaveAttribute('sizes', '480px');
});

test('round forty-two: the home page preloads the first featured tile and preconnects to its host (1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveAttribute('href', /\/small\.jpe?g$/);
  await expect(page.locator('head link[rel="preconnect"]').first()).toHaveAttribute('href', /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|api\.gbif\.org)$/);
});

test('round forty-six: a client-side navigation to a species page whose HTML the Worker holds gets its data, not the held HTML (3)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); // the HTML is held for a minute now
  await page.goto('/'); await ready(page); // hydrated: a word typed into the server's HTML is dropped (round sixty-four)
  await page.fill('.searchbar', 'copiapoa cin');
  await page.locator('.hitrow', { hasText: 'Copiapoa cinerea' }).first().click(); // a client-side navigation: the data request goes under the page's URL
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('main')).not.toContainText('Internal Error');
  await page.goBack();
  await expect(page.locator('.searchbar')).toHaveValue('copiapoa cin');
});

test('round forty-eight: on a phone the search row stays pinned through the list, and A–Z brings the index back (1)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('.letters')).toBeVisible();
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(500, h - 900));
  // pinned under the top bar, not scrolled away with the chips and the letters; polled, not after a fixed 200 ms (round sixty; the harness review, 14)
  await expect.poll(async () => Math.round((await page.locator('.stickyhead .toolrow').boundingBox())!.y)).toBe(44);
  await expect(page.locator('.azbtn')).toBeVisible();
  await page.locator('.azbtn').click();
  await expect.poll(async () => { const y = (await page.locator('.letters').boundingBox())?.y ?? -1; return y > 44 && y < 400; }).toBe(true);
});

test('round forty-eight: a window opened partway (a letter, ?at=) fills in the rows before it as the reader scrolls up, and the list is whole (2)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 }); // short enough that the fixture's one-row list can be scrolled up under the bar
  const res = await page.goto('/?at=3'); // the fourth row since K's Hesperocyparis joined the fixture (round seventy-nine)
  expect(res?.status()).toBe(200);
  // the server's window starts at the fourth row; the rows before it come from the API once the reader is within the
  // rows, not while the chips and the letters above them are what is on screen (round forty-nine, 2: a jump to W on the
  // live site filled all the way to A and landed there)
  await expect(page.locator('.rows .grow').first()).toContainText('Welwitschia');
  await page.waitForTimeout(700); // a negative: the rows before must not fill in while the chips and letters are on screen, and only a pause can show that they did not; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  await expect(page.locator('.rows .grow')).toHaveCount(1);
  await expect(page.locator('.rows .before')).toHaveCount(1);
  // the reader scrolls the rows up under the pinned bar: the fill runs, and the row they were looking at stays where it was
  await page.evaluate(() => { const r = document.querySelector('.rows .grow')!.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 100); });
  const before = await page.locator('.rows .grow', { hasText: 'Welwitschia' }).boundingBox();
  await expect(page.locator('.rows .grow')).toHaveCount(4);
  await expect(page.locator('.rows .grow').first()).toContainText('Copiapoa');
  await expect(page.locator('.rows .before')).toHaveCount(0); // nothing earlier is left
  await expect(page.locator('.rows h2.letter').first()).toContainText('C');
  // The chunk brought the phone's strip of photographs into the rows; each tile's photograph loads or fails a moment after
  // the fill (the browser suite's server asks no image host). Settled first, so the row is read after what the strip did,
  // not before it: read at once, Chromium passed in the moment before the photograph failed and its credit line went, and
  // Safari's engine and Firefox read the row 21 px off (round sixty-five; the all-engines rerun).
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.rows .ftile')].every((t) => !!t.querySelector('.fph') || [...t.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0)))).toBe(true);
  // the row they were looking at settles where it was; polled, not after a fixed 200 ms (round sixty; the harness review, 14)
  await expect.poll(async () => Math.abs((await page.locator('.rows .grow', { hasText: 'Welwitschia' }).boundingBox())!.y - before!.y)).toBeLessThan(4);
});

test('round forty-eight: a letter tapped on a phone lands with its heading just under the pinned search row (4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Hydrated first: a tap before then is the browser's own jump to the anchor, which lands the heading under the row
  // (round sixty-two; the harness review's 4: this test's one flake, "expected < 167.8, received 207.3").
  await ready(page);
  await page.locator('.letters a', { hasText: 'W' }).click();
  // Landed: the heading at or below the pinned row's foot (not under the row), and right below it unless the fixture's
  // short page has no further to scroll (W is its last letter). Both bounds are polled together, so a scroll still
  // settling is waited for rather than judged (round sixty-two; the harness review's 4).
  const landed = () => page.evaluate(() => {
    const bar = document.querySelector('.stickyhead .toolrow')!.getBoundingClientRect();
    const h = document.querySelector('#l-W')!.getBoundingClientRect();
    const foot = bar.y + bar.height;
    const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
    return { notUnder: h.y >= foot, justBelow: atEnd || h.y < foot + 16 };
  });
  await expect.poll(landed).toEqual({ notUnder: true, justBelow: true });
  // the computed offset is the pinned row's, not the head's, which is `display: contents` on a phone and has no height
  const under = await page.evaluate(() => { const head = document.querySelector<HTMLElement>('.stickyhead')!; const row = document.querySelector<HTMLElement>('.stickyhead .toolrow')!; return [head.offsetHeight, row.offsetHeight]; });
  expect(under[0]).toBe(0);
  expect(under[1]).toBeGreaterThan(60);
});

test('round forty-nine: Water is one tap with an Undo, on the plant page and on the list; Archive asks first (3)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  const acc = page.url().split('/').pop()!;
  // the plant page: one tap writes the line; Undo takes it back
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  // the list: the row's own button, without opening the page
  await page.goto('/plants');
  await page.getByRole('button', { name: `Water ${acc}, record watered today` }).click();
  await expect(page.locator('a.accrow .fig', { hasText: 'watered today' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('a.accrow .fig', { hasText: 'no watering recorded' })).toBeVisible();
  // Archive asks; Keep leaves the plant growing
  await page.goto(`/plants/${acc}`);
  await page.locator('.quickbar .more').click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, archive' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Mark growing' })).toBeVisible();
});

test('round forty-nine: a place takes plants in from a ticked list, in one commit, each with its move line (3)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible();
  const accs: string[] = [];
  for (const n of ['Copiapoa cinerea', 'Welwitschia mirabilis']) {
    await page.goto('/plants/new'); await ready(page);
    await page.fill('#species-name', n);
    await page.locator('#species-name').blur();
    await addPlant(page);
    accs.push(page.url().split('/').pop()!);
  }
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Move plants here' }).click();
  await page.fill('.movein .searchbar', 'welw');
  await expect(page.locator('.moverows label.row')).toHaveCount(1);
  await page.locator('.moverows label.row input').check();
  await page.getByRole('button', { name: /^Move 1$/ }).click();
  await expect(page.locator('.toast')).toContainText('Moved 1 plant to Cold frame');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toBeVisible();
  await expect(page.locator('.rows a.row', { hasText: 'Copiapoa' })).toHaveCount(0);
  await page.locator('.rows a.row', { hasText: 'Welwitschia' }).click();
  await expect(page.locator('.tlrow', { hasText: 'to Cold frame' })).toBeVisible();
});

test('round forty-nine: a letter near the end of the catalogue still lands with its heading under the bar; the list is padded, and the padding goes once rows fill in above (4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // The fixture's catalogue is a few rows: the strip above them makes the page tall enough to place W without padding;
  // taken away here, the list is as short as the padding is for (round sixty-three, V4, when a phone's strip followed the
  // rows; the one strip is above the search since round seventy-six).
  await page.addStyleTag({ content: 'section.featured { display: none !important; }' });
  await page.locator('.letters a', { hasText: 'W' }).click();
  // landed: the heading is at or below the pinned row's foot; polled, not after a fixed 300 ms (round sixty; the harness review, 14)
  await expect.poll(async () => { const b = (await page.locator('.stickyhead .toolrow').boundingBox())!; return (await page.locator('#l-W').boundingBox())!.y >= b.y + b.height; }).toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bar = await page.locator('.stickyhead .toolrow').boundingBox();
  const h = await page.locator('#l-W').boundingBox();
  expect(h!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
  expect(h!.y).toBeLessThan(bar!.y + bar!.height + 40); // placed, not clamped at the footer
  await expect(page.locator('.rows')).toHaveAttribute('style', /padding-bottom/); // the fixture's rows are all loaded, so nothing fills in and the padding stays
});

/** Everything below the top bar and above the phone's tab bar: a thing "on the first screen" fits here without a scroll. */
async function firstScreen(page: import('@playwright/test').Page) {
  const tabs = await page.locator('#tabbar').boundingBox();
  return { top: 44, bottom: tabs ? tabs.y : 844 };
}

test('round fifty: on a phone the first screen of the catalogue, My plants and a place shows records, not only controls (1, 4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // a visitor: the search, the sampler of photographs and the first catalogue row, all on one screen
  await page.goto('/');
  let fs = await firstScreen(page);
  const firstRow = await page.locator('.rows .grow').first().boundingBox();
  expect(firstRow!.y + 24).toBeLessThan(fs.bottom); // the first genus row begins above the tab bar
  const strip = await page.locator('section.featured .strip').boundingBox();
  const search = await page.locator('.toolrow .searchbar').boundingBox();
  // Above the one toolbar, as round sixty had it (visitor 16) and a desktop always has: round sixty-three (V4) drew a phone's
  // strip after the first rows, and on the owner's iPhone it read as plants dropped into the list (round seventy-six).
  expect(strip!.y + strip!.height).toBeLessThanOrEqual(search!.y);
  expect(search!.y + search!.height).toBeLessThan(fs.bottom); // and the search is on the first screen
  expect(strip!.height).toBeLessThan(200);
  // the lead tile is double width; the rest are 112px
  const tiles = page.locator('section.featured .strip .ftile');
  const lead = await tiles.first().boundingBox();
  expect(lead!.width).toBeGreaterThan(200);
  if (await tiles.count() > 1) { const second = await tiles.nth(1).boundingBox(); expect(Math.round(second!.width)).toBe(112); }
  // a grower with two plants on a shelf
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Porch');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree a', { hasText: 'Porch' })).toBeVisible(); // stored before the page is left (round sixty; the harness review, 13)
  for (const sp of ['Copiapoa%20cinerea&key=5384013', 'Welwitschia%20mirabilis&key=5411106']) {
    await page.goto(`/plants/new?species=${sp}`);
    const v = await page.locator('#f-loc option', { hasText: 'Porch' }).getAttribute('value');
    await page.selectOption('#f-loc', v!);
    await addPlant(page);
  }
  // My plants: the head is one line (the + in the top bar adds), the search and the sort share a row, the chips are one row, and both plants are on the first screen
  await page.goto('/plants');
  fs = await firstScreen(page);
  await expect(page.locator('.phead .acts .btn:not(.dots)')).toBeHidden(); // the "···" menu (import, spreadsheet) is the head's one control since round sixty
  await expect(page.locator('.phead .inlinecount')).toContainText('2 growing');
  const sb = await page.locator('#plants-q').boundingBox();
  const sort = await page.locator('#plants-sort').boundingBox();
  expect(Math.abs(sb!.y - sort!.y)).toBeLessThan(4);
  const rows = page.locator('.rows .accrow');
  await expect(rows).toHaveCount(2);
  const second = await rows.nth(1).boundingBox();
  expect(second!.y + second!.height).toBeLessThanOrEqual(fs.bottom + 1);
  // the reference-photograph offer is one line until opened
  await expect(page.locator('details.rpo')).not.toHaveAttribute('open', ''); // closed: the disclosure is behind the summary
  await expect(page.locator('details.rpo .why')).toBeHidden();
  await expect(page.locator('details.rpo summary')).toBeVisible();
  // the place: no band above the card, the empty pills row gone, the actions as one row of buttons and one of words, and both plants on the first screen
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Porch' }).click();
  await expect(page.locator('.hero.band')).toHaveCount(0);
  await expect(page.locator('.idcard .pills')).toHaveCount(0);
  await expect(page.locator('.idcard .vern')).toContainText('Room · 2 growing plants');
  await expect(page.locator('.quickbar.words .btn', { hasText: 'Edit' })).toBeVisible();
  await expect(page.locator('.quickbar .btn.pri')).toHaveText('Water all 2');
  await expect(page.locator('.empty')).toContainText('and coordinates for frost watch');
  fs = await firstScreen(page);
  const placeRows = page.locator('.rows .accrow');
  await expect(placeRows).toHaveCount(2);
  const last = await placeRows.nth(1).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(fs.bottom + 1);
  // the grower's front page: Today under the toolrow, the own tiles three to a row, the second tile on the first screen
  await page.goto('/');
  fs = await firstScreen(page);
  const own = page.locator('.hgrid.mine a.tile');
  await expect(own).toHaveCount(2);
  const t0 = await own.nth(0).boundingBox(); const t1 = await own.nth(1).boundingBox();
  expect(Math.abs(t0!.y - t1!.y)).toBeLessThan(2); // side by side
  expect(t0!.width).toBeLessThan(140); // three to a row
  expect(t1!.y + 60).toBeLessThan(fs.bottom);
  // the plant page: the checklist is one row of steps, scrolled sideways
  await page.goto(`/plants/${year()}-0001`);
  const steps = page.locator('.setup .setuprow');
  await expect(steps.first()).toBeVisible();
  // polled: the row's layout settles a moment after the fonts and the page's stylesheet do
  await expect.poll(async () => { const s0 = await steps.nth(0).boundingBox(); const s1 = await steps.nth(1).boundingBox(); return Math.abs(s0!.y - s1!.y); }).toBeLessThan(2);
});

test('round fifty: typing a search is a mode on a phone: the box pinned, the strip and chips away, the matches as rows, Cancel puts the page back (2)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('section.featured .strip')).toBeVisible(); // the one strip, above the search (round seventy-six)
  await expect(page.locator('.toolrow .tools .chiprow')).toBeVisible();
  const box = page.locator('.toolrow .searchbar');
  await box.click();
  await box.fill('Copia');
  await expect(page.locator('.cancelsearch')).toBeVisible();
  await expect(page.locator('.featured .strip')).toHaveCount(0);
  await expect(page.locator('.filters')).toHaveCount(0);
  await expect(page.locator('.toolrow .seg')).toHaveCount(0);
  await expect(page.locator('#welcome')).toHaveCount(0);
  // the box is at the top: the head steps aside too, so even a page too short to scroll has the box under the bar
  await expect(page.locator('.phead')).toBeHidden();
  const tb = await page.locator('.toolrow').boundingBox();
  expect(tb!.y).toBeGreaterThanOrEqual(44); expect(tb!.y).toBeLessThan(70);
  // matches are rows with a thumbnail or an initial, the name and one line of family · origin · climate, and the count above them
  await expect(page.locator('.rows.hits .hitrow')).toHaveCount(2);
  await expect(page.locator('.hitrow').first()).toContainText('Cactaceae');
  await expect(page.locator('.hits').locator('..').locator('.seccount').first()).toContainText('2');
  // Enter opens the first
  await box.press('Enter');
  await expect(page).toHaveURL(/\/species\/copiapoa-/);
  await page.goBack();
  // Cancel: the box empty, the strip and chips back
  await page.locator('.toolrow .searchbar').fill('Welw');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.locator('.cancelsearch').click();
  await expect(page.locator('.toolrow .searchbar')).toHaveValue('');
  await expect(page.locator('section.featured .strip')).toBeVisible();
  await expect(page.locator('.toolrow .tools .chiprow')).toBeVisible();
  await expect(page.locator('.cancelsearch')).toHaveCount(0);
});

test('round fifty-one: a move into a place has an Undo that puts the plant back and removes its line; Enter on the Add form is Add, not Save and add another (4)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible();
  // Enter in a field submits the primary action: the page moves to the plant, not back to an emptied form
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(page);
  // The species from the link in the field, and Add able to be pressed, before Enter: the form fills the name once the
  // collection has opened, and Enter in a field does nothing while Add is disabled. Safari's engine on the PC opened the
  // collection after Enter, both times (round sixty-six; the all-engines run).
  await expect(page.locator('#species-name')).toHaveValue('Welwitschia mirabilis');
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5411106', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Add/ })).toBeEnabled();
  await page.locator('details.moredetails > summary').click();
  await page.locator('#f-field').fill('WM 1');
  await page.locator('#f-field').press('Enter');
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Move plants here' }).click();
  await page.locator('.moverows label.row input').check();
  await page.getByRole('button', { name: /^Move 1$/ }).click();
  await expect(page.locator('.toast')).toContainText('Moved 1 plant to Cold frame');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toHaveCount(1);
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toHaveCount(0);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.tlrow', { hasText: 'to Cold frame' })).toHaveCount(0);
  await expect(page.locator('.idcard a.place')).toHaveCount(0);
});

test('round fifty-two: a device a year ahead is corrected by the server\'s clock after two runs a minute apart and its watering is dated today everywhere; a change from a clock five years ahead is parked on every record page with Apply (1)', async ({ browser }) => {
  test.setTimeout(90_000); // three browser contexts and five sync runs: 23 s on a quiet machine, past the 30 s default on a loaded one (round sixty-two; the harness review's 4)
  const shifted = async (ms: number) => { const c = await browser.newContext(); await c.addInitScript((off: number) => { const real = Date.now; const OD = Date; (globalThis as { __shift?: number }).__shift = off; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; }, ms); return c; };
  const A = await browser.newContext(); await fromAddress(A); const a = await A.newPage(); // the vault from an address of its own (round sixty-two second pass)
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(a); await addPlant(a);
  const acc = a.url().split('/').pop()!;
  await a.goto('/sync'); await a.click('#sync-start'); const key = (await a.locator('#vault-key').textContent())!.trim();
  await a.fill('#key-typeback', key.slice(-5).toLowerCase()); await a.click('#sync-create');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  const join = async (p: import('@playwright/test').Page) => { await p.goto('/sync'); await p.click('#sync-have-key'); await p.fill('#sync-key', key.toLowerCase()); await p.click('#sync-join'); await expect(p.locator('.card', { hasText: 'Status' })).toContainText('Synced'); };
  // The file's syncRun, which waits for that run to finish; the local helper waited for an enabled button, which can be true before the run starts (round sixty; the harness review, 13).
  const syncNow = async (p: import('@playwright/test').Page) => { if (!p.url().endsWith('/sync')) await p.goto('/sync'); await syncRun(p); };
  // P: a year ahead. The join is one reading; a second run a minute later (by its own clock) corrects it.
  const P = await shifted(365 * 86_400_000); const p = await P.newPage();
  await join(p);
  await p.evaluate(() => { (globalThis as { __shift?: number }).__shift! += 61_000; });
  await syncNow(p);
  await expect(p.locator('#clock-warning')).toContainText('about a year ahead');
  expect(Number(JSON.parse((await p.evaluate(() => localStorage.getItem('cultifolio.clockOffsetMs')))!).offset)).toBeLessThan(-360 * 86_400_000);
  await p.goto(`/plants/${acc}`);
  await p.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(p.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(localDay(0)); // dated by the corrected clock
  await syncNow(p); await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(localDay(0));
  // Q: five years ahead, one reading only: its note is parked on A, listed on the record with Apply, and on the sync page.
  const Q = await shifted(5 * 365 * 86_400_000); const q = await Q.newPage();
  await join(q);
  await q.goto(`/plants/${acc}`); await q.getByRole('button', { name: 'Add a note' }).click(); await q.locator('textarea').first().fill('from 2031'); await q.getByRole('button', { name: 'Save' }).first().click();
  await expect(q.locator('textarea')).toHaveCount(0); // the note is stored before the page is left (round fifty-nine: a navigation cancelled it on a Windows run)
  await syncNow(q); await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.parked')).toContainText('from a device whose clock was wrong');
  await expect(a.locator('body')).not.toContainText('from 2031');
  await a.goto('/sync');
  await expect(a.locator('#parked')).toContainText('1 record has edits from a device whose clock was wrong');
  await a.goto(`/plants/${acc}`);
  await a.locator('.parked').getByRole('button', { name: /Apply/ }).click();
  await expect(a.locator('.parked')).toHaveCount(0);
  await expect(a.locator('body')).toContainText('from 2031');
  await Promise.all([A.close(), P.close(), Q.close()]);
});

test('round fifty-three: the Today tab lists what needs you by place, "no watering recorded" apart from "not watered", Water here writes dated lines with Undo, a frost in the forecast is a bar on every tab, and /frost goes there (3)', async ({ browser }) => {
  // One context whose clock can be moved: the plant's record must be three weeks old for "no watering recorded" to count.
  // Without the service worker, so the forecast mock below is what answers (a worker would fetch the real route).
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  const frosty = { lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days: [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 4, tmax: 12, precipMm: 0, steps: 24 }], hoursCovered: 48, offsetH: -5, firstFrost: '2026-11-02' }, alerts: [], alertsStatus: 'none', risk: { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] };
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(frosty) }));
  // a site, as Settings keeps it; a place and two plants in it
  await page.goto('/places');
  await page.evaluate(() => localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Mt Lebanon' })));
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Bench' })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page);
    const opt = await page.locator('#f-loc option', { hasText: 'Bench' }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  const second = page.url().split('/').pop()!;
  // the second plant watered today; the first never
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toBeVisible();
  // nothing is due yet: the Today tab says so
  await page.goto('/today');
  await expect(page.locator('#nothing')).toContainText('All caught up. Nothing is past its watering rhythm.');
  await expect(page.locator('#nothing')).toContainText('in 21 days'); // when Today will next speak (round sixty)
  await expect(page.locator('#how-today')).toContainText('How Today decides'); // the method, one tap away
  // twenty-five days on: the never-watered plant's record is old enough to count, apart from the plant watered twenty-five days ago
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000))); // read by the clock on the next load
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'Bench' });
  await expect(stop).toHaveCount(1);
  await expect(stop.locator('.row.warn').first()).toContainText('Past its 21-day rhythm (the default)'); // the figure in use, and where it comes from (round sixty; the grower review, 5)
  await expect(stop.locator('.row.warn').first()).toContainText(second);
  await expect(stop.locator('.row.warn').first()).toContainText('25 d');
  await expect(stop.locator('.row.unknown')).toContainText('No watering recorded');
  await expect(stop.locator('.row.unknown')).toContainText('added 25 d ago, no watering yet');
  await expect(stop.locator('.row.unknown')).not.toContainText(second);
  // the front page's line says the two apart
  await page.goto('/');
  await expect(page.locator('.today .line', { hasText: '1 of 2 plants past their watering rhythm, and 1 with no watering recorded yet' })).toBeVisible();
  // the frost in the forecast: on the front page as a line, on the Today tab as the card, and under the top bar on every other tab, going to the Today tab
  await expect(page.locator('.today .line', { hasText: 'Frost forecast: -2.0 °C' })).toBeVisible();
  await expect(page.locator('#frostbar')).toHaveCount(0); // the front page has the line; the bar is for the other tabs (round fifty-four, 4)
  await page.goto('/plants');
  await expect(page.locator('#frostbar')).toContainText('Frost forecast');
  await page.locator('#frostbar').click();
  await expect(page).toHaveURL(/\/today#frost$/);
  await expect(page.locator('#frostbar')).toHaveCount(0); // not on the tab that shows it in full
  await expect(page.locator('#frost .risk')).toContainText('Frost forecast: -2.0 °C');
  await expect(page.locator('#frost tr.frost')).toHaveCount(1);
  // Water here: one line per plant on the stop, dated today (the shifted today); the stop stays where it was, marked, with its own Undo (round fifty-four, 4)
  await page.locator('#water .stop', { hasText: 'Bench' }).getByRole('button', { name: 'Water 2 here' }).click();
  await expect(page.locator('.toast')).toContainText('Watered 2.'); // short: the stop says what and offers Undo (round fifty-eight)
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done')).toContainText('Watered just now');
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done a')).toHaveCount(2); // the watered plants stay on the stop, so it keeps its height (round fifty-five, 5)
  await expect(page.locator('.toast').getByRole('button', { name: 'Undo' })).toHaveCount(0); // the toast has no Undo of its own: it sits where the next stop's button was
  await expect(page.locator('#nothing')).toHaveCount(0);
  // the header's button is a mark now, not an Undo: a second tap where Water was does nothing (round fifty-eight)
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.head .donemark')).toContainText('Watered');
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.head').getByRole('button')).toHaveCount(0);
  await page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).getByRole('button', { name: 'Water 2 here' })).toBeVisible();
  // the old address
  await page.goto('/frost');
  await expect(page).toHaveURL(/\/today$/);
  await C.close();
});

test('round fifty-four: the selected segment of "Your species / All" stays readable while hovered, as a phone leaves it after a tap (1)', async ({ page }) => {
  await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page); await addPlant(page);
  await page.goto('/');
  const all = page.locator('.viewseg button', { hasText: 'All' });
  await all.click();
  const on = page.locator('.viewseg button.on');
  await expect(on).toContainText('All');
  await on.hover();
  const [color, bg] = await on.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; });
  expect(color).not.toBe(bg);
  expect(color).toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()).then((v) => v.startsWith('#') ? `rgb(${parseInt(v.slice(1, 3), 16)}, ${parseInt(v.slice(3, 5), 16)}, ${parseInt(v.slice(5, 7), 16)})` : v));
});

test('round fifty-four: a Today page left open overnight dates the morning\'s watering today; a site set in Settings is watched without a reload; a watering dated ahead has its own row (4)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  const frosty = { lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days: [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }], hoursCovered: 48, offsetH: -5, firstFrost: '2026-11-02' }, alerts: [], alertsStatus: 'none', risk: { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] };
  let asked = 0;
  await page.route(/\/api\/forecast/, (r) => { asked++; void r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(frosty) }); });
  // two plants, no site yet: no bar anywhere
  for (let i = 0; i < 2; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page); await addPlant(page); }
  const second = page.url().split('/').pop()!;
  await page.goto('/plants');
  await expect(page.locator('#frostbar')).toHaveCount(0);
  // the site set in Settings: the watch reads it on the next navigation, no reload (round fifty-four, 4; the second reviewer's finding 2)
  await page.goto('/settings');
  await ready(page);
  await page.fill('#site-lat', '40.38');
  await page.fill('#site-lon', '-80.05');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.locator('.topseg a', { hasText: 'My plants' }).click();
  await expect(page.locator('#frostbar')).toContainText('Frost forecast');
  // a cold Today asks once for the forecast, not twice (round fifty-four, 4; both reviewers)
  asked = 0;
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/today');
  await expect(page.locator('#frost .risk')).toContainText('Frost forecast');
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(asked).toBe(1);
  // twenty-five days on, the page is opened and left open across midnight: a watering after midnight is dated the new day
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No space' });
  await expect(stop).toHaveCount(1);
  await page.evaluate(() => { (globalThis as { __shift?: number }).__shift = 26 * 86_400_000; }); // past midnight, by the clock; the day store notices within a minute, the tap reads it then
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await stop.getByRole('button', { name: /^Water 2 here$/ }).click();
  await expect(stop.locator('.row.done a')).toHaveCount(2);
  const d = new Date(Date.now() + 26 * 86_400_000);
  const expectDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.goto(`/plants/${second}`);
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(expectDay);
  // a watering dated ahead of today is its own row on Today, not "no watering recorded": watered under a clock fifty days on, read under one twelve hours behind it (a phone whose day turned early; the line is twelve hours ahead, within the hold)
  await page.evaluate(() => localStorage.setItem('__shift', String(50 * 86_400_000)));
  await page.goto(`/plants/${second}`);
  const aheadDay = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  // This watering's own line, not the morning's from twenty-four days before, which was already there: the page was left
  // before the write had landed, in Safari's engine on the PC both times, and Today never saw it (round sixty-six; the
  // all-engines run).
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(aheadDay);
  // the clock set back to just before that day began: the line's date is ahead by a day, its stamp by a few hours, within the hold
  const back = await page.evaluate(() => new Date().getHours() + 1);
  await page.evaluate((h) => localStorage.setItem('__shift', String(50 * 86_400_000 - h * 3_600_000)), back);
  await page.goto('/today');
  await expect(page.locator('#water .stop .row.ahead')).toContainText(aheadDay);
  await expect(page.locator('#water .stop .row.unknown')).toHaveCount(0);
  await C.close();
});

test('round fifty-five: a watered stop keeps its height and the next stop does not move under the finger; the Undo survives a trip to another tab (5)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  await page.goto('/places');
  for (const name of ['Bench A', 'Bench B']) {
    await page.getByRole('button', { name: 'New space' }).click();
    await page.fill('#loc-name', name);
    await page.selectOption('#loc-kind', 'bench');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.tree .row', { hasText: name })).toBeVisible();
  }
  for (const name of ['Bench A', 'Bench A', 'Bench A', 'Bench B', 'Bench B']) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page);
    const opt = await page.locator('#f-loc option', { hasText: name }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000)));
  await page.goto('/today');
  const a = page.locator('#water .stop', { hasText: 'Bench A' });
  const b = page.locator('#water .stop', { hasText: 'Bench B' });
  await expect(b.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  // both stops on screen, B's button clear of the tab bar, as a grower would hold the page
  await page.evaluate(() => { const el = document.querySelectorAll('#water .stop')[1] as HTMLElement; scrollTo(0, el.getBoundingClientRect().top + scrollY - 420); });
  const before = await b.boundingBox();
  await a.getByRole('button', { name: 'Water 3 here' }).click();
  await expect(a.locator('.row.done a')).toHaveCount(3);
  const after = await b.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(24); // the stop below stays where the finger expects it
  // what is under where B's button was is B's button, not the toast's Undo
  const box = await b.getByRole('button', { name: 'Water 2 here' }).boundingBox();
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('button')?.textContent?.trim() ?? el?.tagName; }, [box!.x + box!.width / 2, box!.y + box!.height / 2]);
  expect(hit).toBe('Water 2 here');
  // to My plants and back: the mark and its Undo are still there (scrolled up first: the tab bar steps aside on a scroll down, round fifty-eight)
  await page.mouse.wheel(0, -200);
  await page.locator('#tabbar a', { hasText: 'My plants' }).click();
  await page.locator('#tabbar a', { hasText: 'Today' }).click();
  await expect(a.locator('.row.done')).toContainText('Watered just now');
  await a.getByRole('button', { name: 'Undo' }).click();
  await expect(a.getByRole('button', { name: 'Water 3 here' })).toBeVisible();
  await C.close();
});

test('round fifty-six: two plants under one number are not renumbered by opening the collection; the later one says so and is renumbered when asked', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  // two whole plants under one number, as a merge whose repair failed to store would leave them, put straight into the vault
  const wall = Date.now() - 3_600_000;
  await inject(page, [['r-dup-a', 'acc', '2026-0042'], ['r-dup-a', 'taxonName', 'Copiapoa cinerea'], ['r-dup-a', 'status', 'growing'], ['r-dup-b', 'acc', '2026-0042'], ['r-dup-b', 'taxonName', 'Welwitschia mirabilis'], ['r-dup-b', 'status', 'growing']].map(([id, field, value]): [string, string, string, string] => ['accession', id, field, value]), wall);
  // what the log holds about the two plants
  const ofTwo = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string }>>((res) => { const r = db.transaction('changes').objectStore('changes').getAll(); r.onsuccess = () => res(r.result); });
    // nothing at all: since round fifty-eight the plant page does not write the reference's key either
    return all.filter((c) => c.kind === 'event' || c.id.startsWith('r-dup-')).map((c) => `${c.kind} ${c.id} ${c.field}`).sort();
  });
  const before = await ofTwo();
  await page.goto('/plants/r-dup-b');
  await expect(page.locator('#shared-number')).toContainText('2026-0042');
  await expect(page.locator('#shared-number')).toContainText('Renumbering gives this plant the next free number'); // the notice names the plant the button renumbers (round fifty-eight)
  expect(await ofTwo()).toEqual(before); // opening the collection wrote nothing about them
  await page.locator('#shared-number').getByRole('button', { name: 'Renumber now' }).click();
  await expect(page.locator('#shared-number')).toHaveCount(0);
  await expect(page.locator('.accno').first()).toContainText('2026-0043');
  await page.goto('/plants/r-dup-a');
  await expect(page.locator('.accno').first()).toContainText('2026-0042');
  await expect(page.locator('#shared-number')).toHaveCount(0);
});

test('round fifty-eight: a place\'s watering rhythm decides what is due, its dry months are one quiet line, and a stop waters only the plants left ticked', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Weekly bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a.row', { hasText: 'Weekly bench' }).click();
  await expect(page).toHaveURL(/\/places\/.+/);
  const place = page.url();
  await page.goto(place + '?edit=1');
  await page.fill('#e-waterdays', '7');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.factgrid')).toContainText('about every 7 days');
  for (let i = 0; i < 2; i++) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page);
    const opt = await page.locator('#f-loc option', { hasText: 'Weekly bench' }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  // eight days on: past the bench's seven, though far short of the default twenty-one
  await page.evaluate(() => localStorage.setItem('__shift', String(8 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'Weekly bench' });
  await expect(stop.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  await expect(stop.locator('.chip.tick')).toHaveCount(2);
  await expect(stop.locator('.chip.tick').first()).toContainText('Refusia testii'); // named, not a number alone
  await stop.locator('.chip.tick input').first().uncheck();
  await stop.getByRole('button', { name: 'Water 1 of 2 here' }).click();
  await expect(stop.locator('.row.done .chip')).toHaveCount(1);
  // round fifty-nine, 3: with nothing left ticked the head shows the done mark, not a disabled "Water 0 of 1"; the plant left out stays, with its tick
  await expect(stop.locator('.head .donemark')).toContainText('Watered');
  await expect(stop.locator('.head').getByRole('button')).toHaveCount(0);
  await expect(stop.locator('.row.warn .chip.tick, .row.unknown .chip.tick')).toHaveCount(1);
  // round fifty-nine, 6: an Undo by keyboard leaves focus on the stop, not on the page body
  await stop.locator('.row.done').getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.stop'))).toBe(true);
  // the month kept dry: the plants here are not due, and the stop says so in one line
  await page.goto(place + '?edit=1');
  const month = await page.evaluate(() => new Date().getMonth());
  await page.locator('.months .mo input').nth(month).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.months')).toHaveCount(0); // saved: the form closed, so leaving cannot cancel the write
  await page.goto('/today');
  await expect(stop.locator('.row.resting', { hasText: 'Kept dry this month' })).toContainText('2 plants');
  await expect(stop.getByRole('button', { name: /^Water/ })).toHaveCount(0);
  await C.close();
});

test('round fifty-nine: the top bar\'s + opens the new-place form on every tap; the place form refuses what it cannot keep, with a sentence, and stays open (8, 9, 10)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/places');
  const plus = page.locator('#topbar a[aria-label="Add a space"]');
  await plus.click();
  await expect(page.locator('#loc-name')).toBeFocused();
  await expect(page).not.toHaveURL(/#add/);
  await page.getByRole('button', { name: 'New space' }).click(); // the head's button closes it
  await expect(page.locator('#loc-name')).toHaveCount(0);
  await plus.click(); // a second tap in a row opens it again
  await expect(page.locator('#loc-name')).toBeFocused();
  await page.fill('#loc-name', 'Test bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a', { hasText: 'Test bench' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#e-waterdays', 'abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toContainText('not a whole number of days from 1 to 365');
  await expect(page.locator('#e-waterdays')).toBeFocused();
  await page.fill('#e-waterdays', '10');
  await page.fill('#e-lat', '40.4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-lon-bad')).toContainText('A latitude needs its longitude');
  await page.fill('#e-lat', '');
  await page.fill('#e-alt', '300');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toHaveCount(0); // saved: the form closed
  await expect(page.locator('.factgrid')).toContainText('about every 10 days');
  await expect(page.locator('.factgrid > div', { hasText: 'Altitude' })).toContainText('300 m');
  await expect(page.getByText('No floor, light, watering or audit recorded here yet')).toHaveCount(0);
});

test('round fifty-nine: a control reached by the keyboard is never left under a sticky or fixed bar (WCAG 2.4.11), forward or back, at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  /** Tab `n` times (Shift+Tab when `back`), and after each say which focused element is covered at its centre by something that is not it. */
  const hidden = async (n: number, back: boolean) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
      // Two frames and the check in one call: the hundred presses were three calls each, and the test took 36.6 s of its
      // 60 in WebKit on the owner's PC (round seventy-three; the owner's run of round seventy-two). The check is the same.
      const bad = await page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const r = [...el.getClientRects()].find((b) => b.width > 0 && b.height > 0);
        if (!r || r.bottom < 0 || r.top > innerHeight) return null; // off the screen, which is the browser's to scroll
        const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
        const at = document.elementFromPoint(x, y);
        return at && (at === el || el.contains(at) || at.contains(el)) ? null : `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" under ${at?.tagName}.${at?.className}`;
      });
      if (bad) out.push(bad);
    }
    return out;
  };
  await page.goto('/about/how');
  await ready(page);
  expect(await hidden(30, false)).toEqual([]);
  await page.keyboard.press('End');
  expect(await hidden(30, true)).toEqual([]);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await hidden(40, true)).toEqual([]);
});

test('round fifty-nine: a species page\'s description is cut at a word and claims only what the page has', async ({ page }) => {
  for (const slug of ['copiapoa-cinerea', 'welwitschia-mirabilis', 'refusia-testii']) {
    await page.goto(`/species/${slug}`);
    const d = (await page.locator('meta[name="description"]').getAttribute('content'))!;
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).toMatch(/(\S…|[.!?)])$/); // a whole word before the ellipsis, or the text's own end
    expect(await page.locator('meta[property="og:description"]').getAttribute('content')).toBe(d);
  }
  // Refusia's climate was not checked: its line does not offer one
  await page.goto('/species/refusia-testii');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content'))!;
  expect(desc).toContain('habitat climate not checked'); // said as a check that did not happen (round sixty)
  expect(desc).not.toMatch(/habitat climate(?! not checked)/);
});
