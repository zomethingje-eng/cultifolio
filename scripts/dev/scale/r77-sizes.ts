/**
 * Round seventy-seven: the search's key files of a corpus directory as the build wrote them, counted and sized from its
 * manifest and the search's directories (docs/SCALE-STUDY.md section 6).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r77-sizes.ts <s/v2 directory> [label]
 */
import { readFileSync, statSync } from 'node:fs';

const [dir, label = dir] = process.argv.slice(2);
const m = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { species: number; files: Record<string, string> };
const size = (h: string) => statSync(`${dir}/p/${h}.json`).size;
const dirs = Object.entries(m.files).filter(([n]) => /^search\/(?:top|\d+)\.json$/.test(n));
const kinds = { exact: new Map<string, number>(), near: new Map<string, number>(), answers: new Map<string, number>(), photos: new Map<string, number>(), show: new Map<string, number>() };
// Since the second step of round seventy-seven: the photograph counts and the entries, in blocks by position.
if (m.files['search/blocks.json']) {
  const b = JSON.parse(readFileSync(`${dir}/p/${m.files['search/blocks.json']}.json`, 'utf8')) as { photos: string[]; show: string[] };
  for (const h of b.photos) kinds.photos.set(h, size(h));
  for (const h of b.show) kinds.show.set(h, size(h));
}
let keys = 0, heavy = 0, nearHeavy = 0;
for (const [, h] of dirs) {
  const d = JSON.parse(readFileSync(`${dir}/p/${h}.json`, 'utf8')) as Record<string, [number, string?, number?]>;
  for (const [k, e] of Object.entries(d)) {
    keys++;
    if (e.length === 1) { nearHeavy++; continue; }
    const kind = e[2] === 1 ? 'answers' : k.startsWith('~') ? 'near' : 'exact';
    if (kind === 'answers') heavy++;
    if (!kinds.answers.has(e[1]!) && !kinds.exact.has(e[1]!) && !kinds.near.has(e[1]!)) kinds[kind].set(e[1]!, size(e[1]!));
  }
}
const stats = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const sum = s.reduce((a, b) => a + b, 0); return { files: s.length, MB: +(sum / 1048576).toFixed(1), medianKB: +((s[s.length >> 1] ?? 0) / 1024).toFixed(1), p99KB: +((s[Math.floor(s.length * 0.99)] ?? 0) / 1024).toFixed(1), largestKB: +((s[s.length - 1] ?? 0) / 1024).toFixed(1) }; };
const all = [...kinds.exact.values(), ...kinds.near.values(), ...kinds.answers.values(), ...kinds.photos.values(), ...kinds.show.values()];
const dirSizes = dirs.map(([, h]) => size(h));
console.log(JSON.stringify({ label, species: m.species, keysListed: keys, heavyKeys: heavy, heavyNearKeys: nearHeavy, directories: { files: dirs.length, KB: +(dirSizes.reduce((a, b) => a + b, 0) / 1024).toFixed(1), largestKB: +(Math.max(...dirSizes) / 1024).toFixed(1) }, all: stats(all), exact: stats([...kinds.exact.values()]), near: stats([...kinds.near.values()]), answers: stats([...kinds.answers.values()]), photos: stats([...kinds.photos.values()]), show: stats([...kinds.show.values()]), genera: size(m.files['search/genera.json']) }));
