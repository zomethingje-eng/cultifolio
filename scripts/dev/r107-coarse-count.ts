// Round 107 (docs/PLAN-107.md, step 1; the first hand-off's round 5): the count before any rule. Read-only: it reads the
// bulk download (bulk/occurrence.zip, streamed, never extracted), the dossiers on disk and the builder's own range test,
// and writes only under bulk/r107/. Nothing in the corpus, the index or the app changes.
//
// For every page with no habitat climate whose reason is its records' placing (its climate says "placed to within 10 km",
// or too few land cells hold such records), it reads that page's records as the builder does (`readRecords`: planted,
// institution and default-point records out, one record a three-decimal place, the range test by the regions' shapes),
// then counts what a coarser tier would admit:
//   - places placed to within 10 km (the rule now), to within 30 km, to within 100 km (a record's stated
//     coordinateUncertaintyInMeters; a record stating none is admitted only as the rule admits it now);
//   - the grid cells (CHELSA's 0.05°) those places fall in; three are the envelope's minimum, and a page under 12 records
//     or 5 cells is marked "from few records";
//   - in-range records whose own fields say their place was withheld or generalised (informationWithheld,
//     dataGeneralizations), the only records the notice may call "withheld or blurred" (rule 3).
// Land is not tested here (the envelope's own test needs the grid): a cell counted may be at sea, so the counts are an
// upper bound on the cells a build would read, said so in the report.
//
//   node --max-old-space-size=11000 --import tsx scripts/dev/r107-coarse-count.ts
// reads static/s/v3/index.json, static/s/v3/<key>.json, bulk/occurrence.zip, scripts/tdwg3-shapes.json,
// scripts/institutions.txt, scripts/default-points.txt; writes bulk/r107/coarse-count.tsv (a line a page),
// bulk/r107/coarse-by-genus.tsv and bulk/r107/coarse-count.log (what it read and wrote, and the totals).
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { occHeader, parseOccRow } from '../../src/lib/dossier/bulk';
import { readRecords, rangeTest } from '../../src/lib/dossier/build';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { parsePlaces, PlaceIndex } from '../../src/lib/dossier/clean';
import { parseDefaultPoints } from '../../src/lib/dossier/default-points';
import { FEW_RECORDS, FEW_CELLS } from '../../src/lib/core/few-records';

// CAP was 200,000: the first full run held 11 GB within five million rows (each row's strings kept its whole line alive).
const ZIP = 'bulk/occurrence.zip', OUT = 'bulk/r107', CAP = 50_000;
/** --rows N: stop after N rows (a trial of the script itself, its counts not the round's). */
const STOP = (() => { const i = process.argv.indexOf('--rows'); return i >= 0 ? Number(process.argv[i + 1]) : Infinity; })();
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/coarse-count.log`;
writeFileSync(LOG, '');
const log = (s: string) => { console.log(s); appendFileSync(LOG, s + '\n'); };
log(`r107 coarse count, started ${new Date().toISOString()}`);

type Page = { key: string; slug: string; name: string; genus: string; detail: string; keys: number[]; boxes: unknown[]; verified: boolean; native: Array<{ code?: string; box?: unknown }> };
const index = JSON.parse(readFileSync('static/s/v3/index.json', 'utf8')) as Array<{ key: string; slug: string; name: string; climate?: string }>;
const pages: Page[] = [];
let noClimate = 0, otherReason = 0, noKey = 0;
for (const e of index) {
  if (e.climate !== 'none') continue;
  noClimate++;
  const f = `static/s/v3/${e.key}.json`;
  if (!existsSync(f)) continue;
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const detail: string = d.climate?.detail ?? '';
  // The reasons a coarser tier could change: no record placed well enough, too few cells, or no in-range record at all
  // (a publisher that withholds every place leaves none). A wide range, a cultigen or a name not resolved stay as they are.
  if (!/placed to within 10 km|distinct land cell|no georeferenced record inside the range/.test(detail)) { otherReason++; continue; }
  const keys = [...new Set([d.ids?.gbif, ...(d.occurrences?.keys ?? []).map((k: { key: number }) => k.key)].filter((k): k is number => typeof k === 'number'))];
  if (!keys.length) { noKey++; continue; }
  pages.push({ key: e.key, slug: e.slug, name: e.name, genus: e.name.split(' ')[0], detail, keys, boxes: d.distribution?.boxes ?? [], verified: d.distribution?.verified !== false, native: d.distribution?.native ?? [] });
}
log(`read static/s/v3/index.json: ${index.length} pages, ${noClimate} with no habitat climate; ${pages.length} for want of placed records (their dossiers read), ${otherReason} for another reason (range, cultigen, no records), ${noKey} with no GBIF key`);

const pagesOfKey = new Map<number, Page[]>();
for (const p of pages) for (const k of p.keys) (pagesOfKey.get(k) ?? pagesOfKey.set(k, []).get(k)!).push(p);
const regions = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
const places = existsSync('scripts/institutions.txt') ? new PlaceIndex(parsePlaces(readFileSync('scripts/institutions.txt', 'utf8'))) : undefined;
const defaults = existsSync('scripts/default-points.txt') ? parseDefaultPoints(readFileSync('scripts/default-points.txt', 'utf8')) : undefined;
log(`read ${SHAPES_FILE}, scripts/institutions.txt (${places ? 'read' : 'absent'}), scripts/default-points.txt (${defaults ? defaults.size + ' points' : 'absent'})`);

type Row = ReturnType<typeof parseOccRow> & { flagged?: boolean };
const rowsOf = new Map<Page, Row[]>();
const capped = new Set<Page>();
const child = spawn(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'unzip', process.platform === 'win32' ? ['-xOf', ZIP, 'occurrence.txt'] : ['-p', ZIP, 'occurrence.txt'], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.setEncoding('utf8');
let h: string[] = [], iW = -1, iG = -1, iS = -1, iT = -1, iA = -1, rows = 0, kept = 0;
const t0 = Date.now();
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!h.length) {
    const raw = line.replace(/^\uFEFF/, '').split('\t');
    h = occHeader(line);
    iW = raw.indexOf('informationWithheld'); iG = raw.indexOf('dataGeneralizations');
    iS = h.indexOf('speciesKey'); iT = h.indexOf('taxonKey'); iA = h.indexOf('acceptedTaxonKey');
    log(`occurrence.txt: ${raw.length} columns; informationWithheld ${iW >= 0 ? 'present' : 'ABSENT'}, dataGeneralizations ${iG >= 0 ? 'present' : 'ABSENT'}`);
    continue;
  }
  if (!line) continue;
  if (rows >= STOP) { child.kill(); break; }
  if (++rows % 5_000_000 === 0) log(`  ${(rows / 1e6).toFixed(0)} million rows read, ${kept.toLocaleString('en-GB')} kept, ${Math.round((Date.now() - t0) / 60000)} min, heap ${(process.memoryUsage().heapUsed / 1e9).toFixed(1)} GB`);
  // The three key columns first, cheaply: most rows are no target page's.
  const c = line.split('\t');
  const hit = new Set<Page>();
  for (const i of [iS, iT, iA]) { const k = Number(c[i]); const ps = k ? pagesOfKey.get(k) : undefined; if (ps) for (const p of ps) hit.add(p); }
  if (!hit.size) continue;
  const parsed = parseOccRow(h, line);
  if (!parsed) continue;
  // A flat copy: the parsed fields are slices of the line, and a slice keeps the whole 230-column line in memory.
  const r = JSON.parse(JSON.stringify(parsed)) as Row;
  if ((iW >= 0 && c[iW]?.trim()) || (iG >= 0 && c[iG]?.trim())) r.flagged = true;
  for (const p of hit) {
    const list = rowsOf.get(p) ?? rowsOf.set(p, []).get(p)!;
    if (list.length >= CAP) { capped.add(p); continue; }
    list.push(r);
    kept++;
  }
}
log(`read ${ZIP} (occurrence.txt): ${rows.toLocaleString('en-GB')} rows in ${Math.round((Date.now() - t0) / 60000)} min; ${kept.toLocaleString('en-GB')} kept for ${rowsOf.size} pages${capped.size ? `; ${capped.size} pages capped at ${CAP.toLocaleString('en-GB')} rows` : ''}`);

/** Each place a tier admits, by the builder's own reading with the tier's bound in place of 10 km. */
function tier(p: Page, rs: Row[], maxM: number) {
  const as = maxM === 10_000 ? rs : rs.map((r) => (r!.coordinateUncertaintyInMeters != null && r!.coordinateUncertaintyInMeters > 10_000 && r!.coordinateUncertaintyInMeters <= maxM ? { ...r!, coordinateUncertaintyInMeters: 10_000 } : r));
  const got = readRecords(as as never, p.boxes as never, p.verified, places, rangeTest(p.native as never, regions)?.admitBy, defaults);
  const cells = new Set(got.forClimate.map(([lat, lon]) => `${Math.floor(lat / 0.05)},${Math.floor(lon / 0.05)}`));
  return { places: got.forClimate.length, cells: cells.size, inRange: got.nInRangeRecords };
}
const TIERS = [10_000, 30_000, 100_000] as const;
const lines = ['slug\tname\tgenus\tin-range records\tflagged in range\tplaces 10 km\tcells 10 km\tplaces 30 km\tcells 30 km\tplaces 100 km\tcells 100 km\tcapped\tclimate detail'];
type G = { pages: number; c30: number; c100: number; full30: number; full100: number; flagged: number };
const byGenus = new Map<string, G>();
const sum = { pages: 0, c30: 0, c100: 0, full30: 0, full100: 0, flaggedPages: 0 };
for (const p of pages) {
  const rs = rowsOf.get(p) ?? [];
  const [a, b, c] = TIERS.map((m) => tier(p, rs, m));
  const flaggedIn = rs.some((r) => r!.flagged) ? readRecords(rs.filter((r) => r!.flagged) as never, p.boxes as never, p.verified, places, rangeTest(p.native as never, regions)?.admitBy, defaults).nInRangeRecords : 0;
  lines.push([p.slug, p.name, p.genus, a.inRange, flaggedIn, a.places, a.cells, b.places, b.cells, c.places, c.cells, capped.has(p) ? 'capped' : '', p.detail.replace(/\t/g, ' ')].join('\t'));
  const g = byGenus.get(p.genus) ?? { pages: 0, c30: 0, c100: 0, full30: 0, full100: 0, flagged: 0 };
  const gains = (x: { cells: number }) => x.cells >= 3;
  const full = (x: { places: number; cells: number }) => x.places >= FEW_RECORDS && x.cells >= FEW_CELLS;
  g.pages++; sum.pages++;
  if (gains(b)) { g.c30++; sum.c30++; } if (gains(c)) { g.c100++; sum.c100++; }
  if (full(b)) { g.full30++; sum.full30++; } if (full(c)) { g.full100++; sum.full100++; }
  if (flaggedIn) { g.flagged++; sum.flaggedPages++; }
  byGenus.set(p.genus, g);
}
writeFileSync(`${OUT}/coarse-count.tsv`, lines.join('\n') + '\n');
const gl = ['genus\tpages with no climate for want of placed records\ta climate at 30 km (3 cells or more)\tat 30 km, not from few records\ta climate at 100 km\tat 100 km, not from few records\tpages with in-range records withheld or generalised by their own fields'];
for (const [g, x] of [...byGenus].sort((p, q) => q[1].c30 - p[1].c30 || q[1].pages - p[1].pages)) gl.push([g, x.pages, x.c30, x.full30, x.c100, x.full100, x.flagged].join('\t'));
writeFileSync(`${OUT}/coarse-by-genus.tsv`, gl.join('\n') + '\n');
log(`wrote ${OUT}/coarse-count.tsv (${pages.length} pages) and ${OUT}/coarse-by-genus.tsv (${byGenus.size} genera)`);
log(`of ${sum.pages} pages: a climate (3 cells or more, land not tested) at 30 km ${sum.c30}, of them not from few records ${sum.full30}; at 100 km ${sum.c100}, not from few records ${sum.full100}; ${sum.flaggedPages} pages hold in-range records whose own fields say their place was withheld or generalised`);
for (const g of ['Lithops', 'Conophytum', 'Paphiopedilum']) { const x = byGenus.get(g); log(`  ${g}: ${x ? `${x.pages} pages; at 30 km ${x.c30} (${x.full30} not few); at 100 km ${x.c100} (${x.full100} not few); ${x.flagged} with records withheld or generalised` : 'no page in the count'}`); }
log(`done ${new Date().toISOString()}`);
