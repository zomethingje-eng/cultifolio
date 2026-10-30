/**
 * Round eighty, agent X: the full build builds round seventy-eight's pages again (`--renew`), and still goes on after a
 * stop.
 *
 * The list's build keeps a page on disk whose climate is settled and no source of which refused ("kept (clean)"). On the
 * PC that is every one of round seventy-eight's 8,945 pages (their climate is ok or none): the full build would have kept
 * them all as they were, with round seventy-two's records and none of this round's rules (the institution rule, the other
 * keys, the merges, which only a build of the page reads), while its review expects nearly every page to differ. Measured
 * on the real corpus here: of a sample of 20 of the list's species, the 9 with a page on disk were all kept. With `--renew`
 * a page built before the day GBIF made the download is built again, and one built since is kept, so a build that stops
 * goes on where it stopped. Run on the real `build-dossiers.ts`, offline (a page without a GBIF key, from a Kew file of
 * one row), in a folder of its own. FAILED on r80base: the page built on 2026-10-01 was kept with `--renew` given, and the
 * plan's build had no `--renew`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIST_MAGIC, LIST_COLUMNS } from '../../scripts/select-species-lib';
import { SQL_SELECT } from '../../src/lib/dossier/bulk';
import { writeZip } from '../../scripts/dev/zip-store';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const row = (o: Record<string, string>) => NAMES_HEAD.split('|').map((h) => o[h] ?? '').join('|');
const NAMES = [NAMES_HEAD, row({ plant_name_id: '457911', ipni_id: '60451554-2', taxon_rank: 'Species', taxon_status: 'Accepted', family: 'Cupressaceae', genus: 'Hesperocyparis', species: 'lusitanica', taxon_name: 'Hesperocyparis lusitanica', taxon_authors: '(Mill.) Bartel', accepted_plant_name_id: '457911', powo_id: '60451554-2' })].join('\n') + '\n';
const DIST = ['plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful', '1|457911|7|NORTHERN AMERICA|79|Mexico|MXC|Mexico Central|0|0|0'].join('\n') + '\n';
const LIST = [LIST_MAGIC, '# One species without a GBIF key, for a test.', `# ${LIST_COLUMNS.join('\t')}`, ['457911', 'Hesperocyparis lusitanica', '(Mill.) Bartel', 'Cupressaceae', 'inat 5545 + gbif 325', '-'].join('\t'), ''].join('\n');
const KEY = '0036848-260928105237408';

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r80x-renew-'));
  // Round eighty-four (G): a build reads the regions' shapes or does not start; the merge gives this folder the file.
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'bulk'));
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), NAMES);
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), DIST);
  writeFileSync(join(dir, 'list.txt'), LIST);
  // The download, made by GBIF on 2026-10-20 (one record of another species).
  writeZip(join(dir, 'bulk/occurrence.zip'), { [`${KEY}.csv`]: `${SQL_SELECT.map(([, a]) => a).join('\t')}\n4152362378\t3832175\t3832175\t3832175\t-31.11986\t-64.45786\t31.0\t\t2021\tAR\tHUMAN_OBSERVATION\tCC_BY_4_0\t50c9509d-22c7-4a22-a47d-8c48425ef4a7\t\t\n` });
  writeFileSync(join(dir, 'bulk/download.json'), JSON.stringify({ key: KEY, format: 'SQL_TSV_ZIP', doi: '10.15468/dl.example', records: 1, taxa: 1, csv: `${KEY}.csv`, created: '2026-10-20T13:31:13.148+00:00', fetched: '2026-10-21T08:00:00.000Z' }));
  return dir;
}
const SKIP = ['--skip', 'wikidata,wikipedia,inat,commons', '--no-batch'];
const page = (dir: string) => join(dir, 'static/s/v3/k457911.json');

describe('round eighty, X: --renew', () => {
  it('builds again a page built before the download was made, keeps one built since, and keeps it without --renew', () => {
    const dir = folder();
    let r = builder(dir, 'list.txt', '--bulk', 'bulk', ...SKIP);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toMatch(/✓ Hesperocyparis lusitanica \[k457911\]/);
    // As round seventy-eight wrote it, before the download.
    const d = JSON.parse(readFileSync(page(dir), 'utf8'));
    writeFileSync(page(dir), JSON.stringify({ ...d, built: '2026-10-01T00:00:00.000Z' }));
    r = builder(dir, 'list.txt', '--bulk', 'bulk', ...SKIP);
    expect(r.stdout).toContain('· Hesperocyparis lusitanica: kept (clean)');
    r = builder(dir, 'list.txt', '--bulk', 'bulk', ...SKIP, '--renew');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('--renew: every page built before 2026-10-20, the day GBIF made the download, is built again; a page built since is kept');
    expect(r.stdout).toMatch(/✓ Hesperocyparis lusitanica \[k457911\]/);
    expect(JSON.parse(readFileSync(page(dir), 'utf8')).built >= '2026-10-20').toBe(true);
    // The same command after a stop: what this build wrote is kept.
    r = builder(dir, 'list.txt', '--bulk', 'bulk', ...SKIP, '--renew');
    expect(r.stdout).toContain('· Hesperocyparis lusitanica: kept (clean)');
  }, 120_000);

  it('a page with a GBIF key is judged by the same rule', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toMatch(/function needsRebuild\(key: number\): boolean \{[\s\S]{0,400}if \(builtBeforeRenewal\(d\)\) return true;/);
    expect(src).toMatch(/function needsKewRebuild\(kewId: string\): boolean \{[\s\S]{0,200}if \(builtBeforeRenewal\(d\)\) return true;/);
  });

  it('the full plan\'s build gives it', () => {
    expect(readFileSync('scripts/corpus-plan-full.txt', 'utf8')).toMatch(/^dossier scripts\/species-list\.txt --grid climate --bulk bulk --skip inat --renew$/m);
  });
});
