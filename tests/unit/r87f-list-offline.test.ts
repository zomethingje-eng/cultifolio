/**
 * Round eighty-seven, the review of the pipeline's changes (S2 and S3), the data fix: `--list-offline`.
 *
 * rebuild-offline.txt, the pages an offline build could not derive again (a source of the range not asked), was written
 * by the walk only when a run finished (S2: a walk killed and resumed lost the pages of its first part), and listed only
 * a page whose range was carried (S3: one with nothing to carry, its row "skipped" and no range, was never listed). It is
 * now `--list-offline`'s, read from the dossiers on disk as `--list-summaries-left` is; the walk's last line points to it.
 *
 * On r87s1 (381aea9): there was no `--list-offline`, and the walk wrote rebuild-offline.txt itself.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SQL_SELECT } from '../../src/lib/dossier/bulk';
import { writeZip } from '../../scripts/dev/zip-store';
import { offlineWhy, offlinePages } from '../../src/lib/dossier/offline-list';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, unknown> & { upstream: Record<string, unknown> }>;
const RECS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')).records as Record<string, Array<Record<string, string | number>>>;

const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
// Kew's file holds another plant only: the page's range is read, online, through GBIF's older names for it.
const NAMES = `${NAMES_HEAD}\n1|1-1|Species|Accepted|Aizoaceae||Conophytum||bilobum||||(Marloth) N.E.Br.||||(1922)||Cape Prov.|succulent|desert|Conophytum bilobum|(Marloth) N.E.Br.|1||||||N\n`;
const DIST = 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful\n';
const KEY = '0038605-260928105237408';
const sqlCell = (r: Record<string, string | number>, a: string): string => {
  const m: Record<string, string> = { gbifid: 'key', specieskey: 'speciesKey', taxonkey: 'taxonKey', acceptedtaxonkey: 'acceptedTaxonKey', decimallatitude: 'decimalLatitude', decimallongitude: 'decimalLongitude', coordinateuncertaintyinmeters: 'coordinateUncertaintyInMeters', year: 'year', countrycode: 'countryCode', stateprovince: 'stateProvince', basisofrecord: 'basisOfRecord', license: 'license', datasetkey: 'datasetKey' };
  return m[a] && r[m[a]] != null ? String(r[m[a]]) : '';
};

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'r87f-offline-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
  const d = structuredClone(DOS.k361567);
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


const NOT_ASKED = "not asked: offline: Kew's file of 2026-11-09 holds no row of Conophytum tomasii S.A.Hammer, and GBIF's older names for it, by which an online build reads Kew's range, were not asked";
const page = (upstream: Record<string, { status: string; detail?: string }>, rangeRule = 'r87') => ({ key: 'g1', name: { scientific: 'Conophytum tomasii' }, upstream, occurrences: { rangeRule } });

describe('which pages are listed', () => {
  it('a range carried because a source of it was not asked, and one with nothing to carry', () => {
    const carried = `carried from build of 2026-10-22 as one snapshot; that build: Kew's distribution; this build: wcvp.distribution skipped (${NOT_ASKED})`;
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: carried }, 'wcvp.distribution': { status: 'ok', detail: carried } }, 'r86'), 'r87')).toBe(`the range, records and climate of the build of 2026-10-22 kept: this build: wcvp.distribution skipped (${NOT_ASKED}); records tested by shapes rule r86, not r87`);
    // S3: no build before to carry from (or another key's), so the page holds this build's derivation without Kew's range.
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: 'GBIF occurrence download' }, 'wcvp.distribution': { status: 'skipped', detail: NOT_ASKED } }), 'r87')).toBe(`wcvp.distribution not asked (${NOT_ASKED}); nothing carried`);
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: 'carried from build of 2026-10-22 as one snapshot; this build: gbif.occurrences skipped' } }), 'r87')).toMatch(/^the range, records and climate of the build of 2026-10-22 kept: this build: gbif\.occurrences skipped$/);
  });
  it('not a page whose range was asked and answered', () => {
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: 'GBIF occurrence download' }, 'wcvp.distribution': { status: 'ok', detail: "Kew's distribution" } }), 'r87')).toBeNull();
    // Round ninety (r90d): one carried over a refusal is listed now, to be asked again: since round eighty-nine the walk
    // asks GBIF's search too, so a refusal is no longer an online build's alone.
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: 'carried from build of 2026-10-22 as one snapshot; this build: gbif.occurrences refused' } }), 'r87')).toBe('the range, records and climate of the build of 2026-10-22 kept: this build: gbif.occurrences refused');
    // Another source not asked offline (Wikidata, carried) is not the range's.
    expect(offlineWhy(page({ wikidata: { status: 'skipped', detail: 'www.wikidata.org not asked: offline re-derivation' }, 'gbif.occurrences': { status: 'ok' }, 'wcvp.distribution': { status: 'ok' } }), 'r87')).toBeNull();
    expect(offlinePages([page({ 'wcvp.distribution': { status: 'skipped', detail: NOT_ASKED } }), { ...page({}), key: 'g2' }], 'r87')).toEqual([`g1 Conophytum tomasii\twcvp.distribution not asked (${NOT_ASKED}); nothing carried`]);
  });
});

describe('the walk and --list-offline, end to end on the real builder', () => {
  it('the walk lists nothing itself and points to --list-offline; the list reads every page on disk, whichever run built it', () => {
    const dir = folder();
    // A first part of the walk: Begonia faustinoi, whose name Kew's file here does not hold, its range carried.
    const r = builder(dir, '--keys', 'list.txt', '--offline', '--bulk', 'bulk');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('1 page built in this run had a source of the range not asked offline (the rows say which; the range, records and climate of the build before kept where it had them): list every such page on disk with --list-offline (→ rebuild-offline.txt), then build them online with --keys rebuild-offline.txt --grid climate --bulk bulk');
    expect(existsSync(join(dir, 'rebuild-offline.txt'))).toBe(false); // r87s1: written by the walk, at its end only
    // A page another part of the walk built with nothing to carry (S3): on disk, its row "skipped", no range.
    const other = structuredClone(DOS.k294532) as Record<string, unknown> & { upstream: Record<string, unknown>; key: string; occurrences: Record<string, unknown> };
    other.upstream['wcvp.distribution'] = { status: 'skipped', at: '2026-11-09T00:00:00.000Z', detail: NOT_ASKED };
    other.occurrences.rangeRule = 'r87';
    writeFileSync(join(dir, `static/s/v3/${other.key}.json`), JSON.stringify(other));
    const l = builder(dir, '--list-offline');
    expect(l.status, l.stderr).toBe(0);
    expect(l.stdout).toContain('2 pages whose range an offline build did not derive again, a source of it not asked → rebuild-offline.txt');
    const lines = readFileSync(join(dir, 'rebuild-offline.txt'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const id = readdirSync(join(dir, 'static/s/v3')).find((f) => f !== `${other.key}.json` && /^[gk]\d+\.json$/.test(f))!.replace('.json', '');
    expect(lines[0]).toMatch(new RegExp(`^${id} Begonia faustinoi\tthe range, records and climate of the build of 2026-11-01 kept: this build: wcvp\\.distribution skipped \\(not asked: offline: Kew's file of \\d{4}-\\d{2}-\\d{2} holds no row of Begonia faustinoi Burt-Utley & Utley, .*\\); records tested by shapes rule r85, not r87$`));
    expect(lines[1]).toBe(`${other.key} Albuca fastigiata\twcvp.distribution not asked (${NOT_ASKED}); nothing carried`);
    // Nothing left: the list goes.
    other.upstream['wcvp.distribution'] = { status: 'ok', detail: "Kew's distribution" };
    writeFileSync(join(dir, `static/s/v3/${other.key}.json`), JSON.stringify(other));
    for (const f of readdirSync(join(dir, 'static/s/v3')).filter((f) => f !== `${other.key}.json` && /^[gk]\d+\.json$/.test(f))) {
      const d = JSON.parse(readFileSync(join(dir, 'static/s/v3', f), 'utf8'));
      for (const k of ['gbif.occurrences', 'wcvp.distribution', 'climate']) d.upstream[k] = { status: 'ok', detail: 'asked' };
      writeFileSync(join(dir, 'static/s/v3', f), JSON.stringify(d));
    }
    const n = builder(dir, '--list-offline');
    expect(n.stdout).toContain('0 pages whose range an offline build did not derive again');
    expect(existsSync(join(dir, 'rebuild-offline.txt'))).toBe(false);
  }, 120_000);
});
