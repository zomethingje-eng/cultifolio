// A cold isolate under the proposed design (docs/SCALE-STUDY.md section 2), in node: what a first species page reads
// (one name shard), and what a first search reads and holds (the search core, parsed into the arrays the ranking reads).
// Wall time and the heap held after a full GC, each in a fresh process, the median of three.
//   node --expose-gc design-cold.mjs <OUTDIR from design-products.ts>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.argv[2] === '--child') {
  const [, , , dir, what] = process.argv;
  const heap = () => { gc(); gc(); return process.memoryUsage().heapUsed / 1048576; };
  const base = heap();
  let held, ms;
  if (what === 'name') {
    // the largest shard: the worst case of a page's one lookup
    const big = readdirSync(`${dir}/names`).map((f) => [f, statSync(`${dir}/names/${f}`).size]).sort((a, b) => b[1] - a[1])[0][0];
    const buf = readFileSync(`${dir}/names/${big}`);
    const t = performance.now();
    held = JSON.parse(new TextDecoder().decode(buf));
    ms = performance.now() - t;
  } else {
    const buf = readFileSync(`${dir}/core.json`);
    const t = performance.now();
    held = JSON.parse(new TextDecoder().decode(buf));
    ms = performance.now() - t;
  }
  console.log(JSON.stringify({ what, ms: Math.round(ms * 10) / 10, heapMB: Math.round((heap() - base) * 10) / 10, n: held ? 1 : 0 }));
  process.exit(0);
}
const median = (xs) => xs.slice().sort((a, b) => a - b)[1];
for (const dir of process.argv.slice(2)) {
  const out = { dir };
  for (const what of ['name', 'core']) {
    const runs = [0, 1, 2].map(() => JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--single-threaded', import.meta.filename, '--child', dir, what], { encoding: 'utf8' })));
    out[what] = { ms: median(runs.map((r) => r.ms)), heapMB: median(runs.map((r) => r.heapMB)) };
  }
  console.log(JSON.stringify(out));
}
