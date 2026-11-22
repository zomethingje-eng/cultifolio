// Round 108 (docs/PLAN-108.md, the corpus step's figures): what the coarse rule gives the pages of
// scripts/rebuild-r108-coarse.txt, read as the build reads them, before the build. Read-only: it reads the index and those
// dossiers, the bulk download (streamed, never extracted) and the climate grid, and writes only bulk/r108/coarse-dry.tsv
// and coarse-dry.log. The build's own figure is the one the corpus step checks; this sets the plan's `expect` lines.
//   node --max-old-space-size=11000 --import tsx scripts/dev/r108-coarse-dry.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { occHeader, parseOccRow } from '../../src/lib/dossier/bulk';
import { readRecords, rangeTest } from '../../src/lib/dossier/build';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { parsePlaces, PlaceIndex } from '../../src/lib/dossier/clean';
import { parseDefaultPoints } from '../../src/lib/dossier/default-points';
import { makeClimateProvider } from '../../src/lib/climate/provider';
import { fileGridSource } from '../file-grid';
import { FEW_RECORDS, FEW_CELLS } from '../../src/lib/core/few-records';

const ZIP = 'bulk/occurrence.zip', OUT = 'bulk/r108', CAP = 50_000;
mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/coarse-dry.log`;
writeFileSync(LOG, '');
const log = (s: string) => { console.log(s); appendFileSync(LOG, s + '\n'); };
log(`r108 coarse dry count, started ${new Date().toISOString()}`);
const wanted = new Set(readFileSync('scripts/rebuild-r108-coarse.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(' ')[0]));
type Page = { key: string; slug: string; name: string; keys: number[]; boxes: unknown[]; verified: boolean; native: Array<{ code?: string; box?: unknown }> };
const index = JSON.parse(readFileSync('static/s/v3/index.json', 'utf8')) as Array<{ key: string; slug: string; name: string }>;
const pages: Page[] = [];
for (const e of index) {
  if (!wanted.has(e.key)) continue;
  const d = JSON.parse(readFileSync(`static/s/v3/${e.key}.json`, 'utf8'));
  const keys = [...new Set([d.ids?.gbif, ...(d.occurrences?.keys ?? []).map((k: { key: number }) => k.key)].filter((k): k is number => typeof k === 'number'))];
  pages.push({ key: e.key, slug: e.slug, name: e.name, keys, boxes: d.distribution?.boxes ?? [], verified: d.distribution?.verified !== false, native: d.distribution?.native ?? [] });
}
log(`read scripts/rebuild-r108-coarse.txt (${wanted.size} pages) and their dossiers (${pages.length})`);
const pagesOfKey = new Map<number, Page[]>();
for (const p of pages) for (const k of p.keys) (pagesOfKey.get(k) ?? pagesOfKey.set(k, []).get(k)!).push(p);
const regions = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
const places = existsSync('scripts/institutions.txt') ? new PlaceIndex(parsePlaces(readFileSync('scripts/institutions.txt', 'utf8'))) : undefined;
const defaults = existsSync('scripts/default-points.txt') ? parseDefaultPoints(readFileSync('scripts/default-points.txt', 'utf8')) : undefined;
type Row = NonNullable<ReturnType<typeof parseOccRow>>;
const rowsOf = new Map<Page, Row[]>();
const child = spawn(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'unzip', process.platform === 'win32' ? ['-xOf', ZIP, 'occurrence.txt'] : ['-p', ZIP, 'occurrence.txt'], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.setEncoding('utf8');
let h: string[] = [], iS = -1, iT = -1, iA = -1, rows = 0;
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!h.length) { h = occHeader(line); iS = h.indexOf('speciesKey'); iT = h.indexOf('taxonKey'); iA = h.indexOf('acceptedTaxonKey'); continue; }
  if (!line) continue;
  rows++;
  const c = line.split('\t');
  const hit = new Set<Page>();
  for (const i of [iS, iT, iA]) { const k = Number(c[i]); const ps = k ? pagesOfKey.get(k) : undefined; if (ps) for (const p of ps) hit.add(p); }
  if (!hit.size) continue;
  const parsed = parseOccRow(h, line);
  if (!parsed) continue;
  const r = JSON.parse(JSON.stringify(parsed)) as Row;
  for (const p of hit) { const l = rowsOf.get(p) ?? rowsOf.set(p, []).get(p)!; if (l.length < CAP) l.push(r); }
}
log(`read ${ZIP}: ${rows.toLocaleString('en-GB')} rows; records for ${rowsOf.size} pages`);
const provider = makeClimateProvider({ grid: fileGridSource('climate/climate.grid', 'climate/climate.json'), fetcher: (async () => ({ status: 'refused', detail: 'the count fetches nothing' })) as never, noExtremes: true });
const lines = ['key\tname\tcoarse records in a proved region\tresult\tplaces\trecords\tfew\tdetail'];
const tally = { ok: 0, few: 0, none: 0, noCoarse: 0, sa: 0, sea: 0, envelope: 0 };
for (const p of pages) {
  const r = readRecords((rowsOf.get(p) ?? []) as never, p.boxes as never, p.verified, places, rangeTest(p.native as never, regions)?.admitBy, defaults);
  // A page the 10 km records now give a climate (records added since its build) is the envelope's, not the coarse rule's.
  if (r.forClimate.length) { const env = await provider.envelope(r.forClimate); if (env.status === 'ok') { tally.envelope++; lines.push([p.key, p.name, r.forCoarse.length, 'a 10 km climate', '', '', '', ''].join('\t')); continue; } }
  if (!r.forCoarse.length) { tally.noCoarse++; lines.push([p.key, p.name, 0, 'none', '', '', '', 'no coarse record in a proved region'].join('\t')); continue; }
  const c = await provider.coarse!(r.forCoarse);
  if (c.status === 'ok') {
    const few = c.records < FEW_RECORDS || c.cells < FEW_CELLS;
    tally.ok++; if (few) tally.few++;
    if (c.coarse?.region === 'southern-africa') tally.sa++; else tally.sea++;
    lines.push([p.key, p.name, r.forCoarse.length, 'coarse climate', c.cells, c.records, few ? 'few' : '', c.coarse?.region ?? ''].join('\t'));
  } else { tally.none++; lines.push([p.key, p.name, r.forCoarse.length, 'none', '', '', '', c.status === 'none' ? c.detail ?? '' : c.status].join('\t')); }
}
writeFileSync(`${OUT}/coarse-dry.tsv`, lines.join('\n') + '\n');
log(`wrote ${OUT}/coarse-dry.tsv: of ${pages.length} pages, ${tally.ok} gain a coarse climate (${tally.sa} southern Africa, ${tally.sea} South-East Asia; ${tally.few} of them from few records), ${tally.none} have coarse records too few or with no land, ${tally.noCoarse} none in a proved region, ${tally.envelope} a 10 km climate from records added since their build`);
log(`done ${new Date().toISOString()}`);
