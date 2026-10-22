/**
 * Round eighty (R): the pages without a GBIF key that read no key say why, for themselves, not one general sentence.
 * `noKeyFor` reads, by round seventy-three's rule and nothing else, what GBIF's backbone holds of the names Kew's file
 * gives the plant: GBIF files them under another page of the reference (GBIF lumps what Kew splits), holds none of them,
 * or holds them only as another type, pro parte or under another author. `scripts/kew-extra-keys.ts` writes it to
 * `scripts/extra-keys-kew-none.txt`; the build and `--fill kew-why` write it into the page (`occurrences.unread`), whose
 * species, plant and compare pages say it, and link the pages GBIF files the names under. Nothing is read by a name, and
 * a page with keys, or a page built before, says what it said.
 *
 * FAILED on r80base: `noKeyFor`, `formatNoKeys`, `parseNoKeys`, `noKeyWhy`, `uncheckedWhy`, `unreadOf`, `fillKewWhy` and
 * `scripts/extra-keys-kew-none.txt` did not exist, the schema dropped `occurrences.unread`, and every such page said
 * `NO_GBIF_WHY`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, noKeyFor, formatNoKeys, parseNoKeys, parseExtraKeys, type Usage, type Backbone, type NoKeyLine } from '$dossier/extra-keys';
import { buildKewDossier, unreadOf, fillKewWhy, type KewSpecies } from '$dossier/build-kew';
import { noKeyWhy, uncheckedWhy, uncheckedSentence, recordsUnchecked, NO_GBIF_WHY, NO_GBIF_CLIMATE } from '../../src/lib/core/no-gbif';
import { parseDossier, type Dossier } from '../../src/lib/dossier/schema';
import { parseSpeciesList } from '../../scripts/select-species-lib';
import type { FetchResult, JsonFetcher } from '../../src/lib/dossier/fetch';

const K = (id: string, name: string, authors: string, status: string, accepted: string, homotypic = false): KewRow => ({ id, name, authors, status, rank: 'Species', accepted, parent: '', powo: '', ...(homotypic ? { homotypic: true } : {}) });
// Abelia parvifolia Hemsl. as Kew's file holds it: a homotypic and a heterotypic name filed under it; Abelia uniflora apart.
const idx = new KewNamesIndex();
for (const r of [K('2609490', 'Abelia parvifolia', 'Hemsl.', 'Accepted', '2609490'), K('9000001', 'Linnaea parvifolia', '(Hemsl.) Christenh.', 'Synonym', '2609490', true), K('9000002', 'Abelia koehneana', 'Graebn.', 'Synonym', '2609490'), K('2609000', 'Abelia uniflora', 'R.Br.', 'Accepted', '2609000')]) idx.add(r);
const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number): Usage => ({ key, parent, status, rank: 'SPECIES', canonical, author, label });
const backbone = (usages: Usage[]): Backbone => ({
  usagesOf: (w) => usages.filter((u) => u.canonical.toLowerCase() === w),
  usage: (k) => usages.find((u) => u.key === k),
  lineage: (k) => { const u = usages.find((x) => x.key === k); return u && /SYNONYM/.test(u.status) && u.parent ? [k, u.parent] : [k]; },
  under: () => []
});
const page = { key: null, entry: '2609490', id: 'k2609490' };
const own = U(5599083, 'Abelia parvifolia Hemsl.', 'Abelia parvifolia', 'Hemsl.', 'SYNONYM', 2888001);
const het = U(7000002, 'Abelia koehneana Graebn.', 'Abelia koehneana', 'Graebn.', 'SYNONYM', 7777777);
const uniflora = U(2888001, 'Abelia uniflora R.Br.', 'Abelia uniflora', 'R.Br.', 'ACCEPTED', 3000);

describe('noKeyFor: why a page reads no key, by the rule\'s own steps', () => {
  it('lumped: GBIF files the plant\'s own name under another page of the reference; that page and the names are given', () => {
    const bb = backbone([own, het, uniflora]);
    expect(extraKeysFor(page, idx, bb, new Set([2888001]), new Map()).keys).toEqual([]);
    const r = noKeyFor(page, idx, bb, new Set([2888001]), new Map())!;
    expect(r).toEqual({ pageId: 'k2609490', kind: 'lumped', names: 3, usages: ['Abelia parvifolia Hemsl.'], under: [{ key: 2888001, names: ['Abelia parvifolia Hemsl.'] }], own: true });
  });
  it('a page the rule gives a key has no reason (null), so nothing is said where records are read', () => {
    const bb = backbone([U(5599083, 'Abelia parvifolia Hemsl.', 'Abelia parvifolia', 'Hemsl.', 'SYNONYM', 7777777)]);
    expect(noKeyFor(page, idx, bb, new Set([2888001]), new Map())).toBeNull();
  });
  it('none: the backbone holds no usage of any of Kew\'s three names', () => {
    expect(noKeyFor(page, idx, backbone([uniflora]), new Set([2888001]), new Map())).toEqual({ pageId: 'k2609490', kind: 'none', names: 3, usages: [] });
  });
  it('other-type: only a heterotypic name; other-author: the words only by another author; several reasons each named', () => {
    expect(noKeyFor(page, idx, backbone([het]), new Set(), new Map())).toMatchObject({ kind: 'other-type', usages: ['Abelia koehneana Graebn.'] });
    const oliv = U(5599999, 'Abelia parvifolia Oliv.', 'Abelia parvifolia', 'Oliv.', 'SYNONYM', 7777777);
    expect(noKeyFor(page, idx, backbone([oliv]), new Set(), new Map())).toMatchObject({ kind: 'other-author', usages: ['Abelia parvifolia Oliv.'] });
    const pp = U(7000009, 'Linnaea parvifolia (Hemsl.) Christenh.', 'Linnaea parvifolia', '(Hemsl.) Christenh.', 'PROPARTE_SYNONYM', 7777777);
    const r = noKeyFor(page, idx, backbone([het, pp, oliv]), new Set(), new Map())!;
    expect(r.kind).toBe('other-type');
    expect(r.parts?.map((p) => p.kind)).toEqual(['other-type', 'pro-parte', 'other-author']);
    expect(noKeyWhy(r)).toBe("GBIF's backbone holds this species' names only as names Kew's World Checklist files under this species as of another type (Abelia koehneana Graebn.), whose records are not read as this species', or as names that are partly another taxon's (Linnaea parvifolia (Hemsl.) Christenh.), whose records are no one species', or under another author than Kew's (Abelia parvifolia Oliv.), which is not read as Kew's name, so GBIF's records were not asked");
  });
});

describe('the words, and the file', () => {
  const lumped: NoKeyLine = { pageId: 'k2609490', kind: 'lumped', names: 3, usages: ['Abelia parvifolia Hemsl.'], under: [{ key: 2888001, names: ['Abelia parvifolia Hemsl.'], name: 'Abelia uniflora R.Br.', kew: true }], own: true };
  it('a lumped page names the page GBIF files it under, and says GBIF lumps what Kew splits only where Kew accepts that page\'s species', () => {
    expect(noKeyWhy(lumped)).toBe("GBIF's backbone files this species' own name (Abelia parvifolia Hemsl.) under Abelia uniflora R.Br., a species with its own page here, which Kew's World Checklist accepts apart from this one: GBIF lumps what Kew splits; GBIF's records under that name are on that page, and a record is shown on one page only, so they were not asked for this one");
    const legacy = noKeyWhy({ ...lumped, under: [{ ...lumped.under![0], kew: false }] });
    expect(legacy).not.toContain('lumps');
    expect(legacy).toContain('under Abelia uniflora R.Br., a species with its own page here; ');
    expect(noKeyWhy({ kind: 'none', names: 1, usages: [] })).toBe("GBIF's backbone does not hold the one name Kew's World Checklist gives this species, so there is no GBIF key to ask its records by, and no name is matched to GBIF");
    expect(noKeyWhy({ kind: 'other', names: 1, usages: [] })).toBe(NO_GBIF_WHY);
  });
  it('the file reads back; a line not of the file is not read', () => {
    const text = formatNoKeys([lumped], ['head']);
    expect(text.split('\n')[1].split('\t').slice(0, 2)).toEqual(['k2609490', 'lumped']);
    expect(parseNoKeys(text).get('k2609490')).toEqual(lumped);
    expect(parseNoKeys('k12\tbogus\t{}\nk13\tnone\tnot json\n2609490\tnone\t{"names":1,"usages":[]}\n').size).toBe(0);
  });
  // The merge (round eighty): the file made again on the list as it now is (agent X's held-range fix and the Gymnosporia
  // homonym, agent A's Xanthoceras line), beside the build's own scripts/extra-keys-kew.txt, which is kept as the build read
  // it. 921 pages read no key in the build; 909 have their reason here, and the other 12 are the pages whose lines became
  // keyless after that file was made, which the rule now gives keys the build's download did not ask (named in the header).
  it('scripts/extra-keys-kew-none.txt: 909 of the 921 that read no key, each once, none of them a page that reads keys', () => {
    const list = parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8'));
    const keyless = new Set(list.filter((e) => e.gbifKey == null).map((e) => e.pageId as string));
    const keyed = new Set(parseExtraKeys(readFileSync('scripts/extra-keys-kew.txt', 'utf8')).map((k) => k.pageId));
    const text = readFileSync('scripts/extra-keys-kew-none.txt', 'utf8');
    const none = parseNoKeys(text);
    expect(none.size).toBe(909);
    expect([...none.keys()].every((id) => keyless.has(id) && !keyed.has(id))).toBe(true);
    expect(keyless.size - keyed.size).toBe(921);
    const later = [...keyless].filter((id) => !keyed.has(id) && !none.has(id));
    expect(later).toHaveLength(12);
    const header = text.split('\n').find((l) => l.startsWith('# Twelve'))!;
    expect(later.every((id) => header.includes(id))).toBe(true);
    const kinds = new Map<string, number>();
    for (const l of none.values()) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
    expect(Object.fromEntries(kinds)).toEqual({ lumped: 643, none: 210, 'other-type': 46, 'other-author': 9, other: 1 });
    // every page GBIF files a lumped page's names under is a page of the list, named as the list names it
    const listKeys = new Set(list.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : [])));
    const lumps = [...none.values()].filter((l) => l.kind === 'lumped');
    expect(lumps.every((l) => l.under!.length && l.under!.every((h) => listKeys.has(h.key) && !!h.name))).toBe(true);
    expect(none.get('k2995662')).toMatchObject({ kind: 'lumped', own: true, under: [{ key: 3084127, name: 'Echinocereus viridiflorus Engelm.', kew: true }] });
  });
});

const parvifolia: KewSpecies = {
  id: '2609490', name: 'Abelia parvifolia', authors: 'Hemsl.', family: 'Caprifoliaceae', genus: 'Abelia', synonyms: [],
  range: [{ locationId: 'TDWG:CHC', locality: 'China South-Central', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }] as KewSpecies['range'], file: '2026-06-04'
};
const quiet = (async <T,>(): Promise<FetchResult<T>> => ({ status: 'skipped', detail: 'not asked here' })) as JsonFetcher;
const opts = { builtBy: 'node' as const, now: () => new Date('2026-10-21T00:00:00Z'), skip: ['wikidata', 'wikipedia', 'inat', 'commons'] as never, fetcher: quiet };
const line: NoKeyLine = { pageId: 'k2609490', kind: 'lumped', names: 3, usages: ['Abelia parvifolia Hemsl.'], under: [{ key: 2888001, names: ['Abelia parvifolia Hemsl.'], name: 'Abelia uniflora R.Br.', kew: true }], own: true };

describe('the page says it', () => {
  it('the builder writes the page\'s own reason into its records, its climate and occurrences.unread, which the schema keeps', async () => {
    const d = (await buildKewDossier(parvifolia, { ...opts, noKey: { line, pageOf: (k) => (k === 2888001 ? 'g2888001' : undefined) } }) as { ok: true; dossier: Dossier }).dossier;
    const why = noKeyWhy(line);
    expect(d.upstream['gbif.occurrences']).toMatchObject({ status: 'skipped', detail: why });
    expect(d.climate).toEqual({ status: 'pending', detail: `${why}; the habitat climate is read only from GBIF's records` });
    expect(d.upstream.climate.detail).toBe((d.climate as { detail?: string }).detail);
    expect(d.occurrences.unread).toEqual({ kind: 'lumped', why, under: [{ key: 2888001, name: 'Abelia uniflora R.Br.', page: 'g2888001' }] });
    expect(parseDossier(JSON.parse(JSON.stringify(d))).occurrences.unread).toEqual(d.occurrences.unread);
    expect(recordsUnchecked(d)).toBe(true);
    expect(uncheckedWhy(d)).toBe(why);
    expect(uncheckedSentence(d)).toBe(`${why.charAt(0).toUpperCase()}${why.slice(1)}.`);
    expect(d.ids.gbif).toBeUndefined();
  });
  it('guard: without the file the page says what round seventy-nine\'s build writes, byte for byte', async () => {
    const d = (await buildKewDossier(parvifolia, opts) as { ok: true; dossier: Dossier }).dossier;
    expect(d.upstream['gbif.occurrences']).toMatchObject({ status: 'skipped', detail: NO_GBIF_WHY });
    expect(d.climate).toEqual({ status: 'pending', detail: NO_GBIF_CLIMATE });
    expect('unread' in d.occurrences).toBe(false);
    expect(uncheckedWhy(d)).toBe(NO_GBIF_WHY);
  });
  it('--fill kew-why writes the same into a stored page, passes by a page that reads keys, and a second run changes nothing', async () => {
    const plain = (await buildKewDossier(parvifolia, opts) as { ok: true; dossier: Dossier }).dossier;
    const built = (await buildKewDossier(parvifolia, { ...opts, noKey: { line, pageOf: () => 'g2888001' } }) as { ok: true; dossier: Dossier }).dossier;
    const keyed = { ...plain, key: 'k9', occurrences: { ...plain.occurrences, keys: [{ key: 1, name: 'x', kew: 'y', n: 0, from: 'api' as const }] } };
    const files: Record<string, unknown> = { 'k2609490.json': JSON.parse(JSON.stringify(plain)), 'k9.json': keyed, 'g5.json': { ids: { gbif: 5 } } };
    const store = { files: () => Object.keys(files), read: <T,>(f: string) => JSON.parse(JSON.stringify(files[f])) as T, write: (f: string, d: unknown) => { files[f] = d; } };
    const c = fillKewWhy(store, new Map([['k2609490', line]]), () => 'g2888001');
    expect(c).toMatchObject({ read: 1, changed: 1, general: 0 });
    const d = files['k2609490.json'] as Dossier;
    expect(d.occurrences.unread).toEqual(built.occurrences.unread);
    expect(d.upstream['gbif.occurrences'].detail).toBe(built.upstream['gbif.occurrences'].detail);
    expect(d.climate).toEqual(built.climate);
    expect(files['k9.json']).toBe(keyed);
    expect(fillKewWhy(store, new Map([['k2609490', line]]), () => 'g2888001').changed).toBe(0);
    // a page the file no longer names says the general reason again
    expect(fillKewWhy(store, new Map()).changed).toBe(1);
    expect((files['k2609490.json'] as Dossier).upstream['gbif.occurrences'].detail).toBe(NO_GBIF_WHY);
  });
  it('unreadOf names a page by its id here only where the build knows it', () => {
    expect(unreadOf(line).under).toEqual([{ key: 2888001, name: 'Abelia uniflora R.Br.' }]);
    expect(unreadOf({ pageId: 'k1', kind: 'none', names: 2, usages: [] })).toEqual({ kind: 'none', why: noKeyWhy({ kind: 'none', names: 2, usages: [] }) });
  });
  it('the species and compare pages say the page\'s own reason; the species page links the pages GBIF files its names under', () => {
    const sp = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(sp).not.toMatch(/NO_GBIF_(WHY|SENTENCE)/);
    expect(sp).toContain('const noWhy = $derived(uncheckedWhy(d));');
    expect(sp).toContain('<div class="mapcap">{unchecked ? `Records not checked: ${noWhy}.`');
    expect(sp).toContain('<p class="small muted" id="kew-held-under">');
    const server = readFileSync('src/routes/species/[slug]/+page.server.ts', 'utf8');
    expect(server).toContain('const underIds = [...new Set((d.occurrences.unread?.under ?? []).map((u) => u.page)');
    expect(readFileSync('src/routes/compare/+page.svelte', 'utf8')).toContain('`Climate not checked. ${uncheckedSentence(d)}`');
    const build = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(build).toContain("noKey: kewNoKey.has(`k${j.kew}`) ? { line: kewNoKey.get(`k${j.kew}`)!, pageOf: idOfGbif } : undefined");
    expect(build).toContain("if (fill === 'kew-why') return fillKewWhyStep();");
    expect(readFileSync('scripts/kew-extra-keys.ts', 'utf8')).toContain("export const KEW_NO_KEYS = 'scripts/extra-keys-kew-none.txt';");
  });
  it('/about/how and /about/formats say it', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("The why is the page's own, read by the same rule from what GBIF's backbone holds of Kew's names for it (<code>scripts/extra-keys-kew-none.txt</code>)");
    expect(how).toContain('the page says GBIF lumps what Kew splits');
    expect(readFileSync('src/routes/about/formats/+page.svelte', 'utf8')).toContain('<code>occurrences.unread</code>');
  });
});

describe('the owner\'s plan', () => {
  it('scripts/corpus-plan-r80r.txt: a backup, the fill, a review, the upload and the live check; nothing asked of a source', async () => {
    const { parsePlan } = await import('../../scripts/corpus-step.mjs');
    const plan = parsePlan(readFileSync('scripts/corpus-plan-r80r.txt', 'utf8')) as Array<{ kind: string; args?: string }>;
    expect(plan.map((s) => s.kind)).toEqual(['backup', 'dossier', 'review', 'upload', 'live-check']);
    expect(JSON.stringify(plan[1])).toContain('--fill kew-why');
  });
});
