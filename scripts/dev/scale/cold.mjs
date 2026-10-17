// Bundles cold-entry.ts with the app's modules for plain node (no Vite): `import.meta.glob` (the fixture corpus, which a
// real corpus never reads) becomes an empty object, the `$` aliases resolve as SvelteKit's do, and the packages
// (@sveltejs/kit, valibot) are bundled from the project's node_modules. Then runs it on each index given, in a fresh
// process each time, three times, and prints the median of each step.
//   SCALE_TMP=<scratch dir> node scripts/dev/scale/cold.mjs <index.json>...
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const out = resolve(process.env.SCALE_TMP ?? '/tmp', 'cold.bundle.mjs');
const alias = { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $climate: 'src/lib/climate', $lib: 'src/lib' };
await build({
  entryPoints: [resolve(import.meta.dirname, 'cold-entry.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
  nodePaths: [resolve(root, 'node_modules')],
  plugins: [{
    name: 'kit',
    setup(b) {
      b.onResolve({ filter: /^\$(core|dossier|climate|lib)\// }, (a) => {
        const [head, ...rest] = a.path.split('/');
        let p = resolve(root, alias[head], ...rest);
        for (const ext of ['', '.ts', '.js', '/index.ts']) { try { readFileSync(p + ext); return { path: p + ext }; } catch { /* next */ } }
        return { path: p };
      });
      b.onResolve({ filter: /^\$app\// }, () => ({ path: 'app', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const building = false, version = { name: "scale" }, dev = false, browser = false;', loader: 'js' }));
      b.onLoad({ filter: /\.ts$/ }, (a) => ({ contents: readFileSync(a.path, 'utf8').replace(/import\.meta\.glob\([^)]*\)/g, '({})'), loader: 'ts' }));
    }
  }]
});
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const file of process.argv.slice(2)) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--single-threaded', '--max-old-space-size=4096', out, file], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop()));
  const r = runs[0];
  console.log(JSON.stringify({
    file, entries: r.entries, textMB: r.textMB, baseHeapMB: r.baseHeapMB,
    coldMs: median(runs.map((x) => x.coldMs)), coldHeapMB: median(runs.map((x) => x.coldHeapMB)),
    steps: r.steps.map((s, j) => ({ step: s.step, ms: median(runs.map((x) => x.steps[j].ms)), heapMB: median(runs.map((x) => x.steps[j].heapMB)) }))
  }, null, 1));
}
