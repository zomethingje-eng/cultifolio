/**
 * Round eighty-five, Q (review-c C8, outside review A23): the add form's species picker, mounted with the add form itself
 * in a real page (tests/unit/helpers/mount.ts), with `/api/search` and `/api/names` answered, held and failed by the test.
 * Round eighty-four's five behaviours of the picker were guarded by a browser spec alone (r84k-picker), and two of their
 * fixes passed it when reverted (C8's 2 and 3). Each test here fails with its fix taken out:
 *
 * 1. An answer that lands after the field is left never opens the list (round eighty-four, review-c C1). The leave's own
 *    close runs on the field's 150 ms timer; the test runs the page's clock past it (`page.clock.runFor`) rather than
 *    sleeping, so the answer lands after it on every machine. Fails with `show()` opening the list whatever has focus.
 * 2. A press outside the picker closes the list at once (C1; C8's 2), not 150 ms later when the field's blur timer runs:
 *    the page's clock is paused, so no timer can close it, and the list must be shut while the finger is still down.
 *    Fails without `open = false; hi = -1;` in the `pointerdown` handler (r84k-picker passed all 12 runs so).
 * 3. Add pressed while the reference's search is out waits for it, and files the reference's key on one press (C2).
 *    Fails with `check()` not awaiting the search out (`current.done`).
 * 4. A late answer that resolves the name clears "Add as typed" (C2; C8's 3): Enter arms the name while the search is
 *    held, and the search's answer then resolves it. Fails without `armed = false` in the search's resolution.
 * 5. The room under the field holds its height under a press on Add, so Add does not move from under the finger and the
 *    press is taken (outside review A22). Fails without `held`.
 *
 * C2 and C3 of this round (the reference's key wins; one plant per Add) are K's, with their own tests.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { Page, Route } from '@playwright/test';
import { mount, stopMounting } from './helpers/mount';

afterAll(stopMounting);
const SLOW = 240_000; // the first mount of a file pays for the browser and the transform (35 s on a cold Windows run)
const FORM = 'src/routes/plants/new/+page.svelte';
/** The app's own sheet, so the form is laid out as in the app (the action bar, the room under the field). */
const THEME = '<link rel="stylesheet" href="/src/lib/ui/theme.css">';

type Gate = { open: () => void; shut: Promise<void> };
const gate = (): Gate => { let open = () => {}; const shut = new Promise<void>((r) => (open = r)); return { open, shut }; };
const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const entry = (o: Record<string, unknown>) => ({ family: 'Cactaceae', origin: ['Chile'], photos: 0, open: 3, climate: 'ok', ...o });
const CINEREA = entry({ key: 'k1', slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', gbif: 5384013 });
const HUMILIS = entry({ key: 'k2', slug: 'copiapoa-humilis', name: 'Copiapoa humilis', gbif: 5384999 });
const ROW_CINEREA = { key: 5384013, canonicalName: 'Copiapoa cinerea', family: 'Cactaceae', rank: 'SPECIES', status: 'ACCEPTED' };
const ROW_GENUS = { key: 2779581, canonicalName: 'Copiapoa', family: 'Cactaceae', rank: 'GENUS', status: 'ACCEPTED' };

/** The two services the picker asks, each answered by the test; anything else the form asks is not found. */
function services(search: (r: Route) => Promise<void> | void, names: (r: Route) => Promise<void> | void) {
  const asked = { search: 0, names: 0 };
  const answer = async (r: Route, url: URL) => {
    if (url.pathname === '/api/search') { asked.search++; return search(r); }
    if (url.pathname === '/api/names') { asked.names++; return names(r); }
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  };
  return { asked, answer };
}
const until = async (ok: () => boolean, what: string) => { for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); if (!ok()) throw new Error(`never: ${what}`); };
const menu = (p: Page) => p.locator('.picker .menu');
const add = (p: Page) => p.locator('form button[type=submit].add');
/** Each plant's stored key, from the collection's log. */
const storedKeys = (page: Page) => page.evaluate(async () => {
  const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise<Array<{ kind: string; field: string; value: unknown }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
  d.close();
  return all.filter((c) => c.kind === 'accession' && c.field === 'taxonKey').map((c) => c.value);
});
const COLLECTION = `void (await import('/src/lib/db/collection.svelte.ts')).collection.load();`;

describe('the picker on the add form', () => {
  it('1. an answer that lands after the field is left never opens the list', async () => {
    const held = gate();
    const s = services(async (r) => { await held.shut; await json(r, [CINEREA, HUMILIS]); }, async (r) => { await held.shut; await json(r, [ROW_CINEREA, ROW_GENUS]); });
    const m = await mount(FORM, {}, { answer: s.answer, html: THEME, setup: COLLECTION, before: (p) => p.clock.install() });
    try {
      const input = m.page.locator('#species-name');
      await input.fill('Copiapoa');
      await until(() => s.asked.search + s.asked.names === 2, 'both services asked');
      await m.page.locator('h1').first().click(); // the field is left
      expect(await input.evaluate((e) => e === document.activeElement)).toBe(false);
      await m.page.clock.runFor(400); // past the leave's 150 ms close, whatever the machine's pace
      held.open();
      await expect.poll(() => m.page.locator('.picker .pill.ok').innerText(), { timeout: 15_000 }).toContain('GBIF 2779581'); // the answers are read
      expect(await menu(m.page).isHidden()).toBe(true); // reverted: open, over the form
      expect(await input.getAttribute('aria-expanded')).toBe('false');
      await input.focus(); // back in the field, the list is there again
      await expect.poll(() => menu(m.page).isVisible()).toBe(true);
    } finally {
      held.open();
      await m.close();
    }
  }, SLOW);

  it('2. a press outside the picker closes the list at once, with no timer run', async () => {
    const s = services((r) => json(r, [CINEREA, HUMILIS]), (r) => json(r, [ROW_CINEREA, ROW_GENUS]));
    const m = await mount(FORM, {}, { answer: s.answer, html: THEME, setup: COLLECTION, before: (p) => p.clock.install() });
    try {
      await m.page.locator('#species-name').fill('Copiapoa');
      await expect.poll(() => menu(m.page).isVisible(), { timeout: 15_000 }).toBe(true);
      // No timer runs from here: the field's blur timer cannot close the list.
      await m.page.clock.pauseAt(Date.now() + 60_000);
      const line = (await m.page.getByText('It will be numbered').boundingBox())!; // a line of words, which takes no focus
      await m.page.mouse.move(line.x + 4, line.y + line.height / 2);
      await m.page.mouse.down();
      // Read while the finger is down, with the page's pending updates drawn (no frame comes while the clock is paused).
      const shut = await m.page.evaluate(() => { (window as unknown as { __flush: () => void }).__flush(); return (document.querySelector('.picker .menu') as HTMLElement | null)?.hidden ?? true; });
      await m.page.mouse.up();
      expect(shut).toBe(true); // reverted: open until the blur's timer runs, which is paused
      expect(await m.page.locator('#species-name').getAttribute('aria-expanded')).toBe('false');
    } finally {
      await m.close();
    }
  }, SLOW);

  it("3. Add pressed while the reference's search is out waits for it, and files the reference's key on one press", async () => {
    const held = gate();
    // The name service answers at once, without the exact name (as GBIF's suggest does for a name it does not hold).
    const s = services(async (r) => { await held.shut; await json(r, [HUMILIS]); }, (r) => json(r, [ROW_CINEREA]));
    const m = await mount(FORM, {}, { answer: s.answer, html: THEME, setup: COLLECTION });
    try {
      await m.page.waitForFunction(() => document.querySelector('form button[type=submit].add') !== null);
      await m.page.locator('#species-name').fill('Copiapoa humilis');
      await until(() => s.asked.search > 0 && s.asked.names > 0, 'both services asked');
      await expect.poll(() => m.page.locator('.picker [role=option]', { hasText: 'Copiapoa cinerea' }).isVisible()).toBe(true);
      await add(m.page).click();
      await expect.poll(() => add(m.page).innerText()).toBe('Checking the name…'); // waiting for the search, not armed
      held.open();
      await expect.poll(() => storedKeys(m.page), { timeout: 15_000 }).toEqual([5384999]); // reverted: "Add as typed", nothing filed
    } finally {
      held.open();
      await m.close();
    }
  }, SLOW);

  it('4. a late answer that resolves the name clears "Add as typed"', async () => {
    const held = gate();
    // The name service knows no such name; the reference's search, held, has it.
    const s = services(async (r) => { await held.shut; await json(r, [HUMILIS]); }, (r) => json(r, []));
    const m = await mount(FORM, {}, { answer: s.answer, html: THEME, setup: COLLECTION });
    try {
      const input = m.page.locator('#species-name');
      await input.fill('Copiapoa humilis');
      await until(() => s.asked.search > 0 && s.asked.names > 0, 'both services asked');
      await input.press('Enter'); // Enter on a name nothing has resolved arms it
      await expect.poll(() => add(m.page).innerText()).toBe('Add as typed');
      held.open();
      await expect.poll(() => m.page.locator('.picker .pill.ok').innerText(), { timeout: 15_000 }).toContain('GBIF 5384999'); // resolved by the late answer
      await expect.poll(() => add(m.page).innerText()).toBe('Add'); // reverted: still "Add as typed"
    } finally {
      held.open();
      await m.close();
    }
  }, SLOW);

  it('5. the room under the field holds its height under a press on Add, so Add stays under the finger and the press is taken', async () => {
    const held = gate();
    // The name service's refusal, in the server's own long words, arrives while the finger is down.
    const s = services((r) => json(r, []), async (r) => { await held.shut; await json(r, { error: 'not asked: this site asked this device to wait, because many names were looked up from this address in the last few minutes' }, 429); });
    const m = await mount(FORM, {}, { answer: s.answer, html: THEME, setup: COLLECTION, viewport: { width: 320, height: 1800 } });
    try {
      await m.page.locator('#species-name').fill('Copiapoa zzyzx');
      await until(() => s.asked.names > 0, 'the name service asked');
      const status = m.page.locator('.picker .status');
      await expect.poll(() => add(m.page).isEnabled()).toBe(true);
      const before = (await add(m.page).boundingBox())!;
      const h0 = (await status.boundingBox())!.height;
      await m.page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await m.page.mouse.down(); // the field is left: its check waits on the held name service
      held.open();
      await expect.poll(() => status.innerText()).toContain('The name service was not asked');
      expect(Math.round((await add(m.page).boundingBox())!.y)).toBe(Math.round(before.y)); // reverted: Add moved down under the finger
      expect(Math.round((await status.boundingBox())!.height)).toBe(Math.round(h0));
      await m.page.mouse.up();
      await expect.poll(() => add(m.page).innerText()).toBe('Add as typed'); // the press was taken
      await expect.poll(async () => (await status.boundingBox())!.height).toBeGreaterThan(h0); // and the room released
    } finally {
      held.open();
      await m.close();
    }
  }, SLOW);
});
