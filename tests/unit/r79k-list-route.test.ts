/**
 * Round seventy-nine (K): the species of the list without a GBIF key reach the build. `jobsFromList` gives them by Kew's
 * id; `scripts/build-dossiers.ts` reads them from Kew's file (`scripts/kew-species-load.ts`) and builds each by
 * `build-kew.ts`, its page `k<plant_name_id>`, never matched to GBIF by its name; `--index` keeps the id and writes no GBIF
 * key for it. Run here on a Kew file of three rows, every network source skipped, in a folder of its own. FAILED on
 * r79base: the build left such a species out ("not built", 0 dossiers), and `kew-species-load.ts` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadKewSpecies } from '../../scripts/kew-species-load';
import { jobsFromList, parseSpeciesList, LIST_MAGIC, LIST_COLUMNS, select, loadKew, referenceSpecies, formatSpeciesList } from '../../scripts/select-species-lib';
import { NO_GBIF_WHY } from '../../src/lib/core/no-gbif';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const row = (o: Record<string, string>) => NAMES_HEAD.split('|').map((h) => o[h] ?? '').join('|');
/** Kew's rows as wcvp_names.csv of 2026-06-04 holds them for Mexican cypress, two of its synonyms and a misapplied name. */
const NAMES = [
  NAMES_HEAD,
  row({ plant_name_id: '457911', ipni_id: '60451554-2', taxon_rank: 'Species', taxon_status: 'Accepted', family: 'Cupressaceae', genus: 'Hesperocyparis', species: 'lusitanica', lifeform_description: 'tree', climate_description: 'subtropical', taxon_name: 'Hesperocyparis lusitanica', taxon_authors: '(Mill.) Bartel', accepted_plant_name_id: '457911', powo_id: '60451554-2' }),
  row({ plant_name_id: '1001', taxon_rank: 'Species', taxon_status: 'Synonym', family: 'Cupressaceae', genus: 'Cupressus', species: 'lusitanica', taxon_name: 'Cupressus lusitanica', taxon_authors: 'Mill.', accepted_plant_name_id: '457911', homotypic_synonym: 'T' }),
  row({ plant_name_id: '1002', taxon_rank: 'Species', taxon_status: 'Synonym', family: 'Cupressaceae', genus: 'Cupressus', species: 'lindleyi', taxon_name: 'Cupressus lindleyi', taxon_authors: 'Klotzsch ex Endl.', accepted_plant_name_id: '457911' }),
  row({ plant_name_id: '1003', taxon_rank: 'Species', taxon_status: 'Misapplied', family: 'Cupressaceae', genus: 'Cupressus', species: 'benthamii', taxon_name: 'Cupressus benthamii', taxon_authors: 'auct.', accepted_plant_name_id: '457911' })
].join('\n') + '\n';
const DIST = ['plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful', '1|457911|7|NORTHERN AMERICA|79|Mexico|MXC|Mexico Central|0|0|0', '2|457911|8|SOUTHERN AMERICA|80|Central America|GUA|Guatemala|0|0|0', '3|457911|2|AFRICA|25|East Tropical Africa|KEN|Kenya|1|0|0'].join('\n') + '\n';
const LIST = [LIST_MAGIC, '# A list of one species without a GBIF key, for a test.', `# ${LIST_COLUMNS.join('\t')}`, ['457911', 'Hesperocyparis lusitanica', '(Mill.) Bartel', 'Cupressaceae', 'inat 5545 + gbif 325', '-'].join('\t'), ''].join('\n');

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r79k-list-'));
  // Round eighty-four (G): a build reads the regions' shapes or does not start; the merge gives this folder the file.
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'bulk'));
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), NAMES);
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), DIST);
  writeFileSync(join(dir, 'list.txt'), LIST);
  return dir;
}

describe('the list made again over a reference that holds a page without a GBIF key', () => {
  it('keeps the species, and its key is the backbone\'s rule again, "-" here, never "undefined"', () => {
    const kew = loadKew(NAMES.trim().split('\n'));
    const ref = referenceSpecies(kew, [{ key: null, name: 'Hesperocyparis lusitanica', author: '(Mill.) Bartel', family: 'Cupressaceae', kewEntry: '457911' }]);
    const list = select(kew, new Map(), new Map(), [], () => null, 3, ref);
    expect(list.map((x) => [x.id, x.gbifKey, x.byReference])).toEqual([['457911', null, true]]);
    const text = formatSpeciesList(['a test'], list);
    expect(text).toContain('457911\tHesperocyparis lusitanica\t(Mill.) Bartel\tCupressaceae\talready in the reference\t-');
    expect(parseSpeciesList(text)[0].gbifKey).toBeNull();
  });
});

describe('the list\'s species without a GBIF key', () => {
  it('are jobs by Kew\'s id, with no GBIF key and no name to match', () => {
    const [j] = jobsFromList(parseSpeciesList(LIST));
    expect(j).toEqual({ name: 'Hesperocyparis lusitanica', key: undefined, pageId: 'k457911', kewId: '457911', gbifKey: null });
  });
  it('are read from Kew\'s file: the accepted row, its synonyms but not a misapplied name, and its range', async () => {
    const dir = folder();
    const k = (await loadKewSpecies(join(dir, 'bulk'), ['457911', '999']))!;
    expect(k.missing).toEqual(['999']);
    const s = k.species.get('457911')!;
    expect(s).toMatchObject({ name: 'Hesperocyparis lusitanica', authors: '(Mill.) Bartel', family: 'Cupressaceae', ipni: '60451554-2', powo: '60451554-2', lifeform: 'tree', climate: 'subtropical' });
    expect(s.synonyms.map((x) => `${x.name} ${x.authors}`)).toEqual(['Cupressus lusitanica Mill.', 'Cupressus lindleyi Klotzsch ex Endl.']);
    expect(s.synonyms[0].homotypic).toBe(true);
    expect(s.range.map((r) => [r.locationId, r.establishmentMeans])).toEqual([['TDWG:MXC', 'NATIVE'], ['TDWG:GUA', 'NATIVE'], ['TDWG:KEN', 'INTRODUCED']]);
  });
  it('are built from it by the list\'s build, and indexed under Kew\'s id with no GBIF key', () => {
    const dir = folder();
    const r = builder(dir, 'list.txt', '--bulk', 'bulk', '--skip', 'wikidata,wikipedia,inat,commons', '--no-batch');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('list.txt: a species list of 1 species: 0 built by their GBIF key, 1 with no GBIF key in the list');
    expect(r.stdout).toContain("1 species without a GBIF key read from Kew's file, to be built from it");
    expect(r.stdout).toMatch(/✓ Hesperocyparis lusitanica \[k457911\] 0 photos, 0 open\/0 restricted in range, climate pending/);
    const d = JSON.parse(readFileSync(join(dir, 'static/s/v3/k457911.json'), 'utf8'));
    expect(d.ids.gbif).toBeUndefined();
    expect(d.name.kew.entry).toBe('457911');
    expect(d.upstream['gbif.occurrences']).toMatchObject({ status: 'skipped', detail: NO_GBIF_WHY });
    expect(d.distribution.native.map((x: { code: string }) => x.code)).toEqual(['MXC', 'GUA']);
    const index = JSON.parse(readFileSync(join(dir, 'static/s/v3/index.json'), 'utf8')) as Array<Record<string, unknown>>;
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ key: 'k457911', slug: 'hesperocyparis-lusitanica', climate: 'pending' });
    expect('gbif' in index[0]).toBe(false);
    // Asked again, the page on disk is kept: its climate is pending for good, which is no reason to build it again.
    const again = builder(dir, 'list.txt', '--bulk', 'bulk', '--skip', 'wikidata,wikipedia,inat,commons', '--no-batch');
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('· Hesperocyparis lusitanica: kept (clean)');
    // Without Kew's files they are not built, and the build says why.
    const bare = folder();
    const none = builder(bare, 'list.txt', '--skip', 'wikidata,wikipedia,inat,commons', '--no-batch');
    expect(none.stdout).toContain("1 species without a GBIF key not built: they are built from Kew's files, which need --bulk <dir>");
    expect(existsSync(join(bare, 'static/s/v3/k457911.json'))).toBe(false);
  }, 180_000);
});

describe('the owner\'s decision on K\'s offer (round seventy-nine, M): the keys Kew\'s synonymy gives it, read by the real build', () => {
  // FAILED on the merge head d47d3e9: the build read no extra keys for a page without a GBIF key (records "not checked").
  it('reads the records of GBIF\'s key for Kew\'s homotypic synonym from the download, and the page keeps no GBIF key', () => {
    const dir = folder();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    // GBIF's "Cupressus lusitanica Mill.", which GBIF holds as a synonym and Kew files, homotypic, under Hesperocyparis lusitanica.
    writeFileSync(join(dir, 'scripts/extra-keys-kew.txt'), ['# a test', ['k457911', '2684069', 'Cupressus lusitanica Mill.', 'SYNONYM', '1001', 'Cupressus lusitanica Mill. (synonym under Hesperocyparis lusitanica (Mill.) Bartel)', 'filed', '-', '-'].join('\t'), ''].join('\n'));
    const head = ['gbifID', 'decimalLatitude', 'decimalLongitude', 'coordinateUncertaintyInMeters', 'year', 'countryCode', 'basisOfRecord', 'license', 'datasetKey', 'speciesKey', 'taxonKey', 'acceptedTaxonKey'];
    const at = (id: number, lat: string, lon: string) => [String(id), lat, lon, '30', '2021', 'MX', 'HUMAN_OBSERVATION', 'CC_BY_4_0', 'd1', '2684000', '2684069', '2684000'].join('\t');
    writeFileSync(join(dir, 'bulk/occurrence.csv'), [head.join('\t'), at(1, '19.432', '-99.133'), at(2, '19.292', '-99.653'), at(3, '19.041', '-98.206'), ''].join('\n'));
    const r = builder(dir, 'list.txt', '--bulk', 'bulk', '--skip', 'wikidata,wikipedia,inat,commons', '--no-batch');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain("1 of them read GBIF's records under 1 keys Kew's synonymy gives them (scripts/extra-keys-kew.txt); the other 0 say GBIF's records not checked");
    const d = JSON.parse(readFileSync(join(dir, 'static/s/v3/k457911.json'), 'utf8'));
    expect(d.ids.gbif).toBeUndefined();
    expect(d.occurrences.nOpenInRange).toBe(3);
    expect(d.occurrences.keys).toEqual([{ key: 2684069, name: 'Cupressus lusitanica Mill.', kew: "Kew's file holds it as Cupressus lusitanica Mill. (synonym under Hesperocyparis lusitanica (Mill.) Bartel)", n: 3, from: 'api' }]);
    expect(d.upstream['gbif.occurrences'].status).toBe('ok');
    const index = JSON.parse(readFileSync(join(dir, 'static/s/v3/index.json'), 'utf8')) as Array<Record<string, unknown>>;
    expect('gbif' in index[0]).toBe(false);
    expect(index[0]).toMatchObject({ key: 'k457911', open: 3 });
  }, 180_000);
});
