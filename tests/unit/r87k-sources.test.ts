/**
 * Round eighty-seven, stage 2 (the sources agent): Kew's predicted extinction risk, CITES Appendix status, ChromoDB's
 * chromosome counts and the WFO Plant List's reading of the name, read offline from small extracts of the real files
 * (verbatim rows, read 9 November 2026), by identifiers only (rule 3), "not asked" where a file is not there (rule 2), and
 * the four lines on the page, each with its source, its licence and the day read (rules 1 and 4).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { riskHeader, riskRow, riskOf, loadRisk, RiskIndex } from '$dossier/risk';
import { splitDelimited, loadChromosomes, chromosomesOf, wordsOf } from '$dossier/chromosomes';
import { loadWfo, nameAgreementOf } from '$dossier/wfo';
import { parseCitesTable, CitesIndex, citesOf, CITES_TABLE_FILE, type CitesPage } from '$dossier/cites';
import { loadSources, applySources, carrySources, fillSources, sourcesLines, sourcePage, type LoadedSources } from '$dossier/sources-fill';
import { Dossier as DossierSchema, type Dossier } from '$dossier/schema';
import * as v from 'valibot';
import RiskLine from '$lib/ui/ref/RiskLine.svelte';
import CitesLine from '$lib/ui/ref/CitesLine.svelte';
import ChromosomeLine from '$lib/ui/ref/ChromosomeLine.svelte';
import NameAgreement from '$lib/ui/ref/NameAgreement.svelte';

const TODAY = '2026-11-09';

// Verbatim from Angiosperm_extinction_risk_predictions_v1.csv (Zenodo 10605228, md5 e6fbee92fe19b783345cda27fc18eddc).
const RISK = [
  'plant_name_id,threatened,.lower,.upper,.width,.point,.interval,predicted_threat,confidence,category,observed_threat,combined,ipni_id,family,genus,species,taxon_name',
  '1000048-az,0.574548081,0.497437757,0.652136003,0.95,mean,hdci,threatened,confident,NA,NA,threatened,60462623-2,Crassulaceae,Echeveria,novogaliciana,Echeveria novogaliciana',
  '103356-wcs,0.085430349,0.043768356,0.132322201,0.95,mean,hdci,not threatened,confident,NA,NA,not threatened,753844-1,Rubiaceae,Ixora,coccinea,Ixora coccinea',
  '651101-az,0.30397669,0.255500515,0.36605678,0.95,mean,hdci,not threatened,confident,LC,not threatened,not threatened,128870-1,Cactaceae,Ariocarpus,retusus,Ariocarpus retusus',
  '632735-az,NA,NA,NA,NA,NA,NA,NA,NA,EX,NA,NA,59435-1,Amaranthaceae,Amaranthus,brownii,Amaranthus brownii'
];
// Verbatim from IOPB_IAPT_records_v3_1.csv and IOPB_IAPT_biblio_v3_1.csv (Zenodo 24057855), with the files' byte-order mark.
const RECORDS = [
  '﻿count_id;biblio_id;family;genus;original_taxon_name;accepted_taxon_name;n_value;2n-value;country;subseries;stage;POWO_ID;country_code;count_derivation;confidence_level;remarks',
  '348758;86915;Crassulaceae;Sedum;Sedum hispanicum L.;Sedum hispanicum L.;;40?;Italy;IOPB Chromosome Number Reports;I;275520-1;IT;observation;Original Verified;"Retracted by the authors: Löve & Löve (1985, Taxon 34: 164) state that both the voucher identification and the chromosome count “need to be deleted from the record”. Retained for documentary traceability; not to be used as a valid count."',
  '354016;87045;Crassulaceae;Echeveria;Echeveria strictiflora A.Gray;Echeveria strictiflora A.Gray;12;;United States;IOPB Chromosome Number Reports;I;274067-1;US;observation;Original Verified;',
  '366839;87676;Crassulaceae;Echeveria;Echeveria strictiflora A.Gray;Echeveria strictiflora A.Gray;12;;United States;IOPB Chromosome Number Reports;I;274067-1;US;observation;Original Verified;',
  '370166;87915;Asphodelaceae;Aloe;Chortolirion angolense (Baker) A.Berger;Aloe welwitschii Klopper & Gideon F.Sm.;;14;South Africa;IOPB Chromosome Data;II;77125519-1;ZA;observation;Original Verified;',
  '360246;87283;Brassicaceae;Alyssum;Alyssum alyssoides L.;Alyssum alyssoides (L.) L.;;32;Bosnia and Herzegovina;IAPT/IOPB Chromosome Data;III;277314-1;BA;INFERRED: GS/FC;Original Verified;'
];
const BIBLIO = [
  '﻿biblio_id;authors;authors_short;year;title;journal;volume_pages;source_url;DOI;citation_full;subseries;stage',
  '87676;Weedin, J.F. & Powell, A.M.;Weedin & Powell;1978;In Á. Löve (ed.) IOPB Chromosome Number Reports LX;Taxon;27(2/3): 230-231;https://www.jstor.org/stable/1220245;https://doi.org/10.1002/j.1996-8175.1978.tb04230.x;Weedin, J.F., & Powell, A.M. (1978). In Á. Löve (ed.) IOPB Chromosome Number Reports LX. Taxon 27(2/3): 230-231.;IOPB Chromosome Number Reports;I',
  '87045;Weedin, J.F. & Powell, A.M.;Weedin & Powell;1980;In Á. Löve (ed.) IOPB Chromosome Number Reports LXIX;Taxon;29(5/6): 716-718;https://www.jstor.org/stable/1220359;https://doi.org/10.1002/j.1996-8175.1980.tb00708.x;Weedin, J.F., & Powell, A.M. (1980). In Á. Löve (ed.) IOPB Chromosome Number Reports LXIX. Taxon 29(5/6): 716-718.;IOPB Chromosome Number Reports;I',
  '86915;Löve, Á. & Löve, D.;Löve & Löve;1982;In Á. Löve (ed.) IOPB Chromosome Number Reports LXXVI;Taxon;31(3): 583-587;https://www.jstor.org/stable/1220702;https://doi.org/10.1002/j.1996-8175.1982.tb03560.x;Löve, Á., & Löve, D. (1982). In Á. Löve (ed.) IOPB Chromosome Number Reports LXXVI. Taxon 31(3): 583-587.;IOPB Chromosome Number Reports;I',
  '87915;Smith, G.F.;Smith;1990;In C.A. Stace (ed.) IOPB Chromosome Data 2;IOPB Newsl.;15: 15;https://www.iapt-taxon.org/files/IOPB_newsletter/PDFIOP_15.pdf;;Smith, G.F. (1990). In C.A. Stace (ed.) IOPB Chromosome Data 2. IOPB Newsletter 15: 15.;IOPB Chromosome Data;II'
];
// Verbatim from classification.csv of WFO's release 2026-06 (_DwC_backbone_R.zip, Zenodo 20782718), its first 21 columns.
const WFO = [
  "taxonID\tscientificNameID\tlocalID\tscientificName\ttaxonRank\tparentNameUsageID\tscientificNameAuthorship\tfamily\tsubfamily\ttribe\tsubtribe\tgenus\tsubgenus\tspecificEpithet\tinfraspecificEpithet\tverbatimTaxonRank\tnomenclaturalStatus\tnamePublishedIn\ttaxonomicStatus\tacceptedNameUsageID\toriginalNameUsageID",
  "wfo-0000218310\turn:lsid:ipni.org:names:753843-1\t103355\t\"Ixora coccinea\"\tspecies\t\t\"Comm. ex Lam.\"\tProteaceae\t\t\t\tIxora\t\tcoccinea\t\tspecies\tInvalid\t\"Encycl.  2: 355 (1786)\"\tSynonym\twfo-0000667056\t",
  "wfo-0000218311\turn:lsid:ipni.org:names:753844-1\t103356\t\"Ixora coccinea\"\tspecies\twfo-4000019411\tL.\tRubiaceae\tDialypetalanthoideae\tIxoreae\t\tIxora\t\tcoccinea\t\tspecies\tValid\t\"Sp. Pl. : 110 (1753)\"\tAccepted\t\t",
  "wfo-0000218312\turn:lsid:ipni.org:names:77242561-1\t103357\t\"Ixora coccinea\"\tspecies\t\tCurtis\tRubiaceae\tDialypetalanthoideae\tIxoreae\t\tIxora\t\tcoccinea\t\tspecies\tIllegitimate\t\"Bot. Mag. 5: t. 169 (1791)\"\tSynonym\twfo-0000218302\t",
  "wfo-0000547477\turn:lsid:ipni.org:names:128870-1\tf824a03f-305a-4cb9-bee6-90fb3ccad9e4\t\"Ariocarpus retusus\"\tspecies\twfo-4000003041\tScheidw.\tCactaceae\t\t\t\tAriocarpus\t\tretusus\t\tspecies\tValid\t\"Bull. Acad. Roy. Sci. Bruxelles 5: 492, t. 1. 1838.\"\tAccepted\t\t",
  "wfo-0000630722\turn:lsid:ipni.org:names:30080457-2\t383170\t\"Cupressus lusitanica\"\tspecies\t\tMill.\tCupressaceae\t\t\t\tCupressus\t\tlusitanica\t\tspecies\tValid\t\"Gard. Dict. Ed. 7 3. (1768)\"\tSynonym\twfo-0000912972\t",
  "wfo-0000667056\turn:lsid:ipni.org:names:703489-1\t916244\t\"Embothrium coccineum\"\tspecies\twfo-4000013301\t\"J.R.Forst. & G.Forst.\"\tProteaceae\t\t\t\tEmbothrium\t\tcoccineum\t\tspecies\tValid\t\"Char. Gen. Pl. : 16 (1776)\"\tAccepted\t\t",
  "wfo-0000912972\turn:lsid:ipni.org:names:60451554-2\t457911\t\"Hesperocyparis lusitanica\"\tspecies\twfo-4000017629\t\"(Mill.) Bartel\"\tCupressaceae\t\t\t\tHesperocyparis\t\tlusitanica\t\tspecies\tValid\t\"Phytologia 91: 181. (2009)\"\tAccepted\t\twfo-0000630722",
  "wfo-0001302011\t\t9905253\t\"Cyperus violifolia\"\tspecies\t\t\"Rodriguez & Alfonso\"\tCyperaceae\t\tCypereae\tCyperinae\tCyperus\t\tviolifolia\t\tspecies\t\t\"Rev Centr. Agricol. 15(1): 88 1989\"\tUnchecked\t\t",
];

const pageOf = (name: string, authorship: string, ipni: string, family: string, synonyms: string[] = []) => ({ name, authorship, ipni, family, synonyms });

let dir: string, empty: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'r87k-'));
  empty = mkdtempSync(join(tmpdir(), 'r87k-empty-'));
  writeFileSync(join(dir, 'Angiosperm_extinction_risk_predictions_v1.csv'), RISK.join('\n') + '\n');
  writeFileSync(join(dir, 'IOPB_IAPT_records_v3_1.csv'), RECORDS.join('\r\n') + '\r\n');
  writeFileSync(join(dir, 'IOPB_IAPT_biblio_v3_1.csv'), BIBLIO.join('\r\n') + '\r\n');
  // The withdrawn version 2.0's file beside it: never read.
  writeFileSync(join(dir, 'IOPB_IAPT_records_2025.csv'), 'not read\n');
  writeFileSync(join(dir, 'wfo_classification_2026-06.csv'), WFO.join('\n') + '\n');
});

describe('risk: Kew\'s predicted extinction risk, by IPNI id, with no IUCN column', () => {
  it('reads the model\'s probability, interval, class and confidence', async () => {
    const idx = (await loadRisk(dir, new Set(['60462623-2', '128870-1', '753844-1', '59435-1'])))!;
    expect(idx.rows).toBe(4);
    expect(idx.asOf).toBe('2024-02-01');
    const r = riskOf(idx, pageOf('Echeveria novogaliciana', 'J.Reyes, Brachet & O.González', '60462623-2', 'Crassulaceae'), TODAY);
    expect(r).toEqual({ status: 'ok', read: TODAY, file: 'Angiosperm_extinction_risk_predictions_v1.csv', asOf: '2024-02-01', p: 0.574548081, lo: 0.497437757, hi: 0.652136003, predicted: 'threatened', confident: true, ipni: '60462623-2' });
  });
  it('keeps no IUCN category: an assessed species says only that it is assessed', async () => {
    const idx = (await loadRisk(dir, new Set(['128870-1'])))!;
    const r = riskOf(idx, pageOf('Ariocarpus retusus', 'Scheidw.', '128870-1', 'Cactaceae'), TODAY);
    expect(r.assessed).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/"LC"|observed|combined|category/);
  });
  it('a row with no figures ("NA") is no prediction', () => {
    const h = riskHeader(RISK[0]);
    expect(riskRow(h, RISK[4])).toBeNull();
  });
  it('matches by IPNI id, never by the file\'s plant_name_id (WCVP\'s of 2023) nor by name', async () => {
    const idx = (await loadRisk(dir, new Set(['999-1'])))!;
    // Ixora coccinea's row is 103356-wcs, the number Kew's file gives it now: a page with another IPNI id is not read by it.
    const r = riskOf(idx, pageOf('Ixora coccinea', 'L.', '999-1', 'Rubiaceae'), TODAY);
    expect(r.status).toBe('none');
    expect(r.detail).toBe('the file holds no row under IPNI id 999-1');
  });
  it('a family the file does not hold is said so, true either way', async () => {
    const idx = (await loadRisk(dir, new Set(['60451554-2'])))!;
    expect(riskOf(idx, pageOf('Hesperocyparis lusitanica', '(Mill.) Bartel', '60451554-2', 'Cupressaceae'), TODAY).detail).toBe('the file holds no row of the family Cupressaceae (the model covers flowering plants)');
  });
  it('a page with no IPNI id is not decided, never "none"', () => {
    const idx = new RiskIndex('f.csv', '1');
    expect(riskOf(idx, { name: 'X y' }, TODAY).status).toBe('undecided');
  });
});

describe('chromosomes: ChromoDB\'s IAPT/IOPB set, by IPNI id and the accepted name', () => {
  it('reads a quoted field that holds the delimiter', () => {
    const c = splitDelimited(RECORDS[1]);
    expect(c).toHaveLength(16);
    expect(c[15]).toMatch(/^Retracted by the authors: .*not to be used as a valid count\.$/);
  });
  it('gives each count as published with its reference, one a reference', async () => {
    const idx = (await loadChromosomes(dir, new Set(['274067-1'])))!;
    expect(idx.version).toBe('3_1');
    const c = chromosomesOf(idx, pageOf('Echeveria strictiflora', 'A.Gray', '274067-1', 'Crassulaceae'), TODAY);
    expect(c.status).toBe('ok');
    expect(c.version).toBe('3.1');
    expect(c.asOf).toBe('2026-11-08');
    expect(c.counts).toEqual([
      { n: '12', ref: 'Weedin & Powell 1980', cite: 'Taxon 29(5/6): 716-718', url: 'https://doi.org/10.1002/j.1996-8175.1980.tb00708.x', country: 'United States' },
      { n: '12', ref: 'Weedin & Powell 1978', cite: 'Taxon 27(2/3): 230-231', url: 'https://doi.org/10.1002/j.1996-8175.1978.tb04230.x', country: 'United States' }
    ]);
  });
  it('says the name a count was published under, and links a reference with no DOI by its stable URL', async () => {
    const idx = (await loadChromosomes(dir, new Set(['77125519-1'])))!;
    const c = chromosomesOf(idx, pageOf('Aloe welwitschii', 'Klopper & Gideon F.Sm.', '77125519-1', 'Asphodelaceae'), TODAY);
    expect(c.counts).toEqual([{ twoN: '14', ref: 'Smith 1990', cite: 'IOPB Newsl. 15: 15', url: 'https://www.iapt-taxon.org/files/IOPB_newsletter/PDFIOP_15.pdf', as: 'Chortolirion angolense (Baker) A.Berger', country: 'South Africa' }]);
  });
  it('leaves out a count its authors retracted and a number inferred from genome size', async () => {
    const idx = (await loadChromosomes(dir, new Set(['275520-1', '277314-1'])))!;
    const sedum = chromosomesOf(idx, pageOf('Sedum hispanicum', 'L.', '275520-1', 'Crassulaceae'), TODAY);
    expect(sedum).toMatchObject({ status: 'none', left: 1 });
    expect(sedum.counts).toBeUndefined();
    expect(chromosomesOf(idx, pageOf('Alyssum alyssoides', '(L.) L.', '277314-1', 'Brassicaceae'), TODAY)).toMatchObject({ status: 'none', left: 1 });
  });
  it('never takes a record whose accepted name is not the page\'s, though the id is', async () => {
    const idx = (await loadChromosomes(dir, new Set(['274067-1'])))!;
    const c = chromosomesOf(idx, pageOf('Echeveria rosea', 'Lindl.', '274067-1', 'Crassulaceae'), TODAY);
    // Round eighty-seven's review of stage 2 (S3): not decided, said with the record's name, never "no count".
    expect(c.status).toBe('undecided');
    expect(c.detail).toMatch(/named Echeveria strictiflora A\.Gray, not this page's name as Kew spells it: not taken/);
  });
  it('reads no version before 3.0 (2.0 is withdrawn: its rows are misaligned)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'r87k-v2-'));
    writeFileSync(join(d, 'IOPB_IAPT_records_v2.csv'), RECORDS.join('\n'));
    writeFileSync(join(d, 'IOPB_IAPT_biblio_v2.csv'), BIBLIO.join('\n'));
    expect(await loadChromosomes(d, new Set(['274067-1']))).toBeNull();
  });
  it("a name's words without its authors", () => {
    expect(wordsOf('Chortolirion angolense (Baker) A.Berger')).toBe('Chortolirion angolense');
    expect(wordsOf('× Agrotrigia hajastanica (Tzvelev) Tzvelev')).toBe('× Agrotrigia hajastanica');
    expect(wordsOf('Avena sterilis subsp. sterilis')).toBe('Avena sterilis subsp. sterilis');
  });
});

describe('nameAgreement: the WFO Plant List, by IPNI id, else by the exact name and authors', () => {
  it('accepted, by IPNI id', async () => {
    const idx = (await loadWfo(dir, new Set(['753844-1']), new Set()))!;
    expect(idx.release).toBe('2026-06');
    expect(nameAgreementOf(idx, pageOf('Ixora coccinea', 'L.', '753844-1', 'Rubiaceae'), TODAY)).toEqual({ status: 'ok', read: TODAY, release: '2026-06', file: 'wfo_classification_2026-06.csv', by: 'ipni', wfo: 'wfo-0000218311', kind: 'accepted' });
  });
  it('a synonym, named with its accepted name, read on the second pass', async () => {
    const idx = (await loadWfo(dir, new Set(['753843-1', '30080457-2']), new Set()))!;
    expect(nameAgreementOf(idx, pageOf('Ixora coccinea', 'Comm. ex Lam.', '753843-1', 'Rubiaceae'), TODAY)).toMatchObject({ status: 'ok', by: 'ipni', kind: 'synonym', of: 'Embothrium coccineum J.R.Forst. & G.Forst.', ofId: 'wfo-0000667056' });
    // The accepted row was not a page's: read for its words only, not matched as one.
    expect(idx.byIpni.has('703489-1')).toBe(false);
  });
  it('a row WFO gives no IPNI id: by the exact name and authors, and not by the name alone', async () => {
    const idx = (await loadWfo(dir, new Set(), new Set(['Cyperus violifolia'])))!;
    expect(nameAgreementOf(idx, { name: 'Cyperus violifolia', authorship: 'Rodriguez & Alfonso' }, TODAY)).toMatchObject({ status: 'ok', by: 'name', kind: 'unchecked', wfo: 'wfo-0001302011' });
    expect(nameAgreementOf(idx, { name: 'Cyperus violifolia', authorship: 'Other' }, TODAY).status).toBe('undecided');
  });
  // Round eighty-seven's review of stage 2 (B1): the same name and authors under another IPNI id is the page's name, the
  // two ids said (it was "does not hold this name" on 2,526 pages); the words under other authors only are not decided.
  it('the same words and authors under another IPNI id: found, the two ids said; other authors only: not decided', async () => {
    const idx = (await loadWfo(dir, new Set(['111-1']), new Set(['Ixora coccinea'])))!;
    const w = nameAgreementOf(idx, pageOf('Ixora coccinea', 'L.', '111-1', 'Rubiaceae'), TODAY);
    expect(w).toMatchObject({ status: 'ok', by: 'name', wfo: 'wfo-0000218311', kind: 'accepted', detail: 'matched by the exact name and authors: WFO files it under IPNI id 753844-1, Kew under IPNI id 111-1' });
    expect(nameAgreementOf(idx, pageOf('Ixora coccinea', 'Roxb.', '111-1', 'Rubiaceae'), TODAY)).toMatchObject({ status: 'undecided', detail: expect.stringContaining('only under other authors (Comm. ex Lam.; L.; Curtis), not Roxb.') });
  });
});

// The table as it stood before the owner's check, whatever its `checked:` line now says: these tests read both states.
const TABLE = readFileSync(CITES_TABLE_FILE, 'utf8').replace(/^# checked: .*$/m, '# checked: no');
const checked = () => new CitesIndex(parseCitesTable(TABLE.replace(/^# checked: no$/m, '# checked: 2026-11-10 md5 0123456789abcdef0123456789abcdef')));
const cp = (name: string, family: string, synonyms: string[] = [], lifeform?: string): CitesPage => ({ name, family, synonyms, ...(lifeform ? { lifeform } : {}) });

describe('cites: the plant listings of the Appendices, by the page\'s names', () => {
  it('the table reads whole: every row with its Appendix, source and URL', () => {
    const t = parseCitesTable(TABLE);
    expect(t.rows.length).toBeGreaterThan(200);
    expect(t.validFrom).toBe('2026-03-05');
    for (const r of t.rows) { expect(r.url).toMatch(/^https:\/\/cites\.org\//); expect(r.source).toBeTruthy(); }
  });
  it('not checked against the edition in force: not asked, never "not listed"', () => {
    const c = citesOf(new CitesIndex(parseCitesTable(TABLE)), cp('Ariocarpus retusus', 'Cactaceae'), TODAY);
    expect(c.status).toBe('skipped');
    expect(c.detail).toMatch(/^not asked: /);
  });
  const cases: Array<[string, CitesPage, Record<string, unknown>]> = [
    ['a genus listing', cp('Ariocarpus retusus', 'Cactaceae'), { status: 'ok', appendix: 'I', level: 'genus', listed: 'Ariocarpus spp.' }],
    ['the family listing', cp('Cereus jamacaru', 'Cactaceae'), { status: 'ok', appendix: 'II', level: 'family', listed: 'CACTACEAE spp.', annotation: 'P1 #4' }],
    ['a genus the family listing excepts', cp('Pereskia aculeata', 'Cactaceae'), { status: 'none' }],
    ['a synonym in an excepted genus', cp('Leuenbergeria bleo', 'Cactaceae', ['Pereskia bleo']), { status: 'undecided' }],
    ['a species excepted by name', cp('Aloe vera', 'Asphodelaceae', ['Aloe barbadensis']), { status: 'none' }],
    ['a species listing', cp('Aloe polyphylla', 'Asphodelaceae'), { status: 'ok', appendix: 'I', level: 'species' }],
    ['under a name Kew holds as a synonym', cp('Mammillaria solisioides', 'Cactaceae', ['Mammillaria pectinifera subsp. solisioides']), { status: 'ok', appendix: 'I', via: 'Mammillaria pectinifera subsp. solisioides' }],
    ['a genus only a synonym is in', cp('Gasteria carinata', 'Asphodelaceae', ['Aloe carinata']), { status: 'undecided' }],
    ['a genus CoP20 lists by its own name (the edition of 5 March 2026)', cp('Aloidendron dichotomum', 'Asphodelaceae', ['Aloe dichotoma']), { status: 'ok', appendix: 'II', listed: 'Aloidendron spp.' }],
    ['an Avonia, which the Anacampseros listing includes', cp('Avonia albissima', 'Anacampserotaceae', ['Anacampseros albissima']), { status: 'ok', appendix: 'II', listed: 'Anacampseros spp.' }],
    ['Nardostachys by the name of the edition of 5 March 2026', cp('Nardostachys jatamansi', 'Caprifoliaceae'), { status: 'ok', appendix: 'II', listed: 'Nardostachys jatamansi' }],
    ['a genus Kew draws wider than the listing', cp('Pelecyphora vivipara', 'Cactaceae', ['Escobaria vivipara', 'Coryphantha vivipara']), { status: 'undecided' }],
    ['the listed genus\'s own species', cp('Pelecyphora aselliformis', 'Cactaceae', ['Anhalonium aselliforme']), { status: 'ok', appendix: 'I', listed: 'Pelecyphora spp.' }],
    ['a family Kew draws wider than the listing', cp('Portulacaria afra', 'Didiereaceae'), { status: 'undecided' }],
    ['the family listing\'s own genus', cp('Alluaudia procera', 'Didiereaceae'), { status: 'ok', appendix: 'II', listed: 'DIDIEREACEAE spp.' }],
    ['"succulent species only"', cp('Euphorbia obesa', 'Euphorbiaceae', [], 'succulent subshrub'), { status: 'undecided' }],
    ['excepted from the succulent euphorbias', cp('Euphorbia misera', 'Euphorbiaceae'), { status: 'none' }],
    ['a transfer of CoP20', cp('Euphorbia bupleurifolia', 'Euphorbiaceae'), { status: 'ok', appendix: 'I', url: 'https://cites.org/sites/default/files/notifications/E-Notif-2026-005.pdf' }],
    ['an Appendix III listing and its Party', cp('Tylecodon bodleyae', 'Crassulaceae'), { status: 'ok', appendix: 'III', party: 'South Africa' }],
    ['a listing below the species, on its own page', cp('Sarracenia rubra subsp. jonesii', 'Sarraceniaceae'), { status: 'ok', appendix: 'I', level: 'infraspecific' }],
    ['no listing', cp('Hesperocyparis lusitanica', 'Cupressaceae'), { status: 'none' }]
  ];
  for (const [what, page, want] of cases) it(`${what}: ${page.name}`, () => expect(citesOf(checked(), page, TODAY)).toMatchObject(want));
  it('a species whose subspecies are listed apart says so beside its own listing', () => {
    const c = citesOf(checked(), cp('Sarracenia rubra', 'Sarraceniaceae'), TODAY);
    expect(c).toMatchObject({ status: 'ok', appendix: 'II', listed: 'Sarracenia spp.' });
    expect(c.infra).toEqual([{ appendix: 'I', listed: 'Sarracenia rubra ssp. alabamensis' }, { appendix: 'I', listed: 'Sarracenia rubra ssp. jonesii' }]);
  });
  it('a species listing that includes its subspecies does not say it twice', () => {
    expect(citesOf(checked(), cp('Mammillaria pectinifera', 'Cactaceae'), TODAY).infra).toBeUndefined();
  });
});

const dossier = (): Dossier => JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8'));
const asPage = (d: Dossier, name: string, authorship: string, ipni: string, family: string): Dossier => ({ ...d, name: { ...d.name, scientific: name, authorship, family, kew: { ...d.name.kew!, synonyms: [] } }, ids: { ...d.ids, ipni } });

describe('the fill: "not asked" without the files, a figure kept, its day kept', () => {
  it('no file in the folder: every field "not asked", never "none"', async () => {
    // The table unchecked, as it stood before the owner's check: a checked one would answer CITES from the table alone.
    const unchecked = join(mkdtempSync(join(tmpdir(), 'r87k-cites-')), 'cites-appendices.tsv');
    writeFileSync(unchecked, TABLE);
    const s = await loadSources(empty, [sourcePage(dossier())], { citesTable: unchecked });
    expect([s.risk, s.chromo, s.wfo]).toEqual([null, null, null]);
    const d = dossier();
    applySources(d, s, TODAY);
    for (const k of ['risk', 'chromosomes', 'nameAgreement', 'cites'] as const) {
      expect(d[k]!.status).toBe('skipped');
      expect(d[k]!.detail).toMatch(/^not asked: /);
    }
    const lines = sourcesLines(s, { read: 1, written: 1, risk: { ok: 0, none: 0, undecided: 0, skipped: 1 }, cites: { ok: 0, none: 0, undecided: 0, skipped: 1 }, chromosomes: { ok: 0, none: 0, undecided: 0, skipped: 1 }, nameAgreement: { ok: 0, none: 0, undecided: 0, skipped: 1 } });
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(l).toMatch(/not asked/);
  });
  it('a page read before keeps its figure, with its own file and day, when the file is gone', async () => {
    const s = await loadSources(dir, [], { checkMd5: false });
    const d = asPage(dossier(), 'Echeveria novogaliciana', 'J.Reyes, Brachet & O.González', '60462623-2', 'Crassulaceae');
    const withFile = await loadSources(dir, [sourcePage(d)], { checkMd5: false });
    applySources(d, withFile, '2026-11-01');
    expect(d.risk).toMatchObject({ status: 'ok', read: '2026-11-01' });
    const none = await loadSources(empty, [sourcePage(d)]);
    applySources(d, none, TODAY);
    expect(d.risk).toMatchObject({ status: 'ok', read: '2026-11-01', p: 0.574548081 });
    // And the build's line says so: not asked, and on how many pages what an earlier read gave is kept.
    const c = { read: 1, written: 0, risk: { ok: 1, none: 0, undecided: 0, skipped: 0 }, cites: { ok: 0, none: 0, undecided: 0, skipped: 1 }, chromosomes: { ok: 0, none: 1, undecided: 0, skipped: 0 }, nameAgreement: { ok: 1, none: 0, undecided: 0, skipped: 0 } };
    const lines = sourcesLines(none, c);
    expect(lines[0]).toMatch(/: not asked \(0 pages say so; what an earlier read gave kept on 1 page\)$/);
    expect(lines[1]).toMatch(/kept on 1 page\)$/);
    void s;
  });
  it('the same answer read again keeps the day it was first read; the build carries the fields to the fill', async () => {
    const d = asPage(dossier(), 'Ixora coccinea', 'L.', '753844-1', 'Rubiaceae');
    const s = await loadSources(dir, [sourcePage(d)], { checkMd5: false });
    applySources(d, s, '2026-11-01');
    expect(applySources(d, s, TODAY)).toEqual([]);
    expect(d.nameAgreement!.read).toBe('2026-11-01');
    const fresh = asPage(dossier(), 'Ixora coccinea', 'L.', '753844-1', 'Rubiaceae');
    carrySources(d, fresh);
    expect(fresh.risk).toEqual(d.risk);
  });
  it('a fill over a store writes each changed page once, a second fill nothing; the fields parse', async () => {
    const files: Record<string, Dossier> = { 'k1.json': asPage(dossier(), 'Ixora coccinea', 'L.', '753844-1', 'Rubiaceae') };
    let writes = 0;
    const store = { files: () => Object.keys(files), read: <T,>(f: string) => structuredClone(files[f]) as T, write: (f: string, d: unknown) => { writes++; files[f] = d as Dossier; } };
    const s: LoadedSources = await loadSources(dir, [sourcePage(files['k1.json'])], { checkMd5: false });
    expect(fillSources(store, s, TODAY).written).toBe(1);
    expect(fillSources(store, s, '2026-11-12').written).toBe(0);
    expect(writes).toBe(1);
    const parsed = v.parse(DossierSchema, files['k1.json']);
    expect(parsed.risk?.status).toBe('ok');
    expect(parsed.chromosomes?.status).toBe('none');
    expect(parsed.nameAgreement?.kind).toBe('accepted');
  });
});

const html = (C: never, props: Record<string, unknown>) => render(C, { props } as never).body.replace(/<!--[^]*?-->/g, '');

describe('the four lines on the page, each with its source, licence and day', () => {
  it('risk: a model\'s prediction, the paper, Kew\'s data\'s date, CC BY 4.0 and the day read; IUCN by its id only', () => {
    const b = html(RiskLine as never, { risk: { status: 'ok', read: TODAY, file: 'f', asOf: '2024-02-01', p: 0.303, lo: 0.2555, hi: 0.366, predicted: 'not threatened', confident: true, assessed: true, ipni: '128870-1' }, iucnId: '152040' });
    expect(b).toContain('30% probability of being threatened (95% interval 26% to 37%)');
    expect(b).toContain("A model's prediction, not an assessment.");
    expect(b).toContain('href="https://doi.org/10.1111/nph.19592"');
    expect(b).toContain('of 1 February 2024, CC BY 4.0; read 2026-11-09.');
    expect(b).toContain('href="https://www.iucnredlist.org/details/152040/0"');
    expect(b).not.toMatch(/Least Concern|\bLC\b|Vulnerable|Endangered/);
  });
  it('risk not asked', () => {
    expect(html(RiskLine as never, { risk: null })).toContain('not asked');
    expect(html(RiskLine as never, { risk: { status: 'skipped', read: TODAY, detail: 'not asked: the file was not there' } })).toContain('not asked: the file was not there.');
  });
  it('CITES: the Appendix, the listing, the day in force, the official Appendices and Species+ by its id', () => {
    const c = citesOf(checked(), cp('Mammillaria solisioides', 'Cactaceae', ['Mammillaria pectinifera subsp. solisioides']), TODAY);
    const b = html(CitesLine as never, { cites: c, speciesPlusId: '7154' });
    expect(b).toContain('Listed in Appendix I of CITES (the Appendices in force from 5 March 2026).'); // round eighty-seven, the integration: the edition's day, not the listing's
    expect(b).toContain('a name Kew holds as a synonym of this one');
    expect(b).toContain('href="https://cites.org/eng/app/appendices.php"');
    expect(b).toContain('href="https://speciesplus.net/#/taxon_concepts/7154"');
    expect(b).toContain('read 2026-11-09');
    expect(html(CitesLine as never, { cites: null })).toContain('not asked');
  });
  it('chromosomes: each count with its linked reference, then ChromoDB, CC BY 4.0, the day read', async () => {
    const idx = (await loadChromosomes(dir, new Set(['77125519-1'])))!;
    const b = html(ChromosomeLine as never, { chromosomes: chromosomesOf(idx, pageOf('Aloe welwitschii', 'Klopper & Gideon F.Sm.', '77125519-1', 'Asphodelaceae'), TODAY) });
    expect(b).toMatch(/2n = 14<\/span> \(<a href="https:\/\/www\.iapt-taxon\.org\/files\/IOPB_newsletter\/PDFIOP_15\.pdf"[^>]*title="IOPB Newsl\. 15: 15; published as Chortolirion angolense \(Baker\) A\.Berger"[^>]*>Smith 1990<\/a>\)/);
    expect(b).toContain('ChromoDB, IAPT/IOPB chromosome data (Simon, Bosch &amp; Blanché), version 3.1 of 8 November 2026, CC BY 4.0; read 2026-11-09.');
  });
  it('WFO: one line, "WFO Plant List (2026-06): a synonym of …", CC0 and the day read', async () => {
    const idx = (await loadWfo(dir, new Set(['30080457-2']), new Set()))!;
    const b = html(NameAgreement as never, { agreement: nameAgreementOf(idx, pageOf('Cupressus lusitanica', 'Mill.', '30080457-2', 'Cupressaceae'), TODAY) });
    expect(b).toMatch(/<b[^>]*>WFO Plant List \(2026-06\)<\/b> <a href="https:\/\/www\.worldfloraonline\.org\/taxon\/wfo-0000912972"[^>]*>a synonym of Hesperocyparis lusitanica \(Mill\.\) Bartel<\/a>\./);
    expect(b).toContain('World Flora Online, CC0; read 2026-11-09.');
    expect(html(NameAgreement as never, { agreement: null })).toContain('not asked');
  });
});

