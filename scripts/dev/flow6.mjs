import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
await p.goto(B + '/sync'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/s1-idle.png' });
await p.click('#sync-start'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/s2-create.png' });
await p.check('#key-saved'); await p.click('#sync-create'); await p.waitForTimeout(1500);
await p.click('#sync-show-key'); await p.waitForTimeout(500); await p.screenshot({ path: '/tmp/s3-on.png', fullPage: true });
await b.close();
