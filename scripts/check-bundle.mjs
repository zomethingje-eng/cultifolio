// The bundle gate (round sixty-two; the harness review's 3, outside reviews A43 and B): the built root layout must not
// pull the grower's feature set or the backup module into every page. Until now a unit test read the
// last build's manifest and skipped itself when that build was older than the sources, so it skipped on every deploy
// (`npm run deploy` tests before it builds) and on every fresh clone, and judged freshness by mtimes, which a restore
// with old mtimes fools. This runs after every build instead (`scripts/attach-do.mjs` calls it, and `npm run build`
// runs that after `vite build`): the deploy's build, Playwright's webServer build and a developer's. It fails, never
// skips: when the manifest is missing, when the build was made from other sources than the ones here now, or when the
// layout holds a banned module.
//
// Banned by module path, not by chunk name (round sixty-seven; triage-66 H6, R45-13). Until now it looked for chunks
// named "grow" and "backup"; the grow barrel (src/lib/ui/grow/index.ts) was deleted in round sixty-one, so no chunk has
// that name and half the gate could never fail, and a chunk's name is whatever module the bundler names it after. Now:
//   - every module under src/lib/backup/ is banned from the layout;
//   - every module under src/lib/ui/grow/ is banned, except the few the layout draws on purpose (`LAYOUT_GROW` below,
//     each with its reason), so a grower feature that a change pulls in is caught by its path;
//   - the modules are read from the layout's static import closure in the sources the build was made from (the stamp
//     below proves they are the same): `src/routes/+layout.svelte` and any `+layout.ts`, following every static
//     `import` and `export … from` through src/ and Kit's aliases, and never a dynamic `import()`, which loads on demand;
//   - and in the build itself, no chunk the layout's chunk reaches is the entry of a banned module (Vite names an entry's
//     `src` in the manifest; demo-seed.ts, imported on demand, is one).
//
//   node scripts/check-bundle.mjs           check the build in .svelte-kit/output against the sources here now
//   node scripts/check-bundle.mjs --record  first record what the build was made from (the build itself does this)
//
// "Made from" is a hash of the contents of every file under src/ and of the files that shape the bundle beside it
// (svelte.config.js, vite.config.ts, package-lock.json), recorded in .svelte-kit/output/build-sources.json. Contents,
// not mtimes: sources restored with their old mtimes, or a checkout switched under an old build, are told apart.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const OUT = '.svelte-kit/output';
const MANIFEST = `${OUT}/client/.vite/manifest.json`;
const STAMP = `${OUT}/build-sources.json`;
const BESIDE = ['svelte.config.js', 'vite.config.ts', 'package-lock.json'];
/** Module paths the layout's closure must not hold: the grower's features and the backup module (round sixty, a11y-perf 3; by path since round sixty-seven, triage-66 H6). */
const BANNED = ['src/lib/backup/', 'src/lib/ui/grow/'];
/**
 * The modules under src/lib/ui/grow/ the layout draws on purpose, each small and needed on every page (round sixty-seven;
 * triage-66 H6). Anything else there reached from the layout fails the gate.
 */
const LAYOUT_GROW = new Map([
  ['src/lib/ui/grow/GrowLayer.svelte', "the example's bar, the first plant's persist ask and the backup nudge (round sixty)"],
  ['src/lib/ui/grow/DemoBar.svelte', "the example's bar, drawn by GrowLayer on every page while the example is open"],
  ['src/lib/ui/grow/example.svelte.ts', 'the example as the answer to an empty grower page, decided by the layout (round sixty-three, V2)'],
  ['src/lib/ui/grow/IosFirst.svelte', "the iPhone's Home Screen advice before the first plant, drawn by the layout's InstallBar (round sixty)"],
  ['src/lib/ui/grow/ios.ts', "whether this is an iPhone browser tab, for InstallBar and IosFirst (round sixty)"]
]);

const fail = (m) => {
  console.error(`check-bundle: ${m}`);
  process.exit(1);
};

/** Every file under `dir`, by its path with forward slashes, sorted, so the hash is the same on every system. */
function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...files(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
function sourcesHash() {
  if (!existsSync('src')) fail('there is no src/ here: run this from the repository root');
  const h = createHash('sha256');
  const all = [...files('src'), ...BESIDE.filter((f) => existsSync(f))].sort();
  // Line endings are normalised: a Windows checkout with autocrlf builds the same bundle from the same text.
  for (const f of all) h.update(`${f}\0`).update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).update('\0');
  return { sha256: h.digest('hex'), files: all.length };
}

if (!existsSync(MANIFEST)) fail(`${MANIFEST} is missing: there is no build to check (run \`npm run build\`)`);

const now = sourcesHash();
if (process.argv.includes('--record')) writeFileSync(STAMP, `${JSON.stringify(now, null, 2)}\n`);
if (!existsSync(STAMP)) fail(`${STAMP} is missing: this build did not record its sources, so it cannot be told from a build of others (run \`npm run build\`)`);
let made;
try {
  made = JSON.parse(readFileSync(STAMP, 'utf8'));
} catch {
  fail(`${STAMP} cannot be read`);
}
if (made?.sha256 !== now.sha256) fail(`the build in ${OUT} was made from other sources than the ones here now (${made?.files ?? '?'} files then, ${now.files} now): build again before checking or deploying it`);

let m;
try {
  m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch {
  fail(`${MANIFEST} cannot be read`);
}
const layout = Object.keys(m).find((k) => /nodes\/0\.js$/.test(k));
if (!layout) fail('the manifest has no root layout chunk (nodes/0.js): the build is not the one this gate knows');
const seen = new Set();
const walk = (k) => {
  if (seen.has(k)) return;
  seen.add(k);
  for (const i of m[k]?.imports ?? []) walk(i);
};
walk(layout);
const banned = (p) => BANNED.some((b) => p.startsWith(b)) && !LAYOUT_GROW.has(p);
// In the build: a chunk the layout reaches that is a banned module's own entry.
const entries = [...seen].map((k) => m[k]?.src ?? '').filter((p) => p && banned(p));
// In the sources the build was made from: every module the layout imports statically, by path.
const modules = layoutModules();
const held = [...modules.keys()].filter(banned).sort();
const all = [...new Set([...entries, ...held])];
if (all.length) fail(`the root layout holds ${all.join(', ')}${held.length ? ` (imported by ${held.map((p) => modules.get(p)).join(', ')})` : ''}: every page would load ${all.length === 1 ? 'it' : 'them'} (round sixty, a11y-perf 3). Import it where it is used, or on demand with import(); a module the layout must draw from src/lib/ui/grow/ is named in LAYOUT_GROW with its reason.`);
const grow = [...modules.keys()].filter((p) => LAYOUT_GROW.has(p));
console.log(`check-bundle: the layout's ${seen.size} chunks and ${modules.size} modules hold nothing under ${BANNED.join(' or ')} but ${grow.length} named module${grow.length === 1 ? '' : 's'}; built from these sources (${now.files} files)`);

/**
 * The layout's static import closure in src/: a map from each module's path (forward slashes, from the root) to the
 * module that first imported it. Type-only imports, dynamic `import()`, packages and Kit's own `$app` modules are not
 * followed; a `?url` or `?raw` import is an asset, not code.
 */
function layoutModules() {
  const aliases = kitAliases();
  const out = new Map();
  const queue = ['src/routes/+layout.svelte', 'src/routes/+layout.ts', 'src/routes/+layout.js'].filter((p) => existsSync(p));
  if (!queue.length) fail('there is no src/routes/+layout.svelte here: the gate cannot read the layout');
  for (const p of queue) out.set(p, '(the layout)');
  while (queue.length) {
    const from = queue.shift();
    for (const spec of staticImports(readFileSync(from, 'utf8'), from.endsWith('.svelte'))) {
      const to = resolveImport(spec, from, aliases);
      if (to && !out.has(to)) { out.set(to, from); queue.push(to); }
    }
  }
  return out;
}

/** Kit's aliases: `$lib` and those svelte.config.js names (`alias: { $core: 'src/lib/core', … }`). */
function kitAliases() {
  const a = new Map([['$lib', 'src/lib']]);
  const cfg = existsSync('svelte.config.js') ? readFileSync('svelte.config.js', 'utf8') : '';
  const block = /alias:\s*\{([^}]*)\}/.exec(cfg)?.[1] ?? '';
  for (const [, k, v] of block.matchAll(/['"]?(\$\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g)) a.set(k, v.replace(/^\.\//, '').replace(/\/$/, ''));
  return a;
}

/** The specifiers a module imports statically: `import … from`, `import '…'`, `export … from`, never `import type` or `import()`. */
function staticImports(text, svelte) {
  let code = svelte ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]).join('\n') : text;
  code = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs = [];
  for (const x of code.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s+(type\s+)?(?:[\w$*{},\s]+?\s+from\s+)?(['"])([^'"\n]+)\2/g)) if (!x[1]) specs.push(x[3]);
  return specs;
}

/** A specifier's file in src/, or null for a package, Kit's own modules, an asset or a file not found. */
function resolveImport(spec, from, aliases) {
  if (/\?(url|raw|inline)\b/.test(spec) || /\.(css|woff2?|png|svg|jpe?g|json)$/.test(spec)) return null;
  let base = null;
  if (spec.startsWith('.')) base = joinPath(from.slice(0, from.lastIndexOf('/')), spec);
  else for (const [k, v] of aliases) if (spec === k || spec.startsWith(`${k}/`)) { base = v + spec.slice(k.length); break; }
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`]) if (existsSync(c) && !isDir(c)) return c;
  return null;
}
function joinPath(dir, rel) {
  const parts = dir.split('/');
  for (const s of rel.split('/')) {
    if (s === '..') parts.pop();
    else if (s !== '.' && s !== '') parts.push(s);
  }
  return parts.join('/');
}
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
