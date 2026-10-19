/**
 * Round seventy-eight's proof that the change of ids changes no answer (docs/SCALE-STUDY.md section 5; the owner's
 * decision 4): every address, slug, accepted and older name, GBIF key, catalogue row, the strip, the sitemap and every
 * dossier the API serves, asked of the Worker's own functions over a corpus, written down with each page named by its
 * GBIF key. Run once with round seventy-seven's code over the corpus of version 2 and once with this round's over the same
 * corpus rekeyed as version 3; the two files must be the same line for line (`compare`).
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r78-lookups.ts run <s/vN dir> <keys file> <out.jsonl>
 *   node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r78-lookups.ts keys <s/v2 dir> <keys file>
 *   node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r78-lookups.ts compare <before.jsonl> <after.jsonl>
 *
 * `keys` writes the list both runs ask, from the version 2 corpus: every slug, accepted name, older name (as written, in
 * lower case, as a slug and as the address reads it), each dossier synonym's plain form, each genus, every page's GBIF
 * key and every other GBIF key a page reads (`occurrences.keys`), and misses. The script runs under either code: where
 * this round's `Lookup.gbif` is there it is asked, else round seventy-seven's `species`, whose key was the GBIF key.
 * The dossier the API serves is compared without its id fields (the version, `key`, a photograph's `shared`, the range's
 * `via.page`, the stamp's fingerprint), each of which is named by GBIF key instead, so a move of id is still checked.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { corpusNow, _forgetIndex, type Loaded } from '$lib/server/dossiers';
import { lookupOf, addressOf, type Lookup } from '$lib/server/lookup';
import { catalogueRows, rowItemsOf, featuredOfCorpus } from '$lib/server/catalogue';
import { productPath } from '$dossier/manifest';
import { plainName, synonymKey } from '$dossier/lookups';
import { BYS, rowGroupsOf, type Chip } from '$dossier/catalogue';
import { slugify, genusOf, canonicalSynonym } from '$core/names';
import { nameFromSlug } from '$lib/server/synonyms';
import { resetRateLimits } from '$lib/server/sync';
import { GET as dossierGet } from '../../../src/routes/api/dossier/[key]/+server';

const [mode, ...args] = process.argv.slice(2);
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const md5 = (s: string) => createHash('md5').update(s).digest('hex');
type Entry = { key: number | string; gbif?: number; slug: string; name: string; syn?: string[]; older?: string[] };

if (mode === 'keys') {
  const [dir, out] = args;
  const idx = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as Entry[];
  const keys = new Set<string>(['', 'aloe', 'not-a-plant-zzz', 'aloe vera var. nosuch', 'x', '#1', '@1', 'k1', 'g1']);
  const addresses = new Set<string>(['aloe', 'copiapoa', 'not-a-plant-zzz', 'Copiapoa-cinerea', 'copiapoa_cinerea', 'Aloe%20vera', 'x-gasteraloe-beguinii', 'haworthia-attenuata-var-radula', 'nosuch-plant', 'cactus', 'a', '', 'k326701', 'g2746231', '2746231']);
  const gbifs = new Set<number>([1, 0, 99999999999]);
  const addKey = (s: string) => { keys.add(s); keys.add(s.toLowerCase()); keys.add(synonymKey(s)); keys.add(plainName(s)); const sl = slugify(s); keys.add(sl); addresses.add(sl); const n = nameFromSlug(sl); if (n) keys.add(n.toLowerCase()); };
  for (const e of idx) {
    keys.add(e.slug); addresses.add(e.slug); addKey(e.name);
    addresses.add(genusOf(e.name).toLowerCase());
    addresses.add(e.slug.toUpperCase().slice(0, 1) + e.slug.slice(1));
    for (const s of [...(e.syn ?? []), ...(e.older ?? [])]) addKey(s);
    const d = JSON.parse(readFileSync(`${dir}/${e.key}.json`, 'utf8')) as { ids: { gbif: number }; name: { synonyms?: string[] }; occurrences: { keys?: Array<{ key: number; slug?: string }> } };
    for (const s of d.name.synonyms ?? []) { const c = canonicalSynonym(s); if (c) addKey(c); }
    gbifs.add(d.ids.gbif);
    for (const x of d.occurrences.keys ?? []) { gbifs.add(x.key); if (x.slug) { keys.add(x.slug); addresses.add(x.slug); } }
  }
  // The other GBIF keys the list gives pages (scripts/extra-keys.txt), which no page holds as its own, and the merges' keys.
  for (const f of ['scripts/extra-keys.txt', 'scripts/merged-pages.txt']) if (existsSync(f)) for (const l of readFileSync(f, 'utf8').split('\n')) if (/^\d/.test(l)) for (const x of l.split('\t').slice(0, 2)) gbifs.add(Number(x));
  writeFileSync(out, JSON.stringify({ keys: [...keys], addresses: [...addresses], gbifs: [...gbifs] }));
  console.log(`${keys.size} keys, ${addresses.size} addresses, ${gbifs.size} GBIF keys → ${out}`);
} else if (mode === 'run') {
  const [dir, keysFile, out] = args;
  const { keys, addresses, gbifs } = JSON.parse(readFileSync(keysFile, 'utf8')) as { keys: string[]; addresses: string[]; gbifs: number[] };
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { v: number; files: Record<string, string>; built: string };
  const v = `s/v${manifest.v}/`;
  // R78_ALSO=<the other version's folder> puts that corpus in the bucket too, under its own version's prefix, as the bucket
  // holds both between this round's upload and its deploy; every read of it is counted (round seventy-seven's Worker must
  // make none).
  const also = process.env.R78_ALSO ? { dir: process.env.R78_ALSO, v: `s/v${(JSON.parse(readFileSync(`${process.env.R78_ALSO}/manifest.json`, 'utf8')) as { v: number }).v}/` } : null;
  let foreign = 0;
  const at = (k: string) => (also && k.startsWith(also.v) ? `${also.dir}/${k.slice(also.v.length)}` : `${dir}/${k.slice(v.length)}`);
  const has = (k: string) => { if (also && k.startsWith(also.v)) foreign++; return (k.startsWith(v) || (!!also && k.startsWith(also.v))) && existsSync(at(k)); };
  const store = {
    get: async (k: string) => { if (!has(k)) return null; const t = readFileSync(at(k), 'utf8'); return { text: async () => t, json: async () => JSON.parse(t), etag: `"${k}"`, body: t }; },
    head: async (k: string) => (has(k) ? { etag: `"${k}"` } : null)
  };
  const platform = { env: { STORE: store } } as unknown as App.Platform;
  _forgetIndex();
  const c: Loaded = await corpusNow(platform, noStatic);
  const look: Lookup = lookupOf(c, platform, noStatic);
  // Each page by its GBIF key, from the corpus's own index (version 3 names a page by id and carries `gbif`).
  const idx = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as Entry[];
  const gbifOf = new Map<unknown, number>(idx.map((e) => [e.key, e.gbif ?? (e.key as number)]));
  const g = (k: unknown) => (gbifOf.has(k) ? gbifOf.get(k) : k);
  const ref = (r: unknown) => (Array.isArray(r) ? [g(r[0]), ...r.slice(1)] : r);
  // A value with every page's id written as its GBIF key, and every `gbif` field (which is the key then) taken out.
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (!x || typeof x !== 'object') return x;
    const o: Record<string, unknown> = {};
    for (const [k, y] of Object.entries(x as Record<string, unknown>)) {
      if (k === 'gbif' && 'key' in (x as object)) continue;
      o[k] = k === 'key' ? ((x as { gbif?: number }).gbif ?? g(y)) : k === 'near' && Array.isArray(y) ? y.map(g) : k === 'holders' && Array.isArray(y) ? y.map(ref) : k === 'one' ? ref(y) : k === 'many' && Array.isArray(y) ? y.map(ref) : norm(y);
    }
    return o;
  };
  const rows: string[] = [];
  const put = (what: string, k: unknown, x: unknown) => rows.push(JSON.stringify([what, k, norm(x)]));
  const t0 = performance.now();
  for (const k of keys) {
    const s = await look.slug(k);
    put('slug', k, s == null ? null : g(s));
    put('accepted', k, ref(await look.accepted(k)));
    put('older', k, await look.older(k));
  }
  for (const a of addresses) put('address', a, await addressOf(look, a));
  const byGbif = (k: number) => ((look as Lookup & { gbif?: (k: number) => Promise<unknown> }).gbif ? (look as unknown as { gbif: (k: number) => Promise<unknown> }).gbif(k) : look.species(k as never));
  for (const k of gbifs) { const card = (await byGbif(k)) as Record<string, unknown> | null; put('gbif', k, card && { ...card, x: card.x ? Object.fromEntries(Object.entries(card.x as Record<string, unknown>).map(([n, r]) => [n, ref(r)])) : undefined }); }
  put('genera', '', [...(await look.genera())]);
  for (const by of BYS) for (const id of [...rowGroupsOf(idx as never, by, 'all').keys(), 'nosuch-row']) put('row', `${by}/${id}`, await look.row(by, id));
  for (const by of BYS) for (const chip of ['all', 'climate', 'noclimate', 'grown'] as Chip[]) {
    const cat = (await catalogueRows(platform, noStatic, by, chip, c)).cat;
    put('catalogue', `${by}/${chip}`, { rows: cat.rows, letters: cat.letters, letterAt: cat.letterAt, total: cat.total, withClimate: cat.withClimate });
    for (const id of rowGroupsOf(idx as never, by, 'all').keys()) put('opened', `${by}/${chip}/${id}`, await rowItemsOf(c, platform, noStatic, by, chip, id));
  }
  put('featured', '', await featuredOfCorpus(c, platform, noStatic));
  for (const [n, h] of Object.entries(manifest.files).filter(([n]) => /^sitemap\//.test(n))) put('sitemap', n, JSON.parse(readFileSync(at(productPath(h)), 'utf8')));
  // The API's dossier for every GBIF key: this round's answers a GBIF key with a move to the page's id, which is followed.
  const api = async (key: string): Promise<{ status: number; body: unknown; via?: string }> => {
    resetRateLimits();
    const url = new URL(`https://cultifolio.com/api/dossier/${key}`);
    let res: Response;
    try { res = await dossierGet({ params: { key }, platform, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.78', setHeaders: () => {} } as never); } catch (e) { return { status: (e as { status?: number }).status ?? 500, body: null }; }
    if (res.status === 302) { const to = res.headers.get('location')!.replace(/^\/api\/dossier\//, ''); const r = await api(to); return { ...r, via: 'moved' }; }
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  };
  // A dossier without its id fields, which are named by GBIF key beside it.
  const bare = (d: Record<string, unknown> | null) => {
    if (!d) return null;
    const o = structuredClone(d) as { v?: unknown; key?: unknown; changed?: { h?: string }; distribution?: { via?: { page?: string } }; photos?: Array<{ shared?: unknown[] }> };
    const ids = { key: g(o.key), via: o.distribution?.via?.page != null ? (o.distribution.via.page && /^[kg]/.test(o.distribution.via.page) ? g(o.distribution.via.page) : Number(o.distribution.via.page)) : null, shared: (o.photos ?? []).map((p) => (p.shared ?? []).map(g).sort((a, b) => Number(a) - Number(b))) };
    delete o.v; delete o.key;
    if (o.changed) delete o.changed.h;
    if (o.distribution?.via) delete o.distribution.via.page;
    for (const p of o.photos ?? []) delete p.shared;
    return { ids, hash: md5(JSON.stringify(o)) };
  };
  for (const k of gbifs) { const r = await api(String(k)); rows.push(JSON.stringify(['api', k, r.status, bare(r.body as Record<string, unknown> | null)])); }
  writeFileSync(out, rows.join('\n') + '\n');
  console.log(`${rows.length} answers in ${Math.round((performance.now() - t0) / 1000)} s → ${out}${also ? `; ${foreign} reads of the bucket's ${also.v}` : ''}`);
} else if (mode === 'compare') {
  const [a, b] = args.map((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean));
  if (a.length !== b.length) throw new Error(`${a.length} answers against ${b.length}`);
  const by = new Map<string, { n: number; same: number }>();
  const diffs: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const kind = JSON.parse(a[i])[0] as string;
    const t = by.get(kind) ?? { n: 0, same: 0 };
    by.set(kind, t);
    t.n++;
    if (a[i] === b[i]) t.same++;
    else if (diffs.length < 30) diffs.push(`  before: ${a[i].slice(0, 400)}\n  after:  ${b[i].slice(0, 400)}`);
  }
  const same = [...by.values()].reduce((n, t) => n + t.same, 0);
  console.log(`${a.length} answers: ${same} the same, ${a.length - same} different`);
  for (const [k, t] of by) console.log(`  ${k.padEnd(10)} ${String(t.n).padStart(7)} asked, ${String(t.same).padStart(7)} the same`);
  if (diffs.length) console.log(diffs.join('\n'));
  process.exit(diffs.length ? 1 : 0);
}
