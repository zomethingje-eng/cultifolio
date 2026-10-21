/**
 * Round eighty, agent X (agent R's finding): the species list held 11 plants twice. Each was a page of the reference that
 * matches no species Kew accepts by its own name (listed by its GBIF key, "-" for plant_name_id), whose range the build
 * reads through a Kew entry (`distribution.via`: Kew's spelling of its name, Kew's synonym of it, or an older name GBIF
 * gives it that Kew accepts), and a line without a GBIF key for that same entry, which the build would have made a second
 * page of, from Kew's file, beside the page that holds its GBIF records and Kew's range. `heldThroughRange` (the list's
 * and the build's one rule) leaves such a line out. The committed list is 48,357 species. FAILED on r80base: no
 * `heldThroughRange`, and the list held the 11 lines.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as lib from '../../scripts/select-species-lib';

const held = (lib as { heldThroughRange?: typeof lib.heldThroughRange }).heldThroughRange;
const line = (kewId: string | null, name: string, author: string, gbifKey: number | null) => ({ kewId, name, author, gbifKey });

describe('round eighty, X: a species a reference page holds through its range is that page', () => {
  it('the rule: a page with a GBIF key and no Kew entry of its own, its range read through the line\'s Kew entry', () => {
    expect(held).toBeTypeOf('function');
    const list = [line('533838', 'Ceropegia ananthapuramense', '(K.Prasad, A.Naray. & Meve) Kottaim.', null), line('507335', 'Huernia hadhramautica', 'Lavranos', null), line('2734941', 'Conophytum hanae', 'Pavelka', null), line('1', 'Other plant', 'L.', null), line('2', 'Keyed plant', 'L.', 22)];
    const pages = [
      { key: 11144626, kewEntry: null, via: { kind: 'spelling', entry: 'Ceropegia ananthapuramense (K.Prasad, A.Naray. & Meve) Kottaim.' } },
      { key: 9584756, kewEntry: null, via: { kind: 'synonym-of', entry: 'Huernia hadhramautica Lavranos' } },
      // A page with a Kew entry of its own is Kew's other species, whatever its range is read through.
      { key: 3702919, kewEntry: '2734999', via: { kind: 'older-name', entry: 'Conophytum hanae Pavelka' } },
      // Its own entry, or another author's name, or a keyed line: none is held.
      { key: 5, kewEntry: null, via: { kind: 'own', entry: 'Other plant L.' } },
      { key: 6, kewEntry: null, via: { kind: 'spelling', entry: 'Keyed plant L.' } }
    ];
    expect([...held!(list, pages)]).toEqual([['533838', { key: 11144626, entry: 'Ceropegia ananthapuramense (K.Prasad, A.Naray. & Meve) Kottaim.' }], ['507335', { key: 9584756, entry: 'Huernia hadhramautica Lavranos' }]]);
    expect(held!([line('507335', 'Huernia hadhramautica', 'N.E.Br.', null)], pages).size).toBe(0);
  });

  it('the committed list leaves out the 11 and says so: 48,357 species', () => {
    const text = readFileSync('scripts/species-list.txt', 'utf8');
    const list = lib.parseSpeciesList(text);
    expect(list.length).toBe(48357);
    const ids = new Set(list.map((e) => e.kewId));
    for (const id of ['533838', '507335', '502801', '507384', '2734941', '2752709', '2775831', '317146', '2839757', '2588843', '2434528']) expect(ids.has(id), id).toBe(false);
    // Their pages stay, by their GBIF keys.
    for (const k of [11144626, 9584756, 7221866, 9449818, 3702919, 4052359, 7515664, 4092242, 7410371, 8005942, 7876017]) expect(list.some((e) => e.gbifKey === k && e.kewId == null), String(k)).toBe(true);
    expect(text).toMatch(/^# Left out \(round eighty, scripts\/dev\/r80x-list-rules\.ts --held, the rule of select-species-lib's heldThroughRange\): 11 species/m);
  });

  it('the build leaves such a line out of a list made before, and says so', () => {
    const ROOT = resolve('.');
    const dir = mkdtempSync(join(tmpdir(), 'r80x-held-'));
    mkdirSync(join(dir, 'bulk')); mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
    const row = (o: Record<string, string>) => H.split('|').map((h) => o[h] ?? '').join('|');
    writeFileSync(join(dir, 'bulk/wcvp_names.csv'), [H, row({ plant_name_id: '507335', taxon_rank: 'Species', taxon_status: 'Accepted', family: 'Apocynaceae', genus: 'Huernia', species: 'hadhramautica', taxon_name: 'Huernia hadhramautica', taxon_authors: 'Lavranos', accepted_plant_name_id: '507335' })].join('\n') + '\n');
    writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful\n1|507335|3|ASIA-TEMPERATE|35|Arabian Peninsula|YEM|Yemen|0|0|0\n');
    writeFileSync(join(dir, 'list.txt'), [lib.LIST_MAGIC, '# a test', `# ${lib.LIST_COLUMNS.join('\t')}`, ['507335', 'Huernia hadhramautica', 'Lavranos', 'Apocynaceae', 'collector genus', '-'].join('\t'), ''].join('\n'));
    writeFileSync(join(dir, 'static/s/v3/g9584756.json'), JSON.stringify({ v: 3, key: 'g9584756', ids: { gbif: 9584756 }, name: { scientific: 'Ceropegia hadramautica', kew: { entry: '' } }, distribution: { native: [], via: { kind: 'synonym-of', entry: 'Huernia hadhramautica Lavranos', name: 'Huernia hadhramautica' } }, occurrences: { keys: [] } }));
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), 'list.txt', '--bulk', 'bulk', '--skip', 'wikidata,wikipedia,inat,commons', '--no-batch'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
    expect(r.stdout + r.stderr).toContain('1 species without a GBIF key not built: a page on disk holds each through its range, k507335 (Huernia hadhramautica Lavranos) by g9584756');
    expect(existsSync(join(dir, 'static/s/v3/k507335.json'))).toBe(false);
  }, 120_000);
});
