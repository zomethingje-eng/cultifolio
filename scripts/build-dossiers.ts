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
 *                                                                # drops.txt, when a species lost every photograph or a source turned refused.
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
 *                                                                # ("unknown", "Wikimedia Commons", "iNaturalist user"); no API calls; then --index
 *   npx tsx scripts/build-dossiers.ts --fill gbif --bulk bulk    # photographs from the download's multimedia.txt into every dossier on disk; no API calls
 *   npx tsx scripts/build-dossiers.ts --fill genus               # "About the genus": one Wikipedia lead per genus in the index, to s/v<N>/g/<slug>.json
 *   npx tsx scripts/build-dossiers.ts --names                   # GBIF's vernacular names asked afresh for every dossier on disk (one paced call
 *                                                                # each, about 9,000), only each dossier's vernacular block rewritten, so the
 *                                                                # common-name rule has GBIF's preferred flags and source counts; resumable (a
 *                                                                # dossier done says "names fetched" and is skipped); then the index is rebuilt
 *   npx tsx scripts/build-dossiers.ts --fixtures                # synthetic dossiers for dev
 *
 * The same buildDossier() runs in the Worker for the tail; this script exists
 * so you see every dossier before anyone else does.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
import { mendGbifThumb } from '../src/lib/dossier/md5';
import { heroOf } from '../src/lib/dossier/dedupe';
import { englishNames, generaOf, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
import * as gbif from '../src/lib/dossier/sources/gbif';
import { literature } from '../src/lib/dossier/sources/openalex';
import * as inat from '../src/lib/dossier/sources/inat';
import * as wm from '../src/lib/dossier/sources/wikimedia';
import { genusOf, slugify } from '../src/lib/core/names';
import { makeFetcher, fixtureFetcher } from '../src/lib/dossier/fetch';
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
import { refetchNames, vernacularMark } from './names-step';
import { stampOnBuild, restamp, dayNumber, type Changed } from '../src/lib/dossier/changed';
import { tileCreditOf } from '../src/lib/ui/ref/head';
import { dropsBetween } from '../src/lib/dossier/drops';
import { offlineFetcher, carryRederivedRows } from '../src/lib/dossier/rederive';
import { mwWait, MAXLAG_TRIES } from '../src/lib/dossier/sources/wikimedia';
// The corpus script waits out Wikidata's maxlag, as MediaWiki asks of a batch client; the Worker does not (round sixty-eight).
mwWait.tries = MAXLAG_TRIES;

/** The substance fingerprint's hash: node's own, for nine thousand files (round sixty-three; src/lib/dossier/changed.ts). */
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
/** Today, UTC, as the day a fill's or a prune's change is stamped with when the index is written. */
const today = () => new Date().toISOString().slice(0, 10);

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

type IndexEntry = { key: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: number[]; syn?: string[]; older?: string[]; changed?: number };
type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[] }; distribution: { native: Array<{ name: string }> }; photos: Array<{ id: string; url: string; thumb: string; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
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
function indexEntry(d: Dossierish): IndexEntry & { status?: string } {
  const hero = heroOf(d.photos);
  vernOf.set(d.key, d.name.vernacular.filter((v) => v.lang === 'eng'));
  // Older names: six shown, the rest of species rank searched (`olderNamesOf`; round sixty-seven, N1).
  const genus = d.name.scientific.split(' ')[0];
  const { syn, older } = olderNamesOf(d.name.scientific, d.name.synonyms ?? []);
  // The thumbnail in the form GBIF's cache still answers, whatever form the dossier holds (the Worker mends a dossier's as it reads it; the index carries no key to mend by, so it is mended here: round thirty-two, 1).
  // Its credit, licence first, so a tile names the photographer and not only the host; and the day the dossier last
  // changed in substance, for the sitemap (round sixty-three; REVIEW-TRIAGE-61's deferred list).
  const credit = hero ? tileCreditOf(hero as Parameters<typeof tileCreditOf>[0]) : null;
  const changed = dayNumber(d.changed?.on);
  return { status: d.name.status, key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, ...englishNames(d.name.vernacular, { genus }), origin: d.distribution.native.map((n) => n.name), thumb: hero ? mendGbifThumb(hero.thumb, hero.id, hero.url) : undefined, ...(credit ? { credit } : {}), photos: d.photos.length, open: d.occurrences.nOpenInRange, climate: d.climate.status, ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...(changed ? { changed } : {}) };
}

/** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
/** Dossiers under a name the backbone does not accept: seen on the last scan, so --index can list them. */
let notAccepted: Array<{ key: number; name: string; status: string; records: number }> = [];
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
  let stamped = 0;
  notAccepted = [];
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Dossierish;
      const st = stamp ? restamp(d, today(), sha1) : null;
      if (st) { d.changed = st; writeFileSync(`${dir}/${f}`, JSON.stringify(d)); stamped++; }
      out.push(indexEntry(d));
      if (d.climate.status === 'ok' && d.climate.months?.length === 12) withClimate.push({ key: d.key, months: d.climate.months });
      if (d.name.status && d.name.status !== 'accepted') notAccepted.push({ key: d.key, name: d.name.scientific, status: d.name.status, records: d.occurrences.nOpenInRange + (d.occurrences.nRestrictedInRange ?? 0) + (d.occurrences.nOutsideRange ?? 0) });
    } catch {
      /* a half-written file from a killed run: rebuilt when its name comes round */
    }
  }
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
  const f = makeFetcher();
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
    // A "not asked: already from the GBIF download" stands only while those photographs are here (round sixty-seven; triage-66 N4).
    const wildDone = settled('inat.photos.wild') || ((d.upstream?.['inat.photos.wild']?.detail ?? '').startsWith('not asked') && d.photos.some((p) => p.src === 'gbif' && !p.captive));
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
function pruneUncredited(): void {
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
  const uncredited = (p: { licence: string; attribution: string }) => p.licence !== 'cc0' && /^(unknown|Wikimedia Commons|iNaturalist user|no author stated|author not stated),/.test(p.attribution);
  type Up = Record<string, { status: string; at?: string; detail?: string }>;
  let touched = 0, dropped = 0, reworded = 0, reopened = 0;
  for (const f of files) {
    const path = `${dir}/${f}`;
    let d: { photos: Array<{ licence: string; attribution: string }>; upstream?: Up };
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
    writeFileSync(path, JSON.stringify(d));
    touched++;
  }
  console.log(`${dropped} uncredited photograph${dropped === 1 ? '' : 's'} removed, ${reworded} CC0 credit${reworded === 1 ? '' : 's'} reworded, ${reopened} photo source${reopened === 1 ? '' : 's'} reopened for the next fill, across ${touched} dossier${touched === 1 ? '' : 's'} of ${files.length}; now run --index and upload`);
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

/**
 * The sheets of every species in the index (src/lib/dossier/sheet.ts), filed under the hash bucket of its slug for the
 * count given: one object read a bucket instead of a few hundred (`/api/sheets?b=`; round twelve, 8).
 */
function sheetBuckets(index: IndexEntry[], idxDir: string, count: number): { buckets: Map<string, Sheet[]>; n: number } {
  const buckets = new Map<string, Sheet[]>();
  let n = 0;
  for (const e of index) {
    try {
      const d = parseDossier(JSON.parse(readFileSync(`${idxDir}/${e.key}.json`, 'utf8')));
      const b = bucketOf(e.slug, count);
      (buckets.get(b) ?? buckets.set(b, []).get(b)!).push({ ...sheetOf(d, e.thumb, e.credit), slug: e.slug }); // filed under the index slug, and carrying it: a suffixed homonym's sheet must not answer to the plain name (round sixteen, 8)
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
function writeProducts(index: IndexEntry[], idxDir: string, indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>): Manifest {
  let prev: Manifest | null = null;
  try { prev = JSON.parse(readFileSync(`${idxDir}/manifest.json`, 'utf8')) as Manifest; } catch { /* the first build with a manifest */ }
  if (prev && (typeof prev.files !== 'object' || !Object.values(prev.files).every(isFileHash))) prev = null; // a manifest of round fifty-three's layout names directories, not files
  const { manifest, files } = buildProducts(index, indexText, sheetsOf);
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
    if (prev) writeFileSync(`${idxDir}/manifest.prev.json`, JSON.stringify(prev, null, 1));
    writeFileSync(`${idxDir}/manifest.json`, JSON.stringify(manifest, null, 1));
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
  const r = await refetchNames(dir, makeFetcher(), { progress: (n, of) => { if (n % 100 === 0) process.stdout.write(`\r  ${n} of ${of}…   `); } });
  console.log(`\n  ${r.done} fetched${r.truncated ? ` (${r.truncated} recorded truncated)` : ''}, ${r.kept} done before${r.errors ? `, ${r.errors} errored (asked again next run)` : ''}.`);
  if (r.refused) console.log(`  GBIF refused (${r.refused}); ${r.left} still to do. Run --names again later: it picks up where it stopped.`);
  writeIndexFromDisk();
}

/** The index is derived from the files; after a fill the thumbnails have changed, so it is written again. */
function writeIndexFromDisk(): void {
  const index = uniqueSlugs(scanDossiers(true).sort((a, b) => a.name.localeCompare(b.name)));
  nameEntries(index);
  const idxDir = `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  const indexText = JSON.stringify(index, null, 1);
  writeFileSync(`${idxDir}/index.json`, indexText);
  console.log(`  index: ${index.length} species`);
  writeProducts(index, idxDir, indexText, (count) => sheetBuckets(index, idxDir, count).buckets);
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
  if (fill === 'genus') return fillGenera();
  if (fill) throw new Error(`--fill ${fill}: openalex, inat, gbif or genus`);
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
    let f = makeFetcher();
    if (offline) {
      // No upstream is asked. The one request the bulk fetcher makes on its own, /species/{key} for a name's authorship,
      // is answered from the previous dossier; NASA POWER is allowed through because the extremes cache is on disk and
      // a cell not yet cached is better fetched than refused. Everything else is not asked, and says so.
      // One more exception: an occurrence search that reaches this fetcher has fallen through the bulk fetcher, which
      // means the download holds nothing for the species. That is the case for every species the download request left
      // to the API path (more records than the cut, listed in bulk/api-path.txt), and a dossier holds only its open
      // records, so there is nothing on disk to re-derive the climate from: the API is asked for those, and only those.
      // Not asked, never "refused": nothing refused the site, and 44 pages said it had (round sixty-seven; triage-66 N4).
      f = offlineFetcher(makeFetcher(), (key) => { const prev = readPrev(key); return prev ? { key: prev.key, scientific: prev.name.scientific, authorship: prev.name.authorship } : null; });
    }
    if (bulkDir) {
      console.log(`Loading bulk files from ${bulkDir}/…`);
      const [wcvp, loaded] = await Promise.all([loadWcvp(bulkDir, names), loadOccurrences(bulkDir, 2000, wantedKeys(bulkDir, names))]);
      if (!wcvp) console.log('  no WCVP files: distributions will come from the API');
      if (!loaded && !existsSync(`${bulkDir}/occurrence.zip`) && !existsSync(`${bulkDir}/occurrence.csv`)) console.log('  no occurrence.zip: occurrences will come from the API');
      const apiPath = readApiPath(bulkDir);
      const bf = bulkFetcher(f, { wcvp: wcvp ?? undefined, occ: loaded?.occ, media: loaded?.media ?? undefined, apiPath });
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
  console.log(`Building ${jobs.length} species${quick ? ' (quick)' : ''}${offline ? ' (offline: re-deriving range, records, marker and climate from the files and the grid; the name block, photos, summary and literature carried from the previous build; no upstream asked except occurrences for species the download left to the API path)' : rederive ? ' (re-deriving range, records, centre and climate; photos, summary and literature carried from the previous build)' : skip.length ? ` (skipping ${skip.join(', ')})` : ''}${process.env.OPENALEX_KEY && !rederive ? ' with an OpenAlex key' : ''}…`);
  // Existing dossiers by name, so a clean one is kept rather than rebuilt (unless --force).
  const onDisk = fixtures ? [] : scanDossiers();
  const existing = new Map<string, number>(onDisk.map((e) => [e.name.toLowerCase(), e.key]));
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
        taxon: prevTaxon ? { key: prevTaxon.key, name: prevTaxon.name, accepted: prevTaxon.upstream?.['gbif.accepted'], builtOn: prevTaxon.built } : undefined,
        prevIds: j.key ? readPrev(j.key)?.ids : undefined // kept when Wikidata does not answer (round sixty-eight)
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
          const origin = prev.upstream[src].detail?.startsWith('carried from build of') ? unchain(prev.upstream[src].detail)!.replace(/;.*$/, '') : `carried from build of ${prev.built?.slice(0, 10) ?? '?'}`;
          d.upstream[src] = { ...prev.upstream[src], detail: `${origin}; this build: ${d.upstream[src].detail ?? now}` };
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
        const from = `carried from build of ${prev.built?.slice(0, 10) ?? '?'} (rederive)`;
        // A carried refusal keeps its reason: "carried from build of …; that build: <why it refused>", not a bare "carried".
        // A row carried through several rederives names the build that asked, not the chain of builds that carried it:
        // "carried from build of 2026-09-29 (rederive); that build: carried from build of …" nested nine deep (round thirty-five, R1-10).
        // A chain already in the file is cut to the build that asked and its reason (round thirty-seven, R1-6).
        const carried = (u: { detail?: string }) => (u.detail?.startsWith('carried from build of') ? unchain(u.detail) : u.detail ? `${from}; that build: ${u.detail}` : from);
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
    if (prevFile) for (const why of dropsBetween(prevFile, d)) drops.push(`${d.name.scientific} [${d.key}]: ${why}`);
    d.changed = stampOnBuild(d, prevFile, sha1);
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
  const index: IndexEntry[] = fixtures ? [...thisRun.values()] : scanDossiers(true).map((e) => thisRun.get(e.key) ?? e);
  index.sort((a, b) => a.name.localeCompare(b.name));
  uniqueSlugs(index);
  nameEntries(index);
  const idxDir = fixtures ? outDir : `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(`${idxDir}/index.json`, JSON.stringify(index, null, 1));
  writeFileSync(`${idxDir}/report.txt`, report.join('\n'));
  console.log(`\n${built} built, ${keptN} kept of ${jobs.length}; index now ${index.length} species → ${idxDir}/ (index.json and report.txt alongside; run --index for the sheets, the products and the manifest before the copy up)`);
  if (bulkStats) console.log(`bulk: ${bulkStats.wcvp} distributions, ${bulkStats.occ} occurrence sets and ${bulkStats.media} photograph sets from the files, ${bulkStats.through} requests to the APIs`);
  if (drops.length) {
    writeFileSync('drops.txt', drops.join('\n') + '\n');
    const species = new Set(drops.map((x) => x.replace(/\]:.*$/, ''))).size;
    console.error(`\n${species} species lost what the build before had (photographs dropped to none, or a source turned refused or failed) → drops.txt. Read it before any upload:\n${drops.slice(0, 20).map((x) => `  ${x}`).join('\n')}${drops.length > 20 ? '\n  …' : ''}`);
    process.exitCode = 1;
  } else if (existsSync('drops.txt')) unlinkSync('drops.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
