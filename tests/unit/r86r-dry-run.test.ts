/**
 * Round eighty-six, the ranges agent: the range rule's dry run (outside review B's 6, the plan's B2: "dry run reports
 * records and climates lost per page before anything is written"). `npm run dossier -- --dry-run --offline --bulk bulk
 * [--grid climate] [--keys <file>] [--shapes-before <file>]` derives the pages as the walk does and writes nothing: no
 * dossier, index, report, cache or walk.json; it says, page by page and in total, the records admitted and dropped by
 * reason, the native regions read otherwise, and with the grid the climates gained and lost and the typical spots moved.
 *
 * End to end on the real builder, offline, in a folder of its own: the live Begonia faustinoi (round eighty-five's walk,
 * shapes rule r85; its climate lost in round eighty-five, review D4) on disk, Kew's own two rows for it, and GBIF's 24
 * records of its key as the review read them (an SQL download, the stated state of each kept). Its Union Juarez specimen
 * (GBIF 4168528352, Mexico's, 0.005° inside Guatemala's drawn line) is admitted by the border allowance.
 *
 * On r86base: FAILED (no `range-dry-run.ts`; `--dry-run` was no flag: the builder derived the page and wrote it, the index
 * and the report).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SQL_SELECT } from '../../src/lib/dossier/bulk';
import { writeZip } from '../../scripts/dev/zip-store';
import { pageChange, changeLine, tallyInto, transitionWords, DryRunTotals, type DryPage, type RangeTally } from '../../src/lib/dossier/range-dry-run';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, DryPage & Record<string, unknown>>;
const RECS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')).records as Record<string, Array<Record<string, string | number>>>;

describe('the comparison, page by page', () => {
  it("counts each record's two reasons, in words", () => {
    const t: RangeTally = new Map();
    const tally = tallyInto(t);
    tally(null, 'buffer', 2, { country: true, state: true, by: 'border-state' });
    tally('buffer', null, 3, { country: false, state: false });
    tally('strict', 'strict', 9, { country: true, state: false });
    expect([...t]).toEqual([['out>buffer:border-state:state', 2], ['buffer>out:no-country', 3]]);
    expect(transitionWords('out>buffer:border-state:state')).toBe('out → by the margin (across a border, by its stated state; a state stated)');
    expect(transitionWords('buffer>out:no-country')).toBe('by the margin → out (no country stated)');
  });
  it('a page that regains a climate: records admitted, the climate gained, said on one line --keys reads', () => {
    const prev = DOS.k361567;
    expect(prev.climate).toMatchObject({ status: 'none' });
    const next: DryPage = { ...prev, occurrences: { ...prev.occurrences, admitted: { strict: 16, buffer: 1, coast: 0, island: 0 } }, climate: { status: 'ok', cells: 3, records: 5, at: { lat: 15.075, lon: -92.125 }, place: 'Chiapas, Mexico' } };
    const t: RangeTally = new Map([['out>buffer:border', 1]]);
    const c = pageChange(prev, next, t, true);
    expect(c).toMatchObject({ records: [16, 17], gained: 1, dropped: 0, climate: { change: 'gained', before: 'none', after: 'ok', cells: [null, 3] } });
    expect(changeLine(c)).toBe('k361567 Begonia faustinoi\trecords in range 16 → 17, +1 admitted (out → by the margin (across a border): 1); climate GAINED: none → ok (3 cells)');
  });
  it('a page that loses one, and a typical spot that moves, are said; a page with no change is not', () => {
    const prev: DryPage = { key: 'k1', name: { scientific: 'Aus bus' }, occurrences: { admitted: { strict: 10, buffer: 2, coast: 1, island: 0 } }, climate: { status: 'ok', cells: 3, at: { lat: 1, lon: 1 } } };
    const lost = pageChange(prev, { ...prev, occurrences: { admitted: { strict: 10, buffer: 0, coast: 0, island: 0 } }, climate: { status: 'none', detail: 'only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km; three are needed for an envelope' } }, new Map([['buffer>out:no-country', 2], ['coast>out:no-country', 1]]), true);
    expect(changeLine(lost)).toBe('k1 Aus bus\trecords in range 13 → 10, −3 dropped (by the margin → out (no country stated): 2; off a coast → out (no country stated): 1); climate LOST: ok → none (only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km; three are needed for an envelope)');
    const moved = pageChange(prev, { ...prev, climate: { status: 'ok', cells: 3, at: { lat: 1.1, lon: 1 } } }, new Map(), true);
    expect(moved.spot?.km).toBeCloseTo(11.1, 1);
    expect(changeLine(pageChange(prev, prev, new Map(), true))).toBeNull();
    // Without the grid, the climate is not compared.
    expect(pageChange(prev, { ...prev, climate: { status: 'pending' } }, new Map(), false).climate).toBeUndefined();
    const tot = new DryRunTotals();
    for (const c of [lost, moved, pageChange(prev, prev, new Map(), true)]) tot.add(c);
    expect(tot.lines(true)).toEqual([
      '3 pages derived, nothing written; 2 change under this rule',
      'records: +0 admitted on 0 pages, −3 dropped on 1 pages, 0 in by another reason',
      '    by the margin → out (no country stated): 2',
      '    off a coast → out (no country stated): 1',
      'native ranges read otherwise: 0 pages',
      'climates: 0 gained, 1 lost, 0 kept with other cells; typical spots moved: 1 (1 by 10 km or more)'
    ]);
  });
  it('a native range read otherwise is said (Stapelia hirsuta: Namibia added)', () => {
    const prev = DOS.k512033;
    const next: DryPage = { ...prev, distribution: { native: [{ code: 'CPP', name: 'Cape Provinces' }, { code: 'NAM', name: 'Namibia' }] } };
    expect(pageChange(prev, next, new Map(), false).regions).toEqual({ added: ['NAM'], removed: [] });
  });
});

const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
// Kew's rows for Begonia faustinoi, as Kew's file of 2026-06-04 writes them.
const NAMES = `${NAMES_HEAD}\n361567|319366-2|Species|Accepted|Begoniaceae||Begonia||faustinoi||||Burt-Utley & Utley||Novon| 9: 486|(1999)||Mexico (Chiapas)||wet tropical|Begonia faustinoi|Burt-Utley & Utley|361567||||360866|319366-2||Y\n`;
const DIST = 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful\n508436|361567|7|NORTHERN AMERICA|79|Mexico|MXT|Mexico Southeast|0|0|0\n';
const KEY = '0038605-260928105237408';
const sqlCell = (r: Record<string, string | number>, a: string): string => {
  const m: Record<string, string> = { gbifid: 'key', specieskey: 'speciesKey', taxonkey: 'taxonKey', acceptedtaxonkey: 'acceptedTaxonKey', decimallatitude: 'decimalLatitude', decimallongitude: 'decimalLongitude', coordinateuncertaintyinmeters: 'coordinateUncertaintyInMeters', year: 'year', countrycode: 'countryCode', stateprovince: 'stateProvince', basisofrecord: 'basisOfRecord', license: 'license', datasetkey: 'datasetKey' };
  return m[a] && r[m[a]] != null ? String(r[m[a]]) : '';
};
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r86r-dry-run-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
  writeFileSync(join(dir, 'static/s/v3/k361567.json'), JSON.stringify(DOS.k361567));
  mkdirSync(join(dir, 'bulk'));
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), NAMES);
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), DIST);
  const head = SQL_SELECT.map(([, a]) => a);
  writeZip(join(dir, 'bulk/occurrence.zip'), { [`${KEY}.csv`]: [head.join('\t'), ...RECS.k361567.map((r) => head.map((a) => sqlCell(r, a)).join('\t'))].join('\n') + '\n' });
  writeFileSync(join(dir, 'bulk/download.json'), JSON.stringify({ key: KEY, format: 'SQL_TSV_ZIP', doi: '10.15468/dl.hbdw64', records: RECS.k361567.length, taxa: 1, csv: `${KEY}.csv`, created: '2026-10-21T12:22:16.192+00:00', fetched: '2026-10-22T08:00:00.000Z' }));
  writeFileSync(join(dir, 'list.txt'), 'k361567 Begonia faustinoi\n');
  return dir;
}
/** Every file under a folder, with its size and time: what a run that writes nothing leaves as it found. */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(`${relative(dir, p)} ${s.size} ${s.mtimeMs}`); } };
  walk(dir);
  return out.sort();
}

describe('--dry-run, end to end on the real builder', () => {
  it("derives Begonia faustinoi offline, admits its Union Juarez record, says it, and writes nothing but its own list", () => {
    const dir = folder();
    const before = files(dir);
    const disk = readFileSync(join(dir, 'static/s/v3/k361567.json'), 'utf8');
    const r = builder(dir, '--dry-run', '--offline', '--bulk', 'bulk', '--keys', 'list.txt');
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('dry run: nothing is written');
    expect(r.stdout).toMatch(/Δ k361567 Begonia faustinoi: records in range 16 → \d+, \+1 admitted \(out → by the margin \(across a border; a state stated\): 1\)/);
    expect(r.stdout).toContain('Dry run, rule r86 against the dossiers on disk (nothing written but dry-run-records.txt):');
    expect(r.stdout).toContain('1 pages derived, nothing written; 1 change under this rule');
    expect(r.stdout).toContain('climates: not derived in this run (no --grid)');
    // Nothing else is written: the dossier, the index, the report, walk.json, the caches.
    expect(readFileSync(join(dir, 'static/s/v3/k361567.json'), 'utf8')).toBe(disk);
    const after = files(dir).filter((f) => !f.startsWith('dry-run-records.txt '));
    expect(after).toEqual(before);
    expect(readFileSync(join(dir, 'dry-run-records.txt'), 'utf8')).toMatch(/^k361567 Begonia faustinoi\trecords in range 16 → \d+, \+1 admitted/);
    expect(existsSync(join(dir, 'static/s/v3/index.json'))).toBe(false);
  }, 180_000);
  it('refuses to run otherwise than the walk derives (online, or with --upload)', () => {
    const dir = folder();
    const r = builder(dir, '--dry-run', '--bulk', 'bulk', '--keys', 'list.txt');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--dry-run derives as the walk does and writes nothing');
    expect(existsSync(join(dir, 'static/s/v3/index.json'))).toBe(false);
  }, 120_000);
});
