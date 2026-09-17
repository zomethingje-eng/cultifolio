import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const url = process.argv[2], out = process.argv[3], sel = process.argv[4];
await p.goto(url, { waitUntil: 'networkidle' });
if (sel) await p.locator(sel).first().screenshot({ path: out }); else await p.screenshot({ path: out, fullPage: process.argv[5] === 'full' });
await b.close();
