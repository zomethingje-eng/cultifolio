import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await p.goto(B + '/'); await p.waitForTimeout(600); await p.screenshot({ path: '/tmp/ph-home.png', fullPage: false });
await p.goto(B + '/benches'); await p.getByRole('button', { name: 'New location' }).click(); await p.fill('#loc-name', 'Greenhouse'); await p.selectOption('#loc-kind', 'greenhouse'); await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(300);
await p.goto(B + '/plants/new?species=Copiapoa%20cinerea&key=5384013'); await p.waitForTimeout(400);
const v = await p.locator('#f-loc option', { hasText: 'Greenhouse' }).getAttribute('value'); await p.selectOption('#f-loc', v); await p.getByRole('button', { name: /^Add/ }).click(); await p.waitForURL(/plants\/\d/);
await p.goto(B + '/sowings/new?species=Copiapoa%20cinerea&key=5384013'); await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/ph-sownew.png', fullPage: true });
await p.getByRole('button', { name: 'Start batch' }).click(); await p.waitForURL(/sowings\/S/); await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/ph-sowing.png', fullPage: true });
await p.goto(B + '/benches'); await p.locator('.tree .row').first().click(); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/ph-bench.png', fullPage: true });
await p.goto(B + '/backup'); await p.waitForTimeout(400); await p.screenshot({ path: '/tmp/ph-backup.png', fullPage: true });
await p.goto(B + '/labels'); await p.waitForTimeout(800); await p.screenshot({ path: '/tmp/ph-labels.png', fullPage: false });
// touch targets: every button/link in the plant quickbar and tab bar at least 40px tall
await p.goto(B + '/plants/2026-0001'); await p.waitForTimeout(500);
const small = await p.evaluate(() => [...document.querySelectorAll('a.btn, button.btn, #tabbar a, .chipbtn, .quickbar .btn')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => h < 36 || w < 36));
console.log('small targets:', JSON.stringify(small));
await b.close();
