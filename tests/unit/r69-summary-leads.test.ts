/**
 * Round sixty-nine, the owner's `--fill summaries`: 108 stored summaries were dropped because Wikipedia gave them under
 * another title, and about nine in ten were the species' own article (a genus of one species, a crop's common name, the
 * species placed in another genus, another spelling). Round sixty-nine took them back by reading the lead
 * (`redirectIsThisSpecies`). Round seventy (REVIEW-TRIAGE-69 A1) reads no lead: a title is taken only on a positive
 * proof from structured data (`summary-proof.ts`). This file held round sixty-nine's cases; each is read here by the new
 * rule, with Wikidata's facts and Kew's counts (WCVP through GBIF) as they stood on 2026-10-12, and the guards are kept.
 */
import { describe, it, expect } from 'vitest';
import { summary } from '$dossier/sources/wikimedia';
import { checkSummaries } from '$dossier/corpus-fills';
import { titleProof, proofByItem } from '$dossier/summary-proof';
import { world, GENUS, SPECIES, type World } from './r70a-summary-world';

/** Wikidata and Kew for the cases below, 2026-10-12. */
export const W69: World = {
  items: {
    // Welwitschia mirabilis: its item's sitelink is a redirect to the genus's article; Kew holds one species in the genus.
    Q156926: { sitelink: 'Welwitschia mirabilis', P171: ['Q15044266'], P105: [SPECIES], P225: ['Welwitschia mirabilis'] },
    Q15044266: { sitelink: 'Welwitschia', P171: ['Q10780833'], P105: [GENUS], P225: ['Welwitschia'] },
    // Malus domestica, and Apple (Q89), "natural product of taxon" Malus and Malus domestica.
    Q18674606: { sitelink: 'Malus domestica', P171: ['Q104819'], P566: ['Q65671564'], P1672: ['Q89', 'Q103534317', 'Q62474609', 'Q4781286', 'Q100353572', 'Q97162246'], P105: [SPECIES], P225: ['Malus domestica'] },
    Q89: { sitelink: 'Apple', P1582: ['Q104819', 'Q18674606'] },
    // Ceropegia zebrina: its item names Huernia zebrina's as its basionym; GBIF's record lists no such synonym.
    Q42560681: { P171: ['Q1411307'], P566: ['Q1633949'], P105: [SPECIES], P225: ['Ceropegia zebrina'] },
    Q1633949: { sitelink: 'Huernia zebrina', P171: ['Q141945'], P105: [SPECIES], P225: ['Huernia zebrina'] },
    // Genera of many species at Kew, each the species' parent in Wikidata.
    Q15232794: { P171: ['Q309613'], P566: ['Q38451909'], P105: [SPECIES], P225: ['Kopsia fruticosa'] },
    Q309613: { sitelink: 'Kopsia', P171: ['Q18983478'], P105: [GENUS], P225: ['Kopsia'] },
    Q15481151: { P171: ['Q158253'], P105: [SPECIES], P225: ['Crassula deltoidea'] },
    Q158253: { sitelink: 'Crassula', P105: [GENUS], P225: ['Crassula'] },
    Q134845: { P171: ['Q8184911'], P566: ['Q12318810'], P105: [SPECIES], P225: ['Strombocactus disciformis'] },
    Q8184911: { sitelink: 'Strombocactus', P171: ['Q136359'], P105: [GENUS], P225: ['Strombocactus'] },
    // Weingartia pulchra and Mammillaria sonorensis, which Wikipedia lumps into another species with an item of its own.
    Q109406541: { P171: ['Q7702591'], P105: [SPECIES], P225: ['Weingartia pulchra'] },
    Q109382143: { sitelink: 'Weingartia canigueralii', P171: ['Q7702591'], P566: ['Q15008124'], P105: [SPECIES], P225: ['Weingartia canigueralii'] },
    Q1797305: { P171: ['Q311120'], P105: [SPECIES], P225: ['Mammillaria sonorensis'] },
    Q1888371: { sitelink: 'Mammillaria standleyi', P171: ['Q311120'], P566: ['Q14955617'], P105: [SPECIES], P225: ['Mammillaria standleyi'] }
  },
  genera: { Welwitschia: ['Welwitschia mirabilis'], Kopsia: 25, Crassula: 237, Strombocactus: ['Strombocactus corregidorae', 'Strombocactus disciformis'] }
};

const who = (name: string, item?: string, synonyms: string[] = []) => ({ name, synonyms, item });

describe('a title Wikipedia gave under another title, taken on a proof', () => {
  it('the genus of one species at Kew, this species\' parent: Welwitschia', async () => {
    expect(await titleProof(world(W69).f, 'Welwitschia', who('Welwitschia mirabilis', 'Q156926'))).toMatchObject({ status: 'ok', proof: 'monotypic-genus' });
  });
  it('a crop by its common name, a product of this species: Apple', async () => {
    expect(await titleProof(world(W69).f, 'Apple', who('Malus domestica', 'Q18674606', ['Malus anetica Poit. & Turpin']))).toMatchObject({ status: 'ok', proof: 'product' });
  });
  it('the species placed in another genus, its basionym in Wikidata: Huernia zebrina', async () => {
    expect(await titleProof(world(W69).f, 'Huernia zebrina', who('Ceropegia zebrina', 'Q42560681', ['Huernia magniflora E.Phillips']))).toMatchObject({ status: 'ok', proof: 'older-name' });
  });
  // Round seventy-one: scaphirostris and scaphirostrus are two declensions, no longer one key (r71a-spelling).
  it('another spelling of the epithet in the same genus, read offline: Dudleya caespitosa', async () => {
    expect(await titleProof(null, 'Dudleya caespitosa', who('Dudleya cespitosa'))).toMatchObject({ status: 'ok', proof: 'name' });
  });
});

describe('guards: kept out as in round sixty-nine', () => {
  it('a genus of many species at Kew, though it is this species\' parent: Kopsia, Crassula, Strombocactus', async () => {
    const { f } = world(W69);
    expect(await titleProof(f, 'Kopsia', who('Kopsia fruticosa', 'Q15232794'))).toEqual({ status: 'none' });
    expect(await titleProof(f, 'Crassula', who('Crassula deltoidea', 'Q15481151'))).toEqual({ status: 'none' });
    // The type species' own article, filed under the genus: Kew holds two species, so it is not proved (S-A1).
    expect(await titleProof(f, 'Strombocactus', who('Strombocactus disciformis', 'Q134845'))).toEqual({ status: 'none' });
  });
  it('Jeffersonia follows Kew\'s count: one accepted species on 2026-10-12 (J. dubia is Plagiorhegma dubium at Kew), so taken', async () => {
    // Round sixty-nine kept Jeffersonia out because its lead speaks of a genus of two species. The decision of round
    // seventy reads Kew's count, not the lead; were Kew to hold two again, it would be out (the second case).
    const jeff = (n: number | string[]): World => ({
      items: { Q15344873: { P171: ['Q2562522'], P566: ['Q21876370'], P105: [SPECIES], P225: ['Jeffersonia diphylla'] }, Q2562522: { sitelink: 'Jeffersonia', P171: ['Q15621812'], P105: [GENUS], P225: ['Jeffersonia'] } },
      genera: { Jeffersonia: n }
    });
    expect(await titleProof(world(jeff(['Jeffersonia diphylla'])).f, 'Jeffersonia', who('Jeffersonia diphylla', 'Q15344873'))).toMatchObject({ status: 'ok', proof: 'monotypic-genus' });
    expect(await titleProof(world(jeff(['Jeffersonia diphylla', 'Jeffersonia dubia'])).f, 'Jeffersonia', who('Jeffersonia diphylla', 'Q15344873'))).toEqual({ status: 'none' });
  });
  it('another epithet in this species\' genus is another species, or this one lumped into it', async () => {
    const { f } = world(W69);
    expect(await titleProof(f, 'Weingartia canigueralii', who('Weingartia pulchra', 'Q109406541', ['Rebutia pulchra Cárdenas', 'Rebutia canigueralii subsp. pulchra (Cárdenas) Donald']))).toEqual({ status: 'none' });
    expect(await titleProof(f, 'Mammillaria standleyi', who('Mammillaria sonorensis', 'Q1797305'))).toEqual({ status: 'none' });
  });
  it('no item: the title\'s own item still proves it, or nothing does', async () => {
    const { f } = world(W69);
    // Kew's one species of Welwitschia is this species, by name (round seventy: no item needed for that).
    expect(await titleProof(f, 'Welwitschia', who('Welwitschia mirabilis'))).toMatchObject({ status: 'ok', proof: 'monotypic-genus' });
    expect(await titleProof(f, 'Kopsia', who('Kopsia fruticosa'))).toEqual({ status: 'none' });
    expect(await titleProof(f, 'Sundews in cultivation', who('Drosera capensis'))).toEqual({ status: 'none' });
  });
  it('an empty lead is no summary', async () => {
    const { f } = world({ ...W69, wiki: { 'Welwitschia mirabilis': { title: 'Welwitschia', extract: '' } } });
    expect((await summary(f, 'Welwitschia mirabilis', ['Welwitschia mirabilis'], who('Welwitschia mirabilis', 'Q156926'))).status).toBe('none');
  });
});

describe('the build takes such a title, and names the proof', () => {
  it('Welwitschia mirabilis is given the genus\'s article', async () => {
    const { f } = world({ ...W69, wiki: { 'Welwitschia mirabilis': { title: 'Welwitschia' } } });
    const r = await summary(f, 'Welwitschia mirabilis', ['Welwitschia mirabilis'], who('Welwitschia mirabilis', 'Q156926'));
    expect(r).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Welwitschia mirabilis to Welwitschia, this species' genus (Q15044266), which holds one accepted species in Kew's WCVP", data: { title: 'Welwitschia' } });
  });
  it('Kopsia fruticosa is still not given the genus\'s (guard)', async () => {
    const { f } = world({ ...W69, wiki: { 'Kopsia fruticosa': { title: 'Kopsia' } } });
    expect(await summary(f, 'Kopsia fruticosa', ['Kopsia fruticosa'], who('Kopsia fruticosa', 'Q15232794'))).toEqual({ status: 'none', detail: 'Wikipedia redirects Kopsia fruticosa to Kopsia' });
  });
});

describe('--fill summaries asks again for what was set aside', () => {
  const setAside = (name: string, to: string, item: string) => ({
    name: { scientific: name, synonyms: [] as string[] },
    ids: { gbif: 1, wikidata: item } as Record<string, unknown>,
    links: {} as Record<string, unknown>,
    upstream: { wikipedia: { status: 'none', at: '2026-10-12T00:00:00Z', detail: `Wikipedia redirects ${name} to ${to}` } } as Record<string, { status: string; at: string; detail?: string }>,
    summary: undefined as unknown
  });
  const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(f: string) => structuredClone(docs[f]) as T, write: (f: string, d: unknown) => { docs[f] = d; } });
  it('takes back Welwitschia\'s, leaves Kopsia\'s aside, and records the proof', async () => {
    const docs: Record<string, unknown> = { 'w.json': setAside('Welwitschia mirabilis', 'Welwitschia', 'Q156926'), 'k.json': setAside('Kopsia fruticosa', 'Kopsia', 'Q15232794') };
    const { f } = world({ ...W69, wiki: { 'Welwitschia mirabilis': { title: 'Welwitschia' }, 'Kopsia fruticosa': { title: 'Kopsia' } } });
    // Round seventy-one: a title set aside is settled, and asked again only when the rule changes (`again`).
    const c = await checkSummaries(store(docs) as never, f, () => '2026-10-13T00:00:00Z', { again: true });
    expect(c).toMatchObject({ restored: 1, dropped: 0 });
    const w = docs['w.json'] as ReturnType<typeof setAside>;
    expect(w.summary).toMatchObject({ title: 'Welwitschia', source: 'wikipedia', licence: 'CC BY-SA 4.0' });
    expect(w.ids.wikipedia).toBe('Welwitschia');
    expect(w.links.wikipedia).toBe('https://en.wikipedia.org/wiki/Welwitschia');
    expect(w.upstream.wikipedia).toEqual({ status: 'ok', at: '2026-10-13T00:00:00Z', detail: "Wikipedia redirects Welwitschia mirabilis to Welwitschia, this species' genus (Q15044266), which holds one accepted species in Kew's WCVP" });
    expect((docs['k.json'] as ReturnType<typeof setAside>).summary).toBeUndefined();
  });
  it('offline it asks nothing and changes nothing (guard)', async () => {
    const docs: Record<string, unknown> = { 'w.json': setAside('Welwitschia mirabilis', 'Welwitschia', 'Q156926') };
    const c = await checkSummaries(store(docs) as never, null);
    expect(c.restored).toBe(0);
    expect((docs['w.json'] as ReturnType<typeof setAside>).summary).toBeUndefined();
  });
});

describe('the pure rule (guards)', () => {
  it('Kew\'s count proves only a genus: a family of one genus, given a count, is no proof', () => {
    const facts = { species: { id: 'Q156926', parents: ['Q10780833'], basionyms: [], sourceOf: [] }, title: { id: 'Q10780833', productOf: [], taxonNames: ['Welwitschia'], ranks: ['Q35409'], basionyms: [] }, genus: { name: 'Welwitschia', accepted: 1, only: 'Welwitschia mirabilis' } };
    expect(proofByItem('Welwitschiaceae', who('Welwitschia mirabilis', 'Q156926'), facts)).toBeNull();
    expect(proofByItem('Welwitschiaceae', who('Welwitschia mirabilis', 'Q156926'), { ...facts, title: { ...facts.title, ranks: [GENUS] } })).toMatchObject({ proof: 'monotypic-genus' });
  });
});
