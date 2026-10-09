// Self-review of round sixty-one, corpus area: the postings path (with the relaxed retry) against the whole index, for the
// query shapes round sixty-one's author, hybrid and cultivar rules opened: "St."/"Mt." inside common names, three-letter
// epithets with real authors, "cf."/"aff."/"sp."/"spp.", trailing "hort.", "v."/"ssp." mid-name, abbreviated second parents
// ("Aloe vera x G. batesiana"), whole names in quotes, "×Gasteraloe", intergeneric formulas, trailing full stops.
// A GUARD: it PASSES on f4ab4f8 (0 mismatches over 2 seeds x 120 queries (720 spellings each) plus their spellings). It does not judge whether
// an answer is right, only that the postings answer what the whole index answers (see corpus--search-grower-shapes for that).
// Run: npx vitest run tests/unit/corpus--fuzz-new-paths.test.ts   (SEEDS=1,2,3 FUZZ_N=1000 for a longer run)
import { describe, it, expect } from 'vitest';
import { searchAnswer, _forgetIndex } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search, relaxedQuery } from '$core/search';
import { _clean } from '../../src/routes/api/search/+server';
import { synthIndex, rnd, pick, reseed, AUTHORS, GENUS_NAMES } from './helpers/corpus-synth';

function platformFor(idx: object[]) {
  const { manifest, files } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)]]);
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  const store = { get: async (k: string) => (blobs.has(k) ? obj(blobs.get(k)!, `"${k}"`) : null), head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
  return { env: { STORE: store } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
type E = { key: number; slug: string; name: string; common?: string; commons?: string[]; syn?: string[] } & Record<string, unknown>;

const DOTTED_COMMON = ['Lily of St. James', 'Cross of St. Andrew', 'Mt. Hamilton dudleya', 'Rose of Mt. Atlas', 'St. Catherine\'s lace', 'Queen of Mt. Kenya'];
const THREE = ['rex', 'lux', 'nox', 'pax', 'eos'];
const ODD = ['cf.', 'aff.', 'sp.', 'spp.', 'sp', 'cf', 'hort.', 'v.', 'ssp.', 'nothosubsp.', 'agg.', 's.l.', 'etc.', 'nov.'];
const QUO: Array<[string, string]> = [['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’']];

function withExtras(idx: E[]): E[] {
  let k = 50_000_000;
  const extra: E[] = [];
  for (const c of DOTTED_COMMON) extra.push({ key: k++, slug: `x${k}`, name: `${pick(GENUS_NAMES)} ${pick(['dotted', 'saint', 'montana'])}${k}`, common: c, open: 1, photos: 1, climate: 'ok' });
  for (const t of THREE) extra.push({ key: k++, slug: `x${k}`, name: `${pick(GENUS_NAMES)} ${t}`, open: 1, photos: 1, climate: 'ok' });
  extra.push({ key: k++, slug: `x${k}`, name: 'Gasteria disticha', syn: ['Aloe disticha'], open: 1, photos: 1, climate: 'ok' });
  extra.push({ key: k++, slug: `x${k}`, name: '× Gasteraloe beguinii', open: 1, photos: 1, climate: 'ok' });
  return [...idx, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

function shape(e: E, idx: E[]): string {
  const [g, ep = 'humilis'] = e.name.replace(/^× /, '').split(' ');
  const other = pick(idx).name.replace(/^× /, '').split(' ');
  const [a, b] = pick(QUO);
  switch (rnd(16)) {
    case 0: return `${a}${e.name}${b}`;
    case 1: return `${g} ${ep} x ${other[0][0]}. ${other[1] ?? ''}`;
    case 2: return `${g} ${ep} × ${other[0]} ${other[1] ?? ''}`;
    case 3: return `${g} x ${other[0]}`;
    case 4: return `${g} ${pick(ODD)} ${ep}`;
    case 5: return `${g} ${ep} ${pick(ODD)}`;
    case 6: return `${g} ${ep} ${pick(ODD)} ${pick(AUTHORS)}`;
    case 7: return `${g} ${pick(THREE)} ${pick(AUTHORS)}`;
    case 8: { const c = pick(DOTTED_COMMON); return pick([c, c.toLowerCase(), c.toUpperCase()]); }
    case 9: return `${g} ${ep} ${pick(['columna-alba', 'truncata', 'major'])}.`;
    case 10: return `×${g}`;
    case 11: return `${g[0]}. ${a}${pick(['Perle von Nürnberg', 'Lola', 'Blue Elf'])}${b}`;
    case 12: return `${g} ${ep} v. ${other.pop()} ${pick(AUTHORS)}`;
    case 13: return `${g} ${a}${ep}${b} var. ${other.pop()}`;
    case 14: return `${g} ${ep} ${pick(AUTHORS)} x ${other[0][0]}. ${other[1] ?? ''} ${pick(AUTHORS)}`;
    default: return `${g} ${ep} ${pick(ODD)} ${pick(['LB 123', 'KK 1234', 'Mexico'])}`;
  }
}
const spell = (q: string) => [q, q.toLowerCase(), q.toUpperCase(), q.replace(/'/g, '’'), q.replace(/ x /g, ' × '), `${q} var.`];

const seeds = (process.env.SEEDS ?? '101,202').split(',').map(Number);
const N = Number(process.env.FUZZ_N ?? 120);
describe('corpus self-review 61: postings equal the whole index on the new rule paths', () => {
  for (const seed of seeds) it(`seed ${seed}`, async () => {
    reseed(seed);
    _forgetIndex();
    const idx = withExtras(synthIndex(9000).idx as E[]);
    const platform = platformFor(idx);
    const whole = prepare(idx);
    const mism: string[] = [];
    let asked = 0;
    for (let j = 0; j < N; j++) {
      for (const raw of spell(shape(pick(idx), idx))) {
        const q = _clean(raw);
        if (!/[\p{L}\p{N}]/u.test(q)) continue;
        const n = pick([3, 6, 60, 100]);
        const a = await searchAnswer(platform, noStatic, q, n, async () => null);
        if ('stop' in a) throw new Error('stopped');
        asked++;
        let want = search(whole, q, n);
        const rq = want.length ? null : relaxedQuery(q);
        if (rq) want = search(whole, rq, n);
        if (JSON.stringify(a.hits.map((h) => h.key)) !== JSON.stringify(want.map((h) => h.key))) mism.push(`${JSON.stringify(q)} n=${n}`);
        if ((a.relaxed?.query ?? null) !== (rq && want.length ? rq : null)) mism.push(`${JSON.stringify(q)} relaxed ${a.relaxed?.query} want ${rq}`);
      }
    }
    console.log(`seed ${seed}: ${asked} queries, ${mism.length} mismatches`);
    expect(mism).toEqual([]);
  }, 1_800_000);
});
