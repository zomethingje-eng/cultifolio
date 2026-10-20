/**
 * Round 79 (Q), a dev measure for the read-only cross-checks: what the institution rule (src/lib/dossier/clean.ts) removes
 * from the points a corpus kept, and how its flags meet CoordinateCleaner's. Needs only node; the flags file, when given,
 * is the output of scripts/dev/r79q-coordinatecleaner.R, which needs R.
 *
 *   npx tsx scripts/dev/r79q-measure.ts <points.csv> [--flags flags.csv] [--grscicoll institutions.tsv] [--species species.csv]
 *
 * points.csv is scripts/dev/r79q-points.mjs's. --grscicoll is GBIF's GRSciColl institution export
 * (https://api.gbif.org/v1/grscicoll/institution/export?format=TSV), read only to say what it would add to Wikidata's
 * places: the build does not use it (its licence is not stated where this round could find it).
 */
import { readFileSync } from 'node:fs';
import { parsePlaces, PlaceIndex, type Place } from '../../src/lib/dossier/clean';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const pointsPath = args[0];
if (!pointsPath) {
  console.error('usage: npx tsx scripts/dev/r79q-measure.ts <points.csv> [--flags flags.csv] [--grscicoll institutions.tsv]');
  process.exit(2);
}

/** A CSV line split on commas outside double quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

type Pt = { key: string; species: string; lat: number; lon: number; year: string; cc: string; basis: string };
const pts: Pt[] = [];
for (const line of readFileSync(pointsPath, 'utf8').split('\n').slice(1)) {
  if (!line) continue;
  const c = cells(line);
  pts.push({ key: c[0], species: c[1], lat: Number(c[2]), lon: Number(c[3]), year: c[4], cc: c[5], basis: c[6] });
}
const nSpecies = new Set(pts.map((p) => p.key)).size;
console.log(`${pts.length} points of ${nSpecies} species`);

const wd = parsePlaces(readFileSync('scripts/institutions.txt', 'utf8'));
function grscicoll(path: string): Place[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  const h = lines[0].split('\t');
  const [ik, ila, ilo, iname] = ['key', 'latitude', 'longitude', 'name'].map((k) => h.indexOf(k));
  const out: Place[] = [];
  for (const l of lines.slice(1)) {
    const c = l.split('\t');
    const lat = Number(c[ila]), lon = Number(c[ilo]);
    if (c[ila] && c[ilo] && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) out.push({ id: `${c[ik]} ${c[iname] ?? ''}`.trim(), kind: 'herbarium', lat, lon });
  }
  return out;
}
const gr = opt('--grscicoll') ? grscicoll(opt('--grscicoll')!) : [];

const tally = (flag: (p: Pt, i: number) => boolean | string | undefined) => {
  const hit: number[] = [];
  for (let i = 0; i < pts.length; i++) if (flag(pts[i], i)) hit.push(i);
  return hit;
};
const say = (label: string, hit: number[], ex = 6, why?: (i: number) => string) => {
  const sp = new Set(hit.map((i) => pts[i].key));
  const basis = new Map<string, number>();
  for (const i of hit) basis.set(pts[i].basis || '?', (basis.get(pts[i].basis || '?') ?? 0) + 1);
  console.log(`\n${label}: ${hit.length} points (${((100 * hit.length) / pts.length).toFixed(2)}%), ${sp.size} species; by basis ${[...basis].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(', ')}`);
  const step = Math.max(1, Math.floor(hit.length / ex));
  for (let j = 0; j < hit.length && j / step < ex; j += step) {
    const p = pts[hit[j]];
    console.log(`  ${p.species} (${p.key}) ${p.lat},${p.lon} ${p.cc} ${p.year} ${p.basis}${why ? ` ${why(hit[j])}` : ''}`);
  }
  return sp;
};

for (const r of [100, 1000, 2000]) {
  const ix = new PlaceIndex(wd, r);
  const hit = tally((p) => !!ix.near(p.lat, p.lon));
  const kinds = new Map<string, number>();
  for (const i of hit) { const k = ix.near(pts[i].lat, pts[i].lon)!.kind; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
  say(`Wikidata places within ${r} m (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')})`, hit, 8, (i) => ix.near(pts[i].lat, pts[i].lon)!.id);
}
if (gr.length) {
  for (const r of [100, 1000]) {
    const ix = new PlaceIndex(gr, r), wx = new PlaceIndex(wd, r);
    const hit = tally((p) => !!ix.near(p.lat, p.lon));
    say(`GRSciColl institutions within ${r} m (${gr.length} with coordinates)`, hit, 4, (i) => ix.near(pts[i].lat, pts[i].lon)!.id);
    say(`  of which no Wikidata place within ${r} m`, hit.filter((i) => !wx.near(pts[i].lat, pts[i].lon)), 6, (i) => ix.near(pts[i].lat, pts[i].lon)!.id);
  }
}

// The species whose habitat climate the rule would move most: the climate reads one 0.05° cell a distinct place, so what
// matters is the cells left with no record. Only the open points are in a dossier (the restricted in-range records the
// climate also reads are not), so this is an estimate from the open points, and the full build is the measure.
const dossiers = opt('--dossiers');
if (dossiers) {
  const ix = new PlaceIndex(wd);
  const cell = (lat: number, lon: number) => `${Math.floor((lat + 90) / 0.05)}:${Math.floor((lon + 180) / 0.05)}`;
  const by = new Map<string, { name: string; all: Set<string>; kept: Set<string>; n: number; out: number }>();
  for (const p of pts) {
    const e = by.get(p.key) ?? { name: p.species, all: new Set<string>(), kept: new Set<string>(), n: 0, out: 0 };
    e.n++;
    e.all.add(cell(p.lat, p.lon));
    if (ix.near(p.lat, p.lon)) e.out++;
    else e.kept.add(cell(p.lat, p.lon));
    by.set(p.key, e);
  }
  const rows: Array<{ key: string; name: string; cells: number; lost: number; n: number; out: number; climate: string; climateCells: number }> = [];
  for (const [key, e] of by) {
    if (!e.out) continue;
    let climate = '?', climateCells = 0;
    try {
      const d = JSON.parse(readFileSync(`${dossiers}/${key}.json`, 'utf8'));
      climate = d.climate?.status ?? '?';
      climateCells = d.climate?.cells ?? 0;
    } catch { /* not there */ }
    rows.push({ key, name: e.name, cells: e.all.size, lost: e.all.size - e.kept.size, n: e.n, out: e.out, climate, climateCells });
  }
  const ok = rows.filter((r) => r.climate === 'ok');
  const lostAny = ok.filter((r) => r.lost > 0);
  const under3 = ok.filter((r) => r.cells >= 3 && r.cells - r.lost < 3);
  console.log(`\nInstitution rule at ${ix.radiusM} m, by species: ${rows.length} species lose a point; ${ok.length} of them have a habitat climate now; ${lostAny.length} of those lose at least one 0.05° cell of open points, ${under3.length} would fall under three cells of open points (the restricted records may hold them up)`);
  for (const r of lostAny.sort((a, b) => b.lost / b.cells - a.lost / a.cells || b.lost - a.lost).slice(0, 25)) console.log(`  ${r.name} (${r.key}): ${r.out} of ${r.n} open points, ${r.lost} of ${r.cells} cells of open points (climate now ${r.climateCells} cells)`);
}

const flagsPath = opt('--flags');
if (flagsPath) {
  const lines = readFileSync(flagsPath, 'utf8').split('\n').filter(Boolean);
  const h = cells(lines[0]).map((s) => s.replace(/"/g, ''));
  const cols = h.slice(1);
  const fl: Record<string, Uint8Array> = {};
  for (const c of cols) fl[c] = new Uint8Array(pts.length);
  for (const l of lines.slice(1)) {
    const c = cells(l);
    const row = Number(c[0]) - 1;
    cols.forEach((k, j) => { fl[k][row] = c[j + 1] === 'FALSE' ? 1 : c[j + 1] === 'NA' ? 2 : 0; });
  }
  const ix = new PlaceIndex(wd, 1000);
  for (const k of cols) {
    const hit = tally((_p, i) => fl[k][i] === 1);
    say(`CoordinateCleaner ${k}`, hit, 8);
    if (k.startsWith('inst')) {
      const both = hit.filter((i) => ix.near(pts[i].lat, pts[i].lon));
      console.log(`  of these, ${both.length} within 1 km of a Wikidata place; Wikidata at 1 km flags ${tally((p) => !!ix.near(p.lat, p.lon)).length - both.length} that ${k} does not`);
    }
  }
}
