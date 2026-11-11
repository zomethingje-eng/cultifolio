/**
 * Round eighty-eight (the speed round): twelve offline pages made from round eighty-six's Begonia faustinoi, for the
 * tests that the faster paths write what the slower ones wrote (r88s-pages, r88s-walk-report).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SQL_SELECT } from '../../../src/lib/dossier/bulk';
import { writeZip } from '../../../scripts/dev/zip-store';

export const ROOT = resolve('.');
export const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json'), CULTIFOLIO_TRACE_PAGES: '1' } });
/** The most derivations in flight at one moment, from the trace's begin and end lines. */
export const mostAtOnce = (err: string) => { let n = 0, most = 0; for (const l of err.split('\n')) { if (l.startsWith('trace begin')) most = Math.max(most, ++n); else if (l.startsWith('trace end')) n--; } return most; };
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, unknown> & { upstream: Record<string, unknown> }>;
const RECS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-records.json', 'utf8')).records as Record<string, Array<Record<string, string | number>>>;
const NAMES_HEAD = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed';
const KEY = '0038605-260928105237408';
export const N = 12;
export const sp = (i: number) => ({ id: String(9361000 + i), gbif: 94159000 + i, epithet: `probei${String.fromCharCode(97 + i)}` });
const sqlCell = (r: Record<string, string | number>, a: string): string => {
  const m: Record<string, string> = { gbifid: 'key', specieskey: 'speciesKey', taxonkey: 'taxonKey', acceptedtaxonkey: 'acceptedTaxonKey', decimallatitude: 'decimalLatitude', decimallongitude: 'decimalLongitude', coordinateuncertaintyinmeters: 'coordinateUncertaintyInMeters', year: 'year', countrycode: 'countryCode', stateprovince: 'stateProvince', basisofrecord: 'basisOfRecord', license: 'license', datasetkey: 'datasetKey' };
  return m[a] && r[m[a]] != null ? String(r[m[a]]) : '';
};

export function folder(only?: (i: number) => boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'r88s-pages-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(resolve('scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
  mkdirSync(join(dir, 'bulk'));
  const names: string[] = [NAMES_HEAD], dist: string[] = ['plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'];
  const rows: Array<Record<string, string | number>> = [], list: string[] = [];
  for (let i = 0; i < N; i++) {
    const s = sp(i), name = `Begonia ${s.epithet}`;
    const d = structuredClone(DOS.k361567) as Record<string, any>;
    d.key = `k${s.id}`; d.slug = `begonia-${s.epithet}`;
    d.ids = { gbif: s.gbif };
    d.name = { ...d.name, scientific: name, kew: { ...d.name.kew, entry: s.id, accepted: { ...(d.name.kew.accepted ?? {}), name } } };
    if (!only || only(i)) writeFileSync(join(dir, `static/s/v3/k${s.id}.json`), JSON.stringify(d));
    names.push(`${s.id}||Species|Accepted|Begoniaceae||Begonia||${s.epithet}||||Burt-Utley & Utley||Novon| 9: 486|(1999)||Mexico (Chiapas)||wet tropical|${name}|Burt-Utley & Utley|${s.id}||||360866|||Y`);
    dist.push(`${700000 + i}|${s.id}|7|NORTHERN AMERICA|79|Mexico|MXT|Mexico Southeast|0|0|0`);
    if (i % 5 !== 0) for (const r of RECS.k361567) rows.push({ ...r, key: Number(r.key) + i * 1_000_000, decimalLatitude: Number(r.decimalLatitude) + 0.4 * i, decimalLongitude: Number(r.decimalLongitude) - 0.3 * i, speciesKey: s.gbif, taxonKey: s.gbif, acceptedTaxonKey: s.gbif });
    list.push(`k${s.id} ${name}`);
  }
  writeFileSync(join(dir, 'bulk/wcvp_names.csv'), names.join('\n') + '\n');
  writeFileSync(join(dir, 'bulk/wcvp_distribution.csv'), dist.join('\n') + '\n');
  const head = SQL_SELECT.map(([, a]) => a);
  writeZip(join(dir, 'bulk/occurrence.zip'), { [`${KEY}.csv`]: [head.join('\t'), ...rows.map((r) => head.map((a) => sqlCell(r, a)).join('\t'))].join('\n') + '\n' });
  writeFileSync(join(dir, 'bulk/download.json'), JSON.stringify({ key: KEY, format: 'SQL_TSV_ZIP', doi: '10.15468/dl.hbdw64', records: rows.length, taxa: N, csv: `${KEY}.csv`, created: '2026-10-21T12:22:16.192+00:00', fetched: '2026-10-22T08:00:00.000Z' }));
  writeFileSync(join(dir, 'list.txt'), list.join('\n') + '\n');
  // The keys the download was asked for, by name (bulk-fetch's keys.json), so a build keeps the keys of the pages it
  // builds, as the owner's does, rather than every key (round eighty-eight, 3: a resumed walk's keys).
  writeFileSync(join(dir, 'bulk/keys.json'), JSON.stringify(Object.fromEntries(Array.from({ length: N }, (_, i) => [`Begonia ${sp(i).epithet}`, sp(i).gbif]))));
  return dir;
}
/** A dossier with the build's own times taken out (`built`, and each source's `at`), which two runs cannot share. */
export const settled = (text: string) => JSON.stringify(JSON.parse(text), (k, v) => (k === 'built' || k === 'at' ? undefined : v));
export const pages = (dir: string) => Object.fromEntries(readdirSync(join(dir, 'static/s/v3')).filter((f) => /^k\d+\.json$/.test(f)).sort().map((f) => [f, settled(readFileSync(join(dir, 'static/s/v3', f), 'utf8'))]));
/** The log's page lines, in order, each without its time. */
export const pageLines = (out: string) => out.split('\n').filter((l) => /^(\[\d+\/\d+\] )?[✓✗·Δ] /.test(l)).map((l) => l.replace(/ \(\d+ ms\)$/, ''));

