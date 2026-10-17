/**
 * Round seventy, agent P (triage-69 P4, R47-12): a place whose alerts no service read is never "All clear.". Outside the
 * National Weather Service's area the forecast route answers `alertsStatus: 'n/a'` (a place abroad, or a point inside a
 * US box the NWS answers "out of bounds"), and the place page read that as checked: "All clear." and the pill "frost:
 * clear", a statement that no alert is in force which no service made. Failed on the base: the notice said "All clear."
 * and the pill "frost: clear". The checked case ("All clear." on 'none') is r69p-alerts' guard.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const days = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
const answer = (alertsStatus: string | undefined) => JSON.stringify({
  lat: -33.92, lon: 18.42,
  forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: 1 },
  alerts: [], ...(alertsStatus ? { alertsStatus } : {}),
  risk: { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' },
  attribution: ['Forecast data from MET Norway (CC BY 4.0)']
});

for (const status of ['n/a', undefined]) {
  test(`r70p P4: a place no alerts service reads (${status ?? 'no status'}) says "Forecast clear.", never "All clear." (R47-12) @phone`, async ({ page }) => {
    await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: answer(status) }));
    await page.goto('/places'); await ready(page);
    await inject(page, [['location', 'ct1', 'name', 'Stoep'], ['location', 'ct1', 'type', 'outdoor'], ['location', 'ct1', 'indoor', false], ['location', 'ct1', 'lat', -33.92], ['location', 'ct1', 'lon', 18.42]], Date.now() - 3_600_000);
    await page.goto('/places/ct1'); await ready(page);
    const notice = page.locator('.notice', { hasText: 'No frost in the next 48 hours' });
    await expect(notice).toContainText('Forecast clear.');
    await expect(notice).not.toContainText('All clear.');
    await expect(notice).toContainText('No weather alerts are read for this place: this site reads them only from the US National Weather Service, which does not cover it.');
    await expect(notice).not.toContainText('Alerts not checked'); // nothing was refused or unanswered: none was asked
    await expect(page.locator('.pill', { hasText: /^forecast clear$/ })).toBeVisible();
    await expect(page.locator('.pill', { hasText: 'frost: clear' })).toHaveCount(0);
  });
}
