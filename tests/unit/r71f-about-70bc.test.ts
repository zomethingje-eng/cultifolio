/**
 * Round seventy-one, agent F (REVIEW-TRIAGE-70, S-F10): every sentence of /about/how that rounds 70b and 70c wrote, driven
 * by its own rule with the sentence's own example, by the method of `tests/about-pages.ts`. Round seventy's seam files
 * opened four of these fourteen sentences and pinned their new clauses verbatim, and three mutations of 70b/70c rules
 * (the iNaturalist slip clause, Kew's family rule, Wikidata's alias) survived them. Each test here reads the example out
 * of the sentence (`claim`) and asks the code; the answers are the sources' own, recorded by agents A, B and C in
 * `tests/unit/fixtures/` (an answer a fixture lacks is a refusal, so a rule that asks something else fails).
 *
 * New cases that FAIL on r71base: the lag sentence (its wording), and the Ixora case on Kew's own rows, which B's
 * family fix turns (`it.fails` until the merge; the round-71 merge made it `it`). Every other case is a guard of a rule the
 * round kept, and fails on its mutation (listed in fix-F.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { said, claim, part, aboutText } from '../about-pages';
import { ownByAuthor } from '$dossier/authors';
import { WcvpIndex, parseWcvpName, parseWcvpDist, bulkFetcher, MediaIndex } from '$dossier/bulk';
import { spellingKey } from '$dossier/epithet';
import { commonsKind, commonsInatCopy, heldNamesOf } from '$dossier/photo-kind';
import { proofByItem } from '$dossier/summary-proof';
import { crossIds } from '$dossier/sources/wikimedia';
import * as gbif from '$dossier/sources/gbif';
import { fillInatIds } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';
import { recordedFetcher } from './helpers/recorded';
import { gbifPage } from '../../src/lib/core/page-id';

/* ---- Kew's own file, as `bulk-load.ts` reads it (wcvp_names.csv of 2026-06-04, the rows these cases touch) ---- */
const H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const row = (id: string, status: string, family: string, name: string, authors: string, accepted: string) => `${id}||Species|${status}|${family}||${name.split(' ')[0]}||${name.split(' ')[1]}|||||||||||||${name}|${authors}|${accepted}||||||||`;
const D = 'plant_name_id|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
function kew(lines: string[], dist: Array<[string, string]>) {
  const w = new WcvpIndex();
  for (const l of lines) w.addName(parseWcvpName(H, l), () => true);
  for (const [id, area] of dist) w.addDist(parseWcvpDist(D, `${id}|X|${area}|0|0|0`));
  return w;
}
const range = (w: WcvpIndex, name: string, author: string, family?: string) => { const g = w.distributions(name, author, family); return g && g !== 'ambiguous' ? g.rows.map((r) => r.locality) : g; };

describe('"The native range comes from the World Checklist" (70b): the author, read in turn', () => {
  // The sentence holds "(Engelm.) Lem.", whose ") L" `said` reads as a sentence's end: read to its last clause instead.
  const whole = aboutText('how');
  const a = whole.indexOf("An entry of Kew's is the page's own when its author is the backbone's");
  const s = { text: whole.slice(a, whole.indexOf('never counts.', a) + 'never counts.'.length), line: 0, where: '/about/how, the native range sentence' };
  const own = (rows: string[], a: string) => ownByAuthor(rows.map((x) => ({ x })), a, (r) => r.x).map((r) => r.x);
  it('read loosely, with or without initials, "ı" as "i", the basionym\'s author: the sentence\'s own pairs', () => {
    const [f1, f2] = [claim(s, /\("(Hook\.f\.)" is "Hook\.fil\."\)/), claim(s, /\("Hook\.f\." is "(Hook\.fil\.)"\)/)];
    expect(own([f2, 'Lindl.'], f1), s.where).toEqual([f2]);
    const [h1, h2] = [claim(s, /\("(W\.Heering)" is "Heering"\)/), claim(s, /\("W\.Heering" is "(Heering)"\)/)];
    expect(own([h2, 'Lindl.'], h1)).toEqual([h2]);
    expect(s.text).toMatch(/letters such as "ı" read as "i"/);
    expect(own(['Yıldırım'], 'Yildirim')).toEqual(['Yıldırım']);
    const [b1, b2] = [claim(s, /"(\(Engelm\.\) Lem\.)" and/), claim(s, /and "(\(Engelm\.\) Britton & Rose)" are one name/)];
    expect(own([b2, 'Lindl.'], b1)).toEqual([b2]);
  });
  it('"an author before "ex" alone never counts"', () => {
    expect(s.text).toMatch(/an author before "ex" alone never counts/);
    expect(own(['Welw.'], 'Welw. ex Hiern')).toEqual([]);
    expect(own(['Hiern'], 'Welw. ex Hiern')).toEqual(['Hiern']);
  });
});

describe('"Where Kew cites the author otherwise" (70b, 70c): the accepted entry, the family, another author\'s name', () => {
  const s = said('how', 'Where Kew cites the author otherwise');
  it('Datura metel L., listed twice by one author, takes the entry Kew accepts', () => {
    const s = said('how', 'Where Kew lists the name twice by one author');
    const name = claim(s, /\((Datura metel) L\.\)/);
    const w = kew([row('2', 'Synonym', 'Solanaceae', name, 'L.', '3'), row('1', 'Accepted', 'Solanaceae', name, 'L.', '1'), row('3', 'Accepted', 'Solanaceae', 'Datura innoxia', 'Mill.', '3')], [['1', 'India'], ['3', 'Mexico']]);
    expect(range(w, name, 'L.', 'Solanaceae'), s.where).toEqual(['India']);
  });
  it('Ceropegia macrocarpa (Sprenger) Bruyns is not Kew\'s unplaced J.N.Haage & E.Schmidt: no range of that name', () => {
    const s = said('how', "Kew's unplaced Ceropegia macrocarpa");
    const [ours, theirs] = [claim(s, /is not (Ceropegia macrocarpa \(Sprenger\) Bruyns)/), claim(s, /Kew's unplaced Ceropegia macrocarpa (J\.N\.Haage & E\.Schmidt)/)];
    const w = kew([row('9', 'Unplaced', 'Apocynaceae', 'Ceropegia macrocarpa', theirs, '9')], [['9', 'Kenya']]);
    expect(range(w, 'Ceropegia macrocarpa', ours.replace('Ceropegia macrocarpa ', ''), 'Apocynaceae') ?? null, s.where).toBeNull(); // no range of its own, never Kenya
  });
  // Kew's own rows (the file gives a synonym the family of its genus): round seventy's rule read GBIF's copy's family and
  // never fired here, and the live page showed Chile. B's r71 reads the family of the entry each row is filed under.
  it('Ixora coccinea "Comm. ex Lam.", on Kew\'s own rows, is Kew\'s Ixora coccinea L., not Embothrium coccineum', () => {
    const s = said('how', `GBIF's Ixora coccinea "Comm. ex Lam." is a name Kew files`);
    const [name, author] = [claim(s, /GBIF's (Ixora coccinea) "Comm\. ex Lam\."/), claim(s, /GBIF's Ixora coccinea "(Comm\. ex Lam\.)"/)];
    const other = claim(s, /(Embothrium coccineum)/);
    const w = kew([row('103355', 'Invalid', 'Rubiaceae', name, author, '2788267'), row('103356', 'Accepted', 'Rubiaceae', name, 'L.', '103356'), row('2788267', 'Accepted', 'Proteaceae', other, 'J.R.Forst. & G.Forst.', '2788267')], [['2788267', 'Chile South'], ['103356', 'India']]);
    expect(range(w, name, author, 'Rubiaceae'), s.where).toEqual(['India']);
  });
});

describe('"Photographs come first from the media that GBIF\'s occurrence download carries" (70b)', () => {
  const s = said('how', "Where the records came as GBIF's SQL download");
  const MEDIA = (key: number) => `https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&mediaType=StillImage&license=CC0_1_0&license=CC_BY_4_0&basisOfRecord=HUMAN_OBSERVATION&basisOfRecord=OBSERVATION&basisOfRecord=MACHINE_OBSERVATION&limit=100`;
  it('"for a species the download was not asked for, asked of GBIF instead"', async () => {
    expect(s.text, s.where).toMatch(/for a species that download did not ask for, GBIF is asked instead/);
    const asked: string[] = [];
    const api = (async (u: string) => { asked.push(u); return { status: 'ok', data: { results: [], endOfRecords: true, count: 0 } }; }) as unknown as JsonFetcher;
    const f = bulkFetcher(api, { media: new MediaIndex(new Map()), covered: new Set([1]) });
    await f(MEDIA(2));
    await f(MEDIA(1));
    expect(asked).toEqual([MEDIA(2)]); // the one the download holds is the files'
  });
});

describe('"A Commons file is shown only as a JPEG or WebP photograph" (70b): the kinds', () => {
  const s = said('how', 'A Commons file is shown only as a JPEG or WebP photograph');
  const names = { scientific: 'Aloe vera', key: gbifPage(1), held: heldNamesOf([{ key: gbifPage(1), name: 'Aloe vera' }, { key: gbifPage(2), name: 'Aloe ferox' }]) };
  it('a map, and seeds, are not shown; "a pod on the plant is the plant"', () => {
    expect(commonsKind('File:Aloe vera map.jpg', names), s.where).not.toBeNull();
    expect(said('how', 'Not seeds').text).toMatch(/seeds \(a pod on the plant is the plant\)/);
    expect(commonsKind('File:Aloe vera seeds.jpg', names)).not.toBeNull();
    expect(commonsKind('File:Aloe vera seed pod.jpg', names)).toBeNull();
  });
  it('"where Commons got a file, GBIF or iNaturalist, is not read"; a living plant in a garden is shown, whatever its category', () => {
    expect(said('how', 'A living plant in a garden is shown, whatever its category').text).toMatch(/where Commons got a file, GBIF or iNaturalist, is not read/);
    expect(commonsKind('File:Aloe vera 1.jpg', names, ['Media from GBIF', 'Aloe vera'])).toBeNull();
    expect(commonsKind('File:Aloe vera 1.jpg', names, ['Specimens in the Huntington Desert Garden'])).toBeNull();
  });
  it('a photograph Commons files under two species is not shown, unless its name names this one and none of the others', () => {
    expect(commonsKind('File:Aloes 1.jpg', names, ['Aloe vera', 'Aloe ferox'])).not.toBeNull();
    expect(commonsKind('File:Aloe vera 1.jpg', names, ['Aloe vera', 'Aloe ferox'])).toBeNull();
  });
  it('"A Commons copy of an iNaturalist photograph the page shows, known by the photograph\'s number at the end of its name, is shown once"', () => {
    const c = said('how', 'A Commons copy of an iNaturalist photograph');
    expect(c.text, c.where).toMatch(/known by the photograph Commons names as its source or by the number at the end of its name/);
    expect(commonsInatCopy('File:Aloe vera 98888962.jpg')).toBe('98888962');
    expect(commonsInatCopy('File:Aloe vera 1.jpg')).toBeNull();
  });
});

describe('"Another spelling of the species\' epithet is the species\'" (70b): each spelling the sentence names', () => {
  const s = said('how', "Another spelling of the species' epithet is the species'");
  it('an adjective in -er that keeps its e, "ai" for "ae" after a consonant, "afr-" for "caffr-"', () => {
    const [a, b] = [claim(s, /\("(stolonifer)", "stolonifera"\)/), claim(s, /\("stolonifer", "(stolonifera)"\)/)];
    expect(spellingKey(a), s.where).toBe(spellingKey(b));
    const also = said('how', 'Also "ae" for "e" within a word');
    expect(also.text).toMatch(/"ai" for a genitive "ae" after a consonant/);
    expect(spellingKey('kanehirai')).toBe(spellingKey('kanehirae'));
    expect(spellingKey('bihai')).not.toBe(spellingKey('bihae')); // after a vowel, no
    expect(also.text).toMatch(/"afr-" for the "caffr-" the Code replaced in 2024/);
    expect(spellingKey('caffra')).toBe(spellingKey('afra'));
  });
});

describe('"An article Wikipedia reaches through a redirect is quoted only when" (70b): Kew\'s combinations of one basionym', () => {
  const s = said('how', 'Or when GBIF holds the title as a synonym of this species');
  it('"Zephyranthes formosissima" for Sprekelia formosissima, by Kew\'s rows', () => {
    const [title, of] = [claim(s, /\("(Zephyranthes formosissima)" for Sprekelia formosissima\)/), claim(s, /\("Zephyranthes formosissima" for (Sprekelia formosissima)\)/)];
    const who = { name: of, synonyms: [], item: 'Q1' };
    const kewSays = (accepted: string) => ({ rows: [{ status: 'SYNONYM', authorship: '(L.) Herb.', accepted }] });
    expect(proofByItem(title, who, { title: null, kew: kewSays(`${title} (L.) Z.H.Feng`) })?.proof, s.where).toBe('older-name');
    expect(proofByItem(title, who, { title: null, kew: kewSays(`${title} Baker`) })).toBeNull(); // another basionym
  });
});

/* ---- Wikidata, with the answers of 2026-10-13 (agent B's fixtures/r70b-wikidata-items.json) ---- */
const WD: Record<string, unknown> = JSON.parse(readFileSync('tests/unit/fixtures/r70b-wikidata-items.json', 'utf8'));
const wd = recordedFetcher(WD);
async function item(key: number) {
  const sp = await gbif.species(wd, key);
  const syn = await gbif.synonyms(wd, key);
  if (sp.status !== 'ok' || syn.status !== 'ok') throw new Error('no GBIF answer');
  const older = gbif.sameTypeNames({ key, basionymKey: sp.data.basionymKey }, syn.rows ?? []).map((r) => ({ key: r.key, name: r.name }));
  return crossIds(wd, sp.data.canonicalName ?? '', key, older, { authorship: sp.data.authorship });
}
describe('"When Wikidata finds no item that does" (70b, 70c), "Failing these" and "Two items that qualify" (70b)', () => {
  it('an alias counts as a label, and Kew\'s IPNI proves it: Scilla siberica\'s item, labelled "Siberian squill"', async () => {
    const s = said('how', 'An item counts when its label is the name exactly');
    expect(s.text, s.where).toMatch(/or it gives the name as an alias/);
    const f = said('how', 'Failing these, the item that carries');
    const label = claim(f, /\(Scilla siberica's item, labelled "([^"]+)", carries it\)/);
    const r = await item(8080743);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q158944' } });
    expect(r.status === 'ok' && r.detail, `${f.where} (${label})`).toMatch(/^found by its alias; its IPNI identifier 927545-1 is Kew's for Scilla siberica Andrews/);
  });
  it('"a name with the same author before "ex"" is not another author\'s: Hibiscus acetosella Welw. ex Ficalho takes Q5750828', async () => {
    const s = said('how', 'A name with the same author before "ex"');
    expect(claim(s, /\("(Welw\. ex Hiern)" for "Welw\. ex Ficalho"\)/)).toBe('Welw. ex Hiern');
    expect(await item(7802717)).toMatchObject({ status: 'ok', data: { wikidata: 'Q5750828' } });
  });
  it('of two items found by the older names, the one carrying the IPNI of Kew\'s accepted entry: Parrycactus flavovirens', async () => {
    const s = said('how', 'Of two items found by the older names');
    expect(claim(s, /\((Parrycactus flavovirens), Kew's synonym of Ferocactus flavovirens\)/), s.where).toBe('Parrycactus flavovirens');
    expect(await item(3946677)).toMatchObject({ status: 'ok', data: { wikidata: 'Q309595' } });
  });
});

/* ---- iNaturalist, with the answers of 2026-10-13 (agent B's fixtures/r70b-follow-42.json and r70c-slip.json) ---- */
type Doc = { key: number; name: { scientific: string; family?: string }; ids: { gbif?: number; inat?: number }; links: Record<string, string>; photos: unknown[]; upstream: Record<string, { status: string; at?: string; detail?: string }> };
function fixtureFill(file: string) {
  const W: { reference: Array<{ key: number; name: string; family: string }>; answers: Record<string, unknown>; cases?: Array<{ name: string; key: number; taxon: number; carried: boolean }> } = JSON.parse(readFileSync(`tests/unit/fixtures/${file}`, 'utf8'));
  const TAXA = new Map<number, unknown>();
  for (const [url, a] of Object.entries(W.answers)) if (/\/v1\/taxa\/[\d,]+/.test(url)) for (const t of ((a as { data?: { results?: Array<{ id: number }> } }).data?.results ?? [])) TAXA.set(t.id, t);
  const f = (async (url: string) => {
    if (url in W.answers) return W.answers[url];
    const ids = /\/v1\/taxa\/([\d,]+)$/.exec(url)?.[1].split(',').map(Number);
    if (ids?.every((id) => TAXA.has(id))) return { status: 'ok', data: { results: ids.map((id) => TAXA.get(id)) } };
    return { status: 'refused', detail: `no fixture: ${url}` };
  }) as unknown as JsonFetcher;
  /** The verdict on one follow: the species, the id it was followed to, as the run found it. */
  return async (species: string, taxon: number): Promise<Doc> => {
    const docs: Record<string, Doc> = {};
    for (const e of W.reference) docs[`${e.key}.json`] = { key: e.key, name: { scientific: e.name, family: e.family }, ids: { gbif: e.key }, links: {}, photos: [], upstream: {} };
    const e = W.reference.find((x) => x.name === species)!;
    const d = docs[`${e.key}.json`];
    Object.assign(d, { ids: { gbif: e.key, inat: taxon }, links: { inat: `https://www.inaturalist.org/taxa/${taxon}` } });
    d.upstream['inat.taxon'] = { status: 'ok', at: 'x', detail: `iNaturalist's taxon 1 (${species}) is inactive; followed to its current taxon ${taxon}` };
    const store = { files: () => [`${e.key}.json`, ...Object.keys(docs).filter((k) => k !== `${e.key}.json`)], read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, x: unknown) => { docs[k] = x as Doc; } };
    const c = await fillInatIds(store, f, () => '2026-10-15T00:00:00Z');
    if (c.failed) throw new Error(c.failed);
    return docs[`${e.key}.json`];
  };
}
describe('"An id iNaturalist has made inactive is followed" (70b, 70c), "A taxon GBIF holds" and "A variety that is" (70b)', () => {
  const follow42 = fixtureFill('r70b-follow-42.json');
  const slip = fixtureFill('r70c-slip.json');
  const s = said('how', 'Or, where neither places it in this reference');
  it('Kew holding this species under the other genus: Zephyranthes formosissima for Sprekelia formosissima', async () => {
    const species = claim(s, /\(Zephyranthes formosissima for (Sprekelia formosissima)\)/);
    const d = await follow42(species, 1640238);
    expect(d.ids.inat, s.where).toBe(1640238);
  });
  it('the epithet spelt one letter otherwise: Echinocereus chisosensis for Echinocereus chisoensis', async () => {
    const species = claim(s, /\(Echinocereus chisosensis for (Echinocereus chisoensis)\)/);
    const d = await slip(species, 438545);
    expect(d.ids.inat, s.where).toBe(438545);
    expect(d.upstream['inat.taxon'].detail).toMatch(/spelt one letter otherwise/);
  });
  it('"never taken, however it was found": Pinguicula antarctica for Pinguicula chilensis', async () => {
    const t = said('how', 'A taxon GBIF holds as another species of this reference is never taken');
    const species = claim(t, /\(Pinguicula antarctica for (Pinguicula chilensis)\)/);
    const d = await follow42(species, 816267);
    expect(d.ids.inat, t.where).toBeUndefined();
    // The name search is the one route Kew is not asked on (round seventy-one: the sentence says so now).
    expect(part(t, 'nor one Kew holds so')).toMatch(/^nor one Kew holds so, except a taxon iNaturalist's own name search files the species under, for which Kew is not asked/);
  });
  it('"A variety that is the species\' own type (Tricyrtis formosana var. formosana) gives way to iNaturalist\'s taxon of the species"', async () => {
    const v = said('how', "A variety that is the species' own type");
    const species = claim(v, /\((Tricyrtis formosana) var\. formosana\)/);
    const d = await follow42(species, 452310);
    expect(d.upstream['inat.taxon'].detail, v.where).toMatch(/Tricyrtis formosana formosana is Tricyrtis formosana itself, at a lower rank/);
  });
});

describe('"When Wikidata does not answer" (70c, then 72): no lag waited for, a refusal asked again', () => {
  const s = said('how', "Wikidata's items are read without waiting");
  it('the sentence says what the merged reads do: no maxlag on a Wikidata read, a refusal or a busy answer asked again up to five times', () => {
    // Round seventy-two (triage maxlag, F14): the sentence is D's; the reads themselves are driven by r72d-wikidata-unlagged.
    expect(s.text, s.where).toMatch(/items are read without waiting on its query service's lag, which no read of an item depends on, and a refusal or a busy answer is asked again after the wait it names, up to five times/);
    expect(s.text, s.where).not.toMatch(/waits the lag out/);
    expect(readFileSync('src/lib/dossier/fetch.ts', 'utf8')).toMatch(/RETRIES = 5\b/);
    for (const f of ['src/lib/dossier/sources/wikimedia.ts', 'src/lib/dossier/corpus-fills.ts']) {
      const wikidataUrls = readFileSync(f, 'utf8').split('\n').filter((l) => /wikidata\.org/.test(l));
      expect(wikidataUrls.filter((l) => /maxlag/.test(l)), f).toEqual([]);
    }
  });
});
