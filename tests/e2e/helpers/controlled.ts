import { expect, type Page } from '@playwright/test';

/**
 * Waits until the service worker controls the page, before a test goes offline (round sixty-nine; triage-68 P4, R46-30).
 * A page loaded while the first worker was still installing is controlled only once that worker activates and claims
 * it, and Firefox's precache of the shells can outlast a fixed 15 or 20 s wait (smoke's offline plant page failed 2 of 4
 * there; phone-webkit's r67h offline 1 was flaky at 20 s). So the worker is waited for as active first; a page it still
 * does not control is loaded again, since a load after activation is always controlled; and the wait for control is long
 * enough for the slowest engine. It never goes offline on a page the worker does not control.
 */
export async function controlledBy(page: Page, ms = 60_000): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  const inControl = () => page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!(await inControl())) {
    await expect.poll(inControl, { timeout: 5_000 }).toBe(true).catch(async () => { await page.reload(); });
  }
  await expect.poll(inControl, { timeout: ms }).toBe(true);
}
