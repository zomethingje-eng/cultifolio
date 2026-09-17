import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
await p.goto(B + '/plants/new'); await p.fill('#species-name', "Copiapoa cinerea x C. gigantea 'Test Cross'"); await p.locator('#species-name').blur(); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/h1-form.png', fullPage: true });
await p.getByRole('button', { name: /^Add/ }).click(); await p.waitForURL(/plants\/\d/); await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/h2-plant.png', fullPage: false });
await b.close();
