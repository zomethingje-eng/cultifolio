// Round-60 self-review, corpus area: the postings path (with the relaxed retry) against the whole index, fuzzed with
// grower-shaped queries heavy in rank markers, citations, quotes and hybrid signs, over several seeds.
// A guard, adopted in round sixty-one from docs/review-60/tests/corpus--fuzz-grower.test.ts. It passed on the base and
// passes with the round's search fix (the author, hybrid and cultivar rules of decision 7).
// The defaults are two seeds of 400 so the unit suite stays quick (round sixty-one); the review's full run is
// SEEDS=11,22,33,44,55 FUZZ_N=1100 npx vitest run tests/unit/r61q-fuzz-grower.test.ts (about 12 minutes on 2 shared CPUs).
// REV_OUT=<dir> writes the relaxed answers and the two-spelling differences for reading.
import { describe, it, expect } from 'vitest';
import { searchAnswer, _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search, relaxedQuery } from '$core/search';
import { _clean } from '../../src/routes/api/search/+server';
import { synthIndex, rnd, pick, reseed, AUTHORS, GENUS_NAMES } from './helpers/corpus-synth';
import { writeFileSync } from 'node:fs';

type E = ReturnType<typeof synthIndex>['idx'][number] & { commons?: string[] };

function platformFor(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const blobs = new Map<string, string>();
  blobs.set(manifestPath(), JSON.stringify(manifest));
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  const store = { get: async (k: string) => (blobs.has(k) ? obj(blobs.get(k)!, `"${k}"`) : null), head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
  return { platform: { env: { STORE: store } } as unknown as App.Platform };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

/** The synthetic index with its common names split as the build now writes them: the first as `common`, the rest as `commons`. */
function withCommons(idx: E[]): E[] {
  const extra = ['String-Of-Beads Senecio', 'Mother Of Thousands', 'Crown of Thorns', 'Queen of the Night', 'Hens and Chicks', 'Old Man of the Andes', 'Mexican Snowball', 'Living Stones'];
  return idx.map((e) => {
    const names = (e.common ?? '').split(', ').filter(Boolean);
    if (!rnd(6)) names.push(pick(extra));
    const uniq = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
    const out: E = { ...e };
    delete out.common;
    if (uniq.length) out.common = uniq[0];
    if (uniq.length > 1) out.commons = uniq.slice(1);
    return out;
  });
}

const slip = (s: string) => {
  const alpha = 'abcdefghilmnoprstuy';
  if (s.length < 2) return s;
  const i = rnd(s.length), k = rnd(4), c = pick([...alpha]);
  return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2);
};
const QUOTES: Array<[string, string]> = [["'", "'"], ['‘', '’'], ['’', '’'], ['"', '"'], ['“', '”'], ["'", ''], ['‘', '']];
const MARKS = ['var.', 'var', 'v.', 'v', 'subsp.', 'subsp', 'ssp.', 'ssp', 'subspecies', 'variety', 'f.', 'fo.', 'forma', 'cv.', 'cv', 'x', 'X', '×', 'nothosubsp.', 'aff.', 'cf.'];
const CULT = ['Perle von Nürnberg', 'Ruby', 'Lola', 'Black Prince', 'Gollum', 'Super Zebra', 'Kikko', 'Blue Elf', 'Fred Ives', 'Variegata', 'Hakuō', 'Afterglow'];
const title = (s: string) => s.replace(/(^|[\s-])(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());

/** A grower's query about entry `e`: the name as labels, nursery lists, POWO and phones write it. */
function growerQuery(e: E, idx: E[]): string {
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
    case 17: return `${e.name} ${e.name.split(' ')[1] ?? ''}`; // a doubled word
    case 18: return `${g} ${ep} ${pick(['ssp.', 'var.', 'subsp.', 'f.'])} ${ep}`; // the autonym
    case 19: return `${g} ${ep} ${pick(AUTHORS)} ${pick(['var.', 'subsp.'])} ${pick(idx).name.split(' ').pop()} ${pick(AUTHORS)}`;
    case 20: return `${title(g)} ${title(ep)}`;
    default: { // a heavy mix: markers, quotes, citations and signs anywhere
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

/** Spellings a grower may use for one query: case, curly quotes, a doubled word, a trailing rank, accents, "x" for "×". */
function spellings(q: string): string[] {
  return [
    q,
    q.toLowerCase(),
    title(q.toLowerCase()),
    q.replace(/'/g, '’').replace(/"/g, '”'),
    q.replace(/×/g, 'x'),
    q.replace(/ x /g, ' × '),
    `${q} var.`,
    q.replace(/\s+/g, '  ')
  ];
}

const seeds = (process.env.SEEDS ?? '11,22').split(',').map(Number);
const N = Number(process.env.FUZZ_N ?? 400);

describe('corpus review: postings path with the retry equals the whole index, grower-shaped queries', () => {
  for (const seed of seeds) {
    it(`seed ${seed}`, async () => {
      reseed(seed);
      _forgetIndex();
      const idx = withCommons(synthIndex(9000).idx as E[]);
      const { platform } = platformFor(idx);
      const whole = prepare(idx);
      const mism: string[] = [];
      const relaxed: Array<{ q: string; relaxed: string; top: string[]; asked: string }> = [];
      const twoSpell: Array<{ a: string; b: string; ra: string[]; rb: string[] }> = [];
      const answerOf = async (raw: string, n: number) => {
        const q = _clean(raw);
        if (!/[\p{L}\p{N}]/u.test(q)) return null;
        const a = await searchAnswer(platform, noStatic, q, n, async () => null);
        if ('stop' in a) throw new Error('stopped');
        let want = search(whole, q, n);
        const rq = want.length ? null : relaxedQuery(q);
        if (rq) want = search(whole, rq, n);
        const got = a.hits.map((h) => h.key), exp = want.map((h) => h.key);
        if (JSON.stringify(got) !== JSON.stringify(exp)) mism.push(`${JSON.stringify(q)} n=${n} want ${exp.length} got ${got.length}`);
        if ((a.relaxed?.query ?? null) !== (rq && want.length ? rq : null)) mism.push(`${JSON.stringify(q)} relaxed ${a.relaxed?.query} want ${rq}`);
        return a;
      };
      let asked = 0;
      for (let j = 0; j < N; j++) {
        const e = pick(idx);
        const raw = growerQuery(e, idx);
        const n = pick([60, 60, 60, 3, 5, 6, 100, 1 + rnd(100)]);
        const a = await answerOf(raw, n);
        asked++;
        if (!a) continue;
        if (a.relaxed && relaxed.length < 400) relaxed.push({ q: raw, relaxed: a.relaxed.query, top: a.hits.slice(0, 3).map((h) => h.name), asked: e.name });
        if (j % 5 === 0) {
          const base = JSON.stringify(a.hits.slice(0, 10).map((h) => h.key));
          for (const s of spellings(raw).slice(1)) {
            const b = await answerOf(s, n);
            asked++;
            if (!b) continue;
            const other = JSON.stringify(b.hits.slice(0, 10).map((h) => h.key));
            if (other !== base && twoSpell.length < 400) twoSpell.push({ a: raw, b: s, ra: a.hits.slice(0, 3).map((h) => h.name), rb: b.hits.slice(0, 3).map((h) => h.name) });
          }
        }
      }
      if (process.env.REV_OUT) writeFileSync(`${process.env.REV_OUT}/rev-fuzz-${seed}.json`, JSON.stringify({ asked, mism, relaxed, twoSpell }, null, 1));
      console.log(`seed ${seed}: ${asked} queries, ${mism.length} mismatches, ${relaxed.length} relaxed, ${twoSpell.length} spelling differences`);
      expect(mism).toEqual([]);
    }, 1_800_000);
  }
});
