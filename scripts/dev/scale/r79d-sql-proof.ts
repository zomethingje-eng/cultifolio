/**
 * Round seventy-nine, agent D: the two routes of GBIF's records give the same dossiers. A dev proof; nothing in the build
 * runs it.
 *
 * Real records of a few species are read once from GBIF's occurrence search (the build's own filter: coordinates, no
 * geospatial issue, present; 300 a page, at most four pages a species, one request a second), and written in both of
 * GBIF's shapes:
 *
 *   - a Darwin Core Archive: occurrence.txt under every interpreted column GBIF's DWCA has, in GBIF's order
 *     (`GET /v1/occurrence/download/describe/dwca`), each filled from the record where the search gives it, and
 *     multimedia.txt of every record's media;
 *   - an SQL download (SQL_TSV_ZIP): one <key>.csv of `SQL_SELECT`'s fifteen columns under its aliases, the rows in
 *     another order, as GBIF wrote 0035024-260928105237408 (empty for null, Java's doubles, GBIF's licence codes),
 *     beside the images' download (media.zip: a DWCA of the imaged human observations, in a third order), once with
 *     iNaturalist's dataset and once without it.
 *
 * Each is read by the build's own loader (`loadOccurrences`), and each species is built by the build's own builder
 * (`buildDossier`) through the build's own bulk fetcher; GBIF's other answers (the name, synonyms, common names, range)
 * are asked once and shared by every build, since they are not under test, and iNaturalist, Commons, Wikidata,
 * Wikipedia and OpenAlex are not asked (each build marks them alike). Then the dossiers are compared field for field,
 * their times set aside. Run twice, with the build's cap of 2,000 records a species and with a cap of 100, so the
 * sample is drawn and not merely kept whole.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r79d-sql-proof.ts <work dir> <describe-dwca.json>
 *
 * Writes <work dir>/proof.json and prints a summary; the records are kept in <work dir>/records.json for a re-run.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { buildDossier } from '../../../src/lib/dossier/build';
import { makeFetcher, type JsonFetcher, type FetchResult } from '../../../src/lib/dossier/fetch';
import { bulkFetcher, SQL_SELECT } from '../../../src/lib/dossier/bulk';
import { loadOccurrences } from '../../bulk-load';
import { writeZip } from '../zip-store';

const [work, describePath] = process.argv.slice(2);
mkdirSync(work, { recursive: true });
const SPECIES: Array<[number, string]> = [
  [7293764, 'Cyphostemma serpens'],
  [2766899, 'Agave tequilana'],
  [5383983, 'Schlumbergera truncata'],
  [2941713, 'Clianthus puniceus'],
  [7831395, 'Talinum arnotii'],
  [5689215, 'Sedum potosinum'],
  [2776861, 'Drimia ciliata']
];
const INAT = '50c9509d-22c7-4a22-a47d-8c48425ef4a7';
const UA = 'cultifolio-review/79';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One request a second to any host, a 429 or 503 backed off.
let last = 0;
const paced = (async (input: RequestInfo | URL, init?: RequestInit) => {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(input, { ...init, headers: { ...(init?.headers ?? {}), 'user-agent': UA } });
    if ((res.status === 429 || res.status === 503) && attempt < 5) { await sleep(1000 * Number(res.headers.get('retry-after') ?? 2 ** (attempt + 3))); continue; }
    return res;
  }
}) as typeof fetch;

type Media = { type?: string; format?: string; identifier?: string; references?: string; title?: string; creator?: string; license?: string; rightsHolder?: string; publisher?: string; created?: string };
type Rec = Record<string, unknown> & { key: number; media?: Media[] };

async function records(): Promise<Record<number, Rec[]>> {
  const cache = join(work, 'records.json');
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const out: Record<number, Rec[]> = {};
  for (const [key, name] of SPECIES) {
    out[key] = [];
    for (let page = 0; page < 4; page++) {
      const url = `https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=300&offset=${page * 300}`;
      const d = (await (await paced(url)).json()) as { results: Rec[]; endOfRecords: boolean; count: number };
      out[key].push(...d.results);
      if (d.endOfRecords) break;
    }
    console.log(`  ${name}: ${out[key].length} records read`);
  }
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

/** A licence as GBIF's archives write it: the code (`CC_BY_4_0`), where the search answers with the deed's address. */
const licenceCode = (s: unknown): string => {
  const t = String(s ?? '').toLowerCase();
  if (!t) return '';
  if (/publicdomain\/zero|cc0/.test(t)) return 'CC0_1_0';
  if (/by-nc/.test(t)) return 'CC_BY_NC_4_0';
  if (/\/by\//.test(t) || /cc_by_4_0/.test(t)) return 'CC_BY_4_0';
  return String(s);
};
/** A double as Java writes it (`Double.toString`), which both of GBIF's writers use: "90.0", "47.563873". */
const javaDouble = (n: unknown): string => (typeof n === 'number' ? (Number.isInteger(n) ? `${n}.0` : String(n)) : '');
const cell = (v: unknown): string => (v == null ? '' : Array.isArray(v) ? v.join(';') : typeof v === 'object' ? '' : String(v)).replace(/[\t\r\n]+/g, ' ');

function dwcaValue(r: Rec, name: string): string {
  switch (name) {
    case 'gbifID': return String(r.key);
    case 'license': return licenceCode(r.license);
    case 'decimalLatitude': case 'decimalLongitude': case 'coordinateUncertaintyInMeters': case 'coordinatePrecision': return javaDouble(r[name]);
    case 'mediaType': return [...new Set((r.media ?? []).map((m) => m.type).filter(Boolean))].join(';');
    default: return cell(r[name]);
  }
}
const SQL_FROM: Record<string, string> = { gbifid: 'gbifID', specieskey: 'speciesKey', taxonkey: 'taxonKey', acceptedtaxonkey: 'acceptedTaxonKey', decimallatitude: 'decimalLatitude', decimallongitude: 'decimalLongitude', coordinateuncertaintyinmeters: 'coordinateUncertaintyInMeters', coordinateprecision: 'coordinatePrecision', year: 'year', countrycode: 'countryCode', basisofrecord: 'basisOfRecord', license: 'license', datasetkey: 'datasetKey', establishmentmeans: 'establishmentMeans', degreeofestablishment: 'degreeOfEstablishment' };
const MEDIA_COLS = ['gbifID', 'type', 'format', 'identifier', 'references', 'title', 'description', 'source', 'audience', 'created', 'creator', 'contributor', 'publisher', 'license', 'rightsHolder'];
const mediaRows = (rs: Rec[]) => rs.flatMap((r) => (r.media ?? []).map((m) => MEDIA_COLS.map((c) => (c === 'gbifID' ? String(r.key) : cell((m as Record<string, unknown>)[c]))).join('\t')));
const order = <T,>(a: T[], seed: number) => a.map((x, i) => [((i + 1) * 2654435761 * seed) % 4294967291, x] as const).sort((p, q) => p[0] - q[0]).map(([, x]) => x);

async function main() {
  const describe = JSON.parse(readFileSync(describePath, 'utf8')) as { interpreted: { fields: Array<{ name: string }> } };
  const DWCA_COLS = describe.interpreted.fields.map((f) => f.name);
  const byKey = await records();
  const all = Object.values(byKey).flat();
  const keys = SPECIES.map(([k]) => k);
  const imaged = all.filter((r) => (r.media ?? []).some((m) => /still/i.test(m.type ?? '')) && r.basisOfRecord === 'HUMAN_OBSERVATION');
  const dwcaOf = (rs: Rec[]) => ({ 'occurrence.txt': [DWCA_COLS.join('\t'), ...rs.map((r) => DWCA_COLS.map((c) => dwcaValue(r, c)).join('\t'))].join('\n') + '\n', 'multimedia.txt': [MEDIA_COLS.join('\t'), ...mediaRows(rs)].join('\n') + '\n', 'verbatim.txt': 'gbifID\n', 'meta.xml': '<archive/>\n' });
  const sqlText = (rs: Rec[]) => [SQL_SELECT.map(([, a]) => a).join('\t'), ...rs.map((r) => SQL_SELECT.map(([, a]) => dwcaValue(r, SQL_FROM[a])).join('\t'))].join('\n') + '\n';
  const meta = (key: string, doi: string, csv: string, media?: string, extra: object = {}) => JSON.stringify({ key, doi, csv, ...(media ? { media } : {}), fetched: '2026-10-20T12:00:00.000Z', ...extra });

  const A = join(work, 'dwca'), B = join(work, 'sql'), C = join(work, 'sql-no-inat');
  for (const d of [A, B, C]) mkdirSync(d, { recursive: true });
  writeZip(join(A, 'occurrence.zip'), dwcaOf(all));
  writeFileSync(join(A, 'download.json'), meta('0000001-261020000000000', '10.15468/dl.proof1', 'occurrence.txt', 'multimedia.txt'));
  for (const d of [B, C]) {
    writeZip(join(d, 'occurrence.zip'), { '0000002-261020000000000.csv': sqlText(order(all, 7)) });
    writeFileSync(join(d, 'download.json'), meta('0000002-261020000000000', '10.15468/dl.proof1', '0000002-261020000000000.csv', undefined, { format: 'SQL_TSV_ZIP' }));
  }
  writeZip(join(B, 'media.zip'), dwcaOf(order(imaged, 13)));
  writeFileSync(join(B, 'media-download.json'), meta('0000003-261020000000000', '10.15468/dl.proof3', 'occurrence.txt', 'multimedia.txt', { inat: true }));
  writeZip(join(C, 'media.zip'), dwcaOf(order(imaged.filter((r) => r.datasetKey !== INAT), 13)));
  writeFileSync(join(C, 'media-download.json'), meta('0000004-261020000000000', '10.15468/dl.proof4', 'occurrence.txt', 'multimedia.txt', { inat: false }));

  // The SQL download's size a row, zipped, the rows in GBIF's arbitrary order (deflate, as GBIF's zip): the estimate's figure.
  const sql = Buffer.from(sqlText(order(all, 7))), dw = Buffer.from(dwcaOf(all)['occurrence.txt'] + dwcaOf(all)['multimedia.txt']);
  const sizes = { rows: all.length, sqlBytes: sql.length, sqlZipped: deflateRawSync(sql, { level: 6 }).length, dwcaOccMediaZipped: deflateRawSync(dw, { level: 6 }).length };

  // GBIF's other answers, asked once and shared by every build: not under test.
  const net = makeFetcher(paced);
  const shared = new Map<string, Promise<FetchResult<unknown>>>();
  const sharedFetcher = (async <T,>(url: string, o?: Parameters<JsonFetcher>[1]) => {
    if (/\/occurrence\/search\?/.test(url)) return { status: 'skipped', detail: 'not asked by the proof' } as FetchResult<T>;
    if (!shared.has(url)) shared.set(url, net(url, o));
    return (await shared.get(url)) as FetchResult<T>;
  }) as JsonFetcher;
  const strip = (d: unknown): unknown => JSON.parse(JSON.stringify(d, (k, v) => (k === 'at' || k === 'built' || k === 'changed' ? undefined : v)));
  const result: Record<string, unknown> = { at: new Date().toISOString(), species: SPECIES.length, records: all.length, imaged: imaged.length, imagedInat: imaged.filter((r) => r.datasetKey === INAT).length, sizes };
  for (const cap of [2000, 100]) {
    const loaded = { dwca: await loadOccurrences(A, cap, new Set(keys)), sql: await loadOccurrences(B, cap, new Set(keys)), sqlNoInat: await loadOccurrences(C, cap, new Set(keys)) };
    const built: Record<string, Record<number, unknown>> = {};
    for (const [route, l] of Object.entries(loaded)) {
      built[route] = {};
      const f = bulkFetcher(sharedFetcher, { occ: l!.occ, media: l!.media ?? undefined, covered: new Set(keys) });
      for (const [key, name] of SPECIES) {
        const r = await buildDossier(key, { fetcher: f, builtBy: 'node', skip: ['inat', 'commons', 'openalex', 'wikidata', 'wikipedia'], mediaFirst: true });
        built[route][key] = r.ok ? strip(r.dossier) : { failed: r };
        if (!r.ok) console.log(`  ${route} ${name}: not built (${JSON.stringify(r).slice(0, 200)})`);
      }
    }
    const compare = (x: string, y: string) => SPECIES.map(([key, name]) => {
      const a = built[x][key] as Record<string, unknown>, b = built[y][key] as Record<string, unknown>;
      const differs = [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => (k === 'upstream' ? [...new Set([...Object.keys((a.upstream ?? {}) as object), ...Object.keys((b.upstream ?? {}) as object)])].filter((u) => JSON.stringify((a.upstream as Record<string, unknown>)?.[u]) !== JSON.stringify((b.upstream as Record<string, unknown>)?.[u])).map((u) => `upstream.${u}`) : JSON.stringify(a[k]) !== JSON.stringify(b[k]) ? [k] : []));
      const photos = (d: Record<string, unknown>) => ((d.photos ?? []) as Array<{ src?: string; url: string }>).filter((p) => p.src === 'gbif').map((p) => p.url);
      return { key, name, fields: Object.keys(a).length, equal: !differs.length, differs, records: ((a.occurrences as { open?: unknown[] })?.open ?? []).length, gbifPhotos: [photos(a).length, photos(b).length], inatHostPhotos: [photos(a).filter((u) => /inaturalist/.test(u)).length, photos(b).filter((u) => /inaturalist/.test(u)).length] };
    });
    const sameRows = keys.every((k) => JSON.stringify(loaded.dwca!.occ.get(k)?.map(({ downloadDoi, ...r }) => r)) === JSON.stringify(loaded.sql!.occ.get(k)?.map(({ downloadDoi, ...r }) => r)));
    const samePhotos = keys.every((k) => JSON.stringify(loaded.dwca!.media?.page(k)) === JSON.stringify(loaded.sql!.media?.page(k)));
    result[`cap${cap}`] = { kept: Object.fromEntries(keys.map((k) => [k, loaded.dwca!.occ.get(k)?.length ?? 0])), sameRows, samePhotos, dwcaVsSql: compare('dwca', 'sql'), dwcaVsSqlNoInat: compare('dwca', 'sqlNoInat') };
    const s = result[`cap${cap}`] as { dwcaVsSql: Array<{ equal: boolean }>; dwcaVsSqlNoInat: Array<{ equal: boolean; differs: string[] }> };
    console.log(`cap ${cap}: rows the same ${sameRows}, photographs the same ${samePhotos}; dossiers DWCA = SQL with the images' download: ${s.dwcaVsSql.filter((x) => x.equal).length} of ${SPECIES.length}; DWCA = SQL with the images' download without iNaturalist: ${s.dwcaVsSqlNoInat.filter((x) => x.equal).length} of ${SPECIES.length} (differ in ${[...new Set(s.dwcaVsSqlNoInat.flatMap((x) => x.differs))].join(', ') || 'nothing'})`);
  }
  writeFileSync(join(work, 'proof.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ records: all.length, imaged: imaged.length, sizes, sqlBytesPerRowZipped: +(sizes.sqlZipped / all.length).toFixed(1), dwcaOccMediaBytesPerRecordZipped: +(sizes.dwcaOccMediaZipped / all.length).toFixed(1) }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
