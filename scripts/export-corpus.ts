/**
 * Package a built corpus as a dataset bundle (see export-corpus-lib.ts).
 *
 *   npm run export                              # static/s/v<N> → cultifolio-corpus-<date>.zip
 *   npm run export -- --dir fixtures/dossiers --out my.zip --version 2026.09
 *
 * Reads the corpus directory the build wrote (index.json, report.txt and
 * s/v<N>/<key>.json), writes one zip. Nothing is fetched.
 */
import { DOSSIER_V } from '../src/lib/dossier/schema';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { buildBundle, type Corpus } from './export-corpus-lib';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const today = new Date().toISOString().slice(0, 10);
const dir = opt('dir', 'static');
const version = opt('version', today.slice(0, 7).replace('-', '.'));
const out = opt('out', `cultifolio-corpus-${today}.zip`);
const homepage = opt('homepage', 'https://cultifolio.com');
const repo = 'https://github.com/zomethingje-eng/cultifolio';

const idxDir = existsSync(`${dir}/s/v${DOSSIER_V}/index.json`) ? `${dir}/s/v${DOSSIER_V}` : dir;
if (!existsSync(`${idxDir}/index.json`)) {
  console.error(`No index.json under ${dir} (looked in ${dir}/s/v${DOSSIER_V} and ${dir}). Build a corpus first: npm run dossier -- names.txt --grid climate`);
  process.exit(1);
}
const corpus: Corpus = { index: JSON.parse(readFileSync(`${idxDir}/index.json`, 'utf8')), dossiers: new Map() };
if (existsSync(`${idxDir}/report.txt`)) corpus.report = readFileSync(`${idxDir}/report.txt`, 'utf8');
const sDir = existsSync(`${dir}/s/v${DOSSIER_V}`) ? `${dir}/s/v${DOSSIER_V}` : dir;
for (const f of readdirSync(sDir)) {
  const m = /^(\d+)\.json$/.exec(f);
  if (m) corpus.dossiers.set(Number(m[1]), JSON.parse(readFileSync(`${sDir}/${f}`, 'utf8')));
}

const b = buildBundle(corpus, { version, homepage, repo, today });
const zipped = zipSync(
  Object.fromEntries(Object.entries(b.files).map(([k, v]) => [k, strToU8(v)])),
  { level: 6 }
);
writeFileSync(out, zipped);
console.log(`${b.species} species (${b.withClimate} with climate) → ${out} (${(zipped.length / 1048576).toFixed(1)} MB)`);
