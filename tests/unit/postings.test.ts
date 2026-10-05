/**
 * The search's postings (round fifty-six, 1): the keys a near match always shares, checked over every one-edit variant
 * of many words, and the candidates' answer checked against the whole index's on a varied synthetic corpus with typed
 * slips at every position. The same comparison was run against the real index (8,947 species, 1,521 queries: no
 * difference) when the round was written.
 */
import { describe, it, expect } from 'vitest';
import { wordKeys, nearKeys, exactKey, buildPostings, queryPlan, candidates, postingFileOf, postingFilesFor } from '$core/postings';
import { prepare, search, hasExact } from '$core/search';

/** mulberry32 (round sixty; the corpus review, 12): the LCG before lost its low bits, and its "random" corpus was narrow. */
let seed = 11;
const rnd = (n: number) => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const AB = 'abcdefghijklmnopqrstuvwxyz';
const variants = (q: string, alphabet: string) => {
  const out = new Set<string>();
  for (let i = 0; i <= q.length; i++) for (const c of alphabet) out.add(q.slice(0, i) + c + q.slice(i)); // insertion
  for (let i = 0; i < q.length; i++) out.add(q.slice(0, i) + q.slice(i + 1)); // deletion
  for (let i = 0; i < q.length; i++) for (const c of alphabet) out.add(q.slice(0, i) + c + q.slice(i + 1)); // substitution
  for (let i = 0; i + 1 < q.length; i++) out.add(q.slice(0, i) + q[i + 1] + q[i] + q.slice(i + 2)); // swap
  return out;
};

describe('the keys (round fifty-six, 1)', () => {
  it('every word one edit from a query word of four letters or more, with anything after it, shares a near key with it', () => {
    for (let t = 0; t < 300; t++) {
      const len = 4 + rnd(5);
      const q = Array.from({ length: len }, () => 'abcd'[rnd(4)]).join('');
      const qk = new Set(nearKeys(q));
      for (const v of variants(q, 'abcde')) for (const tail of ['', 'e', 'abc']) {
        const w = v + tail;
        if (w.length < 3) continue;
        expect({ q, w, shared: wordKeys(w).some((k) => qk.has(k)) }).toEqual({ q, w, shared: true });
      }
    }
  });
  it('every word a query word begins is posted under its exact key', () => {
    for (const [q, w] of [['a', 'aloe'], ['al', 'aloe'], ['alo', 'aloe'], ['aloe', 'aloe'], ['cop', 'copiapoa'], ['copia', 'copiapoa']]) expect(wordKeys(w)).toContain(exactKey(q));
  });
  it('every posting file is written, empty ones too, and the count grows with the corpus', () => {
    expect(postingFilesFor(9_000)).toBe(64);
    expect(postingFilesFor(50_000)).toBe(512);
    const p = buildPostings([{ name: 'Aloe vera' }], 64);
    expect(p.size).toBe(64);
    expect(p.get(postingFileOf('alo', 64))!.alo).toEqual([0]);
  });
});

describe('the candidates answer what the whole answers', () => {
  const syl = ['co', 'pi', 'a', 'po', 'lith', 'ops', 'ha', 'wor', 'thi', 'mam', 'mil', 'la', 'ri', 'echi', 'no', 'cer', 'eus', 'gas', 'te', 'tu', 'lis', 'ta', 'con', 'phy', 'tum', 'al', 'oe', 'sem', 'per', 'vi', 'vum'];
  const word = (n: number) => Array.from({ length: n }, () => syl[rnd(syl.length)]).join('');
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const places = ['Chile North', 'Cape Provinces', 'Mexico Central', 'Namibia', 'Madagascar', 'Canary Is.', 'Peru', 'Arizona'];
  const fams = ['Cactaceae', 'Aizoaceae', 'Asphodelaceae', 'Crassulaceae', 'Amaryllidaceae'];
  const genera = Array.from({ length: 60 }, () => cap(word(2 + rnd(2))));
  const idx = Array.from({ length: 2500 }, (_, i) => {
    const g = genera[rnd(genera.length)];
    const name = `${rnd(15) ? '' : '× '}${g} ${rnd(15) ? '' : '× '}${word(2 + rnd(2))}${rnd(6) ? '' : ` ${['var.', 'subsp.', 'f.', 'fo.', 'v.'][rnd(5)]} ${word(2)}`}`;
    return { key: i + 1, name, family: fams[rnd(fams.length)], origin: [places[rnd(places.length)]], common: rnd(5) ? undefined : `${word(2)} ${word(2)}`, commons: rnd(6) ? undefined : [`${word(2)} ${word(1)}`, `${word(3)}`], syn: rnd(4) ? undefined : [`${genera[rnd(genera.length)]} ${word(2)}`] };
  });
  const files = postingFilesFor(idx.length);
  const P = buildPostings(idx, files);
  const posting = (k: string) => P.get(postingFileOf(k, files))?.[k];
  const answer = (q: string) => {
    const plan = queryPlan(q);
    if (!plan.exact.length) return [];
    const pe = prepare(candidates(plan.exact, posting).map((i) => idx[i]));
    if (hasExact(pe, q)) return search(pe, q, 100);
    return plan.near ? search(prepare(candidates(plan.near, posting).map((i) => idx[i])), q, 100) : [];
  };
  const whole = prepare(idx);
  const slip = (s: string) => {
    const i = rnd(Math.min(s.length, 6)), k = rnd(4), c = AB[rnd(26)];
    return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2);
  };
  it('for names, slips at every position, prefixes, origins, families, older names and rank markers', () => {
    const qs = ['a', 'c', 'co', 'var', 'f', 'chile', 'hile', 'namibai', 'aizoaceae var', 'subsp', 'zzzz', 'x', 'x co', 'co x pi', 'cv', 'v', 'fo'];
    for (let j = 0; j < 600; j++) {
      const e = idx[rnd(idx.length)];
      const [g, sp] = e.name.split(' ');
      const pick = rnd(7);
      const q = pick === 0 ? slip(e.name) : pick === 1 ? slip(g) : pick === 2 ? g.slice(0, 1 + rnd(5)) : pick === 3 ? `${sp} ${slip(g)}` : pick === 4 ? slip(e.syn?.[0] ?? e.commons?.[0] ?? e.origin[0]) : pick === 5 ? `${g} ${['var', 'x', 'v.', 'subspecies', 'cv.'][rnd(5)]}` : slip(e.family);
      qs.push(rnd(8) ? q : `${q} (${AB[rnd(26)].toUpperCase()}.) ${AB[rnd(26)].toUpperCase()}${AB[rnd(26)]}`);
    }
    for (const q of qs) expect({ q, keys: answer(q).map((x) => x.key) }).toEqual({ q, keys: search(whole, q, 100).map((x) => x.key) });
  });
});
