// Round 108 (docs/PLAN-108.md, step 3; the first hand-off's round 5): the proof, before any builder change, that a
// habitat climate read from records placed only to within 30 km says what the well-placed records say. Read-only: it reads
// the index and dossiers (static/s/v3/), the bulk download (bulk/occurrence.zip, streamed, never extracted), the climate
// grid (climate/climate.grid, climate.json) and the NASA POWER cache (climate/power-cache, read only: nothing is fetched),
// and writes only under bulk/r108/.
//
// The species: pages with a habitat climate today whose typical spot lies in one of the two regions the plan names, of the
// groups it names, with 30 or more in-range records placed to within 1 km:
//   - southern Africa (17° to 35° S, 11° to 33° E): Aizoaceae, Crassulaceae, Euphorbia, Aloe;
//   - South-East Asia (Borneo, Sumatra, the Malay peninsula): every family (the orchids and pitcher plants alone were 15).
// Each species' climate is read twice:
//   - exact: its records placed to within 1 km, read by the builder's own readRecords and the provider's own envelope
//     (today's rule; the cold floor from the POWER cache at the typical cell, lapse-corrected as the build does);
//   - blurred: each of the same records moved as iNaturalist obscures a place (to a uniformly random point in its 0.2° cell,
//     the stated uncertainty that cell's half-diagonal), read by readRecords with the 30 km bound, then by the coarse rule:
//     each record's area (every grid cell whose centre lies within its uncertainty) averaged over its land cells, the
//     median of each month across the areas, the annual rain per area then its median, the typical area the one whose
//     coldest month is nearest the median, its cold floor the POWER cache's at the area's centre, lapse-corrected to the
//     area's mean elevation.
// The figures compared: the cold floor (NASA POWER, one night in a hundred colder), the coldest month's mean nightly low
// and the warmest month's mean high (CHELSA, median months), the rain a year (median), the year's mean daily light (DLI).
// The bar, set in PLAN-108 before any result was read: the cold floor and the warmest month's mean high within 1.0 °C in the
// median and 2.5 °C for 90% of species; the rain within 15% in the median and 30% for 90%; the DLI within 10% in the median.
//
//   node --max-old-space-size=11000 --import tsx scripts/dev/r108-blur-proof.ts [--rows N] [--seed S]
// writes bulk/r108/blur-proof.tsv (a line a species), bulk/r108/blur-proof.log (what it read and wrote, and the verdict).
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { occHeader, parseOccRow } from '../../src/lib/dossier/bulk';
import { readRecords, rangeTest } from '../../src/lib/dossier/build';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { parsePlaces, PlaceIndex } from '../../src/lib/dossier/clean';
import { parseDefaultPoints } from '../../src/lib/dossier/default-points';
import { makeClimateProvider } from '../../src/lib/climate/provider';
import { decodeCell, cellOf, cellCentre } from '../../src/lib/climate/grid';
import { extremesFor, powerCell, type PowerSeries } from '../../src/lib/climate/power';
import { quantile } from '../../src/lib/core/extremes';
import { fileGridSource } from '../file-grid';

const ZIP = 'bulk/occurrence.zip', OUT = 'bulk/r108', GRID = 'climate', CAP = 5_000, MIN_EXACT = 30, PRECISE_M = 1_000, COARSE_M = 30_000, OBSCURE = 0.2;
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
/** --no-floor: the amended tier (PLAN-108, the proof's first run): the cold floor is reported but not judged, since the
 * coarse tier carries none; the run's verdict is the CHELSA figures' alone. Used with a fresh seed, so the figures that
 * passed the first run are tested again on a blur they were not chosen on. */
const NO_FLOOR = process.argv.includes('--no-floor');
const STOP = arg('--rows') ? Number(arg('--rows')) : Infinity;
let seed = Number(arg('--seed') ?? 108);
/** A seeded random (mulberry32): the blur is the same on every run with the same seed. */
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
mkdirSync(OUT, { recursive: true });
const RUN = NO_FLOOR ? `blur-proof-seed${seed}` : 'blur-proof';
const LOG = `${OUT}/${RUN}.log`;
writeFileSync(LOG, '');
const log = (s: string) => { console.log(s); appendFileSync(LOG, s + '\n'); };
log(`r108 blur proof${NO_FLOOR ? ' (the amended tier: no cold floor)' : ''}, started ${new Date().toISOString()}, seed ${seed}`);

const REGIONS = [
  { id: 'southern-africa', s: -35, n: -17, w: 11, e: 33, fit: (fam: string, genus: string) => fam === 'Aizoaceae' || fam === 'Crassulaceae' || genus === 'Euphorbia' || genus === 'Aloe' },
  // Every family: the orchids and pitcher plants alone gave 15 candidates, too few to judge (a trial of 3 million rows,
  // which read no figure of the round). The question is the blur in steep wet tropical ground, which every family there asks.
  { id: 'south-east-asia', s: -6.5, n: 7.5, w: 95, e: 119.5, fit: () => true }
] as const;
type Region = (typeof REGIONS)[number]['id'];
type Page = { key: string; slug: string; name: string; region: Region; keys: number[]; boxes: unknown[]; verified: boolean; native: Array<{ code?: string; box?: unknown }> };

const index = JSON.parse(readFileSync('static/s/v3/index.json', 'utf8')) as Array<{ key: string; slug: string; name: string; family?: string; climate?: string }>;
const pages: Page[] = [];
for (const e of index) {
  if (e.climate !== 'ok') continue;
  const genus = e.name.split(' ')[0];
  const cand = REGIONS.filter((r) => r.fit(e.family ?? '', genus));
  if (!cand.length) continue;
  const f = `static/s/v3/${e.key}.json`;
  if (!existsSync(f)) continue;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const at = d.climate?.at as { lat: number; lon: number } | undefined;
  if (!at || (d.climate?.records ?? 0) < MIN_EXACT || d.climate?.hemispheres) continue;
  const r = cand.find((x) => at.lat >= x.s && at.lat <= x.n && at.lon >= x.w && at.lon <= x.e);
  if (!r) continue;
  const keys = [...new Set([d.ids?.gbif, ...(d.occurrences?.keys ?? []).map((k: { key: number }) => k.key)].filter((k): k is number => typeof k === 'number'))];
  if (!keys.length) continue;
  pages.push({ key: e.key, slug: e.slug, name: e.name, region: r.id, keys, boxes: d.distribution?.boxes ?? [], verified: d.distribution?.verified !== false, native: d.distribution?.native ?? [] });
}
log(`read static/s/v3/index.json (${index.length} pages) and the candidates' dossiers: ${pages.length} pages with a habitat climate of 30 records or more, one calendar, their typical spot in a region of the plan: ${REGIONS.map((r) => `${r.id} ${pages.filter((p) => p.region === r.id).length}`).join(', ')}`);

const pagesOfKey = new Map<number, Page[]>();
for (const p of pages) for (const k of p.keys) (pagesOfKey.get(k) ?? pagesOfKey.set(k, []).get(k)!).push(p);
const regions = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
const places = existsSync('scripts/institutions.txt') ? new PlaceIndex(parsePlaces(readFileSync('scripts/institutions.txt', 'utf8'))) : undefined;
const defaults = existsSync('scripts/default-points.txt') ? parseDefaultPoints(readFileSync('scripts/default-points.txt', 'utf8')) : undefined;
log(`read ${SHAPES_FILE}, scripts/institutions.txt (${places ? 'read' : 'absent'}), scripts/default-points.txt (${defaults ? defaults.size + ' points' : 'absent'})`);

type Row = NonNullable<ReturnType<typeof parseOccRow>>;
const rowsOf = new Map<Page, Row[]>();
const child = spawn(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'unzip', process.platform === 'win32' ? ['-xOf', ZIP, 'occurrence.txt'] : ['-p', ZIP, 'occurrence.txt'], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.setEncoding('utf8');
let h: string[] = [], iS = -1, iT = -1, iA = -1, rows = 0, kept = 0;
const t0 = Date.now();
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!h.length) { h = occHeader(line); iS = h.indexOf('speciesKey'); iT = h.indexOf('taxonKey'); iA = h.indexOf('acceptedTaxonKey'); continue; }
  if (!line) continue;
  if (rows >= STOP) { child.kill(); break; }
  if (++rows % 10_000_000 === 0) log(`  ${(rows / 1e6).toFixed(0)} million rows read, ${kept.toLocaleString('en-GB')} kept, ${Math.round((Date.now() - t0) / 60000)} min`);
  const c = line.split('\t');
  const hit = new Set<Page>();
  for (const i of [iS, iT, iA]) { const k = Number(c[i]); const ps = k ? pagesOfKey.get(k) : undefined; if (ps) for (const p of ps) hit.add(p); }
  if (!hit.size) continue;
  const parsed = parseOccRow(h, line);
  // Only records stating an uncertainty of 1 km or less: the exact side is records whose place is known.
  if (!parsed || parsed.coordinateUncertaintyInMeters == null || parsed.coordinateUncertaintyInMeters > PRECISE_M) continue;
  const r = JSON.parse(JSON.stringify(parsed)) as Row; // a flat copy (r107: a slice keeps its whole line alive)
  for (const p of hit) { const l = rowsOf.get(p) ?? rowsOf.set(p, []).get(p)!; if (l.length < CAP) { l.push(r); kept++; } }
}
log(`read ${ZIP} (occurrence.txt): ${rows.toLocaleString('en-GB')} rows in ${Math.round((Date.now() - t0) / 60000)} min; ${kept.toLocaleString('en-GB')} records placed to within 1 km kept for ${rowsOf.size} pages (at most ${CAP} a page)`);

// The provider as the build makes it, offline: a POWER series not in the cache is not fetched.
const grid = fileGridSource(`${GRID}/climate.grid`, `${GRID}/climate.json`);
const powerDir = `${GRID}/power-cache`;
const powerOf = (id: string): PowerSeries | null => { const f = `${powerDir}/${id}.json`; return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as PowerSeries) : null; };
const provider = makeClimateProvider({ grid, fetcher: (async () => ({ status: 'refused', detail: 'the proof fetches nothing' })) as never, powerCache: { get: async (id) => powerOf(id), set: async () => {} } });
const header = await grid.header();
log(`read ${GRID}/climate.json (cells ${header.cell}°) and ${GRID}/climate.grid; the POWER cache ${powerDir}, read only`);

type Months = Array<{ tmin: number; tmax: number; precipMm: number; dli?: number }>;
type Fig = { floor: number | null; cold: number; warm: number; rain: number; dli: number | null };
const figOf = (m: Months, rain: number, floor: number | null): Fig => ({ floor, cold: Math.min(...m.map((x) => x.tmin)), warm: Math.max(...m.map((x) => x.tmax)), rain, dli: m.every((x) => typeof x.dli === 'number') ? m.reduce((a, x) => a + x.dli!, 0) / 12 : null });

/** One grid cell's months by the provider's own land test (the elevation layer), or null. */
const cellMonths = new Map<string, { months: Months; elev: number } | null>();
async function landCell(lat: number, lon: number) {
  const c = cellOf(header, lat, lon);
  if (cellMonths.has(c.id)) return cellMonths.get(c.id)!;
  const got = await grid.cell(lat, lon);
  let out: { months: Months; elev: number } | null = null;
  if (got) {
    const v = decodeCell(header, got.buf);
    if (v.elevationM != null && v.months.every((m) => typeof m.tasmin === 'number' && typeof m.tasmax === 'number' && typeof m.pr === 'number'))
      out = { months: v.months.map((m) => ({ tmin: m.tasmin!, tmax: m.tasmax!, precipMm: m.pr!, dli: m.rsds != null ? m.rsds * 2.07 : undefined })), elev: v.elevationM };
  }
  cellMonths.set(c.id, out);
  return out;
}
/** A coarse record's area: the mean months of the land cells whose centres lie within its radius. */
async function areaOf(lat: number, lon: number, radiusM: number) {
  const dLat = radiusM / 111_320, dLon = radiusM / (111_320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const got: Array<{ months: Months; elev: number }> = [];
  for (let la = lat - dLat; la <= lat + dLat + 1e-9; la += header.cell) for (let lo = lon - dLon; lo <= lon + dLon + 1e-9; lo += header.cell) {
    const c = cellOf(header, la, lo), m = cellCentre(header, c.row, c.col);
    const dy = (m.lat - lat) * 111_320, dx = (m.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
    if (Math.hypot(dx, dy) > radiusM) continue;
    const x = await landCell(m.lat, m.lon);
    if (x) got.push(x);
  }
  if (!got.length) return null;
  const months = Array.from({ length: 12 }, (_, i) => {
    const dl = got.map((g) => g.months[i].dli);
    return { tmin: got.reduce((a, g) => a + g.months[i].tmin, 0) / got.length, tmax: got.reduce((a, g) => a + g.months[i].tmax, 0) / got.length, precipMm: got.reduce((a, g) => a + g.months[i].precipMm, 0) / got.length, dli: dl.every((d) => typeof d === 'number') ? dl.reduce((a, d) => a + d!, 0) / got.length : undefined };
  });
  return { months, elev: got.reduce((a, g) => a + g.elev, 0) / got.length, cells: got.length };
}
const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);
const halfDiagonal = (lat: number) => { const dy = (OBSCURE / 2) * 111_320, dx = (OBSCURE / 2) * 111_320 * Math.cos((lat * Math.PI) / 180); return Math.hypot(dx, dy); };

const lines = ['slug\tname\tregion\texact places\texact cells\tblurred areas\tfloor exact\tfloor blurred\tcold exact\tcold blurred\twarm exact\twarm blurred\train exact\train blurred\tDLI exact\tDLI blurred'];
type D = { floor: number | null; warm: number; cold: number; rain: number; dli: number | null };
const diffs = new Map<Region, D[]>(REGIONS.map((r) => [r.id, []]));
let tooFew = 0, noClimate = 0;
for (const p of pages) {
  const rs = rowsOf.get(p) ?? [];
  const range = rangeTest(p.native as never, regions);
  const exact = readRecords(rs as never, p.boxes as never, p.verified, places, range?.admitBy, defaults);
  if (exact.forClimate.length < MIN_EXACT) { tooFew++; continue; }
  const env = await provider.envelope(exact.forClimate);
  if (env.status !== 'ok' || env.hemispheres) { noClimate++; continue; }
  const fx = figOf(env.months as Months, env.annualRain!.p50, env.extremes?.minP01 ?? null);
  // The blur, record by record, as iNaturalist obscures: a random point in the record's 0.2° cell.
  const blurred = rs.map((r) => {
    const la0 = Math.floor(r.decimalLatitude / OBSCURE) * OBSCURE, lo0 = Math.floor(r.decimalLongitude / OBSCURE) * OBSCURE;
    const lat = +(la0 + rand() * OBSCURE).toFixed(4), lon = +(lo0 + rand() * OBSCURE).toFixed(4);
    // readRecords admits to 10 km; a record of the coarse tier is read with its uncertainty held at the bound, as the count did.
    return { ...r, decimalLatitude: lat, decimalLongitude: lon, coordDecimals: 4, coordinateUncertaintyInMeters: 10_000, _radius: Math.min(COARSE_M, halfDiagonal(lat)) };
  });
  const coarse = readRecords(blurred as never, p.boxes as never, p.verified, places, range?.admitBy, defaults);
  const areas: Array<{ months: Months; elev: number; lat: number; lon: number }> = [];
  const seen = new Set<string>();
  for (const [lat, lon] of coarse.forClimate) {
    const id = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const a = await areaOf(lat, lon, Math.min(COARSE_M, halfDiagonal(lat)));
    if (a) areas.push({ ...a, lat, lon });
  }
  if (areas.length < 3) { noClimate++; continue; }
  const months = Array.from({ length: 12 }, (_, i) => ({ tmin: median(areas.map((a) => a.months[i].tmin)), tmax: median(areas.map((a) => a.months[i].tmax)), precipMm: median(areas.map((a) => a.months[i].precipMm)), dli: areas.every((a) => typeof a.months[i].dli === 'number') ? median(areas.map((a) => a.months[i].dli!)) : undefined }));
  const rain = median(areas.map((a) => a.months.reduce((s, m) => s + m.precipMm, 0)));
  const coldest = (m: Months) => Math.min(...m.map((x) => x.tmin));
  const medCold = median(areas.map((a) => coldest(a.months)));
  const typ = [...areas].sort((a, b) => Math.abs(coldest(a.months) - medCold) - Math.abs(coldest(b.months) - medCold))[0];
  const ps = powerOf(powerCell(typ.lat, typ.lon).id);
  const ef = ps ? extremesFor(ps, typ.elev >= 0 ? typ.elev : undefined) : null;
  const fb = figOf(months, rain, ef?.usable ? ef.extremes.minP01 : null);
  const d: D = { floor: fx.floor != null && fb.floor != null ? Math.abs(fx.floor - fb.floor) : null, cold: Math.abs(fx.cold - fb.cold), warm: Math.abs(fx.warm - fb.warm), rain: Math.abs(fx.rain - fb.rain) / Math.max(1, fx.rain), dli: fx.dli != null && fb.dli != null ? Math.abs(fx.dli - fb.dli) / fx.dli : null };
  diffs.get(p.region)!.push(d);
  const f1 = (x: number | null) => (x == null ? '' : x.toFixed(1));
  lines.push([p.slug, p.name, p.region, exact.forClimate.length, env.cells, areas.length, f1(fx.floor), f1(fb.floor), f1(fx.cold), f1(fb.cold), f1(fx.warm), f1(fb.warm), Math.round(fx.rain), Math.round(fb.rain), f1(fx.dli), f1(fb.dli)].join('\t'));
}
writeFileSync(`${OUT}/${RUN}.tsv`, lines.join('\n') + '\n');
log(`wrote ${OUT}/${RUN}.tsv (${lines.length - 1} species); ${tooFew} pages with fewer than ${MIN_EXACT} in-range records placed to within 1 km in the download, ${noClimate} with no climate on one side or the other`);

// The verdict, by the bar set before the run.
const q = (xs: number[], p: number) => (xs.length ? quantile([...xs].sort((a, b) => a - b), p) : NaN);
let all = true;
for (const r of REGIONS) {
  const ds = diffs.get(r.id)!;
  const fl = ds.map((d) => d.floor).filter((x): x is number => x != null), dl = ds.map((d) => d.dli).filter((x): x is number => x != null);
  const checks = [
    ['the cold floor (NASA POWER)', q(fl, 0.5) <= 1.0 && q(fl, 0.9) <= 2.5, `median ${q(fl, 0.5).toFixed(2)} °C, 90th ${q(fl, 0.9).toFixed(2)} °C over ${fl.length} species with both series in the cache`],
    ['the coldest month\'s mean nightly low', q(ds.map((d) => d.cold), 0.5) <= 1.0 && q(ds.map((d) => d.cold), 0.9) <= 2.5, `median ${q(ds.map((d) => d.cold), 0.5).toFixed(2)} °C, 90th ${q(ds.map((d) => d.cold), 0.9).toFixed(2)} °C`],
    ['the warmest month\'s mean high', q(ds.map((d) => d.warm), 0.5) <= 1.0 && q(ds.map((d) => d.warm), 0.9) <= 2.5, `median ${q(ds.map((d) => d.warm), 0.5).toFixed(2)} °C, 90th ${q(ds.map((d) => d.warm), 0.9).toFixed(2)} °C`],
    ['the rain a year', q(ds.map((d) => d.rain), 0.5) <= 0.15 && q(ds.map((d) => d.rain), 0.9) <= 0.3, `median ${(q(ds.map((d) => d.rain), 0.5) * 100).toFixed(1)}%, 90th ${(q(ds.map((d) => d.rain), 0.9) * 100).toFixed(1)}%`],
    ['the daily light', q(dl, 0.5) <= 0.1, `median ${(q(dl, 0.5) * 100).toFixed(1)}%`]
  ] as const;
  const judged = NO_FLOOR ? checks.slice(1) : checks;
  const pass = ds.length >= 10 && judged.every((c) => c[1]);
  if (!pass) all = false;
  log(`${r.id}: ${ds.length} species; ${pass ? 'PASSES' : ds.length < 10 ? 'TOO FEW SPECIES TO JUDGE (10 needed)' : 'FAILS'} the bar`);
  for (const c of checks) log(`  ${NO_FLOOR && c === checks[0] ? 'not judged (the coarse tier carries no cold floor)' : c[1] ? 'ok  ' : 'FAIL'} ${c[0]}: ${c[2]}`);
}
log(all ? 'the bar holds in every region: the coarse tier may be built for them' : 'the bar does not hold in every region: a region that fails is left out of the coarse tier');
log(`done ${new Date().toISOString()}`);
