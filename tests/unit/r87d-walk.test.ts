/**
 * Round eighty-seven, the data agent: items 2, 3, 4 and 7 on the real builder, offline, in a folder of its own, as the
 * stage-2 walk derives a page: the live Begonia faustinoi (round eighty-six's fixture, r86r-dry-run.test.ts) on disk,
 * given a summary under another title with its proof, seven papers and an OpenAlex row, as a September build left them;
 * Kew's two rows for it, and GBIF's 24 records of its key as an SQL download.
 *
 * On r86 (db5a68d): the walk wrote the summary's record "carried from build of 2026-10-21; this build: …" (its proof
 * gone), kept the seven papers and the OpenAlex row, and wrote no `occurrences.api`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SQL_SELECT } from '../../src/lib/dossier/bulk';
import { writeZip } from '../../scripts/dev/zip-store';
import { recordedProof } from '../../src/lib/dossier/summary-fill';
import { LITERATURE_OFF } from '../../src/lib/dossier/sources/openalex';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, unknown> & { upstream: Record<string, unknown> }>;
const RECS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')).records as Record<string, Array<Record<string, string | number>>>;

const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const NAMES = `${NAMES_HEAD}\n361567|319366-2|Species|Accepted|Begoniaceae||Begonia||faustinoi||||Burt-Utley & Utley||Novon| 9: 486|(1999)||Mexico (Chiapas)||wet tropical|Begonia faustinoi|Burt-Utley & Utley|361567||||360866|319366-2||Y\n`;
const DIST = 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful\n508436|361567|7|NORTHERN AMERICA|79|Mexico|MXT|Mexico Southeast|0|0|0\n';
const KEY = '0038605-260928105237408';
const sqlCell = (r: Record<string, string | number>, a: string): string => {
  const m: Record<string, string> = { gbifid: 'key', specieskey: 'speciesKey', taxonkey: 'taxonKey', acceptedtaxonkey: 'acceptedTaxonKey', decimallatitude: 'decimalLatitude', decimallongitude: 'decimalLongitude', coordinateuncertaintyinmeters: 'coordinateUncertaintyInMeters', year: 'year', countrycode: 'countryCode', stateprovince: 'stateProvince', basisofrecord: 'basisOfRecord', license: 'license', datasetkey: 'datasetKey' };
  return m[a] && r[m[a]] != null ? String(r[m[a]]) : '';
};
const PROOF = "Wikipedia's article Faustino's begonia, the English article of this species' Wikidata item (Q15330128)";

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r87d-walk-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
  const d = structuredClone(DOS.k361567);
  d.summary = { text: 'Begonia faustinoi is a species of begonia.', source: 'wikipedia', url: "https://en.wikipedia.org/wiki/Faustino's_begonia", licence: 'CC BY-SA 4.0', title: "Faustino's begonia" };
  d.upstream.wikipedia = { status: 'ok', at: '2026-10-21T21:47:25.792Z', detail: PROOF };
  d.literature = Array.from({ length: 7 }, (_, i) => ({ title: `A paper ${i}`, year: 2020 }));
  d.upstream.openalex = { status: 'ok', at: '2026-09-12T00:00:00.000Z', detail: '7 works' };
  writeFileSync(join(dir, 'static/s/v3/k361567.json'), JSON.stringify(d));
  mkdirSync(join(dir, 'bulk'));
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), NAMES);
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), DIST);
  const head = SQL_SELECT.map(([, a]) => a);
  writeZip(join(dir, 'bulk/occurrence.zip'), { [`${KEY}.csv`]: [head.join('\t'), ...RECS.k361567.map((r) => head.map((a) => sqlCell(r, a)).join('\t'))].join('\n') + '\n' });
  writeFileSync(join(dir, 'bulk/download.json'), JSON.stringify({ key: KEY, format: 'SQL_TSV_ZIP', doi: '10.15468/dl.hbdw64', records: RECS.k361567.length, taxa: 1, csv: `${KEY}.csv`, created: '2026-10-21T12:22:16.192+00:00', fetched: '2026-10-22T08:00:00.000Z' }));
  writeFileSync(join(dir, 'list.txt'), 'k361567 Begonia faustinoi\n');
  return dir;
}

describe('an offline walk of one page, end to end on the real builder', () => {
  it("keeps the summary's proof, carries no paper, counts the API's records, and lists derived datasets and summaries", () => {
    const dir = folder();
    const r = builder(dir, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(r.stdout + r.stderr).toContain('1 built');
    const d = JSON.parse(readFileSync(join(dir, 'static/s/v3/k361567.json'), 'utf8'));
    // Item 2: the summary's record says the build that asked and its proof, as the Wikidata row is carried.
    expect(d.summary.title).toBe("Faustino's begonia");
    expect(d.upstream.wikipedia.detail).toBe(`carried from build of 2026-10-21 (rederive); that build: ${PROOF}`); // r86: "…; this build: …"
    expect(recordedProof(d.upstream.wikipedia)).toBe("the English article of this species' Wikidata item (Q15330128)");
    // Item 3: no paper, and the row that says why.
    expect(d.literature).toEqual([]); // r86: 7
    expect(d.upstream.openalex.status).toBe('skipped');
    expect(d.upstream.openalex.detail).toBe(LITERATURE_OFF);
    // Item 7: every record came from the download, so none through the API; the count is kept, empty, not absent.
    expect(d.occurrences.api).toEqual([]);
    expect(d.upstream['gbif.occurrences'].detail).toContain('GBIF occurrence download https://doi.org/10.15468/dl.hbdw64');
    // Item 4: nothing lost, so no drops.txt.
    expect(existsSync(join(dir, 'drops.txt'))).toBe(false);
    // The walk's last line names what the requests passed on were.
    expect(r.stdout).toMatch(/requests passed on: \d+ answered by GBIF's occurrence search/);

    const c = builder(dir, '--check-summaries');
    expect(c.status, c.stderr + c.stdout).toBe(0);
    expect(c.stdout).toContain("1 dossiers read, 1 with a Wikipedia summary: 0 under the page's name, 0 an older name of it, 1 its Wikidata item's article");
    expect(c.stdout).toContain("No page quotes another plant's article.");
    const l = builder(dir, '--list-derived');
    expect(l.status, l.stderr).toBe(0);
    expect(readFileSync(join(dir, 'derived-dataset.csv'), 'utf8')).toBe('datasetKey,count\n');
    const s = builder(dir, '--list-summaries-left');
    expect(s.stdout).toContain('1 summary not read as the article\'s opening paragraph');
    expect(readFileSync(join(dir, 'rebuild-summaries-left.txt'), 'utf8')).toBe("k361567 Begonia faustinoi\tsummary of Faustino's begonia not read as its opening paragraph\n");
  }, 120_000);
});
