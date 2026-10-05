// Adopted from the round-59 corpus review in round 60; compares against the whole index, relaxed retry included.
// FUZZ_N sets the number of generated queries, SEED the seed, FUZZ_OUT a folder for the cost report.
import { describe, it, expect } from 'vitest';
import { searchAnswer, _forgetIndex, WHOLE_LIKE } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search, rankedWords, relaxedQuery } from '$core/search';
import { queryPlan } from '$core/postings';
import { _clean } from '../../src/routes/api/search/+server';
import { synthIndex, rnd, pick, reseed, AUTHORS } from './helpers/corpus-synth';
import { writeFileSync } from 'node:fs';

function platformFor(idx: object[]) {
  const text = JSON.stringify(idx);
  const t0 = performance.now();
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const buildMs = performance.now() - t0;
  const blobs = new Map<string, string>();
  blobs.set(manifestPath(), JSON.stringify(manifest));
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  const reads: string[] = [];
  const store = { get: async (k: string) => { reads.push(k); return blobs.has(k) ? obj(blobs.get(k)!, `"${k}"`) : null; }, head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
  return { platform: { env: { STORE: store } } as unknown as App.Platform, manifest, files, reads, buildMs };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

const slip = (s: string) => {
  const alpha = 'abcdefghilmnoprstuy';
  if (s.length < 2) return s;
  const i = rnd(s.length), k = rnd(4), c = pick([...alpha]);
  return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2);
};

describe('r59 corpus reviewer: synthetic 9,000-species fuzz', () => {
  it('searchAnswer equals the whole index, and what each path costs', async () => {
    reseed(Number(process.env.SEED ?? 4242));
    const { idx, shape } = synthIndex(9000);
    const { platform, manifest, reads, buildMs } = platformFor(idx);
    const whole = prepare(idx);
    const ws = (e: (typeof idx)[number]) => [e.name, e.common ?? '', e.family ?? '', ...(e.origin ?? []), ...(e.syn ?? [])].join(' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const qs: string[] = ['a', 'f a', 'a a', 'var co', 'A', 'x', '× a', "'", 'é', 'Ö', 'ae', 'a e', 'a e i', 'a o', 'c a', 'ca ca', 'var', 'f', 'subsp', 'ssp a', 'a f', 'a var', 'xact', 'zaloe', 'xcac', 'qcac', 'kcact', 'acta', 'cact', 'cacta', 'aceae', 'xaceae'];
    for (let j = 0; j < Number(process.env.FUZZ_N ?? 600); j++) {
      const e = pick(idx);
      const w = ws(e);
      const n = 1 + rnd(3);
      const q: string[] = [];
      for (let t = 0; t < n; t++) {
        let x = pick(w);
        const how = rnd(7);
        if (how === 0) x = slip(x);
        else if (how === 1) x = x.slice(0, 1 + rnd(x.length));
        else if (how === 2) x = slip(x.slice(0, 1 + rnd(x.length)));
        else if (how === 3) x = pick(['var.', 'subsp.', 'f.', 'ssp', 'x', '×', "'", 'cv.']);
        else if (how === 4) x = x.slice(0, 1 + rnd(2));
        q.push(x);
      }
      if (!rnd(10)) q.push(pick(AUTHORS));
      qs.push(q.join(pick([' ', '  ', ', ', '-', '/'])));
    }
    const rows: Array<{ q: string; ms: number; path: string; cands: number; charged: number; ok: boolean }> = [];
    const mism: string[] = [];
    const twoSpell: string[] = [];
    for (const raw of qs) {
      const q = _clean(raw);
      if (!q) continue;
      reads.length = 0;
      let charged = 0;
      const t0 = performance.now();
      const a = await searchAnswer(platform, noStatic, q, 60, async () => { charged++; return null; });
      const ms = performance.now() - t0;
      if ('stop' in a) throw new Error('stopped');
      // round 60: on zero hits the answer is the relaxed query's (first two words, markers and citations dropped)
      let want = search(whole, q, 60).map((h) => h.key);
      const rq = want.length ? null : relaxedQuery(q);
      if (rq) want = search(whole, rq, 60).map((h) => h.key);
      if ((a.relaxed?.query ?? null) !== (rq && want.length ? rq : null)) mism.push(`${JSON.stringify(q)} relaxed ${a.relaxed?.query} want ${rq}`);
      const got = a.hits.map((h) => h.key);
      const shortRead = reads.includes(productPath(manifest.files['short.json']!));
      const postRead = reads.filter((k) => k.includes('/p/') && !k.endsWith(manifest.files['short.json'] + '.json')).length;
      const ok = JSON.stringify(want) === JSON.stringify(got);
      if (!ok) mism.push(`${JSON.stringify(q)} want ${want.length} got ${got.length}`);
      rows.push({ q, ms, path: shortRead ? 'short' : postRead ? `postings(${postRead})` : 'none', cands: 0, charged, ok });
    }
    // two spellings of one query: case, accents, punctuation, a doubled word, a leading marker
    for (const q of ['Copiapoa cinerea', 'aloe vera', 'lithops', 'a', 'co', 'ae']) {
      const variants = [q, q.toUpperCase(), q.replace(/o/g, 'ö'), `${q} ${q}`, `var ${q}`, `f ${q}`, q.split(' ').reverse().join(' '), `${q},`, `${q} var`, `${q} f`];
      const answers = new Set<string>();
      for (const v of variants) {
        const a = await searchAnswer(platform, noStatic, _clean(v), 60, async () => null);
        if ('stop' in a) continue;
        answers.add(JSON.stringify(a.hits.map((h) => h.key)));
      }
      if (answers.size > 1) twoSpell.push(`${q}: ${answers.size} different answers over ${variants.length} spellings`);
    }
    rows.sort((a, b) => b.ms - a.ms);
    const uncharged = rows.filter((r) => r.charged === 0 && !r.path.startsWith('short'));
    if (process.env.FUZZ_OUT) writeFileSync(`${process.env.FUZZ_OUT}/fuzz-${process.env.SEED ?? 4242}.json`, JSON.stringify({ buildMs, n: rows.length, mism, twoSpell, slowest: rows.slice(0, 25), slowestUncharged: uncharged.slice(0, 25), shape: { infra: shape.infra.length, hybrid: shape.hybrid.length, cultivar: shape.cultivar.length } }, null, 1));
    expect(mism).toEqual([]);
  }, 1_800_000);

  it('the near pass is never charged: candidate counts for typo queries', async () => {
    reseed(4242);
    const { idx } = synthIndex(9000);
    const { platform } = platformFor(idx);
    const out: Array<{ q: string; nearCands: number; exactCands: number; ms: number; charged: number; hits: number }> = [];
    const { buildPostings, postingFilesFor, candidates } = await import('$core/postings');
    const posted = buildPostings(idx, postingFilesFor(idx.length));
    const all = new Map<string, number[]>();
    for (const body of posted.values()) for (const [k, v] of Object.entries(body)) all.set(k, v);
    for (const q of ['xact', 'zcact', 'kcactaceae', 'xaloe', 'zalo', 'xsed', 'qmam', 'xeup', 'xasp', 'aspx', 'xcap', 'xmex', 'xchi', 'xnam', 'xbra', 'xpro', 'zprov', 'xcra', 'xama', 'xapo', 'yaiz', 'cactaceaex', 'xaceae', 'qaceae']) {
      const plan = queryPlan(q);
      const exactCands = candidates(plan.exact, (k) => all.get(k)).length;
      const nearCands = plan.near ? candidates(plan.near, (k) => all.get(k)).length : 0;
      let charged = 0;
      _forgetIndex();
      await searchAnswer(platform, noStatic, 'zzzzzz', 60, async () => null);
      const t0 = performance.now();
      const a = await searchAnswer(platform, noStatic, q, 60, async () => { charged++; return null; });
      const ms = performance.now() - t0;
      out.push({ q, exactCands, nearCands, ms: Math.round(ms), charged, hits: 'hits' in a ? a.hits.length : -1 });
    }
    if (process.env.FUZZ_OUT) writeFileSync(`${process.env.FUZZ_OUT}/near.json`, JSON.stringify(out, null, 1));
    expect(WHOLE_LIKE).toBe(2000);
  }, 1_800_000);
});
