// Round 79 (Q), a dev tool for the read-only rWCVP cross-check: sets each page's Kew ranges (scripts/dev/r79q-ranges.mjs)
// beside rWCVP's answer for the same entry (scripts/dev/r79q-rwcvp.R, which needs R), counts agreements, and sorts each
// difference by its kind. Needs only node.
//
//   node scripts/dev/r79q-rwcvp-compare.mjs <ranges.tsv> <rwcvp.tsv> [<rwcvp.tsv of a rerun of some names> ...]
//
// The kinds, tried in this order:
//   no range here        the page holds no Kew range (no via, or not Kew's), so there is nothing to compare
//   both none            rWCVP gives no distribution for the entry's words, and the page holds no region either (an
//                        artificial hybrid Kew holds with no range): counted as agreeing
//   not answered         rWCVP gives no distribution for the entry's words, and the page holds regions
//   entries joined       more than one of Kew's entries of these words has range rows: rWCVP joins them by name, the
//                        build takes one entry, by its author (rule 3)
//   introduced extinct   the sets differ only by regions the page holds introduced and rWCVP extinct: a row Kew marks
//                        both, which rWCVP's order of tests calls extinct and the build calls introduced
//   doubtful             the sets differ only in regions one side holds as doubtful
//   level 2 only         the page names a region Kew gives at level 2 only, with no level-3 area ("?" here), which
//                        rWCVP, mapping level-3 areas, leaves out
//   other                anything else, listed in full
import { readFileSync } from 'node:fs';
const [rangesPath, rwPath, ...more] = process.argv.slice(2);
if (!rangesPath || !rwPath) {
  console.error('usage: node scripts/dev/r79q-rwcvp-compare.mjs <ranges.tsv> <rwcvp.tsv>');
  process.exit(2);
}
const tsv = (p) => {
  const [h, ...rows] = readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
};
const set = (s) => new Set((s ?? '').split(' ').filter(Boolean));
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const minus = (a, b) => [...a].filter((x) => !b.has(x));
// Later files (a rerun of some names) replace an earlier file's lines for the same names.
const rw = new Map([rwPath, ...more].flatMap((p) => tsv(p)).map((r) => [r.kew, r]));
const kinds = new Map();
const add = (k, line) => { const a = kinds.get(k) ?? []; a.push(line); kinds.set(k, a); };
let same = 0, compared = 0;
for (const s of tsv(rangesPath)) {
  if (s.via === 'none' || !/^WCVP\b/.test(s.source) || /homonyms|not taken|via GBIF/.test(s.source)) { add('no range here', `${s.key} ${s.name}: ${s.source}`); continue; }
  const r = rw.get(s.kew);
  compared++;
  const ours = { native: set(s.native), introduced: set(s.introduced), doubtful: set(s.doubtful), extinct: set(s.extinct) };
  if ((!r || r.answered !== 'yes') && Object.values(ours).every((x) => !x.size)) { same++; add('both none', `${s.key} ${s.name} (Kew ${s.kew}, ${r?.statuses || 'no row'})`); continue; }
  if (!r || r.answered !== 'yes') { add('not answered', `${s.key} ${s.name} (Kew ${s.kew}, ${r?.statuses || 'no row'})`); continue; }
  const theirs = { native: set(r.native), introduced: set(r.introduced), doubtful: set(r.doubtful), extinct: set(r.extinct) };
  const keys = ['native', 'introduced', 'doubtful', 'extinct'];
  if (keys.every((k) => eq(ours[k], theirs[k]))) { same++; continue; }
  const diff = keys.map((k) => { const plus = minus(theirs[k], ours[k]), less = minus(ours[k], theirs[k]); return plus.length || less.length ? `${k}${plus.length ? ` +${plus.join(',')}` : ''}${less.length ? ` -${less.join(',')}` : ''}` : ''; }).filter(Boolean).join('; ');
  const line = `${s.key} ${s.name} (Kew ${s.kew}${s.via !== 'own' ? `, by ${s.via}` : ''}): rWCVP ${diff}`;
  if (Number(r.ranged) > 1) { add('entries joined', line); continue; }
  const movedIE = minus(ours.introduced, theirs.introduced);
  if (movedIE.length && movedIE.every((c) => theirs.extinct.has(c)) && eq(new Set([...theirs.introduced, ...movedIE]), ours.introduced) && eq(new Set([...ours.extinct, ...movedIE]), theirs.extinct) && eq(ours.native, theirs.native) && eq(ours.doubtful, theirs.doubtful)) { add('introduced extinct', line); continue; }
  const noQ = (o) => Object.fromEntries(keys.map((k) => [k, new Set([...o[k]].filter((c) => c !== '?'))]));
  if (keys.every((k) => eq(noQ(ours)[k], theirs[k]))) { add('level 2 only', line); continue; }
  const noD = (o) => ['native', 'introduced', 'extinct'].every((k) => eq(new Set(minus(o[0][k], o[1].doubtful)), new Set(minus(o[2][k], o[3].doubtful))));
  if (!eq(ours.doubtful, theirs.doubtful) && noD([ours, theirs, theirs, ours])) { add('doubtful', line); continue; }
  add('other', line);
}
console.log(`${compared} species compared with rWCVP (${rwPath}): ${same} the same in all four sets, ${compared - same} different`);
for (const [k, lines] of kinds) {
  console.log(`\n${k}: ${lines.length}`);
  for (const l of lines.slice(0, k === 'other' ? 400 : 12)) console.log(`  ${l}`);
}
