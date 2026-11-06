/**
 * Round eighty-six, the ranges agent: what a page says of its range, on Kew's own rows (`wcvp_names.csv` and
 * `wcvp_distribution.csv` of 2026-06-04, the rows quoted below) and live dossiers (`fixtures/r86r-dossiers.json`).
 *
 * 5. Review D10 and S: Stapelia hirsuta, headed by Kew's species (512033: CPP and NAM, "SW. Namibia to Cape Prov."),
 *    showed var. hirsuta's Cape Provinces, reached by GBIF's Ceropegia pulvinata: round eighty kept a name's answer for an
 *    entry below the page's. The page's own entry's range now.
 * 6. Review D2: the Poor Knights lily's typical spot is Auckland, among garden plants, beside a quote that says it grows
 *    only on two islands; the check called the case fixed. Kew's geographic_area ("New Zealand (Poor Knights Is., Hen I.)")
 *    is read and shown on the page and beside the few-records spot; the check holds the case open, never "fixed".
 * 7. The Howea finding: Lord Howe Island is 1 to 2 km across, and the elevation layer's 60″ pixels read the cell of
 *    Howea belmoreana's north-western records as sea, so the page had two land cells and no climate. A cell the layer reads
 *    as sea where a native region's drawn land lies is read, with no elevation, and said.
 * 8. The plan's B16: Kew gives a range only as a level-2 region or a continent ("Mexico (?)" for Agave calodonta, "Trop.
 *    America (?)" for Caladium praetermissum, whose region had no name and whose index origin was ""). Kept, named as Kew
 *    names it, said as wider than any region records are tested against (not "country level", untrue of Malesia), and
 *    listed for the browse work (`wide-origins.ts`: 8 pages of the live index).
 *
 * On r86base: 5 FAILED (CPP alone), 6 FAILED (no `area`; the sentence names no Kew area; "fixed: Xeronema"), 7 FAILED
 * (two land cells, no climate), 8 FAILED (the continent's row named ""; "stated at country level only"; no list).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { WcvpIndex, parseWcvpName, parseWcvpDist, bulkFetcher } from '$dossier/bulk';
import * as gbif from '$dossier/sources/gbif';
import { regionsOf, wideRangeWords, drawnLandOf } from '$dossier/build';
import { wideRange, wideRangeSaid } from '$dossier/range-via';
import { wideOrigins } from '$dossier/wide-origins';
import { fewRecords, fewRecordsSentence } from '$core/few-records';
import { NAMED_CASES, caseLine, checkPage, cellTester } from '$dossier/range-check';
import { regionTester, SHAPES_FILE, RANGE_RULE, type ShapesFile } from '$dossier/tdwg-shapes';
import { parseDossier } from '$dossier/schema';
import { makeHeader, cellOf, cellCentre, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const DIST_H = 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
// Kew's rows, as Kew's file of 2026-06-04 writes them.
const NAMES = [
  '512033|101613-1|Species|Accepted|Apocynaceae||Stapelia||hirsuta||||L.||Sp. Pl.|: 217|(1753)||SW. Namibia to Cape Prov.|succulent subshrub|desert or dry shrubland|Stapelia hirsuta|L.|512033||||511845|101613-1||Y',
  '524271|77166382-1|Species|Synonym|Apocynaceae||Ceropegia||pulvinata|||Masson|Bruyns||S. African J. Bot.| 112: 422|(2017)|||||Ceropegia pulvinata|(Masson) Bruyns|512041|512196||||77166382-1||Y',
  '512041|77172797-1|Variety|Accepted|Apocynaceae||Stapelia||hirsuta|var.|hirsuta||||Unknown||||W. & S. Cape Prov.|succulent subshrub|desert or dry shrubland|Stapelia hirsuta var. hirsuta||512041||||512033|77172797-1||Y',
  '291500|537567-1|Species|Accepted|Xeronemataceae||Xeronema||callistemon||||W.R.B.Oliv.||Trans. & Proc. New Zealand Inst.|52: 226|(1926)||New Zealand (Poor Knights Is., Hen I.)|rhizomatous geophyte|subtropical|Xeronema callistemon|W.R.B.Oliv.|291500||||291499|537567-1||Y',
  '469325|77135976-1|Species|Accepted|Araceae||Caladium||praetermissum||||Bogner & Hett.||Aroideana| 32: 129|(2009)||Trop. America (?)|tuberous geophyte|wet tropical|Caladium praetermissum|Bogner & Hett.|469325||||28751|77135976-1||Y',
  '293670|61864-1|Species|Accepted|Asparagaceae||Agave||calodonta||||A.Berger||Hortus Mortolensis|: 364|(1912)||Mexico (?)|succulent perennial|seasonally dry tropical|Agave calodonta|A.Berger|293670||||293559|61864-1||Y'
];
const DIST = [
  '823190|512033|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0',
  '823191|512033|2|AFRICA|27|Southern Africa|NAM|Namibia|0|0|0',
  '823195|512041|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0',
  '354487|291500|5|AUSTRALASIA|51|New Zealand|NZN|New Zealand North|0|0|0',
  '640894|469325|8|SOUTHERN AMERICA|||||0|0|0',
  '361445|293670|7|NORTHERN AMERICA|79|Mexico|||0|0|0'
];
function index(): WcvpIndex {
  const w = new WcvpIndex();
  for (const l of NAMES) w.addName(parseWcvpName(NAMES_H, l), () => true);
  for (const l of DIST) w.addDist(parseWcvpDist(DIST_H, l));
  return w;
}
const DOS = JSON.parse(readFileSync('tests/unit/fixtures/r86r-dossiers.json', 'utf8')).dossiers as Record<string, Record<string, unknown> & { distribution: { native: Array<{ code?: string; name: string }>; boxes: unknown[]; source: string; kew?: Record<string, string> }; climate: Record<string, unknown>; occurrences: { open: Array<[number, number, ...unknown[]]> } }>;

describe("5. Stapelia hirsuta's range is its own entry's, not its variety's (review D10)", () => {
  it("GBIF's Ceropegia pulvinata (9462513), the page Kew's 512033: Cape Provinces and Namibia, said as Kew's entry", async () => {
    const f = bulkFetcher((async (url: string) => (/\/species\/9462513$/.test(url) ? { status: 'ok', data: { canonicalName: 'Ceropegia pulvinata', authorship: '(Masson) Bruyns', family: 'Apocynaceae' } } : { status: 'none' })) as unknown as JsonFetcher, { wcvp: index(), entryOf: (k) => (k === 9462513 ? '512033' : undefined) });
    const d = await gbif.distributions(f, 9462513);
    expect(d.status).toBe('ok');
    if (d.status !== 'ok') return;
    expect(d.data.rows.map((r) => r.locationId).sort()).toEqual(['TDWG:CPP', 'TDWG:NAM']);
    expect(d.data.rangeVia).toMatchObject({ kind: 'kew-entry', entry: 'Stapelia hirsuta L.' });
    expect(d.data.kew?.area).toBe('SW. Namibia to Cape Prov.');
  });
  it("the live page (round eighty-five's walk) shows the variety's Cape Provinces, reached through Ceropegia pulvinata", () => {
    const live = DOS.k512033 as unknown as { name: { scientific: string; kew: { entry: string } }; distribution: { native: Array<{ code: string }>; via: { kind: string; entry: string } } };
    expect(live.name).toMatchObject({ scientific: 'Stapelia hirsuta', kew: { entry: '512033' } });
    expect(live.distribution.native.map((r) => r.code)).toEqual(['CPP']);
    expect(live.distribution.via).toMatchObject({ kind: 'synonym-of', entry: 'Stapelia hirsuta var. hirsuta' });
  });
});

describe("6. Kew's area is read, shown, and the Poor Knights lily is never called fixed (review D2)", () => {
  it("Kew's geographic_area rides with the range, quoted, and the schema keeps it", () => {
    const r = index().distributions('Xeronema callistemon', 'W.R.B.Oliv.', 'Xeronemataceae');
    if (!r || r === 'ambiguous') throw new Error(String(r));
    expect(r.kew).toEqual({ lifeform: 'rhizomatous geophyte', climate: 'subtropical', area: 'New Zealand (Poor Knights Is., Hen I.)' });
    const live = structuredClone(DOS.k291500);
    live.distribution.kew = { ...live.distribution.kew, area: 'New Zealand (Poor Knights Is., Hen I.)' };
    expect(parseDossier(live).distribution.kew?.area).toBe('New Zealand (Poor Knights Is., Hen I.)');
  });
  it("the few-records sentence puts Kew's area beside Auckland, the spot it reads, and judges nothing", () => {
    const f = fewRecords(DOS.k291500.climate as { status: string; records?: number; cells?: number; place?: string })!;
    expect(f).toMatchObject({ records: 5, cells: 3, place: 'Auckland, New Zealand' });
    const s = fewRecordsSentence(f, 'New Zealand (Poor Knights Is., Hen I.)');
    expect(s).toContain('The typical spot, where the cold figures are read, is in Auckland, New Zealand (Natural Earth\'s provinces); Kew gives its area as “New Zealand (Poor Knights Is., Hen I.)” (WCVP).');
    expect(fewRecordsSentence(f)).not.toContain('Kew gives');
  });
  it('the check says the case as it stands, held open, and never fixed', () => {
    const c = NAMED_CASES.find((x) => x.key === 'k291500')!;
    expect(c.open).toMatch(/review D2/);
    const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
    const t = regionTester(file);
    const d = { key: 'k291500', name: { scientific: 'Xeronema callistemon' }, distribution: { native: [{ code: 'NZN' }] }, upstream: { 'gbif.occurrences': { status: 'ok' } }, occurrences: { rangeRule: RANGE_RULE, nOpenInRange: 1, nRestrictedInRange: 0, admitted: { strict: 1, buffer: 0, coast: 0, island: 0 }, open: [[-36.85, 174.76, 2020, 'NZ', 'HUMAN_OBSERVATION', 'by']] as Array<readonly [number, number, ...unknown[]]> }, climate: { status: 'ok', at: { lat: -36.875, lon: 174.725 }, cells: 1, admitted: { strict: 1, buffer: 0, coast: 0, island: 0 } } };
    const line = caseLine(c, d, checkPage(d, cellTester(file), t, RANGE_RULE), RANGE_RULE);
    expect(line.line).toMatch(/^held open: Xeronema callistemon \(k291500\)/);
    expect(line.line).not.toMatch(/^fixed/);
    expect(line.ok).toBe(true);
  });
  it('the about page no longer has the Poor Knights lily as a case set right by the islands alone', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("The Poor Knights lily's spot is in Auckland, among garden plants");
  });
});

describe("7. Lord Howe Island's cells the elevation layer reads as sea (the Howea finding)", () => {
  const file = JSON.parse(readFileSync(SHAPES_FILE, 'utf8')) as ShapesFile;
  const t = regionTester(file);
  const h = makeHeader({ built: '2026-11-06T00:00:00Z' });
  const box = (id: string) => { const [row, col] = id.split(':').map(Number); const m = cellCentre(h, row, col); return { s: m.lat - 0.025, w: m.lon - 0.025, n: m.lat + 0.025, e: m.lon + 0.025 }; };
  it("Howea belmoreana's cells: the north-western one holds Lord Howe's drawn land, the one south of the island none", () => {
    const d = DOS.k100447;
    const ids = new Set(d.occurrences.open.map((p) => cellOf(h, p[0], p[1]).id));
    expect([...ids].sort()).toEqual(['2430:6780', '2430:6781', '2431:6781', '2432:6781']);
    const land = drawnLandOf(d.distribution.native, t)!.drawnLand!;
    expect(land(box('2430:6780'))).toBe(true);
    expect(land(box('2432:6781'))).toBe(false);
    expect(d.climate).toMatchObject({ status: 'none', detail: 'only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km (2 at sea or ice); three are needed for an envelope' });
  });
  it('such a cell is read, with no elevation, and the envelope says so; without the drawing it is sea, as before', async () => {
    const cell = (elev: number | null) => {
      const v: Record<string, number> = elev == null ? {} : { elev };
      for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); v[`tasmax_${mm}`] = 24; v[`tasmin_${mm}`] = 15 + (m % 3); v[`tas_${mm}`] = 19; v[`pr_${mm}`] = 120; }
      return v;
    };
    const cells = new Map<string, ArrayBuffer>([['2430:6781', encodeCell(h, cell(40))], ['2431:6781', encodeCell(h, cell(300))], ['2430:6780', encodeCell(h, cell(null))], ['2432:6781', encodeCell(h, cell(null))]]);
    const pts = DOS.k100447.occurrences.open.map((p) => [p[0], p[1], 'strict'] as const);
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}), noExtremes: true });
    const before = await p.envelope(pts);
    expect(before).toMatchObject({ status: 'none', detail: 'only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km (2 at sea or ice); three are needed for an envelope' });
    const now = await p.envelope(pts, drawnLandOf(DOS.k100447.distribution.native, t));
    expect(now.status).toBe('ok');
    if (now.status !== 'ok') return;
    expect(now.cells).toBe(3);
    expect(now.seaCells).toBe(1);
    expect(now.src.envelope).toContain("(1 of them a cell the elevation layer reads as sea, read for the native region's land the regions' shapes draw in it: an island narrower than the layer's 60″ pixels; no elevation there)");
  });
});

describe("8. ranges Kew gives only wider than a level-3 region (the plan's B16)", () => {
  it("Caladium praetermissum's continent is named, Agave calodonta's Mexico kept, each said as Kew's", () => {
    const w = index();
    const cal = regionsOf(w.rangeOf({ id: '469325', name: 'Caladium praetermissum', status: 'Accepted', acceptedId: '469325', rank: 'Species' })!.rows, true);
    expect(cal.native).toEqual([{ name: 'Southern America' }]);
    const aga = regionsOf(w.rangeOf({ id: '293670', name: 'Agave calodonta', status: 'Accepted', acceptedId: '293670', rank: 'Species' })!.rows, true);
    expect(aga.native).toEqual([{ name: 'Mexico' }]);
    expect(aga.boxes).toEqual([]);
    expect(wideRangeWords(aga.native)).toBe('native range given by Kew only as Mexico, with no level-3 region to test records against, so no record is placed in the range');
    expect(wideRangeWords([{ name: 'Malesia' }])).not.toMatch(/country/);
  });
  it("the page says Kew's words: the live Agave calodonta, its area added as the walk reads it", () => {
    const d = structuredClone(DOS.k293670);
    d.distribution.kew = { ...d.distribution.kew, area: 'Mexico (?)' };
    const w = wideRange(d.distribution)!;
    expect(wideRangeSaid(w)).toBe('Kew gives the native range only as Mexico (in its words, “Mexico (?)”), wider than any region records are tested against');
    // A range of level-3 regions, or a national checklist's, is no such range.
    expect(wideRange(DOS.k291500.distribution)).toBeNull();
    expect(wideRange({ native: [{ name: 'Brazil' }], boxes: [], source: 'national checklists via GBIF (presence reported, native status not stated; no WCVP entry for this name)' })).toBeNull();
  });
  it.skipIf(!existsSync('/tmp/claude-0/rev86r/inputs/index.json'))('the live index: 8 pages, listed for the browse work', () => {
    const idx = JSON.parse(readFileSync('/tmp/claude-0/rev86r/inputs/index.json', 'utf8'));
    const w = wideOrigins(idx);
    expect(w.map((p) => `${p.key} ${p.wide.join(',')}`).sort()).toEqual(['k208511 Malesia', 'k218235 Brazil', 'k255304 Brazil', 'k293670 Mexico', 'k362831 Mexico', 'k362848 Brazil', 'k469325 ', 'k475074 Brazil']);
  });
});
