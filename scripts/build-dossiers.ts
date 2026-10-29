/**
 * Offline corpus build. Runs on your PC against the real upstreams, writes one
 * JSON per species to ./static/s/v<N>/<key>.json, and (optionally) uploads to R2.
 *
 *   npx tsx scripts/build-dossiers.ts names.txt                 # one name per line (or "<backbone key> <name>" to build by key)
 *   npx tsx scripts/build-dossiers.ts static/s/v1/index.json --rederive --grid climate --bulk bulk
 *                                                                # a previous corpus's index as the list: every species in it, by key
 *   npx tsx scripts/build-dossiers.ts names.txt --grid climate  # with habitat climate from the packed grid
 *   npx tsx scripts/build-dossiers.ts names.txt --force         # rebuild species that already have a clean dossier (by default they are kept)
 *   npx tsx scripts/build-dossiers.ts names.txt --skip inat     # leave a source out of this run (marked skipped; a later run or fill asks it)
 *                                                                # Literature is off (round seventy-eight, the owner's decision 2): no build asks
 *                                                                # OpenAlex, and --fill openalex says so and stops; a later round fills the papers
 *                                                                # from OpenAlex's snapshot.
 *   npx tsx scripts/build-dossiers.ts --fill inat               # photographs only, the same way: iNaturalist asks for about 1 a second and 10,000
 *                                                                # a day, and throttled this fill at about 5,500; a long run leaves photos out (--skip
 *                                                                # inat) and fills them daily. Round eighty: ids not yet checked are checked first
 *                                                                # (thirty a request), and the observation searches ask several taxa a request
 *                                                                # (src/lib/dossier/inat-batch.ts), one request every 2 s; a run of 429s is waited out.
 *   npx tsx scripts/build-dossiers.ts --fill inat --cultivated  # the cultivated set alone (round seventy-eight). Every
 *                                                                # run of a UTC day together asks iNaturalist at most 4,000 times (--inat-budget <n>),
 *                                                                # counted in cache/day-budget/; at the allowance it stops, exit 3, and the same command
 *                                                                # the next day goes on from where it stopped (each dossier is written as it is filled).
 *   npx tsx scripts/build-dossiers.ts --fill inat --wild --inat-open bulk/inat-wild.jsonl
 *                                                                # the wild set alone, from iNaturalist's open data (round seventy-nine; written by
 *                                                                # scripts/inat-open-load.ts), for every dossier with an iNaturalist taxon, in one
 *                                                                # pass: no request to iNaturalist. With --inat-open (or --bulk <dir> holding
 *                                                                # inat-wild.jsonl), --fill inat and the build read the wild set from the file wherever
 *                                                                # it holds the taxon and ask iNaturalist only for the rest; --no-inat-open does not.
 *                                                                # Round eighty: --fill inat (not --wild, not --cultivated) also asks the API, once, for
 *                                                                # the 24 most-voted wild observations of each page whose wild set the open data gave
 *                                                                # and whose taxon it holds more than 24 of (the open data's 24 are the newest: it
 *                                                                # holds no votes), under the same day's budget; a set of 24 or fewer is the whole set.
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
 * Literature is off (round seventy-eight): OPENALEX_KEY is read by nothing.
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
 *   npx tsx scripts/build-dossiers.ts --fill inat-restore backups/v3-<corpus>
 *                                                                # round eighty: the iNaturalist ids a build that skipped iNaturalist dropped, given
 *                                                                # back from the corpus before it, unchecked, for --fill inat to check; offline
 *   npx tsx scripts/build-dossiers.ts --fill inat-ids           # every stored iNaturalist id checked with iNaturalist (thirty a call); an inactive one followed to its
 *                                                                # current taxon only when that taxon's name is the species' or a same-type name (GBIF asked for
 *                                                                # those) held by no other species, and every follow of an earlier run read again so; a taxon
 *                                                                # refused loses its id, link and photographs and the name is searched without it; an id with no
 *                                                                # single successor dropped to be asked by name; photograph sets opened for the next --fill inat
 *   npx tsx scripts/build-dossiers.ts --fill wikidata           # every Wikidata item that does not carry its species' own GBIF key (read fifty a call), and every
 *                                                                # item refused by the label rule, proved again (IPNI first; GBIF for the rest): an item that stands
 *                                                                # says how; one refused, replaced or newly found is left as it is and listed in rebuild-wd.txt for --keys
 *   npx tsx scripts/build-dossiers.ts --fill wikidata-names     # English common names for every page without a GBIF key, from its own Wikidata item (P1843),
 *                                                                # two hundred items a query; --keyed also for keyed pages with no English name from GBIF; then the index
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
 *   npx tsx scripts/build-dossiers.ts --list-default-points      # scripts/default-points.txt (round eighty): a dataset's default coordinates, read from the
 *                                                                # dossiers on disk, and rebuild-default-points.txt, the pages holding one, for --keys; offline
 *   npx tsx scripts/build-dossiers.ts --list-range-shapes        # rebuild-shapes.txt (round eighty): every page with an open in-range record outside every
 *                                                                # native region's shape (scripts/tdwg3-shapes.json), for --keys … --offline; offline
 *   npx tsx scripts/build-dossiers.ts --list-no-reason           # rebuild-no-reason.txt (round eighty-two): every page with a row not ok and no reason
 *   npx tsx scripts/build-dossiers.ts --list-r83-repair <copy or none> <shapes before>
 *                                                                # rebuild-r83c.txt (round eighty-three): every page whose records the October 2026
 *                                                                # repair took out that the regions' shapes or the default points now keep; offline
 *   npx tsx scripts/build-dossiers.ts --list-wikidata-retry      # rebuild-wd-retry.txt (round eighty): every page Wikidata did not answer at its build, and
 *                                                                # every page with a Kew id whose item a label refused, for --keys; offline
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
import { signEntries } from '../src/lib/core/hybrids';
import { fillWikidataNames } from '../src/lib/dossier/wikidata-names';
import { fillKewNames, KewNamesIndex } from '../src/lib/dossier/kew-names';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defaultPoints, formatDefaultPoints, parseDefaultPoints, pointKey, MIN_SPECIES, MIN_UNDATED } from '../src/lib/dossier/default-points';
import { repairList, changedRegions, type RepairPage } from '../src/lib/dossier/repair-r83';
import { regionTester, outsideShapes, SHAPES_FILE, type RegionTester, type ShapesFile } from '../src/lib/dossier/tdwg-shapes';
import { buildDossier, NETWORK_EXTRAS, photosFromMedia, mergeGbifPhotos, type SkippableSource } from '../src/lib/dossier/build';
import { mendGbifThumb, mendCommonsThumb } from '../src/lib/dossier/md5';
import { heroOf } from '../src/lib/dossier/dedupe';
import { shownPhotos, heldNamesOf, kindNamesOf, sharedPhotos, markShared, judgePhotos, type HeldNames } from '../src/lib/dossier/photo-kind';
import { fillCommonsKindAll } from '../src/lib/dossier/commons-fill';
import { uncreditedPhoto } from '../src/lib/dossier/photo-credit';
import { englishNames, indexNames, generaOf, olderNamesOf, kewOlderOf, homonymEntries, mergedNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
import * as gbif from '../src/lib/dossier/sources/gbif';
import { LITERATURE_OFF } from '../src/lib/dossier/sources/openalex';
import * as inat from '../src/lib/dossier/sources/inat';
import * as wm from '../src/lib/dossier/sources/wikimedia';
import { genusOf, slugify } from '../src/lib/core/names';
import { makeFetcher, fixtureFetcher, isThrottle } from '../src/lib/dossier/fetch';
import { dayCached, type DayStore } from '../src/lib/dossier/day-cache';
import { dayBudget, INAT_DAY_BUDGET } from '../src/lib/dossier/day-budget';
import { writeAtomic } from './write-atomic';
import { loadKewInfra } from './kew-infra-load';
import { inatKewFill, kewReading, type InatKewDossier } from '../src/lib/dossier/inat-kew-fill';
import { inatBatched, wildGroups, CULTIVATED_BATCH } from '../src/lib/dossier/inat-batch';
import { restoreInatIds } from '../src/lib/dossier/inat-restore';
import { openWildStore, heldWild, wildToAsk, mostVotedToAsk, OPEN_WILD_RULE, MOST_VOTED_RULE, WILD_PER_TAXON, type OpenWildStore } from '../src/lib/dossier/inat-open';
import type { KewInfra } from '../src/lib/dossier/kew-infra';
import { dossierPath, DOSSIER_V, parseDossier, unchain, Dossier as DossierSchema } from '../src/lib/dossier/schema';
import * as vb from 'valibot';
import { sheetOf, type Sheet } from '../src/lib/dossier/sheet';
import { bucketOf } from '../src/lib/core/bucket';
import { buildProducts } from '../src/lib/dossier/products';
import { productPath, isFileHash, isManifest, corpusHashes, type Manifest } from '../src/lib/dossier/manifest';
import { welwitschia, copiapoa, refused, kewRows, KEW_FILE_DAY } from '../fixtures/upstream';
import { makeClimateProvider, type PowerCache } from '../src/lib/climate/provider';
import { fileGridSource } from './file-grid';
import type { PowerSeries } from '../src/lib/climate/power';
import type { ClimateProvider } from '../src/lib/dossier/build';
import type { Climate, Dossier } from '../src/lib/dossier/schema';
type ClimateOk = Extract<Climate, { status: 'ok' }>;
import { bulkFetcher } from '../src/lib/dossier/bulk';
import { batchSources, BATCH_CHUNK } from '../src/lib/dossier/batch';
import { kewRowsFetcher } from '../src/lib/dossier/kew-rows';
import { loadKewRows } from './kew-rows-load';
import { nearestByClimate } from '../src/lib/core/near';
import { loadWcvp, loadOccurrences, wantedKeys, downloadShortOf, addCreated } from './bulk-load';
import { downloadDay } from '../src/lib/dossier/bulk';
import { outsideLog } from '../src/lib/dossier/range-via';
import { isSpeciesList, parseSpeciesList, jobsFromList, downloadKeysOf, heldThroughRange } from './select-species-lib';
import { buildKewDossier, kewInatTaxon, fillKewWhy, type KewSpecies } from '../src/lib/dossier/build-kew';
import { canonicalOfKew } from '../src/lib/dossier/kew-rows';
import { loadKewSpecies } from './kew-species-load';
import { refetchNames, vernacularMark } from './names-step';
import { stampOnBuild, restamp, dayNumber, type Changed } from '../src/lib/dossier/changed';
import { tileCreditOf } from '../src/lib/ui/ref/head';
import { dropsBetween } from '../src/lib/dossier/drops';
import { referenceOf } from '../src/lib/dossier/reference';
import { ownNames } from '../src/lib/dossier/own-names';
import { offlineFetcher, carryRederivedRows, carriedOrigin, keptInatId, carryInatRows, keptInatSetRow, keepsInatSet, carryWdNames } from '../src/lib/dossier/rederive';
import { startCorpusRun, prevIdsFor, heldElsewhereIn, fillOpenGbifAll, fillCommonsAll, type DossierStore } from '../src/lib/dossier/corpus-run';
import { fillGbifLicenceAll, fillGbifBasisAll, fillRangeSource, fillKewLinks, fillInatIds, fillWikidata, wikidataRetryList, inatTaxonRow, checkSummaries, recordedProof, rebuildList, kewRebuildList, keysMissing } from '../src/lib/dossier/corpus-fills';
import { proofByName } from '../src/lib/dossier/summary-proof';
import { parseExtraKeys, formatExtraKeys, byPage, byPageId, parseMerges, mergedToPrune, mergeKeys, extraRebuild, parseNoKeys, type ExtraKey, type Merge } from '../src/lib/dossier/extra-keys';
import { listExtraKeys } from './extra-keys-list';
import { parsePlaces, PlaceIndex, InstitutionEffect } from '../src/lib/dossier/clean';
import { aliasesOf, type Alias } from '../src/lib/dossier/products';
import { gbifPage, isPageId, type PageId } from '../src/lib/core/page-id';
import { rekey, DOSSIER_FILE, V2_FILE, idsGbifLines, type RekeyStore, type RekeyReport } from '../src/lib/dossier/rekey';
import { sharedKewLines } from '../src/lib/dossier/page-ids';
import { noReasonLines, type NoReasonPage } from '../src/lib/dossier/no-reason';
import { upToDate, writeStamp, INDEX_STAMP } from '../src/lib/dossier/index-stamp';
/** This checkout's folder: the builder's code, whose content the index's stamp holds (round eighty-one). */
const CODE_ROOT = fileURLToPath(new URL('..', import.meta.url));
// @ts-ignore a plain .mjs module, shared with scripts/corpus-step.mjs, with no declarations
import { takeLock } from './run-lock.mjs';
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
/**
 * iNaturalist's day (round seventy-eight; `day-budget.ts`): every run of a UTC day together asks it at most
 * `INAT_DAY_BUDGET` times (`--inat-budget <n>` names another), counted in cache/day-budget/, so a fill over 54,000 species
 * stops at the day's allowance and goes on the next day.
 */
// Round eighty (agent I): `CULTIFOLIO_INAT_BUDGET` names another day too, so the owner can lower it without touching a
// plan's step line (a changed step starts a plan again).
const inatBudget = (() => { const i = process.argv.indexOf('--inat-budget'); const env = Number(process.env.CULTIFOLIO_INAT_BUDGET); return i >= 0 ? Number(process.argv[i + 1]) : Number.isInteger(env) && env >= 0 && process.env.CULTIFOLIO_INAT_BUDGET !== '' ? env : INAT_DAY_BUDGET; })();
const BUDGET_ROOT = 'cache/day-budget';
const budgetStore = {
  read: (day: string) => { try { return Number(readFileSync(`${BUDGET_ROOT}/${day}-api.inaturalist.org.txt`, 'utf8')) || 0; } catch { return 0; } },
  write: (day: string, n: number) => { try { mkdirSync(BUDGET_ROOT, { recursive: true }); writeFileSync(`${BUDGET_ROOT}/${day}-api.inaturalist.org.txt`, String(n)); } catch { /* not kept: the count starts again */ } }
};
/**
 * iNaturalist's wild photographs from its open data (round seventy-nine, agent P; `src/lib/dossier/inat-open.ts`):
 * `<bulk>/inat-wild.jsonl`, written by `scripts/inat-open-load.ts`, or the file `--inat-open <file>` names. Where it holds
 * a taxon, the builder's wild request is answered from it, never asked of iNaturalist and never counted in its day;
 * `--no-inat-open` asks the API as before.
 */
let inatOpen: OpenWildStore | null | undefined;
const inatOpenHeld: { held: number; mostVoted?: number } = { held: 0 };
function openWild(): OpenWildStore | null {
  if (inatOpen !== undefined) return inatOpen;
  const named = (() => { const i = process.argv.indexOf('--inat-open'); return i >= 0 ? process.argv[i + 1] : undefined; })();
  const bulk = (() => { const i = process.argv.indexOf('--bulk'); return i >= 0 ? process.argv[i + 1] : undefined; })();
  const path = process.argv.includes('--no-inat-open') ? undefined : named ?? (bulk && existsSync(`${bulk}/inat-wild.jsonl`) ? `${bulk}/inat-wild.jsonl` : undefined);
  inatOpen = path ? openWildStore(path) : null;
  if (inatOpen) console.log(`  iNaturalist's wild photographs from its open data of ${inatOpen.header.day} (${path}), in place of the API`);
  return inatOpen;
}
/**
 * `mostVoted` (round eighty, agent V; on but for `--fill inat --cultivated`): the open data answers a taxon's wild set only
 * where it is the whole qualifying set (24 observations or fewer); for a taxon of which it holds more, the API is asked
 * for the 24 it puts first by votes, counted in the day like any request (`heldWild`).
 */
function upstream(mostVoted = true): ReturnType<typeof makeFetcher> {
  // Outermost, so an answer from the open data is neither counted in iNaturalist's day nor kept in the day's cache.
  const open = openWild();
  return open ? heldWild(upstreamApi(), open, inatOpenHeld, { mostVoted }) : upstreamApi();
}
function upstreamApi(): ReturnType<typeof makeFetcher> {
  const f = dayBudget(makeFetcher(), 'api.inaturalist.org', inatBudget, budgetStore);
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

/**
 * The dossiers on disk by GBIF key (round seventy-eight): a dossier is stored under its page's id (`s/v3/<id>.json`),
 * and the build asks GBIF, and finds a species' previous build, by its GBIF key. Read from the files once a run, the
 * first time it is needed, and kept as the run writes.
 */
let onDiskIds: Map<number, PageId> | null = null;
function diskIds(): Map<number, PageId> {
  if (onDiskIds) return onDiskIds;
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  onDiskIds = new Map();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => DOSSIER_FILE.test(x)) : []) {
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { key?: unknown; ids?: { gbif?: number } };
      if (typeof d.ids?.gbif === 'number' && isPageId(d.key)) onDiskIds.set(d.ids.gbif, d.key);
    } catch { /* half-written: the scan says so */ }
  }
  return onDiskIds;
}
/** The id of the page on disk for a GBIF key, or undefined. */
const idOfGbif = (key: number): PageId | undefined => diskIds().get(key);
/** A page id or a GBIF key, as a `--keys` line or a list names a page: the GBIF key it is built by, or null when no page on disk has that id. */
function gbifOfLine(x: string): number | null {
  if (/^[1-9][0-9]*$/.test(x)) return Number(x);
  if (!isPageId(x)) return null;
  if (x.startsWith('g')) return Number(x.slice(1));
  for (const [g, id] of diskIds()) if (id === x) return g;
  return null;
}

/** POWER series cached on disk so the same 0.5° cell is never requested twice across runs. */
/**
 * The previous build of a GBIF key: the dossier on disk under its page's id, or, before this version's corpus is written,
 * the last version's file (`s/v2/<key>.json`), or null. Parsed each time; a rederive reads each once.
 */
function readPrev(key: number): Dossier | null {
  const id = idOfGbif(key);
  for (const p of [...(id ? [`${outDir}/${dossierPath(id)}`] : []), `${outDir}/s/v${DOSSIER_V - 1}/${key}.json`]) {
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

type IndexEntry = { key: PageId; gbif?: number; slug: string; name: string; family?: string; common?: string; commons?: string[]; spellings?: string[]; origin: string[]; thumb?: string; credit?: string; photos: number; open: number; climate: string; near?: PageId[]; syn?: string[]; older?: string[]; kew?: string[]; hom?: string[]; homBy?: string[][]; changed?: number };
type Dossierish = { key: PageId; ids?: { gbif?: number }; slug: string; name: { scientific: string; authorship?: string | null; family?: string; status?: string; vernacular: VernacularName[]; synonyms?: string[]; kew?: { synonyms?: string[] } }; distribution: { native: Array<{ name: string }> }; photos: Array<{ src?: string; id: string; url: string; thumb: string; width?: number; captive?: boolean; attribution: string; licence?: string }>; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; nOutsideRange?: number; keys?: Array<{ key: number; slug?: string; name?: string }> }; climate: { status: string; months?: Array<{ tmax: number; tmin: number; precipMm: number }> }; changed?: Changed };
/**
 * Each species' English vernacular names, kept from its dossier while the index is made: the common name is chosen by
 * `englishNames`'s rule, which sets back a name naming another genus of the corpus, and the corpus's genera are known
 * only once every entry is (`nameEntries`; round sixty-one, decision 7).
 */
const vernOf = new Map<PageId, VernacularName[]>();
/** Each species' own older names, GBIF's and Kew's, kept with its vernacular names: one written as a common name is not one (round eighty, A). */
const olderOf = new Map<PageId, string[]>();
/** Each species' own author and GBIF's older names as its record writes them, with their authors: what `homonymEntries` reads (round eighty-two; review 1's 3). */
const recordOf = new Map<PageId, { authorship?: string | null; synonyms: string[] }>();
/**
 * The index as published (round eighty-two; review 1's 3): an older name spelt as another page's accepted name, by another
 * author, moved from `syn` and `older` to `hom` (`homonymEntries`), and said. The index given stays as it was, for the
 * photograph judgement, which reads the names it read before (`heldNamesOf` reads `hom` too).
 */
function homonymIndex<E extends IndexEntry>(index: E[]): E[] {
  const h = homonymEntries(index, (key) => recordOf.get(key));
  if (h.names) console.log(`  ${h.names} older name${h.names === 1 ? '' : 's'} on ${h.pages} page${h.pages === 1 ? '' : 's'} spelt as another page's accepted name, by another author: searched only as a name typed, and said as another author's name (hom)${h.kept ? `; ${h.kept} by that page's own author kept as older names` : ''}`);
  return h.index;
}
/** The common names of every entry of the finished index, by the rule with the index's own genera. */
function nameEntries(index: IndexEntry[]): void {
  const genera = generaOf(index.map((e) => e.name));
  index.forEach((e, i) => {
    const names = englishNames(vernOf.get(e.key) ?? [], { genus: e.name, genera, older: olderOf.get(e.key) ?? [] });
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
  // The names of the pages merged into this one by the owner's decision (`occurrences.keys`, a key with its old address;
  // scripts/merged-pages.txt), as GBIF writes them, are this page's older names in the index too (round eighty-two, the
  // merge, on F's need): a page built from Kew's file does not hold a name Kew files elsewhere or not at all (Echeveria
  // peacockii, which Kew files under Dudleya pulverulenta; Bisnaga hamatacantha, which Kew's file does not hold), and the
  // search found the old name's page, after the prune, nowhere or only elsewhere. The record's own names come first.
  const own = d.name.synonyms ?? [];
  const mergedHere = (d.occurrences.keys ?? []).flatMap((x) => (x.slug && x.name && !own.includes(x.name) ? [x.name] : []));
  const names = mergedHere.length ? [...own, ...mergedHere] : own;
  olderOf.set(d.key, [...names, ...(d.name.kew?.synonyms ?? [])]);
  recordOf.set(d.key, { authorship: d.name.authorship, synonyms: names });
  // Older names: six shown, the rest of species rank searched (`olderNamesOf`; round sixty-seven, N1).
  const genus = d.name.scientific.split(' ')[0];
  const { syn, older } = olderNamesOf(d.name.scientific, names);
  // Kew's older names the two do not hold, for the search alone (`kewOlderOf`; round eighty, review-d 5).
  const kew = kewOlderOf(d.name.scientific, [...syn, ...older], Array.isArray(d.name.kew?.synonyms) ? d.name.kew.synonyms : undefined);
  // The names of the pages merged here, marked (`mergedNamesOf`; round eighty-three): the search puts this page first for
  // one typed, and its row says why. A page whose merge is not yet built into it (no key with an old address) has none.
  const merged = mergedNamesOf(d.name.scientific, d.occurrences.keys);
  // The day the dossier last changed in substance, for the sitemap (round sixty-three).
  const changed = dayNumber(d.changed?.on);
  // The names with the other spellings the search alone reads (`indexNames`; round sixty-nine; triage-68 N2, S-F2).
  return { status: d.name.status, key: d.key, ...(d.ids?.gbif != null ? { gbif: d.ids.gbif } : {}), slug: d.slug, name: d.name.scientific, family: d.name.family, ...indexNames(d.name.vernacular, { genus, older: olderOf.get(d.key) }), origin: d.distribution.native.map((n) => n.name), thumb, ...(credit ? { credit } : {}), photos, open: d.occurrences.nOpenInRange, climate: d.climate.status, ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}), ...(kew.length ? { kew } : {}), ...(merged.length ? { merged } : {}), ...(changed ? { changed } : {}) };
}

/** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
/** Dossiers under a name the backbone does not accept: seen on the last scan, so --index can list them. */
let notAccepted: Array<{ key: PageId; name: string; status: string; records: number }> = [];
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
  const withClimate: Array<{ key: PageId; gbif?: number; months: Array<{ tmax: number; tmin: number; precipMm: number }> }> = [];
  // Each entry's file, read again for its photographs once the reference's names are known (round seventy-nine: held
  // until then, every page's photographs were most of the build's memory at the full list's 48,368).
  const forPhotos: string[] = [];
  let stamped = 0;
  notAccepted = [];
  unreadable = [];
  aliases = [];
  for (const f of readdirSync(dir)) {
    if (!DOSSIER_FILE.test(f)) continue;
    try {
      const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Dossierish;
      const st = stamp ? restamp(d, today(), sha1) : null;
      if (st) { d.changed = st; writeAtomic(`${dir}/${f}`, JSON.stringify(d)); stamped++; }
      out.push(indexEntry(d));
      for (const x of d.occurrences.keys ?? []) if (x.slug) aliases.push({ slug: x.slug, key: d.key });
      forPhotos.push(`${dir}/${f}`);
      if (d.climate.status === 'ok' && d.climate.months?.length === 12) withClimate.push({ key: d.key, gbif: d.ids?.gbif, months: d.climate.months });
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
    const d = JSON.parse(readFileSync(forPhotos[i], 'utf8')) as Dossierish; // read whole a moment ago, and written by nothing since
    const p = photoFields({ key: d.key, name: d.name, photos: d.photos }, held);
    // In the entry's own order, the credit after the thumbnail, whatever the first phase found: the first phase reads a
    // dossier's stored judgement (round seventy-six) and found a credit where before it found none, and a credit put back
    // at the end moved bytes of the index on a second run that changed nothing.
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (k === 'credit') continue;
      if (k === 'thumb') { o.thumb = p.thumb; if (p.credit) o.credit = p.credit; continue; }
      o[k] = k === 'photos' ? p.photos : v;
    }
    for (const k of Object.keys(e)) delete (e as unknown as Record<string, unknown>)[k];
    Object.assign(e, o);
  });
  if (stamped) console.log(`  ${stamped} dossier${stamped === 1 ? '' : 's'} changed since ${stamped === 1 ? 'its' : 'their'} last stamp (or never stamped): the day each last changed written into the file, for the sitemap`);
  // "Grows like": the six nearest habitat climates per species, by the distance in src/lib/core/near.ts, into the index.
  if (withClimate.length > 1) {
    const t0 = Date.now();
    // In one order whatever the file system lists (round seventy-eight): two species at one distance were ranked in the order
    // the files were read. The order is the one Windows lists files named by GBIF key in, the names before this round, so
    // the owner's corpus keeps every nearest list it had.
    const fileOrder = (x: { key: PageId; gbif?: number }) => `${x.gbif ?? x.key}.json`;
    withClimate.sort((a, b) => (fileOrder(a) < fileOrder(b) ? -1 : fileOrder(a) > fileOrder(b) ? 1 : 0));
    const near = nearestByClimate(withClimate, 6);
    for (const e of out) {
      const n = near.get(e.key);
      if (n?.length) e.near = n;
    }
    console.log(`  nearest habitat climates for ${withClimate.length} species (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  return out;
}

/**
 * `--renew` (round eighty, X): a page built before the day GBIF made the download this build reads is built again, and a
 * page built since is kept as any clean page is, so a build that stops goes on where it stopped. The full build's plan
 * gives it: without it the list's build kept round seventy-eight's 8,945 pages as they were ("kept (clean)": their
 * climate settled, no source refused), with round seventy-two's records, without the institution rule, the other keys
 * or the merges, which only a build of the page reads. Set once the download is read (`renewBefore`).
 */
const renew = args.includes('--renew');
let renewBefore: string | undefined;
const builtBeforeRenewal = (d: { built?: string }) => !!renewBefore && !(String(d.built ?? '') >= renewBefore);

function needsRebuild(key: number): boolean {
  const id = idOfGbif(key);
  const p = id ? `${outDir}/${dossierPath(id)}` : null;
  if (!p || !existsSync(p)) return true;
  try {
    const d = JSON.parse(readFileSync(p, 'utf8')) as { built?: string; climate?: { status: string }; upstream?: Record<string, { status: string }> };
    if (builtBeforeRenewal(d)) return true;
    // 'none' is a settled answer (too few records, no verified range, a cultigen), not a failure: it is redone by
    // --rederive when the rules change, not on every run. 'pending' and 'refused' are unfinished and are retried.
    if (d.climate?.status === 'pending' || d.climate?.status === 'refused') return true;
    // A source this run is skipping anyway cannot be the reason to rebuild.
    return Object.entries(d.upstream ?? {}).some(([k, u]) => !skip.some((x) => k === x || k.startsWith(x + '.')) && (u.status === 'refused' || u.status === 'error'));
  } catch {
    return true;
  }
}

/**
 * Round seventy-nine (`build-kew.ts`): the species to build from Kew's file (plant_name_id → name), the species read from
 * it, and whether a page without a GBIF key is on disk under an id. Such a page is rebuilt when it is not there, or a
 * source it asked refused or failed; its climate is pending for good (GBIF's records are not asked), so that is no reason.
 */
const kewWanted = new Map<string, string>();
const kewSpecies = new Map<string, KewSpecies>();
function readKewPrev(id: PageId): Dossier | null {
  const p = `${outDir}/${dossierPath(id)}`;
  try { return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Dossier) : null; } catch { return null; }
}
const kewOnDisk = (id: PageId) => id.startsWith('k') && (() => { const d = readKewPrev(id); return !!d && d.ids?.gbif == null; })();
function needsKewRebuild(kewId: string): boolean {
  const d = readKewPrev(`k${kewId}` as PageId);
  if (!d) return true;
  if (builtBeforeRenewal(d)) return true;
  // The keys Kew's synonymy gives it (round seventy-nine): a page built without them, or with others, is built again, and
  // so is one whose records under them were not read.
  const want = (kewExtra.get(`k${kewId}`) ?? []).map((x) => x.key).sort((a, b) => a - b).join(',');
  const had = (d.occurrences?.keys ?? []).map((x) => x.key).sort((a, b) => a - b).join(',');
  if (want !== had || (want && (d.climate?.status === 'pending' || d.climate?.status === 'refused'))) return true;
  return Object.entries(d.upstream ?? {}).some(([k, u]) => !skip.some((x) => k === x || k.startsWith(x + '.')) && (u.status === 'refused' || u.status === 'error'));
}

let bulkStats: { wcvp: number; occ: number; media: number; through: number } | null = null;
/** Kew's names answered from Kew's file this run (round seventy-eight), when `--bulk` holds it. */
let kewRowsStats: { answered: number; through: number } | null = null;
/** The batched sources of this run (round seventy-eight), when it asks Wikidata or Wikipedia. */
let batch: ReturnType<typeof batchSources> | null = null;
/** The download carried photographs: GBIF media is then the first wild-photo source, not a fallback. */
let mediaFromFiles = false;
/** Kew's names below species from `--bulk` (round seventy-two, C1), for the build's iNaturalist filter. */
let kewInfra: KewInfra | undefined;
/**
 * The other GBIF keys each page reads records and photographs from (round seventy-three): `scripts/extra-keys.txt`, or the
 * file `--extra-keys` names. Every build reads it, so no rebuild of a page drops them; fixtures read none.
 */
const EXTRA_KEYS = (() => { const i = args.indexOf('--extra-keys'); return i >= 0 ? args[i + 1] : 'scripts/extra-keys.txt'; })();
// With every merge of scripts/merged-pages.txt the list does not give a line (round eighty, A; X's need): the page joined
// reads the leaving page's key whatever the rule makes of it (`mergeKeys`), so the merge can be pruned.
const extraKeys: Map<number, ExtraKey[]> = fixtures ? new Map() : byPage(withMergeKeys(existsSync(EXTRA_KEYS) ? parseExtraKeys(readFileSync(EXTRA_KEYS, 'utf8')) : []).filter((k) => !k.pageId));
/**
 * The GBIF keys Kew's synonymy gives the pages without a GBIF key (round seventy-nine; the owner's decision on K's offer):
 * `scripts/extra-keys-kew.txt` (scripts/kew-extra-keys.ts writes it), or the file `--kew-extra-keys` names. Their records
 * are read into those pages, which keep no GBIF key of their own.
 */
const KEW_EXTRA_KEYS = (() => { const i = args.indexOf('--kew-extra-keys'); return i >= 0 ? args[i + 1] : 'scripts/extra-keys-kew.txt'; })();
// With the lines of scripts/extra-keys.txt that name a page without a GBIF key (round eighty, A: a page merged into one, as
// `mergeKeys` writes them), one line a key, the line of a merge first, so its old address is read.
const kewExtra: Map<string, ExtraKey[]> = fixtures ? new Map() : byPageId(oneLineAKey([...(existsSync(KEW_EXTRA_KEYS) ? parseExtraKeys(readFileSync(KEW_EXTRA_KEYS, 'utf8')) : []), ...withMergeKeys(existsSync(EXTRA_KEYS) ? parseExtraKeys(readFileSync(EXTRA_KEYS, 'utf8')) : []).filter((k) => k.pageId)]));
/**
 * Why each page without a GBIF key that reads no key reads none (round eighty, R): `scripts/extra-keys-kew-none.txt`
 * (scripts/kew-extra-keys.ts writes it), or the file `--kew-no-keys` names. The build and `--fill kew-why` write it into
 * the page, which says it; without the file a page says the general reason.
 */
const KEW_NO_KEYS = (() => { const i = args.indexOf('--kew-no-keys'); return i >= 0 ? args[i + 1] : 'scripts/extra-keys-kew-none.txt'; })();
const kewNoKey = fixtures || !existsSync(KEW_NO_KEYS) ? new Map<string, never>() : parseNoKeys(readFileSync(KEW_NO_KEYS, 'utf8'));
/**
 * The botanic gardens, herbaria and zoos a record at which is left out (round seventy-nine, Q; `clean.ts`):
 * `scripts/institutions.txt`, Wikidata's, or the file `--institutions` names. Every build reads it; without the file each
 * page's record of the occurrence source says its records were not tested.
 */
const INSTITUTIONS = (() => { const i = args.indexOf('--institutions'); return i >= 0 ? args[i + 1] : 'scripts/institutions.txt'; })();
const places: PlaceIndex | undefined = existsSync(INSTITUTIONS) ? new PlaceIndex(parsePlaces(readFileSync(INSTITUTIONS, 'utf8'))) : undefined;
/**
 * The regions' shapes for the range test (round eighty, A; `tdwg-shapes.ts`): scripts/tdwg3-shapes.json, made by
 * scripts/dev/r80a-tdwg-shapes.py from Natural Earth (public domain). Every build reads it; without the file each region is
 * its bounding box, as before, and each page's record says which.
 */
/**
 * The default points (round eighty, A; `default-points.ts`): scripts/default-points.txt, written by --list-default-points
 * from the dossiers on disk. Every build reads it; a record at one is left out, and counted.
 */
const DEFAULT_POINTS = 'scripts/default-points.txt';
const defaults: Set<string> | undefined = !fixtures && existsSync(DEFAULT_POINTS) ? parseDefaultPoints(readFileSync(DEFAULT_POINTS, 'utf8')) : undefined;
/** The page's own Kew entry for a GBIF key, once the list or the disk says it (round eighty, A): `bulkFetcher`'s and `crossIds`' reading. */
let entryOfKey: ((key: number) => string | undefined) | undefined;
const regions: RegionTester | undefined = !fixtures && existsSync(SHAPES_FILE) ? regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile) : undefined;
/** The list's lines and a line for every merge the list does not give one (round eighty, A; `mergeKeys`). */
function withMergeKeys(keys: ExtraKey[]): ExtraKey[] {
  const ms = existsSync('scripts/merged-pages.txt') ? parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')) : [];
  return oneLineAKey([...keys, ...mergeKeys(ms, keys, slugify)]);
}
/** Of a page's lines for one key, one: a merge's (which names the old address) before any other (round eighty, A). */
function oneLineAKey(keys: ExtraKey[]): ExtraKey[] {
  const by = new Map<string, ExtraKey>();
  for (const k of keys) { const id = `${k.pageId ?? k.page}:${k.key}`; const was = by.get(id); if (!was || (!was.merged && k.merged)) by.set(id, was && !k.except && was.except ? { ...k, except: was.except } : k); }
  return [...by.values()];
}
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
      ? { genus: g, slug, status: 'ok' as const, summary: { text: r.data.text, source: 'wikipedia' as const, url: r.data.url, licence: 'CC BY-SA 4.0' as const, title: r.data.title, ...(r.data.cut ? { cut: true as const } : {}) }, at: new Date().toISOString() }
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

/**
 * `--fill openalex` asked OpenAlex once a species for every dossier without literature. Literature is off from round
 * seventy-eight (the owner's decision 2): OpenAlex's searches cost $1 a thousand past a free key's $1 a day, so 54,000
 * species are $54 or 54 days. Nothing asks it now; a later round fills the papers from OpenAlex's free snapshot.
 */
function fillLiterature(): void {
  console.error(`--fill openalex: literature is off (round seventy-eight, the owner's decision 2); the build and the fills ask OpenAlex nothing. Pages say "${LITERATURE_OFF}". A later round fills it from OpenAlex's snapshot.`);
  process.exitCode = 2;
}

/**
 * Photographs from iNaturalist for every dossier that has none of them yet: the taxon lookup (unless Wikidata already gave
 * the id), then the wild and cultivated sets. With iNaturalist's open data (`openWild`; round seventy-nine), the wild set
 * is read from it wherever it holds the taxon, at no request and whatever GBIF's download gave, and:
 *   - `--wild` reads the wild set alone, from the open data alone, for every dossier with an iNaturalist id, in one pass;
 *     it asks iNaturalist nothing (a dossier without an id waits for the next fill, which asks its taxon by name);
 *   - `--cultivated` asks iNaturalist for the cultivated set (and a taxon by name), and reads the wild set only from the
 *     open data;
 *   - neither asks iNaturalist only for what the open data cannot give: a taxon by name, the cultivated set, and the wild
 *     set of a taxon the open data does not hold (one newer than its export).
 *
 * Round eighty (agent I), gentler and smarter, after iNaturalist throttled the owner's first fill:
 *   - every id no build or fill has checked is checked first, thirty a request (`fillInatIds`, `unchecked`), an inactive
 *     one followed to its current taxon by the build's rule, so no set is asked of a taxon iNaturalist has retired;
 *   - the observation searches are asked several taxa a request, ahead of their pages (`inat-batch.ts`: up to 50 taxa a
 *     cultivated search, 6 of like size a most-voted wild search, 200 observations, only the fields read);
 *   - a wild set of the API's builds before the open data (round seventy-eight's, which the open data's pass passed by) is
 *     read again: from the open data where its set is the whole set, else the API's 24 most voted (agent V's rule), so
 *     every wild set is read as `/about/how` says, and names its observers;
 *   - a CC0 photograph whose credit names no one is read again (from the open data at no request, or its set asked);
 *   - with Kew's file (`--bulk`), the sets are read with Kew's filter of descendants, and the page marked, so the step
 *     after (`fillInatDescendants`) passes it by;
 *   - a run of 429s is iNaturalist's throttle: waited out at length (30, 60, then 120 minutes) and the fill goes on; said
 *     as a throttle, never as the day's allowance, which is its own stop.
 */
async function fillPhotos(): Promise<void> {
  const cultivatedOnly = args.includes('--cultivated');
  const wildOnly = args.includes('--wild');
  const open = openWild();
  if (wildOnly && !open) { console.error(`--fill inat --wild reads iNaturalist's open data: run scripts/inat-open-load.ts first, then --bulk <dir> with inat-wild.jsonl in it (or --inat-open <file>)`); process.exitCode = 2; return; }
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  type D = InatKewDossier & { key: PageId; name: { scientific: string; family?: string; synonyms?: string[] }; ids: { gbif?: number; inat?: number }; links: Record<string, string>; photos: Array<{ src: string; captive?: boolean; licence?: string; attribution?: string }>; upstream: Record<string, { status: string; at?: string; detail?: string }> };
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as D;
  // `--wild` asks iNaturalist nothing: anything but the open data's answer is refused, never sent.
  const bf = wildOnly ? null : inatBatched(upstreamApi());
  const f = wildOnly ? heldWild((async () => ({ status: 'refused', detail: 'not asked: --fill inat --wild asks iNaturalist nothing' })) as unknown as ReturnType<typeof makeFetcher>, open, inatOpenHeld) : open ? heldWild(bf!, open, inatOpenHeld, { mostVoted: !cultivatedOnly }) : bf!;
  let done = 0;
  let todoN = 0;
  let left = 0;
  const waits = throttleWaits();
  let files: string[] = [];
  // The pages to fill, by path (each read again when its turn comes), with what each needs asked again.
  let todo: Array<{ path: string; againWild: boolean; againCult: boolean }> = [];
  let n = { mostVoted: 0, apiEra: 0, cc0: 0, noTaxon: 0, unchecked: 0, kew: 0 };
  let votedUnanswered = 0;
  let againUnanswered = 0;
  // Round eighty-one (review B2): a page whose request iNaturalist did not answer is left to be asked again, never
  // written "error" and counted done; a run of them (the network gone) stops the day's run, which then exits unfinished.
  const runStart = new Date().toISOString();
  let unanswered = 0;
  let noAnswerRun = 0;
  let lastNoAnswer = '';
  const NO_ANSWER_RUN = Number(process.env.CULTIFOLIO_NO_ANSWER_RUN) || 5;
  let entries: Array<{ key: number; name: string; family?: string }> = [];
  // The reference's species by name: iNaturalist's taxon filed under another species of it is never taken (round sixty-nine; triage-68 M6).
  let byName = new Map<string, number>();
  const unnamedCc0 = (p: { src: string; licence?: string; attribution?: string }) => p.src === 'inat' && p.licence === 'cc0' && /^no rights reserved$/i.test((p.attribution ?? '').trim());
  // Kew's names below species (round seventy-two, C1), read once for this step and the descendants step after it.
  const kewLoaded = bulkDir && !wildOnly ? await loadKewInfra(bulkDir) : null;
  scan();
  const todoN0 = todo.length;
  function scan(): void {
  files = existsSync(dir) ? readdirSync(dir).filter((x) => DOSSIER_FILE.test(x)) : [];
  todo = [];
  n = { mostVoted: 0, apiEra: 0, cc0: 0, noTaxon: 0, unchecked: 0, kew: 0 };
  entries = [];
  byName = new Map<string, number>();
  // By GBIF key (round seventy-eight): what iNaturalist's and GBIF's answers are judged against.
  for (const file of files) {
    const d = read(`${dir}/${file}`);
    // A page without a GBIF key (round seventy-nine) holds its name as 0, which no GBIF key is, so no page takes its taxon.
    byName.set(d.name.scientific.toLowerCase(), d.ids.gbif ?? 0);
    if (d.ids.gbif != null) entries.push({ key: d.ids.gbif, name: d.name.scientific, family: d.name.family });
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream?.[k]?.status ?? '');
    const wildRow = d.upstream?.['inat.photos.wild'];
    // A "not asked: already from the GBIF download" stands only while those photographs are here (round sixty-seven; triage-66 N4).
    // With the open data, the wild set costs nothing, so a "not asked" for the GBIF download's photographs is asked now (round seventy-nine).
    const wildDone = settled('inat.photos.wild') || (!open && (wildRow?.detail ?? '').startsWith('not asked') && d.photos.some((p) => p.src === 'gbif' && !p.captive));
    // `--cultivated`: the cultivated set alone, the one the open data cannot give (round seventy-eight).
    // A cultivated record of the rule before (research grade and captive, which finds nothing) is asked again (round seventy-eight).
    const cultDone = inat.cultivatedSettled(d.upstream?.['inat.photos.cultivated']);
    // Round eighty (agent V): a wild set the open data gave as its 24 newest, of a taxon it holds more than 24 of, is asked
    // of the API for its 24 most voted, by a fill that asks the API (neither --wild nor --cultivated); once, since the
    // API's answer is recorded as the API's.
    const votedToAsk = !wildOnly && !cultivatedOnly && mostVotedToAsk(open, d.ids.inat, wildRow);
    // `--wild`: a dossier with an iNaturalist id whose wild set the open data holds (one without waits for the next fill).
    // A page without a GBIF key (round seventy-nine, agent K's) only once its id has passed Kew's names (`inat.taxon` ok):
    // an id its Wikidata item gave, not yet checked, waits for the fill that checks it.
    const idChecked = d.ids.gbif != null || d.upstream?.['inat.taxon']?.status === 'ok';
    const held = !!open && !!d.ids.inat && open.holds(d.ids.inat) && open.active(d.ids.inat) !== false;
    // Round eighty (agent I): a wild set the API gave before the open data (round seventy-eight's builds, carried since),
    // of a taxon the open data holds, is read again as the rule now reads it: from the open data where its set is the
    // whole set, else the API's 24 most voted (V's rule); never by `--cultivated`, and by `--wild` only from the file.
    const apiEra = !cultivatedOnly && held && settled('inat.photos.wild') && !(wildRow?.detail ?? '').startsWith(OPEN_WILD_RULE) && !(wildRow?.detail ?? '').includes(MOST_VOTED_RULE) && (!wildOnly || (open!.count(d.ids.inat!) ?? 0) <= WILD_PER_TAXON);
    // A CC0 photograph whose credit names no one (round eighty): its set read again, which names the observer.
    const cc0Wild = !cultivatedOnly && held && settled('inat.photos.wild') && d.photos.some((p) => unnamedCc0(p) && !p.captive) && (!wildOnly || (open!.count(d.ids.inat!) ?? 0) <= WILD_PER_TAXON);
    const cc0Cult = !wildOnly && !!d.ids.inat && cultDone && d.photos.some((p) => unnamedCc0(p) && !!p.captive);
    // A page whose names Kew places a taxon below under another species, not yet read against Kew's file (round eighty):
    // its sets read again with Kew's filter, the wild set from the open data at no request where it is the whole set,
    // the cultivated set (where it holds photographs) in a batch, so the page is marked and the descendants step does not
    // ask its taxon's children, a request a page (about one page in five; their marks did not survive the full build).
    const kr = kewLoaded && held ? kewReading(d, kewLoaded.kew, kewLoaded.day) : null;
    const kewAgain = !!kr && !kr.mark.split('; ').every((m) => (wildRow?.detail ?? '').includes(m)) && (!wildOnly && !cultivatedOnly);
    if (kewAgain) n.kew++;
    const againWild = apiEra || cc0Wild || kewAgain, againCult = cc0Cult || (kewAgain && cultDone && d.photos.some((p) => p.src === 'inat' && !!p.captive));
    const need = wildOnly ? (!wildDone || againWild) && !!d.ids.inat && idChecked && held : cultivatedOnly ? !cultDone || againCult : !wildDone || !cultDone || votedToAsk || againWild || againCult;
    if (need) {
      todo.push({ path: `${dir}/${file}`, againWild, againCult });
      if (votedToAsk) n.mostVoted++;
      if (apiEra) n.apiEra++;
      if (cc0Wild || cc0Cult) n.cc0++;
      if (!d.ids.inat) n.noTaxon++;
    }
    if (d.ids.gbif != null && d.ids.inat && d.upstream?.['inat.taxon']?.status !== 'ok') n.unchecked++;
  }
  todoN = todo.length;
  }
  const again = [n.apiEra ? `${n.apiEra} whose wild set the API gave before the open data, read again` : '', n.cc0 ? `${n.cc0} with a CC0 photograph whose credit names no one, read again` : '', n.noTaxon && !wildOnly ? `${n.noTaxon} without an iNaturalist taxon, asked by name` : '', n.kew ? `${n.kew} read again against Kew's file of ${kewLoaded!.day}, which places a taxon below one of their names under another species` : ''].filter(Boolean);
  console.log(wildOnly
    ? `${files.length} dossiers on disk; ${todo.length} with an iNaturalist taxon whose wild photographs the open data of ${open!.header.day} holds, read from it now${again.length ? ` (${again.join('; ')})` : ''}; iNaturalist is asked nothing…`
    : `${files.length} dossiers on disk; ${todo.length} without iNaturalist's ${cultivatedOnly ? 'cultivated photographs' : 'photographs'}${n.mostVoted ? ` (${n.mostVoted} of them for their 24 most-voted wild observations: the open data of ${open!.header.day} holds more than 24 of their taxon)` : ''}${again.length ? ` (${again.join('; ')})` : ''}; at most ${inatBudget} requests to iNaturalist today, ${budgetStore.read(today())} already made, one every 2 s, the observation searches several taxa a request${open ? `; the wild set from the open data of ${open.header.day} where it holds the taxon${cultivatedOnly ? '' : ' and 24 observations of it or fewer, else the API\'s most voted'}` : ''}…`);
  // Ids no build or fill has checked (round eighty): checked before any set is asked of them, thirty a request, and the
  // pages read again when the check changed one (an id followed, dropped or refused reopens the page's sets).
  if (!wildOnly && n.unchecked) {
    console.log(`  first, the ${n.unchecked} iNaturalist ids no build or fill has checked, checked with iNaturalist (thirty a request), an inactive one followed to its current taxon by the build's rule…`);
    for (;;) {
      const c = await fillInatIds(diskStore(), f, undefined, { unchecked: true });
      console.log(`  ${c.checked} ids checked: ${c.followed} inactive ids followed to their current taxon (or taxa given back), ${c.refused} whose taxon is not this species' (dropped, the name asked), ${c.dropped} inactive with no single current taxon (asked by name)${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : ''}`);
      if (c.followed || c.refused || c.dropped) scan();
      if (!c.failed) break;
      if (isThrottle(c.failed) || /allowance/.test(c.failed)) { if (await waitOut(c.failed)) continue; return stop(c.failed); }
      // Another failure (an error, GBIF not answering): the pages whose id is still unchecked wait for the next fill.
      unfinished();
      console.log(`  the check did not finish (${c.failed}): the pages whose id is not yet checked are left for the next fill.`);
      break;
    }
    if (todo.length !== todoN0) console.log(`  now ${todo.length} to fill.`);
  }
  const reference = referenceOf(entries);
  // The reference's names, so an observation iNaturalist files below this species that Kew holds as another is left out (round seventy-two).
  const heldOnDisk = indexHeld();
  const t0 = Date.now();
  /** The batches asked ahead: the pages of the next window whose sets go to the API (round eighty, `inat-batch.ts`). */
  const WINDOW = 300;
  let aheadTo = 0;
  async function ahead(from: number): Promise<string | undefined> {
    if (!bf || from < aheadTo) return undefined;
    aheadTo = from + WINDOW;
    const cult: number[] = [], wild: number[] = [];
    for (const { path, againWild, againCult } of todo.slice(from, aheadTo)) {
      const d = read(path);
      const id = d.ids.inat;
      if (!id || (d.ids.gbif == null && d.upstream['inat.taxon']?.status !== 'ok')) continue;
      if (!inat.cultivatedSettled(d.upstream['inat.photos.cultivated']) || againCult) cult.push(id);
      if (cultivatedOnly) continue;
      const row = d.upstream['inat.photos.wild'];
      const toApi = open?.holds(id) ? (open.count(id) ?? 0) > WILD_PER_TAXON && (mostVotedToAsk(open, id, row) || againWild) : !['ok', 'none'].includes(row?.status ?? '') && d.photos.filter((p) => p.src === 'gbif' && !p.captive).length < 6;
      if (toApi) wild.push(id);
    }
    for (let i = 0; i < cult.length; i += CULTIVATED_BATCH) { const r = await bf.prefetch('cultivated', cult.slice(i, i + CULTIVATED_BATCH), 12); if (r) return r; }
    for (const g of wildGroups(wild, (t) => open?.count(t))) { const r = await bf.prefetch('wild', g, 24); if (r) return r; }
    return undefined;
  }
  for (let i = 0; i < todo.length; i++) {
    const r0 = await ahead(i);
    if (r0) { if (await waitOut(r0)) { aheadTo = i; i--; continue; } return stop(r0); }
    const { path, againWild, againCult } = todo[i];
    const d = read(path);
    // The page as it was read, so a page left unanswered is not written again unchanged (round eighty-one, the merge: its
    // file's time is what the index's stamp and the sitemap's day read).
    const was = JSON.stringify(d);
    const wasWild = d.upstream['inat.photos.wild'];
    // A page without a GBIF key (round seventy-nine): an id its Wikidata item gave, kept unchecked by a build that skipped
    // iNaturalist, is checked here by its own and Kew's names (`kewInatTaxon`), since `--fill inat-ids` passes it by.
    const unchecked = d.ids.gbif == null && !!d.ids.inat && d.upstream['inat.taxon']?.status !== 'ok';
    // An id the check above could not reach (round eighty): no set is asked of it until it is checked, by the next fill.
    if (!wildOnly && d.ids.gbif != null && d.ids.inat && d.upstream['inat.taxon']?.status !== 'ok') { left++; continue; }
    let id = unchecked ? undefined : d.ids.inat;
    if (!id) {
      // Asked as the build asks it (`taxonFor`; round seventy, second pass, triage-69 B5, B7), with the own names the
      // dossier holds: a taxon GBIF holds as another species of this reference is not taken.
      const own = d.name.scientific.toLowerCase();
      const heldElsewhere = d.ids.gbif != null ? heldElsewhereIn(byName, d.ids.gbif) : (x: string) => { const k = byName.get(x.toLowerCase()); return k != null && (k !== 0 || x.toLowerCase() !== own); };
      const owned = ownNames({ scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], heldElsewhere });
      // A page without a GBIF key (round seventy-nine) by its own names alone (`kewInatTaxon`): nothing is judged at GBIF.
      const t = d.ids.gbif == null ? ((await kewInatTaxon(f, { scientific: d.name.scientific, own: owned, heldElsewhere, id: d.ids.inat })) as Awaited<ReturnType<typeof inat.taxonFor>>) : await inat.taxonFor(f, { scientific: d.name.scientific, key: d.ids.gbif, family: d.name.family, own: owned, sameType: [], heldElsewhere, reference });
      if (t.status === 'refused') { if (await waitOut(t.detail)) { i--; continue; } return stop(t.detail); }
      // What `--fill inat-ids` said of an id it dropped stays before the name search's answer (`inatTaxonRow`; round seventy, S-B7).
      d.upstream['inat.taxon'] = inatTaxonRow(d.upstream['inat.taxon'], t, new Date().toISOString());
      if (t.status === 'error') {
        // Not "no taxon of this name": the lookup broke. Left for the next fill (round eighty-one); an answer the host gave
        // as an error (a status, not a dropped connection) is recorded, so a second run that meets it again goes on.
        const how = notAnswered(t, d.upstream['inat.photos.wild']);
        if (how !== 'no answer') { d.upstream['inat.photos.wild'] = { status: 'error', at: new Date().toISOString(), detail: t.detail }; writeAtomic(path, JSON.stringify(d)); }
        if (how === 'again') done++; else unanswered++;
        if (noAnswerRun >= NO_ANSWER_RUN) return stop(noAnswerWhy());
        continue;
      }
      answeredNow();
      if (t.status === 'ok') id = d.ids.inat = t.data.id;
      else if (d.ids.gbif == null) { delete d.ids.inat; delete d.links.inat; }
    }
    if (!id) {
      d.upstream['inat.photos.wild'] = { status: 'none', at: new Date().toISOString(), detail: 'no iNaturalist taxon of exactly this name' };
      d.upstream['inat.photos.cultivated'] = { status: 'none', at: new Date().toISOString(), detail: `no iNaturalist taxon of exactly this name, so none of its ${inat.CULTIVATED_RULE}` };
      writeAtomic(path, JSON.stringify(d));
      done++;
      continue;
    }
    d.links.inat = `https://www.inaturalist.org/taxa/${id}`;
    // The GBIF download already carries iNaturalist's wild photographs (research-grade, open licences): when six or more
    // are there, the wild set is not asked for again; the cultivated set, which GBIF never has, always is.
    const settled = (k: string) => ['ok', 'none'].includes(d.upstream[k]?.status ?? '');
    const wildFromGbif = d.photos.filter((p) => p.src === 'gbif' && !p.captive).length;
    // The open data's answer costs no request, so it is read whatever GBIF gave; the API's only where it was asked before.
    // Round eighty: the 24 most-voted, where the open data gave its 24 newest of a taxon it holds more than 24 of.
    const voted = !wildOnly && !cultivatedOnly && mostVotedToAsk(open, id, d.upstream['inat.photos.wild']);
    const held = !!open && open.holds(id) && open.active(id) !== false;
    const askWild = wildToAsk({ held, settled: settled('inat.photos.wild') && !againWild, wildOnly, cultivatedOnly, wildFromGbif }) || voted;
    // Kew's filter of descendants (round seventy-two, C1; round eighty: read here, so the step after passes the page by).
    const kr = kewLoaded ? kewReading(d, kewLoaded.kew, kewLoaded.day) : null;
    const owner = { key: d.key, held: heldOnDisk, ...(kr ? { kew: kr.filter } : {}) };
    let wild = askWild ? await inat.photos(f, id, true, 24, owner) : null;
    if (wild?.status === 'refused') { if (await waitOut(wild.detail)) { i--; continue; } return stop(wild.detail); }
    // `--wild` (round eighty): a "none" for an id no build or fill has checked is not written: an inactive id holds no
    // observations, so "none" would be a false absence (Iris germanica's 57097). The fill checks the id first.
    if (wildOnly && wild?.status === 'none' && d.upstream['inat.taxon']?.status !== 'ok') {
      d.upstream['inat.photos.wild'] = { status: 'skipped', at: new Date().toISOString(), detail: `not asked: the open data holds no such observation of taxon ${id}, whose id is not yet checked with iNaturalist (an inactive id holds none); the next --fill inat checks it, then reads the set` };
      writeAtomic(path, JSON.stringify(d));
      done++;
      continue;
    }
    // A most-voted set the API did not answer (an error): the open data's set and its record stay, asked again by the next fill.
    if (voted && wild && wild.status !== 'ok' && wild.status !== 'none') { votedUnanswered++; wild = null; }
    // A set read again (round eighty: an API-era set, a credit naming no one) that did not answer keeps what it had, the same way.
    if (againWild && wild && wild.status !== 'ok' && wild.status !== 'none') { againUnanswered++; wild = null; }
    let cult = !wildOnly && (!inat.cultivatedSettled(d.upstream['inat.photos.cultivated']) || againCult) ? await inat.photos(f, id, false, 12, owner) : null;
    if (cult?.status === 'refused') { if (await waitOut(cult.detail)) { i--; continue; } return stop(cult.detail); }
    if (againCult && inat.cultivatedSettled(d.upstream['inat.photos.cultivated']) && cult && cult.status !== 'ok' && cult.status !== 'none') { againUnanswered++; cult = null; }
    // A set iNaturalist did not answer (round eighty-one, review B2): its row and photographs stay as they were, and the
    // page is left for the next fill; an error the host answered is recorded, and taken as the page's answer only when an
    // earlier run met it too (`notAnswered`), so one page iNaturalist cannot answer never holds the fill for ever.
    let pageLeft = false, wildNoAnswer = false;
    for (const [set, row] of [['wild', 'inat.photos.wild'], ['cult', 'inat.photos.cultivated']] as const) {
      const r = set === 'wild' ? wild : cult;
      if (r?.status !== 'error') { if (r) answeredNow(); continue; }
      const how = notAnswered(r, d.upstream[row]);
      if (how === 'again') continue;
      pageLeft = true;
      if (how === 'no answer') { if (set === 'wild') { wild = null; wildNoAnswer = true; } else cult = null; }
    }
    const fresh = [...(wild?.status === 'ok' ? wild.data : []), ...(cult?.status === 'ok' ? cult.data : [])];
    // iNat photos lead; whatever Commons or GBIF media gave earlier stays behind them. A set not asked for this time keeps what it had.
    d.photos = [...fresh, ...d.photos.filter((p) => p.src !== 'inat' || (wild == null && !p.captive) || (cult == null && p.captive))];
    const stamp = `filled ${new Date().toISOString().slice(0, 10)}`;
    // Read against Kew's file (round eighty): every iNaturalist set the page holds was read with the filter now.
    const kewDone = kr && wild && (cult || !d.photos.some((p) => p.src === 'inat' && p.captive)) ? `; ${kr.mark}` : '';
    // The open data's answer says so, and of which day (`openWildDetail`); the API's says the day it was filled.
    if (wild) d.upstream['inat.photos.wild'] = { status: wild.status, at: new Date().toISOString(), detail: `${'detail' in wild && wild.detail ? `${wild.detail}; ${stamp}` : stamp}${kewDone}` };
    else if (!cultivatedOnly && !wildOnly && !wildNoAnswer && !settled('inat.photos.wild')) d.upstream['inat.photos.wild'] = { status: 'skipped', at: new Date().toISOString(), detail: `not asked: ${wildFromGbif} wild photographs already from the GBIF download` };
    if (cult) d.upstream['inat.photos.cultivated'] = { status: cult.status, at: new Date().toISOString(), detail: cult.status === 'ok' || cult.status === 'none' ? `${inat.CULTIVATED_RULE}; ${stamp}` : `${(cult as { detail?: string }).detail ?? cult.status}; ${stamp}` };
    // A page left unanswered keeps its "not asked" wild row as it was, day included, and is not written when nothing else
    // changed (round eighty-one, the merge, found on the copy made like the PC: a day with no network rewrote such pages
    // with only that row's time changed, so the index was written again for nothing).
    const nowWild = d.upstream['inat.photos.wild'];
    if (pageLeft && wasWild && nowWild?.status === 'skipped' && wasWild.status === 'skipped' && nowWild.detail === wasWild.detail) d.upstream['inat.photos.wild'] = wasWild;
    const text = JSON.stringify(d);
    if (!pageLeft || text !== was) writeAtomic(path, text);
    if (pageLeft) { unanswered++; if (noAnswerRun >= NO_ANSWER_RUN) return stop(noAnswerWhy()); continue; }
    done++;
    if (done % 25 === 0) process.stdout.write(`\r  ${done} of ${todo.length} (${((Date.now() - t0) / done / 1000).toFixed(1)} s each)…   `);
  }
  console.log(`\n  ${done} filled${open ? `; ${inatOpenHeld.held} wild sets read from iNaturalist's open data${inatOpenHeld.mostVoted ? `, ${inatOpenHeld.mostVoted} asked of its API for the 24 most voted (the open data holds more than 24)` : ''}` : ''}${bf ? `; ${bf.stats.batches} batched searches answered ${bf.stats.served} sets, ${bf.stats.own} asked alone` : ''}. ${wildOnly ? `Every dossier with an iNaturalist taxon the open data holds has its wild photographs; now --fill inat --bulk ${bulkDir ?? '<dir>'} for the cultivated set and the rest.` : unanswered || left || votedUnanswered || againUnanswered ? 'Not every dossier has its answer yet (below): the next fill asks those again.' : 'Every dossier has been asked for its photographs.'}`);
  if (votedUnanswered) { unfinished(); console.log(`  most-voted wild sets: ${votedUnanswered} not answered (asked again by the next fill); those pages keep the open data's set until then.`); }
  if (againUnanswered) { unfinished(); console.log(`  sets read again: ${againUnanswered} not answered (asked again by the next fill); those pages keep the set they had until then.`); }
  if (left) { unfinished(); console.log(`  ${left} pages whose iNaturalist id is not yet checked were left for the next fill, which checks it first.`); }
  if (unanswered) { unfinished(); console.log(`  ${unanswered} not answered: iNaturalist did not answer for ${unanswered} page${unanswered === 1 ? '' : 's'} (the last: ${lastNoAnswer}); they are left as they were, to be asked again: run --fill inat again.`); }
  // Round seventy-two (C1): with Kew's file, the pages whose iNaturalist taxon takes in a taxon Kew places under another
  // species. It asks iNaturalist (a taxon's children), so not under --wild; the next fill reads them.
  if (bulkDir && !wildOnly) {
    for (;;) {
      const r = await fillInatDescendants(f, dir, kewLoaded);
      if (r === 'done') break;
      if (!(r.refused && (await waitOut(r.refused)))) { if (r.refused) say(r.refused); writeIndexFromDisk(); return; }
    }
  }
  writeIndexFromDisk();

  /** The day's allowance used, and what it is. */
  function used(): string { return `${budgetStore.read(today())} of the day's ${inatBudget} requests made (UTC ${today()})`; }
  /** A refusal of iNaturalist's, said as what it is: its throttle, the day's allowance, or another refusal. */
  function say(detail?: string): void {
    const left = `${done} filled; ${todo.length - done} still to do`;
    if (/^iNaturalist did not answer \d+ pages in a row/.test(detail ?? '')) console.log(`\n  ${detail}: the connection may be down (a PC that went to sleep, a cable or Wi-Fi dropped). Those pages are left as they were, to be asked again, and no request that reached no server is counted in the day (${used()}). ${left}; run --fill inat again once the connection is back, and it goes on from here.`);
    else if (/allowance/.test(detail ?? '')) console.log(`\n  The day's allowance is spent (${detail}): ${used()}; not a throttle. ${left}; run this again tomorrow (UTC), and it goes on from here.`);
    else if (isThrottle(detail)) console.log(`\n  iNaturalist is throttling this address (${detail}), and still was after waiting ${waits.waited()} minutes: this is iNaturalist's throttle, not the day's allowance (${used()}). ${left}; run this again tomorrow (UTC), and it goes on from here.`);
    else console.log(`\n  iNaturalist refused (${detail ?? ''}); ${used()}. ${left}; run this again tomorrow (UTC), and it goes on from here.`);
  }
  function stop(detail?: string) {
    unfinished();
    // Each dossier is written as it is filled, so the same command tomorrow goes on from here (round seventy-eight).
    say(detail);
    writeIndexFromDisk();
  }
  /**
   * A request of a page iNaturalist did not answer (round eighty-one, review B2): `no answer` for a connection that failed
   * or timed out (nothing is written; it counts towards a run of them), `left` for an error the host answered (written, and
   * the page asked again next time), `again` for such an error the page's row already held from an earlier run (taken as
   * the answer, as before round eighty-one, and counted at the review stop).
   */
  function notAnswered(r: { detail?: string; unreached?: true }, row: { status?: string; at?: string } | undefined): 'no answer' | 'left' | 'again' {
    lastNoAnswer = r.detail ?? 'no detail';
    if (r.unreached || /\bfetch failed\b|\btimeout\b/.test(r.detail ?? '')) { noAnswerRun++; return 'no answer'; }
    return row?.status === 'error' && (row.at ?? '') < runStart ? 'again' : 'left';
  }
  function answeredNow(): void { noAnswerRun = 0; }
  function noAnswerWhy(): string { return `iNaturalist did not answer ${noAnswerRun} pages in a row (${lastNoAnswer})`; }
  /** iNaturalist's throttle waited out (round eighty): true when the fill goes on, after the wait; false for the stop. */
  async function waitOut(detail?: string): Promise<boolean> {
    if (!isThrottle(detail)) return false;
    const m = waits.next();
    if (m == null) return false;
    console.log(`\n  iNaturalist is throttling this address (${detail}): waiting ${m} minutes, then going on. This is its throttle, not the day's allowance (${used()}).`);
    await new Promise((r) => setTimeout(r, m * 60_000));
    return true;
  }
}

/**
 * The fill's waits on iNaturalist's throttle, in minutes (round eighty): 30, 60 and 120, three and a half hours in all,
 * then the stop for the day; `CULTIFOLIO_INAT_WAITS` (minutes, comma-separated) names others, for a test.
 */
function throttleWaits(): { next: () => number | undefined; waited: () => number } {
  const list = (process.env.CULTIFOLIO_INAT_WAITS ?? '30,60,120').split(',').map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  let i = 0, sum = 0;
  return { next: () => { const m = list[i++]; if (m != null) sum += m; return m; }, waited: () => sum };
}

/**
 * `--fill inat --bulk <dir>` (round seventy-two, C1): iNaturalist's `taxon_id` takes in every descendant, and it files
 * under a species taxa Kew accepts apart (Eriosyce crispa's "huascensis" is Kew's E. eriosyzoides). Kew's names file
 * says which pages can be touched (a name below one of the page's names that Kew places under another species); for each
 * such page iNaturalist is asked its taxon's children (one request), and where a child is one of those names, both
 * photograph sets are asked again (two requests) and an observation of such a child is left out. Each page read carries
 * the day of Kew's file on its wild-photographs row, so a rerun passes it by; a refusal stops the fill and a rerun resumes.
 * Round eighty: a page the fill read with Kew's filter carries the mark already, and is passed by.
 */
async function fillInatDescendants(f: ReturnType<typeof makeFetcher>, dir: string, given?: { kew: KewInfra; day: string } | null): Promise<'done' | { refused?: string }> {
  console.log("Reading Kew's names below species, for iNaturalist's descendant taxa…");
  const loaded = given ?? (await loadKewInfra(bulkDir!));
  if (!loaded) { console.log(`  no wcvp_names.csv in ${bulkDir}: not checked`); return 'done'; }
  const c = { pages: 0, asked: 0, before: 0, unanswered: 0 };
  const lines: string[] = [];
  const say = () => console.log(`  ${c.pages} pages hold a name below species that Kew places under another species and an iNaturalist taxon; ${c.asked} asked iNaturalist now${c.before ? `, ${c.before} read before` : ''}${c.unanswered ? `, ${c.unanswered} not answered (asked again by the next fill)` : ''}; ${lines.length} took in such a taxon and were asked again${lines.length ? ' (inat-descendants.txt):\n' + lines.map((l) => `    ${l}`).join('\n') : '.'}`);
  for (const file of readdirSync(dir).filter((x) => DOSSIER_FILE.test(x))) {
    const path = `${dir}/${file}`;
    const d = JSON.parse(readFileSync(path, 'utf8')) as InatKewDossier;
    const r = await inatKewFill(d, f, loaded.kew, loaded.day);
    if (r.done === 'not a candidate') continue;
    c.pages++;
    if (r.done === 'read before') { c.before++; continue; }
    if (r.done === 'unanswered') { c.unanswered++; continue; }
    if (r.done === 'refused') { unfinished(); say(); console.log(`  iNaturalist refused (${r.detail ?? ''}); run again to go on: a page read is passed by.`); return { refused: r.detail }; }
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
  const files = readdirSync(dir).filter((f) => DOSSIER_FILE.test(f));
  type D = { key: PageId; ids?: { gbif?: number }; name: { scientific: string; status?: string }; upstream: Record<string, { detail?: string }> };
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
  // The merges are by GBIF key; each page's file is its id's (round seventy-eight). A page joined without a GBIF key is
  // found by its id (round eighty, A: Ceropegia cereiformis and C. nubica into Echidnopsis cereiformis, k505095).
  const fileOf = new Map(all.flatMap(({ f, d }) => (d.ids?.gbif != null ? [[d.ids.gbif, f] as const] : [])));
  const m = mergedToPrune(all.map(({ d }) => ({ ...(d as D & { occurrences?: { keys?: Array<{ key: number; slug?: string }> } }), key: d.ids?.gbif ?? null, id: String(d.key) })), merges());
  for (const k of m.prune) { const f = fileOf.get(k); if (f && existsSync(`${dir}/${f}`)) unlinkSync(`${dir}/${f}`); }
  if (m.prune.length || m.waiting.length) console.log(`  ${m.prune.length} dossier${m.prune.length === 1 ? '' : 's'} of pages merged into another deleted (${m.prune.join(', ') || 'none'}); each kept page reads its key and answers its old address${m.waiting.length ? `; not yet, the kept page not rebuilt with it (--keys rebuild-extra.txt): ${m.waiting.join('; ')}` : ''}.`);
  writeIndexFromDisk();
}

/**
 * `--list-extra-keys` (round seventy-three): with `--bulk <dir> --backbone <simple.txt.gz>`, every page's other GBIF keys
 * by the rule (`extra-keys.ts`), from Kew's file and GBIF's backbone export, offline, into scripts/extra-keys.txt, and the
 * keys the rule did not take into extra-keys-refused.txt; then, with or without them, the pages whose stored records do
 * not come from the keys the list gives into rebuild-extra.txt, for `--keys`.
 *
 * `--list-extra-keys <species list>` (round eighty, X): the pages the list's build will write, not only those on disk.
 * Each listed species with a GBIF key and no page on disk yet is a page by that key, its Kew entry the list's
 * plant_name_id; and the reference whose pages a key must not be filed under is every page on disk and every GBIF key of
 * the list, as scripts/kew-extra-keys.ts reads it for the species without one (a page merged away is not one). Before, the full
 * build's step read the 8,945 pages on disk alone: the list's 39,000 new pages had no other key (1,032 keys at the list,
 * not one read), and 21 keys it gave the old pages are filed by GBIF under another of the list's species, whose own
 * records already hold theirs, so those records were on two pages.
 */
async function listExtraKeysStep(): Promise<void> {
  const backbone = (() => { const i = args.indexOf('--backbone'); return i >= 0 ? args[i + 1] : undefined; })();
  const listFile = (() => { const a = args[args.indexOf('--list-extra-keys') + 1]; return a && !a.startsWith('--') ? a : undefined; })();
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  type P = Parameters<typeof listExtraKeys>[0]['pages'][number] & { key: number; occurrences?: { keys?: Array<{ key: number }> } };
  // Each dossier cut to what the rule reads: 8,947 whole dossiers held at once are well over a gigabyte.
  // A page by its GBIF key here: the list's pages and keys are GBIF's (round seventy-eight).
  const slim = (d: P & { ids?: { gbif?: number } }): P => ({ key: d.ids?.gbif ?? (d.key as unknown as number), name: { scientific: d.name.scientific, ...(d.name.kew ? { kew: { entry: d.name.kew.entry } } : {}) }, occurrences: { keys: d.occurrences?.keys?.map((k) => ({ key: k.key })) } });
  // A page without a GBIF key (round seventy-nine) is not one of the list's pages: its GBIF records are not asked at all.
  const onDisk: P[] = existsSync(dir) ? readdirSync(dir).filter((f) => DOSSIER_FILE.test(f)).flatMap((f) => { try { const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as P & { ids?: { gbif?: number } }; return d.ids?.gbif == null ? [] : [slim(d)]; } catch { return []; } }) : [];
  // The species list's pages not on disk yet, and the whole list as the reference (round eighty, X).
  const pages: P[] = [...onDisk];
  let reference: Set<number> | undefined;
  if (listFile) {
    const text = existsSync(listFile) ? readFileSync(listFile, 'utf8') : '';
    if (!isSpeciesList(text)) { console.error(`--list-extra-keys ${listFile}: not a species list`); process.exit(2); }
    const listed = parseSpeciesList(text);
    const held = new Set(onDisk.map((p) => p.key));
    for (const e of listed) if (e.gbifKey != null && e.kewId && !held.has(e.gbifKey)) { pages.push({ key: e.gbifKey, name: { scientific: e.name, kew: { entry: e.kewId } } }); held.add(e.gbifKey); }
    // A page merged into another (scripts/merged-pages.txt) is not one: its key is the page it joins.
    const away = new Set(merges().map((m) => m.from));
    reference = new Set([...onDisk.map((p) => p.key), ...listed.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : []))].filter((k) => !away.has(k)));
    console.log(`  ${listFile}: ${listed.length} species; ${pages.length - onDisk.length} pages by their GBIF key not on disk yet, read with the ${onDisk.length} on disk; the reference: ${reference.size} keys`);
  }
  let list: ExtraKey[];
  if (backbone) {
    if (!bulkDir) { console.error('--list-extra-keys --backbone needs --bulk <dir> with wcvp_names.csv'); process.exit(2); }
    const r = await listExtraKeys({ bulk: bulkDir, backbone, pages, merges: merges(), ...(reference ? { reference } : {}) });
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
  // The pages on disk whose records lack their keys; a page not built yet reads its keys when it is built.
  const lines = extraRebuild(onDisk, list, merges());
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
    const rank = (e: { status?: string }) => (e.status === 'accepted' ? 0 : 1);
    // By GBIF key, as before the ids (round seventy-eight), so a homonym's address does not change with its page's id.
    const num = (e: IndexEntry) => e.gbif ?? Number(e.key.slice(1));
    // A page with a GBIF key before one without (round seventy-nine), which is newer, so an address that was keeps its page.
    const keyless = (e: IndexEntry) => (e.gbif == null ? 1 : 0);
    const keeper = [...es].sort((a, b) => rank(a) - rank(b) || keyless(a) - keyless(b) || num(a) - num(b))[0];
    for (const e of es) if (e !== keeper) e.slug = `${slug}-${e.gbif ?? e.key}`;
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
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => DOSSIER_FILE.test(f)) : [];
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
    files: () => (existsSync(dir) ? readdirSync(dir).filter((f) => DOSSIER_FILE.test(f)) : []),
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
async function fillKewNamesStep(keys?: Set<PageId>, index = true): Promise<void> {
  if (!bulkDir) { console.error('--fill kew-names needs --bulk <dir> with wcvp_names.csv'); process.exit(2); }
  const all = diskStore();
  const store: DossierStore = keys ? { ...all, files: () => all.files().filter((f) => keys.has(f.replace(/\.json$/, '') as PageId)) } : all;
  const pages = store.files().flatMap((file) => { try { return [store.read<Dossier>(file)]; } catch { return []; } });
  console.log(`Reading Kew's names for ${pages.length} dossiers from ${bulkDir}/wcvp_names.csv…`);
  const idx = await loadKewNames(bulkDir, pages);
  if (!idx) { console.error(`  no ${bulkDir}/wcvp_names.csv: nothing done`); process.exit(2); }
  const reference = new Set(all.files().flatMap((file) => { try { return [store.read<Dossier>(file).name.scientific.toLowerCase()]; } catch { return []; } }));
  // One Kew entry, one page (round eighty-two, F; review 1's 4): an entry whose page is on disk (`k<entry>.json`) is not
  // given to another page, whichever pages this run reads.
  const ids = new Set(all.files().map((f) => f.replace(/\.json$/, '')));
  const heldBy = (entry: string, page: string) => (ids.has(`k${entry}`) && page !== `k${entry}` ? `k${entry}` : undefined);
  const c = fillKewNames(store, idx, kewFileDay(bulkDir), reference, { heldBy });
  console.log(`  ${c.read} dossiers read, ${c.changed} changed: ${c.cited} cite Kew's author, ${c.elsewhere} list older names Kew accepts as species of their own, ${c.vernacularDropped} common names dropped as scientific names${c.held ? `, ${c.held} not given a Kew entry another page holds` : ''}${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (index) writeIndexFromDisk();
}

/**
 * `--fill kew-why` (round eighty, R): each page without a GBIF key that reads no key says why, for itself
 * (`fillKewWhy`, from `scripts/extra-keys-kew-none.txt`); nothing is asked. Then the index.
 */
function fillKewWhyStep(): void {
  if (!existsSync(KEW_NO_KEYS)) { console.error(`--fill kew-why: no ${KEW_NO_KEYS} (npx tsx scripts/kew-extra-keys.ts writes it)`); process.exit(2); }
  const c = fillKewWhy(diskStore(), kewNoKey, idOfGbif);
  console.log(`  ${c.read} pages without a GBIF key read no key; ${c.changed} changed: ${[...c.kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'} say why for themselves (${KEW_NO_KEYS})${c.general ? `, ${c.general} the general reason (not in the file)` : ''}`);
  writeIndexFromDisk();
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
 * `--fill inat-restore <backup>` (round eighty, agent I; `inat-restore.ts`): the iNaturalist ids the build that skipped
 * iNaturalist dropped, given back from the corpus before it (the plan's backup, `backups/v3-<corpus>`), unchecked, for the
 * next `--fill inat` to check and fill. Offline: nothing is asked. The list in inat-restored.txt.
 */
function fillInatRestoreStep(): void {
  const from = args[args.indexOf('inat-restore') + 1];
  if (!from || from.startsWith('--') || !existsSync(from)) { console.error('usage: --fill inat-restore <the corpus before the build, e.g. backups/v3-<corpus id> (corpus-step.json names it as backupDir)>'); process.exitCode = 2; return; }
  const backup: DossierStore = {
    files: () => readdirSync(from).filter((f) => DOSSIER_FILE.test(f)),
    read: <T,>(file: string) => JSON.parse(readFileSync(`${from}/${file}`, 'utf8')) as T,
    write: () => { throw new Error('the backup is read, never written'); }
  };
  const c = restoreInatIds(diskStore(), backup, from);
  writeFileSync('inat-restored.txt', c.lines.join('\n') + (c.lines.length ? '\n' : ''));
  console.log(`${c.found} pages without an iNaturalist id had one in ${from}: ${c.restored} given back (not yet checked: the next --fill inat checks each with iNaturalist, then asks its photographs), ${c.heldElsewhere} held by another page now, ${c.refused} refused by the fill's rule since → inat-restored.txt. Nothing was asked of anyone; run --fill inat next (the plan's own step does).`);
}

/**
 * `--fill inat-ids` (round sixty-nine; triage-68 M5, R46-13; round seventy, triage-69 B1): every stored iNaturalist id
 * checked, thirty a request, inactive ids followed only by the build's rule and earlier follows read again by it; each
 * change printed; then the index.
 */
async function fillInatIdsStep(): Promise<void> {
  console.log('Checking every stored iNaturalist taxon id with iNaturalist…');
  const c = await fillInatIds(diskStore(), upstream());
  // Round seventy-nine: a page without a GBIF key is passed by here; `--fill inat` asks its taxon by Kew's names.
  if (c.noGbif) console.log(`  ${c.noGbif} pages without a GBIF key passed by: their iNaturalist taxon is asked by their own and Kew's names alone (--fill inat)`);
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
  // Round seventy-nine: a page without a GBIF key found its item by Kew's identifiers, which this proof by GBIF key cannot read.
  if (c.noGbif) console.log(`  ${c.noGbif} pages without a GBIF key passed by: their item is the one carrying Kew's IPNI or POWO identifier`);
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

/**
 * `--fill wikidata-names` (round eighty, the owner's decision): the English common names of every page without a GBIF
 * key from its own Wikidata item (P1843, by the rule of `wikidata-names.ts`), two hundred items a query; `--keyed` also
 * asks for the pages with a GBIF key whose GBIF names give them no English name (off by default: the owner's decision,
 * offered in round eighty). A query that does not answer leaves its pages as they were: run it again. Then the index.
 */
async function fillWikidataNamesStep(): Promise<void> {
  const keyed = args.includes('--keyed');
  console.log(`Reading the English common names of every page without a GBIF key${keyed ? ', and of every page with one whose GBIF names give it no English name,' : ''} from its Wikidata item…`);
  const t0 = Date.now();
  // Through the day's cache, as every fill asks (a second run the same day reads the same answers; --no-cache asks afresh).
  const c = await fillWikidataNames(diskStore(), upstream(), { keyed });
  console.log(`  ${c.read} pages read: ${c.keyless} without a GBIF key${keyed ? `, ${c.keyed} with one and no English name from GBIF` : ''}; ${c.items} Wikidata items asked in ${c.queries} queries (${Math.round((Date.now() - t0) / 1000)} s).`);
  console.log(`  ${c.taken} pages given English names from Wikidata (${c.shown} of them now show one; the others only a generic noun, which is searched and not shown); ${c.none} whose item holds none the rule takes; ${c.noItem} with no item taken, each saying why; ${c.written} dossiers written${c.lines.length ? `:\n${c.lines.map((l) => `    ${l}`).join('\n')}` : '.'}`);
  if (c.unchecked) { unfinished(); console.log(`  ${c.unchecked} pages not checked: Wikidata did not answer (${c.failed}); they are left as they were; run --fill wikidata-names again.`); }
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
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => DOSSIER_FILE.test(f)) : [];
  // The download is read by GBIF key (round seventy-eight: a file is named by its page's id).
  const keys = new Set(diskIds().keys());
  console.log(`${files.length} dossiers on disk; loading photographs from ${bulkDir}/occurrence.zip (or, beside an SQL download, ${bulkDir}/media.zip) for them…`);
  const loaded = await loadOccurrences(bulkDir, 1, keys);
  if (!loaded?.media) {
    console.error(loaded?.format === 'sql' ? `  the SQL download carries no photographs: fetch the images' download into ${bulkDir}/media.zip first (npm run bulk -- gbif-media scripts/species-list.txt --wait)` : '  the archive has no multimedia.txt: request the download again as a DWCA (npm run bulk -- gbif names-big.txt --wait)');
    process.exit(2);
  }
  const doi = loaded.mediaDoi ?? loaded.occ.doi;
  const f = bulkFetcher(fixtureFetcher({}, { status: 'none' }), { media: loaded.media });
  // The parts of a dossier a fill touches, typed by the schema so mergeGbifPhotos() takes and gives real Photo rows.
  type D = Pick<Dossier, 'key' | 'ids' | 'photos' | 'upstream'> & { occurrences?: { keys?: unknown[] } };
  let filled = 0, none = 0, photos = 0, other = 0;
  for (const file of files) {
    const path = `${dir}/${file}`;
    const d = JSON.parse(readFileSync(path, 'utf8')) as D;
    // A page that reads other GBIF keys (round seventy-three) has their photographs in its GBIF set, which the download's
    // set for its own key would replace: it is left, and a build or a re-derivation reads every key.
    if (d.occurrences?.keys?.length) { other++; continue; }
    // A page without a GBIF key (round seventy-nine) has nothing in the download: its record says why.
    if (d.ids.gbif == null) continue;
    const m = await gbif.media(f, d.ids.gbif);
    if (m.status !== 'ok') {
      none++;
      continue; // nothing in the download for this species: what the dossier has stands, whatever source gave it
    }
    const fresh = photosFromMedia(m.data);
    d.photos = mergeGbifPhotos(d.photos, fresh);
    d.upstream['gbif.media'] = { status: 'ok', at: new Date().toISOString(), detail: `from the GBIF download${doi ? ` ${doi}` : ''} (multimedia.txt${loaded.photos === 'media.zip' ? " of the images' download" : ''})` };
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
  const alias = new Map<PageId, string[]>();
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
function writeProducts(index: IndexEntry[], idxDir: string, indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>, aliases: readonly Alias[] = [], synonymsOf?: (key: PageId) => readonly string[] | undefined): Manifest {
  let prev: Manifest | null = null;
  try { prev = JSON.parse(readFileSync(`${idxDir}/manifest.json`, 'utf8')) as Manifest; } catch { /* the first build with a manifest */ }
  if (prev && (typeof prev.files !== 'object' || !Object.values(prev.files).every(isFileHash))) prev = null; // a manifest of round fifty-three's layout names directories, not files
  const dir = `${idxDir}/p`;
  mkdirSync(dir, { recursive: true });
  let written = 0, kept = 0, keyBytes = 0;
  const write = (hash: string, body: string) => {
    const path = `${idxDir}/${productPath(hash).slice(`s/v${DOSSIER_V}/`.length)}`;
    if (existsSync(path)) { kept++; return; }
    writeFileSync(path, body);
    written++;
  };
  // The search's key files are written as they are made (round seventy-seven): at fifty thousand species they are
  // gigabytes, and holding them all before writing would not fit.
  const { manifest, files, storedHashes } = buildProducts(index, indexText, sheetsOf, undefined, aliases, synonymsOf, (hash, body) => { keyBytes += body.length; write(hash, body); });
  for (const [name, body] of files) write(manifest.files[name], body);
  const changed = prev?.id !== manifest.id || prev.buckets !== manifest.buckets || prev.postings !== manifest.postings;
  if (changed) {
    if (prev) writeAtomic(`${idxDir}/manifest.prev.json`, JSON.stringify(prev, null, 1));
    writeAtomic(`${idxDir}/manifest.json`, JSON.stringify(manifest, null, 1));
  }
  // what neither the manifest nor the one before it names, nor the search's directories of either (round seventy-seven)
  let before: string[] = [];
  const onDisk = (h: string) => { try { return readFileSync(`${dir}/${h}.json`, 'utf8'); } catch { return null; } };
  try { before = [...corpusHashes(JSON.parse(readFileSync(`${idxDir}/manifest.prev.json`, 'utf8')) as Manifest, onDisk).hashes]; } catch { /* no corpus before this one */ }
  const keep = new Set([...Object.values(manifest.files), ...storedHashes, ...before].map((h) => `${h}.json`));
  let gone = 0;
  for (const f of readdirSync(dir)) if (/^[0-9a-f]{16,64}\.json$/.test(f) && !keep.has(f)) { unlinkSync(`${dir}/${f}`); gone++; }
  console.log(`  corpus ${manifest.id}: ${index.length} species in ${manifest.buckets} buckets, ${manifest.postings} posting files, ${storedHashes.size} search key files (${(keyBytes / 1048576).toFixed(1)} MB) → ${dir}/ (${written} files written, ${kept} already on disk under their hash, ${gone} of older corpora deleted)${changed ? '; manifest.json names it' : '; unchanged'}`);
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
  // The search's key files are named by the manifest's search directories, not by the manifest (round seventy-seven):
  // read from this folder's corpus, or from the copies of the live ones the prune fetched (live-search/). A directory
  // found in neither stops the list: nothing it names could be kept, so nothing should be deleted.
  const local = `${outDir}/s/v${DOSSIER_V}/p`;
  const read = (h: string) => { for (const d of [local, 'live-search']) { try { return readFileSync(`${d}/${h}.json`, 'utf8'); } catch { /* the next */ } } return null; };
  const liveAll = corpusHashes(live, read);
  if (liveAll.missing.length) {
    console.error(`the live manifest's search directories ${liveAll.missing.slice(0, 3).join(', ')}${liveAll.missing.length > 3 ? ', …' : ''} are neither in ${local} nor in live-search/: nothing is listed, and nothing should be deleted`);
    process.exit(2);
  }
  const named = new Set(liveAll.hashes);
  const also: string[] = [];
  for (const localManifest of [`${outDir}/s/v${DOSSIER_V}/manifest.json`, `${outDir}/s/v${DOSSIER_V}/manifest.prev.json`]) {
    if (!existsSync(localManifest)) continue;
    let m: unknown;
    try { m = JSON.parse(readFileSync(localManifest, 'utf8').replace(/^\uFEFF/, '')); } catch { m = null; }
    if (!isManifest(m)) continue;
    for (const h of corpusHashes(m, read).hashes) named.add(h);
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
  console.log(`\n  ${r.done} fetched${r.truncated ? ` (${r.truncated} recorded truncated)` : ''}, ${r.kept} done before${r.errors ? `, ${r.errors} errored (asked again next run)` : ''}${r.noGbif ? `, ${r.noGbif} without a GBIF key passed by` : ''}.`);
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
  type D = Omit<Dossierish, 'photos' | 'name'> & { photos: Array<Parameters<typeof markShared>[0][number] & Dossierish['photos'][number]>; name: Dossierish['name'] & NonNullable<Parameters<typeof kindNamesOf>[0]['name']> };
  // Round seventy-nine: what the rule reads of each page is held, not the page (48,368 dossiers held whole were most of
  // the build's memory): its names first, then, once every name is known, the identities of the photographs it shows,
  // and the files whose marks change are read a third time to be written. The marks are the same as from pages held whole.
  type Slim = { path: string; key: PageId; ids: { gbif?: number }; name: Pick<D['name'], 'scientific' | 'synonyms' | 'authorship' | 'kew'>; photos: Array<{ src?: string; id: string; url: string }>; marked: boolean };
  const all: Slim[] = [];
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as D;
  // A page that leaves by a merge (scripts/merged-pages.txt; round seventy-three) holds the photographs its kept page reads
  // now: counted, it would hide them on the kept page until the prune (Weingartia fidaiana showed 5 of 20).
  const away = new Set(merges().map((m) => m.from));
  for (const f of readdirSync(dir)) {
    if (!DOSSIER_FILE.test(f)) continue;
    try {
      const d = read(`${dir}/${f}`);
      if (d.ids?.gbif != null && away.has(d.ids.gbif)) continue; // the merges are by GBIF key (round seventy-eight)
      const { scientific, synonyms, authorship, kew } = d.name;
      all.push({ path: `${dir}/${f}`, key: d.key, ids: d.ids?.gbif != null ? { gbif: d.ids.gbif } : {}, name: { scientific, synonyms, authorship, kew }, photos: [], marked: false });
    } catch { /* half-written: rebuilt when its name comes round */ }
  }
  const held = heldNamesOf(all.map((d) => ({ key: d.key, name: d.name.scientific, ...olderNamesOf(d.name.scientific, d.name.synonyms ?? []) })));
  for (const s of all) {
    let d: D;
    try { d = read(s.path); } catch { continue; }
    s.photos = shownPhotos(d.photos ?? [], kindNamesOf(s, held), { shared: false }).map((p) => ({ src: p.src, id: p.id, url: p.url }));
    s.marked = (d.photos ?? []).some((p) => p.shared);
  }
  const marks = sharedPhotos(all);
  const lines: string[] = [];
  let written = 0;
  for (const s of all) {
    // A page with no mark to give and none to take off is left unread: `markShared` would change nothing.
    if (!s.marked && !marks.has(s.key)) continue;
    let d: D;
    try { d = read(s.path); } catch { continue; }
    if (!markShared(d.photos ?? [], marks.get(d.key))) continue;
    writeAtomic(s.path, JSON.stringify(d));
    written++;
  }
  for (const [key, m] of marks) lines.push(`${key}\t${all.find((x) => x.key === key)?.name.scientific ?? ''}\t${m.size} photograph${m.size === 1 ? '' : 's'} also on ${[...new Set([...m.values()].flat())].join(', ')}`);
  if (marks.size) {
    writeFileSync('shared-photos.txt', lines.sort().join('\n') + '\n');
    console.log(`  ${[...marks.values()].reduce((n, m) => n + m.size, 0)} photographs on ${marks.size} pages are held by another species' page too: shown on none (shared-photos.txt)${written ? `; ${written} dossiers marked anew` : ''}`);
  } else if (existsSync('shared-photos.txt')) unlinkSync('shared-photos.txt');
}

/**
 * Round seventy-six (docs/SCALE-STUDY.md section 2.4): what the photograph rules make of each Commons file with every
 * name the reference holds (`heldNamesOf` of the index just written, as the Worker read it before) is stored in the
 * dossier as `judged`, so the Worker reads a page without the whole index. Read with the dossier as the Worker parses
 * it; only the files whose judgement changes are written. Left out of the substance stamp (changed.ts), as derived.
 * Gives each species' dossier synonyms, which the name files read for the older names that are another's accepted name.
 */
function judgeDossiers(dir: string, index: IndexEntry[]): Map<PageId, string[]> {
  const held = heldNamesOf(index);
  const synonyms = new Map<PageId, string[]>();
  let written = 0, judged = 0, unread = 0;
  for (const e of index) {
    const path = `${dir}/${e.key}.json`;
    let raw: Dossierish & { photos: Array<Parameters<typeof judgePhotos>[0][number]> };
    try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch { unread++; continue; }
    synonyms.set(e.key, raw.name?.synonyms ?? []);
    const parsed = vb.safeParse(DossierSchema, raw);
    if (!parsed.success) { unread++; continue; } // the Worker does not serve it either
    const names = kindNamesOf(parsed.output, held)!;
    // The parse keeps the photographs in their order: each stored file is judged as its parsed copy reads.
    const photos = parsed.output.photos as unknown as Parameters<typeof judgePhotos>[0];
    judgePhotos(photos, names);
    let changed = false;
    raw.photos.forEach((p, i) => {
      const j = photos[i]?.judged;
      if (p.src !== 'commons') { if (p.judged) { delete p.judged; changed = true; } return; }
      judged++;
      if (JSON.stringify(p.judged ?? null) !== JSON.stringify(j ?? null)) { if (j) p.judged = j; else delete p.judged; changed = true; }
    });
    if (changed) { writeAtomic(path, JSON.stringify(raw)); written++; }
  }
  console.log(`  photograph judgement: ${judged} Commons files on ${index.length - unread} pages read with the reference's names; ${written} dossier${written === 1 ? '' : 's'} written anew${unread ? `; ${unread} not read (they fail the schema, and no page shows them)` : ''}`);
  return synonyms;
}

/** The dossiers of a directory as the rekey reads and writes them. */
function rekeyStore(dir: string): RekeyStore {
  return {
    files: () => (existsSync(dir) ? readdirSync(dir) : []),
    read: (file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')),
    write: (file, d) => { mkdirSync(dir, { recursive: true }); writeAtomic(`${dir}/${file}`, JSON.stringify(d)); },
    remove: (file) => unlinkSync(`${dir}/${file}`)
  };
}
/** What a rekey did, said, and `ids-gbif.txt` written: every page keyed by GBIF's key and why. False when it could not run. */
function sayRekey(r: RekeyReport): boolean {
  // Said as the scan says a file it cannot read, so the corpus step stops on it the same way (`classify`).
  if (r.unreadable.length) { unreadable = r.unreadable; sayUnreadable(); return false; }
  if (r.twice.length) {
    console.error(`  ${r.twice.length} dossier${r.twice.length === 1 ? '' : 's'} on disk could not be read as a page of ${r.twice.length === 1 ? 'its' : 'their'} own: ${r.twice.join('; ')}. No page's id was changed. Do not upload: of the two files of one GBIF key keep the newer (a stopped run left the other), then run --index again.`);
    process.exitCode = 1;
    return false;
  }
  writeFileSync('ids-gbif.txt', idsGbifLines(r).join('\n') + (r.gbif.length ? '\n' : ''));
  console.log(`  page ids: ${r.kew} by Kew's plant_name_id, ${r.gbif.length} by GBIF's key (ids-gbif.txt says why)${r.refused.length ? `, ${r.refused.length} with no id the rule can give, left as they are: ${r.refused.map((x) => x.name).join(', ')}` : ''}; ${r.renamed} dossier${r.renamed === 1 ? '' : 's'} written under a new id${r.followed ? `, ${r.followed} rewritten for a page they name` : ''}`);
  // One Kew entry, one page (round eighty-two, F; review 1's 4): the entries two pages hold, said and listed (kew-shared.txt),
  // for the review before an upload. Expected before (d)'s repair: Ceropegia cereiformis and C. nubica with k505095 and
  // Echeveria peacockii with k2778991 (merged, gone at --prune-followed), Crocus nudiflorus with C. mazziaricus (repaired).
  const shared = sharedKewLines(r.shared ?? []);
  if (shared.length) writeFileSync(KEW_SHARED, shared.join('\n') + '\n');
  else if (existsSync(KEW_SHARED)) unlinkSync(KEW_SHARED);
  if (shared.length) console.log(`  ${shared.length} Kew entr${shared.length === 1 ? 'y is' : 'ies are'} held by two pages or more → ${KEW_SHARED} (one Kew taxon, one page: a merge or a rebuild with Kew's file decides): ${shared.slice(0, 6).join(' | ')}${shared.length > 6 ? ' | …' : ''}`);
  onDiskIds = null; // read again from the files
  return true;
}
/** The Kew entries two pages hold, as the last index wrote them (round eighty-two): `corpus-step.mjs`'s review counts its lines. */
const KEW_SHARED = 'kew-shared.txt';
/**
 * `--fixtures` (round seventy-nine): the fixture pages read Kew's rows for their species (`kewRows` in fixtures/upstream.ts,
 * by the build's own Kew fill, as a build given Kew's file reads them), then are keyed by the rule, so the fixtures are
 * written under the ids they are committed under (k339841, k2735933, g999) from an empty folder too; before, a page
 * not already on disk kept the GBIF id it was built under. Only the pages this run built of Kew's two species read the rows, and the
 * index entries are read again under their ids. Nothing is written beside the fixtures (no ids-gbif.txt).
 */
function fixtureIds(thisRun: Map<PageId, IndexEntry>): void {
  const idx = new KewNamesIndex();
  for (const r of kewRows()) idx.add(r);
  const all = diskStore();
  // Only the pages of Kew's species: Refusia testii stands for a page whose Kew rows were not read, as it is committed.
  const kewNamed = new Set(kewRows().map((r) => r.name));
  const store: DossierStore = { ...all, files: () => all.files().filter((f) => thisRun.has(f.replace(/\.json$/, '') as PageId) && kewNamed.has(all.read<Dossierish>(f).name.scientific)) };
  fillKewNames(store, idx, KEW_FILE_DAY);
  const dir = `${outDir}/s/v${DOSSIER_V}`;
  const r = rekey({ to: rekeyStore(dir), merges: [], hash: sha1 });
  if (r.unreadable.length || r.twice.length) { console.error(`  the fixtures could not be keyed: ${[...r.unreadable, ...r.twice].join('; ')}`); process.exitCode = 1; return; }
  console.log(`  fixture page ids: ${r.kew} by Kew's plant_name_id, ${r.gbif.length} by GBIF's key; ${r.renamed} dossier${r.renamed === 1 ? '' : 's'} written under a new id`);
  onDiskIds = null;
  const gbifs = [...thisRun.values()].map((e) => e.gbif);
  thisRun.clear();
  for (const g of gbifs) {
    const id = g == null ? undefined : idOfGbif(g);
    if (id) thisRun.set(id, indexEntry(JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'))));
  }
}
/** Every dossier on disk under the id the rule gives (round seventy-eight; src/lib/dossier/rekey.ts). */
function rekeyDisk(): boolean {
  return sayRekey(rekey({ to: rekeyStore(`${outDir}/s/v${DOSSIER_V}`), merges: merges(), hash: sha1 }));
}
/**
 * `--rekey` (round seventy-eight's corpus step): the version 2 corpus (`static/s/v2/<GBIF key>.json`) written as version 3
 * under each page's id (`static/s/v3/<id>.json`), with its genus records, then the index, the products and the manifest
 * of version 3. The version 2 folder is read, never changed. Refused when version 3 already holds dossiers: then
 * `--index` rekeys in place.
 */
function rekeyFromV2(): void {
  const from = `${outDir}/s/v${DOSSIER_V - 1}`, to = `${outDir}/s/v${DOSSIER_V}`;
  if (!existsSync(from) || !readdirSync(from).some((f) => V2_FILE.test(f))) { console.error(`--rekey: no version ${DOSSIER_V - 1} dossiers in ${from}`); process.exit(2); }
  if (existsSync(to) && readdirSync(to).some((f) => DOSSIER_FILE.test(f))) { console.log(`  ${to} already holds dossiers: nothing is copied from ${from}; --index keys them by the rule.`); return writeIndexFromDisk(); }
  console.log(`Writing the version ${DOSSIER_V - 1} corpus in ${from} as version ${DOSSIER_V} in ${to}, each dossier under its page's id…`);
  if (!sayRekey(rekey({ from: rekeyStore(from), to: rekeyStore(to), merges: merges(), hash: sha1 }))) return;
  // The genus records ("About the genus") are the same in both versions.
  let genera = 0;
  if (existsSync(`${from}/g`)) {
    mkdirSync(`${to}/g`, { recursive: true });
    for (const f of readdirSync(`${from}/g`).filter((x) => x.endsWith('.json'))) { writeFileSync(`${to}/g/${f}`, readFileSync(`${from}/g/${f}`)); genera++; }
  }
  console.log(`  ${genera} genus records copied to ${to}/g`);
  writeIndexFromDisk();
}

function writeIndexFromDisk(): void {
  // Round eighty-one (the owner's queued item): an index the same code would write from the same files is not written
  // again (`index-stamp.ts`), as after a fill's run that changed nothing, or the plan's --index after the fill's last run.
  const corpusDir = `${outDir}/s/v${DOSSIER_V}`;
  const same = fixtures ? null : upToDate('.', corpusDir, CODE_ROOT);
  if (same) {
    console.log(`  index: ${same.species} species`);
    console.log(`  the index, its products and the manifest are as written ${same.at.replace('T', ' ').slice(0, 16)} UTC: no dossier and none of the builder's code has changed since, so they are not written again (delete ${INDEX_STAMP} to write them anyway)`);
    return;
  }
  // Each page under the id the rule gives first (round seventy-eight): everything after reads the files by id.
  if (!fixtures && !rekeyDisk()) { console.error('  the index, its products and the manifest are left as they were.'); return; }
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
  // Kew's hybrid sign on the hybrids' names (round eighty-one, H; `$core/hybrids`): in the index and its products, not in the photographs' judgement.
  const shownIndex = signEntries(homonymIndex(index));
  const idxDir = `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  const indexText = JSON.stringify(shownIndex, null, 1);
  writeAtomic(`${idxDir}/index.json`, indexText);
  console.log(`  index: ${index.length} species`);
  // Old addresses of merged pages (round seventy-three): read from the kept pages' records, as `--prune-followed` reads them.
  if (aliases.length) console.log(`  ${aliases.length} old address${aliases.length === 1 ? '' : 'es'} of pages merged into another answered by the kept page: ${aliases.map((a) => a.slug).join(', ')}`);
  // And their names, marked on the kept pages (round eighty-three): the search lists the kept page first for one typed.
  const marked = shownIndex.flatMap((e) => (e.merged ?? []).map((n) => `${n} → ${e.name}`));
  if (marked.length) console.log(`  ${marked.length} name${marked.length === 1 ? '' : 's'} of pages merged into another marked on the kept page, which the search lists first for it: ${marked.join(', ')}`);
  // The photograph judgement with every name of the reference, stored in each dossier (round seventy-six), and each
  // record's older names for the name files: the Worker then reads a page without the index.
  const synonyms = judgeDossiers(idxDir, index);
  writeProducts(shownIndex, idxDir, indexText, (count) => sheetBuckets(index, idxDir, count, aliases).buckets, aliases, (key) => synonyms.get(key));
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
  // The stamp of what this index was written from, last, once every file it writes is written (`index-stamp.ts`).
  if (!fixtures) writeStamp('.', corpusDir, index.length, CODE_ROOT);
}

async function main() {
  // One run at a time in the project folder (round eighty-one, review B6; `scripts/run-lock.mjs`): a step typed by hand
  // while the corpus step or another builder step runs refuses, saying which; the corpus step's own steps are its
  // children, and run under its lock. `--fixtures` writes only fixtures/, and is not locked.
  if (!fixtures) {
    const lock = takeLock('.', `npm run dossier -- ${args.join(' ')}`, { parent: process.ppid }) as { ok: boolean; sentence?: string; took?: { pid?: number; what?: string } | null; release?: () => void };
    if (!lock.ok) { console.error(lock.sentence); process.exitCode = 2; return; }
    if (lock.took) console.log(`  corpus-step.lock was left by a run that has ended (process ${lock.took.pid ?? '?'}, "${lock.took.what ?? ''}"): taken for this run.`);
    if (lock.release) process.on('exit', lock.release);
  }
  mkdirSync(outDir, { recursive: true });
  if (args.includes('--prune-followed')) return pruneFollowed();
  if (args.includes('--prune-uncredited')) return pruneUncredited();
  if (args.includes('--index')) return writeIndexFromDisk();
  if (args.includes('--rekey')) return rekeyFromV2();
  if (args.includes('--keep-list')) return keepList();
  if (fill === 'openalex') return fillLiterature();
  if (fill === 'inat') return fillPhotos();
  if (fill === 'gbif') return fillGbifPhotos();
  if (fill === 'gbif-open') return fillOpenGbifPhotos();
  if (fill === 'commons') return fillCommonsPhotos();
  if (fill === 'gbif-licence') return fillGbifLicencePhotos();
  if (fill === 'inat-ids') return fillInatIdsStep();
  if (fill === 'inat-restore') return fillInatRestoreStep();
  if (fill === 'wikidata') return fillWikidataStep();
  if (fill === 'wikidata-names') return fillWikidataNamesStep();
  if (fill === 'summaries') return fillSummaries();
  if (fill === 'commons-kind') return fillCommonsKindStep();
  if (fill === 'genus') return fillGenera();
  if (fill === 'gbif-basis') return fillGbifBasisStep();
  if (fill === 'range-source') return fillRangeSourceStep();
  if (fill === 'kew-links') return fillKewLinksStep();
  if (fill === 'kew-names') return fillKewNamesStep();
  if (fill === 'kew-why') return fillKewWhyStep();
  if (fill) throw new Error(`--fill ${fill}: openalex, inat, inat-ids, inat-restore, wikidata, wikidata-names, gbif, gbif-open, gbif-licence, gbif-basis, commons, commons-kind, summaries, range-source, kew-links, kew-names, kew-why or genus`);
  if (args.includes('--list-rebuild')) return listRebuild();
  if (args.includes('--list-extra-keys')) return listExtraKeysStep();
  // Round eighty (A): the default points from the dossiers on disk, and the pages that hold one, for --keys.
  if (args.includes('--list-default-points')) {
    const dir = `${outDir}/s/v${DOSSIER_V}`;
    const files = readdirSync(dir).filter((x) => DOSSIER_FILE.test(x));
    const read = function* () { for (const f of files) { try { const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { key: string; name: { scientific: string }; occurrences?: { open?: Array<[number, number, number | null]> } }; yield d; } catch { /* half-written */ } } };
    const found = defaultPoints([...read()].map((d) => ({ open: d.occurrences?.open ?? [] })));
    // A point once listed stays listed: pages rebuilt under the rule no longer hold its records, and would not find it again.
    const before = defaults ?? new Set<string>();
    const kept = [...before].filter((k) => !found.some((p) => p.key === k)).map((key) => ({ key, species: 0, records: 0, undated: 0 }));
    const all = [...found, ...kept];
    writeFileSync(DEFAULT_POINTS, formatDefaultPoints(all, [`Default points (round eighty, A; src/lib/dossier/default-points.ts says the rule): a coordinate where the open in-range records of ${MIN_SPECIES} species or more lie, ${Math.round(MIN_UNDATED * 100)}% of them or more with no year.`, `Written ${new Date().toISOString().slice(0, 10)} by --list-default-points from ${files.length} dossiers; a point listed before and not found again keeps its line, with 0s.`, 'lat,lon, species, records, records with no year']));
    const keys = new Set(all.map((p) => p.key));
    const pages = [...read()].filter((d) => (d.occurrences?.open ?? []).some((r) => keys.has(pointKey(r[0], r[1])))).map((d) => `${d.key} ${d.name.scientific}`);
    if (pages.length) writeFileSync('rebuild-default-points.txt', pages.join('\n') + '\n');
    else if (existsSync('rebuild-default-points.txt')) unlinkSync('rebuild-default-points.txt');
    console.log(`  ${found.length} default points found in ${files.length} dossiers (${kept.length} more kept from ${DEFAULT_POINTS}) → ${DEFAULT_POINTS}; ${pages.length} pages hold a record at one → rebuild-default-points.txt; run --keys rebuild-default-points.txt --offline --grid climate --bulk bulk`);
    return;
  }
  // Round eighty (A): the pages whose open in-range records include one outside every native region's shape, for --keys.
  if (args.includes('--list-range-shapes')) {
    if (!regions) { console.error(`no ${SHAPES_FILE}: nothing to test against`); process.exit(2); }
    const dir = `${outDir}/s/v${DOSSIER_V}`;
    const lines: string[] = [];
    let read = 0, recs = 0;
    for (const f of readdirSync(dir).filter((x) => DOSSIER_FILE.test(x))) {
      let d: Parameters<typeof outsideShapes>[0] & { key: string; name: { scientific: string } };
      try { d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); } catch { continue; }
      read++;
      const n = outsideShapes(d, regions);
      // And a page holding a record at a default point (`--list-default-points`, run first): one re-derivation for both rules.
      const atDefault = defaults ? ((d as { occurrences?: { open?: Array<[number, number]> } }).occurrences?.open ?? []).filter((r) => defaults.has(pointKey(r[0], r[1]))).length : 0;
      if (n || atDefault) { lines.push(`${d.key} ${d.name.scientific}\t${[n ? `${n} open record${n === 1 ? '' : 's'} inside the native regions' boxes and outside their shapes` : '', atDefault ? `${atDefault} at a default point` : ''].filter(Boolean).join('; ')}`); recs += n; }
    }
    if (lines.length) writeFileSync('rebuild-shapes.txt', lines.join('\n') + '\n');
    else if (existsSync('rebuild-shapes.txt')) unlinkSync('rebuild-shapes.txt');
    console.log(`  ${read} dossiers read; ${lines.length} pages with an open record outside every native region's shape (${recs} records) or at a default point${lines.length ? ' → rebuild-shapes.txt; run --keys rebuild-shapes.txt --offline --grid climate --bulk bulk' : ''}`);
    return;
  }
  // Round eighty-three (C): the pages to derive again after the regions' shapes and the default points changed under the
  // repair of October 2026 (`repair-r83.ts`): `--list-r83-repair <the copy as the fill left it> <the shapes file before>`.
  if (args.includes('--list-r83-repair')) {
    const at = args.indexOf('--list-r83-repair');
    const copyDir = args[at + 1], beforeFile = args[at + 2];
    // `none` for the copy: it was deleted, so the shapes' pages are those with a changed region and a record outside the range.
    const noCopy = copyDir === 'none';
    if (!regions || !copyDir || !beforeFile || copyDir.startsWith('--') || (!noCopy && !existsSync(copyDir)) || !existsSync(beforeFile)) { console.error(`  --list-r83-repair <the copy, backups/v3-<id>-filled, or none> <the shapes file before, as git gives it>: ${!regions ? `no ${SHAPES_FILE}` : !copyDir || copyDir.startsWith('--') || (!noCopy && !existsSync(copyDir)) ? `no folder ${copyDir ?? ''}` : `no file ${beforeFile ?? ''}`}; nothing was listed`); process.exit(2); }
    const beforeFileJson = JSON.parse(readFileSync(beforeFile, 'utf8')) as ShapesFile;
    const before = regionTester(beforeFileJson);
    const changed = changedRegions(beforeFileJson, JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
    const dir = `${outDir}/s/v${DOSSIER_V}`;
    const readDir = function* (d: string) { for (const f of readdirSync(d).filter((x) => DOSSIER_FILE.test(x))) { try { yield JSON.parse(readFileSync(`${d}/${f}`, 'utf8')) as RepairPage & { upstream?: Record<string, { detail?: string }> }; } catch { /* half-written */ } } };
    const { lines, regained, defaults } = repairList(readDir(dir), noCopy ? null : readDir(copyDir), before, regions, changed);
    if (lines.length) writeFileSync('rebuild-r83c.txt', lines.join('\n') + '\n');
    else if (existsSync('rebuild-r83c.txt')) unlinkSync('rebuild-r83c.txt');
    console.log(`  ${lines.length} pages to derive again: ${regained} ${noCopy ? `with a record outside the range and a native region among the ${changed.size} whose shape changed` : "with a record inside a native region's shape now and outside them before"}, ${defaults} with records left out at a default point${lines.length ? ' → rebuild-r83c.txt; run --keys rebuild-r83c.txt --offline --grid climate --bulk bulk' : ''}`);
    return;
  }
  // Round eighty (A): the pages to build again for Wikidata (not answered, or refused by a label), for --keys.
  if (args.includes('--list-wikidata-retry')) {
    const lines = wikidataRetryList(diskStore());
    if (lines.length) writeFileSync('rebuild-wd-retry.txt', lines.join('\n') + '\n');
    else if (existsSync('rebuild-wd-retry.txt')) unlinkSync('rebuild-wd-retry.txt');
    console.log(`  ${lines.length} page${lines.length === 1 ? '' : 's'} to build again for Wikidata → rebuild-wd-retry.txt${lines.length ? '; run --keys rebuild-wd-retry.txt --grid climate --bulk bulk --skip inat' : ''}`);
    return;
  }
  // Round eighty-two (F; review 1's 7): the pages with a row not ok and no reason, the build's "none" written before it
  // gave one (`no-reason.ts`), for --keys.
  if (args.includes('--list-no-reason')) {
    const store = diskStore();
    // A page that leaves by a merge (scripts/merged-pages.txt) is not rebuilt: --prune-followed takes it (round eighty-two,
    // M: Bisnaga hamatacantha, whose range row was the review's case, joins Ferocactus hamatacanthus).
    const away = new Set(merges().map((m) => m.from));
    const read = function* () { for (const f of store.files()) { try { const d = store.read<NoReasonPage & { ids?: { gbif?: number } }>(f); if (d.ids?.gbif != null && away.has(d.ids.gbif)) continue; yield d; } catch { /* half-written */ } } };
    const { lines, by } = noReasonLines(read());
    if (lines.length) writeFileSync('rebuild-no-reason.txt', lines.join('\n') + '\n');
    else if (existsSync('rebuild-no-reason.txt')) unlinkSync('rebuild-no-reason.txt');
    console.log(`  ${lines.length} page${lines.length === 1 ? '' : 's'} with a row not ok and no reason${lines.length ? ` (${[...by].map(([k, n]) => `${k} ${n}`).join(', ')}) → rebuild-no-reason.txt; run --keys rebuild-no-reason.txt --grid climate --bulk bulk --skip inat` : ''}`);
    return;
  }
  if (args.includes('--names')) return fillNames();
  let climate: ClimateProvider | undefined;
  if (gridDir) {
    if (!existsSync(`${gridDir}/climate.grid`) || !existsSync(`${gridDir}/climate.json`)) {
      console.error(`--grid ${gridDir}: climate.grid / climate.json not found (run scripts/pack-climate.py first)`);
      process.exit(2);
    }
    climate = makeClimateProvider({ grid: fileGridSource(`${gridDir}/climate.grid`, `${gridDir}/climate.json`), fetcher: makeFetcher(), powerCache: diskPowerCache(`${gridDir}/power-cache`), noExtremes: quick });
  }
  const jobs: Array<{ name: string; key?: number; kew?: string; fetcher: ReturnType<typeof makeFetcher> }> = [];
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
    let file = keysFile ?? args.find((a) => !a.startsWith('--'));
    // Several files of lines at once (round eighty-one, review B8): `--keys a.txt,b.txt` builds the pages of both in one
    // run, so the download is read once, not once a file (an hour each for a Darwin Core Archive). A file of the list
    // that is not there names no page (`--list-wikidata-retry` writes none for 0 pages): said, and the others built.
    let joined: string | null = null;
    if (file && !existsSync(file) && file.includes(',')) {
      const parts = file.split(',').filter(Boolean);
      const there = parts.filter((p) => existsSync(p));
      for (const p of parts.filter((x) => !existsSync(x))) console.log(`  ${p} is not there: it names no page, and the pages of ${there.join(', ') || 'no other file'} are built`);
      if (!there.length) { console.error(keysMissing(parts[0])); process.exit(2); }
      if (there.some((p) => p.endsWith('.json'))) { console.error('--keys a,b reads files of lines, not an index.json'); process.exit(2); }
      joined = there.map((p) => readFileSync(p, 'utf8')).join('\n');
      file = there[0]; // a file that is there; the lines are all of theirs (`joined`)
    }
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
    // The species list (scripts/species-list.txt, written by scripts/select-species.ts; round seventy-eight) is read by its
    // own parser, never as "<key> <name>" lines: its first column is Kew's plant_name_id, which is not a GBIF key. The build
    // is by GBIF key and `--index` names each page by the id rule, so a species is built by the GBIF key the list gives it;
    // where the list gives none (the backbone has no one key for it), by the GBIF key of the page on disk under its id, if
    // there is one; else it is left out and said, never matched by its name (rule 3). A key the owner merged into another
    // page (`scripts/merged-pages.txt`) is built as the page it went into.
    const text = joined ?? (file.endsWith('.json') ? '' : readFileSync(file, 'utf8'));
    const listed = isSpeciesList(text) ? jobsFromList(parseSpeciesList(text)) : null;
    const mergedInto = new Map(merges().map((x) => [x.from, x.into]));
    // A key merged into a page without a GBIF key (round eighty, A) is not built: that page reads it, from Kew's file.
    const intoKew = new Set(merges().filter((x) => x.intoPage).map((x) => x.from));
    const fromList = listed?.flatMap((j) => { const g = j.gbifKey ?? gbifOfLine(j.pageId); return g == null || intoKew.has(g) ? [] : [{ name: j.name, key: mergedInto.get(g) ?? g }]; }) ?? null;
    // Round seventy-nine (the owner's decision 1; `build-kew.ts`): a species the list gives no GBIF key, with no page on disk
    // under its id that has one, is built from Kew's file by its plant_name_id, never by its name (its GBIF records only under
    // the keys Kew's synonymy gives it, round seventy-nine).
    for (const j of listed ?? []) if (j.gbifKey == null && gbifOfLine(j.pageId) == null && j.kewId) kewWanted.set(j.kewId, j.name);
    // Round eighty (X; agent R's finding): a species without a GBIF key that a page on disk holds through its range is that
    // page, not a second one (`heldThroughRange`, the rule the list is written by). Such a page has no Kew entry of its own,
    // so its id is its GBIF key's: only the g… dossiers are read.
    if (listed && kewWanted.size) {
      const dir = `${outDir}/s/v${DOSSIER_V}`;
      const gPages = existsSync(dir) ? readdirSync(dir).filter((f) => /^g[1-9][0-9]*\.json$/.test(f)).flatMap((f) => { try { const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { ids?: { gbif?: number }; name?: { kew?: { entry?: string } }; distribution?: { via?: { entry?: string; kind?: string } } }; return [{ key: d.ids?.gbif ?? null, kewEntry: d.name?.kew?.entry || null, via: d.distribution?.via ?? null }]; } catch { return []; } }) : [];
      const held = heldThroughRange(parseSpeciesList(text), gPages);
      for (const id of held.keys()) kewWanted.delete(id);
      if (held.size) console.log(`  ${held.size} species without a GBIF key not built: a page on disk holds each through its range, ${[...held].map(([id, h]) => `k${id} (${h.entry}) by g${h.key}`).join('; ')}`);
    }
    if (listed && fromList) console.log(`${file}: a species list of ${listed.length} species: ${fromList.length} built by their GBIF key, ${kewWanted.size} with no GBIF key in the list (its lines whose last column is "-") built from Kew's file by their plant_name_id, never matched to GBIF by their name`);
    // An index of version 3 names each page by its id and its GBIF key (round seventy-eight); one of version 2 by its GBIF key.
    const lines = fromList
      ? []
      : file.endsWith('.json')
        ? (JSON.parse(readFileSync(file, 'utf8')) as Array<{ key: number | string; gbif?: number; name: string }>).map((e) => `${e.gbif ?? e.key} ${e.name}`)
        : text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    // A page is named by its GBIF key or (round seventy-eight) by its id, `k<plant_name_id>` or `g<GBIF key>`: the build
    // is by GBIF key, so an id is read as the GBIF key of the page on disk under it, and one no page has is said.
    const unknownIds: string[] = [];
    const parsed = (fromList ?? lines.map((line) => {
      // "k<plant_name_id> -" (round eighty, A): the page has no GBIF key now (the list refused the key it had, as a key
      // GBIF files in another order than Kew's genus: Xanthoceras sorbifolium's 9479204), so it is built again from Kew's
      // file by its id, whatever key its dossier on disk has.
      const nokey = /^(k[1-9]\d*)\s+-\s*(?:\t.*)?$/.exec(line);
      if (nokey) { kewWanted.set(nokey[1].slice(1), readKewPrev(nokey[1] as PageId)?.name.scientific ?? nokey[1]); return null; }
      const m = /^([kg]?\d+)\s+([^\t]+)/.exec(line);
      const g = m ? gbifOfLine(m[1]) : null;
      if (m && g != null) return { name: m[2].trim(), key: g };
      // A key or an id alone (a --keys list): the name is the previous dossier's, for the log and the WCVP genera.
      const k = /^([kg]?\d+)\s*$/.exec(line);
      const gk = k ? gbifOfLine(k[1]) : null;
      if (k && gk != null) return { name: readPrev(gk)?.name.scientific ?? `key ${gk}`, key: gk };
      // A page without a GBIF key on disk (round seventy-nine) is built again from Kew's file by its id.
      const kid = (m ?? k)?.[1];
      if (kid && isPageId(kid) && kewOnDisk(kid)) { kewWanted.set(kid.slice(1), m?.[2]?.trim() ?? readKewPrev(kid)?.name.scientific ?? kid); return null; }
      if ((m && isPageId(m[1])) || (k && isPageId(k[1]))) { unknownIds.push((m ?? k)![1]); return null; }
      return { name: line.split('\t')[0].trim(), key: undefined };
    })).filter((x): x is { name: string; key: number | undefined } => !!x);
    if (unknownIds.length) console.log(`  ${unknownIds.length} page id${unknownIds.length === 1 ? '' : 's'} in ${file} that no dossier on disk has, passed by: ${unknownIds.slice(0, 8).join(', ')}${unknownIds.length > 8 ? ', …' : ''}`);
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
    // Wikidata and Wikipedia asked for a chunk of species a request, ahead of them (round seventy-eight; `batch.ts`): the
    // builder's own per-species requests are answered from the batches, and anything a batch did not cover goes through.
    // Not for a re-derivation, which asks neither; `--no-batch` asks species by species, as before.
    if (!rederive && !args.includes('--no-batch') && !(skip.includes('wikidata') && skip.includes('wikipedia'))) {
      batch = batchSources(f, { wikidata: !skip.includes('wikidata'), wikipedia: !skip.includes('wikipedia') });
      f = batch.fetcher;
    }
    if (offline) {
      // No upstream is asked. The one request the bulk fetcher makes on its own, /species/{key} for a name's authorship,
      // is answered from the previous dossier; NASA POWER is allowed through because the extremes cache is on disk and
      // a cell not yet cached is better fetched than refused. Everything else is not asked, and says so.
      // One more exception: an occurrence search that reaches this fetcher has fallen through the bulk fetcher, which
      // means the download holds nothing for the species. That is the case for every species the download request left
      // to the API path (more records than the cut, listed in bulk/api-path.txt), and a dossier holds only its open
      // records, so there is nothing on disk to re-derive the climate from: the API is asked for those, and only those.
      // Not asked, never "refused": nothing refused the site, and 44 pages said it had (round sixty-seven; triage-66 N4).
      f = offlineFetcher(upstream(), (key) => { const prev = readPrev(key); return prev ? { key: prev.ids.gbif ?? key, scientific: prev.name.scientific, authorship: prev.name.authorship } : null; });
    }
    if (bulkDir) {
      console.log(`Loading bulk files from ${bulkDir}/…`);
      // A species list is built from the download asked for it (round seventy-nine, D): never from an older one, nor
      // beside an images' download asked for fewer species.
      // The keys Kew's synonymy gives the species without a GBIF key are in the download too (round seventy-nine).
      // The day GBIF made the download, where download.json does not hold it yet (round eighty, X): one request a download.
      if (!offline) { const said = await addCreated(bulkDir); if (said) console.log(said); }
      const short = isSpeciesList(text) ? downloadShortOf(bulkDir, [...new Set([...downloadKeysOf(parseSpeciesList(text)).keys, ...[...kewExtra.values()].flat().map((x) => x.key)])]) : null;
      if (short) { console.error(`  ${short}`); process.exit(2); }
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
      // And those Kew's synonymy gives the pages without a GBIF key (round seventy-nine).
      if (wanted) for (const id of kewWanted.keys()) for (const x of kewExtra.get(`k${id}`) ?? []) wanted.add(x.key);
      const [wcvp, loaded] = await Promise.all([loadWcvp(bulkDir, [...names, ...olderGenera], fixtures ? undefined : scanDossiers().map((e) => e.name)), loadOccurrences(bulkDir, 2000, wanted)]);
      if (renew) {
        renewBefore = loaded?.occ.day;
        console.log(renewBefore ? `  --renew: every page built before ${renewBefore}, the day GBIF made the download, is built again; a page built since is kept` : '  --renew: no download read, or none whose day is known, so no page is built again for it');
      }
      // Kew's names from Kew's file in place of GBIF's copy of them (round seventy-eight; `kew-rows.ts`), for the same
      // genera: the IPNI and POWO links, the name cited, and every Kew reading of a proof. `--kew-api` asks GBIF's copy.
      if (!args.includes('--kew-api')) {
        const kr = await loadKewRows(bulkDir, [...names, ...olderGenera].map((n) => n.split(' ')[0]));
        if (kr) { kewRowsStats = { answered: 0, through: 0 }; f = kewRowsFetcher(f, kr, kewRowsStats); console.log(`  Kew's names for the links and proofs: ${kr.size} rows of Kew's file of ${kr.fileDay ?? 'a day not known'}, in place of GBIF's copy`); }
      }
      if (!wcvp) console.log('  no WCVP files: distributions will come from the API');
      if (!loaded && !existsSync(`${bulkDir}/occurrence.zip`) && !existsSync(`${bulkDir}/occurrence.csv`)) console.log('  no occurrence.zip: occurrences will come from the API');
      // An SQL download carries no photographs (round seventy-nine). Without the images' download beside it (bulk/media.zip),
      // GBIF's photographs are not asked species by species, which would give each page GBIF's first images rather than the
      // download's sample: they are marked not asked, and `--fill gbif --bulk bulk` takes them once media.zip is there.
      if (loaded?.format === 'sql' && !loaded.media && !skip.includes('gbif.media')) { skip.push('gbif.media'); console.log(`  the SQL download carries no photographs and ${bulkDir}/media.zip is not there: GBIF's photographs are not asked (npm run bulk -- gbif-media fetches them; then --fill gbif --bulk ${bulkDir})`); }
      const apiPath = readApiPath(bulkDir);
      // The page's own Kew entry for a key (round eighty, A): the list's plant_name_id, else the page on disk under k<id>.
      const listKew = new Map((listed ?? []).flatMap((j) => (j.gbifKey != null && j.kewId ? [[j.gbifKey, j.kewId] as const] : [])));
      const entryOf = (key: number) => listKew.get(key) ?? (() => { const id = idOfGbif(key); return id?.startsWith('k') ? id.slice(1) : undefined; })();
      entryOfKey = entryOf;
      const bf = bulkFetcher(f, { wcvp: wcvp ?? undefined, occ: loaded?.occ, media: loaded?.media ?? undefined, apiPath, covered, entryOf });
      mediaFromFiles = !!loaded?.media;
      // Kew's names below species, so an iNaturalist observation of a taxon Kew places under another species is not taken (round seventy-two, C1).
      // Read for iNaturalist's observations only; a build that skips iNaturalist (the full build's --skip inat) does not hold
      // it (round eighty, X: 0.5 to 0.9 GB of heap at the list's size).
      if (!skip.includes('inat')) kewInfra = (await loadKewInfra(bulkDir))?.kew;
      // The download's photographs are files, not a network extra: a re-derivation reads them and merges them in.
      if (mediaFromFiles) skip.splice(0, skip.length, ...skip.filter((x) => x !== 'gbif.media'));
      bulkStats = bf.stats;
      f = bf;
    }
    for (const p of unique) jobs.push({ name: p.name, key: p.key, fetcher: f });
    // The species without a GBIF key (round seventy-nine): Kew's file is what they are built from, so `--bulk` is needed.
    if (kewWanted.size) {
      const ks = bulkDir ? await loadKewSpecies(bulkDir, kewWanted.keys()) : null;
      if (!ks) console.log(`  ${kewWanted.size} species without a GBIF key not built: they are built from Kew's files, which need --bulk <dir> with wcvp_names.csv and wcvp_distribution.csv`);
      else {
        for (const [id, sp] of ks.species) kewSpecies.set(id, sp);
        if (ks.missing.length) console.log(`  ${ks.missing.length} plant_name_id${ks.missing.length === 1 ? '' : 's'} of the list Kew's file of ${ks.file ?? 'a day not known'} does not hold as an accepted species, not built: ${ks.missing.slice(0, 8).join(', ')}${ks.missing.length > 8 ? ', …' : ''}`);
        for (const [id, name] of kewWanted) if (ks.species.has(id)) jobs.push({ name, kew: id, fetcher: f });
        console.log(`  ${ks.species.size} species without a GBIF key read from Kew's file, to be built from it`);
        // Round seventy-nine (the owner's decision on K's offer): how many of them read GBIF's records under Kew's synonymy.
        const withKeys = [...ks.species.keys()].filter((id) => kewExtra.has(`k${id}`));
        console.log(`  ${withKeys.length} of them read GBIF's records under ${withKeys.reduce((n, id) => n + kewExtra.get(`k${id}`)!.length, 0)} keys Kew's synonymy gives them (${KEW_EXTRA_KEYS}); the other ${ks.species.size - withKeys.length} say GBIF's records not checked`);
      }
    }
  }
  const report: string[] = [];
  const say = (line: string) => {
    report.push(line);
    console.log(`[${report.length}/${jobs.length}] ${line}`);
  };
  console.log(`Building ${jobs.length} species${quick ? ' (quick)' : ''}${offline ? ' (offline: re-deriving range, records, marker and climate from the files and the grid; the name block, photos, summary and literature carried from the previous build; no upstream asked except occurrences for species the download left to the API path)' : rederive ? ' (re-deriving range, records, centre and climate; photos, summary and literature carried from the previous build)' : skip.length ? ` (skipping ${skip.join(', ')})` : ''}…`);
  // Existing dossiers by name, so a clean one is kept rather than rebuilt (unless --force).
  const onDisk = fixtures ? [] : scanDossiers();
  // By GBIF key (round seventy-eight): the build asks, and judges GBIF's and iNaturalist's answers, by GBIF key.
  const existing = new Map<string, number>(onDisk.flatMap((e) => (e.gbif != null ? [[e.name.toLowerCase(), e.gbif] as [string, number]] : [])));
  const reference = referenceOf(onDisk.flatMap((e) => (e.gbif != null ? [{ key: e.gbif, name: e.name, family: e.family }] : [])));
  // The names of the pages without a GBIF key (round seventy-nine), on disk and to be built: held by the reference too, so
  // no other page takes an iNaturalist taxon of their name, nor they one of another's.
  const kewHeld = new Set([...onDisk.filter((e) => e.gbif == null).map((e) => e.name.toLowerCase()), ...[...kewWanted.values()].map((n) => canonicalOfKew(n).toLowerCase())]);
  const heldFor = (j: { key?: number; kew?: string; name: string }) => {
    const self = canonicalOfKew(j.name).toLowerCase();
    const gbifHeld = heldElsewhereIn(existing, j.key ?? existing.get(j.name.toLowerCase()));
    return (n: string) => gbifHeld(n) || (kewHeld.has(n.toLowerCase()) && (!j.kew || n.toLowerCase() !== self));
  };
  // The reference's names, so a slip in a Commons title is read as the Worker reads it (round seventy, a need of C; C1).
  const held = onDisk.length ? heldNamesOf(onDisk) : null;
  // The reference's genera, so a Wikidata name that is a genus alone is refused for a page without a GBIF key (round eighty).
  const kewGenera = generaOf([...onDisk.map((e) => e.name), ...[...kewWanted.values()].map((n) => canonicalOfKew(n))]);
  // The previous build of each species, read once a species, and the index's names: what its build is given (round sixty-nine; triage-68 M5, M6).
  const prevOf = (key?: number) => (key ? readPrev(key) : null);
  if (onDisk.length) console.log(`  ${onDisk.length} dossiers already on disk${force ? ' (rebuilding all)' : ' (clean ones kept)'}`);
  let built = 0, keptN = 0;
  // Round eighty (agent I): the pages this build left without an iNaturalist taxon, for the fill to ask by name; said at the end.
  let inatLeft = 0;
  const thisRun = new Map<PageId, IndexEntry>();
  const drops: string[] = [];
  // What the institution rule left out across this build, and the climate beside the build before (round seventy-nine, Q).
  const instEffect = new InstitutionEffect();
  // A species kept clean is not built, so the batches are not asked for it.
  const kept = (j: (typeof jobs)[number]) => { if (force) return false; if (j.kew) return !needsKewRebuild(j.kew); const k = j.key ?? existing.get(j.name.toLowerCase()); return !!k && !needsRebuild(k); };
  for (const [ji, j] of jobs.entries()) {
    // The next chunk's batches, asked when the chunk is reached (`batch.ts`; round seventy-eight), for the species to be built.
    if (batch && ji % BATCH_CHUNK === 0) await batch.prefetch(jobs.slice(ji, ji + BATCH_CHUNK).filter((x) => !kept(x)).map((x) => ({ key: x.key, name: x.name, ...(x.kew ? { kew: { ipni: kewSpecies.get(x.kew)?.ipni, powo: kewSpecies.get(x.kew)?.powo } } : {}) })));
    const t0 = Date.now();
    if (kept(j)) {
      say(`· ${j.name}: kept (clean)`);
      keptN++;
      continue;
    }
    let r;
    try {
      const prevTaxon = offline && j.key ? readPrev(j.key) : null;
      if (j.kew) {
        // Round seventy-nine: from Kew's file, by its plant_name_id (`build-kew.ts`); GBIF's records are not asked.
        // Round seventy-nine (the owner's decision on K's offer): the records under the keys Kew's synonymy gives it.
        r = await buildKewDossier(kewSpecies.get(j.kew)!, { fetcher: j.fetcher, builtBy: 'node', quick, skip, held, heldElsewhere: heldFor(j), kewInfra, extraKeys: kewExtra.get(`k${j.kew}`), noKey: kewNoKey.has(`k${j.kew}`) ? { line: kewNoKey.get(`k${j.kew}`)!, pageOf: idOfGbif } : undefined, climate, places, regions, defaults, genera: kewGenera });
      } else if (offline && !prevTaxon) {
        say(`✗ ${j.name}: no previous dossier to carry the name from; build it online first`);
        continue;
      } else r = await buildDossier(j.key ?? j.name, {
        fetcher: j.fetcher,
        builtBy: 'node',
        quick,
        climate,
        skip,
        mediaFirst: mediaFromFiles,
        taxon: prevTaxon ? { key: prevTaxon.ids.gbif ?? j.key!, name: prevTaxon.name, accepted: prevTaxon.upstream?.['gbif.accepted'], species: prevTaxon.upstream?.['gbif.species'], builtOn: prevTaxon.built, ...(prevTaxon.upstream?.['wikidata.names'] ? { wdNames: prevTaxon.upstream['wikidata.names'] } : {}) } : undefined,
        // Kept when Wikidata does not answer, with the day they were read (round sixty-eight; round sixty-nine, triage-68 M5).
        ...prevIdsFor(prevOf(j.key)),
        heldElsewhere: heldFor(j),
        // The reference's species, so an iNaturalist taxon GBIF holds as another of them is not taken (round seventy; triage-69 B5).
        reference,
        held,
        kewInfra,
        // The other GBIF keys of this page (round seventy-three); the builder reads only those listed for the key it builds.
        extraKeys: extraKeys.get(j.key ?? existing.get(j.name.toLowerCase()) ?? -1),
        // The page's id (round seventy-eight): the page on disk under the GBIF key the build ends on keeps its id; a new
        // page is `g<key>` until `--index` gives it the id by the rule.
        pageIdOf: idOfGbif,
        // The botanic gardens, herbaria and zoos (round seventy-nine, Q).
        places,
        regions,
        defaults,
        // A page of the list with a Kew id is matched on Wikidata by its identifiers alone (round eighty, A).
        kewEntryOf: entryOfKey
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
    const legacyPath = d.ids.gbif != null ? `${outDir}/s/v${DOSSIER_V - 1}/${d.ids.gbif}.json` : null;
    const prevPath = existsSync(path) ? path : legacyPath && existsSync(legacyPath) ? legacyPath : null;
    let prevFile: typeof d | null = null;
    if (prevPath) {
      const prev = JSON.parse(readFileSync(prevPath, 'utf8')) as typeof d;
      prevFile = prev;
      // copy() returns whether anything was carried; the upstream record says "carried" only then.
      const carry = (src: string, copy: () => boolean) => {
        const now = d.upstream[src]?.status, before = prev.upstream?.[src]?.status;
        // Skipped this build (a --skip source) counts the same as refused: what the last build had is kept.
        if ((now === 'refused' || now === 'error' || now === 'skipped') && (before === 'ok' || before === 'none') && copy()) {
          // A set of iNaturalist's photographs keeps its record whole, the build that kept it said after it (round
          // eighty-one, review B3: it stays settled, with the day it was filled and the mark of Kew's file).
          if (keepsInatSet(src, prev.upstream[src])) { d.upstream[src] = keptInatSetRow(prev.upstream[src], d.upstream[src].detail ?? now, today()); return; }
          // A row already carried keeps the build that asked (round thirty-five, R1-10).
          const origin = prev.upstream[src].detail?.startsWith('carried from build of') ? unchain(prev.upstream[src].detail)!.replace(/;.*$/, '') : carriedOrigin(prev.upstream[src], prev.built);
          d.upstream[src] = { ...prev.upstream[src], detail: `${origin}; this build: ${d.upstream[src].detail ?? now}` };
        }
      };
      // Literature is not carried into a page built now: it says not checked, and why (`LITERATURE_OFF`; round seventy-eight).
      // A carried summary under a title other than the name or an older name is carried only when its record names the
      // proof read for it; one whose proof was not read is not checked, and is not carried (round seventy-one, A5;
      // REVIEW-TRIAGE-70: "the carried one goes with it"). This build's own record of the refusal stands.
      carry('wikipedia', () => {
        const t = prev.summary?.title;
        if (t && !proofByName(t, { name: prev.name.scientific, synonyms: prev.name.synonyms ?? [] }) && !recordedProof(prev.upstream?.wikipedia)) return false;
        d.summary = prev.summary;
        return true;
      });
      // Round eighty (agent I): a build that skips iNaturalist keeps the id the page had, never drops it: 475 pages lost their
      // id to round eighty's build, which left iNaturalist to the fill (`--skip inat`) and took only the id each Wikidata
      // item gave. The previous id stands where this build has none, or the same, or where the previous was checked (its
      // `inat.taxon` row "ok") and the item's is not; its taxon row and both photograph rows (and their photographs, below)
      // are carried with it, so the fill reads the page where it was.
      const inatKept = keptInatId(prev, d, skip.includes('inat') && !rederive);
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
      // The rows the photographs above do not carry (a taxon row, a set answered with none) go with the id kept.
      if (inatKept) carryInatRows(prev, d);
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
        // Wikidata's names go with their record (round eighty-one, review B1): a page without a GBIF key, built offline,
        // asks no item, so its names would be lost under a record that says they were taken.
        carryWdNames(prev, d);
      }
    }
    // The day the page last changed in substance: the previous file's when this build changed nothing it shows, else this
    // build's (round sixty-three; src/lib/dossier/changed.ts), so a refresh that changes nothing does not move the sitemap.
    // What this build lost that the last had: the run fails at its end, so the corpus is read before it is uploaded (round sixty-seven; triage-66 N4).
    if (prevFile) for (const why of dropsBetween(prevFile, d, held)) drops.push(`${d.name.scientific} [${d.key}]: ${why}`);
    instEffect.add(d, prevFile);
    d.changed = stampOnBuild(d, prevFile, sha1);
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeAtomic(path, JSON.stringify(d));
    if (!fixtures && d.ids.gbif != null) diskIds().set(d.ids.gbif, d.key);
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
    if (skip.includes('inat') && !d.ids.inat) inatLeft++;
    if (upload) execSync(`npx wrangler r2 object put cultifolio/${dossierPath(d.key)} --file="${path}" --content-type=application/json`, { stdio: 'inherit' });
  }
  // A build given Kew's files reads Kew's names for what it built, as `--fill kew-names` does (round seventy-two, A); the
  // index then reads those dossiers from disk.
  if (bulkDir && !fixtures && thisRun.size) { await fillKewNamesStep(new Set(thisRun.keys()), false); thisRun.clear(); }
  // Each page under the id the rule gives (round seventy-eight): a new page, or one whose Kew entry this build changed.
  if (!fixtures && built && rekeyDisk()) thisRun.clear();
  if (fixtures && built) fixtureIds(thisRun);
  // The index is every dossier on disk, this run's entries fresh, then sorted.
  const index: IndexEntry[] = fixtures ? [...thisRun.values()] : scanDossiers(true).map((e) => thisRun.get(e.key) ?? e);
  index.sort((a, b) => a.name.localeCompare(b.name));
  uniqueSlugs(index);
  nameEntries(index);
  const idxDir = fixtures ? outDir : `${outDir}/s/v${DOSSIER_V}`;
  mkdirSync(idxDir, { recursive: true });
  writeAtomic(`${idxDir}/index.json`, JSON.stringify(signEntries(homonymIndex(index)), null, 1)); // with Kew's hybrid signs, as --index writes it (round eighty-one, H), and the names by another author apart (round eighty-two)
  writeFileSync(`${idxDir}/report.txt`, report.join('\n'));
  sayUnreadable();
  console.log(`\n${built} built, ${keptN} kept of ${jobs.length}; index now ${index.length} species → ${idxDir}/ (index.json and report.txt alongside; run --index for the sheets, the products and the manifest before the copy up)`);
  if (inatLeft) console.log(`  ${inatLeft} of the pages built have no iNaturalist taxon: this build left iNaturalist to the daily fill (--skip inat), which asks each by name (their rows say so)`);
  if (kewRowsStats) console.log(`Kew's names: ${kewRowsStats.answered} questions answered from Kew's file, ${kewRowsStats.through} of genera not loaded asked of GBIF's copy`);
  if (batch) console.log(`batched: ${batch.stats.sparql} Wikidata queries, ${batch.stats.entities} item reads and ${batch.stats.extracts} Wikipedia reads held ${batch.stats.held} answers, of which the build read ${batch.stats.served}`);
  if (places && instEffect.records) console.log(instEffect.words(places.size, places.radiusM));
  else if (!places && built) console.log(`  Institution rule not applied: ${INSTITUTIONS} not found, so each page built says its records were not tested`);
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
