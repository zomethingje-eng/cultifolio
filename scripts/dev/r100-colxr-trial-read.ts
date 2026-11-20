// Round one hundred (docs/PLAN-100.md, 4, step 3): the trial's dry run read by why each page is in it. Reads
// bulk/colxr/trial-keys.txt, bulk/colxr/trial-dry-run.log (the builder's per-page lines, "[n/812] Δ <id> <name>: …" and the
// detail line "records A open + B restricted in range → C open + D restricted in range; climate …") and writes
// bulk/colxr/trial-read.txt: each page's records in range before (the page live, of the backbone download of 21 October)
// and under COL XR, its climate's cells, the move of its typical spot, and the group tallies.
//   node --import tsx scripts/dev/r100-colxr-trial-read.ts
import { readFileSync, writeFileSync } from 'node:fs';

type Row = { id: string; name: string; why: string; colName: string; before?: number; after?: number; cellsB?: number; cellsA?: number; moved?: number; climate?: string };
const rows = new Map<string, Row>();
for (const l of readFileSync('bulk/colxr/trial-keys.txt', 'utf8').split(/\r?\n/)) {
  if (!l || l.startsWith('#')) continue;
  const [id, name, , , colName, why] = l.split('\t');
  rows.set(id, { id, name, why, colName });
}
const n = (s: string) => Number(s.replace(/,/g, ''));
for (const raw of readFileSync('bulk/colxr/trial-dry-run.log', 'utf8').split(/\r|\n/)) {
  const m = /^\[\d+\/\d+\]\s+(?:Δ\s+)?([kg]\d+) [^:]+: (.*)$/.exec(raw.trim());
  if (m) {
    const r = rows.get(m[1]);
    if (!r) continue;
    const rec = /records in range ([\d,]+) → ([\d,]+)/.exec(m[2]);
    if (rec) { r.before = n(rec[1]); r.after = n(rec[2]); }
    const cells = /climate cells (\d+) → (\d+)/.exec(m[2]);
    if (cells) { r.cellsB = Number(cells[1]); r.cellsA = Number(cells[2]); }
    const mv = /typical spot moved ([\d.]+) km/.exec(m[2]);
    if (mv) r.moved = Number(mv[1]);
    if (/climate (gained|lost)/.test(m[2])) r.climate = /climate (gained|lost)/.exec(m[2])![1];
    continue;
  }
  // A page the rule leaves as it was: "[n/812] · <name> [<id>]: no change" (its records, climate and spot the same).
  const same = /^\[\d+\/\d+\]\s+·\s+.+ \[([kg]\d+)\]: no change$/.exec(raw.trim());
  if (same) { const r = rows.get(same[1]); if (r && r.before == null) { r.before = -1; r.after = -1; } continue; }
  // The detail line, for a page the Δ line did not give records for (no change in range: the same before and after).
  const d = /^\[\d+\/\d+\]\s+(.+?) \[([kg]\d+)\]: records (\d+) open \+ (\d+) restricted in range → (\d+) open \+ (\d+) restricted in range/.exec(raw.trim());
  if (d) {
    const r = rows.get(d[2]);
    if (r && r.before == null) { r.before = Number(d[3]) + Number(d[4]); r.after = Number(d[5]) + Number(d[6]); }
  }
}
const groups = ['random', 'another name', 'shares a taxon'];
const out: string[] = ['# Round one hundred (docs/PLAN-100.md, 4, step 3): the trial read by scripts/dev/r100-colxr-trial-read.ts from bulk/colxr/trial-dry-run.log', '# page\tname\twhy\tCOL XR name\trecords in range live\tunder COL XR\tchange\tclimate cells live\tunder COL XR\ttypical spot moved km'];
const pct = (r: Row) => (r.before === -1 ? 0 : r.before ? (r.after! - r.before) / r.before : r.after ? Infinity : 0);
for (const r of [...rows.values()].sort((a, b) => Math.abs(pct(b)) - Math.abs(pct(a))))
  out.push([r.id, r.name, r.why, r.colName, r.before === -1 ? 'no change' : r.before ?? '', r.before === -1 ? '' : r.after ?? '', r.before != null && r.before !== -1 ? (Number.isFinite(pct(r)) ? `${Math.round(pct(r) * 100)}%` : 'new') : '', r.cellsB ?? '', r.cellsA ?? '', r.moved ?? ''].join('\t'));
const lines: string[] = [];
for (const g of groups) {
  const rs = [...rows.values()].filter((r) => r.why.split(', ').includes(g) && r.before != null);
  const band = (lo: number, hi: number) => rs.filter((r) => Math.abs(pct(r)) >= lo && Math.abs(pct(r)) < hi).length;
  const same = rs.filter((r) => r.before !== -1 && r.before === r.after).length;
  const toNone = rs.filter((r) => r.before! > 0 && r.after === 0).length;
  const unchanged = rs.filter((r) => r.before === -1).length;
  const far = rs.filter((r) => (r.moved ?? 0) >= 100).length;
  lines.push(`${g}: ${rs.length} pages read; no change at all on ${unchanged}, records in range the same on ${same}, other records within 5% on ${band(0, 0.05) - same - unchanged}, 5 to 20% on ${band(0.05, 0.2)}, 20 to 50% on ${band(0.2, 0.5)}, by half or more on ${band(0.5, Infinity)} (fell ${rs.filter((r) => pct(r) <= -0.5).length}, rose ${rs.filter((r) => pct(r) >= 0.5).length}); ${toNone} to none; typical spot moved 100 km or more on ${far}`);
}
const missing = [...rows.values()].filter((r) => r.before == null).length;
out.push('# ' + lines.join('\n# '), `# ${missing} pages with no records line in the log (no records either side, or not derived)`);
writeFileSync('bulk/colxr/trial-read.txt', out.join('\n') + '\n');
console.log('read bulk/colxr/trial-keys.txt and bulk/colxr/trial-dry-run.log; wrote bulk/colxr/trial-read.txt');
for (const l of lines) console.log(`  ${l}`);
console.log(`  ${missing} pages with no records line`);
