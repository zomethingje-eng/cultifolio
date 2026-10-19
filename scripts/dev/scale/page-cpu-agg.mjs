// Sorts V8 CPU profiles' self time by what ran (round seventy-seven): page-cpu.mjs and page-cpu-workerd.mjs use it.
//   node scripts/dev/scale/page-cpu-agg.mjs <dir of .cpuprofile files> [top]
// Bundled code is told apart by the region comments its bundler leaves (`//#region <path>`, `// <path>`), read from the
// script's own file where the profile names one.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const regions = new Map();
const sources = new Map();
/** The file that holds the script a profile names by a bare URL (workerd's `_worker.js`). */
export const sourceOf = (url, path) => { sources.set(url, path); regions.delete(url); };
function regionOf(url, line) {
  if (!url) return null;
  let r = regions.get(url);
  if (r === undefined) {
    r = null;
    try {
      const path = sources.get(url) ?? (url.startsWith('file://') ? fileURLToPath(url) : url);
      if (existsSync(path)) r = readFileSync(path, 'utf8').split('\n').map((l) => (/^\/\/#endregion/.test(l) ? '' : /^\/\/(?:#region)? ((?:\.\.\/)*[\w@.\-/]+\.(?:js|mjs|ts|svelte))\s*$/.exec(l)?.[1] ?? null));
    } catch { r = null; }
    regions.set(url, r);
  }
  if (!r) return null;
  for (let i = Math.min(line, r.length - 1); i >= 0; i--) if (r[i] !== null) return r[i] || null;
  return null;
}
const lineAt = new Map();
/** The line of a script that holds this text, for an anonymous function the profile cannot name. */
function lineOf(url, text) {
  const k = `${url}\0${text}`;
  if (!lineAt.has(k)) {
    let at = -1;
    try { const path = sources.get(url) ?? (url.startsWith('file://') ? fileURLToPath(url) : url); if (existsSync(path)) at = readFileSync(path, 'utf8').split('\n').findIndex((l) => l.includes(text)); } catch { /* none */ }
    lineAt.set(k, at);
  }
  return lineAt.get(k);
}
export function category(cf) {
  const f = cf.functionName;
  if (['(garbage collector)', '(program)', '(idle)', '(root)'].includes(f)) return f;
  if (f === 'JSON.parse' || f === 'parse') return 'JSON.parse';
  const r = regionOf(cf.url, cf.lineNumber) ?? cf.url;
  // The bundles' anonymous function that reads and parses a product (`product` in $lib/server/dossiers): JSON.parse runs inside it.
  if (!f && /dossiers/.test(r) && cf.lineNumber === lineOf(cf.url, 'held.p = (async () => {')) return 'JSON.parse (products)';
  if (/valibot/.test(r)) return 'valibot (dossier schema)';
  if (/devalue/.test(r)) return 'devalue (page data)';
  if (/node_modules\/svelte\/|output\/server\/chunks\/(server2?|internal|index-server)\.js/.test(r)) return 'svelte runtime (render)';
  if (/@sveltejs\/kit|output\/server\/(index|internal)\.js|chunks\/(exports|utils|shared|internal)\.js/.test(r)) return `kit runtime${/^sha256|reverse_endianness|^encode\d*$/.test(f) ? ' (CSP sha256)' : /^hash\d*$/.test(f) ? ' (etag djb2)' : ''}`;
  if (/_worker\.js$|wrangler\/templates|miniflare/.test(r)) return 'worker shell (adapter, dev middleware)';
  if (/\.svelte(\.js)?$/.test(r)) return 'app components (render)';
  if (/page\.server/.test(r)) return 'app route load';
  if (/page-cpu/.test(r)) return 'harness';
  if (/^node:|^node-internal:|^$/.test(r)) return `runtime ${f || '(anon)'}`;
  const m = /([\w.-]+)\.(?:js|ts|mjs)$/.exec(r);
  return `app lib ${m ? m[1] : r}`;
}
/** Milliseconds of self time by category over these profiles. */
export function categorise(profiles) {
  const out = {};
  for (const p of profiles) {
    const nodes = new Map(p.nodes.map((n) => [n.id, n]));
    p.samples.forEach((s, i) => { const c = category(nodes.get(s).callFrame); out[c] = (out[c] ?? 0) + (p.timeDeltas[i] ?? 0) / 1000; });
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (existsSync(`${dir}/_worker.js`)) sourceOf('_worker.js', `${dir}/_worker.js`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.cpuprofile'));
  const profiles = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  const by = categorise(profiles);
  const total = Object.entries(by).filter(([k]) => k !== '(idle)').reduce((a, [, v]) => a + v, 0);
  console.log(`${files.length} profiles, ${total.toFixed(0)} ms not idle, ${(total / files.length).toFixed(1)} ms each`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) if (k !== '(idle)') console.log(`${(v / files.length).toFixed(2).padStart(8)} ms ${((100 * v) / total).toFixed(1).padStart(5)}%  ${k}`);
  const top = Number(process.argv[3] ?? 0);
  if (top) {
    const fn = new Map();
    for (const p of profiles) { const nodes = new Map(p.nodes.map((n) => [n.id, n])); p.samples.forEach((s, i) => { const cf = nodes.get(s).callFrame; const k = `${cf.functionName || '(anon)'} ${regionOf(cf.url, cf.lineNumber) ?? cf.url.split('/').pop()}:${cf.lineNumber}`; fn.set(k, (fn.get(k) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000); }); }
    for (const [k, v] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(v / files.length).toFixed(2).padStart(8)} ms  ${k}`);
  }
}
