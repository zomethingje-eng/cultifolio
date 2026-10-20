// Round seventy-eight (I): the seven merges of round seventy-eight's pairs (scripts/merged-pages-79.txt), done on the real
// dossiers as round seventy-nine's build will do them, beside round seventy-three's two (scripts/merged-pages.txt), and
// asked of the Worker's functions (r78-merge-ask.ts): each must answer as round seventy-three's do.
//
//   SCALE_TMP=<scratch> node scripts/dev/scale/r78-merge-proof.mjs <real s/v2 dir> <work dir>
//
// The 18 pages' version 2 dossiers are copied to <work>/static/s/v2, and the builder (this checkout's) runs in <work>:
//   1. `--rekey` with both merge lists: each kept page takes its Kew id, each page that leaves keeps its GBIF key;
//   2. the re-derive, simulated: what a build reading the merged key writes that the index and the prune read
//      (build.ts: `occurrences.keys` with the old address; `extraNames`: the old name among the older names). The records,
//      photographs and climate the real re-derive reads from the GBIF download are not simulated: no lookup reads them;
//   3. `--prune-followed`: the pages that leave are deleted and the index written again;
//   then every merge is asked.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../../..');
const [src, work] = process.argv.slice(2).map((p) => resolve(p));
const parse = (t) => t.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean).map((l) => l.split('\t')).map(([a, b, ...n]) => ({ from: Number(a), into: Number(b), name: n.join(' ') }));
// Round seventy-nine moved the seven into scripts/merged-pages.txt, which now holds all nine.
const merges = parse(readFileSync(join(ROOT, 'scripts/merged-pages.txt'), 'utf8'));
rmSync(work, { recursive: true, force: true });
const v2 = join(work, 'static/s/v2'), v3 = join(work, 'static/s/v3');
mkdirSync(join(v2, 'g'), { recursive: true });
mkdirSync(join(work, 'scripts'));
for (const k of merges.flatMap((m) => [m.from, m.into])) copyFileSync(join(src, `${k}.json`), join(v2, `${k}.json`));
writeFileSync(join(work, 'scripts/merged-pages.txt'), merges.map((m) => `${m.from}\t${m.into}\t${m.name}`).join('\n') + '\n');
const builder = (...args) => {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  return r.stdout;
};
const say = (s) => console.log(s.split('\n').filter((l) => /page ids|index:|merged|old address|deleted|dossiers written/.test(l)).map((l) => `  ${l.trim()}`).join('\n'));
const files = () => new Map(readdirSync(v3).filter((f) => /^[kg][1-9][0-9]*\.json$/.test(f)).map((f) => { const d = JSON.parse(readFileSync(join(v3, f), 'utf8')); return [d.ids.gbif, { f, d }]; }));

console.log(`1. --rekey, ${merges.length} merges listed (${merges.length - 7} of round seventy-three, 7 of round seventy-eight)`);
say(builder('--rekey'));
let on = files();
for (const m of merges) console.log(`  ${on.get(m.into).d.key} ${on.get(m.into).d.name.scientific} kept; ${on.get(m.from).d.key} ${on.get(m.from).d.name.scientific} leaves`);

console.log('2. the re-derive of each kept page with the key of the page that leaves (simulated: the fields the index and the prune read)');
for (const m of merges) {
  const kept = on.get(m.into), away = on.get(m.from).d;
  const label = `${away.name.scientific}${away.name.authorship ? ` ${away.name.authorship}` : ''}`;
  const keys = (kept.d.occurrences.keys ?? []).filter((x) => x.key !== m.from);
  kept.d.occurrences.keys = [...keys, { key: m.from, name: label, kew: `Kew's file holds it as ${label} (synonym under its entry ${away.name.kew?.entry})`, n: away.occurrences.open.length, from: 'download', slug: away.slug }];
  // As `extraNames`: the old name joins the older names unless one of them is that name already (by its canonical form:
  // "Echeveria sessiliflora var. pinetorum" is not "Echeveria sessiliflora").
  const same = new RegExp(`^${away.name.scientific.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+[A-Z(]|$)`);
  if (!(kept.d.name.synonyms ?? []).some((s) => same.test(s))) kept.d.name.synonyms = [...(kept.d.name.synonyms ?? []), label];
  writeFileSync(join(v3, kept.f), JSON.stringify(kept.d, null, 1));
}
console.log('3. --prune-followed');
say(builder('--prune-followed'));
on = files();
console.log(`  ${on.size} dossiers left: ${merges.every((m) => !on.has(m.from) && on.has(m.into)) ? 'every page that leaves is gone, every kept page is there' : 'NOT as expected'}`);
console.log('4. asked of the Worker');
const ask = spawnSync(process.execPath, [join(ROOT, 'scripts/dev/scale/run-ts.mjs'), join(ROOT, 'scripts/dev/scale/r78-merge-ask.ts'), v3, join(work, 'scripts/merged-pages.txt')], { cwd: ROOT, encoding: 'utf8', env: process.env });
process.stdout.write(ask.stdout + ask.stderr);
process.exit(ask.status ?? 1);
