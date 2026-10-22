/**
 * Round eighty (R), a dev measure for the institution rule's references: what another list of places would leave out of
 * the points a corpus kept, beyond Wikidata's (`scripts/institutions.txt`), and how much of CoordinateCleaner's 1 km
 * institution flag that Wikidata misses it would catch. Node only; reads round seventy-nine's exports (Q's points.csv and
 * CoordinateCleaner's flags.csv, scripts/dev/r79q-*), and each list as "id <tab> kind <tab> latitude <tab> longitude".
 *
 *   npx tsx scripts/dev/r80r-places-measure.ts <points.csv> <flags.csv> <name>=<list.tsv> [...]
 */
import { readFileSync } from 'node:fs';
import { parsePlaces, PlaceIndex, type Place } from '../../src/lib/dossier/clean';

const [pointsPath, flagsPath, ...lists] = process.argv.slice(2);
const pts: Array<{ key: string; species: string; lat: number; lon: number; basis: string; cc: string }> = [];
for (const line of readFileSync(pointsPath, 'utf8').split('\n').slice(1)) {
  if (!line) continue;
  const c = line.split(',');
  // species names hold no comma in this export; a quoted field would, and is read whole
  if (line.includes('"')) { const m = /^(\d+),"([^"]*)",(-?[\d.]+),(-?[\d.]+),[^,]*,([^,]*),([^,]*)/.exec(line); if (m) pts.push({ key: m[1], species: m[2], lat: +m[3], lon: +m[4], cc: m[5], basis: m[6] }); continue; }
  pts.push({ key: c[0], species: c[1], lat: Number(c[2]), lon: Number(c[3]), cc: c[5], basis: c[6] });
}
const fl = readFileSync(flagsPath, 'utf8').split('\n');
const h = fl[0].split(',').map((s) => s.replace(/"/g, ''));
const col = h.indexOf('inst1k');
// CoordinateCleaner's flags are TRUE where a point passes a test, FALSE where it is flagged.
const cc1k = new Uint8Array(pts.length);
for (let i = 1; i < fl.length && i - 1 < pts.length; i++) { const c = fl[i].split(','); if (c[col] === 'FALSE') cc1k[i - 1] = 1; }
const wd = new PlaceIndex(parsePlaces(readFileSync('scripts/institutions.txt', 'utf8')));
const wdHit = pts.map((p) => !!wd.near(p.lat, p.lon));
const ccMiss = pts.reduce((n, _p, i) => n + (cc1k[i] && !wdHit[i] ? 1 : 0), 0);
console.log(`${pts.length} points; Wikidata's places catch ${wdHit.filter(Boolean).length}; CoordinateCleaner's 1 km institutions flag ${cc1k.reduce((a, b) => a + b, 0)}, ${ccMiss} of them not near a Wikidata place`);
for (const spec of lists) {
  const [name, path] = spec.split('=');
  const places: Place[] = [];
  for (const l of readFileSync(path, 'utf8').split('\n')) { const [id, kind, la, lo] = l.split('\t'); const lat = Number(la), lon = Number(lo); if (id && Number.isFinite(lat) && Number.isFinite(lon)) places.push({ id, kind: kind as Place['kind'], lat, lon }); }
  const ix = new PlaceIndex(places);
  const extra: number[] = [];
  for (let i = 0; i < pts.length; i++) if (!wdHit[i] && ix.near(pts[i].lat, pts[i].lon)) extra.push(i);
  const sp = new Set(extra.map((i) => pts[i].key));
  const ofCc = extra.filter((i) => cc1k[i]).length;
  const at = new Map<string, number>();
  for (const i of extra) { const p = ix.near(pts[i].lat, pts[i].lon)!; at.set(p.id, (at.get(p.id) ?? 0) + 1); }
  const basis = new Map<string, number>();
  for (const i of extra) basis.set(pts[i].basis, (basis.get(pts[i].basis) ?? 0) + 1);
  console.log(`\n${name}: ${places.length} places; beyond Wikidata's, ${extra.length} points of ${sp.size} species, at ${at.size} places; ${ofCc} of them CoordinateCleaner's (${((100 * ofCc) / Math.max(1, ccMiss)).toFixed(1)}% of the ${ccMiss} it flags that Wikidata misses); by basis ${[...basis].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b, n]) => `${b} ${n}`).join(', ')}`);
  for (const [id, n] of [...at].sort((a, b) => b[1] - a[1]).slice(0, 8)) { const p = places.find((x) => x.id === id)!; console.log(`  ${id} (${p.lat}, ${p.lon}): ${n} points`); }
}
