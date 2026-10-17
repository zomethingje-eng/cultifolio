/**
 * Round sixty-nine, agent P (triage-68 P5, R46-31): every `<details>` in the source opened with ONE press, as a person
 * taps it, and what the press did checked as r67h-disclosure checks its three (the summary did not move between the press
 * and the release, one click and one toggle followed, and it is open). The list is tests/e2e/helpers/disclosure-list.ts,
 * which a unit test holds to the source; each page and state is set up here, once per page, and its disclosures are
 * pressed in turn. On the base 22 of the 25 were pressed by no test (and the list did not exist).
 */
import { test, expect, type Page } from '@playwright/test';
import { pressOnce, type Press } from './helpers/disclosure';
import { DISCLOSURES, type Disclosure } from './helpers/disclosure-list';
import { inject, injectChanges, type Row } from './helpers/inject';
import { fromAddress } from './helpers/address';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
});

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
function oneTap(r: Press) {
  expect({ opened: r.opened, clicks: r.clicks, toggles: r.toggles, moved: r.downTop !== r.upTop }, JSON.stringify(r)).toEqual({ opened: true, clicks: 1, toggles: 1, moved: false });
}
const plant = (id: string, no: string, extra: Record<string, unknown> = {}): Row[] => [
  ['accession', id, 'acc', no], ['accession', id, 'taxonName', 'Copiapoa cinerea'], ['accession', id, 'taxonKey', 5384013], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'],
  ...Object.entries(extra).map(([f, v]) => ['accession', id, f, v] as Row)
];
const HOUR = 3_600_000;
const days = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
const forecast = (alertsStatus: string) => JSON.stringify({ lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: -5 }, alerts: [], alertsStatus, risk: { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)', 'Alerts: NOAA National Weather Service'] });

/** Each page and the state its disclosures need; the page they are pressed on is returned. */
const setups: Record<string, (page: Page) => Promise<Page>> = {
  how: async (page) => { await page.goto('/about/how'); await ready(page); return page; },
  species: async (page) => { await page.goto('/species/copiapoa-cinerea'); await ready(page); return page; },
  add: async (page) => { await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page); return page; },
  import: async (page) => { await page.goto('/plants/import'); await ready(page); await page.click('#imp-mode-csv'); return page; },
  plant: async (page) => {
    await page.goto('/plants'); await ready(page);
    await inject(page, [['location', 'dlg', 'name', 'Greenhouse'], ['location', 'dlg', 'type', 'greenhouse'], ...plant('dp1', '2026-0001', { notes: 'Repotted in spring.', locationId: 'dlg' })], Date.now() - 2 * HOUR, 'abcdefabcdef0000');
    // Another device's edit made without seeing that text: the earlier one is "replaced".
    await inject(page, [['accession', 'dp1', 'notes', 'Moved to the top shelf.']], Date.now() - HOUR, 'fedcbafedcba0000');
    await page.goto('/plants/dp1'); await ready(page);
    return page;
  },
  'plant-habitat': async (page) => {
    await setups.plant(page);
    await page.locator('#habitat').evaluate((d) => { (d as HTMLDetailsElement).open = true; });
    return page;
  },
  plants: async (page) => {
    await page.goto('/plants'); await ready(page);
    await inject(page, plant('dp2', '2026-0002', { price: '£12', acquired: `${new Date().getFullYear()}-03-01` }), Date.now() - HOUR);
    await page.goto('/plants'); await ready(page);
    return page;
  },
  parked: async (page) => {
    // A record whose missing fields are all parked (as r62l's clock 3): its page says "Parked", with Why?.
    await page.goto('/plants'); await ready(page);
    const W = 'abcdefabcdef0000';
    const far = Date.now() + 365 * 86_400_000;
    const at = (i: number) => `${String(far).padStart(13, '0')}-${i.toString(16).padStart(4, '0')}-${W}`;
    const made = [['acc', '2026-0003'], ['taxonName', 'Copiapoa cinerea'], ['status', 'growing']].map(([field, value], i) => ({ t: at(i), kind: 'accession', id: 'dp3', field, value }));
    // An edit placed past the creation's stamp (marked), made after the clock was put right: the record is there, its fields parked.
    const edit = { t: `${String(far).padStart(13, '0')}-800003-${W}`, kind: 'accession', id: 'dp3', field: 'notes', value: 'repotted' };
    await injectChanges(page, [...made, edit], made.map((c) => c.t));
    await page.goto('/plants/dp3'); await ready(page);
    return page;
  },
  today: async (page) => {
    // The NWS did not answer: the nights, folded, hold the alerts' "not checked".
    await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: forecast('unanswered') }));
    await page.goto('/plants'); await ready(page);
    await page.evaluate(() => localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05 })));
    await inject(page, plant('dp4', '2026-0004', { acquired: '2026-01-01' }), Date.now() - 40 * 86_400_000);
    await page.goto('/today'); await ready(page);
    await expect(page.locator('#frost details.nights')).toBeVisible({ timeout: 15_000 });
    return page;
  },
  backup: async (page) => {
    // A backup made on one device, opened on another that holds a different plant: the file adds a plant here, and
    // "What's in the file" lists it.
    await page.goto('/plants'); await ready(page);
    await inject(page, [...plant('dp5', '2026-0005'), ['taxon', 'copiapoa-cinerea', 'name', 'Copiapoa cinerea'], ['taxon', 'copiapoa-cinerea', 'myNotes', 'Flowers in March here.']], Date.now() - HOUR);
    await page.goto('/backup'); await ready(page);
    const dl = page.waitForEvent('download');
    await page.click('#bk-export');
    const path = await (await dl).path();
    const other = await page.context().browser()!.newContext({ serviceWorkers: 'block' });
    const b = await other.newPage();
    await b.goto('/plants'); await ready(b);
    await inject(b, [['accession', 'dq1', 'acc', '2026-0001'], ['accession', 'dq1', 'taxonName', 'Aloe vera'], ['accession', 'dq1', 'status', 'growing']], Date.now() - HOUR, 'fedcbafedcba0000');
    await b.goto('/backup'); await ready(b);
    await b.locator('#bk-file').setInputFiles(path!);
    await expect(b.locator('#bk-preview')).toBeVisible({ timeout: 15_000 });
    return b;
  },
  sync: async (page) => {
    // A vault made here, then a listing the server fails: the card says so, and the engine's words are one tap away.
    await fromAddress(page);
    await page.goto('/sync'); await ready(page);
    await page.click('#sync-start');
    const key = (await page.locator('#vault-key').textContent())!.trim();
    await page.fill('#key-typeback', key.slice(-5).toLowerCase());
    await page.click('#sync-create');
    await expect(page.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: 20_000 });
    await page.route(/\/api\/sync\/log\?vault=[^&]+&/, (r) => (r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal Error"}' }) : r.fallback()));
    await page.reload(); await ready(page);
    await expect(page.locator('#sync-error-detail')).toBeVisible({ timeout: 20_000 });
    return page;
  }
};

const byPage: Record<string, Disclosure[]> = {};
for (const d of DISCLOSURES) if (!d.unreached) (byPage[d.at] ??= []).push(d);

for (const [at, list] of Object.entries(byPage)) {
  test(`r69p P5: on ${at}, each disclosure opens on one press (${list.map((d) => d.sel).join(', ')}) @phone`, async ({ page }) => {
    test.setTimeout(90_000);
    const p = await setups[at](page);
    for (const d of list) {
      await expect(p.locator(d.sel), `${d.file} ${d.cls}`).toBeVisible({ timeout: 15_000 });
      oneTap(await pressOnce(p, d.sel));
    }
  });
}
