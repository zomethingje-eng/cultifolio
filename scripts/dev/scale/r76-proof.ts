/**
 * Round seventy-six's proof on the real corpus (docs/SCALE-STUDY.md section 6): every name the Worker resolves answers
 * the same through the build's lookup files as through the maps over the whole index, and every dossier shows the same
 * photographs read with its stored judgement as with every name of the reference.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r76-proof.ts <corpus dir: s/v3 after --index>
 *
 * Round seventy-eight: a page is keyed by its id (`k<Kew plant_name_id>` or `g<GBIF key>`); the merges are listed by GBIF key
 * and applied by each page's `gbif`, and each page's own GBIF key is looked up too (the alias the card files hold).
 *
 * The corpus directory is read, never written. Two passes over the lookups:
 *   1. the corpus as it is on disk: its manifest, its files and its index;
 *   2. the same index with round seventy-three's two merges applied as the live corpus has them (the merged pages' entries
 *      gone, each one's name and older names joined to the page it joined, its old address an alias), built in memory,
 *      since the copy here is of round seventy-two, before the merges.
 * Prints one block of counts per comparison, and every difference (the first twenty of each).
 */
import { readFileSync, existsSync } from 'node:fs';
import { corpusNow, _forgetIndex, ambiguousSynonym, sharedOlderName, type Loaded, type IndexEntry } from '$lib/server/dossiers';
import { indexLookup, filesLookup, addressOf, type Lookup } from '$lib/server/lookup';
import { catalogueRows, rowItemsOf, featuredOfCorpus } from '$lib/server/catalogue';
import { buildProducts, type Alias } from '$dossier/products';
import { manifestPath, productPath, hasLookups, type Manifest } from '$dossier/manifest';
import { plainName, synonymKey, indexMaps } from '$dossier/lookups';
import { BYS, rowGroupsOf, type Chip } from '$dossier/catalogue';
import { slugify, genusOf, canonicalSynonym } from '$core/names';
import { nameFromSlug } from '$lib/server/synonyms';
import { parseDossier } from '$dossier/schema';
import { heldNamesOf } from '$dossier/photo-kind';
import type { PageId } from '$core/page-id';
import { sitemapUrls, sitemapDays, sitemapChunk, sitemapPart, lastmodOf, SITEMAP_CHUNK } from '$lib/server/sitemap';

const dir = process.argv[2];
if (!dir || !existsSync(`${dir}/manifest.json`)) { console.error('usage: r76-proof.ts <s/v3 directory with manifest.json>'); process.exit(2); }
const root = dir.replace(/\/s\/v\d+\/?$/, '');
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
/** As the page and the API carry a value: a field whose value is undefined is no field (JSON, and SvelteKit's own serialiser, read it as absent). */
const json = (x: unknown) => JSON.stringify(x);

type Tally = { label: string; n: number; same: number; diffs: string[] };
const tallies: Tally[] = [];
const tally = (label: string): Tally => { const t = { label, n: 0, same: 0, diffs: [] as string[] }; tallies.push(t); return t; };
const check = (t: Tally, what: string, a: unknown, b: unknown) => { t.n++; const x = json(a), y = json(b); if (x === y) t.same++; else if (t.diffs.length < 20) { let i = 0; while (x[i] === y[i]) i++; const from = Math.max(0, i - 120); t.diffs.push(`${what}\n      files: ${x.slice(from, from + 300)}\n      index: ${y.slice(from, from + 300)}`); } };
const report = (title: string) => {
  console.log(`\n== ${title}`);
  for (const t of tallies.splice(0)) console.log(`  ${t.label}: ${t.n} compared, ${t.same} the same, ${t.n - t.same} different${t.diffs.length ? `\n    ${t.diffs.join('\n    ')}` : ''}`);
};

/** A bucket over a map of keys to bodies, as R2 answers. */
function bucket(m: Map<string, string>) {
  let reads = 0;
  const obj = (k: string) => ({ text: async () => m.get(k)!, json: async () => JSON.parse(m.get(k)!), etag: `"${k}"`, body: m.get(k)! });
  return { reads: () => reads, get: async (k: string) => { reads++; return m.has(k) ? obj(k) : null; }, head: async (k: string) => (m.has(k) ? { etag: `"${k}"` } : null) };
}
/** A bucket over the corpus directory on disk. */
function diskBucket() {
  const m = new Map<string, string>();
  return bucket(new Proxy(m, { get: (t, p) => (p === 'has' ? (k: string) => existsSync(`${root}/${k}`) : p === 'get' ? (k: string) => readFileSync(`${root}/${k}`, 'utf8') : Reflect.get(t, p)) }) as Map<string, string>);
}

async function compareLookups(idx: IndexEntry[], files: Loaded, platform: App.Platform, synonymsOf: (k: PageId) => string[], aliases: readonly Alias[]) {
  const viaFiles: Lookup = filesLookup(files, platform, noStatic);
  const viaIndex: Lookup = indexLookup(idx);
  const held: Loaded = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'index', etag: null, fromStore: false, manifest: null, buckets: files.buckets };
  // Every key a request can look up: slugs, accepted names, older names in lower case, as slugs and as `synonymKey`, the
  // names an address's slug reads as, the plain forms of every dossier synonym, the merged pages' old addresses, and misses.
  const keys = new Set<string>(['', 'aloe', 'not-a-plant-zzz', 'aloe vera var. nosuch', 'x', '#1']);
  const addresses = new Set<string>(['aloe', 'copiapoa', 'not-a-plant-zzz', 'Copiapoa-cinerea', 'copiapoa_cinerea', 'Aloe%20vera', 'x-gasteraloe-beguinii', 'haworthia-attenuata-var-radula', 'nosuch-plant', 'cactus', 'a', '']);
  const addKey = (s: string) => { keys.add(s); keys.add(s.toLowerCase()); keys.add(synonymKey(s)); keys.add(plainName(s)); const sl = slugify(s); keys.add(sl); addresses.add(sl); const n = nameFromSlug(sl); if (n) keys.add(n.toLowerCase()); };
  for (const e of idx) {
    keys.add(e.slug); addresses.add(e.slug); addKey(e.name);
    addresses.add(genusOf(e.name).toLowerCase());
    addresses.add(e.slug.toUpperCase().slice(0, 1) + e.slug.slice(1));
    for (const s of [...(e.syn ?? []), ...(e.older ?? [])]) addKey(s);
    for (const s of synonymsOf(e.key)) { const c = canonicalSynonym(s); if (c) addKey(c); }
  }
  for (const a of aliases) { keys.add(a.slug); addresses.add(a.slug); }
  let t = tally('slug → key (the slug map)');
  for (const k of keys) check(t, k, await viaFiles.slug(k), await viaIndex.slug(k));
  t = tally('accepted name in lower case → species (`byName`)');
  for (const k of keys) check(t, k, await viaFiles.accepted(k), await viaIndex.accepted(k));
  t = tally('older name → its holder or holders (`bySynonym`, `ambiguous`, `sharedName`)');
  let one = 0, many = 0;
  for (const k of keys) { const a = await viaFiles.older(k); if (a && 'one' in a) one++; if (a && 'many' in a) many++; check(t, k, a, await viaIndex.older(k)); }
  console.log(`  (${keys.size} keys; of them ${one} older names held by one species and ${many} held by two or more)`);
  // And against the functions the round before read these through, as they stand (`ambiguousSynonym`, `sharedOlderName`, the maps).
  t = tally("older name, through round seventy-five's own functions (`ambiguousSynonym`, `sharedOlderName`, `bySynonym`), against the files");
  const maps = indexMaps(idx);
  for (const k of keys) {
    // `ambiguousSynonym` and `sharedOlderName` take a name as written and key it themselves (`synonymKey`); the redirect's map is read by its key as is.
    const amb = ambiguousSynonym(idx, k), one = maps.bySynonym.get(k);
    const many = await viaFiles.older(synonymKey(k)), a = await viaFiles.older(k);
    check(t, k, [many && 'many' in many ? { many: many.many, shared: many.shared } : null, a && 'one' in a ? { one: a.one, matched: a.matched } : null], [amb ? { many: amb.map((e) => [e.key, e.slug, e.name]), shared: sharedOlderName(idx, k) } : null, one ? { one: [one.entry.key, one.entry.slug, one.entry.name], matched: one.matched } : null]);
  }
  t = tally("slug and accepted name, through round seventy-five's maps (the slug map, `byName`), against the files");
  for (const k of keys) { const e = maps.byName.get(k); check(t, k, [await viaFiles.slug(k), await viaFiles.accepted(k)], [held.bySlug!.get(k) ?? null, e ? [e.key, e.slug, e.name] : null]); }
  t = tally('key → species (`byKey`: card, older names, nearest climates, place)');
  for (const e of idx) { const a = await viaFiles.species(e.key); check(t, String(e.key), a && { ...a, x: undefined }, await viaIndex.species(e.key)); } // `x` is the files' own (namedElsewhere, compared below)
  for (const k of ['k1', 'g1', 'k9999999999', 'g9999999999'] as PageId[]) check(t, k, await viaFiles.species(k), await viaIndex.species(k));
  t = tally("a page's own GBIF key → the species (`byGbif`, the card files' `@<key>`)");
  for (const e of idx) { const a = await viaFiles.gbif(e.gbif!); check(t, String(e.gbif), a && { ...a, x: undefined }, await viaIndex.gbif(e.gbif!)); } // `x` as above
  for (const k of [1, 0, 99999999999]) check(t, String(k), await viaFiles.gbif(k), await viaIndex.gbif(k));
  t = tally('genera and their counts');
  check(t, 'genera', [...(await viaFiles.genera())], [...(await viaIndex.genera())]);
  t = tally("a record's older names that are another species' accepted name (`namedElsewhere`)");
  let named = 0;
  for (const e of idx) {
    const names = [...new Set(synonymsOf(e.key).map((x) => canonicalSynonym(x)).filter((x): x is string => !!x && x !== e.name))].map(plainName);
    const a = await viaFiles.elsewhere(e.key, names);
    named += a.size;
    check(t, String(e.key), [...a], [...(await viaIndex.elsewhere(e.key, names))]);
  }
  console.log(`  (${named} such names on the pages)`);
  t = tally('catalogue row → its species (`row`)');
  for (const by of BYS) for (const id of [...rowGroupsOf(idx, by, 'all').keys(), 'nosuch-row']) check(t, `${by}/${id}`, await viaFiles.row(by, id), await viaIndex.row(by, id));
  t = tally('species address → what it names (`addressOf`: page, move, genus row, shared-name 404, older-name redirect, asked of GBIF)');
  const kinds = new Map<string, number>();
  for (const a of addresses) {
    const x = await addressOf(viaFiles, a);
    kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
    check(t, a, x, await addressOf(viaIndex, a));
  }
  console.log(`  (${addresses.size} addresses: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')})`);
  t = tally("the home page's opened row under each chip (`rowItemsOf`)");
  for (const by of BYS) for (const chip of ['all', 'climate', 'noclimate', 'grown'] as Chip[]) for (const id of rowGroupsOf(idx, by, 'all').keys()) check(t, `${by}/${chip}/${id}`, await rowItemsOf(files, platform, noStatic, by, chip, id), await rowItemsOf(held, platform, noStatic, by, chip, id));
  t = tally('the catalogue under each grouping and chip (`catalogueRows`; "Most grown" from the row files)');
  for (const by of BYS) for (const chip of ['all', 'climate', 'noclimate', 'grown'] as Chip[]) {
    const pick = (c: { rows: unknown; letters: unknown; letterAt: unknown; total: unknown; withClimate: unknown }) => ({ rows: c.rows, letters: c.letters, letterAt: c.letterAt, total: c.total, withClimate: c.withClimate });
    check(t, `${by}/${chip}`, pick((await catalogueRows(platform, noStatic, by, chip, files)).cat), pick((await catalogueRows(platform, noStatic, by, chip, held)).cat));
  }
  t = tally("the front page strip's pool (`featured.json`)");
  check(t, 'featured', await featuredOfCorpus(files, platform, noStatic), await featuredOfCorpus(held, platform, noStatic));
  t = tally('the sitemap files');
  const urls = sitemapUrls(idx), days = sitemapDays(idx), m = files.manifest!;
  for (let n = 1; (n - 1) * SITEMAP_CHUNK < urls.length; n++) {
    const store = (platform as unknown as { env: { STORE: ReturnType<typeof bucket> } }).env.STORE;
    const obj = await store.get(productPath(m.files[`sitemap/${n}.json`]));
    const part = obj ? (JSON.parse(await obj.text()) as { urls: string[]; days: Array<number | null> }) : { urls: [], days: [] };
    check(t, `sitemap-${n}.xml`, sitemapPart(part.urls, part.days, lastmodOf(m.built)), sitemapChunk(urls, n, lastmodOf(m.built), days));
  }
}

async function judgement(idx: IndexEntry[]) {
  const held = heldNamesOf(idx);
  const t = tally('dossier → the photographs its page shows (stored judgement, no names; against every name of the index)');
  let photos = 0, commons = 0, judged = 0, shownA = 0, wouldDiffer = 0, unreadable = 0;
  const strip = (x: { photos: unknown[] }) => x.photos.map((p) => { const { judged: _, ...rest } = p as Record<string, unknown>; return rest; });
  for (const e of idx) {
    const raw = JSON.parse(readFileSync(`${dir}/${e.key}.json`, 'utf8')) as { photos: Array<Record<string, unknown>> };
    photos += raw.photos.length;
    commons += raw.photos.filter((p) => p.src === 'commons').length;
    judged += raw.photos.filter((p) => p.judged).length;
    const bare = { ...raw, photos: raw.photos.map((p) => { const { judged: _, ...rest } = p; return rest; }) };
    let a, b, c;
    try { a = parseDossier(raw, null); b = parseDossier(bare, held); c = parseDossier(bare, null); } catch { unreadable++; continue; }
    shownA += a.photos.length;
    if (json(strip(c)) !== json(strip(b))) wouldDiffer++;
    check(t, `${e.key} ${e.name}`, strip(a), strip(b));
  }
  console.log(`  (${idx.length} dossiers${unreadable ? `, ${unreadable} failing the schema` : ''}; ${photos} photographs stored, ${commons} of them from Commons, ${judged} carrying a judgement; ${shownA} shown in all; without the judgement and without the names, ${wouldDiffer} pages would show other photographs, which is what the judgement is for)`);
}

const t0 = Date.now();
// 1. The corpus on disk.
{
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as Manifest;
  if (!hasLookups(manifest)) { console.error(`manifest ${manifest.id} names no lookup files: run --index with round seventy-six's build first`); process.exit(2); }
  const idx = JSON.parse(readFileSync(`${root}/${productPath(manifest.files['index.json'])}`, 'utf8')) as IndexEntry[];
  const store = diskBucket();
  const platform = { env: { STORE: store } } as unknown as App.Platform;
  _forgetIndex();
  const files = await corpusNow(platform, noStatic);
  console.log(`corpus ${files.corpus} on disk: ${idx.length} species, read through its lookup files: ${!files.idx}`);
  const syn = new Map<PageId, string[]>();
  for (const e of idx) syn.set(e.key, (JSON.parse(readFileSync(`${dir}/${e.key}.json`, 'utf8')) as { name: { synonyms?: string[] } }).name.synonyms ?? []);
  const readsBefore = store.reads();
  await compareLookups(idx, files, platform, (k) => syn.get(k) ?? [], []);
  console.log(`  (the index product was never read by the lookups: ${!files.idx}; ${store.reads() - readsBefore} bucket reads in all)`);
  report(`the corpus on disk (${manifestPath()} ${files.corpus})`);
  await judgement(idx);
  report('the stored photograph judgement');

  // 2. Round seventy-three's merges, applied to this copy as the live corpus has them.
  const merges = readFileSync('scripts/merged-pages.txt', 'utf8').split('\n').filter((l) => /^\d/.test(l)).map((l) => l.split('\t')).map(([from, to]) => ({ from: Number(from), to: Number(to) }));
  // The merges are by GBIF key; each page by its own (round seventy-eight).
  const gone = new Map(idx.filter((e) => merges.some((m) => m.from === e.gbif)).map((e) => [e.gbif!, e]));
  const merged = idx.filter((e) => !gone.has(e.gbif!)).map((e) => {
    const m = merges.find((x) => x.to === e.gbif);
    const away = m && gone.get(m.from);
    return away ? { ...e, syn: [...new Set([...(e.syn ?? []), away.name, ...(away.syn ?? [])])].slice(0, 6), older: [...new Set([...(e.older ?? []), ...(away.older ?? [])])] } : e;
  });
  const idOf = new Map(idx.map((e) => [e.gbif!, e.key]));
  const aliases: Alias[] = [...gone.values()].map((e) => ({ slug: e.slug, key: idOf.get(merges.find((m) => m.from === e.gbif)!.to)! }));
  const text = JSON.stringify(merged, null, 1);
  const p = buildProducts(merged, text, () => new Map(), manifest.built, aliases, (k) => syn.get(k));
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(p.manifest)], ...[...p.files].map(([n, body]) => [productPath(p.manifest.files[n]), body] as [string, string])]);
  const platform2 = { env: { STORE: bucket(blobs) } } as unknown as App.Platform;
  _forgetIndex();
  const files2 = await corpusNow(platform2, noStatic);
  console.log(`\nwith round seventy-three's merges (${aliases.map((a) => `${a.slug} → ${a.key}`).join(', ')}): ${merged.length} species, corpus ${files2.corpus} built in memory`);
  await compareLookups(merged, files2, platform2, (k) => syn.get(k) ?? [], aliases);
  for (const a of aliases) console.log(`  /species/${a.slug}: ${json(await addressOf(filesLookup(files2, platform2, noStatic), a.slug))}`);
  report("the corpus with round seventy-three's merges");
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
