// The bundle gate (round sixty-two; the harness review's 3, outside reviews A43 and B): the built root layout must not
// pull the grower's feature set (the `grow` barrel) or the backup module into every page. Until now a unit test read the
// last build's manifest and skipped itself when that build was older than the sources, so it skipped on every deploy
// (`npm run deploy` tests before it builds) and on every fresh clone, and judged freshness by mtimes, which a restore
// with old mtimes fools. This runs after every build instead (`scripts/attach-do.mjs` calls it, and `npm run build`
// runs that after `vite build`): the deploy's build, Playwright's webServer build and a developer's. It fails, never
// skips: when the manifest is missing, when the build was made from other sources than the ones here now, or when the
// layout's import closure holds either module.
//
//   node scripts/check-bundle.mjs           check the build in .svelte-kit/output against the sources here now
//   node scripts/check-bundle.mjs --record  first record what the build was made from (the build itself does this)
//
// "Made from" is a hash of the contents of every file under src/ and of the files that shape the bundle beside it
// (svelte.config.js, vite.config.ts, package-lock.json), recorded in .svelte-kit/output/build-sources.json. Contents,
// not mtimes: sources restored with their old mtimes, or a checkout switched under an old build, are told apart.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const OUT = '.svelte-kit/output';
const MANIFEST = `${OUT}/client/.vite/manifest.json`;
const STAMP = `${OUT}/build-sources.json`;
const BESIDE = ['svelte.config.js', 'vite.config.ts', 'package-lock.json'];
/** Module names the layout's closure must not hold: the grow barrel and the backup module (round sixty, a11y-perf 3). */
const BANNED = ['backup', 'grow'];

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
const names = [...seen].map((k) => m[k]?.name ?? '');
const found = BANNED.filter((b) => names.includes(b));
if (found.length) fail(`the root layout's chunk imports ${found.map((b) => `"${b}"`).join(' and ')}: every page would load ${found.length === 1 ? 'it' : 'them'} (round sixty, a11y-perf 3). Import what the layout draws from its own file.`);
console.log(`check-bundle: the layout's ${seen.size} chunks hold neither ${BANNED.join(' nor ')}; built from these sources (${now.files} files)`);
