/**
 * Round seventy-one, agent A: the summaries (self-review of round seventy, A1 to A11; REVIEW-TRIAGE-70, S-F2). The facts
 * are Wikidata's, GBIF's, Kew's (through GBIF) and IPNI's as they stood on 2026-10-15. Each case fails on `r71base`
 * unless it is marked a guard.
 */
import { describe, it, expect } from 'vitest';
import { summary } from '$dossier/sources/wikipedia';
import { proofByItem, foreignBinomial, titleProof, speciesItems, titleItems, genusCount, gbifName, proofByName, type Who } from '$dossier/summary-proof';
import { checkSummaries, fillRounds } from '$dossier/summary-fill';
import { fixtureFetcher } from '$dossier/fetch';
import { world, SPECIES, GENUS, type World } from './r70a-summary-world';

const who = (name: string, item?: string, more: Partial<Who> = {}): Who => ({ name, synonyms: [], item, ...more });
type Doc = { name: { scientific: string; synonyms: string[]; authorship?: string }; ids: Record<string, unknown>; links: Record<string, unknown>; upstream: Record<string, { status: string; at: string; detail?: string }>; summary?: { text: string; source: string; url: string; licence: string; title: string } };
const doc = (name: string, title: string | undefined, item: string | undefined, rec: { status: string; detail?: string }): Doc => ({
  name: { scientific: name, synonyms: [] },
  ids: { gbif: 1, ...(item ? { wikidata: item } : {}), ...(title ? { wikipedia: title } : {}) },
  links: title ? { wikipedia: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` } : {},
  upstream: { wikipedia: { at: '2026-09-29T00:00:00Z', ...rec } },
  ...(title ? { summary: { text: `${title}: the lead.`, source: 'wikipedia', url: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`, licence: 'CC BY-SA 4.0', title } } : {})
});
const store = (docs: Record<string, Doc>) => ({ files: () => Object.keys(docs), read: <T,>(f: string) => structuredClone(docs[f]) as T, write: (f: string, d: unknown) => { docs[f] = d as Doc; } });
const NOW = () => '2026-10-16T00:00:00Z';

describe('A2: the basionym proof needs another item', () => {
  it('Coryphantha macromeris does not take "Pelecyphora macromeris", another species of the reference, as its own basionym', () => {
    // Q1135881: its sitelink "Pelecyphora macromeris", P566 Q15031906; GBIF and Kew both hold P. macromeris as a species.
    const r = proofByItem('Pelecyphora macromeris', who('Coryphantha macromeris', 'Q1135881'), {
      species: { id: 'Q1135881', sitelink: 'Pelecyphora macromeris', parents: ['Q1'], basionyms: ['Q15031906'], sourceOf: [] },
      title: { id: 'Q1135881', productOf: [], taxonNames: ['Pelecyphora macromeris'], ranks: [SPECIES], basionyms: ['Q15031906'] },
      gbif: { species: 'Pelecyphora macromeris', below: false, synonym: false },
      kewTitle: { rows: [{ authorship: '(Engelm.) D.Aquino & Dan.Sánchez', status: 'ACCEPTED' }] }, kew: null, genus: null
    });
    expect(r).toBeNull(); // base: older-name, "the basionym of Q1135881 and Q1135881"
  });
});

describe('A3: a binomial is another species only when GBIF holds it so and Kew holds a row of it', () => {
  const ferreirianus: World = {
    items: { Q1280382: { sitelink: 'Echinocereus ferreirianus', P171: ['Q1'], P105: [SPECIES], P225: ['Echinocereus ferreirianus'] } },
    // GBIF: Echinocereus ferreirianus H.E.Gates and ferreiranus H.E.Gates, two accepted species; Kew holds ferreiranus only.
    gbif: { 'Echinocereus ferreirianus': { species: 'Echinocereus ferreirianus', status: 'ACCEPTED' } },
    wiki: { 'Echinocereus ferreirianus': { title: 'Echinocereus ferreirianus' } }
  };
  it("Echinocereus ferreiranus keeps its item's article, GBIF's other spelling of it", async () => {
    const r = await summary(world(ferreirianus).f, 'Echinocereus ferreirianus', ['Echinocereus ferreirianus'], who('Echinocereus ferreiranus', 'Q1280382'));
    expect(r).toMatchObject({ status: 'ok', detail: "Wikipedia's article Echinocereus ferreirianus, the English article of this species' Wikidata item (Q1280382)" }); // base: none
  });
  it('Drosera montana still does not take "Drosera tomentosa", which Kew accepts (guard)', async () => {
    const w: World = {
      items: { Q5308558: { sitelink: 'Drosera tomentosa', P171: ['Q266'], P105: [SPECIES], P225: ['Drosera montana'] } },
      gbif: { 'Drosera tomentosa': { species: 'Drosera montana', status: 'SYNONYM', below: 'Drosera montana tomentosa' } },
      kew: { 'Drosera tomentosa': [{ authorship: 'A.St.-Hil.', taxonomicStatus: 'ACCEPTED' }] },
      wiki: { 'Drosera tomentosa': { title: 'Drosera tomentosa' } }
    };
    expect((await summary(world(w).f, 'Drosera tomentosa', ['Drosera tomentosa'], who('Drosera montana', 'Q5308558'))).status).toBe('none');
  });
  it('a Kew row filed under this species is no other species', () => {
    expect(foreignBinomial('Huernia hystrix', who('Ceropegia hystrix'), { species: 'Huernia hystrix', below: false, synonym: false }, { rows: [{ status: 'SYNONYM', accepted: 'Ceropegia hystrix (Hook.f.) Bruyns' }] })).toBe(false); // base: true (Kew not read)
  });
  it('GBIF holding a binomial with no species named is another species (P15)', () => {
    expect(foreignBinomial('Acer saccharum', who('Acer saccharinum'), { below: false, synonym: false })).toBe(true); // guard
  });
});

describe('A6, A7: the product and genus proofs need the species', () => {
  const sp = { id: 'Q2', parents: ['QAgave'], basionyms: [], sourceOf: ['QMezcal'] };
  it("a product naming no plant, or only the genus, is not one species' article (Wikidata's Mezcal, Nopal)", () => {
    expect(proofByItem('Mezcal', who('Agave potatorum', 'Q2'), { species: sp, title: { id: 'QMezcal', productOf: [], taxonNames: [], ranks: [], basionyms: [] }, gbif: null, kew: null, genus: null })).toBeNull(); // base: product
    expect(proofByItem('Mezcal', who('Agave potatorum', 'Q2'), { species: sp, title: { id: 'QMezcal', productOf: ['QAgave'], taxonNames: [], ranks: [], basionyms: [] }, gbif: null, kew: null, genus: null })).toBeNull(); // base: product
  });
  it('Apple, naming Malus domestica and Malus, is still its product (guard)', () => {
    expect(proofByItem('Apple', who('Malus domestica', 'Q18674606'), { species: { id: 'Q18674606', parents: ['Q104819'], basionyms: [], sourceOf: [] }, title: { id: 'Q89', productOf: ['Q104819', 'Q18674606'], taxonNames: [], ranks: [], basionyms: [] }, gbif: null, kew: null, genus: null })?.proof).toBe('product');
  });
  const genus = (only: string) => ({ species: { id: 'Q4', parents: ['QJeff'], basionyms: [], sourceOf: [] }, title: { id: 'QJeff', productOf: [], taxonNames: ['Jeffersonia'], ranks: [GENUS], basionyms: [] }, gbif: null, kew: null, genus: { name: 'Jeffersonia', accepted: 1, only } });
  it("a genus Kew holds for one other species is not this species' article by its parent", () => {
    expect(proofByItem('Jeffersonia', who('Jeffersonia dubia', 'Q4'), genus('Jeffersonia diphylla'))).toBeNull(); // base: monotypic-genus
  });
  it("by its parent where Kew's one species is this one, in the words round seventy wrote (guard)", () => {
    expect(proofByItem('Jeffersonia', who('Jeffersonia diphylla', 'Q4'), genus('Jeffersonia diphylla'))).toEqual({ proof: 'monotypic-genus', words: "this species' genus (QJeff), which holds one accepted species in Kew's WCVP" });
  });
  it("Kew's one species an older name of this species, in another genus, is read by name, not by parent (P12)", () => {
    // Buchozia japonica: Kew's one species of Serissa is Serissa japonica, its older name; its item names Serissa as parent.
    const f = { species: { id: 'Q5', parents: ['QSer'], basionyms: [], sourceOf: [] }, title: { id: 'QSer', productOf: [], taxonNames: ['Serissa'], ranks: [GENUS], basionyms: [] }, gbif: null, kew: null, genus: { name: 'Serissa', accepted: 1, only: 'Serissa japonica' } };
    expect(proofByItem('Serissa', who('Buchozia japonica', 'Q5', { synonyms: ['Serissa japonica (Thunb.) Thunb.'] }), f)?.words).toBe("the genus Serissa (QSer), whose one accepted species in Kew's WCVP is Serissa japonica, an older name of this species (Serissa japonica)"); // guard
  });
  it('a genus named otherwise than this species\' genus is not its genus by parent', () => {
    const f = genus('Jeffersonia diphylla');
    expect(proofByItem('Jeffersonia', who('Plagiorhegma diphylla', 'Q4'), f)).toBeNull(); // guard
  });
});

describe('A8: Rosa luciae, by IPNI', () => {
  // "Rosa lucieae" is Q17246292, which carries IPNI 60464116-2: IPNI's record of Rosa luciae Franch. & Rochebr. ex Crép.
  // The dossier's IPNI is 733162-1 (Rosa luciae Franch. & Rochebr.). GBIF holds Rosa lucieae as an accepted species of its
  // own; Kew holds no such name.
  const w: World = {
    items: { Q65947499: { P171: ['Q34687'], P105: [SPECIES], P225: ['Rosa luciae'] }, Q17246292: { sitelink: 'Rosa lucieae', P105: [SPECIES], P225: ['Rosa lucieae'], P961: ['60464116-2'] } },
    gbif: { 'Rosa lucieae': { species: 'Rosa lucieae', status: 'ACCEPTED' } },
    wiki: { 'Rosa luciae': { title: 'Rosa lucieae' } },
    ipni: { '60464116-2': { name: 'Rosa luciae', authors: 'Franch. & Rochebr. ex Crép.' } }
  };
  const rosa = who('Rosa luciae', 'Q65947499', { ipni: '733162-1', authorship: 'Franch. & Rochebr. ex Crép.' });
  it("takes the article whose item carries IPNI's record of this name by these authors", async () => {
    const r = await summary(world(w).f, 'Rosa luciae', ['Rosa luciae'], rosa);
    expect(r).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Rosa luciae to Rosa lucieae, whose Wikidata item (Q17246292) carries IPNI 60464116-2, IPNI's record of Rosa luciae Franch. & Rochebr. ex Crép., this species' name" }); // base: none
  });
  it("an IPNI record of these words by another author is a homonym's, and proves nothing (guard)", async () => {
    const homonym = { ...w, ipni: { '60464116-2': { name: 'Rosa luciae', authors: 'H.Lév.' } } };
    expect((await summary(world(homonym).f, 'Rosa luciae', ['Rosa luciae'], rosa)).status).toBe('none');
  });
  it("an item carrying this species' own IPNI identifier proves it, with no request to IPNI", async () => {
    const own = { ...w, items: { ...w.items, Q17246292: { ...w.items!.Q17246292, P961: ['733162-1'] } }, ipni: {} };
    const { f, asked } = world(own);
    expect(await summary(f, 'Rosa luciae', ['Rosa luciae'], rosa)).toMatchObject({ status: 'ok', data: { proof: 'ipni' } }); // base: none
    expect(asked.some((u) => u.includes('ipni.org'))).toBe(false);
  });
  it('IPNI not answering leaves it not checked, said as IPNI (rule 2)', async () => {
    const r = await summary(world({ ...w, refuse: /ipni\.org/ }).f, 'Rosa luciae', ['Rosa luciae'], rosa);
    expect(r).toMatchObject({ status: 'refused', detail: "Wikipedia redirects Rosa luciae to Rosa lucieae; whether it is this species' article was not checked: IPNI refused (HTTP 429)" }); // base: none
  });
});

describe('A4: Wikidata read without maxlag', () => {
  it('the species items and the title items ask no maxlag', async () => {
    const { f, asked } = world({ items: { Q1: { sitelink: 'X' } } });
    await speciesItems(f, ['Q1']);
    await titleItems(f, ['X']);
    expect(asked.filter((u) => /maxlag/.test(u))).toEqual([]); // base: both carry maxlag=5
  });
});

describe('A5: a title other than the name is proved, whoever asks it', () => {
  it('a genus carried from the last build is not taken unread (Strombocactus for S. corregidorae)', async () => {
    const w: World = { items: { Q92680669: { P171: ['Q134845'], P105: [SPECIES] }, Q134845: { sitelink: 'Strombocactus', P105: [GENUS], P225: ['Strombocactus'] } }, genera: { Strombocactus: ['Strombocactus corregidorae', 'Strombocactus disciformis'] }, wiki: { Strombocactus: { title: 'Strombocactus' } } };
    expect(await summary(world(w).f, 'Strombocactus', ['Strombocactus', 'Strombocactus corregidorae'], who('Strombocactus corregidorae', 'Q92680669'))).toMatchObject({ status: 'none' }); // base: ok, no record
  });
  it("a common name that is the item's sitelink is taken, its record naming the proof", async () => {
    const w: World = { items: { Q208276: { sitelink: 'Saguaro', P105: [SPECIES], P225: ['Carnegiea gigantea'] } }, wiki: { Saguaro: { title: 'Saguaro' } } };
    expect(await summary(world(w).f, 'Saguaro', ['Saguaro'], who('Carnegiea gigantea', 'Q208276'))).toMatchObject({ status: 'ok', detail: "Wikipedia's article Saguaro, the English article of this species' Wikidata item (Q208276)" }); // base: no detail
  });
  it('the name itself needs no proof and asks nothing more (guard)', async () => {
    const { f, asked } = world({ wiki: { 'Aloe vera': { title: 'Aloe vera' } } });
    const r = await summary(f, 'Aloe vera', ['Aloe vera'], who('Aloe vera', 'Q80079'));
    expect(r.status === 'ok' && !('detail' in r && r.detail)).toBe(true);
    expect(asked.length).toBe(1);
  });
});

describe('A1, A4, A5, S-F2: --fill summaries', () => {
  it('names each species left not checked with its source, and takes off a summary whose record names no proof (Drosera montana)', async () => {
    const docs = { d: doc('Drosera montana', 'Drosera tomentosa', 'Q5308558', { status: 'ok', detail: 'carried from build of 2026-09-29; this build: skipped' }) };
    const c = await checkSummaries(store(docs) as never, world({ refuse: /wbgetentities/ }).f, NOW);
    expect(c.uncheckedLines).toEqual(["Drosera montana: Wikidata refused (HTTP 429); its summary is taken off until it is read"]); // base: undefined
    expect(docs.d.summary).toBeUndefined(); // base: the summary stays
    expect(docs.d.upstream.wikipedia).toEqual({ status: 'refused', at: NOW(), detail: "Wikipedia's article Drosera tomentosa; whether it is this species' article was not checked: Wikidata refused (HTTP 429)" });
  });
  it('a summary whose record names its proof stays when the proof cannot be read again (guard on --again)', async () => {
    const detail = "Wikipedia redirects Bismarckia nobilis to Bismarckia, this species' genus (Q13055333), which holds one accepted species in Kew's WCVP";
    const docs = { d: doc('Bismarckia nobilis', 'Bismarckia', 'Q664462', { status: 'ok', detail }) };
    const c = await checkSummaries(store(docs) as never, world({ refuse: /wbgetentities/ }).f, NOW, { again: true });
    expect(c.unchecked).toBe(1);
    expect(docs.d.summary?.title).toBe('Bismarckia');
    expect(docs.d.upstream.wikipedia.detail).toBe(detail);
  });
  it('a proof Wikidata did not answer for a title is counted not checked (F5)', async () => {
    const docs = { d: doc('Malus domestica', 'Apple', 'Q18674606', { status: 'ok', detail: "Wikipedia redirects Malus domestica to Apple, whose lead is this species'" }) };
    const w: World = { items: { Q18674606: { P171: ['Q104819'], P105: [SPECIES] } }, wiki: { 'Malus domestica': { title: 'Apple' } }, refuse: /titles=Apple/ };
    const c = await checkSummaries(store(docs) as never, world(w).f, NOW);
    expect(c.unchecked).toBe(1);
    expect(c.uncheckedLines[0]).toMatch(/^Malus domestica: Wikipedia redirects Malus domestica to Apple; whether it is this species' article was not checked: Wikidata refused/); // base: no lines
    expect(docs.d.summary).toBeUndefined();
  });
  it('does not ask again what it has settled: a recorded proof, a title set aside', async () => {
    const docs = {
      a: doc('Bismarckia nobilis', 'Bismarckia', 'Q664462', { status: 'ok', detail: "Wikipedia redirects Bismarckia nobilis to Bismarckia, this species' genus (Q13055333), which holds one accepted species in Kew's WCVP" }),
      b: doc('Strombocactus disciformis', undefined, 'Q134845', { status: 'none', detail: 'Wikipedia redirects Strombocactus disciformis to Strombocactus' })
    };
    const { f, asked } = world({});
    const c = await checkSummaries(store(docs) as never, f, NOW);
    expect(asked).toEqual([]); // base: asks both
    expect(c.settled).toBe(2);
  });
  it('a record of the species\' own item as its own basionym is not settled, and is read again', async () => {
    const docs = { t: doc('Tetragonia tetragonoides', 'Tetragonia tetragonioides', 'Q278283', { status: 'ok', detail: "Wikipedia's article Tetragonia tetragonioides, a name of this species with the same type: Wikidata gives Q50839457 as the basionym of Q278283 and Q278283" }) };
    const w: World = { items: { Q278283: { sitelink: 'Tetragonia tetragonioides', P105: [SPECIES], P225: ['Tetragonia tetragonioides'], P566: ['Q50839457'] } }, gbif: { 'Tetragonia tetragonioides': { species: 'Tetragonia tetragonioides', status: 'ACCEPTED' } }, wiki: { 'Tetragonia tetragonioides': { title: 'Tetragonia tetragonioides' } } };
    await checkSummaries(store(docs) as never, world(w).f, NOW);
    expect(docs.t.upstream.wikipedia.detail).toBe("Wikipedia's article Tetragonia tetragonioides, the English article of this species' Wikidata item (Q278283)"); // base: the doubled item kept
  });
  it("a sitelink proved without asking Wikipedia has its record name the proof, though the record was a carry's", async () => {
    const docs = { v: doc('Carnegiea gigantea', 'Saguaro', 'Q208276', { status: 'ok', detail: 'carried from build of 2026-09-29; this build: skipped' }) };
    const { f, asked } = world({ items: { Q208276: { sitelink: 'Saguaro' } } });
    await checkSummaries(store(docs) as never, f, NOW);
    expect(docs.v.upstream.wikipedia).toEqual({ status: 'ok', at: NOW(), detail: "Wikipedia's article Saguaro, the English article of this species' Wikidata item (Q208276)" }); // base: the carry's record kept
    expect(asked.some((u) => u.includes('/page/summary/'))).toBe(false);
  });
  it('a set-aside title left refused is asked again, and taken back on a proof (F1)', async () => {
    const docs = { w: doc('Welwitschia mirabilis', undefined, 'Q156926', { status: 'refused', detail: "Wikipedia redirects Welwitschia mirabilis to Welwitschia; whether it is this species' article was not checked: Wikidata refused (HTTP 429)" }) };
    const w: World = { items: { Q156926: { P171: ['Q15044266'], P105: [SPECIES] }, Q15044266: { sitelink: 'Welwitschia', P105: [GENUS], P225: ['Welwitschia'] } }, genera: { Welwitschia: ['Welwitschia mirabilis'] }, wiki: { 'Welwitschia mirabilis': { title: 'Welwitschia' } } };
    const c = await checkSummaries(store(docs) as never, world(w).f, NOW);
    expect(c.restored).toBe(1); // guard
    expect(docs.w.summary?.title).toBe('Welwitschia');
  });
  it("a sitelink or carried title set aside as not checked is asked again (F10)", async () => {
    const docs = { d: doc('Drosera montana', undefined, 'Q5308558', { status: 'error', detail: "Wikipedia's article Drosera tomentosa; whether it is this species' article was not checked: Wikidata did not answer (x)" }) };
    const { f, asked } = world({ items: { Q5308558: { sitelink: 'Drosera tomentosa' } } });
    await checkSummaries(store(docs) as never, f, NOW);
    expect(asked.some((u) => u.includes('/page/summary/Drosera_tomentosa'))).toBe(true); // guard
  });
  it("the item's sitelink is asked before the title a record names (F7)", async () => {
    const docs = { d: doc('Dypsis lutescens', 'Areca palm', 'Q1', { status: 'ok', detail: "Wikipedia redirects Golden cane palm to Areca palm, whose lead is this species'" }) };
    const { f, asked } = world({ items: { Q1: { sitelink: 'Chrysalidocarpus lutescens' } } });
    await checkSummaries(store(docs) as never, f, NOW);
    expect(asked.find((u) => u.includes('/page/summary/'))).toMatch(/Chrysalidocarpus_lutescens$/); // guard
  });
  it("a recorded redirect onto this species' own name names the proof (F2)", async () => {
    const docs = { d: doc('Welwitschia mirabilis', 'Welwitschia mirabilis', undefined, { status: 'ok', detail: "Wikipedia redirects Welwitschia to Welwitschia mirabilis, whose lead is this species'" }) };
    await checkSummaries(store(docs) as never, null, NOW);
    expect(docs.d.upstream.wikipedia.detail).toBe("Wikipedia redirects Welwitschia to Welwitschia mirabilis, this species' name"); // guard
  });
  it('the fill waits past the hour in which a cooled host is cooled again', () => {
    expect(fillRounds.waits.reduce((a, b) => a + b, 0)).toBeGreaterThan(60 * 60_000); // base: 20 minutes
  });
});

// Guards: each passes on the base and kills a mutant that survived round seventy's tests (self-review A11).
describe('A11: guards the mutants did not reach', () => {
  it('Kew\'s same type needs the same epithet, every row, and the accepted name\'s basionym author (P17, P18, P19)', () => {
    const sprekelia = who('Sprekelia formosissima');
    const facts = (rows: Array<{ authorship?: string; status?: string; accepted?: string }>) => ({ title: null, kew: { rows }, gbif: null });
    expect(proofByItem('Zephyranthes formosissima', sprekelia, facts([{ authorship: '(L.) Herb.', status: 'SYNONYM', accepted: 'Zephyranthes formosissima (L.) Z.H.Feng' }]))?.proof).toBe('older-name');
    expect(proofByItem('Zephyranthes candida', sprekelia, facts([{ authorship: '(L.) Herb.', status: 'SYNONYM', accepted: 'Zephyranthes candida (L.) Herb.' }]))).toBeNull();
    expect(proofByItem('Zephyranthes formosissima', sprekelia, facts([{ authorship: '(L.) Herb.', status: 'SYNONYM', accepted: 'Zephyranthes formosissima (L.) Z.H.Feng' }, { authorship: 'Hort.', status: 'ACCEPTED' }]))).toBeNull();
    expect(proofByItem('Zephyranthes formosissima', sprekelia, facts([{ authorship: '(L.) Herb.', status: 'SYNONYM', accepted: 'Zephyranthes formosissima (Mill.) Z.H.Feng' }]))).toBeNull();
  });
  it("Kew's count is 0 for two accepted genera of one name, a genus Kew does not accept, and an error with no count (P20, P21, P33)", async () => {
    const W = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=';
    const row = (k: number, s = 'ACCEPTED') => ({ key: k, canonicalName: 'Xus', rank: 'GENUS', taxonomicStatus: s });
    expect(await genusCount(fixtureFetcher({ [W]: { results: [row(1), row(2)] } }), 'Xus')).toEqual({ status: 'ok', data: { name: 'Xus', accepted: 0 } });
    expect(await genusCount(fixtureFetcher({ [W]: { results: [row(1, 'SYNONYM')] } }), 'Xus')).toEqual({ status: 'ok', data: { name: 'Xus', accepted: 0 } });
    expect((await genusCount(fixtureFetcher({ [W]: { results: [row(1)] }, 'https://api.gbif.org/v1/species/search': {} }), 'Xus')).status).toBe('error');
  });
  it("GBIF's match at a higher rank is no name (P23)", async () => {
    expect(await gbifName(fixtureFetcher({ 'https://api.gbif.org/v1/species/match': { usageKey: 5, matchType: 'HIGHERRANK', status: 'ACCEPTED' } }), 'Xus yus')).toEqual({ status: 'ok', data: null });
  });
  it('three words are not a binomial (P26)', () => {
    expect(proofByName('Drosera montana tomentosa', who('Drosera montana'))).toBeNull();
  });
  it("the species' item not answering is not checked, never no item (P28, rule 2)", async () => {
    const r = await titleProof(world({ refuse: /ids=Q155825/, items: { Q155825: { sitelink: 'Venus flytrap' } } }).f, 'Venus flytrap', who('Dionaea muscipula', 'Q155825'));
    expect(r).toMatchObject({ status: 'refused', source: 'Wikidata' });
  });
  it('GBIF not answering for a binomial is not checked, never "GBIF holds no such name" (P36, rule 2)', async () => {
    const w: World = { items: { Q1: { sitelink: 'Acer saccharum', P105: [SPECIES] } }, refuse: /species\/match/ };
    expect((await titleProof(world(w).f, 'Acer saccharum', who('Acer saccharinum', 'Q1'))).status).toBe('refused');
  });
  it('a genus item with two taxon names asks no count (P30)', async () => {
    const { f, asked } = world({ items: { Q9: { sitelink: 'Xus', P105: [GENUS], P225: ['Xus', 'Yus'] } }, genera: { Xus: ['Xus zus'] } });
    expect((await titleProof(f, 'Xus', who('Xus zus'))).status).toBe('none');
    expect(asked.some((u) => u.includes('highertaxonKey'))).toBe(false);
  });
  it('a disambiguation page is no article (W3)', async () => {
    const f = fixtureFetcher({ 'https://en.wikipedia.org/api/rest_v1/page/summary/Xus_yus': { type: 'disambiguation', title: 'Xus yus', extract: 'Xus yus may refer to:' } });
    expect((await summary(f, 'Xus yus', ['Xus yus'], who('Xus yus'))).status).toBe('none');
  });
});
