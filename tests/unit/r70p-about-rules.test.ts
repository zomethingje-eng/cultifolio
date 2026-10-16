/**
 * Round seventy, agent P, the about-page pass (triage-69 P2, S-F9, R47-13): the sentences the round rewrote, each read
 * for its claim and driven with the case it states (tests/about-pages.ts). They replace the verbatim pins of
 * r67p-about-seams (the Wikidata sentence) and r69p-about-seams (the Commons sizes), which caught none of S-F9's faults.
 *
 * - the Wikidata label rule (B2, B6): Kew's IPNI for another author's name refuses an item; a print is passed over;
 * - the summaries (A1, A2): a shared type, a product, a genus of one species, and a sitelink that is another species' name;
 * - the Commons file rules (C1, C6, C7): the slip, the species of its own, the older name below species;
 * - which slot loads which Commons width (C5, C7, N; R47-13), and an original's own width;
 * - every Worker cache key names the build through `workerKey` (R47-13), each `put` read where it is made;
 * - the hour of uploads, counted apart and when the upload is taken (W6; R47-13);
 * - iNaturalist's own names (B7), GBIF's order of English names (S-F9e), the clock's day and two days (R5).
 *
 * Failed on the base: each sentence read here was absent or said otherwise there (the pass's first-run failures are in
 * docs/review-70/P.md, the P2 section).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { said, claim, part, numberWord, spanWords } from '../about-pages';
import { crossIds, isTaxonItem, LABEL_KEYS } from '$dossier/sources/wikimedia';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { proofByItem, GENUS_RANK, SPECIES_RANK } from '$dossier/summary-proof';
import { heldNamesOf, commonsKind, slipStanding } from '$dossier/photo-kind';
import { photoAt, shownAt, commonsTileOf } from '$dossier/photo-size';
import { ownNames } from '$dossier/own-names';
import { englishNames } from '$dossier/index-entry';
import { WAIT_PAST_MS, TRUST_SERVER_TWICE_PAST_MS } from '$core/hlc';
import { VAULT_WRITES_PER_HOUR } from '$lib/server/caps';
import { Counters } from '$lib/server/counters';
import { pagedStorage } from './helpers/r61s-fake';

const raw = (f: string) => readFileSync(f, 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js)$/.test(f)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

/* ---- Wikidata (B2, B6) ---- */
const W = 'https://www.wikidata.org/w/api.php';
const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const wclaim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
const item = (name: string, keys: string[] = [], ipni: string[] = [], p31 = 'Q16521') => ({ claims: { P225: wclaim(name), ...(keys.length ? { P846: keys.flatMap(wclaim) } : {}), ...(ipni.length ? { P961: ipni.flatMap(wclaim) } : {}), P31: wclaim({ id: p31 }) } });

describe('Wikidata\'s label rule (/about/how, "What comes from where")', () => {
  const s = said('how', 'When Wikidata finds no item that does');
  it('the answers read and the GBIF keys read are the counts the sentence gives', () => {
    expect(numberWord(claim(s, /the items in the first (\w+) answers to the name/)), s.where).toBe(5);
    expect(numberWord(claim(s, /one of its GBIF keys \(up to (\w+) are read\)/))).toBe(LABEL_KEYS);
    expect(raw('src/lib/dossier/sources/wikimedia.ts')).toMatch(/wbsearchentities&format=json&language=en&type=item&limit=5&/);
  });
  it('"each a taxon by what Wikidata says it is (a print of the plant is passed over)"', () => {
    expect(s.text).toMatch(/each a taxon by what Wikidata says it is \(a print of the plant is passed over\)/);
    expect(isTaxonItem(item('Peperomia monticola') as never)).toBe(true);
    expect(isTaxonItem(item('Peperomia monticola', [], [], 'Q11060274') as never)).toBe(false); // a print, with the plant's taxon name
  });
  it('"an IPNI identifier that is Kew\'s for another author\'s name of these words refuses it": Peperomia monticola Miq.', async () => {
    expect(s.text).toMatch(/an IPNI identifier that is Kew's for another author's name of these words refuses it/);
    // Round seventy-c: the GBIF key of another author's name refuses too, which keeps the six whose own IPNI and GBIF
    // record name another author refused (Raphionacme linearis: B's r70c-wikidata-86), and IPNI is asked itself.
    expect(s.text).toMatch(/as does a GBIF key of another author's name, unless its POWO identifier proves it, and any other identifier proves nothing either way/); // round seventy-one: B's POWO proof
    expect(claim(s, /the build asks IPNI itself, (www\.ipni\.org), for the record of an identifier Kew does not hold, and of the identifiers a Wikipedia title's Wikidata item carries, at most once a second/)).toBe('www.ipni.org');
    expect(raw('src/lib/dossier/fetch.ts')).toMatch(/'www\.ipni\.org': 1100,/);
    expect(raw('src/lib/dossier/sources/wikimedia.ts')).toMatch(/https:\/\/www\.ipni\.org\/api\/1\/n\//);
    const f = fixtureFetcher({
      're:srsearch=haswbstatement%3AP846%3D7555524(&|$)': { query: { search: [] } },
      [`${W}?action=wbsearchentities`]: { search: [{ id: 'Q15605262', label: 'Peperomia monticola' }] },
      're:wbgetentities&format=json&ids=Q15605262&': { entities: { Q15605262: item('Peperomia monticola', ['4183999'], ['679160-1']) } },
      'https://api.gbif.org/v1/species/4183999': { key: 4183999, scientificName: 'Peperomia monticola Hook.fil.', canonicalName: 'Peperomia monticola', authorship: 'Hook.fil.', rank: 'SPECIES', taxonomicStatus: 'HETEROTYPIC_SYNONYM', kingdom: 'Plantae', acceptedKey: 4188553, speciesKey: 4188553 },
      [`re:datasetKey=${WCVP_DATASET}`]: { results: [['Peperomia monticola Hook.f.', 'Hook.f.', 'SYNONYM', '679160-1'], ['Peperomia monticola Miq.', 'Miq.', 'ACCEPTED', '679159-1']].map(([scientificName, authorship, taxonomicStatus, ipni], i) => ({ key: 206000000 + i, scientificName, canonicalName: 'Peperomia monticola', authorship, taxonomicStatus, rank: 'SPECIES', references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}` })), endOfRecords: true },
      're:srsearch=haswbstatement%3AP961': { query: { search: [] } }
    }) as JsonFetcher;
    const r = await crossIds(f, 'Peperomia monticola', 7555524, [], { authorship: 'Miq.' });
    expect(r.status, s.where).toBe('none');
  });
});

/* ---- Summaries (A1, A2) ---- */
describe('the summary under another title (/about/how)', () => {
  const s = said('how', "A summary under any title but the species' name");
  const who = { name: 'Ceropegia zebrina', synonyms: ['Huernia zebrina'], item: 'Q100' };
  const sp = (o: Partial<{ sitelink: string; parents: string[]; basionyms: string[]; sourceOf: string[] }> = {}) => ({ id: 'Q100', parents: [], basionyms: [], sourceOf: [], ...o });
  const ti = (o: Partial<{ id: string; productOf: string[]; taxonNames: string[]; ranks: string[]; basionyms: string[] }> = {}) => ({ id: 'Q200', productOf: [], taxonNames: [], ranks: [], basionyms: [], ...o });
  it('a title whose item has the same type, by Wikidata\'s basionym statements, is proved ("Huernia zebrina" for Ceropegia zebrina)', () => {
    const [title, of] = [claim(s, /\("([A-Z][a-z]+ [a-z]+)" for [A-Z][a-z]+ [a-z]+\)/), claim(s, /\("[A-Z][a-z]+ [a-z]+" for ([A-Z][a-z]+ [a-z]+)\)/)];
    const w = { name: of, synonyms: [], item: 'Q100' };
    expect(proofByItem(title, w, { species: sp({ basionyms: ['Q200'] }), title: ti({ ranks: [SPECIES_RANK] }) })?.proof, s.where).toBe('older-name');
    expect(proofByItem(title, w, { species: sp(), title: ti({ ranks: [SPECIES_RANK] }) })).toBeNull(); // no shared type, no proof
  });
  it('a product "naming no other plant but its genus" ("Apple"), and not one naming another plant', () => {
    expect(s.text).toMatch(/the title's item names this species as the plant it is a product of, and no other plant but its genus \("Apple"\)/); // round seventy-one, A's sentence
    const malus = { name: 'Malus domestica', synonyms: [], item: 'Q100' };
    expect(proofByItem('Apple', malus, { species: sp({ parents: ['Q300'] }), title: ti({ productOf: ['Q100', 'Q300'] }) })?.proof).toBe('product');
    expect(proofByItem('Plum', malus, { species: sp({ parents: ['Q300'] }), title: ti({ productOf: ['Q100', 'Q400'] }) })).toBeNull();
  });
  it('a genus in which Kew holds one accepted species, this one ("Welwitschia")', () => {
    expect(numberWord(claim(s, /holds (\w+) accepted species, and that species is this one/))).toBe(1);
    const w = { name: 'Welwitschia mirabilis', synonyms: [], item: 'Q100' };
    const facts = (accepted: number) => ({ species: sp({ parents: ['Q200'] }), title: ti({ ranks: [GENUS_RANK], taxonNames: ['Welwitschia'] }), genus: { name: 'Welwitschia', accepted, only: accepted === 1 ? 'Welwitschia mirabilis' : undefined } });
    expect(proofByItem('Welwitschia', w, facts(1))?.proof).toBe('monotypic-genus');
    expect(proofByItem('Welwitschia', w, facts(2))).toBeNull();
  });
  it('the species\' own sitelink, but not a binomial GBIF holds as another species (Drosera tomentosa on Drosera montana)', () => {
    expect(s.text).toMatch(/but not when that title is a binomial, neither its name nor an older name, that GBIF holds as another species or under a variety or subspecies of this one/);
    const montana = { name: 'Drosera montana', synonyms: [], item: 'Q100' };
    // GBIF's answer for the title, as A's round-seventy-b rule reads it (round seventy-b; A's need): the facts are typed by
    // `proofByItem` itself, so the field is the rule's wherever the merge puts it.
    const tomentosa = { species: sp({ sitelink: 'Drosera tomentosa' }), title: ti({ taxonNames: ['Drosera montana'] }), gbif: { species: 'Drosera montana', below: true, synonym: true } } as Parameters<typeof proofByItem>[2];
    expect(proofByItem('Drosera tomentosa', montana, tomentosa)).toBeNull();
    expect(proofByItem('Venus flytrap', { name: 'Dionaea muscipula', synonyms: [], item: 'Q100' }, { species: sp({ sitelink: 'Venus flytrap' }), title: null })?.proof).toBe('item');
  });
  it('"What the article\'s opening says is never taken as proof": the proof reads no text', () => {
    const o = said('how', "What the article's opening says is never taken as proof");
    expect(o.text, o.where).toBe("What the article's opening says is never taken as proof.");
    expect(raw('src/lib/dossier/summary-proof.ts')).not.toMatch(/extract/);
  });
  void who;
});

/* ---- Commons files (C1, C6, C7) ---- */
describe('the Commons file rules (/about/how)', () => {
  const s = said('how', "Another spelling of the species' epithet is the species'");
  const b = said('how', 'Every binomial in the name, of the species');
  const y = said('how', 'A credit naming a lithographer or draughtsman');
  const HELD = heldNamesOf([
    { key: 7284127, name: 'Mammillaria matudae' },
    { key: 7283175, name: 'Echinocereus scheeri' },
    { key: 3954494, name: 'Echinocereus schereri' },
    { key: 2, name: 'Babiana purpurea', syn: ['Babiana stricta var. purpurea'] },
    { key: 3, name: 'Babiana stricta' }
  ]);
  const shown = (file: string, scientific: string, key: number, synonyms: string[] = []) => commonsKind(`File:${file}.jpg`, { scientific, synonyms, key, held: HELD }) === null;
  // Round seventy-one (C's S-C9, the merge's one rule): a slip is shown only once Kew and GBIF were asked of it and hold it
  // as no species (`Photo.slips`); until then the file is not shown. Kew's synonym of another plant is no slip, and GBIF's
  // second spelling of the same name by the same author is one name.
  it('an uploader\'s slip is the species\' only once Kew and GBIF were asked of it: the sentence\'s own cases', () => {
    const [slipped, species] = [claim(s, /"(Mammillaria \w+)" is Mammillaria \w+;/), claim(s, /"Mammillaria \w+" is (Mammillaria \w+);/)];
    const shownWith = (slips: string[]) => commonsKind(`File:${slipped}.jpg`, { scientific: species, key: 7284127, held: HELD }, { slips: slips.map((x) => x.toLowerCase()) }) === null;
    expect(s.text, s.where).toMatch(/until then the file is not shown/);
    expect(shownWith([]), s.where).toBe(false); // not yet asked
    expect(shownWith([slipped])).toBe(true); // asked, and held as no species
    const own = claim(s, /"(Echinocereus \w+)" is a species of its own/);
    expect(commonsKind(`File:${own}.jpg`, { scientific: 'Echinocereus scheeri', key: 7283175, held: HELD }, { slips: [own.toLowerCase()] })).not.toBeNull();
    expect(numberWord(claim(s, /an uploader's slip of (\w+) letters or more/))).toBe(5);
    const [mariae, scut] = [claim(s, /"(Ceropegia mariae)" Kew's synonym of/), claim(s, /"Ceropegia mariae" Kew's synonym of (Echidnopsis scutellata)/)];
    expect(slipStanding(mariae, { scientific: 'Ceropegia maritae' }, [{ canonicalName: mariae, scientificName: `${mariae} Lavranos`, taxonomicStatus: 'SYNONYM', accepted: `${scut} (Deflers) A.Berger` }], null).own).toBe(false);
    expect(s.text).toMatch(/the same name by the same author spelt otherwise is one name/);
    const gbif = (author: string) => ({ matchType: 'EXACT', status: 'ACCEPTED', rank: 'SPECIES', canonicalName: 'Othonna cakilifolia', scientificName: `Othonna cakilifolia ${author}`, authorship: author, usageKey: 1 });
    expect(slipStanding('Othonna cakilifolia', { scientific: 'Othonna cakilefolia', authorship: 'DC.', key: 2 }, [], gbif('DC.')).own).toBe(true);
    expect(slipStanding('Othonna cakilifolia', { scientific: 'Othonna cakilefolia', authorship: 'DC.', key: 2 }, [], gbif('Harv.')).own).toBe(false);
    expect(slipStanding('Othonna cakilifolia', { scientific: 'Othonna cakilefolia', authorship: 'DC.', key: 2 }, [], null).own).toBe(true); // neither holds it
  });
  it('an older name below species counts only whole', () => {
    const whole = claim(b, /\("(Babiana stricta var\. purpurea)" is Babiana purpurea's/);
    const cut = claim(b, /; "(Babiana stricta)" is not\)/);
    expect(shown(whole, 'Babiana purpurea', 2, ['Babiana stricta var. purpurea (Jacq.) Ker Gawl.']), b.where).toBe(true);
    expect(shown(cut, 'Babiana purpurea', 2, ['Babiana stricta var. purpurea (Jacq.) Ker Gawl.'])).toBe(false);
  });
  // Round seventy-one (C's S-C8): a year marks a printed work only with other print evidence, and a citation's year is no year.
  it('a year from 1500 to 1899 in the name marks a printed work with other print evidence; a citation\'s year is no year; a hybrid by the word', () => {
    const [from, to] = [Number(claim(y, /a year from (\d{4}) to \d{4}/)), Number(claim(y, /a year from \d{4} to (\d{4})/))];
    const year = from + 343;
    expect(y.text, y.where).toMatch(/with other print evidence \(a plate's or a book's words in the name, a category of scans, a licence for old works\)/);
    expect(shown(`Dasylirion graminifolium Zuccarini ${year}`, 'Dasylirion graminifolium', 9)).toBe(true); // a year alone
    // A book's word in the name ("vol"), with the year and without it, and the citation's year with it.
    expect(shown(`Dasylirion graminifolium Zuccarini ${year} vol 2`, 'Dasylirion graminifolium', 9)).toBe(false);
    expect(shown(`Dasylirion graminifolium Zuccarini ${to + 101} vol 2`, 'Dasylirion graminifolium', 9)).toBe(true);
    const cited = claim(y, /a year cited after a page \("([^"]+)"\) is no year/);
    expect(shown(`Dasylirion graminifolium Ecklon${cited} vol 2`, 'Dasylirion graminifolium', 9)).toBe(true);
    // A licence for old works is evidence too.
    expect(commonsKind(`File:Dasylirion graminifolium Zuccarini ${year}.jpg`, { scientific: 'Dasylirion graminifolium', key: 9, held: HELD }, { credit: 'Zuccarini, PD-old, via Wikimedia Commons' })).not.toBeNull();
    expect(shown('Mammillaria matudae hybrid', 'Mammillaria matudae', 7284127)).toBe(false);
  });
});

/* ---- Which slot loads which Commons width (C5, C7, N; R47-13) ---- */
describe('the Commons sizes, slot by slot (/about/how)', () => {
  const s = said('how', 'A Commons photograph is loaded at whichever of Commons');
  const T = (w: number) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/${w}px-F.jpg`;
  /** Each slot the sentence names, the size the code asks there, and the file it is asked in. */
  const SLOTS: Array<[RegExp, 'square' | 'small' | 'medium' | 'large', string, RegExp]> = [
    [/(\d+) pixels wide for the lead/, 'large', 'src/routes/species/[slug]/+page.svelte', /photoOf\(hero, 'large'\)/],
    [/\((\d+) on a phone, or where the screen needs no more\)/, 'medium', 'src/routes/species/[slug]/+page.svelte', /photoOf\(hero, 'medium'\)/],
    [/(\d+) on a front-page tile, in the strip under a species' name and on a Related tile/, 'small', 'src/routes/+page.svelte', /photoAt\(c\.thumb, 'small'\)/],
    [/(\d+) on a front-page tile, in the strip under a species' name and on a Related tile/, 'small', 'src/routes/species/[slug]/+page.svelte', /photoAt\(p\.thumb, 'small'\)/],
    [/(\d+) on a front-page tile, in the strip under a species' name and on a Related tile/, 'small', 'src/routes/species/[slug]/+page.svelte', /photoAt\(c\.thumb, 'small'\)/],
    [/(\d+) in a catalogue row or beside a genus/, 'square', 'src/routes/+page.svelte', /photoAt\(r\.thumb, 'square'\)/]
  ];
  for (const [re, size, file, call] of SLOTS) {
    it(`${String(re).slice(1, 40)}…: asked as '${size}', and that is the width the sentence gives`, () => {
      const w = Number(claim(s, re));
      expect(raw(file), file).toMatch(call);
      expect(photoAt(T(960), size), s.where).toBe(T(w));
    });
  }
  it('the compare page loads the 500 the dossier keeps', () => {
    expect(Number(claim(s, /(\d+) on the compare page/))).toBe(500);
    expect(raw('src/routes/compare/+page.svelte')).toMatch(/<img src=\{c\.hero\.thumb \?\? c\.hero\.url\}/);
  });
  const o = said('how', 'It is never loaded as the original upload where Commons has a version');
  it('an original: 501 to 960 leads at its own width; no wider than 500, at Commons\' largest version below it; 120 or less, whole', () => {
    const O = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/F.jpg';
    const [lo, hi] = [Number(claim(o, /an upload from (\d+) to \d+ pixels wide leads at its own width/)), Number(claim(o, /an upload from \d+ to (\d+) pixels wide leads at its own width/))];
    expect(shownAt({ url: O, thumb: T(500), width: lo })).toBe(O);
    expect(shownAt({ url: O, thumb: T(500), width: hi })).toBe(O);
    expect(shownAt({ url: O, thumb: T(500), width: hi + 1 })).toBe(T(500));
    const tops = claim(o, /loaded at Commons' largest version below its own width, (\d+ or \d+)/).split(' or ').map(Number);
    expect([commonsTileOf(O, 400), commonsTileOf(O, 200)]).toEqual(tops.map((w) => T(w)));
    expect(commonsTileOf(O, Number(claim(o, /whole only where it is (\d+) pixels wide or less/)))).toBe(O);
    expect(commonsTileOf(O, null)).toBe(O); // "or its width is not known"
  });
});

/* ---- The Worker's cache keys (R47-13) ---- */
describe('every copy the Worker keeps is under a key naming the build (/about/how)', () => {
  const server = walk('src').filter((f) => /\+server\.ts$|\/lib\/server\/|hooks\.server\.ts$/.test(f));
  /** Each `put` on the Worker's cache in the server's code, with the key expression it is given. */
  const puts = server.flatMap((f) => {
    const src = raw(f);
    if (!/caches\??\.default/.test(src)) return [];
    return [...src.matchAll(/\b(cache|edge)\.put\(\s*([^,]+),/g)].map((m) => ({ f, key: m[2].trim(), src }));
  });
  it('the walk finds every put: the search, the sheets, the names, the forecast, the old-name check and the page', () => {
    expect(puts.map((p) => p.f).sort()).toEqual(['src/hooks.server.ts', 'src/lib/server/synonyms.ts', 'src/routes/api/forecast/+server.ts', 'src/routes/api/names/+server.ts', 'src/routes/api/search/+server.ts', 'src/routes/api/sheets/+server.ts']);
  });
  it('each key is made by workerKey, read where the key is made; the page\'s names the build in its own address', () => {
    const s = said('how', "Cloudflare's edge keeps copies of public answers");
    expect(s.text, s.where).toMatch(/the server keeps its own copies of searches, figure sheets, name lookups, forecasts and old-name checks under keys that name the app's version/);
    for (const p of puts) {
      const id = /^(\w+)(?:\(\w+\))?$/.exec(p.key)?.[1];
      expect(id, `${p.f}: ${p.key}`).toBeTruthy();
      const made = new RegExp(`(?:const|let) ${id}\\b[^=]*=\\s*([^;\\n]+)`).exec(p.src)?.[1] ?? '';
      const assigned = new RegExp(`\\b${id} = ([^;\\n]+)`).exec(p.src)?.[1] ?? '';
      if (p.f === 'src/hooks.server.ts') expect(assigned, p.f).toMatch(/\?v=\$\{encodeURIComponent\(version\)\}/);
      else expect(made, `${p.f}: ${id}`).toMatch(/workerKey\(/);
    }
    expect(raw('src/lib/server/worker-cache.ts')).toMatch(/\$\{CACHE_HOST\}\/\$\{name\}\?v=\$\{encodeURIComponent\(version\)\}/);
  });
});

/* ---- The hour of uploads (W6; R47-13) ---- */
describe('the hour of uploads (/about/formats)', () => {
  const s = said('formats', 'A vault may take 3,600 log batches and 3,600 photographs in any sixty minutes');
  it('each kind is counted apart, when the upload is taken, an upload that then fails included', async () => {
    const [batches, photos] = [Number(claim(s, /take ([\d,]+) log batches/).replace(/,/g, '')), Number(claim(s, /and ([\d,]+) photographs in any sixty minutes/).replace(/,/g, ''))];
    expect(VAULT_WRITES_PER_HOUR, s.where).toBe(batches);
    expect(VAULT_WRITES_PER_HOUR).toBe(photos);
    expect(s.text).toMatch(/each counted apart in its counter object by the minute the upload is taken \(an upload that then fails still counts\)/); // round seventy-one (E's need 3)
    const store = pagedStorage();
    const c = new Counters({ storage: store } as never, {} as never);
    const now = Date.UTC(2026, 9, 13, 12, 10);
    const hour = Math.floor(now / 3_600_000);
    const t = await c.take('vault', 10, 1_000_000, '2026-10-13', 0, now, null, VAULT_WRITES_PER_HOUR, 'photo');
    expect(t).toMatchObject({ ok: true });
    // Round seventy-one (merge, E's need 1; S-E3): counted by the minute the upload is taken, over any sixty minutes.
    expect(store.m.get('wp')).toEqual({ m: [[Math.floor(now / 60_000), 1]] }); // counted at the take, before any lease is settled
    expect(store.m.get('w')).toBeUndefined(); // and apart from the log batches
    store.m.set('wp', { h: hour, n: photos });
    const spent = await c.take('vault', 10, 1_000_000, '2026-10-13', 10, now, null, VAULT_WRITES_PER_HOUR, 'photo');
    expect(spent).toMatchObject({ spent: true });
    // "Retry-After to when enough of the oldest have left the count, 61 minutes at most" (round seventy-one, E's need 3).
    const most = Number(claim(said('formats', 'Past either, the next upload of that kind is answered 503'), /(\d+) minutes at most/));
    expect('retryAfter' in spent && spent.retryAfter).toBeGreaterThan(0);
    expect('retryAfter' in spent && spent.retryAfter).toBeLessThanOrEqual(most * 60);
    expect(await c.take('vault', 10, 1_000_000, '2026-10-13', 10, now, null, VAULT_WRITES_PER_HOUR, 'log')).toMatchObject({ ok: true });
  });
});

/* ---- iNaturalist's own names (B7) ---- */
describe('the species\' own names for iNaturalist (/about/how)', () => {
  it('another name GBIF holds as its synonym is its own, unless a species of the reference holds it as its own', () => {
    const s = said('how', 'An id iNaturalist has made inactive is followed');
    expect(s.text, s.where).toMatch(/or another name GBIF holds as its synonym that no species of this reference holds as its own/);
    expect(ownNames({ scientific: 'Ceropegia pulvinata', synonyms: ['Stapelia hirsuta L.'], heldElsewhere: () => false }).own.has('stapelia hirsuta')).toBe(true);
    expect(ownNames({ scientific: 'Pinguicula chilensis', synonyms: ['Pinguicula antarctica Vahl'], heldElsewhere: (n) => n === 'Pinguicula antarctica' }).own.has('pinguicula antarctica')).toBe(false);
  });
});

/* ---- English names: GBIF's order, not the alphabet (S-F9e) ---- */
describe('the order of English names (/about/how)', () => {
  it('names given by as many sources, neither preferred, keep the order of GBIF\'s list', () => {
    const s = said('how', 'Names are put in order by a fixed rule');
    expect(s.text, s.where).toMatch(/then the order in which GBIF's list gives the names, which is not always the alphabet;/);
    expect(englishNames([{ name: 'Swamp Mahogany', lang: 'eng', source: 'IUCN' }, { name: 'Bastard mahogany', lang: 'eng', source: 'B' }]).common).toBe('Swamp Mahogany'); // base page: "the alphabet"
  });
});

/* ---- The clock's figures (R5) ---- */
describe('the clock\'s day and two days (/about/formats)', () => {
  it('a positive correction of more than a day waits for a reading; one of two days or more needs two readings', () => {
    const s = said('formats', 'At a page load after the device clock has moved at least the correction');
    expect(spanWords(claim(s, /a positive correction of more than (a day|\w+ days) is not in force until a reading confirms it/)), s.where).toBe(WAIT_PAST_MS);
    const t = said('formats', "That clock is the device's corrected by the server's");
    expect(spanWords(claim(t, /a correction of (\w+ days) or more is taken only when two readings/)), t.where).toBe(TRUST_SERVER_TWICE_PAST_MS);
    expect(part(said('formats', 'Offline, a slow device whose clock was set right'), 'when that correction was')).toMatch(/^when that correction was a day or less; one of more than a day is not in force until a reading/);
  });
});
