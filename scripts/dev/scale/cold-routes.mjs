// Runs cold-routes.ts (bundled as run-ts.mjs bundles) in a fresh process three times a case, and prints the medians.
//   SCALE_TMP=<scratch> node scripts/dev/scale/cold-routes.mjs <dir holding s/v2> <label> [case ...]
// A case is what:arg, e.g. species:copiapoa-cinerea home: dossier:5384013 search:aloe
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { bundle } from './run-ts.mjs';

const [root, label, ...cases] = process.argv.slice(2);
const out = await bundle(resolve(import.meta.dirname, 'cold-routes.ts'), resolve(process.env.SCALE_TMP ?? '/tmp', `cold-routes-${label}.bundle.mjs`));
const median = (xs) => xs.slice().sort((a, b) => a - b)[1];
for (const c of cases.length ? cases : ['species:copiapoa-cinerea', 'home:', 'dossier:5384013', 'search:aloe']) {
  const [what, ...rest] = c.split(':');
  const runs = [0, 1, 2].map(() => JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--single-threaded', '--max-old-space-size=4096', out, root, what, rest.join(':')], { encoding: 'utf8', cwd: resolve(import.meta.dirname, '../../..') }).trim().split('\n').pop()));
  console.log(JSON.stringify({ label, ...runs[0], ms: median(runs.map((r) => r.ms)), heapMB: median(runs.map((r) => r.heapMB)) }));
}
