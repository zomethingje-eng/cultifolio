// Round eighty-eight (the speed round): the owner's proof that the faster paths write what the slow one writes, on real
// pages, before a round relies on them (docs/SPEED-88.md, "Proving it on the owner's PC").
//
//   node scripts/dev/r88-prove.mjs              200 pages, built offline three ways (each build reads the bulk files
//                                               or the cache: about 75 minutes, 75 and a few; about three hours in all)
//   node scripts/dev/r88-prove.mjs --n 50       fewer pages
//   node scripts/dev/r88-prove.mjs --compare    the comparison alone, of the r88-prove/ folders a proof left
//   node scripts/dev/r88-prove.mjs --put-back   a proof that stopped (a PC restarted mid-build): its files put back
//
// A sample of the pages in the index (spread over it; none of the species the download left to the API path, whose
// answers GBIF may change between two builds) is built three times with `--keys … --offline --grid climate --bulk bulk`:
//   A  --pages 1 --no-bulk-cache    as round eighty-seven built
//   B  --pages 8                    eight at once, the bulk files read and the cache written
//   C  --pages 8                    eight at once, the cache read
// After each, the pages it wrote are copied to r88-prove/<A|B|C>/, and everything the build wrote is put back as it was:
// the sample's pages, the corpus folder's other files (index.json, report.txt, …) and the project folder's lists
// (drops.txt and the like); a file the build made that was not there is removed. Then the corpus folder is listed again,
// and a page outside the sample that the build changed stops the proof, saying which (the bulk cache and the climate
// cache keep what the builds added; both are caches). Then the three are compared page by page, the build's own times
// taken out. The last lines say "the same" or name each page that differs and where; r88-prove/result.txt keeps them.
//
// A proof that stopped leaves r88-prove/before/kept.json, and the next run refuses until it is dealt with: `--put-back`
// puts back what the stopped proof kept (right when nothing has run since), or, when other steps have run since, the
// file is deleted by hand and the round's backup is the record.
// Takes corpus-step.lock, so it never runs beside a corpus step. Plain Node; the builds run with the heap corpus-step
// gives them.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { takeLock } from '../run-lock.mjs';
import { builderHeap, VERSION } from '../corpus-step.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const n = Number(opt('--n', '200'));
// The builder's arguments (a test runs on a folder without a climate grid).
const base = opt('--args', '--offline --grid climate --bulk bulk').split(' ').filter(Boolean);
const compareOnly = argv.includes('--compare');
const OUT = 'r88-prove';
const BEFORE = join(OUT, 'before');
// The builder and its loader by this file's place, so the proof runs in the project folder it is run from.
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const dir = `static/s/v${VERSION}`;
const SMALL = 64 * 1024 * 1024;

if (!Number.isInteger(n) || n < 1) { console.error('--n takes a whole number'); process.exit(2); }
const lock = takeLock('.', `node scripts/dev/r88-prove.mjs ${argv.join(' ')}`.trim());
if (!lock.ok) { console.error(lock.sentence); process.exit(2); }
process.on('exit', lock.release);

/** Regular files directly in a folder, by name: size and modified time. */
const listing = (d) => new Map(readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const s = statSync(join(d, e.name)); return [e.name, `${s.size} ${s.mtimeMs}`]; }));
const isPage = (f) => /^[kg][1-9]\d*\.json$/.test(f);

/**
 * What is put back after each build, and by a run after a stopped one: r88-prove/before/kept.json names each file kept
 * (its path, and whether it was there), the copies beside it. Written only once every copy is taken.
 */
const KEPT = join(BEFORE, 'kept.json');
function putBack() {
  if (!existsSync(KEPT)) return 0;
  const kept = JSON.parse(readFileSync(KEPT, 'utf8'));
  for (const k of kept) {
    if (k.was) copyFileSync(join(BEFORE, k.copy), k.path);
    else if (existsSync(k.path)) unlinkSync(k.path);
  }
  return kept.length;
}

if (!compareOnly && existsSync(KEPT)) {
  const began = statSync(KEPT).mtime.toISOString().replace('T', ' ').slice(0, 16);
  if (!argv.includes('--put-back')) {
    console.error(`A proof begun ${began} UTC did not finish: ${KEPT} names the files it kept. If nothing has run since, run this again with --put-back, which puts them back as they were before it built; if a corpus step or a build has run since, delete ${KEPT} instead (the files it would put back are older than that step's). Nothing was run.`);
    process.exit(2);
  }
  console.log(`the proof begun ${began} UTC: ${putBack()} files put back from ${BEFORE}`);
  unlinkSync(KEPT);
  process.exit(0);
}
if (argv.includes('--put-back')) { console.log(`no proof to put back (${KEPT} is not there)`); process.exit(0); }

const readKeys = () => readFileSync(join(OUT, 'keys.txt'), 'utf8').split('\n').filter(Boolean).map((l) => ({ key: l.split(' ')[0], name: l.slice(l.indexOf(' ') + 1) }));
let sample;
if (compareOnly) sample = readKeys();
else {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const apiPath = new Set(existsSync('bulk/api-path.txt') ? readFileSync('bulk/api-path.txt', 'utf8').split(/\r?\n/).map((l) => Number(l.split('\t')[0])).filter(Boolean) : []);
  const usable = index.filter((e) => existsSync(join(dir, `${e.key}.json`)) && !(e.gbif && apiPath.has(e.gbif)));
  const step = Math.max(1, Math.floor(usable.length / n));
  sample = usable.filter((_, i) => i % step === 0).slice(0, n);
  console.log(`${sample.length} pages of ${index.length} (every ${step}th of the ${usable.length} not on the API path), built three ways`);
  // Round ninety: each build writes the index at its end, and the index stamps every page changed since its stamp (a fill
  // since the last index: scanDossiers in build-dossiers.ts). Such a page outside the sample is one the proof cannot put
  // back, so it stopped after its first build, an hour on (14 November 2026, on the flowering fill's pages). Checked here,
  // before anything is built, with the builder's own stamp and hash.
  const stale = await staleOutside(new Set(sample.map((e) => `${e.key}.json`)));
  if (stale.length) {
    console.error(`${stale.length} page${stale.length === 1 ? '' : 's'} outside the sample changed since ${stale.length === 1 ? 'its' : 'their'} last stamp (${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ', …' : ''}): a fill wrote ${stale.length === 1 ? 'it' : 'them'} after the index was last written. Each build writes the index at its end, which stamps them, and the proof would stop after its first build on pages it cannot put back. Write the index first (it stamps them, as the plan's own index step would): npm run dossier -- --index; then run this again. Nothing was built.`);
    process.exit(2);
  }
}

/** The pages outside the sample whose stamp no longer holds: those the index would stamp (`restamp`, as build-dossiers.ts calls it). */
async function staleOutside(inSample) {
  const { tsImport } = await import('tsx/esm/api');
  const { restamp } = await tsImport(pathToFileURL(join(REPO, 'src/lib/dossier/changed.ts')).href, import.meta.url);
  const sha1 = (s) => createHash('sha1').update(s).digest('hex');
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!isPage(f) || inSample.has(f)) continue;
    let d;
    try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; } // a file the index cannot read it does not write either
    if (restamp(d, '1970-01-01', sha1)) out.push(f);
  }
  return out;
}

const minutes = {};
if (!compareOnly) {
  // The files kept: the sample's pages, the corpus folder's other files, the project folder's (each under 256 MB).
  const inSample = new Set(sample.map((e) => `${e.key}.json`));
  const corpusBefore = listing(dir);
  const projectBefore = listing('.');
  const files = [
    ...sample.map((e) => join(dir, `${e.key}.json`)),
    ...[...corpusBefore.keys()].filter((f) => !isPage(f)).map((f) => join(dir, f)),
    ...[...projectBefore.keys()].filter((f) => !f.startsWith('corpus-step')).map((f) => f),
  ].filter((p) => statSync(p).size < SMALL);
  mkdirSync(BEFORE, { recursive: true });
  const kept = files.map((path, i) => { copyFileSync(path, join(BEFORE, `${i}`)); return { path, copy: `${i}`, was: true }; });
  writeFileSync(join(OUT, 'keys.txt'), sample.map((e) => `${e.key} ${e.name}`).join('\n') + '\n');
  writeFileSync(KEPT, JSON.stringify(kept));
  const keptPaths = new Set(kept.map((k) => k.path));

  const heap = builderHeap();
  const ways = [['A', ['--pages', '1', '--no-bulk-cache']], ['B', ['--pages', '8']], ['C', ['--pages', '8']]];
  try {
    for (const [way, flags] of ways) {
      const args = ['--keys', join(OUT, 'keys.txt'), ...base, ...flags];
      console.log(`\n${way}: npm run dossier -- ${args.join(' ')}`);
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [`--max-old-space-size=${heap.mb}`, '--import', pathToFileURL(join(REPO, 'node_modules/tsx/dist/loader.mjs')).href, join(REPO, 'scripts/build-dossiers.ts'), ...args], { stdio: 'inherit', env: { ...process.env, TSX_TSCONFIG_PATH: join(REPO, 'tsconfig.json') } });
      minutes[way] = Math.round((Date.now() - t0) / 60000);
      if (r.status !== 0) throw new Error(`${way} stopped (${r.signal ? `by ${r.signal}` : `exit ${r.status}`})`);
      mkdirSync(join(OUT, way), { recursive: true });
      for (const e of sample) {
        if (!existsSync(join(dir, `${e.key}.json`))) throw new Error(`${way} left no page ${e.key} (${e.name}): the build gave it another id`);
        copyFileSync(join(dir, `${e.key}.json`), join(OUT, way, `${e.key}.json`));
      }
      // Files the build made that were not there: removed when the files are put back, and said.
      const made = [...[...listing(dir).keys()].filter((f) => !corpusBefore.has(f)).map((f) => join(dir, f)), ...[...listing('.').keys()].filter((f) => !projectBefore.has(f) && !f.startsWith('corpus-step'))];
      if (made.length) {
        console.log(`  ${way} made ${made.join(', ')}: removed again`);
        const all = JSON.parse(readFileSync(KEPT, 'utf8'));
        for (const p of made) if (!keptPaths.has(p)) { all.push({ path: p, was: false }); keptPaths.add(p); }
        writeFileSync(KEPT, JSON.stringify(all));
      }
      putBack();
      // Anything else the build changed in the corpus folder (a page outside the sample) cannot be put back from here.
      const now = listing(dir);
      const other = [...corpusBefore].filter(([f, m]) => now.get(f) !== m && !inSample.has(f) && !keptPaths.has(join(dir, f))).map(([f]) => f);
      const extra = [...now.keys()].filter((f) => !corpusBefore.has(f));
      if (other.length || extra.length) throw new Error(`${way} changed ${[...other, ...extra].length} file(s) in ${dir} outside the sample (${[...other, ...extra].slice(0, 12).join(', ')}): these are not put back by the proof; restore them from the round's backup`);
    }
  } catch (e) {
    putBack();
    unlinkSync(KEPT);
    console.error(`\n${e instanceof Error ? e.message : String(e)}; the sample's pages and the files kept are put back`);
    process.exit(1);
  }
  unlinkSync(KEPT);
}

// The build's own times (`built`, and each source's `at`) taken out: two builds cannot share them.
const settled = (text) => JSON.stringify(JSON.parse(text), (k, v) => (k === 'built' || k === 'at' ? undefined : v));
/** The first place two pages part, as a path into the dossier. */
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  }
  return `${path || '.'}: ${JSON.stringify(a)?.slice(0, 80)} / ${JSON.stringify(b)?.slice(0, 80)}`;
}
const lines = [];
for (const [x, y, what] of [['A', 'B', 'eight at once against one at a time'], ['B', 'C', 'the cache read against the files read']]) {
  const differ = [];
  for (const e of sample) {
    const a = settled(readFileSync(join(OUT, x, `${e.key}.json`), 'utf8')), b = settled(readFileSync(join(OUT, y, `${e.key}.json`), 'utf8'));
    if (a !== b) differ.push(`  ${e.key} ${e.name}: ${firstDiff(JSON.parse(a), JSON.parse(b))}`);
  }
  lines.push(differ.length ? `${x} and ${y} (${what}): ${differ.length} of ${sample.length} pages DIFFER:` : `${x} and ${y} (${what}): the same, ${sample.length} of ${sample.length} pages`, ...differ.slice(0, 40));
}
if (!compareOnly) lines.push(`minutes: A ${minutes.A}, B ${minutes.B}, C ${minutes.C}; the corpus is as it was (the ${sample.length} pages and the files kept put back)`);
writeFileSync(join(OUT, 'result.txt'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
process.exit(lines.some((l) => l.includes('DIFFER')) ? 1 : 0);
