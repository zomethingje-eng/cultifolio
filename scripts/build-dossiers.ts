/**
 * Offline corpus build. Runs on your PC against the real upstreams, writes one
 * JSON per species to ./corpus/s/v1/<key>.json, and (optionally) uploads to R2.
 *
 *   npx tsx scripts/build-dossiers.ts names.txt                 # one name per line
 *   npx tsx scripts/build-dossiers.ts names.txt --grid climate  # with habitat climate from the packed grid
 *   npx tsx scripts/build-dossiers.ts names.txt --force         # rebuild species that already have a clean dossier (by default they are kept)
 *   npx tsx scripts/build-dossiers.ts names.txt --skip openalex # leave literature out of this run (marked skipped; a later run without --skip fills it)
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
 *   npx tsx scripts/build-dossiers.ts --fixtures                # synthetic dossiers for dev
 *
 * The same buildDossier() runs in the Worker for the tail; this script exists
 * so you see every dossier before anyone else does.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { buildDossier } from '../src/lib/dossier/build';
import { makeFetcher, fixtureFetcher } from '../src/lib/dossier/fetch';
import { dossierPath } from '../src/lib/dossier/schema';
import { welwitschia, copiapoa, refused } from '../fixtures/upstream';
import { makeClimateProvider, type PowerCache } from '../src/lib/climate/provider';
import { fileGridSource } from './file-grid';
import type { PowerSeries } from '../src/lib/climate/power';
import type { ClimateProvider } from '../src/lib/dossier/build';
import { bulkFetcher } from '../src/lib/dossier/bulk';
import { loadWcvp, loadOccurrences, wantedKeys } from './bulk-load';

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const fixtures = args.includes('--fixtures');
const quick = args.includes('--quick');
const force = args.includes('--force');
const skip = (() => { const i = args.indexOf('--skip'); return i >= 0 ? (args[i + 1] ?? '').split(',').filter((x): x is 'openalex' => x === 'openalex') : []; })();
const gridDir = (() => { const i = args.indexOf('--grid'); return i >= 0 ? args[i + 1] : undefined; })();
const bulkDir = (() => { const i = args.indexOf('--bulk'); return i >= 0 ? args[i + 1] : undefined; })();
const outDir = fixtures ? 'fixtures/dossiers' : 'static'; // static/s/v1/<key>.json is served by the app and mirrors the R2 key

/** POWER series cached on disk so the same 0.5° cell is never requested twice across runs. */
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
type Dossierish = { key: number; slug: string; name: { scientific: string; family?: string; vernacular: Array<{ name: string; lang?: string }> }; distribution: { native: Array<{ name: string }> }; photos: Array<{ thumb: string; captive?: boolean }>; occurrences: { nOpenInRange: number }; climate: { status: string } };
function indexEntry(d: Dossierish): IndexEntry {
  const hero = d.photos.find((p) => !p.captive) ?? d.photos[0];
  return { key: d.key, slug: d.slug, name: d.name.scientific, family: d.name.family, common: d.name.vernacular.find((v) => v.lang === 'eng')?.name, origin: d.distribution.native.map((n) => n.name), thumb: hero?.thumb, photos: d.photos.length, open: d.occurrences.nOpenInRange, climate: d.climate.status };
}

/** Every dossier on disk, as index entries. The corpus is the files; the index is derived from them. */
function scanDossiers(): IndexEntry[] {
  const dir = `${outDir}/s/v1`;
  if (!existsSync(dir)) return [];
  const out: IndexEntry[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^\d+\.json$/.test(f)) continue;
    try {
      out.push(indexEntry(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Dossierish));
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
    // 'none' too: the evidence rules can loosen between builds, and the rebuild of a thin species is cheap.
    if (d.climate?.status === 'pending' || d.climate?.status === 'refused' || d.climate?.status === 'none') return true;
    // A source this run is skipping anyway cannot be the reason to rebuild.
    return Object.entries(d.upstream ?? {}).some(([k, u]) => !skip.includes(k as 'openalex') && (u.status === 'refused' || u.status === 'error'));
  } catch {
    return true;
  }
}

let bulkStats: { wcvp: number; occ: number; through: number } | null = null;

async function main() {
  mkdirSync(outDir, { recursive: true });
  let climate: ClimateProvider | undefined;
  if (gridDir) {
    if (!existsSync(`${gridDir}/climate.grid`) || !existsSync(`${gridDir}/climate.json`)) {
      console.error(`--grid ${gridDir}: climate.grid / climate.json not found (run scripts/pack-climate.py first)`);
      process.exit(2);
    }
    climate = makeClimateProvider({ grid: fileGridSource(`${gridDir}/climate.grid`, `${gridDir}/climate.json`), fetcher: makeFetcher(), powerCache: diskPowerCache(`${gridDir}/power-cache`), noExtremes: quick });
  }
  const jobs: Array<{ name: string; fetcher: ReturnType<typeof makeFetcher> }> = [];
  if (fixtures) {
    // A synthetic Atacama-coast climate for the Chilean fixture only, so the plant page's habitat comparison
    // and the cultivation sheet can be exercised offline. Marked as fixture in its source field.
    const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], tmin = [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14];
    const pr = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5], dli = [63, 59, 51, 42, 33, 30, 32, 38, 48, 57, 63, 65];
    climate = {
      at: async (lat, lon) =>
        lat < -20 && lon < -60
          ? { status: 'ok', cell: 'fixture', months: tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: Math.round(((t + tmin[i]) / 2) * 10) / 10, precipMm: pr[i], dli: dli[i], rh: 78 })), extremes: { years: 40, minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, lapseAppliedM: 0 }, src: { normals: 'fixture: synthetic Atacama-coast normals for tests', extremes: 'fixture' } }
          : { status: 'pending', detail: 'fixture: no climate outside the Chilean test box' }
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
    const names = readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    let f = makeFetcher();
    if (bulkDir) {
      console.log(`Loading bulk files from ${bulkDir}/…`);
      const [wcvp, occ] = await Promise.all([loadWcvp(bulkDir, names), loadOccurrences(bulkDir, 2000, wantedKeys(bulkDir, names))]);
      if (!wcvp) console.log('  no WCVP files: distributions will come from the API');
      if (!occ) console.log('  no occurrence.zip: occurrences will come from the API');
      const bf = bulkFetcher(f, { wcvp: wcvp ?? undefined, occ: occ ?? undefined });
      bulkStats = bf.stats;
      f = bf;
    }
    for (const name of names) jobs.push({ name, fetcher: f });
  }
  const report: string[] = [];
  const say = (line: string) => {
    report.push(line);
    console.log(`[${report.length}/${jobs.length}] ${line}`);
  };
  console.log(`Building ${jobs.length} species${quick ? ' (quick)' : ''}${skip.length ? ` (skipping ${skip.join(', ')})` : ''}${process.env.OPENALEX_KEY ? ' with an OpenAlex key' : ''}…`);
  // Existing dossiers by name, so a clean one is kept rather than rebuilt (unless --force).
  const onDisk = fixtures ? [] : scanDossiers();
  const existing = new Map<string, number>(onDisk.map((e) => [e.name.toLowerCase(), e.key]));
  if (onDisk.length) console.log(`  ${onDisk.length} dossiers already on disk${force ? ' (rebuilding all)' : ' (clean ones kept)'}`);
  let built = 0, keptN = 0;
  const thisRun = new Map<number, IndexEntry>();
  for (const j of jobs) {
    const t0 = Date.now();
    if (!force) {
      const k = existing.get(j.name.toLowerCase());
      if (k && !needsRebuild(k)) {
        say(`· ${j.name}: kept (clean)`);
        keptN++;
        continue;
      }
    }
    let r;
    try {
      r = await buildDossier(j.name, { fetcher: j.fetcher, builtBy: 'node', quick, climate, skip });
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
    if (existsSync(path)) {
      const prev = JSON.parse(readFileSync(path, 'utf8')) as typeof d;
      const carry = (src: string, copy: () => void) => {
        const now = d.upstream[src]?.status, before = prev.upstream?.[src]?.status;
        if ((now === 'refused' || now === 'error') && (before === 'ok' || before === 'none')) {
          copy();
          d.upstream[src] = { ...prev.upstream[src], detail: `carried from build of ${prev.built?.slice(0, 10) ?? '?'}; this build: ${d.upstream[src].detail ?? now}` };
        }
      };
      carry('openalex', () => (d.literature = prev.literature));
      carry('wikipedia', () => (d.summary = prev.summary));
      for (const src of ['inat.photos.wild', 'inat.photos.cultivated', 'commons']) carry(src, () => { if (prev.photos.length > d.photos.length) d.photos = prev.photos; });
    }
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, JSON.stringify(d));
    const refusedSrcs = Object.entries(d.upstream)
      .filter(([, u]) => u.status === 'refused' || u.status === 'error')
      .map(([k, u]) => `${k}:${u.status}${u.detail ? ' (' + u.detail + ')' : ''}`);
    say(`✓ ${d.name.scientific} [${d.key}] ${d.photos.length} photos, ${d.occurrences.nOpenInRange} open/${d.occurrences.nRestrictedInRange} restricted in range, climate ${d.climate.status}${refusedSrcs.length ? ' — refused: ' + refusedSrcs.join(', ') : ''} (${Date.now() - t0} ms)`);
    thisRun.set(d.key, indexEntry(d as unknown as Dossierish));
    built++;
    if (upload) execSync(`npx wrangler r2 object put cultifolio/${dossierPath(d.key)} --file="${path}" --content-type=application/json`, { stdio: 'inherit' });
  }
  // The index is every dossier on disk, this run's entries fresh, then sorted.
  const index: IndexEntry[] = fixtures ? [...thisRun.values()] : scanDossiers().map((e) => thisRun.get(e.key) ?? e);
  index.sort((a, b) => a.name.localeCompare(b.name));
  const idxDir = fixtures ? outDir : `${outDir}/s/v1`;
  mkdirSync(idxDir, { recursive: true });
  writeFileSync(`${idxDir}/index.json`, JSON.stringify(index, null, 1));
  writeFileSync(`${idxDir}/report.txt`, report.join('\n'));
  console.log(`\n${built} built, ${keptN} kept of ${jobs.length}; index now ${index.length} species → ${idxDir}/ (index.json and report.txt alongside)`);
  if (bulkStats) console.log(`bulk: ${bulkStats.wcvp} distributions and ${bulkStats.occ} occurrence sets from the files, ${bulkStats.through} requests to the APIs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
