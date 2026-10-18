// What `wrangler tail --format json` wrote, one line a request: how it ended, its CPU and wall time, and the address,
// in the order the requests came (round seventy-six; docs/DEPLOY.md, "A cold start's CPU and memory").
//   node scripts/tail-summary.mjs tail.json
// The file holds one JSON object after another (wrangler writes them pretty-printed); anything else in it is passed by.
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'tail.json';
let text;
try { text = readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { console.log(`${file} is not there: run wrangler tail first (docs/DEPLOY.md).`); process.exit(1); }
// Split into top-level objects by brace depth, outside strings.
const objs = [];
let depth = 0, start = -1, inStr = false, esc = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') inStr = true;
  else if (ch === '{') { if (depth++ === 0) start = i; }
  else if (ch === '}' && depth > 0 && --depth === 0) { try { objs.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not one of tail's */ } }
}
const rows = objs.filter((o) => o && typeof o === 'object' && 'outcome' in o).map((o) => ({ outcome: String(o.outcome), cpu: o.cpuTime ?? o.event?.cpuTime, wall: o.wallTime ?? o.event?.wallTime, url: o.event?.request?.url ?? '' }));
if (!rows.length) { console.log(`${file} holds no requests. Leave wrangler tail running while you open the pages, then press Ctrl-C.`); process.exit(1); }
const pad = (s, n) => String(s ?? '').padEnd(n);
console.log(`${pad('outcome', 16)}${pad('cpu ms', 8)}${pad('wall ms', 9)}address`);
for (const r of rows) console.log(`${pad(r.outcome, 16)}${pad(r.cpu ?? '?', 8)}${pad(r.wall ?? '?', 9)}${r.url.replace(/^https?:\/\/[^/]+/, '')}`);
const bad = rows.filter((r) => r.outcome !== 'ok');
const most = Math.max(...rows.map((r) => Number(r.cpu) || 0));
console.log(`\n${rows.length} requests; the most CPU any took: ${most} ms.${bad.length ? ` ${bad.length} did not end "ok": ${[...new Set(bad.map((r) => r.outcome))].join(', ')}. Tell the developer which addresses.` : ' Every one ended "ok".'}`);
