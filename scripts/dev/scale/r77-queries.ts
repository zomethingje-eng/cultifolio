/**
 * Round seventy-seven's fixed list of queries for the proof (scripts/dev/scale/r77-proof.ts): written once from the real
 * index with fixed seeds, and committed (scripts/dev/scale/r77-queries.txt), so the proof asks the same queries on any
 * later corpus. One query a line, after a tab its kind.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r77-queries.ts <index.json> > scripts/dev/scale/r77-queries.txt
 *
 * The kinds: every name as written and in lower case; prefixes of one to six characters of a sample of names and common
 * names, as typed; one typing error in a sample of names, genera and common names; multi-word queries (two names' words,
 * a name's words reversed, common words together, a genus with a place); every genus, family and place; every common
 * name; a sample of older names; round sixty-one's grower-shaped queries (the fuzz test's generator, seeds 11 to 55, over
 * real entries); punctuation; and every quoted text of the search's tests.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { reseed, rnd, pick, AUTHORS, GENUS_NAMES } from '../../../tests/unit/helpers/corpus-synth';
import type { IndexEntry } from '$dossier/index-entry';

const idx = JSON.parse(readFileSync(process.argv[2], 'utf8')) as IndexEntry[];
const out = new Map<string, string>();
const add = (q: string, kind: string) => { const t = q.replace(/[\t\n\r]/g, ' ').trim(); if (t && [...t].length <= 80 && !out.has(t)) out.set(t, kind); };
const sample = <T,>(xs: T[], n: number): T[] => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
reseed(77);

// 1. every name, as written and in lower case
for (const e of idx) { add(e.name, 'name'); add(e.name.toLowerCase(), 'name-lower'); }
// 2. prefixes of one to six characters, as typed
const commons = [...new Set(idx.flatMap((e) => [e.common, ...(e.commons ?? [])]).filter((x): x is string => !!x))];
for (const s of [...sample(idx.map((e) => e.name), 2500), ...sample(commons, 800)]) for (let n = 1; n <= 6; n++) add(s.slice(0, n), 'prefix');
for (const s of sample(idx.map((e) => e.name), 1200)) { const [g, ep] = s.split(' '); if (ep) for (let n = 1; n <= 6; n++) add(`${g} ${ep.slice(0, n)}`, 'prefix-epithet'); }
// 3. one typing error
const slip = (s: string) => {
  const alpha = 'abcdefghilmnoprstuy';
  if (s.length < 2) return s;
  const i = rnd(s.length), k = rnd(4), c = pick([...alpha]);
  return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2);
};
const genera = [...new Set(idx.map((e) => e.name.replace(/^× /, '').split(' ')[0]))];
for (const s of sample(idx.map((e) => e.name), 2500)) { const [g, ...rest] = s.split(' '); add(rnd(2) ? `${slip(g)} ${rest.join(' ')}` : `${g} ${slip(rest.join(' '))}`, 'typo'); }
for (const g of sample(genera, 800)) add(slip(g), 'typo-genus');
for (const c of sample(commons, 800)) add(slip(c), 'typo-common');
// 4. several words
const word = () => { const e = pick(idx); const ws = [e.name, e.common ?? '', ...(e.origin ?? [])].join(' ').split(/\s+/).filter((w) => w.length > 2); return ws.length ? pick(ws) : 'aloe'; };
for (let i = 0; i < 1500; i++) add(`${word()} ${word()}`, 'multi-random');
for (const s of sample(idx.map((e) => e.name), 1000)) add(s.split(' ').reverse().join(' '), 'multi-reversed');
const COMMON_WORDS = ['red', 'white', 'blue', 'yellow', 'pink', 'silver', 'golden', 'giant', 'dwarf', 'little', 'cape', 'south', 'north', 'mexican', 'african', 'desert', 'rose', 'lily', 'cactus', 'aloe', 'tree', 'plant', 'star', 'old', 'man', 'queen', 'king', 'snake', 'spider', 'tiger', 'zebra', 'living', 'stones', 'pearls', 'string', 'baby', 'toes', 'jade', 'snow', 'moon', 'sun', 'flower', 'bush', 'vine', 'palm', 'fern', 'orchid', 'grass', 'creeping', 'hairy'];
for (const a of COMMON_WORDS) for (const b of sample(COMMON_WORDS, 8)) if (a !== b) add(`${a} ${b}`, 'multi-common');
const places = [...new Set(idx.flatMap((e) => e.origin ?? []))];
for (const g of sample(genera, 300)) add(`${g} ${pick(places)}`, 'multi-genus-place');
for (const g of sample(genera, 200)) add(`${g} ${pick(COMMON_WORDS)}`, 'multi-genus-word');
// 5. genera, families, places
for (const g of genera) { add(g, 'genus'); add(g.toLowerCase(), 'genus'); }
for (const f of new Set(idx.map((e) => e.family).filter((x): x is string => !!x))) add(f, 'family');
for (const p of places) add(p, 'place');
// 6. every common name
for (const c of commons) add(c, 'common');
for (const c of sample(commons, 1500)) add(c.toLowerCase(), 'common-lower');
// 7. older names
const older = [...new Set(idx.flatMap((e) => [...(e.syn ?? []), ...(e.older ?? [])]))];
for (const o of sample(older, 6000)) add(o, 'older');
// 8. round sixty-one's grower-shaped queries over real entries (the generator of tests/unit/r61q-fuzz-grower.test.ts)
const QUOTES: Array<[string, string]> = [["'", "'"], ['‘', '’'], ['’', '’'], ['"', '"'], ['“', '”'], ["'", ''], ['‘', '']];
const MARKS = ['var.', 'var', 'v.', 'v', 'subsp.', 'subsp', 'ssp.', 'ssp', 'subspecies', 'variety', 'f.', 'fo.', 'forma', 'cv.', 'cv', 'x', 'X', '×', 'nothosubsp.', 'aff.', 'cf.'];
const CULT = ['Perle von Nürnberg', 'Ruby', 'Lola', 'Black Prince', 'Gollum', 'Super Zebra', 'Kikko', 'Blue Elf', 'Fred Ives', 'Variegata', 'Hakuō', 'Afterglow'];
const title = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
function growerQuery(e: IndexEntry): string {
  const parts = e.name.replace(/^× /, '').split(' ');
  const g = parts[0], rest = parts.slice(1).filter((w) => w !== '×');
  const ep = rest[0] ?? 'humilis';
  const q = () => pick(QUOTES);
  switch (rnd(22)) {
    case 0: return e.name;
    case 1: return `${g} x ${ep}`;
    case 2: return `${g} ×${ep}`;
    case 3: return `x${g} ${ep}`;
    case 4: return `${g} ${ep} x ${pick(GENUS_NAMES)} ${pick(idx).name.split(' ')[1] ?? ''}`;
    case 5: { const [a, b] = q(); return `${g} ${ep} ${a}${pick(CULT)}${b}`; }
    case 6: { const [a, b] = q(); return `${g} ${a}${pick(CULT)}${b}`; }
    case 7: return `${g} ${ep} cv. ${pick(CULT)}`;
    case 8: return `${g} ${ep} ${pick(MARKS)} ${pick(idx).name.split(' ').pop()}`;
    case 9: return g;
    case 10: return slip(g);
    case 11: return `${slip(g)} ${ep}`;
    case 12: return `${e.name} ${pick(AUTHORS)}`;
    case 13: return `${e.name} ${pick(AUTHORS).toLowerCase()}`;
    case 14: return `${g[0]}. ${ep}`;
    case 15: return `${g.slice(0, 3)}. ${ep} ${pick(MARKS)} ${pick(idx).name.split(' ').pop()}`;
    case 16: { const c = e.common ?? e.commons?.[0]; return c ? pick([c, c.toLowerCase(), title(c), c.toUpperCase()]) : e.name; }
    case 17: return `${e.name} ${e.name.split(' ')[1] ?? ''}`;
    case 18: return `${g} ${ep} ${pick(['ssp.', 'var.', 'subsp.', 'f.'])} ${ep}`;
    case 19: return `${g} ${ep} ${pick(AUTHORS)} ${pick(['var.', 'subsp.'])} ${pick(idx).name.split(' ').pop()} ${pick(AUTHORS)}`;
    case 20: return `${title(g)} ${title(ep)}`;
    default: {
      const toks = [g, ep, ...rest.slice(1)];
      const n = 1 + rnd(4);
      for (let i = 0; i < n; i++) {
        const at = rnd(toks.length + 1);
        const [a, b] = q();
        const what = pick([pick(MARKS), pick(AUTHORS), `${a}${pick(CULT)}${b}`, '×', 'x', '(', ')', '&', 'ex', 'et al.', slip(pick(toks))]);
        toks.splice(at, 0, what);
      }
      return toks.join(pick([' ', '  ', ' ', ', ']));
    }
  }
}
for (const seed of [11, 22, 33, 44, 55]) { reseed(seed); for (let i = 0; i < 1100; i++) add(growerQuery(pick(idx)), `grower-${seed}`); }
reseed(78);
// 9. punctuation
const PUNCT: Array<(s: string) => string> = [(s) => `"${s}"`, (s) => `‘${s}’`, (s) => `${s}.`, (s) => `(${s})`, (s) => `${s},`, (s) => s.replace(/ /g, '-'), (s) => s.replace(/ /g, '  '), (s) => s.toUpperCase(), (s) => `${s}!`, (s) => `${s}?`, (s) => s.replace(/ /, ' × '), (s) => `${s} sp.`, (s) => `${s.split(' ')[0]} sp.`, (s) => s.replace(/e/g, 'é'), (s) => `${s} L.`, (s) => `- ${s}`, (s) => `${s}'s`];
for (const s of sample([...idx.map((e) => e.name), ...commons], 1500)) add(pick(PUNCT)(s), 'punctuation');
for (const g of sample(genera, 200)) for (const f of PUNCT.slice(0, 5)) add(f(g), 'punctuation-genus');
for (const k of ['a', 'c', 'e', 'al', 'co', 'ca', 'cape', 'south', 'north', 'pro', 'var']) for (const f of PUNCT) add(f(k), 'punctuation-short');
// 10. every quoted text of the search's tests
const dirs = ['tests/unit', 'tests/e2e'];
for (const d of dirs) for (const f of readdirSync(d).filter((x) => /search|r60-fuzz|corpus-fuzz|readings|grower/.test(x))) {
  const text = readFileSync(`${d}/${f}`, 'utf8');
  for (const m of text.matchAll(/(['"‘`])((?:(?!\1)[^\\\n$]){1,60})\1/g)) { const t = m[2]; if (/\p{L}/u.test(t) && !/[/=<>{}[\]]|^\.|\.ts$|^[a-z]+[A-Z]/u.test(t)) add(t, 'tests'); }
}
// and the short keys alone, and the heaviest words alone and together
for (const a of 'abcdefghijklmnopqrstuvwxyz0123456789') { add(a, 'short'); for (const b of 'aeiourlnst') add(a + b, 'short'); }
for (const w of ['var', 'cap', 'cape', 'sou', 'south', 'nor', 'north', 'pro', 'prov', 'provinces', 'mexico', 'central', 'northern', 'subsp']) { add(w, 'heavy'); for (const v of ['var', 'cape', 'south', 'north', 'provinces', 'a', 'c', 'aloe', 'africa', 'n']) add(`${w} ${v}`, 'heavy-multi'); }

for (const [q, kind] of out) console.log(`${q}\t${kind}`);
console.error(`${out.size} queries`);
