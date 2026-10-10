/**
 * Round sixty-two, agent S: the built Worker against wrangler's own R2, KV and Durable Object (the unit tests use
 * stand-ins). A photograph removed, refused to a stranger's proof, stored again as a new generation and read through its
 * pointer (decision 7; A23); a sync write with `Origin: null` let through only with the engine's mark (A31); and a place
 * whose forecast the site held back asks again once the wait is over (the server review, 6).
 */
import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ownPages } from './helpers/r63v-own';

const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const vaultIdFor = (token: string) => { const d = createHash('sha256').update('id:' + token).digest(); let s = ''; for (let i = 0; i < 26; i++) s += B32[d[i] % B32.length]; return s; };
const OWNER = 'd'.repeat(64);
const STRANGER = 'a'.repeat(64);

test('a removed photograph: its receipt refuses a stranger, its owner stores it again as a new generation, read through the pointer (round sixty-two; decision 7, A23)', async ({ request }) => {
  const token = createHash('sha256').update(`r62s ${Date.now()} ${Math.random()}`).digest('hex');
  const id = vaultIdFor(token);
  const auth = { authorization: `Bearer ${token}` };
  // From a documentation address of its own (wrangler dev takes the header as the client's address), so this spec does not
  // spend the smoke tests' five new vaults a day from 127.0.0.1 (round sixty-two, at the merge).
  expect((await request.post('/api/sync/vault', { headers: { 'cf-connecting-ip': '198.51.100.62' }, data: { id, token, create: true } })).status()).toBe(200);
  const url = `/api/sync/photo/p000r62s?vault=${id}`;
  const put = (drop: string, bytes: number[]) => request.put(url, { headers: { ...auth, 'x-photo-drop': drop, 'content-type': 'application/octet-stream' }, data: Buffer.from(bytes) });
  const get = async () => { const r = await request.get(url, { headers: auth }); return r.status() === 200 ? [...(await r.body())] : r.status(); };
  const head = async () => (await request.head(url, { headers: auth })).status();
  const del = () => request.delete(url, { headers: { ...auth, 'x-photo-drop': OWNER, 'x-photo-removed-at': String(Date.now() + 2_000) } });

  expect((await put(OWNER, [1, 2, 3])).status()).toBe(200);
  expect(await get()).toEqual([1, 2, 3]);
  expect((await del()).status()).toBe(200);
  expect([await get(), await head()]).toEqual([404, 404]);
  // a holder of the token alone, putting back a copy it kept: refused, and nothing is stored
  const stranger = await put(STRANGER, [1, 2, 3]);
  expect(stranger.status()).toBe(403);
  expect(((await stranger.json()) as { error: string }).error).toMatch(/removed/);
  expect(await get()).toBe(404);
  // the owner's device (an Undo after the removal) carries the proof: stored again, and read through the pointer
  expect((await put(OWNER, [4, 5])).status()).toBe(200);
  expect([await get(), await head()]).toEqual([[4, 5], 200]);
  // the same bytes again are "already there"; different bytes are 409, as they always were
  expect(((await (await put(OWNER, [4, 5])).json()) as { stored: boolean }).stored).toBe(false);
  expect((await put(OWNER, [9])).status()).toBe(409);
  // and the new generation is removed in turn
  expect((await del()).status()).toBe(200);
  expect(await get()).toBe(404);
  expect((await del()).status()).toBe(404);
});

test('a sync write with Origin: null and no Sec-Fetch-Site passes only with the engine\'s mark (round sixty-two; A31)', async ({ request }) => {
  const headers = { origin: 'null', 'content-type': 'application/json' };
  const refused = await request.post('/api/sync/vault', { headers, data: {} });
  expect([refused.status(), await refused.text()]).toEqual([403, 'a write from another site']);
  const marked = await request.post('/api/sync/vault', { headers: { ...headers, 'x-cultifolio-sync': '1' }, data: {} });
  expect(marked.status()).toBe(400); // past the origin check: the route itself answers (no vault id)
});

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test.describe('without the service worker', () => {
  test.use({ serviceWorkers: 'block' });
  // The grower's own Places, not the example an empty device opens there (round sixty-three, V2): in Firefox the example
  // opened under the test after "New place" was pressed, and the form it waited for was on the page that went (round
  // sixty-five; the all-engines rerun).
  test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });
  test('a place whose forecast the site held back asks again when the wait is over, and then shows it (round sixty-two; the server review, 6)', async ({ page }) => {
    const days = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
    const ok = JSON.stringify({ forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: 1 }, alerts: [], alertsStatus: 'n/a', risk: { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] });
    let asked = 0;
    let held = true;
    await page.route(/\/api\/forecast/, (r) => {
      asked++;
      if (held) return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'retry-after': '2', 'cache-control': 'no-store' }, body: JSON.stringify({ error: "not asked: this site's calls are used up for this minute", held: true, service: 'met', retryAfter: 2 }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: ok });
    });
    await page.goto('/places');
    await ready(page);
    await page.getByRole('button', { name: 'New place' }).click();
    await page.fill('#loc-name', 'Held frame');
    await page.selectOption('#loc-kind', 'outdoor');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.tree .row', { hasText: 'Held frame' }).click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.selectOption('#e-indoor', 'no');
    await page.fill('#e-lat', '51.50');
    await page.fill('#e-lon', '-0.12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.notice')).toContainText('were not asked');
    const first = asked;
    held = false;
    // two seconds on, unprompted: asked again, and the forecast shown
    await expect(page.locator('.notice')).toContainText('All clear.', { timeout: 10_000 });
    expect(asked).toBeGreaterThan(first);
  });
});
