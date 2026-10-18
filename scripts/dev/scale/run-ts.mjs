// Bundles one of this folder's entries with the app's own modules for plain node, as cold.mjs does (`import.meta.glob`,
// the fixture corpus, becomes an empty object; the `$` aliases resolve as SvelteKit's do; `$app/*` is a stub), then runs
// it with the arguments given (round seventy-six: the proof and the cold measurements of the Worker without the index).
//   SCALE_TMP=<scratch dir> node scripts/dev/scale/run-ts.mjs <entry.ts> [args...]
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, basename } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const alias = { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $climate: 'src/lib/climate', $lib: 'src/lib' };
export async function bundle(entry, out) {
  await build({
    entryPoints: [resolve(entry)],
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    nodePaths: [resolve(root, 'node_modules')],
    plugins: [{
      name: 'kit',
      setup(b) {
        b.onResolve({ filter: /^\$(core|dossier|climate|lib)\// }, (a) => {
          const [head, ...rest] = a.path.split('/');
          const p = resolve(root, alias[head], ...rest);
          for (const ext of ['', '.ts', '.js', '/index.ts']) { try { readFileSync(p + ext); return { path: p + ext }; } catch { /* next */ } }
          return { path: p };
        });
        b.onResolve({ filter: /^\$app\// }, () => ({ path: 'app', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const building = false, version = { name: "scale" }, dev = false, browser = false;', loader: 'js' }));
        b.onLoad({ filter: /\.ts$/ }, (a) => ({ contents: readFileSync(a.path, 'utf8').replace(/import\.meta\.glob\([^)]*\)/g, '({})'), loader: 'ts' }));
      }
    }]
  });
  return out;
}
if (process.argv[1] === import.meta.filename) {
  const [entry, ...args] = process.argv.slice(2);
  const out = await bundle(entry, resolve(process.env.SCALE_TMP ?? '/tmp', `${basename(entry, '.ts')}.bundle.mjs`));
  const r = spawnSync(process.execPath, [...(process.env.NODE_ARGS ?? '').split(' ').filter(Boolean), out, ...args], { cwd: root, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
