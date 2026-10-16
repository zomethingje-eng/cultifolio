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
 *                                                                # a re-derivation that asks no upstream: the backbone's name block is carried from the
 *                                                                # previous build too, so the run is the files and the grid, an hour rather than a day. The
 *                                                                # one exception is the occurrence search for species the download left to the API path
 *                                                                # (bulk/api-path.txt): a dossier keeps only open records, so those are fetched again.
 *   npx tsx scripts/build-dossiers.ts --keys keys.txt --grid climate --bulk bulk
 *                                                                # the species of a list rebuilt online by backbone key (one key a line, a name after it
 *                                                                # optional), whatever is on disk; the rest kept. The run fails, and lists them in
 *                                                                # drops.txt, when a species lost what the build before had (photographs, an
 *                                                                # identifier, the summary or the range) or a source turned refused or nothing.
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
 *   npx tsx scripts/build-dossiers.ts --prune-uncredited        # drops every published photograph under CC BY or CC BY-SA that names no author
 *                                                                # ("unknown", "Wikimedia Commons", "iNaturalist user", and Commons' "Own work",
 *                                                                # "See above", "Unknown author", a bare "(talk)" or an address); no API calls; then --index
 *   npx tsx scripts/build-dossiers.ts --fill gbif --bulk bulk    # photographs from the download's multimedia.txt into every dossier on disk; no API calls
 *   npx tsx scripts/build-dossiers.ts --fill gbif-open          # photographs for every dossier that has none, from GBIF's records under an open licence (one API call each)
 *   npx tsx scripts/build-dossiers.ts --fill commons            # photographs for every dossier that has fewer than six, from Wikimedia Commons' category for the species (one API call each)
 *   npx tsx scripts/build-dossiers.ts --fill gbif-licence       # every stored GBIF photograph not on iNaturalist's hosts read again from its occurrence record (one call a
 *                                                                # record); one whose media item states no open licence of its own is dropped; resumable; then the index
 *   npx tsx scripts/build-dossiers.ts --fill inat-ids           # every stored iNaturalist id checked with iNaturalist (thirty a call); an inactive one followed to its
 *                                                                # current taxon only when that taxon's name is the species' or a same-type name (GBIF asked for
 *                                                                # those) held by no other species, and every follow of an earlier run read again so; a taxon
 *                                                                # refused loses its id, link and photographs and the name is searched without it; an id with no
 *                                                                # single successor dropped to be asked by name; photograph sets opened for the next --fill inat
 *   npx tsx scripts/build-dossiers.ts --fill wikidata           # every Wikidata item that does not carry its species' own GBIF key (read fifty a call), and every
 *                                                                # item refused by the label rule, proved again (IPNI first; GBIF for the rest): an item that stands
 *                                                                # says how; one refused, replaced or newly found is left as it is and listed in rebuild-wd.txt for --keys
 *   npx tsx scripts/build-dossiers.ts --fill summaries          # every stored summary under another title proved again, or dropped; those set aside asked again
 *                                                                # (a record that names its proof, or a title set aside, is settled and not asked: add --again after a rule changes)
 *   npx tsx scripts/build-dossiers.ts --fill gbif-basis         # every stored GBIF photograph not on iNaturalist's hosts read again from its record; one not from a
 *                                                                # human observation (a herbarium scan, a drawing, a micrograph) is dropped; resumable; then the index
 *   npx tsx scripts/build-dossiers.ts --fill range-source --bulk bulk # a range Kew gives through a synonym row says whose entry it is; offline; then the index
 *   npx tsx scripts/build-dossiers.ts --fill kew-links          # every stored IPNI and POWO link set to Kew's number for the name and author; resumable; then the index
 *   npx tsx scripts/build-dossiers.ts --fill kew-names --bulk bulk # Kew's names for every page (name.kew), its citation as Kew's row for the number it
 *                                                                # links (name.cited), common names that are scientific names dropped; offline; then the index
 *   npx tsx scripts/build-dossiers.ts --fill commons-kind       # Commons' categories for every stored Commons photograph, fifty files a request, kept with it; then the index
 *   npx tsx scripts/build-dossiers.ts --list-rebuild            # rebuild-keys.txt: the species to rebuild with --keys (ranges under an older name; 50 synonyms stored)
 *   npx tsx scripts/build-dossiers.ts --list-rebuild --bulk bulk # and, from Kew's files, the species whose Kew entry was another author's name or is held under
 *                                                                # another spelling of the epithet (round seventy)
 *   npx tsx scripts/build-dossiers.ts --list-extra-keys         # rebuild-extra.txt: the pages whose stored records do not come from the other GBIF keys
 *                                                                # scripts/extra-keys.txt lists for them (round seventy-three), for --keys
 *   npx tsx scripts/build-dossiers.ts --list-extra-keys --bulk bulk --backbone backbone/simple.txt.gz
 *                                                                # first writes scripts/extra-keys.txt afresh from Kew's file and GBIF's backbone export
 *                                                                # (offline; extra-keys-refused.txt lists the keys the rule did not take, and why)
 *   npx tsx scripts/build-dossiers.ts --fill genus               # "About the genus": one Wikipedia lead per genus in the index, to s/v<N>/g/<slug>.json
 *   npx tsx scripts/build-dossiers.ts --names                   # GBIF's vernacular names asked afresh for every dossier on disk (one paced call
 *                                                                # each, about 9,000), only each dossier's vernacular block rewritten, so the
 *                                                                # common-name rule has GBIF's preferred flags and source counts; resumable (a
 *                                                                # dossier done says "names fetched" and is skipped); then the index is rebuilt
 *   npx tsx scripts/build-dossiers.ts --fixtures                # synthetic dossiers for dev
 *
 * This script is the only builder: no Worker route builds a dossier (round sixty-nine; triage-68 M10), and it exists
 * so you see every dossier before anyone else does.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, rmSync, renameSync } from 'node:fs';
import { loadKewNames, kewFileDay } from './kew-names-load';
import { fillKewNames } from '../src/lib/dossier/kew-names';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
import { mendGbifThumb, mendCommonsThumb } from '../src/lib/dossier/md5';
import { heroOf } from '../src/lib/dossier/dedupe';
import { shownPhotos, heldNamesOf, kindNamesOf, sharedPhotos, markShared, type HeldNames } from '../src/lib/dossier/photo-kind';
import { fillCommonsKindAll } from '../src/lib/dossier/commons-fill';
import { uncreditedPhoto } from '../src/lib/dossier/photo-credit';
import { englishNames, indexNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
import * as gbif from '../src/lib/dossier/sources/gbif';
import { literature } from '../src/lib/dossier/sources/openalex';
import * as inat from '../src/lib/dossier/sources/inat';
import * as wm from '../src/lib/dossier/sources/wikimedia';
import { genusOf, slugify } from '../src/lib/core/names';
import { makeFetcher, fixtureFetcher } from '../src/lib/dossier/fetch';
import { dayCached, type DayStore } from '../src/lib/dossier/day-cache';
import { writeAtomic } from './write-atomic';
import { loadKewInfra } from './kew-infra-load';
import { inatKewFill, type InatKewDossier } from '../src/lib/dossier/inat-kew-fill';
import type { KewInfra } from '../src/lib/dossier/kew-infra';
import { dossierPath, DOSSIER_V, parseDossier, unchain } from '../src/lib/dossier/schema';
import { sheetOf, type Sheet } from '../src/lib/dossier/sheet';
import { bucketOf } from '../src/lib/core/bucket';
import { buildProducts } from '../src/lib/dossier/products';
import { productPath, isFileHash, isManifest, type Manifest } from '../src/lib/dossier/manifest';
import { welwitschia, copiapoa, refused } from '../fixtures/upstream';
import { makeClimateProvider, type PowerCache } from '../src/lib/climate/provider';
import { fileGridSource } from './file-grid';
import type { PowerSeries } from '../src/lib/climate/power';
import type { ClimateProvider } from '../src/lib/dossier/build';
import type { Climate, Dossier } from '../src/lib/dossier/schema';
type ClimateOk = Extract<Climate, { status: 'ok' }>;
import { bulkFetcher } from '../src/lib/dossier/bulk';
import { nearestByClimate } from '../src/lib/core/near';
import { loadWcvp, loadOccurrences, wantedKeys } from './bulk-load';
import { downloadDay } from '../src/lib/dossier/bulk';
import { outsideLog } from '../src/lib/dossier/range-via';
import { refetchNames, vernacularMark } from './names-step';
import { stampOnBuild, restamp, dayNumber, type Changed } from '../src/lib/dossier/changed';
import { tileCreditOf } from '../src/lib/ui/ref/head';
import { dropsBetween } from '../src/lib/dossier/drops';
import { referenceOf } from '../src/lib/dossier/reference';
import { ownNames } from '../src/lib/dossier/own-names';
import { offlineFetcher, carryRederivedRows, carriedOrigin } from '../src/lib/dossier/rederive';
import { startCorpusRun, prevIdsFor, heldElsewhereIn, fillOpenGbifAll, fillCommonsAll, type DossierStore } from '../src/lib/dossier/corpus-run';
import { fillGbifLicenceAll, fillGbifBasisAll, fillRangeSource, fillKewLinks, fillInatIds, fillWikidata, inatTaxonRow, checkSummaries, recordedProof, rebuildList, kewRebuildList, keysMissing } from '../src/lib/dossier/corpus-fills';
import { proofByName } from '../src/lib/dossier/summary-proof';
import { parseExtraKeys, formatExtraKeys, byPage, parseMerges, mergedToPrune, extraRebuild, type ExtraKey, type Merge } from '../src/lib/dossier/extra-keys';
import { listExtraKeys } from './extra-keys-list';
import { aliasesOf, type Alias } from '../src/lib/dossier/products';
// Wikidata is read without maxlag since round seventy-two (its lag is its query service's, which no read waits on), so the
// lag spell below no longer meets a lag from Wikidata; Commons' maxlag (its databases' own) is still waited out by `mwGet`.
const lag = startCorpusRun();

/**
 * The day's upstream answers on disk (`day-cache.ts`; round seventy-two): cache/upstream/<UTC day>/, read only by a run of
 * that day, the days before deleted when a run starts; `--no-cache` asks every source again. Never under static/, so
 * never uploaded, and deleting it changes nothing but what the next run asks.
 */
const CACHE_ROOT = 'cache/upstream';
let dayStore: DayStore | null = null;
function upstream(): ReturnType<typeof makeFetcher> {
  const f = makeFetcher();
  if (process.argv.includes('--no-cache')) return f;
  if (!dayStore) {
    const day = new Date().toISOString().slice(0, 10);
    try { for (const d of existsSync(CACHE_ROOT) ? readdirSync(CACHE_ROOT) : []) if (d !== day) rmSync(`${CACHE_ROOT}/${d}`, { recursive: true, force: true }); } catch { /* an old day left: deleted next time */ }
    const dir = `${CACHE_ROOT}/${day}`;
    mkdirSync(dir, { recursive: true });
    dayStore = {
      get: (k) => { try { return readFileSync(`${dir}/${k}.json`, 'utf8'); } catch { return null; } },
      // Written whole, then renamed: a run killed mid-write leaves no half an answer.
      set: (k, body) => { try { writeFileSync(`${dir}/${k}.tmp`, body); renameSync(`${dir}/${k}.tmp`, `${dir}/${k}.json`); } catch { /* not kept: asked again next time */ } }
    };
  }
  return dayCached(f, dayStore, sha1);
}

/** The substance fingerprint's hash: node's own, for nine thousand files (round sixty-three; src/lib/dossier/changed.ts). */
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
/** Today, UTC, as the day a fill's or a prune's change is stamped with when the index is written. */
const today = () => new Date().toISOString().slice(0, 10);
/**
 * A fill that stopped before every dossier was answered exits 3 (round seventy-two; REVIEW-TRIAGE-71 D7): "run it
 * again" is then the exit code as well as the sentence, for `scripts/corpus-step.mjs` and for anyone reading the end of a
 * run. An index refused for a dossier it cannot read (1) and drops (1) say more, and are not overwritten.
 */
const unfinished = () => { if (!process.exitCode) process.exitCode = 3; };

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const fixtures = args.includes('--fixtures');
const quick = args.includes('--quick');
const offline = args.includes('--offline');
const rederive = args.includes('--rederive') || offline;
const fill = (() => { const i = args.indexOf('--fill'); return i >= 0 ? args[i + 1] : undefined; })();
/**
 * `--keys <file>`: the species of a list rebuilt online by backbone key, one key a line, a name after it optional ("9476326"
 * or "9476326 Aeonium tabulaeforme"); every listed one is rebuilt whatever is on disk, and the rest are kept (round
 * sixty-seven; triage-66 N4: the 164 species an offline re-derivation left without photographs or with a refusal).
 */
const keysFile = (() => { const i = args.indexOf('--keys'); return i >= 0 ? args[i + 1] : undefined; })();
const force = args.includes('--force') || rederive || !!keysFile;
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

/** The keys bulk/api-path.txt lists ("<key>\t<records>" a line): the species the download left to the API path. */
/** The species keys the GBIF download was asked for (bulk/keys.json, written by bulk-fetch), or undefined with no such file. */
function downloadKeys(dir: string): Set<number> | undefined {
  const p = `${dir}/keys.json`;
  if (!existsSync(p)) return undefined;
  try {
    return new Set(Object.values(JSON.parse(readFileSync(p, 'utf8')) as Record<string, number | null>).filter((k): k is number => typeof k === 'number'));
  } catch {
    return undefined;
  }
}

function readApiPath(dir: string): Set<number> {
  const p = `${dir}/api-path.txt`;
  if (!existsSync(p)) return new Set();
  return new Set(readFileSync(p, 'utf8').split(/\r?\n/).map((l) => Number(l.split('\t')[0])).filter((k) => Number.isInteger(k) && k > 0));
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

type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; spellings?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: number[]; syn?: string[]; older?: string[]; changed?: number };
type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[] }; distribution: { native: Array<{ name: string }> }; photos: Array<{ src?: string; id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number; keys?: Array<{ key: number; slug?: string }> }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
/**
 * Each species' English vernacular names, kept from its dossier while the index is made: the common name is chosen by
 * `englishNames`'s rule, which sets back a name naming another genus of the corpus, and the corpus's genera are known
 * only once every entry is (`nameEntries`; round sixty-one, decision 7).
 */
const vernOf = new Map<number, VernacularName[]>();
/** The common names of every entry of the finished index, by the rule with the index's own genera. */
function nameEntries(index: IndexEntry[]): void {
  const genera = generaOf(index.map((e) => e.name));
  index.forEach((e, i) => {
    const names = englishNames(vernOf.get(e.key) ?? [], { genus: e.name, genera });
    // In the entry's own place, after `family`, so a rebuilt index differs from the last only where a name does.
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (k === 'common' || k === 'commons') continue;
      o[k] = v;
      if (k === 'family') Object.assign(o, names);
    }
    index[i] = o as unknown as IndexEntry;
  });
}
/**
 * The photographs a page shows, by the Worker's rule: a Commons file that is not a photograph of the species, or whose
 * licence or author is not read, neither leads a tile nor is counted (round sixty-nine; triage-68 K1-K3, K5). Read with
 * the reference's names, as the Worker reads a dossier (`heldNamesOf` of the index), so the tile, its credit and the count
 * are the page's (round seventy, a need of C; REVIEW-TRIAGE-69 C1, C4).
 */
function photoFields(d: Pick<Dossierish, 'key' | 'name' | 'photos'>, held?: HeldNames | null) {
  const shown = shownPhotos(d.photos, kindNamesOf(d, held));
  const hero = heroOf(shown);
  // The thumbnail in the form GBIF's cache still answers, whatever form the dossier holds (the Worker mends a dossier's as it reads it; the index carries no key to mend by, so it is mended here: round thirty-two, 1).
  // Its credit, licence first, so a tile names the photographer and not only the host (round sixty-three; REVIEW-TRIAGE-61's deferred list).
  const credit = hero ? tileCreditOf(hero as Parameters<typeof tileCreditOf>[0]) : null;
  return { thumb: hero ? mendCommonsThumb(mendGbifThumb(hero.thumb, hero.id, hero.url), hero.width) : undefined, credit, photos: shown.length };
}
function indexEntry(d: Dossierish, held?: HeldNames | null): IndexEntry & { status?: string } {
  const { thumb, credit, photos } = photoFields(d, held);
  vernOf.set(d.key, d.name.vernacular.filter((v) => v.lang === 'eng'));
  // Older names: six shown, the rest of species rank searched (`olderNamesOf`; round sixty-seven, N1).
  const genus = d.name.scientific.split(' ')[0];
  const { syn, older } = olderNamesOf(d.name.scientific, d.name.synonyms ?? []);
  // The day the dossier last changed in substance, for the sitemap (round sixty-three).
  const changed = dayNumber(d.changed?.on);
  // The names with the other spellings the search alone reads (`indexNames`; round sixty-nine; triage-68 N2, S-F2).
  return { status: d.name.status, key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, ...indexNames(d.name.vernacular, { genus }), origin: d.distribution.native.map((n) => n.name), thumb, ...(credit ? { credit } : {}), photos, open: d.occurrences.nOpenInRange, climate: d.climate.status, ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...(changed ? { changed } : {}) };
}

/** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
/** Dossiers under a name the backbone does not accept: seen on the last scan, so --index can list them. */
let notAccepted: Array<{ key: number; name: string; status: string; records: number }> = [];
/** Dossier files on disk the last scan could not read (a write cut off by Ctrl-C or a crash): left out of the index, and said (round seventy-two). */
let unreadable: string[] = [];
/** The old addresses of pages merged into the pages on disk (`occurrences.keys[].slug`; round seventy-three), read by `scanDossiers`. */
let aliases: Alias[] = [];
/**
 * `stamp`: when the index is being written, each dossier's substance stamp is checked and, where a fill, a prune or a
 * hand edit changed the dossier since, written again with today's day (or, never stamped, its last reading); only those
 * files are rewritten (round sixty-three; src/lib/dossier/changed.ts).
 */
function scanDossiers(stamp = false): Array<IndexEntry & { status?: string }> {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  if (!existsSync(dir)) return [];
  const out: Array<IndexEntry & { status?: string }> = [];
  const withClimate: Array<{ key: number; months: Array<{ tmax: number; tmin: number; precipMm: number }> }> = [];
  // Each entry's dossier, as far as its photographs are read: the reference's names are known only once every entry is.
  const forPhotos: Array<Pick<Dossierish, 'key' | 'name' | 'photos'>> = [];
  let stamped = 0;
  notAccepted = [];
  unreadable = [];
  aliases = [];
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Dossierish;
      const st = stamp ? restamp(d, today(), sha1) : null;
      if (st) { d.changed = st; writeAtomic(`${dir}/${f}`, JSON.stringify(d)); stamped++; }
      out.push(indexEntry(d));
      for (const x of d.occurrences.keys ?? []) if (x.slug) aliases.push({ slug: x.slug, key: d.key });
      forPhotos.push({ key: d.key, name: d.name, photos: d.photos });
      if (d.climate.status === 'ok' && d.climate.months?.length === 12) withClimate.push({ key: d.key, months: d.climate.months });
      if (d.name.status && d.name.status !== 'accepted') notAccepted.push({ key: d.key, name: d.name.scientific, status: d.name.status, records: d.occurrences.nOpenInRange + (d.occurrences.nRestrictedInRange ?? 0) + (d.occurrences.nOutsideRange ?? 0) });
    } catch {
      // A half-written file from a killed run: rebuilt when its name comes round, but never left out of the index without a
      // word (round seventy-two: one truncated dossier made an index of one species fewer, and --index said nothing).
      unreadable.push(f);
    }
  }
  // The second phase: each entry's tile, credit and count read again with the reference's names, as the Worker reads a
  // page (round seventy, a need of C; REVIEW-TRIAGE-69 C1 with C4), so an uploader's slip the page shows is shown here too.
  const held = heldNamesOf(out);
  out.forEach((e, i) => {
    const p = photoFields(forPhotos[i], held);
    e.thumb = p.thumb;
    e.photos = p.photos;
    if (p.credit) e.credit = p.credit;
    else delete e.credit;
  });
  if (stamped) console.log(`  ${stamped} dossier${stamped === 1 ? '' : 's'} changed since ${stamped === 1 ? 'its' : 'their'} last stamp (or never stamped): the day each last changed written into the file, for the sitemap`);
  // "Grows like": the six nearest habitat climates per species, by the distance in src/lib/core/near.ts, into the index.
  if (withClimate.length > 1) {
    const t0 = Date.now();
    const near = nearestByClimate(withClimate, 6);
    for (const e of out) {
      const n = near.get(e.key);
      if (n?.length) e.near = n;
    }
    console.log(`  nearest habitat climates for ${withClimate.length} species (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
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
/** Kew's names below species from `--bulk` (round seventy-two, C1), for the build's iNaturalist filter. */
let kewInfra: KewInfra | undefined;
/**
 * The other GBIF keys each page reads records and photographs from (round seventy-three): `scripts/extra-keys.txt`, or the
 * file `--extra-keys` names. Every build reads it, so no rebuild of a page drops them; fixtures read none.
 */
const EXTRA_KEYS = (() => { const i = args.indexOf('--extra-keys'); return i >= 0 ? args[i + 1] : 'scripts/extra-keys.txt'; })();
const extraKeys: Map<number, ExtraKey[]> = fixtures || !existsSync(EXTRA_KEYS) ? new Map() : byPage(parseExtraKeys(readFileSync(EXTRA_KEYS, 'utf8')));
/** The pages merged into another by the owner's decision (round seventy-three): `scripts/merged-pages.txt`. */
const MERGES = 'scripts/merged-pages.txt';
const merges = (): Merge[] => (existsSync(MERGES) ? parseMerges(readFileSync(MERGES, 'utf8')) : []);

/**
 * "About the genus": one Wikipedia lead per genus in the index, quoted like a species' summary, written to s/v<N>/g/<slug>.json.
 * A genus with a record already is left alone unless --force; none (no article, or a disambiguation) is a settled answer and
 * is kept too, so a rerun costs one call per new genus. Nothing on the page is drawn from it beyond the quotation.
 */
async function fillGenera(): Promise<void> {
  const idx = scanDossiers();
  const genera = [...new Set(idx.map((e) => genusOf(e.name)))].sort();
  const dir = `${outDir}/s/v${DOSSIER_V}/g`;
  mkdirSync(dir, { recursive: true });
  const f = upstream();
  let ok = 0, none = 0, refused = 0, kept = 0;
  console.log(`${genera.length} genera in the index; asking Wikipedia for each without a record…`);
  for (const [i, g] of genera.entries()) {
    const slug = slugify(g);
    const p = `${dir}/${slug}.json`;
    if (existsSync(p) && !force) {
      try {
        const prev = JSON.parse(readFileSync(p, 'utf8')) as { status?: string };
        if (prev.status === 'ok' || prev.status === 'none') {
          kept++;
          continue;
        }
      } catch {
        /* rewritten below */
      }
    }
    const r = await wm.summary(f, g);
    const rec = r.status === 'ok'
      ? { genus: g, slug, status: 'ok' as const, summary: { text: r.data.text, source: 'wikipedia' as const, url: r.data.url, licence: 'CC BY-SA 4.0' as const, title: r.data.title }, at: new Date().toISOString() }
      : r.status === 'none'
        ? { genus: g, slug, status: 'none' as const, at: new Date().toISOString() }
        : { genus: g, slug, status: 'refused' as const, detail: `${r.status}: ${r.detail}`, at: new Date().toISOString() };
    writeFileSync(p, JSON.stringify(rec, null, 1));
    if (rec.status === 'ok') ok++;
    else if (rec.status === 'none') none++;
    else refused++;
    if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1} of ${genera.length}…   `);
  }
  if (refused) unfinished();
  console.log(`\n  ${ok} genera with a lead, ${none} with no article, ${refused} refused, ${kept} kept from before → ${dir}/`);
}

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
  const f = upstream();
  let done = 0, none = 0, errors = 0;
  for (const { path, d } of todo) {
    const r = await literature(f, d.name.scientific);
    if (r.status === 'refused') {
      // The fetch layer has already retried and backed off; a refusal now is the allowance, not a blip.
      unfinished();
      console.log(`\n  OpenAlex refused (${'detail' in r ? r.detail : ''}). ${done} filled${none ? `, ${none} with nothing to find` : ''}; ${todo.length - done - none} still to do. A free key allows about 1,000 a day; run this again after the window resets, or add prepaid credits at openalex.org.`);
      return;
    }
    if (r.status === 'error') {
      // A 5xx or a dropped connection is not an absence: leave the section as it was, recorded as an error, and move on.
      d.upstream.openalex = { status: 'error', at: new Date().toISOString(), detail: r.detail };
      writeAtomic(path, JSON.stringify(d));
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
    writeAtomic(path, JSON.stringify(d));
    if ((done + none) % 25 === 0) process.stdout.write(`\r  ${done + none} of ${todo.length}…   `);
  }
  if (errors) unfinished();
  console.log(`\n  ${done} filled, ${none} with nothing to find${errors ? `, ${errors} errored (recorded; run again)` : ''}. Every dossier has been asked for its literature.`);
}

/** Photographs from iNaturalist for every dossier that has none of them yet: the taxon lookup (unless Wikidata already gave the id), then the wild and cultivated sets. */
async function fillPhotos(): Promise<void> {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  type D = { key: number; name: { scientific: string; family?: string; synonyms?: string[] }; ids: { inat?: number }; links: Record<string, string>; photos: Array<{ src: string; captive?: boolean }>; upstream: Record<string, { status: string; at?: string; detail?: string }> };
  const todo: Array<{ path: string; d: D }> = [];
  const entries: Array<{ key: number; name: string; family?: string }> = [];
  // The reference's species by name: iNaturalist's taxon filed under another species of it is never taken (round sixty-nine; triage-68 M6).
  const byName = new Map<string, number>();
  for (const f of files) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
    byName.set(d.name.scientific.toLowerCase(), d.key);
    entries.push({ key: d.key, name: d.name.scientific, family: d.name.family });
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream?.[k]?.status ?? '');
    // A "not asked: already from the GBIF download" stands only while those photographs are here (round sixty-seven; triage-66 N4).
    const wildDone = settled('inat.photos.wild') || ((d.upstream?.['inat.photos.wild']?.detail ?? '').startsWith('not asked') && d.photos.some((p) => p.src === 'gbif' && !p.captive));
    if (!wildDone || !settled('inat.photos.cultivated')) todo.push({ path: `${dir}/${f}`, d });
  }
  console.log(`${files.length} dossiers on disk; ${todo.length} without iNaturalist photographs…`);
  const reference = referenceOf(entries);
  // The reference's names, so an observation iNaturalist files below this species that Kew holds as another is left out (round seventy-two).
  const heldOnDisk = indexHeld();
  const f = upstream();
  let done = 0;
  const t0 = Date.now();
  for (const { path, d } of todo) {
    let id = d.ids.inat;
    if (!id) {
      // Asked as the build asks it (`taxonFor`; round seventy, second pass, triage-69 B5, B7), with the own names the
      // dossier holds: a taxon GBIF holds as another species of this reference is not taken.
      const heldElsewhere = heldElsewhereIn(byName, d.key);
      const t = await inat.taxonFor(f, { scientific: d.name.scientific, key: d.key, family: d.name.family, own: ownNames({ scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], heldElsewhere }), sameType: [], heldElsewhere, reference });
      if (t.status === 'refused') return stop(t.detail);
      // What `--fill inat-ids` said of an id it dropped stays before the name search's answer (`inatTaxonRow`; round seventy, S-B7).
      d.upstream['inat.taxon'] = inatTaxonRow(d.upstream['inat.taxon'], t, new Date().toISOString());
      if (t.status === 'error') {
        // Not "no taxon of this name": the lookup broke. Recorded; the next fill asks again.
        d.upstream['inat.photos.wild'] = { status: 'error', at: new Date().toISOString(), detail: t.detail };
        writeAtomic(path, JSON.stringify(d));
        continue;
      }
      if (t.status === 'ok') id = d.ids.inat = t.data.id;
    }
    if (!id) {
      d.upstream['inat.photos.wild'] = { status: 'none', at: new Date().toISOString(), detail: 'no iNaturalist taxon of exactly this name' };
      d.upstream['inat.photos.cultivated'] = { status: 'none', at: new Date().toISOString() };
      writeAtomic(path, JSON.stringify(d));
      done++;
      continue;
    }
    d.links.inat = `https://www.inaturalist.org/taxa/${id}`;
    // The GBIF download already carries iNaturalist's wild photographs (research-grade, open licences): when six or more
    // are there, the wild set is not asked for again; the cultivated set, which GBIF never has, always is.
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream[k]?.status ?? '');
    const wildFromGbif = d.photos.filter((p) => p.src === 'gbif' && !p.captive).length;
    const wild = wildFromGbif < 6 && !settled('inat.photos.wild') ? await inat.photos(f, id, true, 24, { key: d.key, held: heldOnDisk }) : null;
    if (wild?.status === 'refused') return stop(wild.detail);
    const cult = !settled('inat.photos.cultivated') ? await inat.photos(f, id, false, 12, { key: d.key, held: heldOnDisk }) : null;
    if (cult?.status === 'refused') return stop(cult.detail);
    const fresh = [...(wild?.status === 'ok' ? wild.data : []), ...(cult?.status === 'ok' ? cult.data : [])];
    // iNat photos lead; whatever Commons or GBIF media gave earlier stays behind them. A set not asked for this time keeps what it had.
    d.photos = [...fresh, ...d.photos.filter((p) => p.src !== 'inat' || (wild == null && !p.captive) || (cult == null && p.captive))];
    const stamp = `filled ${new Date().toISOString().slice(0, 10)}`;
    if (wild) d.upstream['inat.photos.wild'] = { status: wild.status, at: new Date().toISOString(), detail: stamp };
    else if (!settled('inat.photos.wild')) d.upstream['inat.photos.wild'] = { status: 'skipped', at: new Date().toISOString(), detail: `not asked: ${wildFromGbif} wild photographs already from the GBIF download` };
    if (cult) d.upstream['inat.photos.cultivated'] = { status: cult.status, at: new Date().toISOString(), detail: stamp };
    writeAtomic(path, JSON.stringify(d));
    done++;
    if (done % 25 === 0) process.stdout.write(`\r  ${done} of ${todo.length} (${((Date.now() - t0) / done / 1000).toFixed(1)} s each)…   `);
  }
  console.log(`\n  ${done} filled. Every dossier has been asked for its photographs.`);
  // Round seventy-two (C1): with Kew's file, the pages whose iNaturalist taxon takes in a taxon Kew places under another species.
  if (bulkDir && (await fillInatDescendants(f, dir)) === 'refused') return;
  writeIndexFromDisk();
  function stop(detail?: string) {
    unfinished();
    console.log(`\n  iNaturalist refused (${detail ?? ''}). ${done} filled; ${todo.length - done} still to do. iNaturalist allows about 10,000 calls a day; run this again tomorrow.`);
    writeIndexFromDisk();
  }
}

/**
 * `--fill inat --bulk <dir>` (round seventy-two, C1): iNaturalist's `taxon_id` takes in every descendant, and it files
 * under a species taxa Kew accepts apart (Eriosyce crispa's "huascensis" is Kew's E. eriosyzoides). Kew's names file
 * says which pages can be touched (a name below one of the page's names that Kew places under another species); for each
 * such page iNaturalist is asked its taxon's children (one request), and where a child is one of those names, both
 * photograph sets are asked again (two requests) and an observation of such a child is left out. Each page read carries
 * the day of Kew's file on its wild-photographs row, so a rerun passes it by; a refusal stops the fill and a rerun resumes.
 */
async function fillInatDescendants(f: ReturnType<typeof makeFetcher>, dir: string): Promise<'done' | 'refused'> {
  console.log("Reading Kew's names below species, for iNaturalist's descendant taxa…");
  const loaded = await loadKewInfra(bulkDir!);
  if (!loaded) { console.log(`  no wcvp_names.csv in ${bulkDir}: not checked`); return 'done'; }
  const c = { pages: 0, asked: 0, before: 0, unanswered: 0 };
  const lines: string[] = [];
  const say = () => console.log(`  ${c.pages} pages hold a name below species that Kew places under another species and an iNaturalist taxon; ${c.asked} asked iNaturalist now${c.before ? `, ${c.before} read before` : ''}${c.unanswered ? `, ${c.unanswered} not answered (asked again by the next fill)` : ''}; ${lines.length} took in such a taxon and were asked again${lines.length ? ' (inat-descendants.txt):\n' + lines.map((l) => `    ${l}`).join('\n') : '.'}`);
  for (const file of readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const path = `${dir}/${file}`;
    const d = JSON.parse(readFileSync(path, 'utf8')) as InatKewDossier;
    const r = await inatKewFill(d, f, loaded.kew, loaded.day);
    if (r.done === 'not a candidate') continue;
    c.pages++;
    if (r.done === 'read before') { c.before++; continue; }
    if (r.done === 'unanswered') { c.unanswered++; continue; }
    if (r.done === 'refused') { unfinished(); say(); console.log(`  iNaturalist refused (${r.detail ?? ''}); run again to go on: a page read is passed by.`); return 'refused'; }
    if (r.done === 'asked again') { c.asked++; lines.push(`${d.key}\t${d.name.scientific}\t${r.placed.map(([n, to]) => `${n} (Kew: ${to})`).join('; ')}\t${r.was} iNaturalist photographs before, ${r.now} now`); }
    else if (r.done === 'marked' && r.asked) c.asked++;
    writeAtomic(path, JSON.stringify(d));
  }
  say();
  if (c.unanswered) unfinished();
  if (lines.length) writeFileSync('inat-descendants.txt', lines.join('\n') + '\n');
  else if (existsSync('inat-descendants.txt')) unlinkSync('inat-descendants.txt');
  return 'done';
}

/**
 * After a rebuild that followed synonyms to their accepted species, the old files under the synonym
 * names are still on disk. Delete exactly those: a non-accepted dossier whose name some accepted
 * dossier says it was "followed from". Anything else under a non-accepted name is left and listed.
 * And a page merged into another by the owner's decision (`scripts/merged-pages.txt`; round seventy-three): deleted only
 * once the page it joined records reading its key (`occurrences.keys`, with its old address), so its records, photographs,
 * names and address are already the kept page's; a merge the kept page does not yet record is listed and left.
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
  const m = mergedToPrune(all.map((x) => x.d as D & { occurrences?: { keys?: Array<{ key: number; slug?: string }> } }), merges());
  for (const k of m.prune) { unlinkSync(`${dir}/${k}.json`); }
  if (m.prune.length || m.waiting.length) console.log(`  ${m.prune.length} dossier${m.prune.length === 1 ? '' : 's'} of pages merged into another deleted (${m.prune.join(', ') || 'none'}); each kept page reads its key and answers its old address${m.waiting.length ? `; not yet, the kept page not rebuilt with it (--keys rebuild-extra.txt): ${m.waiting.join('; ')}` : ''}.`);
  writeIndexFromDisk();
}

/**
 * `--list-extra-keys` (round seventy-three): with `--bulk <dir> --backbone <simple.txt.gz>`, every page's other GBIF keys
 * by the rule (`extra-keys.ts`), from Kew's file and GBIF's backbone export, offline, into scripts/extra-keys.txt, and the
 * keys the rule did not take into extra-keys-refused.txt; then, with or without them, the pages whose stored records do
 * not come from the keys the list gives into rebuild-extra.txt, for `--keys`.
 */
async function listExtraKeysStep(): Promise<void> {
  const backbone = (() => { const i = args.indexOf('--backbone'); return i >= 0 ? args[i + 1] : undefined; })();
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  type P = Parameters<typeof listExtraKeys>[0]['pages'][number] & { occurrences?: { keys?: Array<{ key: number }> } };
  // Each dossier cut to what the rule reads: 8,947 whole dossiers held at once are well over a gigabyte.
  const slim = (d: P): P => ({ key: d.key, name: { scientific: d.name.scientific, ...(d.name.kew ? { kew: { entry: d.name.kew.entry } } : {}) }, occurrences: { keys: d.occurrences?.keys?.map((k) => ({ key: k.key })) } });
  const pages: P[] = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).flatMap((f) => { try { return [slim(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as P)]; } catch { return []; } });
  let list: ExtraKey[];
  if (backbone) {
    if (!bulkDir) { console.error('--list-extra-keys --backbone needs --bulk <dir> with wcvp_names.csv'); process.exit(2); }
    const r = await listExtraKeys({ bulk: bulkDir, backbone, pages, merges: merges() });
    if (!r) { console.error(`  no ${bulkDir}/wcvp_names.csv or no ${backbone}: nothing done`); process.exit(2); }
    list = r.keys;
    const day = kewFileDay(bulkDir);
    writeFileSync(EXTRA_KEYS, formatExtraKeys(list, [`The other GBIF keys each page reads records and photographs from (round seventy-three; src/lib/dossier/extra-keys.ts says the rule).`, `Made ${new Date().toISOString().slice(0, 10)} by --list-extra-keys from Kew's file of ${day} and GBIF's backbone export (${backbone.replace(/^.*[\\/]/, '')}): ${list.length} keys on ${new Set(list.map((k) => k.page)).size} of ${r.pages} pages.`, `page key, key, GBIF's name, GBIF's status, Kew's row (plant_name_id), Kew's reading, how, the old address of a page merged here (or -), the keys under it not read (or -)`]));
    writeFileSync('extra-keys-refused.txt', r.refused.map((x) => `${x.page}\t${x.key}\t${x.label}\t${x.why}`).join('\n') + '\n');
    console.log(`  ${list.length} keys on ${new Set(list.map((k) => k.page)).size} pages → ${EXTRA_KEYS}; ${r.refused.length} keys the rule did not take → extra-keys-refused.txt`);
  } else {
    if (!existsSync(EXTRA_KEYS)) { console.error(`no ${EXTRA_KEYS}: run with --bulk bulk --backbone <simple.txt.gz> to make it`); process.exit(2); }
    list = parseExtraKeys(readFileSync(EXTRA_KEYS, 'utf8'));
  }
  const lines = extraRebuild(pages, list, merges());
  if (lines.length) writeFileSync('rebuild-extra.txt', lines.join('\n') + '\n');
  else if (existsSync('rebuild-extra.txt')) unlinkSync('rebuild-extra.txt');
  console.log(`  ${lines.length} page${lines.length === 1 ? '' : 's'} to rebuild with their other keys${lines.length ? ' → rebuild-extra.txt; run --keys rebuild-extra.txt --rederive --grid climate --bulk bulk, then --prune-followed' : ''}`);
}

/**
 * Two dossiers with one slug (an accepted name and a doubtful homonym) would leave one unreachable. The plain slug goes to
 * the accepted name, whichever file sorted first, and the other gets its key appended; between two of one status the
 * lower key keeps it, so the outcome does not depend on file order (round sixteen, 8). `status` rides on the entry for
 * the choice and is stripped before the index is written.
 */
function uniqueSlugs(index: Array<IndexEntry & { status?: string }>): IndexEntry[] {
  const bySlug = new Map<string, Array<IndexEntry & { status?: string }>>();
  for (const e of index) bySlug.set(e.slug, [...(bySlug.get(e.slug) ?? []), e]);
  for (const [slug, es] of bySlug) {
    if (es.length < 2) continue;
    const rank = (e: { status?: string; key: number }) => (e.status === 'accepted' ? 0 : 1);
    const keeper = [...es].sort((a, b) => rank(a) - rank(b) || a.key - b.key)[0];
    for (const e of es) if (e !== keeper) e.slug = `${slug}-${e.key}`;
  }
  for (const e of index) delete e.status;
  return index;
}

/**
 * Photographs from the download's multimedia.txt, merged into every dossier on disk. One pass over the archive, no API
 * calls: the media index answers the same request the build makes, so the photographs come out identical to a build's.
 * A species the download does not carry (over the record cap, or not in the names file) is left as it is.
 */
/**
 * Photographs published without an author under a licence that requires one (round sixteen, 3: 1.7% of the corpus,
 * credited "unknown, CC BY, via GBIF" by the build's fallback). They are removed from every dossier on disk, with no
 * upstream call; the build no longer produces them.
 */
/**
 * A photograph published under a licence that requires an author and naming none, by the read's own rule
 * (`uncreditedPhoto`): the build's fallback words, and Commons' "Own work", "See above", "Unknown author", a bare "(talk)"
 * or an address, under CC BY or CC BY-SA (round sixty-nine; triage-68 K2).
 */
const uncredited = uncreditedPhoto;
function pruneUncredited(): void {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  type Up = Record<string, { status: string; at?: string; detail?: string }>;
  let touched = 0, dropped = 0, reworded = 0, reopened = 0;
  for (const f of files) {
    const path = `${dir}/${f}`;
    let d: { photos: Array<{ src?: string; licence: string; attribution: string }>; upstream?: Up };
    try {
      d = JSON.parse(readFileSync(path, 'utf8')) as typeof d;
    } catch {
      continue;
    }
    const photos = d.photos ?? [];
    let changed = false;
    // A CC0 photograph needs no credit, but "unknown" reads as a missing one: it says what it is (round seventeen, 13).
    for (const p of photos) if (p.licence === 'cc0' && /^unknown, /.test(p.attribution)) { p.attribution = p.attribution.replace(/^unknown, /, 'author not stated, '); reworded++; changed = true; }
    const keep = photos.filter((p) => !uncredited(p));
    if (keep.length < photos.length) {
      dropped += photos.length - keep.length;
      d.photos = keep;
      changed = true;
    }
    // A dossier the prune emptied, this run or an earlier one, has its photo sources reopened so the next fill asks again
    // (round seventeen, 13: DEPLOY.md's promise that a fill gives an emptied species a credited photograph holds only if
    // the fill looks at it; a source marked ok with no photograph left is not settled).
    if (keep.length === 0) {
      // iNaturalist only: `--fill inat` is what asks again; nothing re-asks Commons, and a source marked skipped that nothing
      // will ask would read as "not asked" for good (round eighteen, 10). The detail names what happened; the page words it.
      for (const k of ['inat.photos.wild', 'inat.photos.cultivated']) {
        if (d.upstream?.[k]?.status === 'ok') { d.upstream[k] = { status: 'skipped', at: new Date().toISOString(), detail: 'no credited photograph is left of what it gave; ask again' }; reopened++; changed = true; }
      }
    }
    if (!changed) continue;
    writeAtomic(path, JSON.stringify(d));
    touched++;
  }
  console.log(`${dropped} uncredited photograph${dropped === 1 ? '' : 's'} removed, ${reworded} CC0 credit${reworded === 1 ? '' : 's'} reworded, ${reopened} photo source${reopened === 1 ? '' : 's'} reopened for the next fill, across ${touched} dossier${touched === 1 ? '' : 's'} of ${files.length}; now run --index and upload`);
}

/**
 * `--fill gbif-open`: photographs for every dossier on disk that has none, from GBIF's records under an open licence (one
 * API request a species; round sixty-eight). Then the index is written, as the other fills do.
 */
async function fillOpenGbifPhotos(): Promise<void> {
  const c = await fillOpenGbifAll(diskStore(), upstream(), (n) => { if (n.asked % 100 === 0) process.stdout.write(`\r  ${n.asked} asked, ${n.filled} given photographs…   `); });
  if (c.failed) unfinished();
  console.log(`\r  ${c.asked} dossiers had no photograph: ${c.filled} were given ${c.photos} from GBIF's openly licensed records, ${c.none} have none there, ${c.failed} not answered (asked again by a later fill)${c.before ? `; ${c.before} passed by, an earlier fill having found none` : ''}.`);
  writeIndexFromDisk();
}

/**
 * `--fill commons`: photographs for every dossier on disk that has fewer than six, from Wikimedia Commons' category for the species
 * (round sixty-eight, fourth part; `commons-fill.ts`). Resumable as `--fill gbif-open` is. Then the index, as a build writes it.
 */
async function fillCommonsPhotos(): Promise<void> {
  const c = await fillCommonsAll(diskStore(), upstream(), (n) => { if (n.asked % 100 === 0) process.stdout.write(`\r  ${n.asked} asked, ${n.filled} given photographs…   `); }, indexHeld());
  if (c.failed) unfinished();
  console.log(`\r  ${c.asked} dossiers had fewer than six photographs: ${c.filled} were given ${c.photos} from Wikimedia Commons, ${c.none} have none there, ${c.failed} not answered (asked again by a later fill)${c.before ? `; ${c.before} passed by, an earlier fill having found none` : ''}.`);
  writeIndexFromDisk();
}

/** The reference's names from the index on disk (`heldNamesOf`), for the fills that read Commons' titles; null with no index. */
function indexHeld(): HeldNames | null {
  const idx = `${outDir}/s/v${DOSSIER_V}/index.json`;
  return existsSync(idx) ? heldNamesOf(JSON.parse(readFileSync(idx, 'utf8'))) : null;
}

/**
 * `--fill commons-kind` (round seventy; REVIEW-TRIAGE-69 C2): Commons' categories (and a struck-out name) for every stored
 * Commons photograph, fifty files a request, kept with it, so the kind rule reads them; resumable; then the index.
 */
async function fillCommonsKindStep(): Promise<void> {
  const c = await fillCommonsKindAll(diskStore(), upstream(), indexHeld(), (n) => process.stdout.write(`\r  ${n.requests} requests, ${n.read} files read…   `));
  console.log(`\r  ${c.files} Commons photographs: ${c.before} had their categories; ${c.asked} asked in ${c.requests} requests, ${c.read} answered${c.missing ? ` (${c.missing} no longer on Commons)` : ''}; ${c.dossiers} dossiers written; ${c.hidden} photographs now left out${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  // Round seventy-one (C's need): the slips asked of Kew and GBIF, the Commons copies of iNaturalist photographs, the credits read again.
  console.log(`  ${c.slipsAsked} slips asked of Kew and GBIF, ${c.slipsOwn} the species'${c.slipsUnchecked ? `, ${c.slipsUnchecked} not answered (run again)` : ''}; ${c.copies} Commons copies of iNaturalist photographs found by their source; ${c.credits} credits read again; ${c.shownAgain} photographs shown again.`);
  if (c.unchecked || c.slipsUnchecked) unfinished();
  if (c.unchecked) console.log(`  ${c.unchecked} not checked${c.refused ? ` (Commons refused: ${c.refused})` : ''}; run --fill commons-kind again: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/** The dossiers on disk as the fills read and write them (`corpus-run.ts`), so a test drives the same loops with dossiers in memory. */
function diskStore(): DossierStore {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  return {
    files: () => (existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : []),
    read: <T,>(file: string) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as T,
    write: (file: string, d: unknown) => writeAtomic(`${dir}/${file}`, JSON.stringify(d))
  };
}

/**
 * `--fill gbif-licence` (round sixty-nine; triage-68 M1, S-B6): each GBIF photograph not on iNaturalist's hosts read again
 * from its own occurrence record; one whose media item states no open licence of its own is dropped. Resumable (a
 * dossier read says so on its GBIF media row); then the index. A dossier left with no photograph is asked again by
 * `--fill gbif-open`, which now reads each photograph's own licence only.
 */
async function fillGbifLicencePhotos(): Promise<void> {
  console.log('Reading each stored GBIF photograph\'s own licence from its occurrence record…');
  const c = await fillGbifLicenceAll(diskStore(), upstream(), (n) => { if (n.dossiers % 50 === 0) process.stdout.write(`\r  ${n.dossiers} dossiers read, ${n.dropped} photographs dropped…   `); });
  console.log(`\r  ${c.dossiers} dossiers read: ${c.kept} photographs carry an open licence of their own, ${c.dropped} did not and were dropped${c.emptied ? ` (${c.emptied} dossiers left with none: run --fill gbif-open)` : ''}${c.before ? `; ${c.before} read by an earlier run, passed by` : ''}.`);
  if (c.failed) unfinished();
  if (c.failed) console.log(`  GBIF did not answer (${c.failed}); run --fill gbif-licence again: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/**
 * `--fill gbif-basis` (round seventy-one; self-review 70 C4): each stored GBIF photograph not on iNaturalist's hosts read
 * again from its occurrence record, and dropped unless the record is a human observation, as builds now ask. Resumable;
 * then the index.
 */
async function fillGbifBasisStep(): Promise<void> {
  console.log('Reading each stored GBIF photograph\'s record for its basis…');
  const c = await fillGbifBasisAll(diskStore(), upstream(), undefined, (n) => { if (n.dossiers % 50 === 0) process.stdout.write(`\r  ${n.dossiers} dossiers read, ${n.dropped} photographs dropped…   `); });
  console.log(`\r  ${c.dossiers} dossiers read: ${c.kept} photographs from human observations kept, ${c.dropped} from other records dropped${c.emptied ? ` (${c.emptied} dossiers left with none: run --fill gbif-open, then --fill commons)` : ''}${c.before ? `; ${c.before} read by an earlier run, passed by` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (c.failed) unfinished();
  if (c.failed) console.log(`  GBIF did not answer (${c.failed}); run --fill gbif-basis again: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/**
 * `--fill range-source --bulk <dir>` (round seventy-one; self-review 70 S-B4): a range Kew gives through the species'
 * own row filed under another name's entry says so, where the stored range is Kew's; one that is not is listed to rebuild.
 * Offline. Then the index.
 */
async function fillRangeSourceStep(): Promise<void> {
  if (!bulkDir) { console.error('--fill range-source needs --bulk <dir> with wcvp_names.csv and wcvp_distribution.csv'); process.exit(2); }
  const store = diskStore();
  const ownNames: string[] = [];
  const names = store.files().flatMap((file) => { try { const d = store.read<Dossier>(file); ownNames.push(d.name.scientific); return [d.name.scientific, ...(d.name.synonyms ?? []).map((x) => x.split(' ').slice(0, 2).join(' '))]; } catch { return []; } });
  const wcvp = await loadWcvp(bulkDir, names, ownNames);
  if (!wcvp) { console.error(`  no WCVP files in ${bulkDir}: nothing done`); process.exit(2); }
  // The GBIF download the records were read from, by its DOI and the day GBIF made it (round seventy-two, B1).
  const meta = `${bulkDir}/download.json`;
  const dl = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { doi?: string; key?: string; fetched?: string }) : null;
  const dlDay = dl ? downloadDay(dl) : undefined;
  const c = fillRangeSource(store, wcvp, dl?.doi && dlDay ? { download: { doi: dl.doi, day: dlDay } } : {});
  console.log(`  Kew's files of ${wcvp.fileDay ?? 'a day not known'}: ${c.written} dossiers written. ${c.said} ranges now say where they come from${c.before ? ` (${c.before} said so already)` : ''}; ${c.doubtful} list regions Kew records as doubtfully present; ${c.named} regions named; ${c.asOf} record sets dated by their download${c.differs.length ? `; ${c.differs.length} whose stored range is not Kew's now, left for a rebuild (--list-rebuild --bulk lists them):\n${c.differs.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  writeIndexFromDisk();
}

/**
 * `--fill kew-names --bulk <dir>` (round seventy-two, A): every page's `name.kew` (Kew's entry, its other names, the
 * older names Kew accepts apart), its citation read against the number it links (`name.cited`), its common names that
 * are a binomial Kew or the reference holds, and the words of a "no POWO link". Offline, from wcvp_names.csv; a second
 * run changes nothing. With `keys`, only those dossiers (a `--keys` build given `--bulk` runs it after). Then the index.
 */
async function fillKewNamesStep(keys?: Set<number>, index = true): Promise<void> {
  if (!bulkDir) { console.error('--fill kew-names needs --bulk <dir> with wcvp_names.csv'); process.exit(2); }
  const all = diskStore();
  const store: DossierStore = keys ? { ...all, files: () => all.files().filter((f) => keys.has(Number(f.replace(/\.json$/, '')))) } : all;
  const pages = store.files().flatMap((file) => { try { return [store.read<Dossier>(file)]; } catch { return []; } });
  console.log(`Reading Kew's names for ${pages.length} dossiers from ${bulkDir}/wcvp_names.csv…`);
  const idx = await loadKewNames(bulkDir, pages);
  if (!idx) { console.error(`  no ${bulkDir}/wcvp_names.csv: nothing done`); process.exit(2); }
  const reference = new Set(all.files().flatMap((file) => { try { return [store.read<Dossier>(file).name.scientific.toLowerCase()]; } catch { return []; } }));
  const c = fillKewNames(store, idx, kewFileDay(bulkDir), reference);
  console.log(`  ${c.read} dossiers read, ${c.changed} changed: ${c.cited} cite Kew's author, ${c.elsewhere} list older names Kew accepts as species of their own, ${c.vernacularDropped} common names dropped as scientific names${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (index) writeIndexFromDisk();
}

/**
 * `--fill kew-links` (round seventy-one; self-review 70 S-B5): every stored IPNI and POWO link read against Kew's number
 * for the name and author (one GBIF request a dossier); each change printed. Resumable; then the index.
 */
async function fillKewLinksStep(): Promise<void> {
  console.log('Reading every stored IPNI and POWO link against Kew\'s number for the name and author…');
  const PROGRESS = 'fill-kew-links-progress.json';
  let read: string[] = [];
  try { if (existsSync(PROGRESS)) read = JSON.parse(readFileSync(PROGRESS, 'utf8')); } catch { read = []; }
  const c = await fillKewLinks(diskStore(), upstream(), undefined, { read, save: (r) => writeFileSync(PROGRESS, JSON.stringify(r)), clear: () => { if (existsSync(PROGRESS)) unlinkSync(PROGRESS); } });
  console.log(`  ${c.read} dossiers read: ${c.changed} linked by Kew's number${c.before ? `; ${c.before} read by an earlier run, passed by` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (c.failed) unfinished();
  if (c.failed) console.log(`  GBIF did not answer (${c.failed}); run --fill kew-links again: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/**
 * `--fill inat-ids` (round sixty-nine; triage-68 M5, R46-13; round seventy, triage-69 B1): every stored iNaturalist id
 * checked, thirty a request, inactive ids followed only by the build's rule and earlier follows read again by it; each
 * change printed; then the index.
 */
async function fillInatIdsStep(): Promise<void> {
  console.log('Checking every stored iNaturalist taxon id with iNaturalist…');
  const c = await fillInatIds(diskStore(), upstream());
  console.log(`  ${c.checked} ids checked: ${c.followed} taxa taken (inactive ids followed to their current taxon, and taxa an earlier rule refused given back), ${c.refused} whose taxon is not this species' (the id, its link and its photographs dropped, the name asked), ${c.kept} earlier follows read again and kept, ${c.dropped} inactive with no single current taxon dropped (asked by name next)${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}\n  Now run --fill inat.`);
  if (c.failed) unfinished();
  if (c.failed) console.log(`  iNaturalist or GBIF did not answer (${c.failed}); run --fill inat-ids again: what was changed stands, and it takes up the rest.`);
  writeIndexFromDisk();
}

/**
 * `--fill wikidata` (round seventy; triage-69 B2, section 6 step 4): the items taken without the species' own GBIF key
 * proved again; those the rule changes are listed in rebuild-wd.txt for `--keys`, and left as they are until then.
 */
async function fillWikidataStep(): Promise<void> {
  console.log('Reading every Wikidata item of the corpus for its GBIF key, and proving again those that do not carry their species\' own…');
  // A run Wikidata's lag stopped resumes from what it read (round seventy, the owner's run), kept beside the corpus.
  const PROGRESS = 'fill-wikidata-progress.json';
  let had: { read?: string[]; changed?: Record<string, { line: string; rebuild: string }> } = {};
  try { if (existsSync(PROGRESS)) had = JSON.parse(readFileSync(PROGRESS, 'utf8')); } catch { had = {}; }
  if (had.read?.length || Object.keys(had.changed ?? {}).length) console.log(`  resuming: ${had.read?.length ?? 0} items read by the run that stopped are passed by`);
  const c = await fillWikidata(diskStore(), upstream(), undefined, {
    ...had,
    save: (p) => writeFileSync(PROGRESS, JSON.stringify(p)),
    clear: () => { if (existsSync(PROGRESS)) unlinkSync(PROGRESS); }
  });
  console.log(`  ${c.read} items read: ${c.byKey} carry their species' GBIF key; ${c.stands} proved again by the rule; ${c.changed} changed by it, left as they are and listed${c.before ? `; ${c.before} proved again by an earlier run, passed by` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  // An IPNI identifier that is not POWO's number: one of the two is another name's (triage-69 B6, R47-5), to be read by hand.
  if (c.disagree.length) {
    writeFileSync('ipni-powo.txt', c.disagree.join('\n') + '\n');
    console.log(`  ${c.disagree.length} dossiers whose IPNI identifier is not the number in their POWO one → ipni-powo.txt`);
  }
  if (c.rebuild.length && !c.failed) {
    writeFileSync('rebuild-wd.txt', c.rebuild.join('\n') + '\n');
    console.log(`  ${c.rebuild.length} species → rebuild-wd.txt; run --keys rebuild-wd.txt --grid climate --bulk bulk, and read drops.txt`);
  } else if (!c.failed && existsSync('rebuild-wd.txt')) {
    // An earlier run's list is not this run's: --keys would rebuild what was settled since (round seventy-two).
    unlinkSync('rebuild-wd.txt');
    console.log('  no species to rebuild: the rebuild-wd.txt of an earlier run is deleted');
  }
  if (c.failed) unfinished();
  if (c.failed) console.log(`  ${c.failed}: not answered; run --fill wikidata again later: what was read and proved stands, the next run takes up the rest, and rebuild-wd.txt is written in full by the run that ends.`);
  writeIndexFromDisk();
}

/** `--fill summaries` (round sixty-nine; triage-68 M3, R46-12; round seventy, triage-69 A1): every stored summary under another title proved again by `summary-proof.ts`, or dropped; those set aside asked again; then the index. */
async function fillSummaries(): Promise<void> {
  // `--again` asks every summary under another title and every title set aside, as a change of the rule needs (round seventy-one, A4).
  const c = await checkSummaries(diskStore(), args.includes('--offline') ? null : upstream(), undefined, { again: args.includes('--again') });
  if (c.settled) console.log(`  ${c.settled} settled, not asked again${args.includes('--again') ? '' : ' (--again asks them)'}`);
  console.log(`  ${c.kept + c.confirmed} summaries are this species' article (${c.kept} by name, with no redirect; ${c.confirmed} proved under another title: ${Object.entries(c.proofs).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}); ${c.dropped} dropped${c.unchecked ? `; ${c.unchecked} not checked, Wikipedia, Wikidata or GBIF not answering (run again)` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  // Round seventy (A1): the lead proves nothing; each record names its proof, and each record changed is listed.
  if (c.changed) console.log(`  ${c.changed} records now name another proof:\n${c.changedLines.map((l) => `    ${l}`).join('\n')}`);
  if (c.restored) console.log(`  ${c.restored} set aside earlier taken back on a proof:\n${c.restoredLines.map((l) => `    ${l}`).join('\n')}`);
  // Round seventy-one (A4, A5): each species left not checked, with the source that did not answer, and the summaries taken off until read.
  if (c.unchecked) unfinished();
  if (c.uncheckedLines.length) console.log(`  not checked (run again):\n${c.uncheckedLines.map((l) => `    ${l}`).join('\n')}`);
  if (c.withdrawn) console.log(`  ${c.withdrawn} taken off until read`);
  writeIndexFromDisk();
}

/**
 * `--list-rebuild` (round sixty-nine; triage-68 M2, M4): the species for `--keys`, into rebuild-keys.txt. With `--bulk`,
 * Kew's files are read too, and the species whose Kew entry the author and spelling rule reads differently are added
 * (round seventy; triage-69 B4).
 */
async function listRebuild(): Promise<void> {
  const lines = rebuildList(diskStore());
  if (bulkDir) {
    const store = diskStore();
    const ownNames: string[] = [];
    const names = store.files().flatMap((file) => { try { const d = store.read<Dossier>(file); ownNames.push(d.name.scientific); return [d.name.scientific, ...(d.name.synonyms ?? []).map((x) => x.split(' ').slice(0, 2).join(' '))]; } catch { return []; } });
    const wcvp = await loadWcvp(bulkDir, names, ownNames);
    if (!wcvp) console.log(`  no WCVP files in ${bulkDir}: Kew's rows are not read, and the list holds only the reasons above`);
    else {
      const kew = kewRebuildList(store, wcvp);
      const listed = new Set(lines.map((l) => l.split(' ')[0]));
      for (const l of kew) if (!listed.has(l.split(' ')[0])) lines.push(l);
      console.log(`  ${kew.length} species whose page is not what Kew's files now give (or a homonym key no build has read)`);
    }
  }
  writeFileSync('rebuild-keys.txt', lines.join('\n') + (lines.length ? '\n' : ''));
  console.log(`  ${lines.length} species to rebuild → rebuild-keys.txt; run --keys rebuild-keys.txt --grid climate --bulk bulk`);
}

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
  type D = Pick<Dossier, 'key' | 'photos' | 'upstream'> & { occurrences?: { keys?: unknown[] } };
  let filled = 0, none = 0, photos = 0, other = 0;
  for (const file of files) {
    const path = `${dir}/${file}`;
    const d = JSON.parse(readFileSync(path, 'utf8')) as D;
    // A page that reads other GBIF keys (round seventy-three) has their photographs in its GBIF set, which the download's
    // set for its own key would replace: it is left, and a build or a re-derivation reads every key.
    if (d.occurrences?.keys?.length) { other++; continue; }
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
    writeAtomic(path, JSON.stringify(d));
    filled++;
    photos += fresh.length;
    if (filled % 500 === 0) process.stdout.write(`\r  ${filled} filled…   `);
  }
  console.log(`\r  ${filled} dossiers given ${photos} photographs from the download; ${none} had none there and keep what they had${other ? `; ${other} that read other GBIF keys left as they are (a re-derivation reads every key)` : ''}.`);
  writeIndexFromDisk();
}

/**
 * The sheets of every species in the index (src/lib/dossier/sheet.ts), filed under the hash bucket of its slug for the
 * count given: one object read a bucket instead of a few hundred (`/api/sheets?b=`; round twelve, 8).
 */
function sheetBuckets(index: IndexEntry[], idxDir: string, count: number, aliases: readonly Alias[] = []): { buckets: Map<string, Sheet[]>; n: number } {
  const buckets = new Map<string, Sheet[]>();
  let n = 0;
  // The old addresses of pages merged into these (round seventy-three; `aliasesOf`): the kept page's sheet under each, so a plant under the old name finds it.
  const alias = new Map<number, string[]>();
  for (const { slug, entry } of aliasesOf(index, aliases)) alias.set(entry.key, [...(alias.get(entry.key) ?? []), slug]);
  for (const e of index) {
    try {
      const d = parseDossier(JSON.parse(readFileSync(`${idxDir}/${e.key}.json`, 'utf8')));
      const b = bucketOf(e.slug, count);
      (buckets.get(b) ?? buckets.set(b, []).get(b)!).push({ ...sheetOf(d, e.thumb, e.credit), slug: e.slug }); // filed under the index slug, and carrying it: a suffixed homonym's sheet must not answer to the plain name (round sixteen, 8)
      for (const old of alias.get(e.key) ?? []) { const ob = bucketOf(old, count); (buckets.get(ob) ?? buckets.set(ob, []).get(ob)!).push({ ...sheetOf(d, e.thumb, e.credit), slug: old }); }
      n++;
    } catch {
      /* a dossier that does not parse is not served as a sheet either; the Worker derives what it can */
    }
  }
  return { buckets, n };
}

/**
 * The build's products, each under the hash of its content, and the manifest that names them (round fifty-three, 2;
 * round fifty-six, 2; src/lib/dossier/products.ts builds them). A file already on disk under its hash is the same file
 * and is not written again, so the copy up (which goes by size and time) carries only what changed. The manifest is
 * written last, so an upload that lands in any order never names a corpus whose files are not all there. The manifest
 * before it is kept as manifest.prev.json, and the files neither names are deleted from `p/` here: the bucket keeps the
 * previous corpus's files until the next refresh (DEPLOY.md says how the bucket is pruned), and a device or an edge
 * that read the previous manifest a minute ago still finds them.
 */
function writeProducts(index: IndexEntry[], idxDir: string, indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>, aliases: readonly Alias[] = []): Manifest {
  let prev: Manifest | null = null;
  try { prev = JSON.parse(readFileSync(`${idxDir}/manifest.json`, 'utf8')) as Manifest; } catch { /* the first build with a manifest */ }
  if (prev && (typeof prev.files !== 'object' || !Object.values(prev.files).every(isFileHash))) prev = null; // a manifest of round fifty-three's layout names directories, not files
  const { manifest, files } = buildProducts(index, indexText, sheetsOf, undefined, aliases);
  const dir = `${idxDir}/p`;
  mkdirSync(dir, { recursive: true });
  let written = 0, kept = 0;
  for (const [name, body] of files) {
    const path = `${idxDir}/${productPath(manifest.files[name]).slice(`s/v${DOSSIER_V}/`.length)}`;
    if (existsSync(path)) { kept++; continue; }
    writeFileSync(path, body);
    written++;
  }
  const changed = prev?.id !== manifest.id || prev.buckets !== manifest.buckets || prev.postings !== manifest.postings;
  if (changed) {
    if (prev) writeAtomic(`${idxDir}/manifest.prev.json`, JSON.stringify(prev, null, 1));
    writeAtomic(`${idxDir}/manifest.json`, JSON.stringify(manifest, null, 1));
  }
  // what neither the manifest nor the one before it names
  let before: string[] = [];
  try { before = Object.values((JSON.parse(readFileSync(`${idxDir}/manifest.prev.json`, 'utf8')) as Manifest).files ?? {}); } catch { /* no corpus before this one */ }
  const keep = new Set([...Object.values(manifest.files), ...before].map((h) => `${h}.json`));
  let gone = 0;
  for (const f of readdirSync(dir)) if (/^[0-9a-f]{16,64}\.json$/.test(f) && !keep.has(f)) { unlinkSync(`${dir}/${f}`); gone++; }
  console.log(`  corpus ${manifest.id}: ${index.length} species in ${manifest.buckets} buckets, ${manifest.postings} posting files → ${dir}/ (${written} files written, ${kept} already on disk under their hash, ${gone} of older corpora deleted)${changed ? '; manifest.json names it' : '; unchanged'}`);
  return manifest;
}

/**
 * `--keep-list <live manifest>`: the product files the bucket must keep, as rclone filter lines, from the manifest the
 * bucket serves now (`rclone cat r2:cultifolio/s/v2/manifest.json > live-manifest.json`), never from this checkout's
 * build history: a prune from a second checkout, or after two refreshes in a day, deleted files the live manifest named
 * (round fifty-eight; the first review). DEPLOY.md section 5 pairs it with `rclone delete --min-age 24h`, so nothing
 * uploaded in the last day goes either, whatever manifest names it.
 */
function keepList(): void {
  const at = args.indexOf('--keep-list');
  const file = args[at + 1];
  if (!file || file.startsWith('--') || !existsSync(file)) {
    console.error('usage: npm run dossier -- --keep-list <the live manifest, from rclone cat>');
    process.exit(2);
  }
  let live: unknown;
  try { live = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch { live = null; }
  if (!isManifest(live)) {
    console.error(`${file} is not a manifest the Worker would accept: nothing is listed, and nothing should be deleted`);
    process.exit(2);
  }
  // And whatever this checkout's own two manifests name: a corpus built here and uploaded, or about to be, whose files the
  // live manifest does not name yet (an upload between the copy of the live manifest and the delete), is kept too (round
  // fifty-nine; three reviews).
  const named = new Set(Object.values(live.files));
  const also: string[] = [];
  for (const local of [`${outDir}/s/v${DOSSIER_V}/manifest.json`, `${outDir}/s/v${DOSSIER_V}/manifest.prev.json`]) {
    if (!existsSync(local)) continue;
    let m: unknown;
    try { m = JSON.parse(readFileSync(local, 'utf8').replace(/^\uFEFF/, '')); } catch { m = null; }
    if (!isManifest(m)) continue;
    for (const h of Object.values(m.files)) named.add(h);
    also.push(m.id);
  }
  const keep = [...named].sort().map((h) => `/${h}.json`);
  writeFileSync('keep.txt', keep.join('\n') + '\n');
  console.log(`  keep.txt: the ${keep.length} files manifest ${live.id} (live, ${live.species} species)${also.length ? ` and this checkout's ${also.join(', ')}` : ''} name; pass it to rclone delete as --exclude-from`);
}

/**
 * GBIF's vernacular names afresh for every dossier on disk (round sixty-two, decision 3; scripts/names-step.ts), then the
 * index, whose common names are chosen from them. A refusal stops the run and says how many are left; the same command
 * picks up where it stopped.
 */
async function fillNames(): Promise<void> {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  console.log(`Asking GBIF for the vernacular names of every dossier in ${dir}…`);
  const r = await refetchNames(dir, upstream(), { progress: (n, of) => { if (n % 100 === 0) process.stdout.write(`\r  ${n} of ${of}…   `); } });
  console.log(`\n  ${r.done} fetched${r.truncated ? ` (${r.truncated} recorded truncated)` : ''}, ${r.kept} done before${r.errors ? `, ${r.errors} errored (asked again next run)` : ''}.`);
  if (r.refused || r.errors) unfinished();
  if (r.refused) console.log(`  GBIF refused (${r.refused}); ${r.left} still to do. Run --names again later: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/** The dossiers the last scan could not read, said and failing the run, so no upload follows unread (round seventy-two). */
function sayUnreadable(): void {
  if (!unreadable.length) return;
  const one = unreadable.length === 1;
  console.error(`  ${unreadable.length} dossier${one ? '' : 's'} on disk could not be read: ${unreadable.join(', ')}. Do not upload: rebuild ${one ? 'it' : 'them'} with --keys, or copy ${one ? 'it' : 'them'} back from the backup, then run --index again.`);
  process.exitCode = 1;
}

/** The index is derived from the files; after a fill the thumbnails have changed, so it is written again. */
/**
 * Round seventy-two (C5): a photograph two species' pages would show is a photograph of neither alone (the same
 * iNaturalist photograph on two observations of different plants, a council's survey plot filed under three species).
 * Each such photograph is marked `shared` with the other pages' keys, and a mark no longer true is taken off; only the
 * files whose marks change are written. Read with the photographs each page shows by every other rule, so a file one
 * page leaves out (another species' Commons file) does not hide it on the page it belongs to.
 */
function markSharedPhotos(dir: string): void {
  if (!existsSync(dir)) return;
  type D = Dossierish & { photos: Array<Parameters<typeof markShared>[0][number]> };
  const all: Array<{ path: string; d: D }> = [];
  // A page that leaves by a merge (scripts/merged-pages.txt; round seventy-three) holds the photographs its kept page reads
  // now: counted, it would hide them on the kept page until the prune (Weingartia fidaiana showed 5 of 20).
  const away = new Set(merges().map((m) => m.from));
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f) || away.has(Number(f.slice(0, -5)))) continue;
    try { all.push({ path: `${dir}/${f}`, d: JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D }); } catch { /* half-written: rebuilt when its name comes round */ }
  }
  const held = heldNamesOf(all.map(({ d }) => ({ key: d.key, name: d.name.scientific, ...olderNamesOf(d.name.scientific, d.name.synonyms ?? []) })));
  const marks = sharedPhotos(all.map(({ d }) => ({ key: d.key, name: d.name, photos: shownPhotos(d.photos ?? [], kindNamesOf(d, held), { shared: false }) })));
  const lines: string[] = [];
  let written = 0;
  for (const { path, d } of all) {
    if (!markShared(d.photos ?? [], marks.get(d.key))) continue;
    writeAtomic(path, JSON.stringify(d));
    written++;
  }
  for (const [key, m] of marks) lines.push(`${key}\t${all.find((x) => x.d.key === key)?.d.name.scientific ?? ''}\t${m.size} photograph${m.size === 1 ? '' : 's'} also on ${[...new Set([...m.values()].flat())].join(', ')}`);
  if (marks.size) {
    writeFileSync('shared-photos.txt', lines.sort().join('\n') + '\n');
    console.log(`  ${[...marks.values()].reduce((n, m) => n + m.size, 0)} photographs on ${marks.size} pages are held by another species' page too: shown on none (shared-photos.txt)${written ? `; ${written} dossiers marked anew` : ''}`);
  } else if (existsSync('shared-photos.txt')) unlinkSync('shared-photos.txt');
}

function writeIndexFromDisk(): void {
  markSharedPhotos(`${outDir}/s/v${DOSSIER_V}`);
  const index = uniqueSlugs(scanDossiers(true).sort((a, b) => a.name.localeCompare(b.name)));
  // A write-then-rename a stopped run left half done: the dossier it was replacing is whole, and the temporary file goes (the scan reads only `<key>.json`).
  const leftDir = `${outDir}/s/v${DOSSIER_V}`;
  const left = existsSync(leftDir) ? readdirSync(leftDir).filter((f) => /\.tmp$/.test(f)) : [];
  for (const f of left) unlinkSync(`${leftDir}/${f}`);
  if (left.length) console.log(`  ${left.length} temporary file${left.length === 1 ? '' : 's'} a stopped run left deleted; the files ${left.length === 1 ? 'it was' : 'they were'} replacing are whole`);
  // A dossier that cannot be read is never published by its absence: the index, the products and the manifest stay as
  // they were until it is rebuilt or restored (round seventy-two).
  if (unreadable.length) { sayUnreadable(); console.error('  the index, its products and the manifest are left as they were.'); return; }
  nameEntries(index);
  const idxDir = `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  const indexText = JSON.stringify(index, null, 1);
  writeAtomic(`${idxDir}/index.json`, indexText);
  console.log(`  index: ${index.length} species`);
  // Old addresses of merged pages (round seventy-three): read from the kept pages' records, as `--prune-followed` reads them.
  if (aliases.length) console.log(`  ${aliases.length} old address${aliases.length === 1 ? '' : 'es'} of pages merged into another answered by the kept page: ${aliases.map((a) => a.slug).join(', ')}`);
  writeProducts(index, idxDir, indexText, (count) => sheetBuckets(index, idxDir, count, aliases).buckets, aliases);
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
  if (args.includes('--prune-uncredited')) return pruneUncredited();
  if (args.includes('--index')) return writeIndexFromDisk();
  if (args.includes('--keep-list')) return keepList();
  if (fill === 'openalex') return fillLiterature();
  if (fill === 'inat') return fillPhotos();
  if (fill === 'gbif') return fillGbifPhotos();
  if (fill === 'gbif-open') return fillOpenGbifPhotos();
  if (fill === 'commons') return fillCommonsPhotos();
  if (fill === 'gbif-licence') return fillGbifLicencePhotos();
  if (fill === 'inat-ids') return fillInatIdsStep();
  if (fill === 'wikidata') return fillWikidataStep();
  if (fill === 'summaries') return fillSummaries();
  if (fill === 'commons-kind') return fillCommonsKindStep();
  if (fill === 'genus') return fillGenera();
  if (fill === 'gbif-basis') return fillGbifBasisStep();
  if (fill === 'range-source') return fillRangeSourceStep();
  if (fill === 'kew-links') return fillKewLinksStep();
  if (fill === 'kew-names') return fillKewNamesStep();
  if (fill) throw new Error(`--fill ${fill}: openalex, inat, inat-ids, wikidata, gbif, gbif-open, gbif-licence, gbif-basis, commons, commons-kind, summaries, range-source, kew-links, kew-names or genus`);
  if (args.includes('--list-rebuild')) return listRebuild();
  if (args.includes('--list-extra-keys')) return listExtraKeysStep();
  if (args.includes('--names')) return fillNames();
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
    const file = keysFile ?? args.find((a) => !a.startsWith('--'));
    if (file && !existsSync(file)) {
      // Said as it is (round seventy, the owner's run: `--keys rebuild-wd.txt`, which a stopped `--fill wikidata` had not
      // written, printed the usage line).
      console.error(keysMissing(file));
      process.exit(2);
    }
    if (!file) {
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
      if (m) return { name: m[2].trim(), key: Number(m[1]) };
      // A key alone (a --keys list): the name is the previous dossier's, for the log and the WCVP genera.
      const k = /^(\d+)\s*$/.exec(line);
      if (k) return { name: readPrev(Number(k[1]))?.name.scientific ?? `key ${k[1]}`, key: Number(k[1]) };
      return { name: line.split('\t')[0].trim(), key: undefined };
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
    let f = upstream();
    if (offline) {
      // No upstream is asked. The one request the bulk fetcher makes on its own, /species/{key} for a name's authorship,
      // is answered from the previous dossier; NASA POWER is allowed through because the extremes cache is on disk and
      // a cell not yet cached is better fetched than refused. Everything else is not asked, and says so.
      // One more exception: an occurrence search that reaches this fetcher has fallen through the bulk fetcher, which
      // means the download holds nothing for the species. That is the case for every species the download request left
      // to the API path (more records than the cut, listed in bulk/api-path.txt), and a dossier holds only its open
      // records, so there is nothing on disk to re-derive the climate from: the API is asked for those, and only those.
      // Not asked, never "refused": nothing refused the site, and 44 pages said it had (round sixty-seven; triage-66 N4).
      f = offlineFetcher(upstream(), (key) => { const prev = readPrev(key); return prev ? { key: prev.key, scientific: prev.name.scientific, authorship: prev.name.authorship } : null; });
    }
    if (bulkDir) {
      console.log(`Loading bulk files from ${bulkDir}/…`);
      // The genera of each species' older names too, so a range Kew files under another name can be found (round
      // sixty-eight: Bisnaga glaucescens is Ferocactus glaucescens at Kew, Aeonium tabulaeforme is spelt tabuliforme).
      const olderGenera = unique.flatMap((p) => (p.key ? readPrev(p.key)?.name.synonyms ?? [] : []).map((x) => x.split(' ').slice(0, 2).join(' ')));
      // The species the download was asked for (bulk/keys.json): one built here under a name the download did not use is
      // still in the files by its key, and one outside them is asked of GBIF, never read as having no photograph (round
      // seventy, the owner's run: 85 of 118 species rebuilt lost their GBIF photographs).
      const covered = downloadKeys(bulkDir);
      const byName = wantedKeys(bulkDir, names);
      const wanted = byName && covered ? new Set([...byName, ...unique.flatMap((p) => (p.key && covered.has(p.key) ? [p.key] : []))]) : byName;
      // The other keys these pages read (round seventy-three): kept where the download holds them; the rest are asked of GBIF.
      if (wanted) for (const p of unique) for (const x of extraKeys.get(p.key ?? -1) ?? []) wanted.add(x.key);
      const [wcvp, loaded] = await Promise.all([loadWcvp(bulkDir, [...names, ...olderGenera], fixtures ? undefined : scanDossiers().map((e) => e.name)), loadOccurrences(bulkDir, 2000, wanted)]);
      if (!wcvp) console.log('  no WCVP files: distributions will come from the API');
      if (!loaded && !existsSync(`${bulkDir}/occurrence.zip`) && !existsSync(`${bulkDir}/occurrence.csv`)) console.log('  no occurrence.zip: occurrences will come from the API');
      const apiPath = readApiPath(bulkDir);
      const bf = bulkFetcher(f, { wcvp: wcvp ?? undefined, occ: loaded?.occ, media: loaded?.media ?? undefined, apiPath, covered });
      mediaFromFiles = !!loaded?.media;
      // Kew's names below species, so an iNaturalist observation of a taxon Kew places under another species is not taken (round seventy-two, C1).
      kewInfra = (await loadKewInfra(bulkDir))?.kew;
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
  console.log(`Building ${jobs.length} species${quick ? ' (quick)' : ''}${offline ? ' (offline: re-deriving range, records, marker and climate from the files and the grid; the name block, photos, summary and literature carried from the previous build; no upstream asked except occurrences for species the download left to the API path)' : rederive ? ' (re-deriving range, records, centre and climate; photos, summary and literature carried from the previous build)' : skip.length ? ` (skipping ${skip.join(', ')})` : ''}${process.env.OPENALEX_KEY && !rederive ? ' with an OpenAlex key' : ''}…`);
  // Existing dossiers by name, so a clean one is kept rather than rebuilt (unless --force).
  const onDisk = fixtures ? [] : scanDossiers();
  const existing = new Map<string, number>(onDisk.map((e) => [e.name.toLowerCase(), e.key]));
  const reference = referenceOf(onDisk);
  // The reference's names, so a slip in a Commons title is read as the Worker reads it (round seventy, a need of C; C1).
  const held = onDisk.length ? heldNamesOf(onDisk) : null;
  // The previous build of each species, read once a species, and the index's names: what its build is given (round sixty-nine; triage-68 M5, M6).
  const prevOf = (key?: number) => (key ? readPrev(key) : null);
  if (onDisk.length) console.log(`  ${onDisk.length} dossiers already on disk${force ? ' (rebuilding all)' : ' (clean ones kept)'}`);
  let built = 0, keptN = 0;
  const thisRun = new Map<number, IndexEntry>();
  const drops: string[] = [];
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
        taxon: prevTaxon ? { key: prevTaxon.key, name: prevTaxon.name, accepted: prevTaxon.upstream?.['gbif.accepted'], species: prevTaxon.upstream?.['gbif.species'], builtOn: prevTaxon.built } : undefined,
        // Kept when Wikidata does not answer, with the day they were read (round sixty-eight; round sixty-nine, triage-68 M5).
        ...prevIdsFor(prevOf(j.key)),
        heldElsewhere: heldElsewhereIn(existing, j.key ?? existing.get(j.name.toLowerCase())),
        // The reference's species, so an iNaturalist taxon GBIF holds as another of them is not taken (round seventy; triage-69 B5).
        reference,
        held,
        kewInfra,
        // The other GBIF keys of this page (round seventy-three); the builder reads only those listed for the key it builds.
        extraKeys: extraKeys.get(j.key ?? existing.get(j.name.toLowerCase()) ?? -1)
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
    lag.after(d.upstream.wikidata);
    if (lag.run === 10) console.log('  Wikidata lagged for ten species in a row: not waiting for it again until it answers; the previous identifiers are kept meanwhile');
    // The names step's mark, kept by every build: a build that asked GBIF for the names writes it, as the step does, and
    // an offline re-derivation that carried the name block carries the mark it had. A rederive dropped it, and the
    // formats page's "truncated" was no longer true, and the next `--names` asked again for every species (round
    // sixty-two; the verification review's search 17).
    const vu = d.upstream['gbif.vernacular'];
    if (vu) d.upstream['gbif.vernacular'] = { ...vu, detail: vernacularMark(vu, offline ? { detail: j.key ? readPrev(j.key)?.upstream?.['gbif.vernacular']?.detail : undefined } : null) };
    const path = `${outDir}/${dossierPath(d.key)}`;
    // A source that refused this time does not erase what it gave us last time: carry the previous
    // build's section forward and say so in the upstream record.
    // The previous build of this species: this version's file, or the last version's when the corpus is being carried
    // across a schema bump (photographs, summary, identifiers and literature keep their shape; the derivation does not).
    const legacyPath = `${outDir}/s/v${DOSSIER_V - 1}/${d.key}.json`;
    const prevPath = existsSync(path) ? path : existsSync(legacyPath) ? legacyPath : null;
    let prevFile: typeof d | null = null;
    if (prevPath) {
      const prev = JSON.parse(readFileSync(prevPath, 'utf8')) as typeof d;
      prevFile = prev;
      // copy() returns whether anything was carried; the upstream record says "carried" only then.
      const carry = (src: string, copy: () => boolean) => {
        const now = d.upstream[src]?.status, before = prev.upstream?.[src]?.status;
        // Skipped this build (a --skip source) counts the same as refused: what the last build had is kept.
        if ((now === 'refused' || now === 'error' || now === 'skipped') && (before === 'ok' || before === 'none') && copy()) {
          // A row already carried keeps the build that asked (round thirty-five, R1-10).
          const origin = prev.upstream[src].detail?.startsWith('carried from build of') ? unchain(prev.upstream[src].detail)!.replace(/;.*$/, '') : carriedOrigin(prev.upstream[src], prev.built);
          d.upstream[src] = { ...prev.upstream[src], detail: `${origin}; this build: ${d.upstream[src].detail ?? now}` };
        }
      };
      carry('openalex', () => ((d.literature = prev.literature), true));
      // A carried summary under a title other than the name or an older name is carried only when its record names the
      // proof read for it; one whose proof was not read is not checked, and is not carried (round seventy-one, A5;
      // REVIEW-TRIAGE-70: "the carried one goes with it"). This build's own record of the refusal stands.
      carry('wikipedia', () => {
        const t = prev.summary?.title;
        if (t && !proofByName(t, { name: prev.name.scientific, synonyms: prev.name.synonyms ?? [] }) && !recordedProof(prev.upstream?.wikipedia)) return false;
        d.summary = prev.summary;
        return true;
      });
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
          // Never another taxon's: a build that took a different iNaturalist taxon from the last (a follow the rule now
          // refuses: Pinguicula chilensis' 816267) does not carry that taxon's photographs (round seventy; triage-69 B1).
          if (src.startsWith('inat') && d.ids.inat && prev.ids?.inat && d.ids.inat !== prev.ids.inat) return false;
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
      // A source this build did not ask (an offline re-derivation) is carried the same way, in a re-derivation too: its
      // range and climate were lost on 44 species, whose pages then said the source had refused (round sixty-seven;
      // triage-66 N4).
      const coreRefused = ['gbif.occurrences', 'wcvp.distribution'].filter((k) => ['refused', 'error'].includes(d.upstream[k]?.status ?? '') || d.upstream[k]?.status === 'skipped');
      const coreNotAsked = coreRefused.length > 0 && coreRefused.every((k) => d.upstream[k]?.status === 'skipped');
      const prevCoreOk = ['gbif.occurrences', 'wcvp.distribution'].every((k) => ['ok', 'none'].includes(prev.upstream?.[k]?.status ?? ''));
      if (coreRefused.length && prevCoreOk && prev.v === d.v && (!rederive || coreNotAsked)) {
        d.distribution = prev.distribution;
        d.occurrences = prev.occurrences;
        d.centroid = prev.centroid;
        d.climate = prev.climate;
        for (const k of ['gbif.occurrences', 'wcvp.distribution', 'climate']) d.upstream[k] = { ...prev.upstream[k], detail: `carried from build of ${prev.built?.slice(0, 10) ?? '?'} as one snapshot; this build: ${coreRefused.map((c) => `${c} ${d.upstream[c]?.status}`).join(', ')}` };
      }

      // A re-derivation asked no network extra at all: every one of those sections is the previous build's, and says so.
      if (rederive) {
        const from = (u: { at?: string }) => carriedOrigin(u, prev.built, ' (rederive)');
        // A carried refusal keeps its reason: "carried from build of …; that build: <why it refused>", not a bare "carried".
        // A row carried through several rederives names the build that asked, not the chain of builds that carried it:
        // "carried from build of 2026-09-29 (rederive); that build: carried from build of …" nested nine deep (round thirty-five, R1-10).
        // A chain already in the file is cut to the build that asked and its reason (round thirty-seven, R1-6).
        const carried = (u: { detail?: string; at?: string }) => (u.detail?.startsWith('carried from build of') ? unchain(u.detail) : u.detail ? `${from(u)}; that build: ${u.detail}` : from(u));
        // Photographs carry over; a GBIF set read from the download this build replaces the previous GBIF set, and a
        // download that covers the species and has no observation photographs for it replaces the set with nothing
        // (an older build's herbarium sheets would otherwise stay for good: round thirty-two, 3).
        const fromFiles = mediaFromFiles && ['ok', 'none'].includes(d.upstream['gbif.media']?.status ?? '');
        d.photos = fromFiles ? [...prev.photos.filter((p) => p.src !== 'gbif'), ...d.photos.filter((p) => p.src === 'gbif')] : d.upstream['gbif.media']?.status === 'ok' ? mergeGbifPhotos(prev.photos, d.photos.filter((p) => p.src === 'gbif')) : prev.photos;
        d.literature = prev.literature;
        d.summary = prev.summary;
        d.ids = { ...prev.ids, gbif: d.ids.gbif };
        d.links = { ...prev.links, gbif: d.links.gbif };
        // Never a row of the one derivation, and never "already from the GBIF download" without those photographs
        // (`carryRederivedRows`; round sixty-seven, triage-66 N4: 120 species carried it with none).
        carryRederivedRows(prev, d, carried);
      }
    }
    // The day the page last changed in substance: the previous file's when this build changed nothing it shows, else this
    // build's (round sixty-three; src/lib/dossier/changed.ts), so a refresh that changes nothing does not move the sitemap.
    // What this build lost that the last had: the run fails at its end, so the corpus is read before it is uploaded (round sixty-seven; triage-66 N4).
    if (prevFile) for (const why of dropsBetween(prevFile, d, held)) drops.push(`${d.name.scientific} [${d.key}]: ${why}`);
    d.changed = stampOnBuild(d, prevFile, sha1);
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeAtomic(path, JSON.stringify(d));
    const refusedSrcs = Object.entries(d.upstream)
      .filter(([, u]) => u.status === 'refused' || u.status === 'error')
      .map(([k, u]) => `${k}:${u.status}${u.detail ? ' (' + u.detail + ')' : ''}`);
    // Many records and none inside the stated range: either a cultivated plant, or the range itself is miscoded upstream. Worth a look either way.
    const inRange = d.occurrences.nOpenInRange + d.occurrences.nRestrictedInRange;
    // Every record outside it, one or more, as the page says it (round seventy-two, B10: 49 of 64 such pages never reached the log).
    const disagree = !inRange && d.occurrences.rangeTested && d.occurrences.nOutsideRange ? outsideLog(d.occurrences.nOutsideRange) : '';
    say(`✓ ${d.name.scientific} [${d.key}] ${d.photos.length} photos, ${d.occurrences.nOpenInRange} open/${d.occurrences.nRestrictedInRange} restricted in range, climate ${d.climate.status}${disagree}${refusedSrcs.length ? ' — refused: ' + refusedSrcs.join(', ') : ''} (${Date.now() - t0} ms)`);
    thisRun.set(d.key, indexEntry(d, held));
    built++;
    if (upload) execSync(`npx wrangler r2 object put cultifolio/${dossierPath(d.key)} --file="${path}" --content-type=application/json`, { stdio: 'inherit' });
  }
  // A build given Kew's files reads Kew's names for what it built, as `--fill kew-names` does (round seventy-two, A); the
  // index then reads those dossiers from disk.
  if (bulkDir && !fixtures && thisRun.size) { await fillKewNamesStep(new Set(thisRun.keys()), false); thisRun.clear(); }
  // The index is every dossier on disk, this run's entries fresh, then sorted.
  const index: IndexEntry[] = fixtures ? [...thisRun.values()] : scanDossiers(true).map((e) => thisRun.get(e.key) ?? e);
  index.sort((a, b) => a.name.localeCompare(b.name));
  uniqueSlugs(index);
  nameEntries(index);
  const idxDir = fixtures ? outDir : `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  writeAtomic(`${idxDir}/index.json`, JSON.stringify(index, null, 1));
  writeFileSync(`${idxDir}/report.txt`, report.join('\n'));
  sayUnreadable();
  console.log(`\n${built} built, ${keptN} kept of ${jobs.length}; index now ${index.length} species → ${idxDir}/ (index.json and report.txt alongside; run --index for the sheets, the products and the manifest before the copy up)`);
  if (bulkStats) console.log(`bulk: ${bulkStats.wcvp} distributions, ${bulkStats.occ} occurrence sets and ${bulkStats.media} photograph sets from the files, ${bulkStats.through} requests to the APIs`);
  if (drops.length) {
    writeFileSync('drops.txt', drops.join('\n') + '\n');
    const species = new Set(drops.map((x) => x.replace(/\]:.*$/, ''))).size;
    console.error(`\n${species} species lost what the build before had (photographs, an identifier, the summary or the range lost, a source turned refused, failed or nothing, identifiers kept twice) → drops.txt. Read it before any upload:\n${drops.slice(0, 20).map((x) => `  ${x}`).join('\n')}${drops.length > 20 ? '\n  …' : ''}`);
    process.exitCode = 1;
  } else if (existsSync('drops.txt')) unlinkSync('drops.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
