/**
 * Round eighty-two, the merge (M). What the merge itself changed, each case failing on r82pc (the owner's tree, the FUZZY
 * hotfix reverted) unless marked a guard:
 *   - /about/how says the FUZZY rule as `judgeTaxon` keeps it (the independent review's 5; the revert): GBIF's correction
 *     of a misspelling to this very species takes a taxon, and one to another species is never read as this one's;
 *   - the owner's decision of 2026-10-23: Bisnaga hamatacantha (g7281739) merged into Ferocactus hamatacanthus (k2808164),
 *     as Echeveria peacockii into Echeveria desmetiana: the merge line, the ids, the line the build reads, the prune's
 *     wait, (d)'s repair key, and the index giving the kept page the old name (F's need: a page built from Kew's file did
 *     not hold it, so after the prune the search found it nowhere);
 *   - `--list-no-reason` leaves out a page that leaves by a merge (Bisnaga's range row was the review's case);
 *   - the species page says "Under another author" only of a name the record cites by another author than that page's own
 *     (S's need to U: 10 of 283 such names on round seventy-seven's corpus were cited by the other page's own author).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';
import { parseMerges, mergeKeys, mergedToPrune } from '$dossier/extra-keys';
import { pageIds } from '$dossier/page-ids';
import { slugify } from '$core/names';
import { gbifPage } from '$core/page-id';
import { load } from '../../src/routes/species/[slug]/+page.server';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';

const root = resolve('.');
const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');

describe("/about/how says GBIF's FUZZY rule as judgeTaxon keeps it (review 1's 5, the revert)", () => {
  it('names the correction of a misspelling to this very species among the ways a taxon of another name is taken', () => {
    expect(how).toContain("Or GBIF's backbone holds the name as this species, or corrects it as a misspelling to this very species (GBIF's fuzzy match: Othonna linearifolia, as Kew and iNaturalist spell the page's Othonna lineariifolia), while a correction to another species is never read as this one's.");
  });
  // The code the sentence is checked against (guards: so on r82pc too).
  const reference = referenceOf([{ key: 1, name: 'Othonna lineariifolia', family: 'Asteraceae' }, { key: 2, name: 'Othonna capensis', family: 'Asteraceae' }]);
  const s = { key: 1, scientific: 'Othonna lineariifolia', family: 'Asteraceae', own: ownNames({ scientific: 'Othonna lineariifolia' }), heldElsewhere: () => false, reference };
  const answering = (match: unknown) => (async (url: string) => (url.includes('/species/match') ? { status: 'ok', data: match } : { status: 'none', detail: 'nothing here' })) as unknown as JsonFetcher;
  it('guard: the correction to this species is taken, and said as GBIF holding the name as this species', async () => {
    const r = await judgeTaxon(answering({ usageKey: 1, speciesKey: 1, matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED' }), 'Othonna linearifolia', s);
    expect(r).toEqual({ status: 'ok', data: { take: true, why: 'GBIF holds Othonna linearifolia as this species' } });
  });
  it("guard: a correction to another species of the reference is not read as this one's", async () => {
    const r = await judgeTaxon(answering({ usageKey: 2, speciesKey: 2, matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED' }), 'Othonna capensiss', s);
    expect(r.status === 'ok' && r.data.take).toBe(false);
    expect(r.status === 'ok' && r.data.why).not.toMatch(/as this species/);
  });
});

describe("the owner's decision of 2026-10-23: Bisnaga hamatacantha into Ferocactus hamatacanthus", () => {
  const merges = parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8'));
  const m = merges.find((x) => x.from === 7281739);
  it('scripts/merged-pages.txt joins 7281739 to k2808164, nothing left out', () => {
    expect(m).toMatchObject({ from: 7281739, into: 0, intoPage: 'k2808164', name: 'Bisnaga hamatacantha' });
    expect(m!.except ?? []).toEqual([]);
  });
  it('the ids: g7281739 is merged away while k2808164 is on disk, and k2808164 keeps its Kew id', () => {
    const ids = pageIds([{ gbif: 7281739, entry: '' }, { entry: '2808164' }], merges);
    expect(ids.map((a) => [a.id, a.why])).toEqual([['g7281739', 'merged-away'], ['k2808164', 'kew']]);
  });
  it('the build reads 7281739 on k2808164 with its old address', () => {
    expect(mergeKeys(merges, [], slugify).find((k) => k.key === 7281739)).toMatchObject({ page: 0, pageId: 'k2808164', merged: 'bisnaga-hamatacantha', how: 'merged' });
  });
  it('the prune waits until k2808164 records the key with its old address', () => {
    const one = merges.filter((x) => x.from === 7281739);
    expect(mergedToPrune([{ key: 7281739, id: 'g7281739' }, { key: null, id: 'k2808164' }], one)).toEqual({ prune: [], waiting: ['Bisnaga hamatacantha [7281739] into k2808164'] });
    expect(mergedToPrune([{ key: 7281739, id: 'g7281739' }, { key: null, id: 'k2808164', occurrences: { keys: [{ key: 7281739, slug: 'bisnaga-hamatacantha' }] } }], one)).toEqual({ prune: [7281739], waiting: [] });
  });
  it('/about/how lists the merges as scripts/merged-pages.txt holds them (it still said Echeveria peacockii into Dudleya pulverulenta, and Ceropegia nubica into Ceropegia cereiformis)', () => {
    expect(how).toContain('Echeveria peacockii into Echeveria desmetiana');
    expect(how).toContain('Bisnaga hamatacantha into Ferocactus hamatacanthus, one type (Echinocactus hamatacanthus Muehlenpf.)');
    expect(how).toContain('Ceropegia nubica and Ceropegia cereiformis into Echidnopsis cereiformis');
    expect(how).not.toContain('Echeveria peacockii into Dudleya pulverulenta');
    expect(how).not.toContain('Ceropegia nubica into Ceropegia cereiformis');
  });
  it("(d)'s repair list rebuilds the page joined", () => {
    expect(readFileSync('scripts/r82-repair-keys.txt', 'utf8')).toMatch(/^k2808164 Ferocactus hamatacanthus$/m);
  });
});

/** A project folder: the Welwitschia fixture as these pages, with the real merge file. */
function folder(pages: Array<{ id: string; gbif?: number; name: string; authorship: string; synonyms?: string[]; keys?: unknown[]; upstream?: Record<string, unknown> }>) {
  const dir = mkdtempSync(join(tmpdir(), 'r82m-'));
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
    d.name.family = 'Cactaceae';
    d.name.genus = p.name.split(' ')[0];
    d.name.synonyms = p.synonyms ?? [];
    d.name.vernacular = [];
    delete d.name.kew;
    d.ids = p.gbif != null ? { gbif: p.gbif } : {};
    if (p.keys) d.occurrences.keys = p.keys;
    if (p.upstream) d.upstream = { ...d.upstream, ...p.upstream };
    writeFileSync(join(v3, `${p.id}.json`), JSON.stringify(d));
  }
  writeFileSync(join(dir, 'fake.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
  return { dir, v3 };
}
const build = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });

describe('the merged pages on the real builder', () => {
  const BISNAGA = { id: 'g7281739', gbif: 7281739, name: 'Bisnaga hamatacantha', authorship: '(Muehlenpf.) Orcutt', upstream: { 'wcvp.distribution': { status: 'none', at: '2026-10-21T21:59:20.334Z' } } };
  const KEPT = { id: 'k2808164', name: 'Ferocactus hamatacanthus', authorship: '(Muehlenpf.) Britton & Rose', synonyms: ['Echinocactus hamatacanthus Muehlenpf.', 'Hamatocactus hamatacanthus (Muehlenpf.) F.M.Knuth'], keys: [{ key: 7281739, name: 'Bisnaga hamatacantha (Muehlenpf.) Orcutt', kew: "the page merged here by the owner's decision (scripts/merged-pages.txt)", n: 3388, from: 'download', slug: 'bisnaga-hamatacantha' }] };
  it("--index gives the kept page the old name as an older name, after its record's own (the search finds it there)", () => {
    const { dir, v3 } = folder([KEPT]);
    const r = build(dir, '--index');
    expect(r.status, r.stderr).toBe(0);
    const idx = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<{ key: string; syn?: string[]; older?: string[] }>;
    expect(idx.find((e) => e.key === 'k2808164')?.syn).toEqual(['Echinocactus hamatacanthus', 'Hamatocactus hamatacanthus', 'Bisnaga hamatacantha']);
  });
  it('guard: a page with no merged key keeps its older names as they were', () => {
    const { dir, v3 } = folder([{ ...KEPT, keys: [] }]);
    expect(build(dir, '--index').status).toBe(0);
    const idx = JSON.parse(readFileSync(join(v3, 'index.json'), 'utf8')) as Array<{ key: string; syn?: string[] }>;
    expect(idx.find((e) => e.key === 'k2808164')?.syn).toEqual(['Echinocactus hamatacanthus', 'Hamatocactus hamatacanthus']);
  });
  it('--list-no-reason leaves out the page that leaves by the merge', () => {
    const { dir } = folder([BISNAGA, { ...BISNAGA, id: 'g1', gbif: 1, name: 'Bisnaga testi' }]);
    const r = build(dir, '--list-no-reason');
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(dir, 'rebuild-no-reason.txt'), 'utf8')).toBe('g1 Bisnaga testi\twcvp.distribution: not ok, and no reason given\n');
  });
});

describe("the species page: \"Under another author\" only of another author's name (S's need)", () => {
  // Round seventy-one's case (r71f-names), and the same name cited by the other page's own author.
  const entry = (key: number, name: string, syn: string[] = []): IndexEntry => ({ key: gbifPage(key), gbif: key, slug: slugify(name), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}) });
  const idx: IndexEntry[] = [entry(2, 'Annona montana', ['Annona muricata']), entry(5, 'Annona muricata'), entry(7, 'Annona glabra', ['Annona muricata'])];
  const records: Record<number, { authorship: string; synonyms: string[] }> = { 2: { authorship: 'Macfad.', synonyms: ['Annona muricata Vell.'] }, 5: { authorship: 'L.', synonyms: [] }, 7: { authorship: 'L.', synonyms: ['Annona muricata L.'] } };
  const FIXTURE = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
  const dossierOf = (e: IndexEntry) => ({ ...FIXTURE, key: e.key, ids: { ...FIXTURE.ids, gbif: e.gbif }, slug: e.slug, name: { ...FIXTURE.name, scientific: e.name, genus: 'Annona', authorship: records[e.gbif!].authorship, synonyms: records[e.gbif!].synonyms } });
  const STORE = { get: async (path: string) => { const e = idx.find((x) => path.endsWith(`/${x.key}.json`)); return e ? { json: async () => dossierOf(e) } : null; } };
  const corpus = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r82m', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
  const event = (slug: string) => {
    const url = new URL(`http://x/species/${slug}`);
    return { params: { slug }, platform: { env: { STORE } }, fetch: (async (u: string | URL) => { throw new Error(`asked ${String(u)}`); }) as typeof fetch, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '1.2.3.4', locals: { corpus } } as unknown as Parameters<typeof load>[0];
  };
  type Data = { namedElsewhere?: Array<{ name: string; slug: string; authors: string[] }> };
  it('guard: a name cited by another author is said so (Vellozo\'s Annona muricata on Annona montana)', async () => {
    expect(((await load(event('annona-montana'))) as Data).namedElsewhere).toEqual([{ name: 'Annona muricata', slug: 'annona-muricata', authors: ['Vell.'] }]);
  });
  it('a name cited by that page\'s own author is not said to be under another author', async () => {
    expect(((await load(event('annona-glabra'))) as Data).namedElsewhere).toEqual([]);
  });
});
