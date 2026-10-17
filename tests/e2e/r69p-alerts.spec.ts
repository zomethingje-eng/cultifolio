/**
 * Round sixty-nine, agent P (triage-68 P1, R46-6): a US place page said "All clear." and "frost: clear" when the National
 * Weather Service did not answer, because it read only `refused` of the two statuses round sixty-seven made. Both
 * statuses are driven here on both pages, the place page and Today. Failed on the base for `unanswered` on the place page
 * (the headline and the pill) and for the folded strip on Today; the `refused` sentence on the place page said "did not
 * answer".
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

// The service worker answers /api/forecast itself once it controls the page, past a page's route in WebKit and Firefox:
// the test is about the pages' words, not the shell (as smoke's forecast tests).
test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

const days = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
const answer = (alertsStatus: string) => JSON.stringify({
  lat: 40.38, lon: -80.05,
  forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: -5 },
  alerts: [], alertsStatus,
  risk: { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' },
  attribution: ['Forecast data from MET Norway (CC BY 4.0)', 'Alerts: NOAA National Weather Service']
});
const WHY = {
  refused: "the National Weather Service refused this site's request",
  unanswered: 'the National Weather Service did not answer'
} as const;

for (const status of ['refused', 'unanswered'] as const) {
  test(`r69p P1: alerts ${status} are "not checked" on a US place page and on Today, never "All clear." (R46-6) @phone`, async ({ page }) => {
    await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: answer(status) }));
    await page.goto('/places'); await ready(page);
    await inject(page, [['location', 'cf1', 'name', 'Cold frame'], ['location', 'cf1', 'type', 'coldframe'], ['location', 'cf1', 'indoor', false], ['location', 'cf1', 'lat', 40.38], ['location', 'cf1', 'lon', -80.05]], Date.now() - 3_600_000);

    // The place page: the headline, the pill and the sentence, each in its own words.
    await page.goto('/places/cf1'); await ready(page);
    const notice = page.locator('.notice', { hasText: 'No frost in the next 48 hours' });
    await expect(notice).toContainText('Forecast clear.');
    await expect(notice).not.toContainText('All clear.');
    await expect(notice).toContainText(`Alerts not checked: ${WHY[status]}, and this is not a statement that no alert is in force.`);
    await expect(page.locator('.pill', { hasText: 'forecast clear; alerts not checked' })).toBeVisible();
    await expect(page.locator('.pill', { hasText: 'frost: clear' })).toHaveCount(0);

    // Today: the folded strip says so, and the nights inside it give the reason in the same words.
    await page.evaluate(() => { localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05 })); sessionStorage.removeItem('cultifolio.forecast'); });
    await page.goto('/today'); await ready(page);
    const strip = page.locator('#frost details.nights');
    const head = strip.locator(':scope > summary');
    await expect(head).toContainText('No frost in the next 48 hours');
    await expect(head).toContainText('Alerts not checked.');
    await head.click();
    const nc = strip.locator('details.nc');
    await expect(nc).toContainText('Alerts not checked');
    await nc.locator('summary').click();
    await expect(nc).toContainText(`${WHY[status].charAt(0).toUpperCase()}${WHY[status].slice(1)}; the forecast above stands on its own.`);
  });
}

test('r69p P1: alerts checked and none in force read "All clear." and say no alert, so the words above are the unchecked case alone', async ({ page }) => {
  await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: answer('none') }));
  await page.goto('/places'); await ready(page);
  await inject(page, [['location', 'cf2', 'name', 'Back step'], ['location', 'cf2', 'type', 'outdoor'], ['location', 'cf2', 'indoor', false], ['location', 'cf2', 'lat', 40.38], ['location', 'cf2', 'lon', -80.05]], Date.now() - 3_600_000);
  await page.goto('/places/cf2'); await ready(page);
  const notice = page.locator('.notice', { hasText: 'No frost in the next 48 hours' });
  await expect(notice).toContainText('All clear.');
  await expect(notice).not.toContainText('Alerts not checked');
  await expect(page.locator('.pill', { hasText: 'frost: clear' })).toBeVisible();
});
