/**
 * Round eighty-seven's review of stage 2, the sources' items (B1, S1, S3, S5, S6, M2, M3), on rows of the real files:
 * WFO's classification.csv of release 2026-06 (verbatim rows in fixtures/r87y, read 9 November 2026), ChromoDB's records
 * of version 3.1 and Kew's risk file. Each test fails on the base (9311e8b), where the page said "does not hold this
 * name", "no count", "the file holds no row", attached Taxus chinensis's listing to Podocarpus macrophyllus, read an
 * uppercase md5 as no check, or said "none" of a file it could not read.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { loadWfo, nameAgreementOf } from '$dossier/wfo';
import { loadChromosomes, chromosomesOf } from '$dossier/chromosomes';
import { loadRisk, riskOf } from '$dossier/risk';
import { parseCitesTable, CitesIndex, citesOf, CITES_TABLE_FILE, type CitesPage } from '$dossier/cites';
import { loadSources, applySources, sourcesLines, sourcePage, emptyCounts, countInto } from '$dossier/sources-fill';
import { nameAgreementWords, riskWords } from '$lib/ui/ref/source-words';
import type { Dossier } from '$dossier/schema';
import NameAgreement from '$lib/ui/ref/NameAgreement.svelte';

const TODAY = '2026-11-10';
const FIX = 'tests/unit/fixtures/r87y';
const html = (C: never, props: Record<string, unknown>) => render(C, { props } as never).body.replace(/<!--[^]*?-->/g, '');

describe('B1: WFO holds the page\'s name and authors under another IPNI id', () => {
  const pages = {
    abies: { name: 'Abies densa', authorship: 'Griff.', ipni: '261506-1', kew: '381736' },
    achillea: { name: 'Achillea clypeolata', authorship: 'Sm.', ipni: '173895-1', kew: '3109853' },
    drymaria: { name: 'Drymaria cordata', authorship: '(L.) Willd. ex Schult.', ipni: '30172747-2', kew: '2778492' },
    utricularia: { name: 'Utricularia inflata', authorship: 'Walter', ipni: '30164383-2', kew: '518425' },
    mammilloydia: { name: 'Mammilloydia candida', authorship: '(Scheidw.) Buxb.', ipni: '151899-2', kew: '2359910' },
    spathiphyllum: { name: 'Spathiphyllum uspanapaense', authorship: 'Matuda', ipni: '89010-1', kew: '193214' }
  };
  const load = () => loadWfo(FIX, new Set(Object.values(pages).map((p) => p.ipni)), new Set(Object.values(pages).map((p) => p.name)), new Set(Object.values(pages).map((p) => p.kew)));
  it('Abies densa Griff.: WFO\'s row of the same name and authors, under 77200679-1, the two ids said', async () => {
    const a = nameAgreementOf((await load())!, pages.abies, TODAY);
    expect(a).toMatchObject({ status: 'ok', by: 'name', wfo: 'wfo-0000511103', kind: 'accepted', detail: 'matched by the exact name and authors: WFO files it under IPNI id 77200679-1, Kew under IPNI id 261506-1' });
    const b = html(NameAgreement as never, { agreement: a });
    expect(b).toContain('>accepted</a>; matched by the exact name and authors: WFO files it under IPNI id 77200679-1, Kew under IPNI id 261506-1. <span');
    expect(b).not.toContain('does not hold');
  });
  it('a synonym found by its name and authors: WFO\'s accepted name, and the two ids', async () => {
    expect(nameAgreementOf((await load())!, pages.mammilloydia, TODAY)).toMatchObject({ status: 'ok', by: 'name', kind: 'synonym', of: 'Mammillaria candida Scheidw.', ofId: 'wfo-0001287023', detail: expect.stringContaining('WFO files it under IPNI id 135293-1') });
  });
  it('two rows under the page\'s IPNI id: the one spelt as the page with its authors (Achillea chypeolata beside A. clypeolata)', async () => {
    expect(nameAgreementOf((await load())!, pages.achillea, TODAY)).toMatchObject({ status: 'ok', by: 'ipni', wfo: 'wfo-0000077945', detail: "WFO's list holds 2 rows under IPNI id 173895-1; the one taken is spelt as the page, with its authors" });
  });
  it('two rows under the page\'s IPNI id, neither spelt as the page: the one whose localID is Kew\'s id', async () => {
    expect(nameAgreementOf((await load())!, pages.spathiphyllum, TODAY)).toMatchObject({ status: 'ok', by: 'kew', wfo: 'wfo-0000312059', spelt: 'Spathiphyllum uspanapaensis Matuda' });
    // Without Kew's id, not decided, WFO's rows said.
    expect(nameAgreementOf((await load())!, { ...pages.spathiphyllum, kew: undefined }, TODAY)).toMatchObject({ status: 'undecided', detail: expect.stringContaining('Spathiphyllum uxpanapense Matuda') });
  });
  it('the words under other authors only: not decided, with WFO\'s authors, never "does not hold"', async () => {
    const a = nameAgreementOf((await load())!, pages.drymaria, TODAY);
    expect(a).toEqual({ status: 'undecided', read: TODAY, release: '2026-06', file: 'wfo_classification_2026-06.csv', detail: "WFO's list holds Drymaria cordata only under other authors (Willd. ex Schult.), not (L.) Willd. ex Schult., and nothing under IPNI id 30172747-2" });
    expect(nameAgreementWords(a).body).toBe("not decided: WFO's list holds Drymaria cordata only under other authors (Willd. ex Schult.), not (L.) Willd. ex Schult., and nothing under IPNI id 30172747-2");
  });
  it('localID alone never decides: a Taxonomic Expert Network\'s 518425 is Nama glandulosa, not Kew\'s Utricularia inflata', async () => {
    const idx = (await load())!;
    expect(idx.byLocal.get('518425')?.[0].name).toBe('Nama glandulosa');
    expect(nameAgreementOf(idx, pages.utricularia, TODAY)).toMatchObject({ status: 'ok', by: 'ipni', wfo: 'wfo-0001072708' });
    // A page whose only tie to a row is that number: WFO does not hold it.
    expect(nameAgreementOf(idx, { name: 'Utricularia nonesuch', authorship: 'Walter', ipni: '1-1', kew: '518425' }, TODAY).status).toBe('none');
  });
  it('the dossier gives its Kew id from a k page\'s key', () => {
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8')) as Dossier;
    expect(sourcePage(d).kew).toBe('457911');
    expect(sourcePage({ ...d, key: 'g123' as never }).kew).toBeUndefined();
  });
});

const TABLE = readFileSync(CITES_TABLE_FILE, 'utf8');
const CHECKED = TABLE.replace(/^# checked: no$/m, '# checked: 2026-11-10 md5 0123456789abcdef0123456789abcdef');

describe('S1: a Kew synonym spelt as another page\'s accepted name is that plant\'s listing, not this one\'s', () => {
  // The four pages the review found, with Kew's synonyms and their authors as `name.kew.by` gives them.
  // What each page reads once the homonym is set aside: nothing for Podocarpus and Pelargonium; for the two Pterocarpus
  // pages, the genus's own listing (Pterocarpus spp., Appendix II, African populations only), not P. santalinus's.
  const cases: Array<[CitesPage, string, Record<string, unknown>]> = [
    [{ name: 'Podocarpus macrophyllus', family: 'Podocarpaceae', synonyms: ['Podocarpus maki', 'Taxus chinensis'], synonymAuthors: [['(Siebold) Endl.'], ['Roxb.']] }, 'Taxus chinensis Roxb.', { status: 'none' }],
    [{ name: 'Pterocarpus indicus', family: 'Fabaceae', synonyms: ['Pterocarpus santalinus', 'Pterocarpus papuanus'], synonymAuthors: [['Blanco'], ['F.Muell.']] }, 'Pterocarpus santalinus Blanco', { status: 'ok', level: 'genus', listed: 'Pterocarpus spp.', annotation: '#17' }],
    [{ name: 'Pterocarpus marsupium', family: 'Fabaceae', synonyms: ['Pterocarpus santalinus'], synonymAuthors: [['Buch.-Ham. ex Wall.']] }, 'Pterocarpus santalinus Buch.-Ham. ex Wall.', { status: 'ok', level: 'genus', listed: 'Pterocarpus spp.' }],
    [{ name: 'Pelargonium carnosum', family: 'Geraniaceae', synonyms: ['Pelargonium crassicaule'], synonymAuthors: [['E.Mey.']] }, 'Pelargonium crassicaule E.Mey.', { status: 'none' }]
  ];
  const headings = ['Podocarpus macrophyllus', 'Taxus chinensis', 'Pterocarpus indicus', 'Pterocarpus marsupium', 'Pterocarpus santalinus', 'Pelargonium carnosum', 'Pelargonium crassicaule', 'Aloidendron pillansii'];
  const idx = new CitesIndex(parseCitesTable(CHECKED), headings);
  for (const [page, said, want] of cases) {
    it(`${page.name}: not listed under ${said}, and why`, () => {
      const c = citesOf(idx, page, TODAY);
      expect(c).toMatchObject(want);
      expect(c.via).toBeUndefined();
      expect(c.listed).not.toBe(said.split(' ').slice(0, 2).join(' '));
      expect(c.detail).toContain(`${said}, which Kew holds as a synonym of this one, is spelt as another plant Kew accepts, with a page of its own, whose listing it is: not read as this one's`);
      // Without the corpus's names, the base's reading: the other plant's listing (what the review found).
      expect(citesOf(new CitesIndex(parseCitesTable(CHECKED)), page, TODAY)).toMatchObject({ status: 'ok', via: said.split(' ').slice(0, 2).join(' ') });
    });
  }
  it('the listed plant keeps its own listing; a synonym no page heads is still read (Aloe pillansii)', () => {
    expect(citesOf(idx, { name: 'Taxus chinensis', family: 'Taxaceae' }, TODAY)).toMatchObject({ status: 'ok', appendix: 'II', listed: 'Taxus chinensis' });
    expect(citesOf(idx, { name: 'Aloidendron pillansii', family: 'Asphodelaceae', synonyms: ['Aloe pillansii'] }, TODAY)).toMatchObject({ status: 'ok', appendix: 'I', via: 'Aloe pillansii' });
  });
  it('the fill reads every page\'s name for the rule, not only the pages of the run', async () => {
    const s = await loadSources(mkdtempSync(join(tmpdir(), 'r87y-')), [{ name: 'Podocarpus macrophyllus', synonyms: ['Taxus chinensis'] }], { checkMd5: false, citesTable: writeTable(CHECKED), headings });
    expect(s.cites.headings.has('Taxus chinensis')).toBe(true);
  });
});

function writeTable(text: string): string {
  const f = join(mkdtempSync(join(tmpdir(), 'r87y-cites-')), 'cites-appendices.tsv');
  writeFileSync(f, text);
  return f;
}

describe('S6: the CITES check\'s md5 in either case', () => {
  it('Get-FileHash\'s capitals are read, and kept in small letters', () => {
    const t = parseCitesTable(TABLE.replace(/^# checked: no$/m, '# checked: 2026-11-10 md5 0123456789ABCDEF0123456789ABCDEF'));
    expect(t.checked).toEqual({ day: '2026-11-10', md5: '0123456789abcdef0123456789abcdef' });
    expect(citesOf(new CitesIndex(t), { name: 'Aloe polyphylla', family: 'Asphodelaceae' }, TODAY).status).toBe('ok');
  });
});

// Verbatim from IOPB_IAPT_records_v3_1.csv (Zenodo 24057855), as the review extracted them; the bibliography's three rows.
const RECORDS = [
  '﻿count_id;biblio_id;family;genus;original_taxon_name;accepted_taxon_name;n_value;2n-value;country;subseries;stage;POWO_ID;country_code;count_derivation;confidence_level;remarks',
  '343741;86816;Brassicaceae;Cardamine;Cardamine macrophylla Adamson;Cardamine macrophylla Adamson;;64;Russia;IAPT/IOPB Chromosome Data;III;280460-1;RU;observation;Original Verified;',
  '344469;86830;Solanaceae;Atropa;Atropa belladonna L.;Atropa belladonna L.;;72;Iran;IOPB Chromosome Number Reports;I;814358-1;IR;observation;Original Verified;',
  '351793;86988;Brassicaceae;Cardamine;Cardamine macrophylla Adamson;Cardamine macrophylla Adamson;;64;Russia;IAPT Chromosome Data;III;280460-1;RU;observation;Original Verified;'
];
const BIBLIO = [
  '﻿biblio_id;authors;authors_short;year;title;journal;volume_pages;source_url;DOI;citation_full;subseries;stage',
  '86816;Probatova, N.S. et al.;Probatova et al.;2012;IAPT/IOPB chromosome data 13;Taxon;61(4): 899-902, E34-E42;;https://doi.org/10.1002/tax.614023;;IAPT/IOPB Chromosome Data;III',
  '86830;x;Someone;1990;t;Taxon;1: 1;;;;IOPB Chromosome Number Reports;I',
  '86988;Gnutikov, A.A. et al.;Gnutikov et al.;2018;IAPT chromosome data 27;Taxon;67(6): 1236-1237, E7-E9;;https://doi.org/10.12705/676.39;;IAPT Chromosome Data;III'
];
let chromoDir: string;
beforeAll(() => {
  chromoDir = mkdtempSync(join(tmpdir(), 'r87y-chromo-'));
  writeFileSync(join(chromoDir, 'IOPB_IAPT_records_v3_1.csv'), RECORDS.join('\n') + '\n');
  writeFileSync(join(chromoDir, 'IOPB_IAPT_biblio_v3_1.csv'), BIBLIO.join('\n') + '\n');
});

describe('S3 and M3: ChromoDB\'s records under the page\'s IPNI id', () => {
  it('named otherwise (Atropa belladonna L. under Kew\'s Atropa bella-donna): not decided, said, never "no count"', async () => {
    const idx = (await loadChromosomes(chromoDir, new Set(['814358-1', '280460-1'])))!;
    const c = chromosomesOf(idx, { name: 'Atropa bella-donna', authorship: 'L.', ipni: '814358-1' }, TODAY);
    expect(c.status).toBe('undecided');
    expect(c.detail).toBe("the file holds 1 record under this page's IPNI id 814358-1, named Atropa belladonna L., not this page's name as Kew spells it: not taken");
    // M3, said as it is: the identifier and the words decide, ChromoDB's authors are not compared (Adamson, not Kew's Willd.).
    expect(chromosomesOf(idx, { name: 'Cardamine macrophylla', authorship: 'Willd.', ipni: '280460-1' }, TODAY)).toMatchObject({ status: 'ok', counts: [{ twoN: '64' }, { twoN: '64' }] });
    expect(readFileSync('src/lib/dossier/chromosomes.ts', 'utf8')).toContain("ChromoDB's authors are not compared with Kew's");
  });
});

describe('M2: a risk row with no figures is said as one', () => {
  it('Brugmansia arborea (Extinct in the Wild): the file\'s row holds no figures; never "the file holds no row"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87y-risk-'));
    writeFileSync(join(dir, 'Angiosperm_extinction_risk_predictions_v1.csv'), [
      'plant_name_id,threatened,.lower,.upper,.width,.point,.interval,predicted_threat,confidence,category,observed_threat,combined,ipni_id,family,genus,species,taxon_name',
      '2683995-wcs,NA,NA,NA,NA,NA,NA,NA,NA,EW,NA,NA,77109574-1,Solanaceae,Brugmansia,arborea,Brugmansia arborea'
    ].join('\n') + '\n');
    const r = riskOf((await loadRisk(dir, new Set(['77109574-1'])))!, { name: 'Brugmansia arborea', ipni: '77109574-1', family: 'Solanaceae' }, TODAY);
    expect(r).toMatchObject({ status: 'none', detail: "the file's row under IPNI id 77109574-1 holds no figures (no probability, no interval, no class); the file marks the species as assessed by the IUCN Red List" });
    expect(riskWords(r).body).not.toContain('holds no row');
    expect(JSON.stringify(r)).not.toMatch(/"EW"/);
  });
});

describe('S5: a file there but not read whole is "not asked", with why, and the build says so', () => {
  const dossier = () => JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8')) as Dossier;
  const run = async (dir: string) => {
    const d = dossier();
    const s = await loadSources(dir, [sourcePage(d)], { checkMd5: false });
    applySources(d, s, TODAY);
    const c = emptyCounts();
    countInto(c, d);
    return { s, d, lines: sourcesLines(s, c) };
  };
  it('a WFO zip the extractor fails on (unzip or tar exit code not 0)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87y-wfozip-'));
    writeFileSync(join(dir, 'wfo_backbone_2026-06.zip'), 'not a zip\n');
    const { s, d, lines } = await run(dir);
    expect(s.wfo).toBeNull();
    expect(s.failed.wfo).toMatch(/^WFO's wfo_backbone_2026-06\.zip could not be read: (unzip|tar) .* ended with exit code [1-9]/);
    expect(d.nameAgreement).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/^not asked: the file could not be read: /) });
    expect(lines[2]).toMatch(/^WFO Plant List: COULD NOT BE READ: .*: every page not asked \(1 page say so\)$/);
  });
  it('a WFO file whose header lacks a column read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87y-wfohead-'));
    writeFileSync(join(dir, 'wfo_classification_2026-06.csv'), 'taxonID\tscientificName\nwfo-1\t"Abies densa"\n');
    const { s, d } = await run(dir);
    expect(s.failed.wfo).toMatch(/has no column scientificNameID, localID, taxonRank, scientificNameAuthorship, taxonomicStatus, acceptedNameUsageID/);
    expect(d.nameAgreement!.status).toBe('skipped');
  });
  it('ChromoDB\'s records without POWO_ID, or with no rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87y-chromohead-'));
    writeFileSync(join(dir, 'IOPB_IAPT_records_v3_1.csv'), RECORDS[0].replace(';POWO_ID', ';powo') + '\n' + RECORDS.slice(1).join('\n') + '\n');
    writeFileSync(join(dir, 'IOPB_IAPT_biblio_v3_1.csv'), BIBLIO.join('\n') + '\n');
    const a = await run(dir);
    expect(a.s.failed.chromo).toMatch(/has no column POWO_ID/);
    expect(a.d.chromosomes).toMatchObject({ status: 'skipped', detail: expect.stringContaining('not asked: the file could not be read') });
    expect(a.lines[1]).toMatch(/^ChromoDB's chromosome counts: COULD NOT BE READ/);
    writeFileSync(join(dir, 'IOPB_IAPT_records_v3_1.csv'), RECORDS[0] + '\n');
    expect((await run(dir)).s.failed.chromo).toMatch(/holds no records/);
  });
  it('the publishers\' files must hold their versions\' rows when the build checks them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r87y-rows-'));
    copyFileSync(join(chromoDir, 'IOPB_IAPT_records_v3_1.csv'), join(dir, 'IOPB_IAPT_records_v3_1.csv'));
    copyFileSync(join(chromoDir, 'IOPB_IAPT_biblio_v3_1.csv'), join(dir, 'IOPB_IAPT_biblio_v3_1.csv'));
    const s = await loadSources(dir, [], {});
    expect(s.failed.chromo).toBe("ChromoDB's IOPB_IAPT_records_v3_1.csv gave 3 records, not the 32,063 of version 3.1");
  });
});
