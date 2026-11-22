// Round 108's follow-up (read-only): the two coarse pages the corpus step's range check named, tested by the coarse reach.
//   node --import tsx scripts/dev/r108-reach-check.ts
import { readFileSync } from 'node:fs';
import { regionTester, SHAPES_FILE, type ShapesFile } from '../../src/lib/dossier/tdwg-shapes';
import { coarseReached, cellReached } from '../../src/lib/dossier/range-check';
const t = regionTester(JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile);
for (const k of ['k2341098', 'k2734756']) {
  const d = JSON.parse(readFileSync(`static/s/v3/${k}.json`, 'utf8'));
  const codes = (d.distribution?.native ?? []).flatMap((r: { code?: string }) => (r.code ? [r.code] : []));
  const at = d.climate.at;
  console.log(k, d.name.scientific, JSON.stringify(at), codes.join(','), 'land', t.landOf(at.lat, at.lon).join(','));
  for (const how of ['strict', 'buffer', 'coast', 'island'] as const) console.log('  ', how, 'coarse', coarseReached(t, at.lat, at.lon, codes, how), 'cell', cellReached(t, at.lat, at.lon, codes, how));
}
