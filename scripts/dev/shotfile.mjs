import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
await p.goto('file://' + process.argv[2]); await p.waitForTimeout(500);
await p.screenshot({ path: process.argv[3], fullPage: true }); await b.close();
