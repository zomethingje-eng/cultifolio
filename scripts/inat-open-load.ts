/**
 * iNaturalist's wild photographs from its open data (round seventy-nine, agent P; the owner's decision 3): one pass over
 * the files downloaded from the public bucket `inaturalist-open-data` (docs/DEPLOY.md, "Round seventy-nine: the full
 * build of the species list", its part "iNaturalist's photographs"), writing, per plant taxon at species rank or below, the answer the builder's wild request
 * would read (`src/lib/dossier/inat-open.ts` says the rule). `--fill inat --wild --bulk bulk` (which finds
 * `bulk/inat-wild.jsonl`; any other file by `--inat-open <file>`) then fills every page's wild photographs from it without
 * asking iNaturalist, and `--fill inat --bulk bulk` asks iNaturalist only for what the file cannot give: the taxon of a
 * page without one, and the cultivated set.
 *
 *   npx tsx scripts/inat-open-load.ts bulk\inat-open                 # reads taxa, observations, photos and observers (.csv.gz or .csv)
 *   npx tsx scripts/inat-open-load.ts <dir> --out bulk/inat-wild.jsonl  # the default output
 *   npx tsx scripts/inat-open-load.ts <dir> --taxa ids.txt --keep 200   # some taxa only, more of each
 *   npx tsx scripts/inat-open-load.ts <dir> --more ids.txt --more-keep 200 --more-out x.jsonl  # also these taxa, 200 each, to a second file (the proof's)
 *   npx tsx scripts/inat-open-load.ts <dir> --day 2026-09-27            # the export's day (default: observations' file date, UTC)
 *   npx tsx scripts/inat-open-load.ts <dir> --window 4000000            # observations held for the join (default half a million)
 *
 * No image is downloaded: the files give each photograph's address. Node only; uses nothing outside node and the app.
 */
import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { basename, dirname } from 'node:path';
import { lineBatches, readWild, wildLines, WILD_PER_TAXON, type ReadCounts } from '../src/lib/dossier/inat-open';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const dir = args[0];
if (!dir || dir.startsWith('--')) { console.error('usage: npx tsx scripts/inat-open-load.ts <folder with taxa, observations, photos and observers .csv.gz> [--out bulk/inat-wild.jsonl] [--taxa <ids file>] [--keep 24] [--day YYYY-MM-DD]'); process.exit(2); }
const out = opt('--out') ?? 'bulk/inat-wild.jsonl';
const keep = Number(opt('--keep') ?? WILD_PER_TAXON);
const windowSize = Number(opt('--window') ?? 500_000);
const idsIn = (p: string) => new Set(readFileSync(p, 'utf8').split(/\s+/).filter(Boolean).map(Number));
const only = opt('--taxa') ? idsIn(opt('--taxa')!) : undefined;
// The proof's: these taxa also written to a second file, `--more-keep` of each (scripts/dev/scale/r79p-inat-open-proof.ts).
const more = opt('--more') ? { taxa: idsIn(opt('--more')!), keep: Number(opt('--more-keep') ?? 200), out: opt('--more-out') ?? `${opt('--out') ?? 'bulk/inat-wild.jsonl'}.more` } : undefined;

/** A file of the folder: `<name>.csv.gz`, or `<name>.csv` already unpacked. */
function fileOf(name: string): string {
  for (const p of [`${dir}/${name}.csv.gz`, `${dir}/${name}.csv`]) if (existsSync(p)) return p;
  console.error(`${dir} has no ${name}.csv.gz (nor ${name}.csv): download it first (docs/DEPLOY.md, round seventy-nine)`);
  process.exit(2);
}
const read = (p: string) => lineBatches(p.endsWith('.gz') ? createReadStream(p, { highWaterMark: 1 << 20 }).pipe(createGunzip({ chunkSize: 1 << 20 })) : createReadStream(p, { highWaterMark: 1 << 20 }));
const files = { taxa: fileOf('taxa'), observations: fileOf('observations'), photos: fileOf('photos'), observers: fileOf('observers') };
const day = opt('--day') ?? statSync(files.observations).mtime.toISOString().slice(0, 10);
const sizes: Record<string, number> = {};
for (const [k, p] of Object.entries(files)) { try { sizes[k] = statSync(p).size; } catch { sizes[k] = -1; } }

const t0 = Date.now();
const mins = () => ((Date.now() - t0) / 60000).toFixed(1);
console.log(`iNaturalist's open data of ${day} in ${dir}: reading the plant taxa, then observations and photographs together (one pass), then observers…`);
const say = (c: ReadCounts) => process.stdout.write(`\r  ${(c.photos / 1e6).toFixed(0)} M photographs, ${(c.observations / 1e6).toFixed(0)} M observations read; ${(c.plantResearchOpen / 1e6).toFixed(2)} M research-grade plant observations with an open photograph; ${mins()} min   `);
const w = await readWild({ taxa: read(files.taxa), observations: read(files.observations), photos: read(files.photos), observers: () => read(files.observers) }, { keep, only, ...(more ? { more } : {}), window: windowSize, progress: say });
const c = w.counts;
console.log(`\n  ${c.observations} observations and ${c.photos} photographs read (${c.withoutPhotos} observations with no photograph row); ${c.plantResearch} research-grade observations of a plant at species rank or below, ${c.plantResearchOpen} of them with a CC0, CC BY or CC BY-SA photograph`);
console.log(`  ${w.taxa.size} plant taxa; ${c.taxaWithWild} at species rank or below have wild photographs; ${c.kept} observations kept (at most ${keep} a taxon)${only ? `, for the ${only.size} taxa of the list given` : ''}`);
console.log(`  a photograph's observation was found at most ${c.farthest} observations back (the window holds ${windowSize})`);
if (c.unjoined) {
  console.error(`  ${c.unjoined} photograph rows name an observation not found near them (out of the window, or not in observations.csv): nothing written, since a set might lack a photograph. Run again with --window ${windowSize * 4}.`);
  process.exit(1);
}
/** Written whole, then renamed: a run stopped part way leaves no half a file. */
async function write(path: string, lines: Iterable<string>): Promise<number> {
  mkdirSync(dirname(path) || '.', { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const ws = createWriteStream(tmp);
  let n = 0;
  for (const line of lines) {
    n++;
    if (!ws.write(line + '\n')) await new Promise<void>((r) => ws.once('drain', () => r()));
  }
  await new Promise<void>((r, j) => ws.end((e?: Error | null) => (e ? j(e) : r())));
  renameSync(tmp, path);
  return n - 1;
}
const header = { day, read: new Date().toISOString(), files: sizes };
const written = await write(out, wildLines(w, header));
// The fills find `<dir>/inat-wild.jsonl` by `--bulk <dir>`, any other file by `--inat-open <file>`.
const next = basename(out) === 'inat-wild.jsonl' ? `--bulk ${dirname(out)}` : `--inat-open ${out}`;
console.log(`  ${written} taxa written to ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB) in ${mins()} min. Next: npm run dossier -- --fill inat --wild ${next}`);
if (more) console.log(`  ${await write(more.out, wildLines(w, header, { taxa: more.taxa, keep: more.keep }))} taxa, ${more.keep} observations at most each, written to ${more.out}`);
