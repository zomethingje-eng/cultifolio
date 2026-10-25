/**
 * Round eighty-three (K): a merged page's kept page comes first for the merged name (round eighty-two's "For the owner to
 * decide"; the owner said go).
 *
 * "Echeveria peacockii" listed Dudleya pulverulenta first and Echeveria desmetiana second: both hold the name exactly (Kew's
 * file files the bare name under Dudleya, and E. desmetiana holds it since round eighty-two because the page of that name
 * was merged into it), so the alphabet decided. Now:
 *
 * 1. The index marks the kept page with the names of the pages merged into it (`merged`, `mergedNamesOf`): the other
 *    keys it reads that came with an old address (`occurrences.keys[].slug`), and only those; written by the real builder
 *    at `--index`, which says which names it marked; an entry with none is written as before.
 * 2. The search puts the kept page first among the holders of such a name typed as a name (`mergedTyped`, `olderOrder`):
 *    "Echeveria peacockii" and "Echeveria peacoc" are E. desmetiana, then Dudleya; "Bisnaga hamatacantha" Ferocactus
 *    hamatacanthus before a holder the alphabet put first. Never by a word alone or a similar spelling, and never before
 *    a page of that very name (while the merged page is still on disk, between (d)'s online line and its prune).
 * 3. The key files answer as the whole index does, and carry the mark as the doc's eleventh field; a species with none
 *    writes the doc it wrote before.
 * 4. The rows say why: "Echeveria peacockii is merged into this page" (`mergedOf`, `mergedSentence`), on the kept page's
 *    row only, and only for the name typed as the search reads it.
 *
 * FAILS on r83base: `mergedNamesOf`, `mergedTyped`, `mergedOf` and `mergedSentence` do not exist; the builder writes no
 * `merged`; and the order is the alphabet's (Dudleya pulverulenta first for "Echeveria peacockii", the fictional
 * Ancistrocactus first for "Bisnaga hamatacantha"). Checked by running this file on a checkout of r83base.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IndexEntry } from '$lib/server/dossiers';
import * as entryLib from '$dossier/index-entry';
import * as searchLib from '$core/search';
import { buildSearchFiles, searchFromFiles, type SearchReader } from '$core/search-files';
import * as searched from '$lib/ui/ref/searched';
import { slugify } from '$core/names';
import type { PageId } from '$core/page-id';
import { synthIndex, reseed } from './helpers/corpus-synth';

const { prepare, search } = searchLib;
// Read by name, so that on the base the tests fail on what is missing rather than the file failing to load.
const mergedNamesOf = (entryLib as Record<string, unknown>).mergedNamesOf as (accepted: string, keys: unknown) => string[];
const mergedTyped = (searchLib as Record<string, unknown>).mergedTyped as (p: unknown, qs: string[]) => number[];
const mergedOf = (searched as Record<string, unknown>).mergedOf as (typed: string, hit: unknown) => string | null;
const mergedSentence = (searched as Record<string, unknown>).mergedSentence as (name: string) => string;

const root = resolve('.');
const at = (key: string, name: string, o: Partial<IndexEntry> = {}): IndexEntry => ({ key: key as PageId, slug: slugify(name), name, family: 'Crassulaceae', photos: 0, open: 0, climate: 'ok', ...o });
// The live index's pages of the case (round eighty-two's merge, k2781125 rebuilt reading 7530398), with others around them.
const DESMETIANA = at('k2781125', 'Echeveria desmetiana', { origin: ['Mexico Southwest'], syn: ['Cotyledon desmetiana', 'Echeveria subsessilis', 'Echeveria peacockii'], merged: ['Echeveria peacockii'] } as Partial<IndexEntry>);
const DUDLEYA = at('k2778991', 'Dudleya pulverulenta', { gbif: 2985894, origin: ['California', 'Mexico Northwest'], common: 'Chalk lettuce', syn: ['Cotyledon peacockii', 'Cotyledon pulverulenta', 'Echeveria argentea', 'Echeveria farinosa', 'Echeveria peacockii', 'Echeveria pulverulenta'], older: ['Sedum pulverulentum'], photos: 40 });
const FEROCACTUS = at('k2808164', 'Ferocactus hamatacanthus', { family: 'Cactaceae', syn: ['Echinocactus hamatacanthus', 'Hamatocactus hamatacanthus', 'Bisnaga hamatacantha'], merged: ['Bisnaga hamatacantha'] } as Partial<IndexEntry>);
// Fictional: a page the alphabet puts first that holds the name exactly, with the same epithet (no such page is known).
const ANCISTRO = at('g9830001', 'Ancistrocactus hamatacanthus', { gbif: 9830001, family: 'Cactaceae', syn: ['Bisnaga hamatacantha', 'Echinocactus brevihamatus'] });
reseed(83);
const SYNTH = (synthIndex(400).idx as unknown as IndexEntry[]).map((e) => { const o: IndexEntry = { ...e }; if (o.common?.includes(', ')) { const [c, ...cs] = o.common.split(', '); o.common = c; o.commons = cs; } return o; });
const IDX: IndexEntry[] = [...SYNTH, DESMETIANA, DUDLEYA, FEROCACTUS, ANCISTRO].sort((a, b) => a.name.localeCompare(b.name));
const names = (q: string, idx = IDX) => search(prepare(idx), q).map((e) => e.name);

describe('1. the mark: the names of the pages merged into a page', () => {
  it('names each key that came with an old address, without its author, once, never the page\'s own name', () => {
    expect(typeof mergedNamesOf).toBe('function'); // base: undefined
    expect(mergedNamesOf('Echeveria desmetiana', [{ key: 7530398, name: 'Echeveria peacockii Croucher', slug: 'echeveria-peacockii' }])).toEqual(['Echeveria peacockii']);
    expect(mergedNamesOf('Ferocactus hamatacanthus', [{ key: 7281739, name: 'Bisnaga hamatacantha (Muehlenpf.) Orcutt', slug: 'bisnaga-hamatacantha' }])).toEqual(['Bisnaga hamatacantha']);
    // Echidnopsis cereiformis (k505095), with both Ceropegias merged into it; a key read by the extra keys' rule alone
    // (no old address) is no merge.
    expect(mergedNamesOf('Echidnopsis cereiformis', [{ key: 9574874, name: 'Ceropegia cereiformis (Hochst. ex A.Rich.) Bruyns', slug: 'ceropegia-cereiformis' }, { key: 9592399, name: 'Ceropegia nubica (N.E.Br.) Bruyns', slug: 'ceropegia-nubica' }, { key: 3577721, name: 'Echidnopsis nubica N.E.Br.' }, { key: 9574874, name: 'Ceropegia cereiformis', slug: 'ceropegia-cereiformis' }])).toEqual(['Ceropegia cereiformis', 'Ceropegia nubica']);
    expect(mergedNamesOf('Echeveria desmetiana', [{ key: 1, name: 'Echeveria desmetiana De Smet', slug: 'x' }])).toEqual([]);
    expect(mergedNamesOf('Aloe vera', undefined)).toEqual([]);
    expect(mergedNamesOf('Aloe vera', [{ key: 2, name: 'Aloe barbadensis Mill.', slug: '' }])).toEqual([]);
  });
});

describe('2. the search: the kept page first for the merged name', () => {
  it('"Echeveria peacockii", typed or being typed, is Echeveria desmetiana, then Dudleya pulverulenta', () => {
    expect(names('Echeveria peacockii').slice(0, 2)).toEqual(['Echeveria desmetiana', 'Dudleya pulverulenta']); // base: Dudleya first
    expect(names('echeveria peacoc').slice(0, 2)).toEqual(['Echeveria desmetiana', 'Dudleya pulverulenta']);
    expect(names('Echeveria peacockii Croucher').slice(0, 2)).toEqual(['Echeveria desmetiana', 'Dudleya pulverulenta']);
  });
  it('"Bisnaga hamatacantha" is Ferocactus hamatacanthus before a holder the alphabet put first', () => {
    expect(names('Bisnaga hamatacantha').slice(0, 2)).toEqual(['Ferocactus hamatacanthus', 'Ancistrocactus hamatacanthus']); // base: Ancistrocactus first
  });
  it('guard: never by a word alone, or by a similar spelling: the order there is as before', () => {
    const plain = IDX.map(({ merged: _m, ...e }) => e as IndexEntry);
    expect(names('peacockii')).toEqual(names('peacockii', plain));
    expect(names('Echeveria peacokii')).toEqual(names('Echeveria peacokii', plain));
    expect(typeof mergedTyped).toBe('function');
    expect(mergedTyped(prepare([DESMETIANA])[0], ['peacockii'])).toEqual([]);
  });
  it('guard: an index with no mark keeps the alphabet (the order the live site gives today)', () => {
    const plain = IDX.map(({ merged: _m, ...e }) => e as IndexEntry);
    expect(names('Echeveria peacockii', plain).slice(0, 2)).toEqual(['Dudleya pulverulenta', 'Echeveria desmetiana']);
  });
  it('a page of that very name, still on disk before the prune, stays first; the kept page next', () => {
    const before = [...IDX, at('g7530398', 'Echeveria peacockii', { gbif: 7530398, syn: ['Cotyledon desmetiana', 'Cotyledon peacockii', 'Echeveria desmetiana', 'Echeveria subsessilis'] })];
    expect(names('Echeveria peacockii', before).slice(0, 3)).toEqual(['Echeveria peacockii', 'Echeveria desmetiana', 'Dudleya pulverulenta']);
  });
  it('guard: the kept page\'s other older names, and its own name, rank as before', () => {
    const plain = IDX.map(({ merged: _m, ...e }) => e as IndexEntry);
    for (const q of ['Echeveria subsessilis', 'Echeveria desmetiana', 'Echeveria', 'Ferocactus hamatacanthus', 'Echinocactus hamatacanthus', 'Cotyledon peacockii']) expect(names(q), q).toEqual(names(q, plain));
  });
});

/** The key files of an index, read in memory as the Worker reads them from the bucket. */
function keyFiles(idx: IndexEntry[]) {
  const stored = new Map<string, string>();
  let n = 0;
  const hashes = new Map<string, string>();
  const b = buildSearchFiles(idx, prepare(idx), (s) => { let h = hashes.get(s); if (!h) hashes.set(s, (h = `h${n++}`)); return h; }, (h, body) => stored.set(h, body));
  const named = (x: string) => JSON.parse(b.named.get(x)!);
  const blocks = named('search/blocks.json');
  const r: SearchReader<IndexEntry> = {
    dirs: [...b.named.keys()].filter((k) => /^search\/\d+\.json$/.test(k)).length,
    dir: async (x) => named(`search/${x}.json`), node: async (h) => stored.get(h)!, answers: async (h) => JSON.parse(stored.get(h)!),
    genera: async () => new Set(named('search/genera.json')), tables: async () => named('search/tables.json'),
    photos: async (k) => JSON.parse(stored.get(blocks.photos[k])!), show: async (k) => JSON.parse(stored.get(blocks.show[k])!)
  };
  return { r, stored };
}

describe('3. the key files', () => {
  it('answer as the whole index does, the merged names among the queries', async () => {
    const { r } = keyFiles(IDX);
    const qs = ['Echeveria peacockii', 'echeveria peacoc', 'Echeveria peacockii Croucher', 'ECHEVERIA PEACOCKII', 'peacockii', 'Echeveria peacokii', 'Bisnaga hamatacantha', 'bisnaga hamata', 'hamatacantha', 'Bisnaga', 'Echeveria', 'Dudleya', 'Ferocactus hamatacanthus', 'Echeveria subsessilis', 'Cotyledon peacockii', 'chalk lettuce', ...IDX.flatMap((e) => [e.name, ...(e.syn ?? [])]).slice(0, 300)];
    let same = 0;
    for (const q of qs) {
      const f = await searchFromFiles(r, q, 100);
      if ('stop' in f || 'narrow' in f) continue;
      expect(f.hits.map((e) => e.name), q).toEqual(names(q).slice(0, 100));
      same++;
    }
    expect(same).toBeGreaterThan(300);
    const f = await searchFromFiles(r, 'Echeveria peacockii', 5);
    expect('hits' in f && f.hits[0].name).toBe('Echeveria desmetiana'); // base: Dudleya pulverulenta
  });
  it('carry the mark last in the kept page\'s doc, and write every other species\' doc as before', () => {
    const { stored } = keyFiles(IDX);
    const plain = keyFiles(IDX.map(({ merged: _m, ...e }) => e as IndexEntry)).stored;
    const docs = (m: Map<string, string>) => new Map([...m.values()].filter((s) => s.startsWith('[[')).flatMap((s) => (JSON.parse(s) as Array<[number, unknown[]]>).map(([i, d]) => [`${i}:${JSON.stringify(d.slice(0, 1))}`, JSON.stringify(d)] as const)));
    const a = docs(stored), b = docs(plain);
    const kept = IDX.findIndex((e) => e.key === 'k2781125');
    const doc = JSON.parse([...a].find(([k]) => k.startsWith(`${kept}:`))![1]) as unknown[];
    expect(doc[10]).toEqual(['Echeveria peacockii']); // base: no eleventh field
    expect(doc[8]).toEqual([]);
    for (const [k, v] of b) if (!k.startsWith(`${kept}:`) && !k.startsWith(`${IDX.findIndex((e) => e.key === 'k2808164')}:`)) expect(a.get(k), k).toBe(v);
  });
});

describe('4. the rows say why', () => {
  it('"Echeveria peacockii is merged into this page", on the kept page\'s row, for the name typed as a name', () => {
    expect(typeof mergedOf).toBe('function'); // base: undefined
    expect(mergedOf('Echeveria peacockii', DESMETIANA)).toBe('Echeveria peacockii');
    expect(mergedOf('echeveria peacoc', DESMETIANA)).toBe('Echeveria peacockii');
    expect(mergedOf('Echeveria peacockii Croucher', DESMETIANA)).toBe('Echeveria peacockii');
    expect(mergedOf('Bisnaga hamatacantha', FEROCACTUS)).toBe('Bisnaga hamatacantha');
    expect(mergedSentence('Echeveria peacockii')).toBe('Echeveria peacockii is merged into this page');
  });
  it('guard: nothing on another holder\'s row, for a word alone, another older name or the page\'s own name', () => {
    expect(mergedOf('Echeveria peacockii', DUDLEYA)).toBeNull();
    expect(mergedOf('peacockii', DESMETIANA)).toBeNull();
    expect(mergedOf('Echeveria subsessilis', DESMETIANA)).toBeNull();
    expect(mergedOf('Echeveria desmetiana', DESMETIANA)).toBeNull();
    // The other older names still say so, as before.
    expect(searched.olderNameOf('Echeveria peacockii', DUDLEYA)).toBe('Echeveria peacockii');
    expect(searched.olderNameOf('Echeveria subsessilis', DESMETIANA)).toBe('Echeveria subsessilis');
  });
});

/** A project folder: the Welwitschia fixture as these pages, with the real merge file (r82m-merge's). */
function folder(pages: Array<{ id: string; gbif?: number; name: string; authorship: string; synonyms?: string[]; keys?: unknown[] }>) {
  const dir = mkdtempSync(join(tmpdir(), 'r83k-'));
  const v3 = join(dir, 'static/s/v3');
  mkdirSync(v3, { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts/merged-pages.txt'), readFileSync('scripts/merged-pages.txt', 'utf8'));
  for (const p of pages) {
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k339841.json', 'utf8'));
    d.key = p.id;
    d.slug = slugify(p.name);
    d.name.scientific = p.name;
    d.name.authorship = p.authorship;
    d.name.family = 'Crassulaceae';
    d.name.genus = p.name.split(' ')[0];
    d.name.synonyms = p.synonyms ?? [];
    d.name.vernacular = [];
    delete d.name.kew;
    d.ids = p.gbif != null ? { gbif: p.gbif } : {};
    if (p.keys) d.occurrences.keys = p.keys; else delete d.occurrences.keys;
    writeFileSync(join(v3, `${p.id}.json`), JSON.stringify(d));
  }
  writeFileSync(join(dir, 'fake.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
  return { dir, v3 };
}
const build = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });

describe('1. the mark, on the real builder', () => {
  it('--index marks the kept page with the old name, says so, and leaves every other entry as it was', () => {
    const { dir, v3 } = folder([
      { id: 'k2781125', name: 'Echeveria desmetiana', authorship: 'De Smet ex É.Morren', synonyms: ['Cotyledon desmetiana (De Smet ex É.Morren) Hemsl.', 'Echeveria subsessilis Rose'], keys: [{ key: 7530398, name: 'Echeveria peacockii Croucher', kew: "the page merged here by the owner's decision (scripts/merged-pages.txt)", n: 7, from: 'download', slug: 'echeveria-peacockii' }] },
      { id: 'k2778991', gbif: 2985894, name: 'Dudleya pulverulenta', authorship: '(Nutt.) Britton & Rose', synonyms: ['Echeveria peacockii Croucher', 'Echeveria pulverulenta Nutt.'], keys: [{ key: 5690759, name: 'Cotyledon peacockii (Croucher) Baker', kew: "Kew's file holds it as Cotyledon peacockii", n: 0, from: 'download' }] }
    ]);
    const r = build(dir, '--index');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('1 name of pages merged into another marked on the kept page, which the search lists first for it: Echeveria peacockii → Echeveria desmetiana'); // base: no such line
    const idx = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<IndexEntry & { merged?: string[] }>;
    const kept = idx.find((e) => e.key === 'k2781125')!;
    expect(kept.merged).toEqual(['Echeveria peacockii']); // base: undefined
    expect(kept.syn).toEqual(['Cotyledon desmetiana', 'Echeveria subsessilis', 'Echeveria peacockii']);
    // In the entry's place, after the older names and before the day it changed.
    const ks = Object.keys(kept);
    expect(ks.indexOf('merged')).toBeGreaterThan(ks.indexOf('syn'));
    if (ks.includes('changed')) expect(ks.indexOf('merged')).toBeLessThan(ks.indexOf('changed'));
    expect(idx.find((e) => e.name === 'Dudleya pulverulenta')!.merged).toBeUndefined();
    expect(search(prepare(idx), 'Echeveria peacockii').map((e) => e.name)).toEqual(['Echeveria desmetiana', 'Dudleya pulverulenta']);
  });
  it('guard: a corpus whose kept page is not yet built with its merge (the PC mid-fill) has no mark and no line', () => {
    const { dir, v3 } = folder([{ id: 'g7530398', gbif: 7530398, name: 'Echeveria peacockii', authorship: 'Croucher', synonyms: ['Echeveria desmetiana De Smet'] }, { id: 'k2778991', gbif: 2985894, name: 'Dudleya pulverulenta', authorship: '(Nutt.) Britton & Rose', synonyms: ['Echeveria peacockii Croucher'] }]);
    const r = build(dir, '--index');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('marked on the kept page');
    const idx = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<IndexEntry & { merged?: string[] }>;
    expect(idx.every((e) => e.merged === undefined)).toBe(true);
    expect(search(prepare(idx), 'Echeveria peacockii').map((e) => e.name)[0]).toBe('Echeveria peacockii');
  });
});


describe('the about pages say it', () => {
  it('/about/how gives the order and the row\'s words; /about/formats names the field', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain('lists the page it was merged into first, before every other species that holds the name as an older name (Echeveria peacockii is Echeveria desmetiana, then Dudleya pulverulenta'); // base: not said
    expect(how).toContain('says "Echeveria peacockii is merged into this page"');
    expect(readFileSync('src/routes/about/formats/+page.svelte', 'utf8')).toContain('<code>merged</code>, the names of the pages merged into this one');
  });
});
