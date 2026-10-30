// smoke.spec.ts, the second part: honesty and accessibility, from the QA pass (round seventy-two: split into four files that run in parallel, each in order).
import { test, expect } from '@playwright/test';
import { smokeSetup, ready, addPlant, more, WEBKIT_OFFLINE } from './helpers/smoke';

smokeSetup();

/**
 * The line Water records, with what the page was doing if it does not come in 5 s (round seventy-five): the write still
 * under way (the button's `aria-disabled` is set from the tap until the write returns), a refusal said on the page, or
 * nothing at all (the tap reached no handler). Which of the three settles smoke-2's one Firefox failure on the owner's PC.
 */
async function watered(page: import('@playwright/test').Page) {
  try {
    await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  } catch (e) {
    const state = await page.evaluate(() => ({
      writing: document.querySelector('#water-now')?.getAttribute('aria-disabled') ?? 'no button',
      refused: document.querySelector('#write-error')?.textContent?.trim() ?? null,
      toast: document.querySelector('.toast')?.textContent?.trim() ?? null,
      ready: document.documentElement.dataset.ready ?? null
    })).catch(() => null);
    throw new Error(`Water left no "Watered" line in 5 s; the page then: ${JSON.stringify(state)}\n${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---------------------------------------------------------------- honesty and accessibility, from the QA pass */

test('a refused source is a distinct state on every surface: species page, front tile, plant tile', async ({ page }) => {
  await page.goto('/species/refusia-testii');
  // photographs: GBIF media refused, so the hero says so rather than "no photograph"
  await expect(page.locator('h2#s-photos + .notice')).toContainText('GBIF media refused when this page was built. Not a statement that none exist.');
  await expect(page.locator('.hero')).toHaveCount(0); // no grey box where a photograph would be (round sixty)
  // the one mark for a refusal: a dashed "not checked" pill, its reason on tap (improvements, 5)
  const tok = page.locator('.idcard .nc', { hasText: 'Photographs not checked' });
  await expect(tok).toBeVisible();
  await expect(tok.locator('.why')).toBeHidden();
  await tok.locator('summary').click();
  await expect(tok.locator('.why')).toContainText('GBIF media refused when this page was built. Not asked, or not answered, is not "none"');
  await expect(page.locator('.idcard .pill', { hasText: 'Climate known' })).toHaveCount(0); // what is known is shown, not announced
  // climate refused: its own line, with the detail as a sentence
  // "not checked" once, by the mark under the name; here what that means (round eighty-four; A10)
  await expect(page.locator('.notice', { hasText: 'Occurrence source' })).toContainText('Climate not read. The occurrence source refused the request when this page was built. This is not a statement that no climate exists.');
  // the cultivation section does not say "no habitat climate"
  await expect(page.locator('.note-slot')).toContainText('No sheet: the habitat climate was not read (see Climate).');
  await expect(page.locator('.note-slot')).not.toContainText('no habitat climate for this species');
  // the map caption does not promise a marker there is none of
  await expect(page.locator('.mapcap').first()).not.toContainText('marker');
  await expect(page.locator('.mapcap').nth(1)).toContainText('No records drawn: the occurrence source refused the request'); // a refusal, not an absence, on the map too (its "not checked" said once, by the record; round eighty-four)
  // front page
  await page.goto('/?by=genus&open=refusia');
  const tile = page.locator('.tile', { hasText: 'Refusia' });
  await expect(tile.locator('.fig')).toContainText('climate not checked');
  await expect(tile.locator('.fig')).toHaveAttribute('title', /not checked: a source refused or did not answer/);
  // plant tile
  await page.goto('/plants/new?species=Refusia%20testii&key=999'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(t.locator('.nc .tok')).toHaveText('Climate not checked');
  await expect(t).toContainText('No season is read from an answer that was not given');
  // a pending climate is pending, not absent
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('Climate pending');
});

test.describe('with the reference cut', () => {
// Without the service worker: the route aborts below must catch every request for the reference, and the experimental
// interception of a worker's own fetches let one through now and then, so the test passed alone and failed in the suite
// on its first try (round twenty-eight, R1-2). The page's own fetches are what the routes see, every time.
test.use({ serviceWorkers: 'block' });
test('an unreachable reference is "not reached", never "not in the reference"', async ({ page }) => {
  await page.route('**/api/index', (r) => r.abort());
  await page.route('**/api/search**', (r) => r.abort());
  await page.route('**/api/sheets**', (r) => r.abort()); // the plant asks for its species' sheet by hash bucket
  await page.route('**/api/dossier/**', (r) => r.abort());
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto(`/plants/${acc}`);
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(t).toContainText('Reference not reached');
  await expect(t).toContainText('could not be reached from here; nothing is known either way');
  await expect(t).not.toContainText('Not in the reference');
});
});

test('the species page carries the envelope: median with its span, the cells it rests on, the marker named as a marker', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page); // a disclosure opened before hydration is closed again by it (WebKit, round seventy-one, the owner's run)
  // every table cell is "median / p10–p90" where the span differs
  await expect(page.locator('table.wx tbody tr').first().locator('td').nth(1)).toHaveText('22 / 20–24');
  await expect(page.locator('table.wx tbody tr').nth(2).locator('td').nth(1)).toHaveText('4'); // rain: no spread in the fixture, so the median alone
  await page.locator('#s-climate ~ details.why').first().locator('summary').click(); // the provenance is one tap from the chart
  await expect(page.getByText('Each figure is the median across the 40 grid cells holding the 352 in-range records, with the 10th–90th percentile span')).toBeVisible();
  await expect(page.getByText(/Extremes and elevation were read at a typical spot in the range, cell fixture \(-25\.261, -70\.589\)/)).toBeVisible();
  await expect(page.locator('.mapcap').first()).toContainText('The marker is where the records are densest; the climate comes from all the well-placed records, not from this spot'); // round eighty-four: in a grower's words (A7)
  const marker = page.locator('#s-habitat ~ details.why', { hasText: 'How this section is made' }).first();
  await expect(marker).toBeVisible();
  await expect(marker).toContainText('The map marker: the centre of the tenth-degree cell'); // said once (round sixty)
  await expect(page.locator('.factgrid b', { hasText: /^Map marker$/ })).toBeVisible();
  await expect(page.locator('.factgrid')).not.toContainText('Habitat centre');
  // the plant page's season tile is a figure with its months, hemisphere and shift, and a link to the sheet
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await page.getByRole('button', { name: /^Add/ }).click();
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await page.locator('#habitat > summary').click(); // folded under the log since round fifty-eight
  await expect(t).toContainText('No rainy season to read');
  await expect(t).toContainText("72 mm of rain in the median year; the temperature rule's cooler six months May–Oct (S), shifted to the north (no site set): Nov–Apr (CHELSA).");
  await expect(t.getByRole('link', { name: 'The sheet' })).toBeVisible();
  await expect(t).not.toContainText(/Rest expected|Growth expected|Water when/);
});

/** Controls without an accessible name, images without alt, and heading jumps, on one page. */
const a11yScan = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].map((h) => Number(h.getAttribute('aria-level') ?? h.tagName[1]));
  const jumps: string[] = [];
  let prev = 0;
  for (const l of hs) { if (l > prev + 1 && prev) jumps.push(`h${prev}→h${l}`); prev = l; }
  const unlabeled = [...document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=checkbox]), select, textarea')].filter((el) => !el.closest('label') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.id && document.querySelector(`label[for="${el.id}"]`))).map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}`);
  const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
  return { jumps, unlabeled, noAlt, h1: hs.filter((l) => l === 1).length };
});

test('every control has a name, headings do not jump, images have alt text, muted ink meets 4.5:1, and µ survives the label style', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Bench A');
  await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Bench A' })).toBeVisible(); // the write is on screen before the page is left (round twenty-seven, R2-1)
  const findings: string[] = [];
  for (const r of ['/', '/plants', '/plants/new', '/places', '/propagation', '/propagation/new', '/labels', '/backup', '/sync', '/today', '/offline', '/about/how', '/species/copiapoa-cinerea', '/species/refusia-testii', `/plants/${acc}`]) {
    await page.goto(r);
    await expect(page.locator('h1')).toBeVisible();
    if (r === '/places') await page.getByRole('button', { name: 'New space' }).click();
    if (r === `/plants/${acc}`) { await page.locator('.quickbar .more').click(); await page.getByRole('button', { name: 'Measure', exact: true }).click(); await more(page, 'Edit'); await page.getByRole('button', { name: 'Move', exact: true }).click(); }
    if (r === '/sync') await page.getByRole('button', { name: 'I have a key' }).click();
    const s = await a11yScan(page);
    if (s.jumps.length) findings.push(`${r}: heading jumps ${s.jumps.join(' ')}`);
    if (s.h1 !== 1) findings.push(`${r}: ${s.h1} h1`);
    if (s.unlabeled.length) findings.push(`${r}: unlabeled ${s.unlabeled.join(' ')}`);
    if (s.noAlt) findings.push(`${r}: ${s.noAlt} images without alt`);
  }
  expect(findings).toEqual([]);
  // the sowing page's forms, and the bench edit form's µ
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '10'); // a count is never assumed
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '3'); // nothing is potted from an uncounted pot
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('30%')).toBeVisible(); // the count is stored and shown before the next form (round sixty; the harness review, 13)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  expect((await a11yScan(page)).unlabeled).toEqual([]);
  await page.goto('/places');
  await page.locator('a.row').first().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const mu = await page.evaluate(() => { const l = [...document.querySelectorAll<HTMLElement>('form label > span')].find((s) => /mol/.test(s.textContent ?? ''))!; const glyph = l.querySelector('span')!; return { text: l.textContent, transform: getComputedStyle(glyph).textTransform }; });
  expect(mu.text).toBe('µmol/m²/s of light');
  expect(mu.transform).toBe('none');
  // contrast of the muted ink, as the page actually resolves it, in both schemes
  const ratio = async () => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (v: string) => (v.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const parse = (v: string) => { v = v.trim(); if (v.startsWith('#')) { const h = v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); } return rgb(v); };
    const lum = (c: number[]) => { const [r, g, b] = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const r = (a: string, b: string) => { const [x, y] = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const ink3 = cs.getPropertyValue('--ink3');
    return { card: r(ink3, cs.getPropertyValue('--card')), bg: r(ink3, cs.getPropertyValue('--bg')) };
  });
  const light = await ratio();
  expect(light.card).toBeGreaterThanOrEqual(4.5);
  expect(light.bg).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await ratio();
  expect(dark.card).toBeGreaterThanOrEqual(4.5);
  expect(dark.bg).toBeGreaterThanOrEqual(4.5);
  // the photo-less placeholder on an owned tile, in both schemes, as the page resolves it: the caption on its tint (round twenty-one, 12)
  const placeholder = async () => page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('a.tile .ph .cap');
    const box = el?.closest<HTMLElement>('.ph');
    if (!el || !box) return null;
    const rgb = (v: string) => (v.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => { const [r, g, b] = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [x, y] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(getComputedStyle(box).backgroundColor))].sort((p, q) => q - p);
    return { ratio: (x + 0.05) / (y + 0.05), hidden: !!el.closest('[aria-hidden="true"]'), text: el.textContent };
  });
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.locator('a.tile .ph .cap').first()).toBeVisible();
    const ph = await placeholder();
    expect(ph?.text).toBe('reference photograph off');
    expect(ph?.hidden).toBe(false); // the reason is read out; only the initial is decoration
    expect(ph!.ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test('long and unicode names: nothing overflows at 360 px, the number chip never wraps, and the search finds a cultivar and a parent', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  const add = async (name: string, field?: string) => {
    await page.goto('/plants/new'); await ready(page);
    await page.fill('#species-name', name);
    await page.locator('#species-name').blur();
    if (field) { await page.locator('details.moredetails > summary').click(); await page.fill('#f-field', field); }
    await addPlant(page);
    return page.url().split('/').pop()!;
  };
  const a1 = await add('Pseudolithocarpodendron magnificentissimum-extraordinarissimum subsp. longissimumverbosum', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789');
  const a2 = await add('Echeveria ‘Şträngé Nämé 名前 🌵’');
  const a3 = await add('Ariocarpus retusus x A. trigonus');
  for (const a of [a1, a2, a3]) {
    await page.goto(`/plants/${a}`);
    await expect(page.locator('h1.sci')).toBeVisible();
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, chip: document.querySelector('h1.sci .accno')!.getClientRects().length }));
    expect(o.sw).toBeLessThanOrEqual(o.iw);
    expect(o.chip).toBe(1); // one box: the chip did not wrap
  }
  await page.goto('/plants');
  await expect(page.locator('a.accrow')).toHaveCount(3);
  await page.fill('#plants-q', '名前');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await page.fill('#plants-q', 'trigonus');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await expect(page.locator('a.accrow')).toContainText('Ariocarpus');
  await ctx.close();
});

test('removing asks twice; a species photograph that fails to load leaves the name where it can be read', async ({ page }) => {
  // A toast goes at a navigation landing more than 600 ms after it was raised (toast.svelte.ts, onNavigate), and the removal
  // raises its Undo as the app's own navigation to /plants begins: with the four smoke files running side by side the
  // navigation took 1.1 s, and the Undo read below was gone in every run (round seventy-two's split, withdrawn; round
  // seventy-three found it in the trace). This test is about what removing asks and what Undo brings back, not about time,
  // so Date.now() is held still and the toast stays; timers run (as r61l-records' guard, round seventy-two).
  await page.clock.setFixedTime(Date.now());
  // Sixty seconds, not thirty: since round seventy-five it waits for the sheet's answer (up to 20 s) and for each page to be
  // ready, and in Firefox at two workers the whole took past 30 s on the owner's PC (round seventy-six).
  test.setTimeout(60_000);
  await page.goto('/settings');
  await ready(page);
  await page.check('#pref-refphotos');
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.setViewportSize({ width: 360, height: 780 });
  // the species image host is unreachable: no hero, the card says so beside the tile, and the card sits below the topbar
  await page.route(/inaturalist|wikimedia/, (r) => r.abort());
  await page.goto(`/plants/${acc}`);
  // The photograph is asked for only once the species' sheet has answered, and the card says nothing of it before: the
  // answer is waited for first (the "Species page" link stands for it), up to 20 s. With the four smoke files side by side
  // on a loaded machine the sheet took past the 5 s the next line waits, and the card still showed its "Species page"
  // placeholder (round seventy-three; round seventy-two read it as the photograph failing to say so).
  await expect(page.locator('#species-link')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.idcard.flat')).toContainText("The reference's photograph did not load.");
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('.idcard label.tile')).toBeVisible();
  const pos = await page.evaluate(() => ({ card: document.querySelector('.idcard')!.getBoundingClientRect().top, bar: document.querySelector('#topbar')!.getBoundingClientRect().bottom }));
  expect(pos.card).toBeGreaterThanOrEqual(pos.bar);
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.hero.failed .ph')).toContainText('photograph did not load');
  // a log entry: × then Remove?; the plant: Remove then Yes
  await page.goto(`/plants/${acc}`);
  // The page settled before the tap (round seventy-five): hydrated, and the species' sheet answered, so the reference's
  // photograph has been asked for, failed and taken its space back. In Firefox on the owner's PC the tap once left no
  // line and no toast on a page that looked drawn; that was not reproduced here (no Firefox), and the line now says
  // which it was if it comes again (`watered`).
  await ready(page);
  await expect(page.locator('#species-link')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Water', exact: true }).click(); // one tap, no form (round forty-nine, 3)
  await watered(page);
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove this entry' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove?' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  await page.getByRole('button', { name: `Yes, remove ${acc}` }).click();
  await expect(page).toHaveURL(/\/plants$/);
  // the removal offers Undo, and a removed plant's page offers to bring it back (round twenty-six, 4 and 5)
  await expect(page.locator('.toast')).toContainText(`${acc} removed.`);
  await page.locator('.toast .undo').click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await page.getByRole('button', { name: `Yes, remove ${acc}` }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('p.muted')).toContainText('can be brought back');
  await page.getByRole('button', { name: 'Restore this plant' }).click();
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.toast')).toContainText('restored');
  // an edit refused for a future date, then cancelled: reopening shows the kept date with no stale refusal (round twenty-seven, R2-2)
  await more(page, 'Edit');
  await page.fill('#ed-date', '2099-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ed-date-bad')).toContainText('2099-01-01 is in the future');
  await page.locator('.editform').getByRole('button', { name: 'Cancel' }).click();
  await more(page, 'Edit');
  await expect(page.locator('#ed-date-bad')).toHaveCount(0);
  await expect(page.locator('#ed-date')).not.toHaveValue('2099-01-01');
  await page.locator('.editform').getByRole('button', { name: 'Cancel' }).click();
  // a future acquisition date is refused before any number is minted (round twenty-six, 3)
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#f-date', '2099-01-01');
  await expect(page.locator('.secsub')).toContainText('2099-0001'); // the preview follows the date
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('#f-date-bad')).toContainText('2099-01-01 is in the future');
  await expect(page).toHaveURL(/\/plants\/new/);
  await page.goto('/plants');
  await expect(page.locator('.accrow', { hasText: '2099-0001' })).toHaveCount(0);
});

test('the browser talks to no third-party host while a name is typed, and the error page promises nothing', async ({ page, baseURL }) => {
  const away: string[] = [];
  const own = new URL(baseURL!).host; // the server under test, on whatever port it was given (round sixty-one; docs/review-60/harness.md 18)
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== own) away.push(r.url()); });
  await page.goto('/plants/new');
  await ready(page);
  const names = page.waitForResponse((r) => r.url().includes('/api/names?q='));
  await page.fill('#species-name', 'Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible(); // the suggestions answered (round sixty; the harness review, 14: a fixed 600 ms)
  await page.locator('#species-name').blur();
  // Not a fixed pause: what typing and leaving the field ask is the name service (answered) and the blur's own exact-name
  // check, which runs as the suggestions close and reuses that answer; both settled, nothing else is left to ask
  // (round sixty-one; docs/review-60/harness.md 18, review B).
  await names;
  await expect(page.locator('#species-name')).toHaveAttribute('aria-expanded', 'false');
  expect(away).toEqual([]);
  await page.goto('/species/nonsensia-fakeii');
  await expect(page.locator('.err')).toContainText('The reference has no Nonsensia: it is built from a fixed list of names');
  await expect(page.locator('.err')).not.toContainText('will be prepared');
  await expect(page.locator('.err')).not.toContainText('yet');
});

test('offline, a plant page not yet cached still opens from the section shell', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_OFFLINE);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).some((r) => new URL(r.url).pathname === '/plants'); }), { timeout: 20_000 }).toBe(true);
  // the shell references its assets absolutely, so serving /plants for /plants/<acc> finds them
  const shell = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await (await c.match('/plants'))!.text()); });
  expect(shell).toContain('"/_app/immutable/');
  expect(shell).not.toContain('"./_app/');
  await ctx.setOffline(true);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea', { timeout: 15_000 });
  await ctx.setOffline(false);
  await ctx.close();
});

test('the species field is a combobox: arrows and Enter pick a suggestion; Enter on a half-typed name asks before it files anything', async ({ page }) => {
  await page.goto('/plants/new'); await ready(page);
  const input = page.locator('#species-name');
  await expect(input).toHaveAttribute('role', 'combobox');
  await input.fill('Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  // the pick, not a submit: the name is whole, the key is set, the form is still here
  await expect(input).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF');
  await expect(page).toHaveURL(/\/plants\/new$/);
  // Enter never files a plant from this field, resolved or not: Add is the deliberate act
  await input.press('Enter');
  await expect(page).toHaveURL(/\/plants\/new$/);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');

  // A partial name: Enter asks, and nothing is filed under "Welwit". The catalogue's search reads "Welwit" as the start of
  // a genus and offers Welwitschia mirabilis, so once the field's check has answered, the line offers it by name (`nearest`)
  // rather than saying "Pick a name from the list". That line showed only for the moment between Enter and the check's
  // answer, which a Chromium run caught and a loaded WebKit run did not (round seventy-b; the owner's all-engines run,
  // flaky, 23 polls of "Did you mean Welwitschia mirabilis?"). Both answers are waited for before Enter, and the line is
  // read once the check has spoken: one outcome, the one the field settles on (round sixty; the harness review, 14).
  await page.goto('/plants/new');
  await ready(page);
  const welwit = Promise.all([page.waitForResponse((r) => r.url().includes('/api/names?q=Welwit')), page.waitForResponse((r) => r.url().includes('/api/search?q=Welwit'))]);
  await input.fill('Welwit');
  await welwit;
  await expect(page.locator('.picker [role=option]', { hasText: 'Welwitschia mirabilis' })).toBeVisible();
  await input.press('Enter');
  await expect(page.locator('.picker .pill.warn')).toBeVisible(); // the check has answered: "not reached" or "not in the backbone"
  await expect(page.locator('.picker .hint:not(.svc)')).toContainText('Not a reference name. Did you mean Welwitschia mirabilis?');
  await expect(page).toHaveURL(/\/plants\/new$/);
  // With no reference name near what was typed, Enter's line is the one that asks: pick from the list, or Add keeps it.
  await page.goto('/plants/new');
  await ready(page);
  const qz = Promise.all([page.waitForResponse((r) => r.url().includes('/api/names?q=Qzxwv')), page.waitForResponse((r) => r.url().includes('/api/search?q=Qzxwv'))]);
  await input.fill('Qzxwv');
  await qz;
  await input.press('Enter');
  await expect(page.locator('.picker .pill.warn')).toBeVisible();
  await expect(page.locator('.picker .hint:not(.svc)')).toContainText('Pick a name from the list');
  await expect(page).toHaveURL(/\/plants\/new$/);
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.getByText('Welwit')).toHaveCount(0);
  // Escape closes the list and Tab leaves without losing what was typed
  await page.goto('/plants/new'); await ready(page);
  await input.fill('Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible();
  await input.press('Escape');
  await expect(page.locator('.picker [role=listbox]')).toBeHidden();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('Tab');
  await expect(input).toHaveValue('Copiapoa cin');
});

test('a sowing without a count is refused with a sentence; a blank never becomes 20', async ({ page }) => {
  await page.goto('/propagation/new'); await ready(page);
  await expect(page.locator('#s-count')).toHaveValue('');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-count-missing')).toContainText('Say how many seeds went in');
  await expect(page.locator('#s-count')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/propagation\/new$/);
  await page.fill('#s-count', '8');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  await expect(page.getByText('8 seeds on')).toBeVisible();
});

// The service worker fetches /api/forecast itself once it controls the page, and a request made by a worker never
// passes through page.route, so this test runs without one: it is about the pages' wording, not the shell.
test.describe('without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a forecast source that does not answer is "not checked" in a plain notice on the bench and on the Today tab, never a status code', async ({ page }) => {
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'forecast source did not answer' }) }));
  // the site is set once, in Settings; the Today tab reads it (the old /frost address goes there; round fifty-three, 3)
  await page.goto('/frost');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('#frost .froststrip')).toContainText('No site set'); // one line under what needs you, not a box above it (round sixty; the grower review, §4)
  await page.goto('/settings');
  await ready(page);
  await page.fill('#site-lat', '40.38');
  await page.fill('#site-lon', '-80.05');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.goto('/today');
  await expect(page.getByText('Your site: 40.38, -80.05')).toBeVisible();
  await expect(page.locator('#frost .notice')).toHaveText('Forecast not checked: the forecast could not be reached just now, so this is not an all-clear. It is asked again when this page is next opened.');
  await expect(page.locator('#frost .notice')).not.toHaveClass(/err/);
  await expect(page.locator('.bad')).toHaveCount(0);
  await expect(page.locator('#frostbar')).toHaveCount(0); // a refusal is not a frost: nothing under the top bar
  // an outdoor place with coordinates watches the forecast on its own page
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Back step');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree .row', { hasText: 'Back step' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#e-indoor', 'no');
  await page.fill('#e-lat', '40.38');
  await page.fill('#e-lon', '-80.05');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Frost watch' })).toBeVisible();
  await expect(page.locator('.notice')).toHaveText('Forecast not checked: the forecast could not be reached just now, so this is not an all-clear. It is asked again when this page is next opened.');
  await expect(page.locator('.notice')).not.toHaveClass(/err/);
  await expect(page.getByText(/forecast 50\d/)).toHaveCount(0);
});
});

// The service worker answers these requests itself once it controls the page, and only Chromium lets a route see a worker's own fetch (the config's worker network events): in Firefox the route never saw them and the real server answered. The test is about the pages' words, not the shell (round sixty-four; the Firefox run).
test.describe('a place\'s forecast, routed without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a night under the place\'s floor "reaches the floor", not frost, and a floor not reached keeps a frost night\'s own level; a warning is said whatever the floor; alerts that were not checked are said not to have been (round twelve, 9)', async ({ page }) => {
  const mild = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
  const frosty = [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 4, tmax: 12, precipMm: 0, steps: 24 }];
  let days = mild;
  const body = (alerts: object[], alertsStatus: string) => JSON.stringify({ forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: -5, firstFrost: days === frosty ? '2026-11-02' : undefined }, alerts, alertsStatus, risk: alerts.length ? { level: 'warning', text: 'Freeze Warning in force (NOAA/NWS).' } : days === frosty ? { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' } : { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)', 'Alerts: NOAA National Weather Service'] });
  let alerts: object[] = [], status = 'refused';
  // At the context, not the page: after the first load the service worker makes these requests, and a page route does not see them.
  await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: body(alerts, status) }));
  await page.goto('/places');
  await page.getByRole('button', { name: 'New space' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#e-indoor', 'no');
  await page.fill('#e-lat', '40.38');
  await page.fill('#e-lon', '-80.05');
  await page.fill('#e-floor', '10');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Below the floor.');
  await expect(page.locator('.notice')).toContainText("reaches this space's 10.0 °C floor on 2026-11-02 (8.0 °C outside)");
  await expect(page.locator('.notice')).not.toContainText('Frost forecast');
  await expect(page.locator('.notice')).toContainText('Alerts not checked');
  await expect(page.locator('.pill', { hasText: 'reaches the floor' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'floor 10.0 °C' })).toBeVisible();
  // a floor the coldest night reaches exactly counts (round thirteen, 11); a floor of 2.5 prints as 2.5, not 3
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText("reaches this space's 8.0 °C floor");
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '2.5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('above the 2.5 °C floor');
  await expect(page.locator('.notice')).toContainText('Forecast clear.');
  await expect(page.locator('.pill', { hasText: 'floor 2.5 °C' })).toBeVisible();
  // a floor the forecast does not reach is not a clear forecast: a frost night keeps its own level, with the floor said (round fifteen, 11)
  days = frosty;
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '-5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Frost forecast.');
  await expect(page.locator('.notice')).toContainText('Frost forecast: -2.0 °C');
  await expect(page.locator('.notice')).toContainText('above the -5.0 °C floor');
  await expect(page.locator('.pill', { hasText: 'frost forecast' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'frost: clear' })).toHaveCount(0);
  // a warning in force is said with the floor set; and an answer for the OLD coordinates that lands after the edit is
  // dropped, never shown as this place's (round thirteen, B1): the old point's forecast is delayed past the save
  alerts = [{ event: 'Freeze Warning', headline: 'Freeze Warning tonight' }]; status = 'ok';
  await page.context().unroute(/\/api\/forecast/);
  await page.context().route(/\/api\/forecast/, async (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('lat') === '40.38') { await new Promise((res) => setTimeout(res, 1500)); return r.fulfill({ status: 200, contentType: 'application/json', body: body([], 'refused') }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: body(alerts, status) });
  });
  await page.evaluate(() => sessionStorage.clear()); // the forecast kept in this browser for an hour, so the old point is asked again
  const oldAnswer = page.waitForResponse((r) => r.url().includes('/api/forecast') && new URL(r.url()).searchParams.get('lat') === '40.38');
  await page.reload();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-lat', '40.39'); // the new place answers at once; the old one's slow answer must not overwrite it
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Warning in force.');
  // The old point's slow answer has landed and the page has drawn after it, rather than a fixed 2 s (round sixty; the harness review, 14).
  await oldAnswer;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('.notice')).toContainText('Warning in force.');
  await expect(page.locator('.pill', { hasText: 'weather warning' })).toBeVisible();
});
});

// Once the worker controls the page, Safari's engine sends every request of the page to it first, and a photograph the
// worker passes on (it answers nothing of another host) goes to the image host from there, past \`page.route\`: the tile
// asked and said "did not load", and the route never saw the request (round sixty-five; the all-engines rerun, as r62bw's
// strip in round sixty-four). The test is about what the pages ask for, not the shell.
test.describe('own pages and outside hosts, without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('pages about your own plants ask no outside host for anything unless the reference photographs are switched on; reference requests carry the corpus id (round twelve, A1 and 7)', async ({ page }) => {
  const outside: string[] = [];
  const api: string[] = [];
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => { outside.push(new URL(page.url()).pathname + ' -> ' + r.request().url()); r.abort(); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(u.pathname + u.search); });
  // Welwitschia: its photograph (…/700/medium.jpg) is what an own page would fetch; the public front page shows it only as a small row thumbnail.
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('Climate pending');
  // no hero at all: a tile where the photograph would go, and the reference's offered as one line whose disclosure opens on tap; nothing is fetched for a private page by default
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('.idcard label.tile')).toContainText('Add a photo');
  const offer = page.locator('.idcard details.rpo');
  await expect(offer).toContainText('Show the reference’s photograph of this species');
  await expect(offer.locator('.why')).toBeHidden();
  await offer.locator('summary').click();
  await expect(offer.locator('.why')).toContainText('which then sees which species you grow');
  await expect(offer.getByRole('button', { name: 'Show it' })).toBeVisible();
  await offer.locator('summary').click(); // closed again, nothing switched on
  await expect(offer.locator('.why')).toBeHidden();
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('reference photograph off'); // the own tile, without its photograph
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(outside.filter((u) => !u.startsWith('/ ->'))).toEqual([]); // the plant page and the list asked no outside host for anything
  expect(outside.filter((u) => u.includes('700/medium'))).toEqual([]); // and the front page fetched nothing about the plant grown (its rows and strip are the public catalogue)
  // after a search (answered by the server, the index never fetched whole) the own tile still shows no photograph
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.fill('.searchbar', '');
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('reference photograph off');
  expect(api.filter((u) => /^\/api\/(sheets|entries)/.test(u)).every((u) => /[?&]c=fixture(&|$)/.test(u))).toBe(true); // every reference request names the corpus
  expect(api.some((u) => u === '/api/corpus')).toBe(true);
  // switched on where it is withheld (the offer beside the own tiles, one tap, the disclosure in the same line), the tiles show
  // the photographs at once and Settings reads the same preference; the plant page then fetches the species' photograph from
  // the image host, and from nowhere else
  await expect(page.locator('.hero img')).toHaveCount(0);
  // the offer is one line; what showing discloses opens on tap, and the switch is thrown there (round fifty, 4)
  await page.locator('details.rpo summary', { hasText: 'Show the reference’s photographs on your tiles' }).click();
  await expect(page.locator('details.rpo')).toContainText('which then sees which species you grow');
  await page.locator('details.rpo .go', { hasText: 'Show it' }).click();
  await expect.poll(() => outside.some((u) => u === '/ -> https://inaturalist-open-data.s3.amazonaws.com/photos/700/medium.jpg'), { timeout: 10000 }).toBe(true); // the tile asked the image host at once (the stub refuses it, so the tile says it did not load)
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('photograph did not load');
  await page.goto('/settings');
  await ready(page);
  await expect(page.locator('#pref-refphotos')).toBeChecked();
  await page.goto(`/plants/${acc}`);
  await expect.poll(() => outside.some((u) => u === `/plants/${acc} -> https://inaturalist-open-data.s3.amazonaws.com/photos/700/medium.jpg`), { timeout: 10000 }).toBe(true);
  expect(outside.every((u) => u.includes('inaturalist-open-data.s3.amazonaws.com'))).toBe(true); // the front page's and the plant page's requests, and nothing to any other host
  expect(api.some((u) => u.startsWith('/api/dossier') || /welwitschia|5411106/.test(u))).toBe(false); // still no key and no name to this server
});
});

test('hovering a species link on a page about your own plants sends nothing; the same link on a species page preloads (round thirteen, 2)', async ({ page }) => {
  const data: string[] = [];
  page.context().on('request', (r) => { if (r.url().includes('__data.json')) data.push(new URL(r.url()).pathname); }); // the context sees a preload the worker answered; the page may not
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.getByRole('link', { name: 'Species page' }).hover();
  await page.waitForTimeout(700); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(data.filter((u) => u.includes('/species/'))).toEqual([]);
  await page.goto('/');
  await ready(page); // a server-drawn page: hydrated before the first press (round seventy-five; r75h-harness)
  await expect(page.locator('a.tile', { hasText: 'Copiapoa' }).first()).toBeVisible();
  await page.locator('a.tile', { hasText: 'Copiapoa' }).first().hover(); // an own tile
  await page.waitForTimeout(700); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(data.filter((u) => u.includes('/species/'))).toEqual([]);
  // the public catalogue still preloads on hover: a visitor's browsing is not the collection
  await page.getByRole('button', { name: /^All / }).click(); // the catalogue
  await page.locator('.grow', { hasText: 'Welwitschia' }).click();
  // Hovered again on each poll: the genus's tiles are drawn as its rows arrive, and a tile redrawn under a still pointer
  // gets no new hover (round seventy-five: 1 run in the merge's strict run, 8 of 8 alone).
  const tile = page.locator('a.tile', { hasText: 'Welwitschia' }).first();
  await expect.poll(async () => {
    await page.mouse.move(0, 0);
    await tile.hover();
    return data.some((u) => u.includes('/species/welwitschia-mirabilis'));
  }, { timeout: 10_000 }).toBe(true);
});

// The service worker answers these requests itself once it controls the page, and only Chromium lets a route see a worker's own fetch (the config's worker network events): in Firefox the route never saw them and the real server answered. The test is about the pages' words, not the shell (round sixty-four; the Firefox run).
test.describe('a label\'s sheet, routed without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a label whose species could not be reached says so, and the sheet is not printed as if the species had no figures (round thirteen, 6)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.context().route('**/api/sheets**', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"wait"}' }));
  await page.goto('/labels');
  await expect(page.locator('#lb-unchecked')).toContainText('One care line not checked');
  await expect(page.locator('#lb-unchecked .nc .tok')).toBeVisible();
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label');
  // A 429 is the server refusing for now, said as that (round sixty-seven; triage-66 S8, R45-11).
  await expect(page.locator('.page .label .care.unchecked')).toHaveText('care line not checked: the server refused the sheets for now');
  await expect(page.locator('#lb-print')).toBeEnabled();
  await page.context().unroute('**/api/sheets**');
  await page.locator('#lb-unchecked').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.page .label .care', { hasText: '(1 in 100, NASA POWER)' })).toHaveCount(1);
  await expect(page.locator('#lb-unchecked')).toHaveCount(0);
  // the skip box: cleared, 2.5 and 99 on a 30-cell sheet are 0, 2 and 29 blanks, never an error
  await page.selectOption('#lb-sheet', '5160');
  await page.fill('#lb-skip', '2.5');
  await expect(page.locator('.page').first().locator('.label').nth(2).locator('.no')).toBeVisible();
  await page.fill('#lb-skip', '99');
  await expect(page.locator('.page')).toHaveCount(1);
  await expect(page.locator('.page').first().locator('.label').nth(29).locator('.no')).toBeVisible();
  await expect(page.locator('#lb-skip')).toHaveValue('29'); // the box says the figure the sheet uses (round twenty-three, 18)
  await page.selectOption('#lb-sheet', '5163'); // ten cells: the skip follows the sheet down
  await expect(page.locator('#lb-skip')).toHaveValue('9');
  await page.selectOption('#lb-sheet', '5160');
  await page.fill('#lb-skip', '');
  await expect(page.locator('.page').first().locator('.label').nth(0).locator('.no')).toBeVisible();
  // a species the reference has but with no climate: its care line is empty, and that is an answer, not a wait (round fourteen, 3)
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/labels');
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels', { timeout: 10000 });
  await expect(page.locator('#lb-print')).toBeEnabled();
  await expect(page.locator('.page .label .care', { hasText: '(1 in 100, NASA POWER)' })).toHaveCount(1);
  await expect(page.locator('#lb-unchecked')).toHaveCount(0);
});
});

test('a returning grower never sees the catalogue or "You grow 0" while the collection opens; a first visit sees the catalogue at once', async ({ page }) => {
  // first visit: no hint, the server-rendered catalogue stands
  await page.goto('/');
  await expect(page.locator('.chiprow')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBe('1');
  // next load: the collection is slow to open; the page holds a skeleton, not the catalogue
  await page.addInitScript(() => {
    // The database opens 1.5 s late: the open request's success listener is held back.
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), 1500) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  });
  await page.goto('/');
  await expect(page.locator('.skeleton')).toBeVisible();
  await expect(page.locator('.chiprow')).toHaveCount(0);
  await expect(page.getByText('You grow 0')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.skeleton')).toHaveCount(0);
});

test('at 390 px every tap target is a finger wide: top-bar icons, breadcrumb, section tabs, log-entry removes, footer links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const SEL = 'a.btn, button.btn, #tabbar a, .chipbtn, #topbar .iconbtn, .crumb a, nav.tabs a, .rm, footer.credits a';
  const sample = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? e.getAttribute('aria-label') ?? '').trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) }; }).filter((x) => x.h > 0 && (x.h < 40 || x.w < 40)), SEL);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  // The link's key checked before Add: at 390 px its pill wraps under the field and moves Add 30 px down, and in Safari's
  // engine on the PC the press was made as it moved and missed (round sixty-six; the all-engines run, a flake).
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5384013', { timeout: 15_000 });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await expect(page.locator('.crumb a')).toBeVisible();
  expect(await sample()).toEqual([]);
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('nav.tabs a').first()).toBeVisible();
  expect(await sample()).toEqual([]);
  // the sticky bars are opaque: nothing ghosts through them
  const bg = await page.evaluate(() => [getComputedStyle(document.querySelector('#topbar')!).backgroundColor, getComputedStyle(document.querySelector('nav.tabs')!).backgroundColor]);
  for (const c of bg) expect(c).not.toMatch(/rgba\(.*, 0(\.\d+)?\)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
