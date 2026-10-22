/**
 * Round eighty (S): the search's key files for an index, weighed (`buildSearchFiles`, as `--index` writes them): how many,
 * their bytes by kind (directories, light exact and near files, heavy answers, Kew's `@` files, regions' `=` answers), the median, 95th percentile and
 * largest light file, and the build's time. With an output directory, every file is written there under its hash, for
 * `r80s-search-time.ts` to read. Dev only.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r80s-search-size.ts <index.json> [<out dir>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildSearchFiles } from '$core/search-files';
import { prepare } from '$core/search';
import { md5 } from '$dossier/md5';
import type { IndexEntry } from '$dossier/index-entry';

const [file, out] = process.argv.slice(2);
const idx = JSON.parse(readFileSync(file, 'utf8')) as IndexEntry[];
if (out) mkdirSync(out, { recursive: true });
const t = performance.now();
const sizes = new Map<string, number>();
const whole = prepare(idx);
const b = buildSearchFiles(idx, whole, md5, (h, body) => { sizes.set(h, body.length); if (out) writeFileSync(`${out}/${h}.json`, body); });
const ms = Math.round(performance.now() - t);
const kinds: Record<string, number[]> = { exact: [], near: [], answers: [], kew: [], regions: [] };
const seen = new Set<string>();
let dirBytes = 0, dirMax = 0, topBytes = 0;
for (const [name, body] of b.named) {
  if (out) writeFileSync(`${out}/${name.replace(/\//g, '_')}`, body);
  if (!/^search\/(?:top|\d+)\.json$/.test(name)) continue;
  if (name === 'search/top.json') topBytes = body.length; else { dirBytes += body.length; dirMax = Math.max(dirMax, body.length); }
  for (const [k, e] of Object.entries(JSON.parse(body) as Record<string, [number, string?, number?]>)) {
    if (e.length < 2 || seen.has(e[1]!)) continue;
    seen.add(e[1]!);
    kinds[k.startsWith('@') ? 'kew' : k.startsWith('=') ? 'regions' : e[2] === 1 ? 'answers' : k.startsWith('~') ? 'near' : 'exact'].push(sizes.get(e[1]!) ?? 0);
  }
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
const all = [...sizes.values()];
console.log(JSON.stringify({
  file, species: idx.length, buildMs: ms, files: sizes.size, totalMB: mb(sum(all)), top: topBytes, dirsMB: mb(dirBytes), dirMax,
  ...Object.fromEntries(Object.entries(kinds).map(([k, xs]) => [k, { n: xs.length, MB: mb(sum(xs)), median: q(xs, 0.5), p95: q(xs, 0.95), max: q(xs, 1) }])),
  counts: b.counts
}));
