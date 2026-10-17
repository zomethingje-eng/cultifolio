/**
 * Round sixty-nine, agent P (triage-68 P2, IND-11): the reload after a deploy. Once a new build's worker had taken a page
 * over and the page was waiting for its next move, the layout cancelled that move in `beforeNavigate` and assigned
 * `location.href` there. The full unload began before the page's own leave guard had decided: a half-filled add form
 * asked "Leave this page?" and then the browser's "Leave site?", and a grower who said no to the first and yes to the
 * second lost the draft. Now the move finishes as any other, and the page it arrives on reloads.
 *
 * The takeover is staged with a stand-in for `navigator.serviceWorker` (an init script, as r64w stages Safari's): the page
 * loads under a worker, and the worker taking over says it serves another build. Each test failed on the base: the first
 * because the destination was loaded by `location.href` (a "navigate" load, not a reload of the page the move reached);
 * the second because the browser's own unload question came after the page's.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** A worker that served this page, and a takeover by one that says it serves another build, fired by `__takeOver()`. Each load is logged with its kind. */
function staged(): void {
  const changes = new Set<(e: Event) => void>();
  const controller = { state: 'activated', postMessage(msg: unknown, ports?: MessagePort[]) { if (msg === 'version' && ports?.[0]) ports[0].postMessage('another-build'); } };
  const reg = { waiting: null, installing: null, active: controller, update: () => Promise.resolve(), addEventListener() {} };
  const sw = {
    controller, ready: Promise.resolve(reg),
    register: () => Promise.resolve(reg), getRegistration: () => Promise.resolve(reg),
    addEventListener: (t: string, f: (e: Event) => void) => { if (t === 'controllerchange') changes.add(f); },
    removeEventListener() {}
  };
  Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => sw, configurable: true });
  (window as unknown as { __takeOver: () => void }).__takeOver = () => { for (const f of changes) f(new Event('controllerchange')); };
  addEventListener('load', () => {
    const kind = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? '?';
    try { sessionStorage.setItem('__loads', `${sessionStorage.getItem('__loads') ?? ''}${location.pathname}:${kind};`); } catch { /* none */ }
  });
}
const loads = async (p: Page) => (await p.evaluate(() => sessionStorage.getItem('__loads') ?? '')).split(';').filter(Boolean);
/** The takeover, and the page's answer to it: a page not in its first seconds waits for its next move. */
async function takeOver(p: Page) {
  await p.waitForTimeout(4200); // past the first seconds, in which an untouched page reloads at once (round sixty-seven's rule, kept)
  await p.evaluate(() => (window as unknown as { __takeOver: () => void }).__takeOver());
  await p.waitForTimeout(300); // the worker's answer comes over a message channel
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(staged);
});

test('r69p P2: after a takeover, a move between pages finishes and the page it reaches reloads under the new build (IND-11)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/plants'); await ready(page);
  await page.waitForLoadState('load');
  await takeOver(page);
  expect(await loads(page)).toEqual(['/plants:navigate']); // nothing typed, but past the first seconds: no reload here
  await page.locator('a[href="/places"]:visible').first().click();
  await expect(page).toHaveURL(/\/places$/);
  // The move was the app's own (the page arrived), and that page then reloaded: the base loaded /places by
  // `location.href` from the move it cancelled, a "navigate" load.
  await expect.poll(() => loads(page).catch(() => []), { timeout: 15_000 }).toEqual(['/plants:navigate', '/places:reload']);
  await ready(page);
});

test('r69p P2: a half-filled add form is asked about once, by the page; "no" keeps the draft, and the browser never asks over it (IND-11)', async ({ page }) => {
  test.setTimeout(60_000);
  const asked: string[] = [];
  let leave = false;
  page.on('dialog', (d) => {
    asked.push(d.type());
    // The page's question is answered as the test says; the browser's own "Leave site?" would be answered yes, which on
    // the base unloaded the form the grower had just chosen to keep.
    if (d.type() === 'beforeunload') void d.accept();
    else if (leave) void d.accept();
    else void d.dismiss();
  });
  await page.goto('/plants/new'); await ready(page);
  await page.waitForLoadState('load');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await takeOver(page);
  await page.locator('a[href="/places"]:visible').first().click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(asked).toEqual(['confirm']); // the base: the page's confirm and the browser's beforeunload
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  expect(await loads(page)).toEqual(['/plants/new:navigate']);
  // Yes this time: the move finishes, and the page it reaches reloads.
  leave = true;
  await page.locator('a[href="/places"]:visible').first().click();
  await expect(page).toHaveURL(/\/places$/);
  await expect.poll(() => loads(page).catch(() => []), { timeout: 15_000 }).toEqual(['/plants/new:navigate', '/places:reload']);
  expect(asked).toEqual(['confirm', 'confirm']);
});
