/**
 * Round seventy, A1 (REVIEW-TRIAGE-69; S-A1 to A7, S-F5, IND-2): a Wikipedia article under another title is taken only
 * on a positive proof from structured data, never on what its lead says. Wikidata's facts and Kew's counts (WCVP
 * through GBIF) are as they stood on 2026-10-12; the leads are Wikipedia's, in part, as the reviews quoted them. Each
 * case marked "base:" FAILED on the deployed round sixty-nine (526ecaf), which read the lead; a case marked "guard"
 * passes on both. This file imports only modules the base has, so its failures there are the rule's, not a missing
 * import.
 */
import { describe, it, expect } from 'vitest';
import { summary } from '$dossier/sources/wikimedia';
import { checkSummaries } from '$dossier/corpus-fills';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { welwitschia } from '../../fixtures/upstream';
import { world, GENUS, SPECIES, type World } from './r70a-summary-world';

const LEAD: Record<string, string> = {
  'Persea americana': 'The avocado, alligator pear or avocado pear (Persea americana) is an evergreen tree in the laurel family (Lauraceae).',
  Avocado: 'The avocado, alligator pear or avocado pear (Persea americana) is an evergreen tree in the laurel family (Lauraceae).',
  'Drosera microphylla': 'Drosera microphylla, the golden rainbow, is a climbing or scrambling perennial tuberous species in the carnivorous plant genus Drosera.',
  Rose: 'A rose is either a woody perennial flowering plant of the genus Rosa, in the family Rosaceae, or the flower it bears. There are over three hundred species and tens of thousands of cultivars.',
  'Sundews in cultivation': 'Sundews are carnivorous plants commonly grown by enthusiasts in pots on a sunny windowsill.',
  'Acer saccharum': 'Acer saccharum, the sugar maple, is a species of flowering plant in the soapberry and lychee family Sapindaceae.',
  'Conophytum minutum': 'Conophytum minutum is a species of succulent plant in the family Aizoaceae, native to South Africa.',
  Strombocactus: 'Strombocactus disciformis is a rare species of cacti and the only species of the genus Strombocactus.',
  Peperomia: 'Peperomia is one of the two large genera of the family Piperaceae. Most of them are compact, small perennial epiphytes.',
  Mammillaria: 'Mammillaria is one of the largest genera in the cactus family (Cactaceae), with currently 200 known species and varieties recognized.',
  'Venus flytrap': 'The Venus flytrap is a carnivorous plant native to subtropical wetlands on the East Coast of the United States.',
  Fenestraria: 'Fenestraria is a genus of succulent plants in the family Aizoaceae, native to Namibia and South Africa.',
  Bowiea: 'Bowiea is a genus of flowering plants in the family Asparagaceae, native to eastern and southern Africa.',
  Harpephyllum: 'Harpephyllum is a genus of trees in the family Anacardiaceae. The sole species is Harpephyllum afrum, the wild plum.',
  Welwitschia: 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis.',
  Examplea: `Examplea is a genus of plants. ${'It grows on rocks. '.repeat(90)}Its rarest species is Examplea rara.`
};

/** Wikidata and Kew, 2026-10-12. */
const W: World = {
  items: {
    Q161115: { sitelink: 'Agave americana', P171: ['Q155874', 'Q25413181'], P105: [SPECIES], P225: ['Agave americana'] },
    Q37153: { sitelink: 'Avocado', P171: ['Q132039'], P1672: ['Q961769', 'Q104821994', 'Q2918735'], P105: [SPECIES], P225: ['Persea americana'] },
    Q5308526: { sitelink: 'Drosera macrophylla', P171: ['Q266'], P105: [SPECIES], P225: ['Drosera macrophylla'] },
    Q5308529: { sitelink: 'Drosera microphylla', P171: ['Q266'], P105: [SPECIES], P225: ['Drosera microphylla'] },
    Q15546415: { sitelink: 'Rosa rubiginosa', P171: ['Q34687'], P105: [SPECIES], P225: ['Rosa rubiginosa'] },
    Q34687: { sitelink: 'Rose', P171: ['Q134655'], P1672: ['Q46740', 'Q83054'], P105: [GENUS], P225: ['Rosa'] },
    Q158301: { sitelink: 'Acer saccharinum', P171: ['Q42292'], P105: [SPECIES], P225: ['Acer saccharinum'] },
    Q214733: { sitelink: 'Acer saccharum', P171: ['Q42292'], P1672: ['Q5655572', 'Q402587'], P105: [SPECIES], P225: ['Acer saccharum'] },
    Q5783463: { sitelink: 'Conophytum minimum', P171: ['Q133974'], P566: ['Q50846644'], P105: [SPECIES], P225: ['Conophytum minimum'] },
    Q5783465: { sitelink: 'Conophytum minutum', P171: ['Q133974'], P566: ['Q38408506'], P105: [SPECIES], P225: ['Conophytum minutum'] },
    Q92680669: { sitelink: 'Strombocactus corregidorae', P171: ['Q8184911'], P105: [SPECIES], P225: ['Strombocactus corregidorae'] },
    Q8184911: { sitelink: 'Strombocactus', P171: ['Q136359'], P105: [GENUS], P225: ['Strombocactus'] },
    Q11815594: { sitelink: 'Peperomia rotundifolia', P171: ['Q1354632'], P566: ['Q21876264'], P105: [SPECIES], P225: ['Peperomia rotundifolia'] },
    Q1354632: { sitelink: 'Peperomia', P171: ['Q14921974'], P105: [GENUS], P225: ['Peperomia'] },
    Q144980: { sitelink: 'Mammillaria hahniana', P171: ['Q311120'], P105: [SPECIES], P225: ['Mammillaria hahniana'] },
    Q311120: { sitelink: 'Mammillaria', P171: ['Q136359'], P105: [GENUS], P225: ['Mammillaria'] },
    Q155825: { sitelink: 'Venus flytrap', P171: ['Q12311673'], P105: [SPECIES], P225: ['Dionaea muscipula'] },
    // The three monotypic species round sixty-nine dropped (S-A4): their items carry no English sitelink of their own,
    // or one that redirects (Harpephyllum afrum).
    Q134282: { P171: ['Q15883366'], P566: ['Q107730619'], P105: [SPECIES], P225: ['Fenestraria rhopalophylla'] },
    Q15883366: { sitelink: 'Fenestraria', P171: ['Q6113741'], P105: [GENUS], P225: ['Fenestraria'] },
    Q140288: { P171: ['Q4951022'], P105: [SPECIES], P225: ['Bowiea volubilis'] },
    Q4951022: { sitelink: 'Bowiea', P171: ['Q15531398'], P105: [GENUS], P225: ['Bowiea'] },
    Q128784530: { sitelink: 'Harpephyllum afrum', P171: ['Q9002134'], P105: [SPECIES], P225: ['Harpephyllum afrum'] },
    Q9002134: { sitelink: 'Harpephyllum', P171: ['Q156589'], P105: [GENUS], P225: ['Harpephyllum'] },
    Q156926: { sitelink: 'Welwitschia mirabilis', P171: ['Q15044266'], P105: [SPECIES], P225: ['Welwitschia mirabilis'] },
    Q15044266: { sitelink: 'Welwitschia', P171: ['Q10780833'], P105: [GENUS], P225: ['Welwitschia'] },
    // A made genus for the flip of S-A5.
    Q900001: { P171: ['Q900002'], P105: [SPECIES], P225: ['Examplea rara'] },
    Q900002: { sitelink: 'Examplea', P105: [GENUS], P225: ['Examplea'] }
  },
  genera: {
    Rosa: 499,
    Strombocactus: ['Strombocactus corregidorae', 'Strombocactus disciformis'],
    Peperomia: 1451,
    Mammillaria: 197,
    Fenestraria: ['Fenestraria rhopalophylla'],
    Bowiea: ['Bowiea volubilis'],
    Harpephyllum: ['Harpephyllum afrum'],
    Welwitschia: ['Welwitschia mirabilis'],
    Examplea: 3
  }
};
/** Wikipedia redirecting `asked` to `to`, with the lead above. */
const redirect = (asked: string, to: string, w: World = W) => world({ ...w, wiki: { ...(w.wiki ?? {}), [asked]: { title: to, extract: LEAD[to] } } });
const who = (name: string, item?: string, synonyms: string[] = []) => ({ name, synonyms, item });
const ask = (asked: string, to: string, name: string, item?: string, synonyms: string[] = []) => summary(redirect(asked, to).f, asked, [asked], who(name, item, synonyms));

describe('IND-2: the lead rule took other species; no proof, no summary', () => {
  it('Persea americana for Agave americana: one epithet in another genus', async () => {
    expect(await ask('Agave americana', 'Persea americana', 'Agave americana', 'Q161115')).toEqual({ status: 'none', detail: 'Wikipedia redirects Agave americana to Persea americana' }); // base: ok
    expect((await ask('Agave americana', 'Avocado', 'Agave americana', 'Q161115')).status).toBe('none'); // base: ok
  });
  it('Drosera microphylla for D. macrophylla: one letter apart, two names', async () => {
    expect((await ask('Drosera macrophylla', 'Drosera microphylla', 'Drosera macrophylla', 'Q5308526')).status).toBe('none'); // base: ok
  });
  it('Rose for Rosa rubiginosa: a genus of 499 species at Kew, though the species\' parent', async () => {
    expect((await ask('Rosa rubiginosa', 'Rose', 'Rosa rubiginosa', 'Q15546415')).status).toBe('none'); // base: ok
  });
  it('"Sundews in cultivation": no item, no name', async () => {
    expect((await ask('Drosera capensis', 'Sundews in cultivation', 'Drosera capensis')).status).toBe('none'); // base: ok
  });
});

describe('S-A1 to A3, S-F5: near names, the type species\' page, and genera', () => {
  it('Acer saccharum for A. saccharinum, Conophytum minutum for C. minimum: no edit distance', async () => {
    expect((await ask('Acer saccharinum', 'Acer saccharum', 'Acer saccharinum', 'Q158301')).status).toBe('none'); // base: ok
    expect((await ask('Conophytum minimum', 'Conophytum minutum', 'Conophytum minimum', 'Q5783463')).status).toBe('none'); // base: ok
  });
  it('Strombocactus, filed under its type species, for S. corregidorae: two species at Kew', async () => {
    expect((await ask('Strombocactus corregidorae', 'Strombocactus', 'Strombocactus corregidorae', 'Q92680669')).status).toBe('none'); // base: ok
  });
  it('Peperomia and Mammillaria, "one of the largest genera"', async () => {
    expect((await ask('Peperomia rotundifolia', 'Peperomia', 'Peperomia rotundifolia', 'Q11815594')).status).toBe('none'); // base: ok
    expect((await ask('Mammillaria hahniana', 'Mammillaria', 'Mammillaria hahniana', 'Q144980')).status).toBe('none'); // base: ok
  });
});

describe('S-A4, S-A7: the species\' own article under another title is taken, and the proof named (S-A6)', () => {
  it('Fenestraria, Bowiea, Harpephyllum: genera of one species at Kew', async () => {
    expect(await ask('Fenestraria rhopalophylla', 'Fenestraria', 'Fenestraria rhopalophylla', 'Q134282')).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Fenestraria rhopalophylla to Fenestraria, this species' genus (Q15883366), which holds one accepted species in Kew's WCVP", data: { title: 'Fenestraria', proof: 'monotypic-genus' } }); // base: none
    expect(await ask('Bowiea volubilis', 'Bowiea', 'Bowiea volubilis', 'Q140288')).toMatchObject({ status: 'ok', data: { proof: 'monotypic-genus' } }); // base: none
    // The build asks the item's sitelink, "Harpephyllum afrum", which Wikipedia redirects to the genus.
    expect(await ask('Harpephyllum afrum', 'Harpephyllum', 'Harpephyllum caffrum', 'Q128784530')).toMatchObject({ status: 'ok', data: { proof: 'monotypic-genus' } }); // base: none
  });
  it('"Venus flytrap", Dionaea muscipula\'s item\'s article, when the name was asked', async () => {
    expect(await ask('Dionaea muscipula', 'Venus flytrap', 'Dionaea muscipula', 'Q155825')).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Dionaea muscipula to Venus flytrap, the English article of this species' Wikidata item (Q155825)" }); // base: none
  });
});

describe('rule 2: a source that does not answer while the proof is read', () => {
  it('Wikidata refusing leaves the redirect not checked, never none', async () => {
    const { f } = world({ ...W, wiki: { 'Fenestraria rhopalophylla': { title: 'Fenestraria', extract: LEAD.Fenestraria } }, refuse: /wikidata/ });
    expect(await summary(f, 'Fenestraria rhopalophylla', ['Fenestraria rhopalophylla'], who('Fenestraria rhopalophylla', 'Q134282'))).toEqual({
      status: 'refused',
      detail: "Wikipedia redirects Fenestraria rhopalophylla to Fenestraria; whether it is this species' article was not checked: Wikidata refused (HTTP 429)"
    }); // base: none
  });
  it('Kew\'s count not answering likewise', async () => {
    const { f } = world({ ...W, wiki: { 'Bowiea volubilis': { title: 'Bowiea', extract: LEAD.Bowiea } }, refuse: /api\.gbif\.org/ });
    expect(await summary(f, 'Bowiea volubilis', ['Bowiea volubilis'], who('Bowiea volubilis', 'Q140288'))).toMatchObject({ status: 'refused', detail: expect.stringContaining("not checked: GBIF (Kew's WCVP) refused") }); // base: none
  });
});

/* ---------- --fill summaries ---------- */

type Doc = { name: { scientific: string; synonyms: string[] }; ids: Record<string, unknown>; links: Record<string, unknown>; summary?: { text: string; title: string; source: string; url: string; licence: string }; upstream: Record<string, { status: string; at: string; detail?: string }> };
const stored = (name: string, title: string, item: string | undefined, detail?: string): Doc => ({
  name: { scientific: name, synonyms: [] },
  ids: { gbif: 1, ...(item ? { wikidata: item } : {}), wikipedia: title },
  links: { wikipedia: `https://en.wikipedia.org/wiki/${title}` },
  summary: { text: (LEAD[title] ?? 'lead').slice(0, 1500), title, source: 'wikipedia', url: `https://en.wikipedia.org/wiki/${title}`, licence: 'CC BY-SA 4.0' },
  upstream: { wikipedia: { status: 'ok', at: '2026-10-12T01:59:00Z', ...(detail ? { detail } : {}) } }
});
const store = (docs: Record<string, Doc>) => ({ files: () => Object.keys(docs), read: <T,>(f: string) => structuredClone(docs[f]) as T, write: (f: string, d: unknown) => { docs[f] = d as Doc; } });
const LEAD69 = (name: string, title: string) => `Wikipedia redirects ${name} to ${title}, whose lead is this species'`;

describe('S-A6: the fill names the proof in the record', () => {
  it('Welwitschia\'s record, "whose lead is this species\'", now names Kew\'s count', async () => {
    const docs = { 'w.json': stored('Welwitschia mirabilis', 'Welwitschia', 'Q156926', LEAD69('Welwitschia mirabilis', 'Welwitschia')) };
    const c = await checkSummaries(store(docs) as never, redirect('Welwitschia mirabilis', 'Welwitschia').f, () => '2026-10-13T00:00:00Z');
    expect(docs['w.json'].upstream.wikipedia.detail).toBe("Wikipedia redirects Welwitschia mirabilis to Welwitschia, this species' genus (Q15044266), which holds one accepted species in Kew's WCVP"); // base: the lead's words kept
    expect(c).toMatchObject({ confirmed: 1, changed: 1, proofs: { 'monotypic-genus': 1 } });
  });
  it('another spelling, read offline, names itself', async () => {
    const docs = { 'a.json': stored('Ariocarpus scaphirostrus', 'Ariocarpus scaphirostris', undefined, LEAD69('Ariocarpus scaphirostrus', 'Ariocarpus scaphirostris')) };
    await checkSummaries(store(docs) as never, null);
    expect(docs['a.json'].upstream.wikipedia.detail).toBe("Wikipedia redirects Ariocarpus scaphirostrus to Ariocarpus scaphirostris, another spelling of this species' name"); // base: the lead's words kept
  });
  it('a summary the lead kept and no proof keeps is dropped and reported: Strombocactus disciformis', async () => {
    const docs = { 's.json': stored('Strombocactus disciformis', 'Strombocactus', 'Q134845', LEAD69('Strombocactus disciformis', 'Strombocactus')) };
    const w: World = { ...W, items: { ...W.items, Q134845: { P171: ['Q8184911'], P566: ['Q12318810'], P105: [SPECIES], P225: ['Strombocactus disciformis'] } } };
    const c = await checkSummaries(store(docs) as never, redirect('Strombocactus disciformis', 'Strombocactus', w).f, () => '2026-10-13T00:00:00Z');
    expect(docs['s.json'].summary).toBeUndefined(); // base: kept by its lead
    expect(c.lines).toEqual(['Strombocactus disciformis: Wikipedia redirects Strombocactus disciformis to Strombocactus']);
  });
});

describe('S-A5: the build and the fill decide alike, and a summary no longer flips between fills', () => {
  it('a genus lead naming the species past the 1,500 characters stored: dropped once, and stays dropped', async () => {
    const built = stored('Examplea rara', 'Examplea', 'Q900001', LEAD69('Examplea rara', 'Examplea'));
    const docs = { 'e.json': built };
    const { f } = redirect('Examplea rara', 'Examplea');
    const runs: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      await checkSummaries(store(docs) as never, f, () => `2026-10-1${3 + i}T00:00:00Z`);
      runs.push(!!docs['e.json'].summary);
    }
    expect(runs).toEqual([false, false, false, false]); // base: [false, true, false, true]
    expect((await summary(f, 'Examplea rara', ['Examplea rara'], who('Examplea rara', 'Q900001'))).status).toBe('none'); // base: ok
  });
  it('the build\'s answer and the fill\'s are one, for the species set aside and the species stored', async () => {
    const cases: Array<[string, string, string]> = [
      ['Fenestraria rhopalophylla', 'Fenestraria', 'Q134282'],
      ['Bowiea volubilis', 'Bowiea', 'Q140288'],
      ['Welwitschia mirabilis', 'Welwitschia', 'Q156926'],
      ['Rosa rubiginosa', 'Rose', 'Q15546415'],
      ['Mammillaria hahniana', 'Mammillaria', 'Q144980'],
      ['Agave americana', 'Persea americana', 'Q161115'],
      ['Examplea rara', 'Examplea', 'Q900001']
    ];
    let w: World = W;
    for (const [n, t] of cases) w = { ...w, wiki: { ...(w.wiki ?? {}), [n]: { title: t, extract: LEAD[t] } } };
    const { f } = world(w);
    for (const [name, title, item] of cases) {
      const build = await summary(f, name, [name], who(name, item));
      const setAside: Record<string, Doc> = { x: { ...stored(name, title, item), summary: undefined, upstream: { wikipedia: { status: 'none', at: 'x', detail: `Wikipedia redirects ${name} to ${title}` } } } };
      const kept: Record<string, Doc> = { x: stored(name, title, item, LEAD69(name, title)) };
      await checkSummaries(store(setAside) as never, f);
      await checkSummaries(store(kept) as never, f);
      expect([name, !!setAside.x.summary, !!kept.x.summary]).toEqual([name, build.status === 'ok', build.status === 'ok']); // base: Examplea rara, the build ok and the fill dropping it
      if (build.status === 'ok') expect(kept.x.upstream.wikipedia.detail).toBe(build.detail);
    }
  });
});

describe('the build reads the species\' item for the proof (a need for B: build.ts passes `item` and the stored older names)', () => {
  // The Welwitschia fixture, with Wikidata and Wikipedia as they answer: the item's sitelink "Welwitschia mirabilis"
  // redirects to the genus's article, which the item names as its parent; Kew holds one species in the genus.
  const W0 = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json';
  const claims = (p: Record<string, string[]>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.map((x) => ({ mainsnak: { datavalue: { value: /^Q\d+$/.test(x) && k !== 'P5037' ? { id: x } : x } } }))]));
  const table = () => ({
    [`${W0}&ids=Q159760&`]: { entities: { Q159760: { claims: claims({ P3151: ['75434'], P171: ['Q15044266'], P105: [SPECIES], P225: ['Welwitschia mirabilis'] }), sitelinks: { enwiki: { title: 'Welwitschia mirabilis' } } } } },
    [`${W0}&sites=enwiki&titles=Welwitschia&`]: { entities: { Q15044266: { claims: claims({ P105: [GENUS], P225: ['Welwitschia'] }), sitelinks: { enwiki: { title: 'Welwitschia' } } } } },
    'https://en.wikipedia.org/api/rest_v1/page/summary/Welwitschia_mirabilis': { title: 'Welwitschia', type: 'standard', extract: LEAD.Welwitschia, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Welwitschia' } } },
    'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=Welwitschia&': { results: [{ key: 207870451, canonicalName: 'Welwitschia', rank: 'GENUS', taxonomicStatus: 'ACCEPTED' }] },
    'https://api.gbif.org/v1/species/search?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&highertaxonKey=207870451&': { count: 1, results: [{ canonicalName: 'Welwitschia mirabilis' }] },
    ...welwitschia()
  });
  it('Welwitschia mirabilis is given the genus\'s article, by its item\'s parent', async () => {
    const r = await buildDossier('Welwitschia mirabilis', { fetcher: fixtureFetcher(table()), builtBy: 'node', now: () => new Date('2026-10-13T00:00:00Z') });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.summary?.title).toBe('Welwitschia');
    // Without the item the build would prove it by Kew's one species alone ("the genus Welwitschia (Q15044266), whose
    // one accepted species…"); with it, by the parent, as the fill reads it.
    expect(r.dossier.upstream.wikipedia.detail).toBe("Wikipedia redirects Welwitschia mirabilis to Welwitschia, this species' genus (Q15044266), which holds one accepted species in Kew's WCVP"); // base: "…, whose lead is this species'"
  });
});

describe('the 88 taken back by their lead in round sixty-nine keep a proof that names itself', () => {
  // Wikidata, 2026-10-12. Phoenix dactylifera's stored item (Q55741727) is a stray with no claims; the title's own item
  // proves it. The leads are the round-sixty-nine corpus's, which named each species.
  const w: World = {
    items: {
      Q55741727: {},
      Q25292: { sitelink: 'Date palm', P171: ['Q27685'], P1672: ['Q1652093'], P105: [SPECIES], P225: ['Phoenix dactylifera'] },
      Q106909281: { P171: ['Q137087'], P566: ['Q96200928'], P105: [SPECIES], P225: ['Rhaphiolepis bibas'] },
      Q41505: { sitelink: 'Loquat', P171: ['Q1550170'], P566: ['Q39777083'], P105: [SPECIES], P225: ['Eriobotrya japonica'] },
      Q161056: { sitelink: 'Anemone nemorosa', P171: ['Q158286'], P105: [SPECIES], P225: ['Anemone nemorosa'] },
      Q55813553: { sitelink: 'Anemonoides nemorosa', P171: ['Q15938581'], P566: ['Q161056'], P105: [SPECIES], P225: ['Anemonoides nemorosa'] },
      Q1054565: { sitelink: 'Dypsis decaryi', P171: ['Q2658058'], P566: ['Q38481451'], P105: [SPECIES], P225: ['Dypsis decaryi'] },
      Q139867083: { sitelink: 'Chrysalidocarpus decaryi', P171: ['Q11079274'], P566: ['Q38481451'], P105: [SPECIES], P225: ['Chrysalidocarpus decaryi'] },
      Q123152248: { sitelink: 'Buchozia japonica', P171: ['Q87247631'], P566: ['Q87644393'], P105: [SPECIES], P225: ['Buchozia japonica'] },
      Q9076322: { sitelink: 'Serissa', P171: ['Q156569'], P105: [GENUS], P225: ['Serissa'] },
      Q13187: { sitelink: 'Coconut tree', P171: ['Q13099531'], P1672: ['Q3342808'], P105: [SPECIES], P225: ['Cocos nucifera'] },
      Q3342808: { sitelink: 'Coconut', P1582: ['Q13187'] }
    },
    genera: { Serissa: ['Serissa japonica'] }
  };
  const lead = 'Its lead names this species.';
  const take = async (asked: string, to: string, name: string, item: string, synonyms: string[] = []) =>
    summary(world({ ...w, wiki: { [asked]: { title: to, extract: lead } } }).f, asked, [asked], who(name, item, synonyms));
  it('the title\'s item is the taxon of the name, or of an older name: "Date palm", "Loquat"', async () => {
    expect((await take('Phoenix dactylifera', 'Date palm', 'Phoenix dactylifera', 'Q55741727')).detail).toBe('Wikipedia redirects Phoenix dactylifera to Date palm, whose Wikidata item (Q25292) is the taxon Phoenix dactylifera, this species\' name'); // base: "…, whose lead is this species'"
    expect((await take('Rhaphiolepis bibas', 'Loquat', 'Rhaphiolepis bibas', 'Q106909281', ['Eriobotrya japonica (Thunb.) Lindl.'])).detail).toBe('Wikipedia redirects Rhaphiolepis bibas to Loquat, whose Wikidata item (Q41505) is the taxon Eriobotrya japonica, an older name of this species (Eriobotrya japonica)'); // base: "…, whose lead is this species'"
  });
  it('one type in Wikidata\'s basionym statements: Anemonoides nemorosa, Chrysalidocarpus decaryi', async () => {
    expect((await take('Anemone nemorosa', 'Anemonoides nemorosa', 'Anemone nemorosa', 'Q161056')).detail).toBe('Wikipedia redirects Anemone nemorosa to Anemonoides nemorosa, a name of this species with the same type: Wikidata gives Q161056 as the basionym of Q55813553'); // base: "…, whose lead is this species'"
    expect((await take('Dypsis decaryi', 'Chrysalidocarpus decaryi', 'Dypsis decaryi', 'Q1054565')).detail).toBe('Wikipedia redirects Dypsis decaryi to Chrysalidocarpus decaryi, a name of this species with the same type: Wikidata gives Q38481451 as the basionym of Q1054565 and Q139867083'); // base: "…, whose lead is this species'"
  });
  it('a genus whose one species at Kew is an older name of this one: Serissa for Buchozia japonica', async () => {
    expect((await take('Buchozia japonica', 'Serissa', 'Buchozia japonica', 'Q123152248', ['Serissa japonica (Thunb.) Thunb.'])).detail).toBe("Wikipedia redirects Buchozia japonica to Serissa, the genus Serissa (Q9076322), whose one accepted species in Kew's WCVP is Serissa japonica, an older name of this species (Serissa japonica)"); // base: "…, whose lead is this species'"
  });
  it('a product of this species: "Coconut"', async () => {
    expect((await take('Coconut tree', 'Coconut', 'Cocos nucifera', 'Q13187')).detail).toBe("Wikipedia redirects Coconut tree to Coconut, whose Wikidata item (Q3342808) is a product of this species' item (Q13187)"); // base: "…, whose lead is this species'"
  });
});

describe('guards on each part of the proofs (each fails when that part of the rule is taken out)', () => {
  it('an older name below species names another species with its first two words (guard)', async () => {
    const r = await summary(redirect('Weingartia pulchra', 'Rebutia canigueralii', { items: {} }).f, 'Weingartia pulchra', ['Weingartia pulchra'], who('Weingartia pulchra', undefined, ['Rebutia pulchra Cárdenas', 'Rebutia canigueralii subsp. pulchra (Cárdenas) Donald']));
    expect(r.status).toBe('none');
  });
  it('a product of several species is no one species\' article: "Plum"', async () => {
    // A made world: a product item naming two species. (Wikidata's own "Plum", Q12372598, named one taxon on 2026-10-12.)
    const w: World = { items: { Q900010: { sitelink: 'Prunus domestica', P171: ['Q900012'], P105: [SPECIES], P225: ['Prunus domestica'] }, Q12372598: { sitelink: 'Plum', P1582: ['Q900010', 'Q900011'] } } };
    expect((await summary(redirect('Prunus domestica', 'Plum', w).f, 'Prunus domestica', ['Prunus domestica'], who('Prunus domestica', 'Q900010'))).status).toBe('none'); // base: ok
  });
  it('a basionym below species is not an older name of this species (guard)', async () => {
    const w: World = { items: { Q1: { P171: ['Q9'], P566: ['Q2'], P105: [SPECIES], P225: ['Aus bus'] }, Q2: { sitelink: 'Cus dus', P105: ['Q767728'], P225: ['Cus dus var. bus'] } } };
    expect((await summary(redirect('Aus bus', 'Cus dus', w).f, 'Aus bus', ['Aus bus'], who('Aus bus', 'Q1'))).status).toBe('none');
  });
  it('a genus of one species at Kew that is neither this species\' parent nor holds it by name (guard)', async () => {
    const w: World = {
      items: { Q128784530: { sitelink: 'Harpephyllum afrum', P171: ['Q1'], P105: [SPECIES], P225: ['Harpephyllum afrum'] }, Q9002134: { sitelink: 'Harpephyllum', P105: [GENUS], P225: ['Harpephyllum'] } },
      genera: { Harpephyllum: ['Harpephyllum afrum'] }
    };
    expect((await summary(redirect('Harpephyllum caffrum', 'Harpephyllum', w).f, 'Harpephyllum caffrum', ['Harpephyllum caffrum'], who('Harpephyllum caffrum', 'Q128784530'))).status).toBe('none');
  });
});

/* ---------- Second pass: R47 (REVIEW-TRIAGE-69 section 7, A2), Wikidata as it stood on 2026-10-12 ---------- */

describe('A2 (R47-4): a sitelink or a carried title that is another species\' name is no proof', () => {
  // Drosera montana's item, Q5308558: English sitelink "Drosera tomentosa", taxon name Drosera montana. Wikipedia has
  // no Drosera montana article; the live page quoted Drosera tomentosa's.
  const w: World = {
    items: { Q5308558: { sitelink: 'Drosera tomentosa', P171: ['Q266'], P105: [SPECIES], P225: ['Drosera montana'] } },
    wiki: { 'Drosera tomentosa': { title: 'Drosera tomentosa', extract: 'Drosera tomentosa is a species of sundew. In 1906, Ludwig Diels reduced the species to a variety of D. montana.' } }
  };
  const detail = "Wikipedia's article Drosera tomentosa is under a name that is neither this species' nor one of its older names";
  it('the build, asking the item\'s sitelink', async () => {
    expect(await summary(world(w).f, 'Drosera tomentosa', ['Drosera tomentosa', 'Drosera montana'], who('Drosera montana', 'Q5308558'))).toEqual({ status: 'none', detail }); // base: ok
  });
  it('the build, asking a title carried from the last build while Wikidata lags (no item read)', async () => {
    expect(await summary(world(w).f, 'Drosera tomentosa', ['Drosera tomentosa', 'Drosera montana'], who('Drosera montana'))).toEqual({ status: 'none', detail }); // base: ok
  });
  it('the fill drops the stored summary, which round sixty-nine confirmed as the item\'s sitelink', async () => {
    const docs = { 'd.json': stored('Drosera montana', 'Drosera tomentosa', 'Q5308558') };
    const c = await checkSummaries(store(docs) as never, world(w).f, () => '2026-10-13T00:00:00Z');
    expect(docs['d.json'].summary).toBeUndefined(); // base: kept
    expect(docs['d.json'].upstream.wikipedia).toEqual({ status: 'none', at: '2026-10-13T00:00:00Z', detail });
    expect(c.lines).toEqual([`Drosera montana: ${detail}`]);
  });
  it('a sitelink that is a common name, or this species\' name, stands (guard)', async () => {
    const v = { items: { Q155825: { sitelink: 'Venus flytrap', P105: [SPECIES], P225: ['Dionaea muscipula'] } }, wiki: { 'Venus flytrap': { title: 'Venus flytrap', extract: LEAD['Venus flytrap'] } } };
    expect(await summary(world(v).f, 'Venus flytrap', ['Venus flytrap', 'Dionaea muscipula'], who('Dionaea muscipula', 'Q155825'))).toMatchObject({ status: 'ok', data: { title: 'Venus flytrap' } });
    const a = { wiki: { 'Ariocarpus scaphirostris': { title: 'Ariocarpus scaphirostris', extract: 'x' } } };
    const r = await summary(world(a).f, 'Ariocarpus scaphirostris', ['Ariocarpus scaphirostris'], who('Ariocarpus scaphirostrus'));
    expect(r).toMatchObject({ status: 'ok', data: { title: 'Ariocarpus scaphirostris' } });
    // A two-word name of another genus the species was never placed in is not read as a name: "Date palm" stays the item's.
    expect(await summary(world({ items: { Q25292: { sitelink: 'Date palm', P105: [SPECIES], P225: ['Phoenix dactylifera'] } }, wiki: { 'Date palm': { title: 'Date palm', extract: 'x' } } }).f, 'Date palm', ['Date palm'], who('Phoenix dactylifera', 'Q25292'))).toMatchObject({ status: 'ok' });
  });
});

describe('R47-7: titles a lead rule would keep', () => {
  const w: World = {
    items: {
      Q2028486: { sitelink: 'Orbea ciliata', P171: ['Q162376'], P566: ['Q38446813'], P105: [SPECIES], P225: ['Orbea ciliata'] },
      Q726413: { sitelink: 'Mezcal' },
      Q932877: { sitelink: 'Sotol' },
      Q156938: { sitelink: 'Teak', P171: ['Q9250007'], P1672: ['Q2048129'], P105: [SPECIES], P225: ['Tectona grandis'] },
      Q6569364: { sitelink: 'List of Drosera species' },
      Q148788: { sitelink: 'Dasylirion wheeleri', P171: ['Q138447'], P105: [SPECIES], P225: ['Dasylirion wheeleri'] }
    },
    genera: { Ceropegia: 790 }
  };
  const lead = (t: string) => `${t} names Ceropegia ciliata, Agave lechuguilla, Dasylirion wheeleri, Tectona hamiltoniana and Drosera capensis.`;
  const asks = (asked: string, to: string, name: string, item?: string) => summary(world({ ...w, wiki: { [asked]: { title: to, extract: lead(to) } } }).f, asked, [asked], who(name, item));
  it('Orbea ciliata for Ceropegia ciliata (Wight): the same epithet in another genus, another type', async () => {
    expect((await asks('Ceropegia ciliata', 'Orbea ciliata', 'Ceropegia ciliata')).status).toBe('none'); // base: ok
  });
  it('Mezcal, Sotol, Teak: products and a timber that are not this species\'', async () => {
    expect((await asks('Agave lechuguilla', 'Mezcal', 'Agave lechuguilla')).status).toBe('none'); // base: ok
    expect((await asks('Dasylirion wheeleri', 'Sotol', 'Dasylirion wheeleri', 'Q148788')).status).toBe('none'); // base: ok
    expect((await asks('Tectona hamiltoniana', 'Teak', 'Tectona hamiltoniana')).status).toBe('none'); // base: ok
  });
  it('"List of …", and a genus page listing "including Ceropegia linearis"', async () => {
    expect((await asks('Drosera capensis', 'List of Drosera species', 'Drosera capensis')).status).toBe('none'); // base: ok
    expect((await asks('Ceropegia linearis', 'Ceropegia', 'Ceropegia linearis')).status).toBe('none'); // base: ok
  });
});

describe('R47-8 and R47-19 (section 13): what the proofs decide where the lead rule was reverted', () => {
  it('Melaleuca citrina for Callistemon lanceolatus, Ficaria verna for Ranunculus ficaria: no proof, so out (guard)', async () => {
    // Neither title is among the stored older names, and Wikidata states no shared type: Melaleuca citrina's basionym is
    // Q50844320, Callistemon lanceolatus' item states none; Ficaria verna's and Ranunculus ficaria's items state none.
    const w: World = {
      items: {
        Q15396109: { P171: ['Q496460'], P105: [SPECIES], P225: ['Callistemon lanceolatus'] },
        Q6810997: { sitelink: 'Melaleuca citrina', P171: ['Q606617'], P566: ['Q50844320'], P105: [SPECIES], P225: ['Melaleuca citrina'] },
        Q19796483: { P171: ['Q146130'], P105: [SPECIES], P225: ['Ranunculus ficaria'] },
        Q157557: { sitelink: 'Ficaria verna', P171: ['Q9390917'], P105: [SPECIES], P225: ['Ficaria verna'] }
      }
    };
    const a = (asked: string, to: string, item: string) => summary(world({ ...w, wiki: { [asked]: { title: to, extract: `${to} is a species.` } } }).f, asked, [asked], who(asked, item));
    expect(await a('Callistemon lanceolatus', 'Melaleuca citrina', 'Q15396109')).toEqual({ status: 'none', detail: 'Wikipedia redirects Callistemon lanceolatus to Melaleuca citrina' });
    expect(await a('Ranunculus ficaria', 'Ficaria verna', 'Q19796483')).toEqual({ status: 'none', detail: 'Wikipedia redirects Ranunculus ficaria to Ficaria verna' });
  });
  it('another species of the genus whose lead says this one is now included in it (guard)', async () => {
    const w: World = { items: { Q109406541: { P171: ['Q7702591'], P105: [SPECIES], P225: ['Weingartia pulchra'] }, Q109382143: { sitelink: 'Weingartia canigueralii', P566: ['Q15008124'], P105: [SPECIES], P225: ['Weingartia canigueralii'] } }, wiki: { 'Weingartia pulchra': { title: 'Weingartia canigueralii', extract: 'Weingartia canigueralii is a species of cactus. Weingartia pulchra is now included here.' } } };
    expect((await summary(world(w).f, 'Weingartia pulchra', ['Weingartia pulchra'], who('Weingartia pulchra', 'Q109406541'))).status).toBe('none');
  });
  it('"a common name for several species", whose lead names this one', async () => {
    const w: World = { wiki: { 'Dioscorea alata': { title: 'Yam', extract: 'Yam is the common name for several species in the genus Dioscorea, including Dioscorea alata.' } } };
    expect((await summary(world(w).f, 'Dioscorea alata', ['Dioscorea alata'], who('Dioscorea alata'))).status).toBe('none'); // base: ok
  });
  it('a stored summary with no item, whose lead names the species, is dropped without a proof', async () => {
    const docs = { 'k.json': { ...stored('Kopsia fruticosa', 'Kopsia', undefined), summary: { ...stored('Kopsia fruticosa', 'Kopsia', undefined).summary!, text: 'Kopsia is a genus of plants. Kopsia fruticosa is its best-known species.' } } };
    const w: World = { items: { Q309613: { sitelink: 'Kopsia', P105: [GENUS], P225: ['Kopsia'] } }, genera: { Kopsia: 25 }, wiki: { 'Kopsia fruticosa': { title: 'Kopsia', extract: 'Kopsia is a genus of plants. Kopsia fruticosa is its best-known species.' } } };
    await checkSummaries(store(docs) as never, world(w).f, () => '2026-10-13T00:00:00Z');
    expect(docs['k.json'].summary).toBeUndefined(); // base: kept by its lead
  });
});
