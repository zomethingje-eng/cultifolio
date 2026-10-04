/**
 * Round fifty-eight: the postings and the short answers against the whole index, adversarially (the server review's
 * generator: small alphabets so words collide, short words, digits, accents, rank markers anywhere, slips at every
 * position); one corpus held through a request while a refresh lands; the manifest read strictly; the home page's
 * window bounded.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { searchAnswer, _forgetIndex, corpusNow, product } from '$lib/server/dossiers';
import { isManifest } from '$dossier/manifest';
import { homeWindow, catalogueOf, HOME_WINDOW, HOME_ITEMS } from '$lib/server/catalogue';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { prepare, search } from '$core/search';
import { _clean } from '../../src/routes/api/search/+server';

let seed = 7;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = <T>(xs: T[]) => xs[rnd(xs.length)];

function storeFor(files: Map<string, string>) {
  const m = new Map(files);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  return {
    m,
    get: async (k: string) => (m.has(k) ? obj(m.get(k)!, `"${k}:${m.get(k)!.length}:${m.get(k)!.slice(0, 40)}"`) : null),
    head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}:${m.get(k)!.slice(0, 40)}"` } : null)
  };
}
function platformFor(idx: object[]) {
  const text = JSON.stringify(idx);
  const { manifest, files } = buildProducts(idx as never, text, () => new Map());
  const blobs = new Map<string, string>();
  blobs.set(manifestPath(), JSON.stringify(manifest));
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const store = storeFor(blobs);
  return { platform: { env: { STORE: store } } as unknown as App.Platform, manifest, store };
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
const never = async () => { throw new Error('whole-index fallback reached'); };

function corpus(alpha: string[], n: number) {
  const word = (min: number, max: number) => Array.from({ length: min + rnd(max - min + 1) }, () => pick(alpha)).join('');
  const markers = ['var.', 'subsp.', 'f.', 'ssp.', 'var', 'f'];
  return Array.from({ length: n }, (_, i) => {
    const parts = [word(1, 6), word(1, 7)];
    if (!rnd(4)) parts.push(pick(markers), word(1, 5));
    const name = parts.join(' ');
    return {
      key: i + 1,
      slug: `s-${i + 1}`,
      name,
      family: rnd(3) ? word(3, 9) : undefined,
      common: rnd(3) ? undefined : `${word(1, 5)}-${word(2, 6)}'s ${word(1, 4)}`,
      origin: rnd(2) ? [word(2, 6) + ' ' + word(1, 4)] : [],
      syn: rnd(3) ? undefined : [`${word(2, 5)} ${pick(markers)} ${word(1, 6)}`, `${word(1, 4)} ${word(1, 6)}`],
      open: 0
    };
  });
}
const slip = (s: string, alpha: string[]) => {
  if (!s.length) return s;
  const i = rnd(s.length), k = rnd(4), c = pick(alpha);
  return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2);
};
function queries(idx: ReturnType<typeof corpus>, alpha: string[], count: number) {
  const out: string[] = ['f', 'var', 'subsp', 'a var', 'ab subsp', 'subsp var f', 'f f f', 'var x', '1', 'zz9'];
  const ws = (e: (typeof idx)[number]) => [e.name, e.common ?? '', e.family ?? '', ...(e.origin ?? []), ...(e.syn ?? [])].join(' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let j = 0; j < count; j++) {
    const e = pick(idx);
    const w = ws(e);
    const n = 1 + rnd(3);
    const q: string[] = [];
    for (let t = 0; t < n; t++) {
      let x = pick(w);
      const how = rnd(6);
      if (how === 0) x = slip(x, alpha);
      else if (how === 1) x = x.slice(0, 1 + rnd(x.length));
      else if (how === 2) x = slip(x.slice(0, 1 + rnd(x.length)), alpha);
      else if (how === 3) x = Array.from({ length: 1 + rnd(6) }, () => pick(alpha)).join('');
      q.push(x);
      if (!rnd(6)) q.push(pick(['var', 'subsp', 'f', 'ssp', 'var.']));
    }
    if (!rnd(4)) q.push(pick(['var', 'subsp', 'f', 'ssp']));
    out.push(q.join(pick([' ', '  ', ', ', '/'])));
  }
  return out;
}

describe('the postings and the short answers equal the whole index (the server review)', () => {
  beforeEach(() => _forgetIndex());
  const cases: Array<[string, string[], number]> = [
    ['tiny alphabet', ['a', 'b', 'c'], 600],
    ['four letters and a digit', ['a', 'b', 'c', 'd', '1'], 900],
    ['accents and sharp s', ['a', 'é', 'b', 'ß', 'c', 'ö'], 600],
    ['wider', 'abcdefghijklmnop'.split(''), 1500]
  ];
  for (const [label, alpha, n] of cases) {
    // Three rounds of seven hundred queries over a corpus of fifteen hundred: seconds here, and past the 20 s default on a
    // cold Windows run (round fifty-nine; the second outside review).
    it(label, { timeout: 90_000 }, async () => {
      for (let round = 0; round < 3; round++) {
        _forgetIndex();
        const idx = corpus(alpha, n);
        const { platform } = platformFor(idx);
        const whole = prepare(idx);
        const qs = queries(idx, alpha, 700);
        const bad: unknown[] = [];
        for (const raw of qs) {
          const q = _clean(raw);
          if (!q) continue;
          const lim = pick([1, 3, 60, 100]);
          const a = await searchAnswer(platform, noStatic, q, lim, never);
          if ('stop' in a) throw new Error('stop');
          const got = a.hits.map((h) => h.key);
          const want = search(whole, q, lim).map((h) => h.key);
          if (JSON.stringify(got) !== JSON.stringify(want)) bad.push({ q, got, want });
        }
        expect(bad.slice(0, 5)).toEqual([]);
      }
    });
  }
});

describe('one corpus through a request (round fifty-eight; all three reviews)', () => {
  afterEach(() => vi.restoreAllMocks());
  const mk = (names: string[]) => names.map((name, i) => ({ key: 1000 + i, slug: name.toLowerCase().replace(/ /g, '-'), name, open: 0 }));
  const X = mk(['Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
  // one species added at the front, so every position in the postings moves by one
  const Y = mk(['Adenia globosa', 'Aloe vera', 'Copiapoa cinerea', 'Lithops lesliei', 'Haworthia cooperi']);
  it('a refresh landing between the index load and the posting reads answers from the corpus the request began with', async () => {
    _forgetIndex();
    const x = platformFor(X), y = platformFor(Y);
    const T0 = Date.UTC(2026, 9, 3, 12);
    vi.spyOn(Date, 'now').mockImplementation(() => T0);
    expect(((await searchAnswer(x.platform, noStatic, 'copiapoa', 60, never)) as { hits: { name: string }[] }).hits.map((h) => h.name)).toEqual(['Copiapoa cinerea']);
    for (const [k, v] of y.store.m) x.store.m.set(k, v); // the upload lands
    let calls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (calls++ === 0 ? T0 + 59_999 : T0 + 61_000)); // the minute ends inside the request
    const a = (await searchAnswer(x.platform, noStatic, 'copiapoa', 60, never)) as { hits: { name: string }[]; corpus: string };
    expect({ corpus: a.corpus, hits: a.hits.map((h) => h.name) }).toEqual({ corpus: x.manifest.id, hits: ['Copiapoa cinerea'] });
    // and the next request, past the minute, is the new corpus, whole
    vi.spyOn(Date, 'now').mockImplementation(() => T0 + 125_000);
    const b = (await searchAnswer(x.platform, noStatic, 'adenia', 60, never)) as { hits: { name: string }[]; corpus: string };
    expect({ corpus: b.corpus, hits: b.hits.map((h) => h.name) }).toEqual({ corpus: y.manifest.id, hits: ['Adenia globosa'] });
  });
  it('a product is read through the corpus the caller holds, not the one current at the read', async () => {
    _forgetIndex();
    const x = platformFor(X), y = platformFor(Y);
    const held = await corpusNow(x.platform, noStatic);
    for (const [k, v] of y.store.m) x.store.m.set(k, v);
    _forgetIndex();
    expect((await corpusNow(x.platform, noStatic)).corpus).toBe(y.manifest.id);
    const entries = (await product<Array<{ name: string }>>(held, x.platform, noStatic, 'index.json'))!;
    expect(entries.map((e) => e.name)).toEqual(X.map((e) => e.name));
  });
  it('a posting file that does not parse is a miss, and the whole index answers under the rate', async () => {
    _forgetIndex();
    const x = platformFor(X);
    for (const [k, v] of x.store.m) if (k.includes('/p/') && v.startsWith('{') && v.includes('"cop"')) x.store.m.set(k, '{"cop": [1,');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let asked = 0;
    const a = (await searchAnswer(x.platform, noStatic, 'copiapoa', 60, async () => { asked++; return null; })) as { hits: { name: string }[] };
    expect(a.hits.map((h) => h.name)).toEqual(['Copiapoa cinerea']);
    expect(asked).toBe(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe('the manifest is read strictly (round fifty-eight; the server review)', () => {
  const idx = Array.from({ length: 30 }, (_, i) => ({ key: i + 1, slug: `aloe-sp${i}`, name: `Aloe sp${i}`, open: 0 }));
  const { manifest } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  it('the build\'s manifest is one, with its short answers', () => {
    expect(isManifest(manifest)).toBe(true);
    expect(manifest.files['short.json']).toMatch(/^[0-9a-f]+$/);
  });
  it('a count that is not what the build would split the corpus into, a missing product, or a non-integer count is not', () => {
    expect(isManifest({ ...manifest, buckets: 64 })).toBe(false);
    expect(isManifest({ ...manifest, postings: 128 })).toBe(false);
    expect(isManifest({ ...manifest, species: 30.5 })).toBe(false);
    expect(isManifest({ ...manifest, species: 0 })).toBe(false);
    for (const name of ['index.json', 'entries/00.json', 'sheets/1f.json', 'postings/3f.json', 'catalogue/genus-all.json']) {
      const files = { ...manifest.files };
      delete files[name];
      expect({ name, ok: isManifest({ ...manifest, files }) }).toEqual({ name, ok: false });
    }
    // the short answers are optional: a manifest from before them is still read
    const files = { ...manifest.files };
    delete files['short.json'];
    expect(isManifest({ ...manifest, files })).toBe(true);
  });
});

describe('the home page\'s window is bounded (round fifty-eight; the server review)', () => {
  const idx = Array.from({ length: 900 }, (_, i) => ({ key: i + 1, slug: `g${String(i).padStart(3, '0')}-sp`, name: `G${String(i).padStart(3, '0')} sp`, open: 0, origin: ['Cape Provinces'] }));
  it('?at with ?open far below it never sends more than two windows, and the row opened outside it is not opened', () => {
    const cat = catalogueOf(idx as never, 'genus', 'all');
    const last = cat.rows[cat.rows.length - 1].id;
    const w = homeWindow(cat, new URLSearchParams(`at=1&open=${last}`));
    expect(w.end - w.start).toBeLessThanOrEqual(2 * HOME_WINDOW);
    expect(w.open).toBe('');
    const near = homeWindow(cat, new URLSearchParams(`open=${cat.rows[500].id}`));
    expect(near.open).toBe(cat.rows[500].id);
    expect(near.start).toBeLessThanOrEqual(500);
    expect(near.end).toBeGreaterThan(500);
  });
  it('an origin of hundreds of species is sent a part at a time, and a part that is not one is the first', () => {
    const cat = catalogueOf(idx as never, 'origin', 'all');
    const cape = cat.rows.find((r) => r.count === 900)!;
    expect(homeWindow(cat, new URLSearchParams(`open=${cape.id}&part=${HOME_ITEMS}`)).part).toBe(HOME_ITEMS);
    for (const part of ['1', '-240', String(HOME_ITEMS * 4), 'x']) expect(homeWindow(cat, new URLSearchParams(`open=${cape.id}&part=${part}`)).part).toBe(0);
  });
});
