/**
 * Offline corpus build. Runs on your PC against the real upstreams, writes one
 * JSON per species to ./static/s/v<N>/<key>.json, and (optionally) uploads to R2.
 *
 *   npx tsx scripts/build-dossiers.ts names.txt                 # one name per line (or "<backbone key> <name>" to build by key)
 *   npx tsx scripts/build-dossiers.ts static/s/v1/index.json --rederive --grid climate --bulk bulk
 *                                                                # a previous corpus's index as the list: every species in it, by key
 *   npx tsx scripts/build-dossiers.ts names.txt --grid climate  # with habitat climate from the packed grid
 *   npx tsx scripts/build-dossiers.ts names.txt --force         # rebuild species that already have a clean dossier (by default they are kept)
 *   npx tsx scripts/build-dossiers.ts names.txt --skip openalex # leave literature out of this run (marked skipped; a later run without --skip fills it)
 *   npx tsx scripts/build-dossiers.ts --fill openalex           # literature only: for every dossier on disk whose literature is missing, refused or
 *                                                                # skipped, one OpenAlex call, patched into the file. Stops cleanly when the day's
 *                                                                # allowance is spent (free keys: 1,000 species a day) and says when it resets.
 *   npx tsx scripts/build-dossiers.ts --fill inat               # photographs only, the same way: iNaturalist allows 10,000 calls a day, about
 *                                                                # 3,300 species; a long run leaves photos out (--skip inat) and fills them daily.
 *   npx tsx scripts/build-dossiers.ts static/s/v2/index.json --offline --grid climate --bulk bulk
 *                                                                # a re-derivation that asks no upstream at all: the backbone's name block is carried from
 *                                                                # the previous build too, so the run is the files and the grid, an hour rather than a day
 *   npx tsx scripts/build-dossiers.ts names.txt --rederive     # rebuild range, records, centre and climate under the current rules (bulk files
 *                                                                # and the local grid; only the backbone is asked), carrying photos, summary,
 *                                                                # identifiers and literature from each species' previous build. About a second a species.
 *
 * OPENALEX_KEY in the environment gives OpenAlex requests their own allowance
 * (anonymous ones share a per-address pool that closes after ~100 calls).
 *
 * A species whose dossier is on disk and clean (no refusals, climate settled)
 * is kept, so a run that dies is restarted with the same command and picks
 * up where it was; one with refusals is rebuilt (--only-refused, the old
 * name for this, still works). The index is regenerated from every dossier
 * on disk at the end, so a run over five names never shrinks a corpus of
 * thousands to five.
 *   npx tsx scripts/build-dossiers.ts names.txt --bulk bulk     # distributions and occurrences from the files in bulk/ (see bulk-fetch.ts); the APIs only for the rest
 *   npx tsx scripts/build-dossiers.ts names.txt --upload        # also `wrangler r2 object put`
 *   npx tsx scripts/build-dossiers.ts --index                   # only rewrite the index from the dossiers on disk (after deleting or hand-editing files);
 *                                                                # lists dossiers under names the backbone holds as synonyms in not-accepted.txt
 *   npx tsx scripts/build-dossiers.ts not-accepted.txt --grid climate --bulk bulk --force --skip inat,openalex
 *                                                                # rebuilds those by key: each is followed to its accepted species (a new file)
 *   npx tsx scripts/build-dossiers.ts --prune-followed          # then deletes the old synonym-name files that an accepted page says it was followed from
 *   npx tsx scripts/build-dossiers.ts --fill gbif --bulk bulk    # photographs from the download's multimedia.txt into every dossier on disk; no API calls
 *   npx tsx scripts/build-dossiers.ts --fixtures                # synthetic dossiers for dev
 *
 * The same buildDossier() runs in the Worker for the tail; this script exists
 * so you see every dossier before anyone else does.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
import * as gbif from '../src/lib/dossier/sources/gbif';
import { literature } from '../src/lib/dossier/sources/openalex';
import * as inat from '../src/lib/dossier/sources/inat';
import { makeFetcher, fixtureFetcher } from '../src/lib/dossier/fetch';
import { dossierPath, DOSSIER_V } from '../src/lib/dossier/schema';
import { welwitschia, copiapoa, refused } from '../fixtures/upstream';
import { makeClimateProvider, type PowerCache } from '../src/lib/climate/provider';
import { fileGridSource } from './file-grid';
import type { PowerSeries } from '../src/lib/climate/power';
import type { ClimateProvider } from '../src/lib/dossier/build';
import type { Climate, Dossier } from '../src/lib/dossier/schema';
type ClimateOk = Extract<Climate, { status: 'ok' }>;
import { bulkFetcher } from '../src/lib/dossier/bulk';
import { loadWcvp, loadOccurrences, wantedKeys } from './bulk-load';

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const fixtures = args.includes('--fixtures');
const quick = args.includes('--quick');
const offline = args.includes('--offline');
const rederive = args.includes('--rederive') || offline;
const fill = (() => { const i = args.indexOf('--fill'); return i >= 0 ? args[i + 1] : undefined; })();
const force = args.includes('--force') || rederive;
const skip: SkippableSource[] = rederive ? [...NETWORK_EXTRAS] : (() => { const i = args.indexOf('--skip'); return i >= 0 ? (args[i + 1] ?? '').split(',').filter((x): x is SkippableSource => (NETWORK_EXTRAS as string[]).includes(x)) : []; })();
const gridDir = (() => { const i = args.indexOf('--grid'); return i >= 0 ? args[i + 1] : undefined; })();
const bulkDir = (() => { const i = args.indexOf('--bulk'); return i >= 0 ? args[i + 1] : undefined; })();
const outDir = fixtures ? 'fixtures/dossiers' : 'static'; // static/s/v<N>/<key>.json is served by the app and mirrors the R2 key

/** POWER series cached on disk so the same 0.5° cell is never requested twice across runs. */
/** The previous build of a key, this version's file or the last version's, or null. Parsed each time; a rederive reads each once. */
function readPrev(key: number): Dossier | null {
  for (const p of [`${outDir}/${dossierPath(key)}`, `${outDir}/s/v${DOSSIER_V - 1}/${key}.json`]) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as Dossier;
    } catch {
      return null;
    }
  }
  return null;
}

function diskPowerCache(dir: string): PowerCache {
  mkdirSync(dir, { recursive: true });
  return {
    async get(id) {
      const p = `${dir}/${id}.json`;
      return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as PowerSeries) : null;
    },
    async set(id, s) {
      writeFileSync(`${dir}/${id}.json`, JSON.stringify(s));
    }
  };
}

type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; origin: string[]; thumb?: string; photos: number; open: number; climate: string };
type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: Array<{ name: string; lang?: string }> }; distribution: { native: Array<{ name: string }> }; photos: Array<{ thumb: string; captive?: boolean }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number }; climate: { status: string } };
function indexEntry(d: Dossierish): IndexEntry {
  const hero = d.photos.find((p) => !p.captive) ?? d.photos[0];
  return { key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, common: d.name.vernacular.find((v) => v.lang === 'eng')?.name, origin: d.distribution.native.map((n) => n.name), thumb: hero?.thumb, photos: d.photos.length, open: d.occurrences.nOpenInRange, climate: d.climate.status };
}

/** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
/** Dossiers under a name the backbone does not accept: seen on the last scan, so --index can list them. */
let notAccepted: Array<{ key: number; name: string; status: string; records: number }> = [];
function scanDossiers(): IndexEntry[] {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  if (!existsSync(dir)) return [];
  const out: IndexEntry[] = [];
  notAccepted = [];
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Dossierish;
      out.push(indexEntry(d));
      if (d.name.status && d.name.status !== 'accepted') notAccepted.push({ key: d.key, name: d.name.scientific, status: d.name.status, records: d.occurrences.nOpenInRange + (d.occurrences.nRestrictedInRange ?? 0) + (d.occurrences.nOutsideRange ?? 0) });
    } catch {
      /* a half-written file from a killed run: rebuilt when its name comes round */
    }
  }
  return out;
}

function needsRebuild(key: number): boolean {
  const p = `${outDir}/${dossierPath(key)}`;
  if (!existsSync(p)) return true;
  try {
    const d = JSON.parse(readFileSync(p, 'utf8')) as { climate?: { status: string }; upstream?: Record<string, { status: string }> };
    // 'none' is a settled answer (too few records, no verified range, a cultigen), not a failure: it is redone by
    // --rederive when the rules change, not on every run. 'pending' and 'refused' are unfinished and are retried.
    if (d.climate?.status === 'pending' || d.climate?.status === 'refused') return true;
    // A source this run is skipping anyway cannot be the reason to rebuild.
    return Object.entries(d.upstream ?? {}).some(([k, u]) => !skip.some((x) => k === x || k.startsWith(x + '.')) && (u.status === 'refused' || u.status === 'error'));
  } catch {
    return true;
  }
}

let bulkStats: { wcvp: number; occ: number; media: number; through: number } | null = null;
/** The download carried photographs: GBIF media is then the first wild-photo source, not a fallback. */
let mediaFromFiles = false;

/** Patch one section into every dossier that lacks it, without rebuilding anything else. */
async function fillLiterature(): Promise<void> {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  const todo: Array<{ path: string; d: Record<string, unknown> & { name: { scientific: string }; upstream: Record<string, { status: string; at?: string; detail?: string }>; literature: unknown[] } }> = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    const st = d.upstream?.openalex?.status;
    if (st !== 'ok' && st !== 'none') todo.push({ path: `${dir}/${f}`, d });
  }
  console.log(`${files.length} dossiers on disk; ${todo.length} without literature${process.env.OPENALEX_KEY ? ' (with an OpenAlex key)' : ' (no OPENALEX_KEY set: the anonymous pool closes after ~100)'}…`);
  const f = makeFetcher();
  let done = 0, none = 0, errors = 0;
  for (const { path, d } of todo) {
    const r = await literature(f, d.name.scientific);
    if (r.status === 'refused') {
      // The fetch layer has already retried and backed off; a refusal now is the allowance, not a blip.
      console.log(`\n  OpenAlex refused (${'detail' in r ? r.detail : ''}). ${done} filled${none ? `, ${none} with nothing to find` : ''}; ${todo.length - done - none} still to do. A free key allows about 1,000 a day; run this again after the window resets, or add prepaid credits at openalex.org.`);
      return;
    }
    if (r.status === 'error') {
      // A 5xx or a dropped connection is not an absence: leave the section as it was, recorded as an error, and move on.
      d.upstream.openalex = { status: 'error', at: new Date().toISOString(), detail: r.detail };
      writeFileSync(path, JSON.stringify(d));
      errors++;
      continue;
    }
    if (r.status === 'ok') {
      d.literature = r.data;
      done++;
    } else {
      d.literature = [];
      none++;
    }
    d.upstream.openalex = { status: r.status === 'ok' ? 'ok' : 'none', at: new Date().toISOString(), detail: `filled ${new Date().toISOString().slice(0, 10)}` };
    writeFileSync(path, JSON.stringify(d));
    if ((done + none) % 25 === 0) process.stdout.write(`\r  ${done + none} of ${todo.length}…   `);
  }
  console.log(`\n  ${done} filled, ${none} with nothing to find${errors ? `, ${errors} errored (recorded; run again)` : ''}. Every dossier has been asked for its literature.`);
}

/** Photographs from iNaturalist for every dossier that has none of them yet: the taxon lookup (unless Wikidata already gave the id), then the wild and cultivated sets. */
async function fillPhotos(): Promise<void> {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  type D = { name: { scientific: string }; ids: { inat?: number }; links: Record<string, string>; photos: Array<{ src: string; captive?: boolean }>; upstream: Record<string, { status: string; at?: string; detail?: string }> };
  const todo: Array<{ path: string; d: D }> = [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream?.[k]?.status ?? '');
    const wildDone = settled('inat.photos.wild') || (d.upstream?.['inat.photos.wild']?.detail ?? '').startsWith('not asked');
    if (!wildDone || !settled('inat.photos.cultivated')) todo.push({ path: `${dir}/${f}`, d });
  }
  console.log(`${files.length} dossiers on disk; ${todo.length} without iNaturalist photographs…`);
  const f = makeFetcher();
  let done = 0;
  const t0 = Date.now();
  for (const { path, d } of todo) {
    let id = d.ids.inat;
    if (!id) {
      const t = await inat.taxon(f, d.name.scientific);
      if (t.status === 'refused') return stop(t.detail);
      d.upstream['inat.taxon'] = { status: t.status, at: new Date().toISOString(), detail: 'detail' in t ? t.detail : undefined };
      if (t.status === 'error') {
        // Not "no taxon of this name": the lookup broke. Recorded; the next fill asks again.
        d.upstream['inat.photos.wild'] = { status: 'error', at: new Date().toISOString(), detail: t.detail };
        writeFileSync(path, JSON.stringify(d));
        continue;
      }
      if (t.status === 'ok') id = d.ids.inat = t.data.id;
    }
    if (!id) {
      d.upstream['inat.photos.wild'] = { status: 'none', at: new Date().toISOString(), detail: 'no iNaturalist taxon of exactly this name' };
      d.upstream['inat.photos.cultivated'] = { status: 'none', at: new Date().toISOString() };
      writeFileSync(path, JSON.stringify(d));
      done++;
      continue;
    }
    d.links.inat = `https://www.inaturalist.org/taxa/${id}`;
    // The GBIF download already carries iNaturalist's wild photographs (research-grade, open licences): when six or more
    // are there, the wild set is not asked for again; the cultivated set, which GBIF never has, always is.
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream[k]?.status ?? '');
    const wildFromGbif = d.photos.filter((p) => p.src === 'gbif' && !p.captive).length;
    const wild = wildFromGbif < 6 && !settled('inat.photos.wild') ? await inat.photos(f, id, true, 24) : null;
    if (wild?.status === 'refused') return stop(wild.detail);
    const cult = !settled('inat.photos.cultivated') ? await inat.photos(f, id, false, 12) : null;
    if (cult?.status === 'refused') return stop(cult.detail);
    const fresh = [...(wild?.status === 'ok' ? wild.data : []), ...(cult?.status === 'ok' ? cult.data : [])];
    // iNat photos lead; whatever Commons or GBIF media gave earlier stays behind them. A set not asked for this time keeps what it had.
    d.photos = [...fresh, ...d.photos.filter((p) => p.src !== 'inat' || (wild == null && !p.captive) || (cult == null && p.captive))];
    const stamp = `filled ${new Date().toISOString().slice(0, 10)}`;
    if (wild) d.upstream['inat.photos.wild'] = { status: wild.status, at: new Date().toISOString(), detail: stamp };
    else if (!settled('inat.photos.wild')) d.upstream['inat.photos.wild'] = { status: 'skipped', at: new Date().toISOString(), detail: `not asked: ${wildFromGbif} wild photographs already from the GBIF download` };
    if (cult) d.upstream['inat.photos.cultivated'] = { status: cult.status, at: new Date().toISOString(), detail: stamp };
    writeFileSync(path, JSON.stringify(d));
    done++;
    if (done % 25 === 0) process.stdout.write(`\r  ${done} of ${todo.length} (${((Date.now() - t0) / done / 1000).toFixed(1)} s each)…   `);
  }
  console.log(`\n  ${done} filled. Every dossier has been asked for its photographs.`);
  writeIndexFromDisk();
  function stop(detail?: string) {
    console.log(`\n  iNaturalist refused (${detail ?? ''}). ${done} filled; ${todo.length - done} still to do. iNaturalist allows about 10,000 calls a day; run this again tomorrow.`);
    writeIndexFromDisk();
  }
}

/**
 * After a rebuild that followed synonyms to their accepted species, the old files under the synonym
 * names are still on disk. Delete exactly those: a non-accepted dossier whose name some accepted
 * dossier says it was "followed from". Anything else under a non-accepted name is left and listed.
 */
function pruneFollowed(): void {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const followed = new Set<string>();
  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  type D = { key: number; name: { scientific: string; status?: string }; upstream: Record<string, { detail?: string }> };
  const all: Array<{ f: string; d: D }> = [];
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
      all.push({ f, d });
      const m = /^followed from (.+?), which the backbone holds as a synonym/.exec(d.upstream?.['gbif.accepted']?.detail ?? '');
      if (m && d.name.status === 'accepted') followed.add(m[1].toLowerCase());
    } catch {
      /* half-written */
    }
  }
  let gone = 0;
  for (const { f, d } of all) {
    if (d.name.status && d.name.status !== 'accepted' && followed.has(d.name.scientific.toLowerCase())) {
      unlinkSync(`${dir}/${f}`);
      gone++;
    }
  }
  console.log(`  ${gone} dossiers under synonym names deleted; each has an accepted species' page that says it was followed from that name.`);
  writeIndexFromDisk();
}

/** Two dossiers with one slug (an accepted name and a doubtful homonym) would leave one unreachable: the later key gets its key appended. */
function uniqueSlugs(index: IndexEntry[]): IndexEntry[] {
  const seen = new Map<string, number>();
  for (const e of index) {
    const prev = seen.get(e.slug);
    if (prev !== undefined && prev !== e.key) e.slug = `${e.slug}-${e.key}`;
    else seen.set(e.slug, e.key);
  }
  return index;
}

/**
 * Photographs from the download's multimedia.txt, merged into every dossier on disk. One pass over the archive, no API
 * calls: the media index answers the same request the build makes, so the photographs come out identical to a build's.
 * A species the download does not carry (over the record cap, or not in the names file) is left as it is.
 */
async function fillGbifPhotos(): Promise<void> {
  if (!bulkDir) {
    console.error('--fill gbif needs --bulk <dir> with occurrence.zip from a DWCA download');
    process.exit(2);
  }
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  const keys = new Set(files.map((f) => Number(f.slice(0, -5))));
  console.log(`${files.length} dossiers on disk; loading photographs from ${bulkDir}/occurrence.zip for them…`);
  const loaded = await loadOccurrences(bulkDir, 1, keys);
  if (!loaded?.media) {
    console.error('  the archive has no multimedia.txt: request the download again as a DWCA (npm run bulk -- gbif names-big.txt --wait)');
    process.exit(2);
  }
  const doi = loaded.occ.doi;
  const f = bulkFetcher(fixtureFetcher({}, { status: 'none' }), { media: loaded.media });
  // The parts of a dossier a fill touches, typed by the schema so mergeGbifPhotos() takes and gives real Photo rows.
  type D = Pick<Dossier, 'key' | 'photos' | 'upstream'>;
  let filled = 0, none = 0, photos = 0;
  for (const file of files) {
    const path = `${dir}/${file}`;
    const d = JSON.parse(readFileSync(path, 'utf8')) as D;
    const m = await gbif.media(f, d.key);
    if (m.status !== 'ok') {
      none++;
      continue; // nothing in the download for this species: what the dossier has stands, whatever source gave it
    }
    const fresh = photosFromMedia(m.data);
    d.photos = mergeGbifPhotos(d.photos, fresh);
    d.upstream['gbif.media'] = { status: 'ok', at: new Date().toISOString(), detail: `from the GBIF download${doi ? ` ${doi}` : ''} (multimedia.txt)` };
    // Six or more wild photographs from the download: the iNaturalist wild set need not be asked for.
    if (fresh.length >= 6 && !['ok', 'none'].includes(d.upstream['inat.photos.wild']?.status ?? '')) d.upstream['inat.photos.wild'] = { status: 'skipped', at: new Date().toISOString(), detail: `not asked: ${fresh.length} wild photographs already from the GBIF download` };
    writeFileSync(path, JSON.stringify(d));
    filled++;
    photos += fresh.length;
    if (filled % 500 === 0) process.stdout.write(`\r  ${filled} filled…   `);
  }
  console.log(`\r  ${filled} dossiers given ${photos} photographs from the download; ${none} had none there and keep what they had.`);
  writeIndexFromDisk();
}

/** The index is derived from the files; after a fill the thumbnails have changed, so it is written again. */
function writeIndexFromDisk(): void {
  const index = uniqueSlugs(scanDossiers().sort((a, b) => a.name.localeCompare(b.name)));
  const idxDir = `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(`${idxDir}/index.json`, JSON.stringify(index, null, 1));
  console.log(`  index: ${index.length} species`);
  // A dossier under a synonym is a page the backbone would not put its records under: a rebuild follows it to
  // the accepted species. A doubtful name has nothing to follow to (the backbone holds it as doubtful, with no
  // accepted name in its place), so the page stays under it and says so; listed for information, not for rebuilding.
  const syn = notAccepted.filter((x) => x.status === 'synonym').sort((a, b) => a.name.localeCompare(b.name));
  const doubtful = notAccepted.filter((x) => x.status !== 'synonym').sort((a, b) => a.name.localeCompare(b.name));
  if (syn.length) {
    writeFileSync('not-accepted.txt', syn.map((x) => `${x.key}\t${x.name}\t${x.status}\t${x.records} records`).join('\n') + '\n');
    console.log(`  ${syn.length} dossiers are under a name the backbone holds as a synonym → not-accepted.txt (rebuild those names to follow them to the accepted species, then --prune-followed and --index)`);
  } else if (existsSync('not-accepted.txt')) unlinkSync('not-accepted.txt');
  if (doubtful.length) console.log(`  ${doubtful.length} dossiers are under a name the backbone holds as doubtful, with no accepted name in its place; their pages say so: ${doubtful.map((x) => x.name).join(', ')}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (args.includes('--prune-followed')) return pruneFollowed();
  if (args.includes('--index')) return writeIndexFromDisk();
  if (fill === 'openalex') return fillLiterature();
  if (fill === 'inat') return fillPhotos();
  if (fill === 'gbif') return fillGbifPhotos();
  if (fill) throw new Error(`--fill ${fill}: openalex or inat`);
  let climate: ClimateProvider | undefined;
  if (gridDir) {
    if (!existsSync(`${gridDir}/climate.grid`) || !existsSync(`${gridDir}/climate.json`)) {
      console.error(`--grid ${gridDir}: climate.grid / climate.json not found (run scripts/pack-climate.py first)`);
      process.exit(2);
    }
    climate = makeClimateProvider({ grid: fileGridSource(`${gridDir}/climate.grid`, `${gridDir}/climate.json`), fetcher: makeFetcher(), powerCache: diskPowerCache(`${gridDir}/power-cache`), noExtremes: quick });
  }
  const jobs: Array<{ name: string; key?: number; fetcher: ReturnType<typeof makeFetcher> }> = [];
  if (fixtures) {
    // A synthetic Atacama-coast climate for the Chilean fixture only, so the plant page's habitat comparison
    // and the cultivation sheet can be exercised offline. Marked as fixture in its source field.
    const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], tmin = [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14];
    const pr = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5], dli = [63, 59, 51, 42, 33, 30, 32, 38, 48, 57, 63, 65];
    const year = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: Math.round(((t + tmin[i]) / 2) * 10) / 10, precipMm: pr[i], dli: dli[i], rh: 78 }));
    const spread = (d: number) => year.map((m) => ({ ...m, tmax: m.tmax + d, tmin: m.tmin + d, tmean: m.tmean + d }));
    const atacama = (lat: number, lon: number, cells: number, records: number): ClimateOk => ({ status: 'ok', cells, records, cell: 'fixture', at: { lat, lon }, months: year, p10: spread(-2), p90: spread(2), extremes: { years: 40, minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, lapseAppliedM: 0 }, src: { normals: 'fixture: synthetic Atacama-coast normals for tests', envelope: `fixture: ${cells} cells, ±2 °C`, extremes: 'fixture' } });
    climate = {
      envelope: async (pts) => (pts.some(([lat, lon]) => lat < -20 && lon < -60) ? atacama(pts[0][0], pts[0][1], Math.min(pts.length, 40), pts.length) : { status: 'pending', detail: 'fixture: no climate outside the Chilean test box' }),
      at: async (lat, lon) => (lat < -20 && lon < -60 ? atacama(lat, lon, 1, 1) : { status: 'pending', detail: 'fixture: no climate outside the Chilean test box' })
    };
    jobs.push({ name: 'Welwitschia', fetcher: fixtureFetcher(welwitschia()) });
    jobs.push({ name: 'Copiapoa cinerea', fetcher: fixtureFetcher(copiapoa()) });
    jobs.push({ name: 'Refusia testii', fetcher: fixtureFetcher(refused()) });
  } else {
    const file = args.find((a) => !a.startsWith('--'));
    if (!file || !existsSync(file)) {
      console.error('usage: tsx scripts/build-dossiers.ts <names.txt> [--upload] [--quick]');
      process.exit(2);
    }
    // A line is a name, or "<backbone key> <name>" (tab-separated notes after the name are ignored, so
    // not-accepted.txt works as it is): the key is what is built, so a name the match endpoint refuses as
    // ambiguous (homonyms) still resolves; the name is for the log and for choosing which WCVP genera to load.
    // An index.json (a previous corpus) is a names file too: every species in it, by key, so a rederive across a schema
    // bump rebuilds exactly the corpus that was there, whatever list it was first built from.
    const lines = file.endsWith('.json')
      ? (JSON.parse(readFileSync(file, 'utf8')) as Array<{ key: number; name: string }>).map((e) => `${e.key} ${e.name}`)
      : readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const parsed = lines.map((line) => {
      const m = /^(\d+)\s+([^\t]+)/.exec(line);
      return m ? { name: m[2].trim(), key: Number(m[1]) } : { name: line.split('\t')[0].trim(), key: undefined };
    });
    const seenLine = new Set<string>();
    const unique = parsed.filter((p) => {
      const k = p.key ? `k${p.key}` : p.name.toLowerCase();
      if (seenLine.has(k)) return false;
      seenLine.add(k);
      return true;
    });
    if (unique.length < parsed.length) console.log(`  ${parsed.length - unique.length} repeated line${parsed.length - unique.length === 1 ? '' : 's'} in ${file} skipped`);
    const names = unique.map((p) => p.name);
    let f = makeFetcher();
    if (offline) {
      // No upstream is asked. The one request the bulk fetcher makes on its own, /species/{key} for a name's authorship,
      // is answered from the previous dossier; NASA POWER is allowed through because the extremes cache is on disk and
      // a cell not yet cached is better fetched than refused. Everything else is refused as offline, and says so.
      const net = makeFetcher();
      f = async <T = unknown>(url: string, opts?: Parameters<typeof net>[1]) => {
        const host = new URL(url).host;
        if (host === 'power.larc.nasa.gov') return net<T>(url, opts);
        const m = /\/species\/(\d+)$/.exec(url);
        if (m) {
          const prev = readPrev(Number(m[1]));
          if (prev) return { status: 'ok' as const, data: { key: prev.key, canonicalName: prev.name.scientific, scientificName: prev.name.scientific, authorship: prev.name.authorship ?? undefined } as unknown as T };
        }
        return { status: 'refused' as const, detail: `${host} not asked: offline re-derivation` };
      };
    }
    if (bulkDir) {
      console.log(`Loading bulk files from ${bulkDir}/…`);
      const [wcvp, loaded] = await Promise.all([loadWcvp(bulkDir, names), loadOccurrences(bulkDir, 2000, wantedKeys(bulkDir, names))]);
      if (!wcvp) console.log('  no WCVP files: distributions will come from the API');
      if (!loaded && !existsSync(`${bulkDir}/occurrence.zip`) && !existsSync(`${bulkDir}/occurrence.csv`)) console.log('  no occurrence.zip: occurrences will come from the API');
      const bf = bulkFetcher(f, { wcvp: wcvp ?? undefined, occ: loaded?.occ, media: loaded?.media ?? undefined });
      mediaFromFiles = !!loaded?.media;
      // The download's photographs are files, not a network extra: a re-derivation reads them and merges them in.
      if (mediaFromFiles) skip.splice(0, skip.length, ...skip.filter((x) => x !== 'gbif.media'));
      bulkStats = bf.stats;
      f = bf;
    }
    for (const p of unique) jobs.push({ name: p.name, key: p.key, fetcher: f });
  }
  const report: string[] = [];
  const say = (line: string) => {
    report.push(line);
    console.log(`[${report.length}/${jobs.length}] ${line}`);
  };
  console.log(`Building ${jobs.length} species${quick ? ' (quick)' : ''}${offline ? ' (offline: re-deriving range, records, marker and climate from the files and the grid; the name block, photos, summary and literature carried from the previous build; no upstream asked)' : rederive ? ' (re-deriving range, records, centre and climate; photos, summary and literature carried from the previous build)' : skip.length ? ` (skipping ${skip.join(', ')})` : ''}${process.env.OPENALEX_KEY && !rederive ? ' with an OpenAlex key' : ''}…`);
  // Existing dossiers by name, so a clean one is kept rather than rebuilt (unless --force).
  const onDisk = fixtures ? [] : scanDossiers();
  const existing = new Map<string, number>(onDisk.map((e) => [e.name.toLowerCase(), e.key]));
  if (onDisk.length) console.log(`  ${onDisk.length} dossiers already on disk${force ? ' (rebuilding all)' : ' (clean ones kept)'}`);
  let built = 0, keptN = 0;
  const thisRun = new Map<number, IndexEntry>();
  for (const j of jobs) {
    const t0 = Date.now();
    if (!force) {
      const k = j.key ?? existing.get(j.name.toLowerCase());
      if (k && !needsRebuild(k)) {
        say(`· ${j.name}: kept (clean)`);
        keptN++;
        continue;
      }
    }
    let r;
    try {
      const prevTaxon = offline && j.key ? readPrev(j.key) : null;
      if (offline && !prevTaxon) {
        say(`✗ ${j.name}: no previous dossier to carry the name from; build it online first`);
        continue;
      }
      r = await buildDossier(j.key ?? j.name, {
        fetcher: j.fetcher,
        builtBy: 'node',
        quick,
        climate,
        skip,
        mediaFirst: mediaFromFiles,
        taxon: prevTaxon ? { key: prevTaxon.key, name: prevTaxon.name, accepted: prevTaxon.upstream?.['gbif.accepted'], builtOn: prevTaxon.built } : undefined
      });
    } catch (e) {
      const issues = (e as { issues?: Array<{ path?: Array<{ key: unknown }>; message: string }> }).issues;
      const where = issues?.map((i) => (i.path ?? []).map((p) => String(p.key)).join('.') + ': ' + i.message).join('; ');
      say(`✗ ${j.name}: build crashed — ${where ?? (e instanceof Error ? e.message : String(e))}`);
      continue;
    }
    if (!r.ok) {
      say(`✗ ${j.name}: ${r.reason}${r.detail ? ' (' + r.detail + ')' : ''}`);
      continue;
    }
    const d = r.dossier;
    const path = `${outDir}/${dossierPath(d.key)}`;
    // A source that refused this time does not erase what it gave us last time: carry the previous
    // build's section forward and say so in the upstream record.
    // The previous build of this species: this version's file, or the last version's when the corpus is being carried
    // across a schema bump (photographs, summary, identifiers and literature keep their shape; the derivation does not).
    const legacyPath = `${outDir}/s/v${DOSSIER_V - 1}/${d.key}.json`;
    const prevPath = existsSync(path) ? path : existsSync(legacyPath) ? legacyPath : null;
    if (prevPath) {
      const prev = JSON.parse(readFileSync(prevPath, 'utf8')) as typeof d;
      // copy() returns whether anything was carried; the upstream record says "carried" only then.
      const carry = (src: string, copy: () => boolean) => {
        const now = d.upstream[src]?.status, before = prev.upstream?.[src]?.status;
        // Skipped this build (a --skip source) counts the same as refused: what the last build had is kept.
        if ((now === 'refused' || now === 'error' || now === 'skipped') && (before === 'ok' || before === 'none') && copy()) {
          d.upstream[src] = { ...prev.upstream[src], detail: `carried from build of ${prev.built?.slice(0, 10) ?? '?'}; this build: ${d.upstream[src].detail ?? now}` };
        }
      };
      carry('openalex', () => ((d.literature = prev.literature), true));
      carry('wikipedia', () => ((d.summary = prev.summary), true));
      // Photographs are carried per source: a refused iNat does not discard this build's Commons photographs, nor the reverse.
      const photoSrc: Record<string, (p: { src: string; captive?: boolean }) => boolean> = {
        'inat.photos.wild': (p) => p.src === 'inat' && !p.captive,
        'inat.photos.cultivated': (p) => p.src === 'inat' && !!p.captive,
        commons: (p) => p.src === 'commons',
        'gbif.media': (p) => p.src === 'gbif'
      };
      for (const [src, is] of Object.entries(photoSrc))
        carry(src, () => {
          const theirs = (prev.photos ?? []).filter(is);
          if (!theirs.length || d.photos.some(is)) return false;
          d.photos = [...d.photos, ...theirs];
          if (src.startsWith('inat') && prev.ids?.inat) {
            d.ids.inat = prev.ids.inat;
            d.links.inat = prev.links.inat;
          }
          return true;
        });
      // The range, the records, the marker and the climate are one derivation and are carried as one snapshot: when the
      // occurrence or distribution source refused this build, the previous build's answer (same dossier version) stands,
      // with every one of those upstream records saying so. Never piecemeal: a range from one build and records from another
      // would be a page no build made.
      const coreRefused = ['gbif.occurrences', 'wcvp.distribution'].filter((k) => ['refused', 'error'].includes(d.upstream[k]?.status ?? ''));
      const prevCoreOk = ['gbif.occurrences', 'wcvp.distribution'].every((k) => ['ok', 'none'].includes(prev.upstream?.[k]?.status ?? ''));
      if (coreRefused.length && prevCoreOk && prev.v === d.v && !rederive) {
        d.distribution = prev.distribution;
        d.occurrences = prev.occurrences;
        d.centroid = prev.centroid;
        d.climate = prev.climate;
        for (const k of ['gbif.occurrences', 'wcvp.distribution', 'climate']) d.upstream[k] = { ...prev.upstream[k], detail: `carried from build of ${prev.built?.slice(0, 10) ?? '?'} as one snapshot; this build: ${coreRefused.map((c) => `${c} ${d.upstream[c]?.status}`).join(', ')}` };
      }

      // A re-derivation asked no network extra at all: every one of those sections is the previous build's, and says so.
      if (rederive) {
        const from = `carried from build of ${prev.built?.slice(0, 10) ?? '?'} (rederive)`;
        // A carried refusal keeps its reason: "carried from build of …; that build: <why it refused>", not a bare "carried".
        const carried = (u: { detail?: string }) => (u.detail ? `${from}; that build: ${u.detail}` : from);
        // Photographs carry over; a GBIF set read from the download this build replaces the previous GBIF set.
        d.photos = d.upstream['gbif.media']?.status === 'ok' ? mergeGbifPhotos(prev.photos, d.photos.filter((p) => p.src === 'gbif')) : prev.photos;
        d.literature = prev.literature;
        d.summary = prev.summary;
        d.ids = { ...prev.ids, gbif: d.ids.gbif };
        d.links = { ...prev.links, gbif: d.links.gbif };
        for (const k of Object.keys(prev.upstream ?? {})) if (d.upstream[k]?.status === 'skipped' && prev.upstream[k]) d.upstream[k] = { ...prev.upstream[k], detail: carried(prev.upstream[k]) };
      }
    }
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, JSON.stringify(d));
    const refusedSrcs = Object.entries(d.upstream)
      .filter(([, u]) => u.status === 'refused' || u.status === 'error')
      .map(([k, u]) => `${k}:${u.status}${u.detail ? ' (' + u.detail + ')' : ''}`);
    // Many records and none inside the stated range: either a cultivated plant, or the range itself is miscoded upstream. Worth a look either way.
    const inRange = d.occurrences.nOpenInRange + d.occurrences.nRestrictedInRange;
    const disagree = !inRange && d.occurrences.nOutsideRange >= 20 ? ` — range disagrees with records: all ${d.occurrences.nOutsideRange} outside it` : '';
    say(`✓ ${d.name.scientific} [${d.key}] ${d.photos.length} photos, ${d.occurrences.nOpenInRange} open/${d.occurrences.nRestrictedInRange} restricted in range, climate ${d.climate.status}${disagree}${refusedSrcs.length ? ' — refused: ' + refusedSrcs.join(', ') : ''} (${Date.now() - t0} ms)`);
    thisRun.set(d.key, indexEntry(d));
    built++;
    if (upload) execSync(`npx wrangler r2 object put cultifolio/${dossierPath(d.key)} --file="${path}" --content-type=application/json`, { stdio: 'inherit' });
  }
  // The index is every dossier on disk, this run's entries fresh, then sorted.
  const index: IndexEntry[] = fixtures ? [...thisRun.values()] : scanDossiers().map((e) => thisRun.get(e.key) ?? e);
  index.sort((a, b) => a.name.localeCompare(b.name));
  uniqueSlugs(index);
  const idxDir = fixtures ? outDir : `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(`${idxDir}/index.json`, JSON.stringify(index, null, 1));
  writeFileSync(`${idxDir}/report.txt`, report.join('\n'));
  console.log(`\n${built} built, ${keptN} kept of ${jobs.length}; index now ${index.length} species → ${idxDir}/ (index.json and report.txt alongside)`);
  if (bulkStats) console.log(`bulk: ${bulkStats.wcvp} distributions, ${bulkStats.occ} occurrence sets and ${bulkStats.media} photograph sets from the files, ${bulkStats.through} requests to the APIs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
