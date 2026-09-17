import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
for (const [n, cv, fn] of [['Copiapoa cinerea', '', 'KK 1462'], ["Copiapoa cinerea 'Silver'", '', ''], ['Welwitschia mirabilis', '', ''], ["Copiapoa cinerea x C. gigantea 'Cross'", '', '']]) {
  await p.goto(B + '/plants/new'); await p.fill('#species-name', n); await p.locator('#species-name').blur(); if (fn) await p.fill('#f-field', fn);
  await p.getByRole('button', { name: /^Add/ }).click(); await p.waitForURL(/plants\/\d/);
}
await p.goto(B + '/labels'); await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/l1-labels.png', fullPage: true });
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: '/tmp/labels.pdf', preferCSSPageSize: true, printBackground: true });
await p.emulateMedia({ media: 'screen' });
await p.selectOption('#lb-sheet', '5163'); await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/l2-5163.png', fullPage: false, clip: { x: 100, y: 600, width: 1000, height: 300 } });
await p.goto(B + '/species/copiapoa-cinerea#s-cultivation'); await p.waitForTimeout(800);
await p.locator('#gen-note').screenshot({ path: '/tmp/l3-note.png' });
await b.close();
