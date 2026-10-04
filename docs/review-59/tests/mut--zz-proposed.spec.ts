import { test, expect } from '@playwright/test';

/**
 * Proposed by the round-59 harness review. NOT for the suite as it stands: it demonstrates a race. Waiting for
 * `html[data-ready]` and then choosing a numbering scheme fails on the real code in 4 of 7 runs under a CPU throttle,
 * because the settings page's onMount awaits collection.load() and then resets mode/prefix/width from the vault,
 * detaching the Prefix input the test (or a grower) is typing in. The test after the next two waits for the vault too
 * and passes 4 of 4. Once the page stops overwriting touched fields, this one should pass and can join the suite.
 */
test('PROPOSED: html[data-ready] is set only once the page can take input', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto('/settings', { waitUntil: 'commit' });
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /Prefix/ }).click();
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf', { timeout: 30_000 });
  await expect(page.locator('.accno')).toHaveText('JF-0001', { timeout: 30_000 }); // the preview waits on the vault's load, slow at 6x
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

/** E08: the service worker keeps only query-less navigations (round fifty-nine, 1.8); no test looked at what a queried one leaves behind. */
test('PROPOSED: a navigation with a query is not kept as the plain page\'s offline copy', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/?by=origin');
  await expect(page.getByRole('link', { name: 'Origin' })).toHaveAttribute('aria-current', 'page');
  await page.goto('/about/how'); // a page that is kept: once it is in the cache, the navigation before it has been dealt with too
  const plain = await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        if (await c.match('/about/how', { ignoreVary: true })) {
          const r = await c.match('/', { ignoreVary: true, ignoreSearch: true });
          return r ? await r.text() : '';
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('/about/how was never kept');
  });
  expect(plain).not.toContain('href="?by=origin" aria-current="page"');
  await ctx.close();
});

/** E03: the place form's floor refusal (round fifty-nine, 4.4) had no test; only the watering days and the latitude pair did. */
test('PROPOSED: the place form refuses a floor that is not a temperature, and writes nothing', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Floor bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a', { hasText: 'Floor bench' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#e-floor', 'abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toContainText('is not a temperature');
  await expect(page.locator('#e-floor')).toBeFocused();
});

/** The same at 6x with the vault's load awaited too (Save numbering is enabled only once collection.ready): if this passes where the test above fails, the race is the settings page's onMount resetting the form after the load, which html[data-ready] does not cover. */
test('PROPOSED: settings typed after the vault has loaded is kept, at a 6x CPU throttle', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto('/settings', { waitUntil: 'commit' });
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await expect(page.getByRole('button', { name: 'Save numbering', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: /Prefix/ }).click();
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf', { timeout: 30_000 });
  await expect(page.locator('.accno')).toHaveText('JF-0001', { timeout: 30_000 });
});
