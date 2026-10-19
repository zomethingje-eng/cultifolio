/**
 * Round seventy-one, agent F, second pass (REVIEW-TRIAGE-70; S-F10): every sentence of /about/how and /about/formats this
 * round changed, found by its opening words, read for its example (`claim`), and driven by the merged code, by the method
 * of `tests/about-pages.ts`. The sentences are the agents' (fix-A to fix-E) and F's own; two of B's and C's were corrected
 * to the merged slip rule (fix-F.md, "Second pass"). Sentences whose rule needs a database or a sync engine are driven
 * by their agent's own test, named in the case; the case here reads the sentence's figure or example and asks the code
 * where it is pure. Every case FAILED on r71base (the sentence was absent there) unless marked a guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { said, claim, part, aboutText } from '../about-pages';
import { WcvpIndex, parseWcvpName, parseWcvpDist } from '$dossier/bulk';
import { spellingKey } from '$dossier/epithet';
import { commonsKind, heldNamesOf, shownPhotos, slipStanding, transferTaken } from '$dossier/photo-kind';
import { commonsAuthor } from '$dossier/photo-credit';
import { genitivesAgree } from '$dossier/own-names';
import { crossIds } from '$dossier/sources/wikimedia';
import { media } from '$dossier/sources/gbif';
import { summary } from '$dossier/sources/wikipedia';
import { checkSummaries } from '$dossier/summary-fill';
import { prevIdsFor } from '$dossier/corpus-run';
import { sharedNameMessage } from '$lib/server/synonyms';
import { noneInRange } from '$lib/ui/ref/head';
import { prepare, search } from '$core/search';
import { readDate } from '$lib/import/csv';
import { isUS } from '$lib/weather/forecast';
import type { JsonFetcher } from '$dossier/fetch';
import { world, SPECIES, type World } from './r70a-summary-world';
import { gbifPage } from '../../src/lib/core/page-id';

const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const D = 'plant_name_id|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
/** A sentence read to an end of the caller's choosing, where `said` would stop at an author's ") L". */
function upTo(page: 'how' | 'formats', opening: string, end: string) {
  const t = aboutText(page);
  const a = t.indexOf(opening);
  if (a < 0) throw new Error(`/about/${page}: no "${opening}"`);
  return { text: t.slice(a, t.indexOf(end, a) + end.length), line: 0, where: `/about/${page}, "${opening}"` };
}

/* ---------------- B: Kew, the backbone, Wikidata, iNaturalist ---------------- */
describe('B: Kew\'s rows by the entry each is filed under', () => {
  const s = said('how', 'Where Kew cites the author otherwise');
  it('Fragaria virginiana Duchesne, filed under the type subspecies, takes the range of Miller\'s species (Kew\'s rows, June 2026)', () => {
    const [name, author] = [claim(s, /\((Fragaria virginiana) Duchesne, filed under/), claim(s, /\(Fragaria virginiana (Duchesne), filed under/)];
    const w = new WcvpIndex();
    for (const l of [
      '3265893|77231464-1|Subspecies|Accepted|Rosaceae||Fragaria||virginiana|subsp.|virginiana||||Unknown||||E. Canada|perennial|temperate|Fragaria virginiana subsp. virginiana||3265893||||2949067|77231464-1||N',
      '2949067|318974-2|Species|Accepted|Rosaceae||Fragaria||virginiana||||Mill.||Gard. Dict., ed. 8.|: 2|(1768)||E. Canada|perennial|temperate|Fragaria virginiana|Mill.|2949067||||2948599|318974-2||N',
      '2949066|725144-1|Species|Invalid|Rosaceae||Fragaria||virginiana||||Duchesne||Hist. Nat. Frais.|: 204|(1766)|, not validly publ.||||Fragaria virginiana|Duchesne|3265893|||||725144-1||N'
    ]) w.addName(parseWcvpName(H, l), (n) => /^Fragaria /.test(n));
    w.addDist(parseWcvpDist(D, '3265893|ONT|Ontario|0|0|0'));
    w.addDist(parseWcvpDist(D, '2949067|ONT|Ontario|0|0|0'));
    w.addDist(parseWcvpDist(D, '2949067|WAS|Washington|0|0|0'));
    const got = w.distributions(name, author, 'Rosaceae');
    expect(got && got !== 'ambiguous' && got.rows.map((r) => r.locality), s.where).toEqual(['Ontario', 'Washington']);
  });
  it('"Where the species\' own row is one Kew holds as a synonym of another entry, the range is that entry\'s, and the page says so"', () => {
    const t = said('how', "Where the species' own row is one Kew holds as a synonym of another entry");
    const [row, entry] = [claim(t, /\("Kew holds (Ceropegia mixta \(Masson\) Bruyns) as a synonym of/), claim(t, /as a synonym of (Orbea variegata \(L\.\) Haw\.);/)];
    const w = new WcvpIndex();
    for (const l of [
      '509402|99924-1|Species|Accepted|Apocynaceae||Orbea||variegata|||L.|Haw.||Syn. Pl. Succ.|: 40|(1812)||SW. & S. Cape Prov.|succulent subshrub|subtropical|Orbea variegata|(L.) Haw.|509402|512291|||509289|99924-1||Y',
      '524950|77167004-1|Species|Synonym|Apocynaceae||Ceropegia||mixta|||Masson|Bruyns||S. African J. Bot.| 112: 427|(2017)|||||Ceropegia mixta|(Masson) Bruyns|509402|512117||||77167004-1||Y'
    ]) w.addName(parseWcvpName(H, l), (n) => /^(Ceropegia|Orbea) /.test(n));
    w.addDist(parseWcvpDist(D, '509402|CPP|Cape Provinces|0|0|0'));
    const got = w.distributions('Ceropegia mixta', '(Masson) Bruyns', 'Apocynaceae');
    expect(got && got !== 'ambiguous' && got.synonymOf, t.where).toMatchObject({ row, entry });
  });
});

describe('B: Wikidata\'s POWO proof, and the genitive', () => {
  const s = said('how', 'When Wikidata finds no item that does');
  it('"or its POWO identifier is Kew\'s for this name by the backbone\'s author": Peperomia monticola Miq. (Wikidata, 2026-10-15)', async () => {
    expect(s.text, s.where).toMatch(/or its POWO identifier is Kew's for this name by the backbone's author;/);
    expect(s.text).toMatch(/as does a GBIF key of another author's name, unless its POWO identifier proves it/);
    const KEW = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2';
    const c = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
    const ok = (data: unknown) => ({ status: 'ok', data });
    const kew = [{ authorship: 'Miq.', status: 'ACCEPTED', ipni: '679159-1' }, { authorship: 'Hook.f.', status: 'SYNONYM', ipni: '679160-1' }];
    const f = (async (url: string) => {
      if (url.startsWith(KEW)) return ok({ results: kew.map((r, i) => ({ key: i + 1, scientificName: `Peperomia monticola ${r.authorship}`, canonicalName: 'Peperomia monticola', authorship: r.authorship, taxonomicStatus: r.status, family: 'X', references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${r.ipni}` })) });
      if (url.includes('haswbstatement')) return ok({ query: { search: [] } });
      if (url.includes('action=wbsearchentities')) return ok({ search: [{ id: 'Q15605262', label: 'Peperomia monticola' }] });
      if (url.includes('action=wbgetentities')) return ok({ entities: { Q15605262: { claims: { P31: [c({ id: 'Q16521' })], P225: [c('Peperomia monticola')], P961: [c('679160-1')], P846: [c('4183999')], P5037: [c('urn:lsid:ipni.org:names:679159-1')] } } } });
      if (url.endsWith('/species/4183999')) return ok({ key: gbifPage(4183999), scientificName: 'Peperomia monticola Miq.', canonicalName: 'Peperomia monticola', authorship: 'Miq.', rank: 'SPECIES', kingdom: 'Plantae', taxonomicStatus: 'DOUBTFUL' });
      if (url.includes('ipni.org')) return ok({});
      return { status: 'none' };
    }) as unknown as JsonFetcher;
    expect(await crossIds(f, 'Peperomia monticola', 7555524, [], { authorship: 'Miq.', family: 'X' })).toMatchObject({ status: 'ok', data: { wikidata: 'Q15605262', ipni: '679159-1' } });
  });
  it('"a genitive ending only, never the adjective": Parodia ritteriana is not Parodia ritteri; burbidgeae is burbidgei', () => {
    const [adj, gen] = [claim(s, /an item labelled "Parodia (ritteriana)" is not Parodia ritteri/), claim(s, /is not Parodia (ritteri)\)/)];
    expect(genitivesAgree(adj, gen), s.where).toBe(false);
    expect(genitivesAgree(claim(s, /as "Nepenthes (burbidgeae)" for Nepenthes burbidgei/), 'burbidgei')).toBe(true);
  });
});

describe('B with C: the iNaturalist follow\'s slip and transfer, by the merged rule', () => {
  const s = said('how', 'An id iNaturalist has made inactive is followed');
  it('a name Kew accepts, or holds under another, is no slip; GBIF\'s record by this species\' own author is one name', () => {
    expect(slipStanding('Salvia aurea', { scientific: 'Salvia azurea' }, [{ canonicalName: 'Salvia aurea', scientificName: 'Salvia aurea L.', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES' }], null).own, s.where).toBe(false);
    const [gbifName, author] = [claim(s, /\(GBIF's (Othonna cakilifolia) DC\., which Kew spells cakilefolia/), claim(s, /\(GBIF's Othonna cakilifolia (DC\.), which Kew spells/)];
    const g = (a: string) => ({ matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: gbifName, scientificName: `${gbifName} ${a}`, authorship: a, usageKey: 1 });
    expect(slipStanding(gbifName, { scientific: 'Othonna cakilefolia', authorship: author, key: 2 }, [], g(author)).own).toBe(true);
    expect(slipStanding(gbifName, { scientific: 'Othonna cakilefolia', authorship: author, key: 2 }, [], g('Harv.')).own).toBe(false);
  });
  it('"a name in another genus is never taken when Kew accepts both (Lupinus longifolius is not Acacia longifolia)"', () => {
    expect(s.text, s.where).toMatch(/a name in another genus is never taken when Kew accepts both \(Lupinus longifolius is not Acacia longifolia\)/);
    expect(transferTaken({ kew: 'accepted', kewOurs: 'accepted' })).toBe(false);
    expect(transferTaken({ kew: 'accepted', kewOurs: 'none' })).toBe(true);
  });
});

describe('B: identifiers kept through a lag, and GBIF\'s media', () => {
  it('"they are kept for at most 90 days from the build that first kept them": dated from that build', () => {
    const s = said('how', 'When Wikidata does not answer');
    expect(claim(s, /kept for at most (\d+) days from the build that first kept them/), s.where).toBe('90');
    const row = { status: 'error', at: '2026-10-14T10:00:00Z', detail: 'wikidata maxlag; the identifiers of an earlier build, of a day not known, are kept' };
    const d = { key: gbifPage(3706589), name: { scientific: 'Pleiospilos simulans', synonyms: [] }, distribution: { source: 'WCVP' }, ids: { wikidata: 'Q1' }, upstream: { wikidata: row }, built: '2026-10-14T10:00:00Z' };
    expect(prevIdsFor(d as never)).toMatchObject({ prevIdsOn: '2026-10-14', prevIdsDayUnknown: true }); // driven in full by B's r71b-lag-kept
  });
  it('"asked of GBIF instead, human observations only": a record of another basis is a specimen', async () => {
    const s = said('how', "Photographs come first from the media that GBIF's occurrence download carries");
    expect(s.text, s.where).toMatch(/asked of GBIF instead, human observations only, as the download is read;/);
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { results: [{ key: gbifPage(7), basisOfRecord: 'PRESERVED_SPECIMEN', media: [{ type: 'StillImage', identifier: 'https://x/1.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A' }] }], endOfRecords: true } }; }) as unknown as JsonFetcher;
    const r = await media(f, 3092);
    expect(asked[0]).toMatch(/&basisOfRecord=HUMAN_OBSERVATION&limit=100$/);
    expect(r.status === 'ok' && r.data.map((m) => !!m.specimen)).toEqual([true]);
  });
  it('the lead sentence: GBIF\'s media of a record that is not an observation of the living plant is not shown (C)', () => {
    const s = said('how', "The lead photograph is iNaturalist's wild one first");
    expect(s.text, s.where).toMatch(/GBIF's media of a record that is not an observation of the living plant, or on a herbarium's own host, is not shown/);
    const photo = (id: string, specimen?: boolean) => ({ src: 'gbif', id, url: `https://x/${id}.jpg`, thumb: `https://x/${id}.jpg`, licence: 'by', attribution: 'A, CC BY, via GBIF', ...(specimen ? { specimen } : {}) });
    expect(shownPhotos([photo('a', true), photo('b')]).map((p) => p.id)).toEqual(['b']);
    const f = said('formats', 'Each species page is rendered from one JSON document');
    expect(f.text, f.where).toMatch(/a GBIF photograph whose record is not an observation of the living plant carries specimen, and is not shown/);
  });
});

/* ---------------- A: the summaries ---------------- */
describe('A: a summary under another title', () => {
  const s = said('how', "A summary under any title but the species' name");
  const who = (name: string, item: string) => ({ name, synonyms: [], item });
  it('the spellings it reads: "a gender ending within one declension" ("Euphorbia peplis" is not Euphorbia peplus), "a genitive in -ae is never read as a gender"', () => {
    expect(s.text, s.where).toMatch(/a genitive in -ae is never read as a gender/);
    const c = said('how', "Another spelling of the species' epithet is the species'");
    const [a, b] = [claim(c, /so "Euphorbia (peplis)" is not Euphorbia peplus/), claim(c, /is not Euphorbia (peplus)/)];
    expect(spellingKey(a), c.where).not.toBe(spellingKey(b));
    expect(spellingKey('formosae')).not.toBe(spellingKey('formosum'));
    expect(spellingKey('stolonifer')).toBe(spellingKey('stolonifera')); // guard
  });
  it('"the title\'s item carries … one whose record at IPNI is the species\' name by its author ("Rosa lucieae" for Rosa luciae)"', async () => {
    const [title, of] = [claim(s, /\("(Rosa lucieae)" for Rosa luciae\)/), claim(s, /\("Rosa lucieae" for (Rosa luciae)\)/)];
    const w: World = {
      items: { Q65947499: { P171: ['Q34687'], P105: [SPECIES], P225: [of] }, Q17246292: { sitelink: title, P105: [SPECIES], P225: [title], P961: ['60464116-2'] } },
      gbif: { [title]: { species: title, status: 'ACCEPTED' } },
      wiki: { [of]: { title } },
      ipni: { '60464116-2': { name: of, authors: 'Franch. & Rochebr. ex Crép.' } }
    } as World;
    const r = await summary(world(w).f, of, [of], { ...who(of, 'Q65947499'), ipni: '733162-1', authorship: 'Franch. & Rochebr.' } as never);
    expect(r.status, s.where).toBe('ok');
  });
  it('"one whose proof could not be read … is recorded as not checked, and is not shown until it is read" (Drosera montana)', async () => {
    const r = said('how', 'A summary quoted from under another title');
    expect(r.text, r.where).toMatch(/because Wikidata, GBIF, Kew or IPNI did not answer is recorded as not checked, and is not shown until it is read/);
    const NOW = () => '2026-10-15T00:00:00.000Z';
    const docs: Record<string, any> = { d: { key: gbifPage(1), name: { scientific: 'Drosera montana', synonyms: [] }, ids: { wikidata: 'Q5308558', wikipedia: 'Drosera tomentosa' }, links: {}, summary: { text: 'x', source: 'wikipedia', url: 'u', licence: 'CC BY-SA 4.0', title: 'Drosera tomentosa' }, upstream: { wikipedia: { status: 'ok', detail: 'carried from build of 2026-09-29; this build: skipped' } } } };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    await checkSummaries(store as never, world({ refuse: /wbgetentities/ } as World).f, NOW);
    expect(docs.d.summary, s.where).toBeUndefined();
    expect(docs.d.upstream.wikipedia.detail).toMatch(/was not checked/);
  });
});

/* ---------------- C: Commons ---------------- */
describe('C: the kinds a Commons file is shown as none of', () => {
  const s = said('how', 'A Commons file is shown only as a JPEG or WebP photograph');
  const HELD = heldNamesOf([{ key: gbifPage(1), name: 'Aloe vera' }, { key: gbifPage(2), name: 'Aloe ferox' }]);
  const n = { scientific: 'Aloe vera', key: gbifPage(1), held: HELD };
  it('"a map (in any language …)": each word the sentence gives hides a file', () => {
    const words = claim(s, /a map \(in any language: ([^)]*)\)/).split(/, /).map((w) => w.replace(/^"|"$/g, ''));
    expect(words.length, s.where).toBe(4);
    for (const w of words) expect(commonsKind(`File:Aloe vera ${w}.jpg`, n), w).not.toBeNull();
  });
  it('"an animal named in the file\'s name ("nymphs", "bees")"; a flower with an insect filed under it is the plant (guard)', () => {
    for (const w of claim(s, /an animal named in the file's name \(([^)]*)\)/).split(/, /).map((x) => x.replace(/"/g, ''))) expect(commonsKind(`File:Leaf-footed bug ${w} on Aloe vera.jpg`, n), w).not.toBeNull();
    expect(commonsKind('File:Aloe vera with a bee visitor 2.jpg', n, ['Aloe vera', 'Apis mellifera'])).toBeNull();
  });
  it('"unless its name names this species as a name and none of the others ("Vertical garden" names no Aloe vera)"', () => {
    const t = claim(s, /\("(Vertical garden)" names no Aloe vera\)/);
    expect(commonsKind(`File:${t}.jpg`, n, ['Aloe vera', 'Aloe ferox']), s.where).not.toBeNull();
    expect(commonsKind('File:Aloe vera 1.jpg', n, ['Aloe vera', 'Aloe ferox'])).toBeNull(); // guard
  });
  it('"a pressed, mounted or museum specimen (…) or one whose source is a herbarium\'s or museum\'s specimen record, or whose description calls it one"', () => {
    // Round seventy-two (C8): the description's words are named, and a plant on show in a museum is shown.
    expect(s.text).toMatch(/or one whose source is a herbarium's or museum's specimen record, or whose description calls it a herbarium, pressed, mounted, dried or preserved specimen, or a specimen of a natural-history museum \(a plant on show in another museum is shown\)/);
    expect(commonsKind('File:Aloe vera 1.jpg', n, { kind: 'a pressed or mounted specimen' })).not.toBeNull(); // the kind the fill reads from the source (C's r71c-photographs)
  });
  it('"known by the photograph Commons names as its source or by the number at the end of its name"', () => {
    const c = said('how', 'A Commons copy of an iNaturalist photograph');
    expect(c.text, c.where).toMatch(/known by the photograph Commons names as its source or by the number at the end of its name/);
    const inat = { src: 'inat', id: '9', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/328057104/large.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/328057104/medium.jpg', licence: 'by', attribution: '(c) A, some rights reserved (CC BY)' };
    const copy = { src: 'commons', id: 'File:Aloe vera Tsumeb.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Aloe_vera_Tsumeb.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Aloe_vera_Tsumeb.jpg/500px-Aloe_vera_Tsumeb.jpg', licence: 'by', attribution: 'A, CC BY 4.0, via Wikimedia Commons', inat: '328057104' };
    expect(shownPhotos([inat, copy], n).map((p) => p.src)).toEqual(['inat']);
  });
  it('the author: "a derivative work names both, the original\'s author and its maker, and never the file\'s name"', () => {
    const a = said('how', "A Commons file's author is its Artist field");
    expect(a.text, a.where).toMatch(/a derivative work names both, the original's author and its maker, and never the file's name;/);
    expect(commonsAuthor('N._andamana2.jpg: Marcello Catalano\nderivative work: Mgiganteus (talk)')).toBe('Marcello Catalano; derivative work: Mgiganteus');
  });
  it('/formats: a Commons photograph may carry slips, inat, kind and sourceRead, which the read uses', () => {
    const f = said('formats', 'Each species page is rendered from one JSON document');
    for (const k of ['slips', 'inat', 'kind', 'sourceRead']) expect(f.text, `${f.where}: ${k}`).toMatch(new RegExp(`\\b${k} \\(`));
    expect(readFileSync('src/lib/dossier/schema.ts', 'utf8')).toMatch(/sourceRead/);
  });
});

/* ---------------- D: import, backups, the clock ---------------- */
describe('D: the import\'s short dates and keys', () => {
  it('"or year first … (10-04-15 is 15 April 2010)"', () => {
    const s = upTo('formats', 'Dates are read at the precision they are written at', 'and no other date differently.');
    const [cell, day] = [claim(s, /\((\d\d-\d\d-\d\d) is (?:\d+ \w+ \d{4})\)/), claim(s, /\(\d\d-\d\d-\d\d is (\d+ \w+ \d{4})\)/)];
    expect(new Date(`${readDate(cell, '2026-10-15', 'ymd' as never).d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }), s.where).toBe(day);
    expect(readDate('31-12-23', '2026-10-15', 'ymd' as never).d).toBeNull(); // "and no other date differently"
  });
  it('the keys, the backup and the clock sentences are said; their rules are driven by D\'s r71d-import-bare, r71d-import-dates, r71d-backup-unsent and r71d-clock', () => {
    const t = aboutText('formats');
    expect(t).toMatch(/or the plants filed under the line without the column are as many as the lines sharing it that still lack a plant;/);
    expect(t).toMatch(/numbered after the plants of lines that had none, so a sheet that has lost those columns finds it; while the plant's own line, those columns and all, is still in the sheet, that key finds it for no other line/);
    expect(t).toMatch(/sync does not send it, since a device that cannot read it would set aside the bundle it came in, until a version that reads it opens here, which sends it;/);
    expect(t).toMatch(/A page loaded that long after the reading waits even while another tab of this browser holds the correction in force/);
    expect(t).toMatch(/the question names the day each answer reads, with its year/);
    expect(t).toMatch(/or, read year first, by the day it reads;/);
  });
});

/* ---------------- E: the server, sync and the alerts ---------------- */
describe('E: what the server keeps, the listing, the kept 429 and the keep-data keys', () => {
  it('"in each of the last sixty-one minutes": the listing span is sixty-one minutes', () => {
    const s = upTo('how', 'how many log batches and how many photographs it stored', 'for the hourly limits');
    expect(s.text, s.where).toMatch(/in each of the last sixty-one minutes \(a minute and a number\)/);
    expect(readFileSync('src/lib/server/counters.ts', 'utf8')).toMatch(/const LIST_SPAN = 61;/);
  });
  it('the alerts\' places include all of Alaska: each one is asked of the NWS (St Lawrence Island, the Pribilofs)', () => {
    const s = said('how', 'The frost watch asks MET Norway');
    expect(claim(s, /and all of Alaska, the Aleutians, (St Lawrence Island) and the Pribilofs included/), s.where).toBe('St Lawrence Island');
    expect(isUS(63.78, -171.74)).toBe(true); // Gambell
    expect(isUS(57.13, -170.28)).toBe(true); // St Paul
  });
  it('the listing, the kept 429 and the keep-data keys are said; their rules are driven by E\'s r71e-server, r71e-sync and r71e-keep-ask', () => {
    const f = aboutText('formats');
    expect(f).toMatch(/the server finishes a listing, and settles it, even when the device has gone;/);
    // Round seventy-two (E5): the shorter refusal is kept beside the day's.
    expect(f).toMatch(/a shorter refusal met by such a log batch \(a 503, or a request window's 429\) leaves the day's wait standing and is kept beside it/);
    const h = aboutText('how');
    expect(h).toMatch(/once there was a plant to keep, whichever page asked\)/);
    expect(h).toMatch(/is read from the browser's own record, which asks nothing,/);
  });
});

/* ---------------- F: the pages and search ---------------- */
describe('F: the species address, the records, the search order', () => {
  const s = said('how', 'A species address under an older name goes to the one species that holds it');
  it('"where GBIF files one name by one author under two of them it says so ("one name, not two")"', () => {
    const words = claim(s, /it says so \("([^"]+)"\)/);
    expect(sharedNameMessage('Vernonia praealta', [{ name: 'Vernonia gigantea', authors: ['(L.) Michx.'] }, { name: 'Vernonia noveboracensis', authors: ['(L.) Michx.'] }]), s.where).toMatch(new RegExp(`${words}$`));
  });
  it('the records paragraph: "where every record lies outside the range it says the range and the records disagree"', () => {
    // Round seventy-two (B10): one stray record is no disagreement.
    expect(aboutText('how')).toMatch(/the page counts those it discards, and where every record lies outside the range it says so, and, where two or more do, that the range and the records disagree/);
    expect(noneInRange(49).text).toMatch(/the range and the records disagree/);
  });
  it('/formats: an older name typed whole before a genus the query only begins ("Tecoma speciosa")', () => {
    const f = said('formats', 'Search puts a name typed as a name first');
    const [typed, holder, other] = [claim(f, /: "(Tecoma speciosa)" is/), claim(f, /is (Campsis radicans) before/), claim(f, /before (Tecomanthe speciosa)\)/)];
    const P = prepare([{ key: gbifPage(1), name: other, family: 'X' }, { key: gbifPage(2), name: holder, family: 'X', syn: [typed] }]);
    expect(search(P, typed).map((x) => x.name), f.where).toEqual([holder, other]);
  });
  it('iNaturalist under older names: "asked under these older names" (the follow\'s wider rule is its own sentence)', () => {
    expect(part(said('how', 'From iNaturalist, asked under these older names'), 'From')).toMatch(/^From iNaturalist, asked under these older names, a taxon is taken only when its own name is one of the species' own names/);
  });
});
