/**
 * Round eighty-one, agent B: what a rebuild that asks no source carries (review B1, B3, B8), on the real builder.
 *   - B1: DEPLOY (d)'s `--keys … --offline` stripped the Wikidata English names of a page without a GBIF key and kept the
 *     record that says they were taken. A keyless page is built offline from Kew's file (a file of its own rows here, in
 *     Kew's form) under a network that answers nothing: its names come back with their record.
 *   - B3: a build that skips iNaturalist rewrote a filled page's cultivated row as "carried from build of <another day>;
 *     this build: …", which is not settled, so the next fill asked it again, and the wild row lost Kew's mark. The rows
 *     keep their words, their day and the mark, with the build that kept them said once.
 *   - B8: `--keys a.txt,b.txt` builds both files' pages in one run (one read of the download); a file of the list that is
 *     not there names no page.
 * Each case FAILED on r81base: there the names are [], the cultivated row is not settled, and `--keys a,b` is a file
 * that does not exist (exit 2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as inat from '$dossier/sources/inat';
import * as rederive from '$dossier/rederive';

const root = resolve('.');
/** A project folder with these dossiers (fixtures, edited) and a network that answers nothing ("fetch failed"). */
function folder(pages: Record<string, (d: Record<string, any>) => void>, files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'r81b-carry-'));
  const v3 = join(dir, 'static/s/v3');
  mkdirSync(v3, { recursive: true });
  for (const [k, edit] of Object.entries(pages)) {
    const d = JSON.parse(readFileSync(`fixtures/dossiers/s/v3/${k}.json`, 'utf8'));
    edit(d);
    writeFileSync(join(v3, `${k}.json`), JSON.stringify(d));
  }
  for (const [p, text] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), text); }
  writeFileSync(join(dir, 'fake.mjs'), "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n");
  return { dir, v3 };
}
const build = (dir: string, ...more: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'fake.mjs')).href, '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), ...more], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'), CULTIFOLIO_SLOW_RETRY_MS: '5' } });
const page = (v3: string, k: string) => JSON.parse(readFileSync(join(v3, `${k}.json`), 'utf8'));

// Kew's rows for Hesperocyparis lusitanica (plant_name_id 457911), in wcvp_names.csv's and wcvp_distribution.csv's form.
const KEW_NAMES = [
  'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed',
  '457911|60451554-2|Species|Accepted|Cupressaceae||Hesperocyparis||lusitanica|||Mill.|Bartel||Phytologia| 91: 181|(2009)||Mexico to Nicaragua|tree|subtropical|Hesperocyparis lusitanica|(Mill.) Bartel|457911|383170|||457899|60451554-2||Y'
].join('\n') + '\n';
const KEW_DIST = [
  'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful',
  '1097752|457911|7|NORTHERN AMERICA|79|Mexico|MXC|Mexico Central|0|0|0',
  '1097758|457911|8|SOUTHERN AMERICA|80|Central America|GUA|Guatemala|0|0|0',
  '1097749|457911|1|EUROPE|12|Southwestern Europe|SPA|Spain|1|0|0'
].join('\n') + '\n';

describe("B1: a page without a GBIF key, re-derived offline, keeps Wikidata's names with their record", () => {
  it('the offline line of (d), as --list-range-shapes writes it, on Hesperocyparis lusitanica', () => {
    const { dir, v3 } = folder({ k457911: () => {} }, { 'bulk/wcvp_names.csv': KEW_NAMES, 'bulk/wcvp_distribution.csv': KEW_DIST, 'rebuild-shapes.txt': 'k457911 Hesperocyparis lusitanica\tan open record outside its shapes\n' });
    const before = page(v3, 'k457911');
    expect(before.name.vernacular.map((v: { name: string }) => v.name)).toEqual(['Cedar of Goa', 'Mexican cypress']); // guard
    const r = build(dir, '--keys', 'rebuild-shapes.txt', '--offline', '--bulk', 'bulk');
    expect(r.stdout).toMatch(/1 built, 0 kept of 1/);
    expect(r.stdout).toMatch(/✓ Hesperocyparis lusitanica \[k457911\]/);
    const d = page(v3, 'k457911');
    expect(d.ids.gbif).toBeUndefined(); // guard: the keyless path, from Kew's file
    // r81base: [] under a record still saying "2 English names taken".
    expect(d.name.vernacular).toEqual(before.name.vernacular);
    expect(d.upstream['wikidata.names'].status).toBe('ok');
    expect(d.upstream['wikidata.names'].detail).toMatch(/^carried from build of .* \(rederive\); that build: Wikidata's item Q50843040; 2 English names taken: "Cedar of Goa", "Mexican cypress"$/);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('the carry, as the builder calls it: only a carried record brings its names, and never twice', () => {
    const prev = { name: { vernacular: [{ name: 'Jade plant', lang: 'eng', source: 'Wikidata' }] }, upstream: { 'wikidata.names': { status: 'ok', at: '2026-10-23T00:00:00Z', detail: "Wikidata's item Q157299; 1 English name taken: \"jade plant\"" } } };
    const carried = { status: 'ok', at: '2026-10-23T00:00:00Z', detail: "carried from build of 2026-10-23 (rederive); that build: Wikidata's item Q157299; 1 English name taken: \"jade plant\"" };
    const d = { name: { vernacular: [] as Array<{ source?: string }> }, upstream: { 'wikidata.names': { ...carried } } as Record<string, { status: string; at?: string; detail?: string }> };
    expect(rederive.carryWdNames(prev, d)).toBe(true);
    expect(d.name.vernacular).toEqual(prev.name.vernacular);
    expect(rederive.carryWdNames(prev, d)).toBe(false); // already there
    // A record this build wrote itself (Wikidata asked, online): its own names stand, none carried.
    const own = { name: { vernacular: [] as Array<{ source?: string }> }, upstream: { 'wikidata.names': { status: 'none', at: 'x', detail: "Wikidata's item Q157299; no English name taken" } } };
    expect(rederive.carryWdNames(prev, own)).toBe(false);
    expect(own.name.vernacular).toEqual([]);
  });
});

describe('B3: a rebuild that skips iNaturalist keeps a filled set settled, with its own day and the mark of Kew', () => {
  const filled = (d: Record<string, any>) => {
    d.upstream['inat.photos.cultivated'] = { status: 'ok', at: '2026-10-23T01:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-23` };
    d.upstream['inat.photos.wild'] = { status: 'ok', at: '2026-10-23T01:00:00.000Z', detail: "from iNaturalist's open data of 2026-09-27: research-grade observations; filled 2026-10-23; descendants read against Kew's file of 2026-06-04" };
    d.upstream['inat.taxon'] = { status: 'ok', at: '2026-10-23T01:00:00.000Z', detail: "iNaturalist's taxon 135254 checked" };
  };
  it('the offline line of (d), on Copiapoa cinerea with 6 cultivated photographs; and --keys a,b with b not there (B8)', () => {
    const { dir, v3 } = folder({ k2735933: filled }, { 'keys.txt': 'k2735933 Copiapoa cinerea\n' });
    const before = page(v3, 'k2735933');
    const r = build(dir, '--keys', 'keys.txt,rebuild-wd-retry.txt', '--offline');
    // B8: r81base says the file "keys.txt,rebuild-wd-retry.txt" is not there, and builds nothing.
    expect(r.stdout).toMatch(/rebuild-wd-retry\.txt is not there: it names no page, and the pages of keys\.txt are built/);
    expect(r.stdout).toMatch(/1 built, 0 kept of 1/);
    const d = page(v3, 'k2735933');
    const cult = d.upstream['inat.photos.cultivated'], wild = d.upstream['inat.photos.wild'];
    // r81base: "carried from build of 2026-09-20; this build: not asked: …", not settled, and the next fill asks it again.
    expect(inat.cultivatedSettled(cult)).toBe(true);
    expect(cult.at).toBe('2026-10-23T01:00:00.000Z');
    expect(cult.detail).toMatch(new RegExp(`^${inat.CULTIVATED_RULE}; filled 2026-10-23; kept by the build of \\d{4}-\\d{2}-\\d{2} \\(this build: not asked`));
    expect(wild.detail).toMatch(/^from iNaturalist's open data of 2026-09-27: research-grade observations; filled 2026-10-23; descendants read against Kew's file of 2026-06-04; kept by the build of /);
    // Guard: the photographs and the id, as before.
    expect(d.ids.inat).toBe(before.ids.inat);
    expect(d.photos.filter((p: { src: string }) => p.src === 'inat').length).toBe(before.photos.filter((p: { src: string }) => p.src === 'inat').length);
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);

  it('a row kept twice names the latest build that kept it, once', () => {
    const was = { status: 'ok', at: '2026-10-23T01:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-23` };
    const once = rederive.keptInatSetRow(was, 'not asked: offline re-derivation', '2026-10-28');
    const twice = rederive.keptInatSetRow(once, 'not asked: this build left iNaturalist to the daily fill', '2026-11-30');
    expect(twice).toEqual({ status: 'ok', at: '2026-10-23T01:00:00.000Z', detail: `${inat.CULTIVATED_RULE}; filled 2026-10-23; kept by the build of 2026-11-30 (this build: not asked: this build left iNaturalist to the daily fill)` });
    expect(rederive.keepsInatSet('inat.photos.cultivated', was)).toBe(true);
    expect(rederive.keepsInatSet('inat.photos.cultivated', { status: 'none', detail: 'x' })).toBe(false); // carryInatRows' case
    expect(rederive.keepsInatSet('inat.photos.wild', { status: 'ok', detail: 'carried from build of 2026-10-09; this build: x' })).toBe(false);
    expect(rederive.keepsInatSet('commons', was)).toBe(false);
  });
});
