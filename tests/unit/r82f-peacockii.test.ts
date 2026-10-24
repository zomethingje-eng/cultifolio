/**
 * Round eighty-two, agent F: review 1's 4. Echeveria peacockii (g7530398) carried Dudleya pulverulenta's Kew entry
 * 2778991, the entry of page k2778991, and its record pointed POWO there: one Kew taxon had two pages. The owner's
 * decision: the merge goes to Echeveria desmetiana (k2781125, Kew's accepted name for what GBIF files under 7530398), and
 * no page carries a Kew entry another page holds.
 *   - scripts/merged-pages.txt joins 7530398 to k2781125, leaving out only GBIF's pro parte Cotyledon peacockii;
 *   - `--fill kew-names` (and every build given Kew's file, which runs it for its pages) gives no page an entry whose page
 *     `k<entry>` is on disk: the real builder, on two pages and Kew's real rows;
 *   - `--index` lists the entries two pages still hold (kew-shared.txt), and the review before the upload counts them.
 * Each case FAILED on r82base: the merge joined 2985894, the fill gave g7530398 the entry 2778991, and there is no
 * `sharedKewEntries`, no kew-shared.txt and no 'kew-held' (marked guards excepted).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseMerges, mergeKeys, mergeTarget } from '$dossier/extra-keys';
import * as pageIdsMod from '$dossier/page-ids';
import * as kewNamesMod from '$dossier/kew-names';
import { slugify } from '$core/names';

const root = resolve('.');
const merges = parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8'));

// Kew's rows (wcvp_names.csv of 2026-06-04), in its form: Dudleya pulverulenta, the names Echeveria peacockii and
// Cotyledon peacockii filed under it, and Echeveria desmetiana with a name GBIF files under 7530398. The live page linked
// 272782-1, Cotyledon peacockii's number, and so read to 2778991.
const HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const row = (id: string, rank: string, status: string, genus: string, sp: string, name: string, authors: string, acc: string, powo: string) => `${id}||${rank}|${status}|Crassulaceae||${genus}||${sp}|||||||||||||${name}|${authors}|${acc}|||||${powo}||Y`;
const KEW = [
  HEAD,
  row('2778991', 'Species', 'Accepted', 'Dudleya', 'pulverulenta', 'Dudleya pulverulenta', '(Nutt.) Britton & Rose', '2778991', '275453-1'),
  row('2781292', 'Species', 'Synonym', 'Echeveria', 'peacockii', 'Echeveria peacockii', 'Croucher ex T.Moore & Mast.', '2778991', '60473374-2'),
  row('2781041', 'Species', 'Synonym', 'Echeveria', 'argentea', 'Echeveria argentea', 'Lem.', '2778991', '273727-1'),
  row('2740274', 'Species', 'Synonym', 'Cotyledon', 'peacockii', 'Cotyledon peacockii', '(Croucher ex T.Moore & Mast.) Baker', '2778991', '272782-1'),
  row('2781125', 'Species', 'Accepted', 'Echeveria', 'desmetiana', 'Echeveria desmetiana', 'De Smet ex É.Morren', '2781125', '273829-1'),
  row('2781399', 'Species', 'Synonym', 'Echeveria', 'subsessilis', 'Echeveria subsessilis', 'Rose', '2781125', '274316-1')
].join('\n') + '\n';

/** A project folder holding these pages, made from the Welwitschia fixture with their names, ids and keys. */
function folder(pages: Array<{ id: string; gbif?: number; name: string; authorship: string; kew?: unknown; ipni?: string }>) {
  const dir = mkdtempSync(join(tmpdir(), 'r82f-kew-'));
  const v3 = join(dir, 'static/s/v3');
  mkdirSync(v3, { recursive: true });
  for (const p of pages) {
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k339841.json', 'utf8'));
    d.key = p.id;
    d.slug = slugify(p.name);
    d.name.scientific = p.name;
    d.name.authorship = p.authorship;
    d.name.family = 'Crassulaceae';
    d.name.genus = p.name.split(' ')[0];
    d.name.synonyms = [];
    d.name.vernacular = [];
    if (p.kew) d.name.kew = p.kew; else delete d.name.kew;
    d.ids = { ...(p.gbif != null ? { gbif: p.gbif } : {}), ...(p.ipni ? { ipni: p.ipni, powo: `urn:lsid:ipni.org:names:${p.ipni}` } : {}) };
    writeFileSync(join(v3, `${p.id}.json`), JSON.stringify(d));
  }
  mkdirSync(join(dir, 'bulk'), { recursive: true });
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), KEW);
  writeFileSync(join(dir, 'fake.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
  return { dir, v3 };
}
const build = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));

describe("the merge re-pointed: Echeveria peacockii into Echeveria desmetiana (the owner's decision)", () => {
  it('scripts/merged-pages.txt joins 7530398 to k2781125, leaving out only Cotyledon peacockii, GBIF\'s pro parte synonym', () => {
    const m = merges.find((x) => x.from === 7530398)!;
    expect(mergeTarget(m)).toBe('k2781125');
    expect(m).toMatchObject({ into: 0, intoPage: 'k2781125', name: 'Echeveria peacockii', except: [5690759] });
    expect(merges.some((x) => x.into === 2985894)).toBe(false);
  });
  it('the build reads 7530398 on k2781125 with its old address, and Dudleya pulverulenta reads it no longer', () => {
    const line = mergeKeys(merges, [], slugify).find((k) => k.key === 7530398)!;
    expect(line).toMatchObject({ page: 0, pageId: 'k2781125', merged: 'echeveria-peacockii', except: [5690759] });
    expect(mergeKeys(merges, [], slugify).some((k) => k.page === 2985894)).toBe(false);
  });
  it('the ids: g7530398 is merged away, k2781125 and k2778991 keep their Kew ids (guard: so on the base too)', () => {
    const ids = pageIdsMod.pageIds([{ gbif: 7530398, entry: '2778991' }, { entry: '2781125' }, { gbif: 2985894, entry: '2778991' }], merges);
    expect(ids.map((a) => [a.id, a.why])).toEqual([['g7530398', 'merged-away'], ['k2781125', 'kew'], ['k2778991', 'kew']]);
  });
  it('(d)\'s repair list rebuilds the page joined (scripts/r82-repair-keys.txt)', () => {
    expect(readFileSync('scripts/r82-repair-keys.txt', 'utf8')).toMatch(/^k2781125 Echeveria desmetiana$/m);
  });
});

describe('one Kew entry, one page: --fill kew-names on the real builder', () => {
  it("a page whose name Kew's rows read to another page's entry is not given it, and says so", () => {
    const { dir, v3 } = folder([
      { id: 'g7530398', gbif: 7530398, name: 'Echeveria peacockii', authorship: 'Croucher', ipni: '272782-1' },
      { id: 'k2778991', gbif: 2985894, name: 'Dudleya pulverulenta', authorship: '(Nutt.) Britton & Rose', kew: { entry: '2778991', synonyms: [], acceptedElsewhere: [], file: '2026-06-04' } }
    ]);
    const r = build(dir, '--fill', 'kew-names', '--bulk', 'bulk');
    expect(r.status, r.stderr).toBe(0);
    const g = page(v3, 'g7530398');
    expect(g.name.kew).toEqual({ entry: '', synonyms: [], acceptedElsewhere: [], file: expect.any(String), heldBy: 'k2778991' });
    expect(g.upstream['kew.names']).toMatchObject({ status: 'none', detail: "Kew's rows read this name to the entry 2778991, which is page k2778991's: not given to this page (one Kew entry, one page; a merge decides)" });
    expect(r.stdout).toMatch(/1 not given a Kew entry another page holds/);
    // The page that holds it keeps it, with Kew's names for its plant (guard).
    expect(page(v3, 'k2778991').name.kew).toMatchObject({ entry: '2778991', synonyms: ['Cotyledon peacockii', 'Echeveria argentea', 'Echeveria peacockii'] });
    // Its id says why it is not a Kew id, and nothing is left shared.
    expect(readFileSync(join(dir, 'ids-gbif.txt'), 'utf8')).toMatch(/^g7530398\tEcheveria peacockii\tKew's rows read its name to an entry page k2778991 holds, which is not given to this page: a merge decides$/m);
    expect(existsSync(join(dir, 'kew-shared.txt'))).toBe(false);
    // A second run changes nothing (the fill's own rule).
    const again = build(dir, '--fill', 'kew-names', '--bulk', 'bulk');
    expect(again.stdout).toMatch(/2 dossiers read, 0 changed/);
  });
  it('two pages that hold one entry with neither its page: none is guessed, and --index lists them in kew-shared.txt', () => {
    const { dir, v3 } = folder([
      { id: 'g7530398', gbif: 7530398, name: 'Echeveria peacockii', authorship: 'Croucher', ipni: '272782-1' },
      { id: 'g2985894', gbif: 2985894, name: 'Dudleya pulverulenta', authorship: '(Nutt.) Britton & Rose' }
    ]);
    const r = build(dir, '--fill', 'kew-names', '--bulk', 'bulk');
    expect(r.status, r.stderr).toBe(0);
    expect(page(v3, 'g7530398').name.kew.entry).toBe('2778991'); // guard: no page k2778991 to hold it
    expect(readFileSync(join(dir, 'kew-shared.txt'), 'utf8')).toBe('2778991\tg2985894 Dudleya pulverulenta; g7530398 Echeveria peacockii\n');
    expect(r.stdout).toMatch(/1 Kew entry is held by two pages or more → kew-shared\.txt/);
  });
});

describe('the check', () => {
  it('sharedKewEntries: a page holds the entry its id names and the entry its record names', () => {
    const shared = (pageIdsMod as unknown as { sharedKewEntries?: typeof pageIdsMod.sharedKewEntries }).sharedKewEntries;
    expect(typeof shared).toBe('function');
    expect(shared!([{ id: 'k2778991', entry: '2778991', name: 'Dudleya pulverulenta' }, { id: 'g7530398', entry: '2778991', name: 'Echeveria peacockii' }, { id: 'k2781125', entry: '2781125' }, { id: 'g999', entry: '' }])).toEqual([{ entry: '2778991', pages: [{ id: 'g7530398', name: 'Echeveria peacockii' }, { id: 'k2778991', name: 'Dudleya pulverulenta' }] }]);
    // The live corpus's three before (d): the merged Ceropegias, Echeveria peacockii, the two Croci.
    expect(shared!([{ id: 'k505095', entry: '505095' }, { id: 'g9574874', entry: '505095' }, { id: 'g9592399', entry: '505095' }, { id: 'g2747473', entry: '327347' }, { id: 'g2747305', entry: '327347' }]).map((g) => [g.entry, g.pages.length])).toEqual([['327347', 2], ['505095', 3]]);
  });
  it("a page refused another page's entry keeps its GBIF id, said as such", () => {
    const [a] = pageIdsMod.pageIds([{ gbif: 7530398, entry: '', heldBy: 'k2778991' } as pageIdsMod.IdPage]);
    expect(a).toMatchObject({ id: 'g7530398', why: 'kew-held' });
    expect(pageIdsMod.idWords(a)).toBe("Kew's rows read its name to an entry page k2778991 holds, which is not given to this page: a merge decides");
  });
  it('the review before the upload counts kew-shared.txt, and says nothing when it is not there', async () => {
    const { facts } = await import(pathToFileURL(join(root, 'scripts/corpus-step.mjs')).href);
    const dir = mkdtempSync(join(tmpdir(), 'r82f-facts-'));
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    writeFileSync(join(dir, 'static/s/v3/manifest.json'), JSON.stringify({ id: 'c0rpus' }));
    writeFileSync(join(dir, 'static/s/v3/index.json'), '[]');
    expect(facts(dir, null, null)).toBe(' (corpus on disk c0rpus, was not recorded; 0 species; drops.txt not there).');
    writeFileSync(join(dir, 'kew-shared.txt'), '327347\tg2747305 Crocus nudiflorus; g2747473 Crocus mazziaricus\n2778991\tg7530398 Echeveria peacockii; k2778991 Dudleya pulverulenta\n');
    expect(facts(dir, null, null)).toBe(' (corpus on disk c0rpus, was not recorded; 0 species; drops.txt not there; kew-shared.txt 2 Kew entries held by two pages or more (327347, 2778991): one Kew taxon on two pages, which the repair should leave none of).');
  });
  it('kewNames keeps the fill pure: heldElsewhereNames drops the other plant\'s names and keeps the page\'s own reading', () => {
    const f = (kewNamesMod as unknown as { heldElsewhereNames?: typeof kewNamesMod.heldElsewhereNames }).heldElsewhereNames;
    expect(f?.({ entry: '2778991', synonyms: ['Echeveria argentea'], acceptedElsewhere: ['Echeveria desmetiana De Smet ex É.Morren'], file: '2026-06-04' }, 'k2778991')).toEqual({ entry: '', synonyms: [], acceptedElsewhere: ['Echeveria desmetiana De Smet ex É.Morren'], file: '2026-06-04', heldBy: 'k2778991' });
  });
});
