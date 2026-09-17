import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
// a place
await p.goto(B + '/benches'); await p.getByRole('button', { name: 'New location' }).click();
await p.fill('#loc-name', 'South window'); await p.selectOption('#loc-kind', 'room'); await p.getByRole('button', { name: 'Add', exact: true }).click();
await p.getByRole('button', { name: 'New location' }).click();
await p.fill('#loc-name', 'Greenhouse'); await p.selectOption('#loc-kind', 'room'); await p.getByRole('button', { name: 'Add', exact: true }).click();
// species -> add one (prefilled)
await p.goto(B + '/species/copiapoa-cinerea'); await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/f1-species-before.png', fullPage: false });
await p.locator('a', { hasText: /Add one|Add a plant/ }).first().click();
await p.waitForURL(/plants\/new/); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/f2-addplant.png', fullPage: true });
const v = await p.locator('#f-loc option', { hasText: 'South window' }).getAttribute('value'); await p.selectOption('#f-loc', v);
await p.getByRole('button', { name: /^Add/ }).click(); await p.waitForURL(/plants\/\d/); await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/f3-plant.png', fullPage: true });
// move verb
await p.getByRole('button', { name: 'Move', exact: true }).click(); await p.waitForTimeout(200);
await p.screenshot({ path: '/tmp/f4-move.png', fullPage: false });
// species page shows ownership
await p.goto(B + '/species/copiapoa-cinerea'); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/f5-species-owned.png', fullPage: false });
// bench shortcuts
await p.goto(B + '/benches'); await p.locator('.tree .row').first().click(); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/f6-bench.png', fullPage: false });
// remembered location on a fresh add
await p.goto(B + '/plants/new'); await p.waitForTimeout(400);
console.log('remembered loc:', await p.locator('#f-loc option:checked').textContent());
await b.close();
