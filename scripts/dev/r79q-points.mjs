// Round 79 (Q), a dev tool for the read-only cross-checks: writes the points a corpus kept, one CSV row a point, for
// scripts/dev/r79q-coordinatecleaner.R (which needs R) and scripts/dev/r79q-measure.ts. This script needs only node.
//
//   node scripts/dev/r79q-points.mjs <dossier folder> <points.csv>
//
// The points are each dossier's `occurrences.open`: the openly licensed in-range records the build kept, one a
// three-decimal coordinate. The restricted in-range records enter the habitat climate too but are not published, so
// no dossier holds them and no check made from a corpus can see them.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [dir, outPath] = process.argv.slice(2);
if (!dir || !outPath) {
  console.error('usage: node scripts/dev/r79q-points.mjs <dossier folder> <points.csv>');
  process.exit(2);
}
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const lines = ['key,species,decimalLatitude,decimalLongitude,year,countryCode,basisOfRecord,licence'];
let n = 0;
for (const f of readdirSync(dir).sort()) {
  if (!/^(?:k|g)?\d+\.json$/.test(f)) continue;
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  n++;
  for (const p of d.occurrences?.open ?? []) lines.push([d.key, q(d.name.scientific), p[0], p[1], p[2] ?? '', p[3] ?? '', p[4] ?? '', p[5]].join(','));
}
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`${n} dossiers, ${lines.length - 1} points written to ${outPath}`);
