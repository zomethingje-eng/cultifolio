/**
 * Round eighty, agent X: the full build's `--list-extra-keys` reads the species list, not only the pages on disk.
 *
 * The plan runs the step before the list's build, when the disk holds round seventy-eight's 8,945 pages. Reading those
 * alone (on the real corpus: 338 keys on 311 pages), the list's 39,000 new pages read no other key (the rule over the
 * list gives 1,347 keys on 1,205 pages, 1,032 of them on pages not yet built), and 21 of the 338 keys are filed by GBIF
 * under another of the list's species, whose own records hold theirs already: those records went on two pages. Run here
 * on the real `build-dossiers.ts`, offline, on a Kew file of four rows and a backbone export of six usages, in a folder of
 * its own. FAILED on r80base: the new page Beta two read no key, and Alpha one read Delta old's key, which GBIF files
 * under Beta two.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { LIST_MAGIC, LIST_COLUMNS } from '../../scripts/select-species-lib';
import { parseExtraKeys } from '../../src/lib/dossier/extra-keys';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const kew = (id: string, name: string, status: string, accepted: string, homotypic = '') => NAMES_HEAD.split('|').map((h) => ({ plant_name_id: id, taxon_rank: 'Species', taxon_status: status, family: 'Aizoaceae', genus: name.split(' ')[0], species: name.split(' ')[1], primary_author: 'L.', taxon_name: name, taxon_authors: 'L.', accepted_plant_name_id: accepted, homotypic_synonym: homotypic } as Record<string, string>)[h] ?? '').join('|');
/** Kew: two accepted species; Gamma old a homotypic synonym of Beta two, Delta old one of Alpha one, Epsilon old a heterotypic one of it. */
const NAMES = [NAMES_HEAD, kew('11', 'Alpha one', 'Accepted', '11'), kew('22', 'Beta two', 'Accepted', '22'), kew('33', 'Gamma old', 'Synonym', '22', 'T'), kew('44', 'Delta old', 'Synonym', '11', 'T'), kew('55', 'Epsilon old', 'Synonym', '11')].join('\n') + '\n';
/** GBIF's backbone export (no header): id, parent, basionym, is_synonym, status, rank, …, kingdom at 10, species at 16, scientific name at 18, canonical at 19, authorship at 24. */
const usage = (id: number, parent: number, status: string, rank: string, canonical: string, author = 'L.') => {
  const c = Array.from({ length: 30 }, () => '\\N');
  Object.assign(c, { 0: String(id), 1: String(parent), 3: status === 'ACCEPTED' ? 'f' : 't', 4: status, 5: rank, 6: '{}', 10: '6', 16: String(id), 18: `${canonical}${author ? ` ${author}` : ''}`, 19: canonical, 24: author });
  return c.join('\t');
};
/** GBIF accepts Gamma old and Epsilon old as species of their own (Kew sinks them), and files Delta old under Beta two. */
const BACKBONE = [usage(5, 6, 'ACCEPTED', 'FAMILY', 'Aizoaceae', ''), usage(100, 5, 'ACCEPTED', 'SPECIES', 'Alpha one'), usage(200, 5, 'ACCEPTED', 'SPECIES', 'Beta two'), usage(300, 5, 'ACCEPTED', 'SPECIES', 'Gamma old'), usage(400, 200, 'SYNONYM', 'SPECIES', 'Delta old'), usage(500, 5, 'ACCEPTED', 'SPECIES', 'Epsilon old')].join('\n') + '\n';
const LIST = [LIST_MAGIC, '# Two species: Alpha one has a page on disk, Beta two is new.', `# ${LIST_COLUMNS.join('\t')}`, ['11', 'Alpha one', 'L.', 'Aizoaceae', 'already in the reference', '100'].join('\t'), ['22', 'Beta two', 'L.', 'Aizoaceae', 'inat 5', '200'].join('\t'), ''].join('\n');

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r80x-extra-'));
  for (const d of ['bulk/backbone', 'scripts', 'static/s/v3']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), NAMES);
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful\n');
  writeFileSync(join(dir, 'bulk/backbone/simple.txt.gz'), gzipSync(BACKBONE));
  writeFileSync(join(dir, 'list.txt'), LIST);
  // Round seventy-eight's page of Alpha one, on disk before the build.
  writeFileSync(join(dir, 'static/s/v3/k11.json'), JSON.stringify({ v: 3, key: 'k11', ids: { gbif: 100 }, name: { scientific: 'Alpha one', kew: { entry: '11' } }, occurrences: { keys: [] } }));
  // And Epsilon old's, which the owner merged into Alpha one (it leaves at --prune-followed, once Alpha one reads its key).
  writeFileSync(join(dir, 'static/s/v3/g500.json'), JSON.stringify({ v: 3, key: 'g500', ids: { gbif: 500 }, name: { scientific: 'Epsilon old', kew: { entry: '55' } }, occurrences: { keys: [] } }));
  writeFileSync(join(dir, 'scripts/merged-pages.txt'), '# from, into, name\n500\t100\tEpsilon old\n');
  return dir;
}

describe('round eighty, X: --list-extra-keys over the species list', () => {
  it('gives a page not on disk yet its other keys, and refuses a key GBIF files under another of the list\'s species', () => {
    const dir = folder();
    const r = builder(dir, '--list-extra-keys', 'list.txt', '--bulk', 'bulk', '--backbone', 'bulk/backbone/simple.txt.gz');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    const keys = parseExtraKeys(readFileSync(join(dir, 'scripts/extra-keys.txt'), 'utf8')).map((k) => [k.page, k.key]);
    // Beta two, built by its key 200 from the list, reads Gamma old's key; Alpha one does not read Delta old's, and reads
    // the key of the page merged into it, whatever its type.
    expect(keys).toEqual([[100, 500], [200, 300]]);
    expect(parseExtraKeys(readFileSync(join(dir, 'scripts/extra-keys.txt'), 'utf8')).find((k) => k.key === 500)?.merged).toBe('epsilon-old');
    expect(readFileSync(join(dir, 'extra-keys-refused.txt'), 'utf8')).toContain('100\t400\tDelta old L.\tGBIF files it under key 200, another page of this reference');
    expect(r.stdout).toContain('list.txt: 2 species; 1 pages by their GBIF key not on disk yet, read with the 2 on disk');
    // Only the page on disk is listed for a rebuild with its keys; Beta two reads its keys when the build makes it.
    expect(r.stdout).toContain('1 page to rebuild with their other keys');
    expect(readFileSync(join(dir, 'rebuild-extra.txt'), 'utf8').trim().split('\n')).toHaveLength(1);
  }, 60_000);

  it('the full plan names the list in the step', () => {
    expect(readFileSync('scripts/corpus-plan-full.txt', 'utf8')).toMatch(/^dossier --list-extra-keys scripts\/species-list\.txt --bulk bulk --backbone bulk\/backbone\/simple\.txt\.gz$/m);
  });
});
