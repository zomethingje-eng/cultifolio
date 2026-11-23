// Draws the link-preview image, static/app/og.png (1200 x 630), from scripts/dev/og.html in Chromium:
//   node scripts/dev/og.mjs            (Playwright's own Chromium; PW_CHROMIUM=<path> for another)
// The page's fonts and the icon are the files the site serves (static/fonts/, static/app/favicon.svg), put in as data
// URLs (a file:// page may not load a font beside it). Its words and OG_ALT (src/lib/ui/ref/head.ts) say the same thing:
// change both (round sixty-three; the review of round sixty-two, 8 and 11). Nothing imports this.
//
// Round ninety-one: the card names the species count, the index's (static/s/v3/index.json, the corpus on disk, which the
// live check finds is the one the site serves). An image is not drawn again with the corpus (round sixty-three's reason
// for no figure), so this refuses to draw when OG_ALT names another count, and scripts/live-check.mjs fails when the live
// front page's count is not the card's: a card the corpus has outgrown is drawn again, never left saying a stale figure.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const data = (p, type) => `data:${type};base64,${readFileSync(root + p).toString('base64')}`;
const species = JSON.parse(readFileSync(root + 'static/s/v3/index.json', 'utf8')).length;
// Round 110: the list grows each day, and the card is not drawn each day. It says the count rounded down to the thousand
// ("More than 49,000 species"), true as the list grows; the live check fails a card that says more than the site holds.
const count = (Math.floor(species / 1000) * 1000).toLocaleString('en-GB');
// OG_ALT's count, read from its line in head.ts (this script is plain Node, and head.ts is TypeScript).
const alt = /export const OG_ALT = '([^']+)'/.exec(readFileSync(root + 'src/lib/ui/ref/head.ts', 'utf8'))?.[1] ?? '';
const altCount = /More than ([\d,]+) species/.exec(alt)?.[1];
if (altCount !== count) throw new Error(`og.mjs: the index holds ${species.toLocaleString('en-GB')} species and OG_ALT says ${altCount ? `more than ${altCount}` : 'no count'}: set OG_ALT to "More than ${count} species" first, so the card and its words say the same`);
const html = readFileSync(root + 'scripts/dev/og.html', 'utf8')
  .replaceAll('{{FONT_SANS}}', data('static/fonts/source-sans-3/source-sans-3-latin-wght-normal.woff2', 'font/woff2'))
  .replaceAll('{{FONT_SERIF_ITALIC}}', data('static/fonts/source-serif-4/source-serif-4-latin-opsz-italic.woff2', 'font/woff2'))
  .replaceAll('{{ICON}}', data('static/app/favicon.svg', 'image/svg+xml'))
  .replaceAll('{{SPECIES}}', count);
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`og.mjs: not put in: ${left.join(', ')}`);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
// Every face drawn must be the site's, not a fallback: a missing font file would otherwise draw a different image quietly.
const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
for (const f of ['Source Sans 3', 'Source Serif 4']) if (!loaded.includes(f)) throw new Error(`og.mjs: ${f} did not load`);
// Nothing may run past the image's edge: each line's text, measured by its own extent, not its box.
const over = await page.evaluate(() => [...document.querySelectorAll('h1, p')].filter((e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.right > 1200 - 40 || b.bottom > 630 - 30; }).map((e) => e.textContent));
if (over.length) throw new Error(`og.mjs: runs past the edge: ${over.join(' | ')}`);
const png = await page.screenshot({ type: 'png' });
await browser.close();
const out = root + 'static/app/og.png';
writeFileSync(out, png);
console.log(`static/app/og.png: 1200 x 630, ${Math.round(statSync(out).size / 1024)} KB, ${count} species`);
