// Round 79 (Q), a dev tool for the read-only rWCVP cross-check: writes each dossier's Kew ranges, one tab-separated line
// a species, for scripts/dev/r79q-rwcvp.R (which needs R) and scripts/dev/r79q-rwcvp-compare.mjs. Needs only node.
//
//   node scripts/dev/r79q-ranges.mjs <dossier folder> <ranges.tsv>
//
// Columns: key, the page's name, the name of Kew's entry the range is read from (`distribution.via.name`, else the
// page's name), how it was reached (`via.kind`, or "none"), the source line, then the TDWG level-3 codes the page holds
// as native, introduced, doubtful and extinct (space-separated; "?" for a region with no code).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [dir, outPath] = process.argv.slice(2);
if (!dir || !outPath) {
  console.error('usage: node scripts/dev/r79q-ranges.mjs <dossier folder> <ranges.tsv>');
  process.exit(2);
}
const codes = (xs) => (xs ?? []).map((r) => r.code ?? '?').sort().join(' ');
const clean = (s) => String(s ?? '').replace(/[\t\n]/g, ' ');
const lines = ['key\tname\tkew\tvia\tsource\tnative\tintroduced\tdoubtful\textinct'];
for (const f of readdirSync(dir).sort()) {
  if (!/^(?:k|g)?\d+\.json$/.test(f)) continue;
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const dist = d.distribution ?? {};
  lines.push([d.key, d.name.scientific, dist.via?.name ?? d.name.scientific, dist.via?.kind ?? 'none', dist.source, codes(dist.native), codes(dist.introduced), codes(dist.doubtful), codes(dist.extinct)].map(clean).join('\t'));
}
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`${lines.length - 1} species written to ${outPath}`);
