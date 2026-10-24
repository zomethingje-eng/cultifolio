/**
 * Round eighty-two (O): the service worker's caches (the independent review's 8, its cache half).
 *
 * 1. On activation every build cache older than the newest other one goes, and that one stays only while a tab open at
 *    the takeover is open: here the page itself, which the first worker claims. Once that page has gone (a reload is a
 *    new page), the next look drops it. Before, it stayed until the next deploy reached the device, and the review found
 *    one from three weeks before.
 *
 * The two old builds are caches made by the page before any worker is registered (a first page of /about registers
 * none): `cultifolio-1000000000000` and `cultifolio-1000000000001`, older than any real build's name (its time in ms).
 * No request here fails, so WebKit reports no worker error; the worker is waited for as active and in control.
 *
 * On r82base: FAILED at the last step (`cultifolio-1000000000001` still there after the reload: kept as "the previous
 * build" until the next deploy).
 */
import { test, expect } from '@playwright/test';
import { controlledBy } from './helpers/controlled';
import { ready } from './helpers/smoke';

const OLDER = 'cultifolio-1000000000000';
const PREVIOUS = 'cultifolio-1000000000001';

test('r82o worker 1: the build before this one is kept only while a tab open at the takeover is open, and older builds go', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/about'); await ready(page);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r))).toBe(false);
  await page.evaluate(async ([a, b]) => {
    for (const n of [a, b]) await (await caches.open(n)).put('/_app/immutable/old.js', new Response('// an old build file', { headers: { 'content-type': 'text/javascript' } }));
  }, [OLDER, PREVIOUS]);
  // A collection page registers the worker; it installs, activates with this page open, and claims it.
  await page.goto('/plants'); await ready(page);
  await controlledBy(page);
  const names = () => page.evaluate(() => caches.keys());
  await expect.poll(names, { timeout: 30_000 }).not.toContain(OLDER);
  expect(await names()).toContain(PREVIOUS); // this page was open at the takeover
  // The page that held it goes (a reload is a new page); the next look, at most ten seconds after the last, drops it.
  await page.reload(); await ready(page);
  await expect.poll(async () => { await page.evaluate(() => fetch('/manifest.webmanifest').then((r) => r.status, () => 0)); return names(); }, { timeout: 40_000, intervals: [2_000] }).not.toContain(PREVIOUS);
  // This build's cache is still there and still serves the shell.
  expect(await page.evaluate(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match('/plants')) return true; return false; })).toBe(true);
});
