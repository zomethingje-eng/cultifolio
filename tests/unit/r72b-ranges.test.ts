/**
 * Round 72, B (ranges, records, climate): B1 to B5, B7 to B10 of TRIAGE-72. Every Kew row is verbatim from the owner's
 * wcvp_names.csv / wcvp_distribution.csv (README: "Extracted: 04/06/2026").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WcvpIndex, parseWcvpName, parseWcvpDist, bulkFetcher, wcvpExtractedDay, downloadDay } from '$dossier/bulk';
import { distributions } from '$dossier/sources/gbif';
import { rangeSource, buildDossier } from '$dossier/build';
import { fillRangeSource, kewRebuildList, rebuildList } from '$dossier/corpus-fills';
import { rangeNote as pageNote } from '$lib/ui/ref/notes';
import { settleVia, settleRange, climateReason, outsideOnly, outsideLog, viaSource, withPage, type RangeVia } from '$dossier/range-via';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const D = 'plant_locality_id|plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
const index = (rows: string[], dist: string[], o: { file?: string; reference?: string[] } = {}) => {
  const w = new WcvpIndex();
  for (const l of rows) w.addName(parseWcvpName(H, l), () => true);
  for (const l of dist) w.addDist(parseWcvpDist(D, l));
  if (o.file) w.fileDay = o.file;
  if (o.reference) w.setReference(o.reference);
  return w;
};
const range = (w: WcvpIndex, name: string, authorship: string, family: string) => { const g = w.distributions(name, authorship, family); if (!g || g === 'ambiguous') throw new Error(String(g)); return g; };
const fetcherFor = (w: WcvpIndex, key: number, name: string, authorship: string, family: string) => bulkFetcher((async (url: string) => (new RegExp(`/species/${key}$`).test(url) ? { status: 'ok', data: { canonicalName: name, authorship, family } } : /distributions/.test(url) ? { status: 'ok', data: { results: [] } } : { status: 'none' })) as never, { wcvp: w });
const store = (docs: Record<string, any>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, v: unknown) => { docs[k] = v; } });

const IXORA = [
  '103356|753844-1|Species|Accepted|Rubiaceae||Ixora||coccinea||||L.||Sp. Pl.|: 110|(1753)||W. & S. India, Sri Lanka, Bangladesh to Indo-China|shrub|wet tropical|Ixora coccinea|L.|103356||||103177|753844-1||Y',
  '103355|753843-1|Species|Invalid|Rubiaceae||Ixora||coccinea||||Comm. ex Lam.||Encycl.| 2: 355|(1786)|, not validly publ.||||Ixora coccinea|Comm. ex Lam.|2788267|||||753843-1||Y',
  '2788267|703489-1|Species|Accepted|Proteaceae||Embothrium||coccineum||||J.R.Forst. & G.Forst.||Char. Gen. Pl., ed. 2.|: 16|(1776)||C. & S. Chile to S. Argentina|shrub or tree|temperate|Embothrium coccineum|J.R.Forst. & G.Forst.|2788267||||2788257|703489-1||N'
];
const IXORA_D = ['1|2788267|8|S|85|Southern South America|CLS|Chile South|0|0|0', '2|103356|4|A|40|Indian Subcontinent|IND|India|0|0|0'];
const MIXTA = [
  '509402|99924-1|Species|Accepted|Apocynaceae||Orbea||variegata|||L.|Haw.||Syn. Pl. Succ.|: 40|(1812)||SW. & S. Cape Prov.|succulent subshrub|subtropical|Orbea variegata|(L.) Haw.|509402|512291|||509289|99924-1||Y',
  '524950|77167004-1|Species|Synonym|Apocynaceae||Ceropegia||mixta|||Masson|Bruyns||S. African J. Bot.| 112: 424|(2017)|||||Ceropegia mixta|(Masson) Bruyns|509402|512117||||77167004-1||Y'
];
const MIXTA_D = ['3|509402|2|AFRICA|27|Southern Africa|CPP|Cape Provinces|0|0|0'];

describe('B1: a range read from Kew\'s files names their day, and the records their download\'s', () => {
  it('reads the README\'s "Extracted:" day (day first) and a download\'s day', () => {
    expect(wcvpExtractedDay('<t>Version "16"</t><t>Extracted: 04/06/2026</t>')).toBe('2026-06-04');
    // Round eighty (X): the day GBIF made it, never its key's digits (this one was made on 2026-09-19, not 09-16).
    expect(downloadDay({ key: '0006100-260916113435855', created: '2026-09-19T20:08:28.384+00:00', fetched: '2026-09-19T21:29:21.218Z' })).toBe('2026-09-19');
    expect(downloadDay({ fetched: '2026-09-19T21:29:21.218Z' })).toBe('2026-09-19');
  });
  it('the range source says "Kew\'s files of 2026-06-04", never "via GBIF"', async () => {
    const w = index(MIXTA, MIXTA_D, { file: '2026-06-04' });
    const d = await distributions(fetcherFor(w, 2, 'Orbea variegata', '(L.) Haw.', 'Apocynaceae'), 2);
    expect(rangeSource(d)).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04"); // r72base: "WCVP (Govaerts, RBG Kew) via GBIF"
  });
  it('the build dates the range\'s and the records\' rows "as of" their files, and Provenance shows it', async () => {
    const via: RangeVia = { kind: 'own', entry: 'Dipcadi viride (L.) Moench', name: 'Dipcadi viride', file: '2026-06-04' };
    const f = (async (url: string) => (/\/distributions/.test(url) ? { status: 'ok', data: { results: [
      { locationId: 'TDWG:BEN', locality: 'Benin', establishmentMeans: 'NATIVE', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' },
      { locationId: 'TDWG:ANG', locality: 'Angola', establishmentMeans: 'DOUBTFUL', source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }
    ], rangeVia: via, kewFile: '2026-06-04' } } : /occurrence\/search/.test(url) ? { status: 'ok', data: { results: [{ key: 9, decimalLatitude: 9.3, decimalLongitude: 2.3, basisOfRecord: 'HUMAN_OBSERVATION', license: 'CC_BY_4_0', downloadDoi: '10.15468/dl.3h4zam', downloadDay: '2026-09-16' }], endOfRecords: true, count: 1 } } : /\/species\/1$/.test(url) ? { status: 'ok', data: { key: 1, canonicalName: 'Dipcadi viride', scientificName: 'Dipcadi viride (L.) Moench', authorship: '(L.) Moench', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', family: 'Asparagaceae' } } : { status: 'none' })) as unknown as JsonFetcher;
    const r = await buildDossier(1, { fetcher: f, builtBy: 'node', skip: ['wikidata', 'wikipedia', 'inat', 'commons', 'openalex', 'gbif.media'] });
    if (!r.ok) throw new Error('build');
    expect(r.dossier.upstream['wcvp.distribution'].asOf).toBe('2026-06-04'); // r72base: undefined
    expect(r.dossier.upstream['gbif.occurrences']).toMatchObject({ asOf: '2026-09-16', detail: 'GBIF occurrence download https://doi.org/10.15468/dl.3h4zam, of 2026-09-16; records not tested against botanic gardens, herbaria and zoos: no list of them was given to this build' }); // round seventy-nine (Q): a build given no list says so
    expect(r.dossier.distribution.source).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04");
    // B5: Angola is doubtfully present, listed apart, never a box
    expect(r.dossier.distribution.native.map((x) => x.code)).toEqual(['BEN']);
    expect(r.dossier.distribution.doubtful?.map((x) => x.name)).toEqual(['Angola']);
    expect(r.dossier.distribution.boxes).toHaveLength(1);
    expect(readFileSync('src/lib/ui/Provenance.svelte', 'utf8')).toMatch(/\{#if u\.asOf\}<span class="faint small">as of \{u\.asOf\}<\/span>/);
  });
});

describe('B5: Kew\'s doubtful regions are served as such', () => {
  it('Dipcadi viride: Angola is DOUBTFUL, not dropped', () => {
    const w = index(['304391|534009-1|Species|Accepted|Asparagaceae||Dipcadi||viride|||L.|Moench||Suppl. Meth.|: 267|(1802)||Trop. & S. Africa, Arabian Pen.|bulbous geophyte|seasonally dry tropical|Dipcadi viride|(L.) Moench|304391|278708|||304277|534009-1||Y'],
      ['478988|304391|2|AFRICA|22|West Tropical Africa|BEN|Benin|0|0|0', '345108|304391|2|AFRICA|26|South Tropical Africa|ANG|Angola|0|0|1']);
    expect(range(w, 'Dipcadi viride', '(L.) Moench', 'Asparagaceae').rows.map((r) => `${r.locality}:${r.establishmentMeans}`)).toEqual(['Benin:NATIVE', 'Angola:DOUBTFUL']); // r72base: Angola left out
  });
});

describe('B2: Kew\'s entry by another author is said only while the page cites another name', () => {
  it('Ixora coccinea "Comm. ex Lam.": kew-entry Ixora coccinea L.', () => {
    const g = range(index(IXORA, IXORA_D), 'Ixora coccinea', 'Comm. ex Lam.', 'Rubiaceae');
    expect(g.rangeVia).toMatchObject({ kind: 'kew-entry', entry: 'Ixora coccinea L.' }); // r72base: no rangeVia
  });
  it('once the page cites Kew\'s L. (A1), the range is the page\'s own entry, and nothing is said', () => {
    const v: RangeVia = { kind: 'kew-entry', entry: 'Ixora coccinea L.', name: 'Ixora coccinea', file: '2026-06-04' };
    expect(settleVia(v, 'Ixora coccinea', 'L.')).toMatchObject({ kind: 'own' });
    expect(settleVia(v, 'Ixora coccinea', 'Comm. ex Lam.')).toBe(v);
    const d = { name: { scientific: 'Ixora coccinea', authorship: 'L.' }, distribution: { via: v, source: viaSource(v) }, upstream: { 'wcvp.distribution': { status: 'ok', at: 'x', detail: "the range is Kew's entry Ixora coccinea L.; the name is cited Comm. ex Lam." } } };
    expect(settleRange(d)).toBe(true);
    expect(d.distribution.source).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04");
    expect(d.upstream['wcvp.distribution'].detail).toBeUndefined();
  });
});

describe('B3: where the range comes from is a field, shown beside the map', () => {
  it('Ceropegia mixta: synonym-of Orbea variegata, with the row and its status; the page key where it is a page', () => {
    const g = range(index(MIXTA, MIXTA_D), 'Ceropegia mixta', '(Masson) Bruyns', 'Apocynaceae');
    expect(g.rangeVia).toEqual({ kind: 'synonym-of', entry: 'Orbea variegata (L.) Haw.', name: 'Orbea variegata', row: 'Ceropegia mixta (Masson) Bruyns', status: 'synonym' });
    expect(withPage(g.rangeVia!, 9534856, { keyOf: (n) => (n === 'Orbea variegata' ? 5 : undefined) }).page).toBe('5');
    expect(viaSource(g.rangeVia!)).toBe("WCVP (Govaerts, RBG Kew): Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's");
  });
  it('the note reads the field; a dossier built before reads its sentence', () => {
    // One note for the page (merge: F's notes.ts reads B's field), with the entry's page linked by the server.
    const nat = { native: [{ code: 'X' }] };
    expect(pageNote({ ...nat, source: '', via: { kind: 'synonym-of', entry: 'Ceropegia nigra N.E.Br.', page: '3574112' } }, { scientific: 'Ceropegia melanops' })).toMatchObject({ clause: 'Kew holds Ceropegia melanops as a synonym of Ceropegia nigra N.E.Br.; the range is that entry\'s', page: '3574112' });
    expect(pageNote({ ...nat, source: '', via: { kind: 'own', entry: 'Aus bus L.' } }, { scientific: 'Aus bus' })).toBeNull();
    expect(pageNote({ ...nat, source: "WCVP (Govaerts, RBG Kew): Kew's entry Erythrina afra Thunb., reached by Erythrina fissa C.Presl" }, { scientific: 'Erythrina fissa' })?.clause).toMatch(/older names lead to/);
    // A dossier built before round seventy-two with a synonym range now shows it beside the map too (B3).
    expect(pageNote({ ...nat, source: "WCVP (Govaerts, RBG Kew): Kew holds Ceropegia melanops H.Huber as a synonym of Ceropegia nigra N.E.Br.; the range is Ceropegia nigra's" }, { scientific: 'Ceropegia melanops' })).not.toBeNull();
    const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(page).toMatch(/rangeNote\(d\.distribution/); // r72base: /under the name |, reached by / only
    expect(page).toMatch(/<b>Doubtfully present in<\/b>/);
  });
});

describe('B4: the climate\'s reason names the records it read, on the species page and the plant page', () => {
  it('the provider says "placed to within 10 km"', async () => {
    const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
    const v: Record<string, number> = { elev: 620 };
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); Object.assign(v, { [`tasmax_${mm}`]: 22, [`tasmin_${mm}`]: 12, [`tas_${mm}`]: 17, [`pr_${mm}`]: 1, [`rsds_${mm}`]: 18, [`hurs_${mm}`]: 70, [`vpd_${mm}`]: 500, [`sfcWind_${mm}`]: 3 }); }
    const lat = -24.877, lon = -70.5;
    const c = await makeClimateProvider({ grid: memoryGridSource(h, new Map([[cellOf(h, lat, lon).id, encodeCell(h, v)]])), fetcher: fixtureFetcher({}) }).envelope([[lat, lon]]);
    expect(c.status === 'none' ? c.detail : '').toBe('only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are needed for an envelope'); // r72base: "... holds an in-range record; ..."
  });
  it('a stored reason of the old words is read so on both pages', () => {
    expect(climateReason('only 1 distinct land cell of the climate grid holds an in-range record; three are needed for an envelope')).toBe('only 1 distinct land cell of the climate grid holds an in-range record placed to within 10 km; three are needed for an envelope');
    expect(climateReason('only 2 distinct land cells of the climate grid hold an in-range record placed to within 10 km; three are needed for an envelope')).toMatch(/hold an in-range record placed to within 10 km; three/);
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toMatch(/sentence\(climateReason\(d\.climate\.detail\)/);
    expect(readFileSync('src/routes/plants/[acc]/+page.svelte', 'utf8')).toMatch(/climateReason\(dossier\.climate\.detail\)/);
  });
});

const REICHEO = '2914906|77122531-1|Species|Accepted|Cactaceae||Reicheocactus||famatinensis|||Speg.|Schlumpb.||Cactaceae Syst. Init.| 28: 30|(2012)||NW. Argentina|succulent subshrub|desert or dry shrubland|Reicheocactus famatinensis|(Speg.) Schlumpb.|2914906|2781781|||2417831|77122531-1||N';
const MELO = '2370690|1185318-2|Species|Accepted|Cactaceae||Melocactus||lemarii|||Monv. ex Lem.|Miq. ex Lem.||Hort. Universel| 1: 286|(1839)||NW. Haiti, W. & S. Dominican Rep.|succulent subshrub|seasonally dry tropical|Melocactus lemarii|(Monv. ex Lem.) Miq. ex Lem.|2370690|2781972|||2359952|1185318-2||N';
describe('B7: a name Kew spells otherwise, by the same author, with no other row', () => {
  it('Reicheocactus famatimensis is Kew\'s famatinensis; Melocactus lemairei Kew\'s lemarii', () => {
    const r = range(index([REICHEO], ['4853970|2914906|8|S|85|Southern South America|AGW|Argentina Northwest|0|0|0']), 'Reicheocactus famatimensis', '(Speg.) Schlumpb.', 'Cactaceae');
    expect(r.rangeVia).toMatchObject({ kind: 'spelling', entry: 'Reicheocactus famatinensis (Speg.) Schlumpb.' }); // r72base: null, no range
    expect(r.rows.map((x) => x.locality)).toEqual(['Argentina Northwest']);
    const m = range(index([MELO], ['2351261|2370690|8|S|81|Caribbean|DOM|Dominican Republic|0|0|0']), 'Melocactus lemairei', '(Monv. ex Lem.) Miq.', 'Cactaceae');
    expect(m.entry.name).toBe('Melocactus lemarii');
  });
  it('not where the reference holds that spelling, nor where two spellings are near, nor by another author (guards)', () => {
    expect(index([REICHEO], [], { reference: ['Reicheocactus famatinensis'] }).distributions('Reicheocactus famatimensis', '(Speg.) Schlumpb.', 'Cactaceae')).toBeNull();
    const two = REICHEO.replace(/^2914906/, '2914907').replace(/famatinensis/g, 'famatiensis');
    expect(index([REICHEO, two], []).distributions('Reicheocactus famatimensis', '(Speg.) Schlumpb.', 'Cactaceae')).toBeNull();
    expect(index([REICHEO], []).distributions('Reicheocactus famatimensis', 'Backeb.', 'Cactaceae')).toBeNull();
    // Another plant by the same combining author: hamatacantha (Muehlenpf.) is not haematacantha (Monv. ex Salm-Dyck),
    // which Kew files under Ferocactus haematacanthus (the dry run on the corpus found it).
    const bisnaga = index([
      '2676732|33307-2|Species|Synonym|Cactaceae||Bisnaga||haematacantha|||Monv. ex Salm-Dyck|Orcutt||Cactography|: 1|(1926)|||||Bisnaga haematacantha|(Monv. ex Salm-Dyck) Orcutt|2808163|2781759||T||33307-2||N',
      '2808163|133148-1|Species|Accepted|Cactaceae||Ferocactus||haematacanthus|||Monv. ex Salm-Dyck|Bravo ex Backeb. & F.M.Knuth||Kaktus-ABC|: 352|(1936)||Mexico (E. Puebla, Veracruz)|succulent subshrub or shrub|seasonally dry tropical|Ferocactus haematacanthus|(Monv. ex Salm-Dyck) Bravo ex Backeb. & F.M.Knuth|2808163|2781759|||2808107|133148-1||N'
    ], ['2170604|2808163|7|NORTHERN AMERICA|79|Mexico|MXC|Mexico Central|0|0|0']);
    expect(bisnaga.distributions('Bisnaga hamatacantha', '(Muehlenpf.) Orcutt', 'Cactaceae')).toBeNull();
  });
});

describe('B8: an artificial hybrid\'s synonym, a region with no level-3 area, an unplaced name', () => {
  it('Delphinium × cultorum Voss: Kew holds it under Delphinium × barlowii, an artificial hybrid, with no range', async () => {
    const w = index([
      '3238953|77332301-1|Species|Synonym|Ranunculaceae||Delphinium|×|cultorum||||Voss||Vilm. Blumengärtn., ed. 3.| 1: 36|(1894)|||||Delphinium × cultorum|Voss|2759463|||||77332301-1|D. elatum × D. grandiflorum|N',
      '2759463|710426-1|Species|Artificial Hybrid|Ranunculaceae||Delphinium|×|barlowii||||Lindl.||Edwards\'s Bot. Reg.| 23: t. 1944|(1837)|||perennial|temperate|Delphinium × barlowii|Lindl.|2759463||||2759373|710426-1|D. elatum × D. grandiflorum|N'
    ], []);
    const d = await distributions(fetcherFor(w, 9088557, 'Delphinium cultorum', 'Voss', 'Ranunculaceae'), 9088557);
    expect(rangeSource(d)).toBe('WCVP (Govaerts, RBG Kew): Kew holds Delphinium × barlowii Lindl., an artificial hybrid, with no native range'); // r72base: "national checklists via GBIF ... no WCVP entry for this name"
  });
  it('Agave calodonta: Kew\'s one row names only its level-2 region, "Mexico"', () => {
    const w = index(['293670|61864-1|Species|Accepted|Asparagaceae||Agave||calodonta||||A.Berger||Hortus Mortolensis|: 364|(1912)||Mexico (?)|succulent perennial|seasonally dry tropical|Agave calodonta|A.Berger|293670||||293559|61864-1||Y'], ['361445|293670|7|NORTHERN AMERICA|79|Mexico|||0|0|0']);
    expect(range(w, 'Agave calodonta', 'A.Berger', 'Asparagaceae').rows[0].locality).toBe('Mexico'); // r72base: ''
  });
  it('Aphelandra squarrosa Nees: an unplaced name\'s range is said to be one', () => {
    const w = index(['2643715|315544-2|Species|Unplaced|Acanthaceae||Aphelandra||squarrosa||||Nees|C.F.P.von Martius & auct. suc. (eds.)|Fl. Bras.| 9: 89|(1847)|, nom. Superfl.|E. Brazil|subshrub|seasonally dry tropical|Aphelandra squarrosa|Nees||2421415|Vell.||2643431|315544-2||N'], ['2030410|2643715|8|S|84|Brazil|BZE|Brazil Northeast|0|0|0']);
    const g = range(w, 'Aphelandra squarrosa', 'Nees', 'Acanthaceae');
    expect(g.rangeVia).toMatchObject({ kind: 'own', unplaced: true });
    expect(viaSource(g.rangeVia!)).toBe('WCVP (Govaerts, RBG Kew): Kew holds Aphelandra squarrosa Nees as unplaced');
    expect(pageNote({ native: [{ code: 'BZE' }], source: '', via: g.rangeVia }, { scientific: 'Aphelandra squarrosa' })?.clause).toMatch(/unplaced/);
  });
});

describe('B9: --list-rebuild compares the page with the rule only', () => {
  const doc = (native: string[], extra: Record<string, unknown> = {}) => ({ key: 8793122, name: { scientific: 'Ixora coccinea', authorship: 'Comm. ex Lam.', family: 'Rubiaceae', synonyms: ['Ixora coccinea Comm.'] }, distribution: { native: native.map((code) => ({ code, name: code })), source: 'WCVP (Govaerts, RBG Kew) via GBIF' }, ...extra });
  it('a finished page is not listed; a stale one is, and after its rebuild no more', () => {
    expect(kewRebuildList(store({ a: doc(['IND']) }), index(IXORA, IXORA_D))).toEqual([]); // r72base: "Kew's entry ... was Embothrium coccineum ..., is now Ixora coccinea L."
    expect(kewRebuildList(store({ a: doc(['CLS']) }), index(IXORA, IXORA_D))).toEqual([expect.stringMatching(/^8793122 Ixora coccinea\tthe stored native range is not Kew's .*\(CLS stored, IND now\)$/)]);
  });
  it('a page with no Kew range where Kew\'s files now give one is listed (B7)', () => {
    const d = { key: 12221398, name: { scientific: 'Reicheocactus famatimensis', authorship: '(Speg.) Schlumpb.', family: 'Cactaceae', synonyms: [] }, distribution: { native: [], source: 'national checklists via GBIF (presence reported, native status not stated; no WCVP entry for this name)' } };
    expect(kewRebuildList(store({ a: d }), index([REICHEO], ['4853970|2914906|8|S|85|Southern South America|AGW|Argentina Northwest|0|0|0']))).toEqual([expect.stringMatching(/^12221398 Reicheocactus famatimensis\tthe stored native range is not Kew's .*\(none stored, AGW now\)/)]);
  });
  it('a homonym key is listed until a build reads it', () => {
    const w = new WcvpIndex();
    w.addName(parseWcvpName('plant_name_id|taxon_status|family|taxon_name|taxon_authors|accepted_plant_name_id|taxon_rank'.split('|'), '1|Accepted|Rosaceae|Rubus parviflorus|Nutt.|1|Species'), () => true);
    const d = (upstream?: unknown) => ({ key: 7872219, name: { scientific: 'Rubus parviflorus', authorship: 'Kük.', family: 'Rosaceae', synonyms: [] }, ...(upstream ? { upstream } : {}) });
    expect(kewRebuildList(store({ a: d() }), w)).toEqual([expect.stringMatching(/on a homonym key not yet read/)]);
    expect(kewRebuildList(store({ a: d({ 'gbif.species': { status: 'ok', at: '2026-10-20T00:00:00Z', detail: 'homonym key checked: GBIF holds no one usage of Rubus parviflorus Nutt. under another key, so the key is left as it is' } }) }), w)).toEqual([]);
    expect(kewRebuildList(store({ a: d({ 'gbif.species': { status: 'ok', at: '2026-10-15T16:00:00Z' } }) }), w)).toEqual([]); // read by round 71's rule on its corpus step
  });
  it('the list without Kew\'s files names no finished page (guards)', () => {
    const docs = {
      a: { key: 1, built: '2026-10-15T00:00:00Z', name: { scientific: 'Dipcadi viride', synonyms: Array(50).fill('x') }, distribution: { source: 'WCVP (Govaerts, RBG Kew) via GBIF' } },
      b: { key: 2, built: '2026-10-15T00:00:00Z', name: { scientific: 'Bisnaga glaucescens', synonyms: [] }, distribution: { source: "WCVP (Govaerts, RBG Kew): Kew's entry Ferocactus glaucescens (DC.) Britton & Rose, reached by Echinocactus dietrichianus C.F.Först." } }
    };
    expect(rebuildList(store(docs))).toEqual([]); // r72base: both listed
  });
});

describe('--fill range-source writes what a build now writes, and a second run nothing', () => {
  it('Ceropegia mixta and Ixora coccinea on stored pages; the records dated by their download', () => {
    const w = index([...MIXTA, ...IXORA], [...MIXTA_D, ...IXORA_D], { file: '2026-06-04' });
    const occ = { status: 'ok', at: '2026-10-09T00:00:00Z', detail: 'GBIF occurrence download https://doi.org/10.15468/dl.3h4zam' };
    const docs: Record<string, any> = {
      m: { key: 9534856, name: { scientific: 'Ceropegia mixta', authorship: '(Masson) Bruyns', family: 'Apocynaceae' }, distribution: { native: [{ code: 'CPP', name: 'Cape Provinces' }], source: 'WCVP (Govaerts, RBG Kew) via GBIF' }, upstream: { 'wcvp.distribution': { status: 'ok', at: 'x' }, 'gbif.occurrences': occ } },
      o: { key: 5, name: { scientific: 'Orbea variegata', authorship: '(L.) Haw.', family: 'Apocynaceae' }, distribution: { native: [{ code: 'CPP', name: 'Cape Provinces' }], source: 'WCVP (Govaerts, RBG Kew) via GBIF' }, upstream: { 'wcvp.distribution': { status: 'ok', at: 'x' } } },
      i: { key: 8793122, name: { scientific: 'Ixora coccinea', authorship: 'L.', cited: { gbif: 'Comm. ex Lam.', kew: '103356' }, family: 'Rubiaceae' }, distribution: { native: [{ code: 'IND', name: 'India' }], source: 'WCVP (Govaerts, RBG Kew) via GBIF' }, upstream: { 'wcvp.distribution': { status: 'ok', at: 'x' } } }
    };
    const st = store(docs);
    const c = fillRangeSource(st, w, { download: { doi: '10.15468/dl.3h4zam', day: '2026-09-16' } });
    expect(c).toMatchObject({ written: 3, asOf: 1 });
    expect(docs.m.distribution.via).toMatchObject({ kind: 'synonym-of', page: '5', file: '2026-06-04' });
    expect(docs.m.distribution.source).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04: Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's");
    expect(docs.m.upstream['gbif.occurrences']).toMatchObject({ asOf: '2026-09-16', detail: 'GBIF occurrence download https://doi.org/10.15468/dl.3h4zam, of 2026-09-16' });
    expect(docs.i.distribution.via.kind).toBe('own'); // the page cites Kew's L. (A1): nothing to say
    expect(docs.i.distribution.source).toBe("WCVP (Govaerts, RBG Kew), Kew's files of 2026-06-04");
    expect(docs.o.upstream['wcvp.distribution'].asOf).toBe('2026-06-04');
    expect(fillRangeSource(st, w, { download: { doi: '10.15468/dl.3h4zam', day: '2026-09-16' } })).toMatchObject({ written: 0, said: 0 });
  });
});

describe('B10: one stray record is not a disagreement, and the log says every page whose records all lie outside', () => {
  it('one record, then two', () => {
    expect(outsideOnly(1)).toMatchObject({ tone: 'muted' });
    expect(outsideOnly(1).text).not.toMatch(/disagree/); // r72base: "... the range and the records disagree"
    expect(outsideOnly(2)).toMatchObject({ tone: 'warn', text: expect.stringMatching(/all 2 georeferenced records read lie outside it: the range and the records disagree/) });
    expect(outsideLog(1)).toBe(' — the one record lies outside the range');
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).toMatch(/const disagree = !inRange && d\.occurrences\.rangeTested && d\.occurrences\.nOutsideRange \? outsideLog\(/); // r72base: only at 20 or more
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toMatch(/return outsideOnly\(o\.nOutsideRange\)/);
  });
});
