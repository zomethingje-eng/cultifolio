/**
 * Round eighty, agent A: what the regions' shapes change on a corpus on disk, offline. For each dossier with a native
 * range and openly licensed records inside it (by the regions' boxes, as built), how many of those records lie outside
 * every native region's shape (`regionTester`), and whether the map marker (the densest population of the open records)
 * moves. Restricted records are in no dossier, so the counts are of the open ones.
 *
 *   npx tsx scripts/dev/r80a-shapes-measure.ts <dossier dir> [--names a,b]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { habitatCluster } from '../../src/lib/core/geo';

const dir = process.argv[2];
const t = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
let pages = 0, changed = 0, emptied = 0, moved = 0, pts = 0, out = 0, allShaped = 0, partShaped = 0;
const lines: string[] = [];
for (const f of readdirSync(dir)) {
  if (!/^[gk]?\d+\.json$/.test(f)) continue;
  let d: { name: { scientific: string }; distribution: { native: Array<{ code?: string }> }; occurrences: { open: Array<[number, number, ...unknown[]]>; rangeTested?: boolean } };
  try { d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); } catch { continue; }
  const codes = (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));
  const open = d.occurrences?.open ?? [];
  if (!codes.length || !open.length || d.occurrences.rangeTested === false) continue;
  pages++;
  if (codes.every((c) => t.hasShape(c))) allShaped++; else if (codes.some((c) => t.hasShape(c))) partShaped++;
  const keep = open.filter((p) => codes.some((c) => t.inRegion(p[0], p[1], c)));
  pts += open.length; out += open.length - keep.length;
  if (keep.length === open.length) continue;
  changed++;
  if (!keep.length) emptied++;
  const a = habitatCluster(open.map((p) => [p[0], p[1]] as [number, number]));
  const b = keep.length ? habitatCluster(keep.map((p) => [p[0], p[1]] as [number, number])) : null;
  const mv = !!a && (!b || Math.abs(a.lat - b.lat) > 0.5 || Math.abs(a.lon - b.lon) > 0.5);
  if (mv) moved++;
  lines.push(`${d.name.scientific}\t${open.length - keep.length} of ${open.length} open records outside the shapes${mv ? '; the densest population moves' : ''}`);
}
console.log(`${pages} pages with native regions and open in-range records; ${allShaped} with every native region shaped, ${partShaped} with some`);
console.log(`${out} of ${pts} open in-range records (${((100 * out) / pts).toFixed(2)}%) outside every native region's shape: on ${changed} pages; ${emptied} pages left with none; the densest population moves (more than half a degree) on ${moved}`);
const names = process.argv.includes('--names') ? process.argv[process.argv.indexOf('--names') + 1].split(',') : [];
for (const l of lines) if (names.some((n) => l.startsWith(n))) console.log('  ' + l);
console.log(lines.sort((x, y) => Number(y.split('\t')[1].split(' ')[0]) - Number(x.split('\t')[1].split(' ')[0])).slice(0, 15).map((l) => '  ' + l).join('\n'));
