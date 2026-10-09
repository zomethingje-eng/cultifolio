/**
 * Round sixty-three, the fix pass (fixer V; review R1, findings 1 and 8): a tap on Today, Places or Propagation on an
 * empty device was a full load straight into the example, which skipped the pages' own "Leave this page?": a visitor's
 * half-typed first plant went without a word on an iPhone, and a desktop's "Leave site?" answered Cancel left the tab
 * marked as the example's over the visitor's own collection. The tap is now the app's ordinary move, which asks first;
 * the page it lands on goes into the example. The menu's "See the example collection" moves inside the app first too.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r63fv-guard.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
const flag = (p: Page) => p.evaluate(() => sessionStorage.getItem('cultifolio.demo'));
async function inExample(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`), { timeout: 20_000 });
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page.locator('#demobar')).toBeVisible();
}
/** A visitor's first plant, half typed. */
async function halfTyped(page: Page) {
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
}

test('r63fv 1: a tab tapped from a half-typed first plant asks first; Cancel keeps the form and leaves the tab out of the example', async ({ page }) => {
  await halfTyped(page);
  const asked: string[] = [];
  page.on('dialog', (d) => { asked.push(d.message()); void (asked.length === 1 ? d.dismiss() : d.accept()); });
  await page.locator('#tabbar a[href="/today"]').click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain('What you typed for this plant will be lost');
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  expect(await flag(page)).toBeNull();
  // Asked again and answered OK: Today, which goes into the example by itself, the form's words having been let go.
  await page.locator('#tabbar a[href="/today"]').click();
  await inExample(page, '/today');
  expect(asked).toHaveLength(2);
});

test('r63fv 2: the menu\'s "See the example collection" from a half-typed plant asks first, and Cancel changes nothing', async ({ page }) => {
  await halfTyped(page);
  const asked: string[] = [];
  page.on('dialog', (d) => { asked.push(d.message()); void d.dismiss(); });
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#menu-example').click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toContain('What you typed for this plant will be lost');
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  expect(await flag(page)).toBeNull();
});

test('r63fv 3: the Places tab tapped with the add form open keeps the form, not the example (R1, 8)', async ({ page }) => {
  // By My plants' first step, a move inside the app: a full load of /places#add stops at the page's own replaceState
  // (reported to its owner; R1's fixer V, "Needs from others").
  await page.goto('/plants'); await ready(page);
  await page.locator('.firststeps a[href="/places#add"]').click();
  await expect(page.locator('#loc-name')).toBeVisible();
  await page.fill('#loc-name', 'Greenhouse');
  await page.locator('#tabbar a[href="/places"]').click();
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/places(#add)?$/);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#loc-name')).toHaveValue('Greenhouse');
  expect(await flag(page)).toBeNull();
});

test('r63fv 4: an empty device whose records are all held is not taken into the example (R1, 5)', async ({ page }) => {
  await page.goto('/about/how'); await ready(page);
  // A plant stamped a year ahead of this device's clock, as a fast peer's sync leaves it: held, folded into nothing yet.
  await inject(page, [['accession', 'r63fvheld', 'acc', '2026-0001'], ['accession', 'r63fvheld', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r63fvheld', 'status', 'growing'], ['accession', 'r63fvheld', 'nameKind', 'species']], Date.now() + 365 * 86_400_000, 'r63fvfastpeer000');
  await page.goto('/today'); await ready(page);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  expect(await flag(page)).toBeNull();
});
