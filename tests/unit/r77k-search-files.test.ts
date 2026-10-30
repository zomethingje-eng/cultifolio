/**
 * Round seventy-seven (K; docs/SCALE-STUDY.md section 6): the search from the build's key files ($core/search-files).
 * On a corpus of 2,300 species, every one of them from the Cape Provinces, so that some words are heavy (more than
 * `SEARCH_CAP` species) as "cape" and "provinces" are on the real corpus:
 *
 * 1. the search route answers the same through the key files as through the whole index, every hit in order, every
 *    field, the words searched and the similar-spelling mark, for names, prefixes, typing errors, common names, older
 *    names, several words and punctuation; the one difference is the designed one, a query of several words whose every
 *    word is heavy, which says `narrow` and no hits (and the page asks for another letter or word);
 * 2. under a manifest that names the key files, nothing reads the index or the postings: both shapes of /api/search,
 *    its retry and genus reading, the species 404's suggestions, the front page and /api/entries; the corpus holds no index;
 * 3. under a manifest without them (a corpus built before), the search reads the index as before and answers the same;
 * 4. a key file the bucket cannot give is a 503, never "nothing matches";
 * 5. the build is the same twice, and the files a corpus needs (`corpusHashes`) are every one the build stores.
 *
 * The real corpus is proved by scripts/dev/scale/r77-proof.ts (its output: scripts/dev/scale/results/r77-proof.txt).
 * FAILS on r77base: $core/search-files does not exist there, and the Worker read the index for every search.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { corpusNow, _forgetIndex, type IndexEntry } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath, hasSearchFiles, corpusHashes, type Manifest } from '$dossier/manifest';
import { searchFileNames, nearKeysOf, searchDirsFor, SEARCH_CAP, SEARCH_HITS, SEARCH_FLOOR, SEARCH_SPLIT, NEAR_CAP, RANK_CAP, PHOTO_BLOCK, SHOW_BLOCK } from '$core/search-files';
import { rankedWords } from '$core/search';
import { dossierPath } from '$dossier/schema';
import { resetRateLimits } from '$lib/server/sync';
import { narrowSentence, searchedSentence } from '$lib/ui/ref/searched';
import { load as speciesLoad } from '../../src/routes/species/[slug]/+page.server';
import { load as homeLoad } from '../../src/routes/+page.server';
import { GET as searchGet } from '../../src/routes/api/search/+server';
import { GET as entriesGet } from '../../src/routes/api/entries/+server';
import { synthIndex, reseed, rnd, pick } from './helpers/corpus-synth';
import { readFileSync } from 'node:fs';

reseed(77);
const IDX: IndexEntry[] = (synthIndex(2300).idx as unknown as IndexEntry[]).map((e) => {
  const common = (e.common ?? '').split(', ').filter(Boolean);
  const out: IndexEntry = { ...e, origin: ['Cape Provinces', ...(e.origin ?? []).filter((o) => o !== 'Cape Provinces')] };
  delete out.common;
  if (common.length) out.common = common[0];
  if (common.length > 1) out.commons = common.slice(1);
  return out;
});
const TEXT = JSON.stringify(IDX, null, 1);
const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));

type Built = ReturnType<typeof buildProducts>;
let built: Built;
beforeAll(() => { built = buildProducts(IDX, TEXT, () => new Map(), '2026-10-18T00:00:00Z'); }, 120_000);

/** A bucket over a map, counting the reads of each object; `refuse` names keys whose read throws (the index, under the key files). */
function bucket(m: Map<string, string>, refuse = new Set<string>()) {
  const reads: string[] = [];
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}:${m.get(k)!.length}"`, body: m.get(k)! });
  return { m, reads, get: async (k: string) => { reads.push(k); if (refuse.has(k)) throw new Error(`${k} was read`); return m.has(k) ? obj(k) : null; }, head: async (k: string) => (m.has(k) ? { etag: `"${k}:${m.get(k)!.length}"` } : null) };
}
/** The corpus as the build writes it: `files` (the key files named), `before` (a manifest built before them) or `whole` (the index alone, no manifest). */
function corpus(kind: 'files' | 'before' | 'whole', refuseIndex = false) {
  const m = new Map<string, string>();
  const p = built;
  let manifest: Manifest = p.manifest;
  if (kind === 'before') { const drop = new Set(searchFileNames(IDX.length)); manifest = { ...manifest, files: Object.fromEntries(Object.entries(manifest.files).filter(([n]) => !drop.has(n))) }; }
  if (kind === 'whole') m.set('s/v3/index.json', TEXT);
  else {
    m.set(manifestPath(), JSON.stringify(manifest));
    for (const [n, body] of p.files) m.set(productPath(p.manifest.files[n]), body);
    if (kind === 'files') for (const [h, body] of p.stored) m.set(productPath(h), body);
  }
  for (const x of IDX.slice(0, 5)) m.set(dossierPath(x.key), JSON.stringify({ ...template, key: x.key, slug: x.slug, name: { ...template.name, scientific: x.name } }));
  const indexPath = productPath(p.manifest.files['index.json']);
  const old = new Set(Object.entries(p.manifest.files).filter(([n]) => /^postings\/|^short\.json$/.test(n)).map(([, h]) => productPath(h)));
  return { manifest, store: bucket(m, refuseIndex ? new Set([indexPath, 's/v3/index.json']) : new Set()), indexPath, old };
}
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const platformOf = (store: ReturnType<typeof bucket>) => ({ env: { STORE: store } }) as unknown as App.Platform;
const routeEvent = (platform: App.Platform, path: string) => ({ params: {}, platform, fetch: noStatic, url: new URL(`https://cultifolio.com${path}`), request: new Request(`https://cultifolio.com${path}`), getClientAddress: () => '192.0.2.77', setHeaders: () => {} }) as never;
async function ask(platform: App.Platform, q: string, extra = '&n=100&shape=2') {
  resetRateLimits();
  const r = await searchGet(routeEvent(platform, `/api/search?q=${encodeURIComponent(q)}${extra}`));
  return { status: r.status, body: await r.text(), narrow: r.headers.get('x-search-narrow') };
}

beforeEach(() => { _forgetIndex(); resetRateLimits(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

/** The queries: the kinds the real proof asks, drawn from this corpus. */
function queries(): string[] {
  reseed(78);
  const out = new Set<string>();
  const slip = (s: string) => { const i = rnd(s.length), c = pick([...'aeiolnrst']); const k = rnd(4); return k === 0 ? s.slice(0, i) + c + s.slice(i) : k === 1 ? s.slice(0, i) + s.slice(i + 1) : k === 2 ? s.slice(0, i) + c + s.slice(i + 1) : s.slice(0, i) + (s[i + 1] ?? '') + s[i] + s.slice(i + 2); };
  for (let i = 0; i < 150; i++) { const e = pick(IDX); out.add(e.name); out.add(e.name.toLowerCase()); const [g, ep] = e.name.replace(/^× /, '').split(' '); out.add(`${slip(g)} ${ep ?? ''}`.trim()); out.add(`${g} ${slip(ep ?? 'xx')}`); }
  for (let i = 0; i < 60; i++) { const e = pick(IDX); for (let n = 1; n <= 6; n++) out.add(e.name.slice(0, n)); }
  for (const e of IDX.filter((x) => x.common).slice(0, 80)) { out.add(e.common!); out.add(slip(e.common!)); }
  for (const e of IDX.filter((x) => x.syn).slice(0, 60)) out.add(e.syn![0]);
  for (const q of ['cape', 'provinces', 'Cape Provinces', 'cape provinces', 'c a', 'a e', 'cape a', 'pro cape', 'cape aloe', 'aloe cape', 'cape province', 'provinses', 'Cape', '"cape"', 'cape.', 'Aloe vera', 'aloe verra', 'Aloe vera L.', "Echeveria 'Lola'", 'Echeveria Lola', 'Copiapoa cinerea var. columna-alba', 'mexico', 'Mexico Central', 'string of pearls', 'zzzz', 'x', 'aloe var', 'cape var', 'Euphorbia sp.', 'euphorbia milii', 'Haworthia attenuata']) out.add(q);
  return [...out];
}

describe('the search from key files (round seventy-seven)', () => {
  it('some words are heavy, as on the real corpus, and the manifest names the key files', () => {
    expect(hasSearchFiles(built.manifest)).toBe(true);
    expect(IDX.length).toBeGreaterThan(SEARCH_CAP);
    const top = JSON.parse(built.files.get('search/top.json')!);
    const dirs = searchFileNames(IDX.length).filter((n) => /^search\/\d+\.json$/.test(n)).map((n) => JSON.parse(built.files.get(n)!));
    const heavy = (k: string) => { for (const d of [top, ...dirs]) if (d[k]) return d[k][0] > SEARCH_CAP; return null; };
    expect(heavy('cap')).toBe(true);
    expect(heavy('cape')).toBe(true);
    expect(heavy('provinces')).toBe(true);
    expect(heavy('alo')).toBe(false);
    expect(nearKeysOf('aloe')).toEqual(['alo', 'loe', 'aoe', 'ale']);
  });

  it('answers as the whole index, rank for rank, but a query of several words every one of them heavy, which says so', async () => {
    const files = platformOf(corpus('files', true).store), whole = platformOf(corpus('whole').store);
    const qs = queries();
    const viaFiles: Array<Awaited<ReturnType<typeof ask>>> = [];
    for (const q of qs) viaFiles.push(await ask(files, q));
    _forgetIndex();
    const narrow: string[] = [], other: string[] = [];
    for (let i = 0; i < qs.length; i++) {
      const w = await ask(whole, qs[i]), f = viaFiles[i];
      // Round eighty: a heavy key's answers say how many of the matches they can list (`kept`), which the whole index,
      // listing all, never needs to; the rest of the answer is the same.
      const unkept = (b: string) => { try { const j = JSON.parse(b); delete j.kept; return JSON.stringify(j); } catch { return b; } };
      if (w.status === f.status && unkept(w.body) === unkept(f.body)) continue;
      if (JSON.parse(f.body).narrow === true && f.narrow === '1') narrow.push(qs[i]);
      else other.push(`${qs[i]}: files ${f.body.slice(0, 200)} whole ${w.body.slice(0, 200)}`);
    }
    expect(other).toEqual([]);
    expect(qs.length).toBeGreaterThan(900);
    // Queries of two words or more every one of them heavy ("cape provinces"); a word alone is answered from the heavy
    // key's own best answers ("cape"), and with a trailing rank marker from the marker's own key ("cape var"), unless it
    // is a typing error of a heavy word ("provinses"), whose similar spellings are as many as the word's own species.
    // "a e" and "c a" are answered here, "a" and "e" being light in this corpus; on the real one they are heavy.
    // Round eighty (review-w 6): a region of origin typed whole is answered from the build's own answers to it, as the
    // whole index answers it ("Cape Provinces", "cape provinces"); "cape province" is no region's name.
    expect(narrow.sort()).toEqual(['cape province', 'pro cape', 'provinses']);
    for (const q of narrow) expect(rankedWords(q).length > 1 || q === 'provinses').toBe(true);
  }, 240_000);

  it('never reads the index or the postings under a manifest that names the key files: every caller of the search', async () => {
    const { store, indexPath, old } = corpus('files', true);
    const platform = platformOf(store);
    const c = await corpusNow(platform, noStatic);
    expect(c.idx).toBeNull();
    const shapes: string[] = [];
    for (const q of ['aloe', 'cape', 'Cape.', 'cape provinces', 'pro cape', 'aloe verra', 'Copiapoa cinerea var. columna-alba', 'Echeveria Lola', 'Aloe vera L.', 'zzzz', 'c'])
      for (const extra of ['&n=100&shape=2', '&n=6', '']) { const r = await ask(platform, q, extra); shapes.push(`${q}${extra}:${r.status}`); expect(r.status).toBe(200); }
    // the plain list's shape says "narrow" in a header, as the picker, Compare and the front page read it
    const plain = await ask(platform, 'pro cape', '&n=6'); // round eighty: "cape provinces", a region typed whole, is answered
    expect([JSON.parse(plain.body), plain.narrow]).toEqual([[], '1']);
    // the species 404's three suggestions go through the search
    const ev = (slug: string) => { const url = new URL(`https://cultifolio.com/species/${slug}`); return { params: { slug }, platform, fetch: noStatic, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.7', locals: { corpus: c } } as never; };
    for (const slug of ['aloe-verra-nosuch', 'cape-provinces', 'mammillaria-elongatta']) await Promise.resolve().then(() => speciesLoad(ev(slug))).catch(() => null);
    // the front page, and a bucket's entries
    const home = { platform, fetch: noStatic, setHeaders: () => {}, url: new URL('https://cultifolio.com/'), cookies: { get: () => undefined }, request: new Request('https://cultifolio.com/'), locals: { corpus: c } } as never;
    await homeLoad(home);
    resetRateLimits();
    expect((await entriesGet(routeEvent(platform, `/api/entries?b=00&n=${c.buckets}`))).status).toBe(200);
    expect(store.reads.filter((k) => k === indexPath || k === 's/v3/index.json')).toEqual([]);
    expect(store.reads.filter((k) => old.has(k))).toEqual([]);
    expect((await corpusNow(platform, noStatic)).idx).toBeNull();
    // an entries file the bucket cannot give is a 503, never the index read whole for it
    for (const [n, h] of Object.entries(c.manifest!.files)) if (n.startsWith('entries/')) store.m.delete(productPath(h));
    _forgetIndex();
    resetRateLimits();
    expect(await Promise.resolve().then(() => entriesGet(routeEvent(platform, `/api/entries?b=01&n=${c.buckets}`))).then((r) => r.status, (e: { status?: number }) => e.status)).toBe(503);
    expect(store.reads.filter((k) => k === indexPath)).toEqual([]);
  }, 120_000);

  it('a corpus built before the key files is searched through its index, as before, and answers the same', async () => {
    const before = corpus('before');
    const platform = platformOf(before.store);
    const a = await ask(platform, 'aloe');
    expect(before.store.reads.filter((k) => k === before.indexPath).length).toBe(1);
    expect(before.store.reads.some((k) => before.old.has(k))).toBe(true);
    _forgetIndex();
    const b = await ask(platformOf(corpus('files', true).store), 'aloe');
    expect(a).toEqual(b);
  });

  it('a key file the bucket cannot give is a 503 that says so, never "nothing matches"', async () => {
    const { store } = corpus('files', true);
    for (const h of built.stored.keys()) store.m.delete(productPath(h));
    expect(await ask(platformOf(store), 'aloe').then((r) => r.status, (e: { status?: number }) => e.status)).toBe(503);
  });

  it('the about pages say what the code does (rule 5): the count, the hundred, the directories, the sentence', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8'), formats = readFileSync('src/routes/about/formats/+page.svelte', 'utf8');
    const cap = SEARCH_CAP.toLocaleString('en-GB');
    expect(how).toContain(`more than ${cap} species would have to be looked through for every word`);
    expect(how).toContain(`A beginning shared by more than ${cap} species has no file of its own`);
    expect(SEARCH_HITS).toBe(100);
    expect(how).toContain("the reference's own best hundred answers to that word alone");
    expect(how).toContain(`says "${narrowSentence('…')}"`);
    expect(how).toContain('The server never reads or holds the whole index');
    expect(how).not.toMatch(/which the server answers from its (?:own )?index/);
    expect(searchDirsFor(8947)).toBe(64);
    // Round eighty-four (review S's 6): the count by its rule, and at the live size, not round seventy-seven's sixty-four.
    expect(formats).toContain('The number of directory files is sixty-four, doubled while the species count is more than 160 times it, up to 4,096: 512 at 48,357 species.');
    expect(searchDirsFor(48_357)).toBe(512);
    expect(SEARCH_SPLIT).toBe(200);
    expect(how).toContain(`A beginning shared by more than ${SEARCH_SPLIT} species has files one letter longer too`);
    expect(formats).toContain(`every key of more than ${SEARCH_SPLIT} species.`);
    expect(formats).toContain(`begins words of more than ${cap} species, the answer is empty and carries <code>X-Search-Narrow: 1</code>. So it is when a typing error's similar spellings would mean reading more than ${NEAR_CAP.toLocaleString('en-GB')} species or ranking more than ${RANK_CAP.toLocaleString('en-GB')}.`);
    expect(how).toContain(`would mean looking through more than ${NEAR_CAP.toLocaleString('en-GB')} species or putting more than ${RANK_CAP.toLocaleString('en-GB')} in order`);
    expect(how).toContain(`kept apart, ${PHOTO_BLOCK.toLocaleString('en-GB')} to a file`);
    expect(how).toContain(`from files of ${SHOW_BLOCK} species each`);
    expect(formats).toContain(`${PHOTO_BLOCK.toLocaleString('en-GB')} to a file (<code>[count, …]</code>)`);
    expect(formats).toContain(`${SHOW_BLOCK} to a file (<code>[entry, …]</code>)`);
    expect(SEARCH_FLOOR).toBe(3);
  });

  it('a photograph fill rewrites no key file: only the counts, the show blocks and the answers it changes', () => {
    const fill = IDX.map((e, i) => (i % 50 === 7 ? { ...e, photos: e.photos + 1, thumb: `https://example.org/${i}.jpg`, credit: 'CC BY, someone else' } : e));
    const again = buildProducts(fill, JSON.stringify(fill, null, 1), () => new Map(), '2026-10-18T00:00:00Z');
    const keyFiles = (b: Built) => { const out = new Set<string>(); for (const [n, body] of b.files) if (/^search\/(?:top|\d+)\.json$/.test(n)) for (const e of Object.values(JSON.parse(body) as Record<string, unknown[]>)) if (typeof e[1] === 'string' && e[2] !== 1) out.add(e[1]); return out; };
    expect([...keyFiles(again)].sort()).toEqual([...keyFiles(built)].sort());
    // the directories change only where a heavy key's answers do (they name them by hash); the tables and genera not at all
    for (const n of ['search/genera.json', 'search/tables.json']) expect(again.manifest.files[n]).toBe(built.manifest.files[n]);
    const fresh = [...again.stored.keys()].filter((h) => !built.stored.has(h));
    const blocks = JSON.parse(again.files.get('search/blocks.json')!) as { photos: string[]; show: string[] };
    const answers = new Set<string>();
    for (const [n, body] of again.files) if (/^search\/(?:top|\d+)\.json$/.test(n)) for (const e of Object.values(JSON.parse(body) as Record<string, unknown[]>)) if (e[2] === 1) answers.add(e[1] as string);
    for (const h of fresh) expect(blocks.photos.includes(h) || blocks.show.includes(h) || answers.has(h)).toBe(true);
    expect(fresh.filter((h) => blocks.show.includes(h)).length).toBe(Math.ceil(IDX.length / 50)); // one show block per species changed: SHOW_BLOCK (16) to a block, and the changed species 50 apart
  }, 120_000);

  it('the front page asks for another letter or word, and says nothing else of a narrow answer', () => {
    expect(narrowSentence(' cape provinces ')).toBe('Too many species match “cape provinces” to list them all. Type another letter or another word to narrow it.');
    expect(searchedSentence('cape var', { narrow: true, relaxed: { query: 'cape' } }, [])).toBeNull();
  });

  it('the build is the same twice, and the files a corpus needs are every file it stores', () => {
    const again = buildProducts(IDX, TEXT, () => new Map(), '2026-10-18T00:00:00Z');
    expect(again.manifest).toEqual(built.manifest);
    expect([...again.stored.keys()].sort()).toEqual([...built.stored.keys()].sort());
    const all = new Map<string, string>([...[...built.files].map(([n, b]) => [built.manifest.files[n], b] as [string, string]), ...built.stored]);
    const { hashes, missing } = corpusHashes(built.manifest, (h) => all.get(h) ?? null);
    expect(missing).toEqual([]);
    expect([...hashes].sort()).toEqual([...new Set([...Object.values(built.manifest.files), ...built.stored.keys()])].sort());
    // a directory not to hand is said, so a prune stops rather than delete what it names
    expect(corpusHashes(built.manifest, () => null).missing.length).toBe(searchFileNames(IDX.length).length - 2); // all but genera.json and tables.json
  }, 120_000);
});
