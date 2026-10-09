// Draws the link-preview image, static/og.png (1200 x 630), from scripts/dev/og.html in Chromium:
//   node scripts/dev/og.mjs            (Playwright's own Chromium; PW_CHROMIUM=<path> for another)
// The page's fonts are the files the site serves, put in as data URLs (a file:// page may not load a font beside it).
// Its words and OG_ALT (src/lib/ui/ref/head.ts) say the same thing: change both (round sixty-three; the review of round
// sixty-two, 8 and 11). Nothing imports this.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const font = (p) => `data:font/woff2;base64,${readFileSync(root + 'node_modules/' + p).toString('base64')}`;
const html = readFileSync(root + 'scripts/dev/og.html', 'utf8')
  .replace('FONT_SERIF', font('@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2'))
  .replace('FONT_SANS', font('@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2'))
  .replace('FONT_MONO', font('@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2'));

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
// Every face drawn must be the site's, not a fallback: a missing font file would otherwise draw a different image quietly.
const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
for (const f of ['Newsreader Variable', 'Public Sans Variable', 'DM Mono']) if (!loaded.includes(f) && !loaded.includes(`"${f}"`)) throw new Error(`og.mjs: ${f} did not load`);
// Nothing may run past the image's edge.
const over = await page.evaluate(() => [...document.querySelectorAll('h1, p')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > 1200 - 40 || r.bottom > 630 - 30; }).map((e) => e.className || e.tagName));
if (over.length) throw new Error(`og.mjs: runs past the edge: ${over.join(', ')}`);
const png = await page.screenshot({ type: 'png' });
await browser.close();
const out = root + 'static/og.png';
writeFileSync(out, png);
console.log(`static/og.png: 1200 x 630, ${Math.round(statSync(out).size / 1024)} KB`);
