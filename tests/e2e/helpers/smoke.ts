/**
 * The helpers and hooks the four smoke files share (round seventy-two; triage "Harness": smoke.spec.ts ran its 119 tests in
 * one worker, scheduled last, and was a third of a four-worker run with one worker busy). Each file calls `smokeSetup()`
 * once at its top: the own-pages init script, the Save trace's attachment and the warm-up request, as smoke.spec.ts had them.
 *
 * Withdrawn in round seventy-two and put back in round seventy-three. The four files share no state: each test has its own
 * browser context, and every vault-making test its own address (helpers/address.ts). What failed beside the other parts
 * was one smoke-2 test waiting as if the app were fast, which four files at once on a loaded machine made it not: the
 * removal's Undo, put away by the 600 ms rule of a toast across a navigation (toast.svelte.ts, onNavigate), and the
 * photograph's line, read before the species' sheet had answered. That test now holds Date.now() still and waits for the
 * sheet's answer.
 */
import { test, expect } from '@playwright/test';
import { attachSaveTrace } from './save-trace';

/** The page hydrated: before then a value typed into a bound field is dropped, and a click has no handler (round fifty-nine). */
export async function ready(p: import('@playwright/test').Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Click Add on the add-plant form. A name the reference does not hold (the name service is not reachable here) is asked about once, and the second Add keeps it as typed (round twenty-three, 4). */
export async function addPlant(p: import('@playwright/test').Page) {
  await p.getByRole('button', { name: /^Add/ }).click();
  // Either wording of the asked state: Add pressed before the name check answered ("press Add to keep exactly what you
  // typed"), or the check answered first ("Otherwise Add keeps exactly what you typed"). WebKit under load meets the
  // second, which the race did not know, and waited out the test (round seventy-one, the owner's run).
  const asked = p.locator('.picker .hint', { hasText: /(?:press Add to keep|Add keeps) exactly what you typed/ });
  await Promise.race([p.waitForURL(/\/plants\/\d{4}-\d{4}$/), asked.waitFor()]);
  if (await asked.isVisible()) await p.getByRole('button', { name: /^Add/ }).click();
  await expect(p).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
}
/** A day on the machine's own calendar, as the app dates things: `toISOString()` is UTC and is tomorrow for four evening hours in the Americas (round thirty, R1-3). */
export function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** This year on the machine's calendar: a plant added today is numbered in it, so a test that names one reads it here
 *  instead of writing 2026, which failed from 1 January 2027 (round sixty-one; docs/review-60/harness.md 2). */
export const year = () => localDay(0).slice(0, 4);
/** The plant page's id card keeps one primary action; Edit, Label and Propagate are behind "More" (improvements, 7). */
export async function more(p: import('@playwright/test').Page, name: string) {
  await p.locator('.idcard .cardmenu > button').click();
  await p.locator('#card-menu [role=menuitem]', { hasText: name }).click();
}

/** Click "Sync now" and wait for THAT run to finish: the status card counts finished runs, so the "Synced" that was already on screen is not mistaken for the new one (round thirteen, B2). */
export async function syncRun(p: import('@playwright/test').Page) {
  const status = p.locator('.card', { hasText: 'Status' });
  const before = Number(await status.getAttribute('data-runs'));
  await p.click('#sync-now');
  await expect.poll(async () => Number(await status.getAttribute('data-runs')), { timeout: 30000 }).toBeGreaterThan(before);
  await expect(status).toContainText('Synced');
}

/** Why the offline navigations below do not run in Safari's engine: a harness limit, not the site's (round sixty-five). Their
 *  WebKit runs are r67h-offline.spec.ts, which takes the network away behind the worker instead; the claim that this was
 *  checked by hand on an iPhone had no record, and is gone (round sixty-seven; triage-66 H2, S-E10). */
export const WEBKIT_OFFLINE = "In Playwright's WebKit a navigation the service worker would answer from its cache fails with \"WebKit encountered an internal error\" once the context is offline: Playwright takes WebKit offline from the page's own inspector, which stands in front of the worker (as its routes do, smoke 924). Checked here in Chromium and Firefox; in Safari's engine, r67h-offline.spec.ts takes the network away behind the worker instead.";

/** The hooks every smoke file runs, as smoke.spec.ts ran them. */
export function smokeSetup(): void {
  // The two tests that trace their Save attach the record when they fail or retry, and only then (round seventy; triage-69
  // P1, IND-8: helpers/save-trace.ts). A test that does not trace attaches nothing.
  test.afterEach(async ({}, testInfo) => { await attachSaveTrace(testInfo); });
  // The first request of a run is the server's first render, which on a Windows machine took past the 30 s a test has and
  // failed whichever test came first (round fifty-nine). One request here, with its own allowance, takes that cost: once
  // per file, since each of the four may be the first to reach the server.
  test.beforeAll(async ({ request }) => {
    test.setTimeout(120_000);
    await request.get('/', { timeout: 110_000 });
  });
}
