// The compressed weight of what the front page (and a species page) requests from this build: script, style, fonts, the document. Run against wrangler dev.
import { chromium } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const path of ['/', '/species/copiapoa-cinerea']) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 } });
  const p = await ctx.newPage();
  const seen = new Map();
  p.on('response', async (r) => {
    const u = new URL(r.url());
    if (u.origin !== 'http://localhost:4173') return;
    try { const body = await r.body(); seen.set(u.pathname, { type: r.headers()['content-type'] ?? '', raw: body.length, gz: gzipSync(body).length }); } catch {}
  });
  await p.goto('http://localhost:4173' + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const rows = [...seen.entries()].filter(([k]) => !k.startsWith('/api/') && !k.startsWith('/s/') && !k.startsWith('/maps/') && !k.endsWith('.png') && !k.endsWith('.svg') && !k.endsWith('.webmanifest') && !k.startsWith('/service-worker'));
  const sum = (f) => rows.filter(f).reduce((a, [, v]) => a + v.gz, 0);
  const js = sum(([, v]) => v.type.includes('javascript')), css = sum(([, v]) => v.type.includes('css')), font = sum(([k]) => k.endsWith('.woff2')), html = sum(([, v]) => v.type.includes('html'));
  console.log(`${path}: ${rows.length} files; gzip kB: html ${(html/1024).toFixed(1)}, js ${(js/1024).toFixed(1)}, css ${(css/1024).toFixed(1)}, fonts ${(font/1024).toFixed(1)}; total ${((html+js+css+font)/1024).toFixed(1)}`);
  await ctx.close();
}
await b.close();
// What the service worker installs on top: every script and style of the build, compressed (the fonts are the Latin subsets above).
const { readdirSync, statSync } = await import('node:fs');
const dir = '.svelte-kit/cloudflare/_app/immutable';
let js = 0, css = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = d + '/' + f; if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) js += gzipSync(readFileSync(p)).length; else if (f.endsWith('.css')) css += gzipSync(readFileSync(p)).length; } };
if (existsSync(dir)) { walk(dir); console.log(`whole build (what the worker installs): gzip kB: js ${(js/1024).toFixed(1)}, css ${(css/1024).toFixed(1)}; total ${((js+css)/1024).toFixed(1)}`); }
