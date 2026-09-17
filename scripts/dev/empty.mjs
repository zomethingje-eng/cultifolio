import { chromium } from '@playwright/test';
const B = 'http://127.0.0.1:4173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w, h, tag] of [[390, 844, 'm'], [1180, 900, 'd']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  for (const path of ['/', '/plants', '/benches', '/sowings', '/frost', '/plants/new', '/labels', '/backup', '/species/copiapoa-cinerea']) {
    await p.goto(B + path); await p.waitForTimeout(500);
    await p.screenshot({ path: `/tmp/e-${tag}-${path.replace(/\W+/g, '_') || 'home'}.png`, fullPage: true });
  }
  await p.close();
}
await b.close();
