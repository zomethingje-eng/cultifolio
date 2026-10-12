/**
 * Round sixty-nine, the owner's `--fill summaries`: 108 stored summaries were dropped because Wikipedia gave them under
 * another title, and about nine in ten of those were the species' own article (a genus of one species, a crop's common
 * name, the species placed in another genus, another spelling). The rule now reads the lead as well as the title
 * (`redirectIsThisSpecies`), in the build and in the fill, and the fill asks again for those it set aside. The leads
 * below are Wikipedia's, in part, as the corpus held them on 2026-10-11. Each "kept" case FAILED on the deployed round
 * sixty-nine (dropped by title alone); each "dropped" case is a guard: the rule's first purpose (triage-68 M3, R46-12).
 */
import { describe, it, expect } from 'vitest';
import { redirectIsThisSpecies, summary } from '$dossier/sources/wikimedia';
import { checkSummaries } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';

const LEAD = {
  Welwitschia: 'Welwitschia is a monotypic genus of gnetophytes containing only the species Welwitschia mirabilis. It is named after the Austrian botanist Friedrich Welwitsch.',
  Apple: 'An apple is the round, edible fruit of an apple tree. Fruit trees of the orchard or domestic apple, the most widely grown in the genus, are cultivated worldwide.',
  'Huernia zebrina': 'Huernia zebrina, the little owl or lifesaver cactus, is a species of flowering plant in the family Apocynaceae, native to Namibia.',
  'Ariocarpus scaphirostris': 'Ariocarpus scaphirostris is a species of plant in the family Cactaceae. It was originally called Ariocarpus scapharostrus in the 1930s.',
  'Date palm': 'Phoenix dactylifera, commonly known as the date palm, is a flowering-plant species in the palm family Arecaceae.',
  Serissa: 'Serissa japonica is a species of flowering plants in the family Rubiaceae. It is the sole species in genus Serissa.',
  Kopsia: 'Kopsia is a genus of plants in the family Apocynaceae. It was first described as a genus in 1823.',
  Crassula: 'Crassula is a genus of succulent plants containing about 200 accepted species, including the popular jade plant.',
  Jeffersonia: 'Jeffersonia, also known as twinleaf or rheumatism root, is a small genus of herbaceous perennial plants in the family Berberidaceae.',
  'Mammillaria standleyi': 'Mammillaria standleyi is a species of the family Cactaceae native to the Sierra Madre Occidental of Sinaloa, Chihuahua and Sonora.',
  'Weingartia canigueralii': 'Weingartia canigueralii is a species of cactus native to Bolivia.'
};

describe('a lead Wikipedia gave under another title', () => {
  it('kept: the genus of one species, when its lead names the species', () => {
    expect(redirectIsThisSpecies('Welwitschia', LEAD.Welwitschia, 'Welwitschia mirabilis', [])).toBe(true);
  });
  it('kept: a crop by its common name, whose lead is no genus\'s', () => {
    expect(redirectIsThisSpecies('Apple', LEAD.Apple, 'Malus domestica', ['Malus anetica Poit. & Turpin'])).toBe(true);
  });
  it('kept: the species placed in another genus, the same epithet', () => {
    expect(redirectIsThisSpecies('Huernia zebrina', LEAD['Huernia zebrina'], 'Ceropegia zebrina', ['Huernia magniflora E.Phillips'])).toBe(true);
  });
  it('kept: another spelling of the epithet in the same genus', () => {
    expect(redirectIsThisSpecies('Ariocarpus scaphirostris', LEAD['Ariocarpus scaphirostris'], 'Ariocarpus scaphirostrus', [])).toBe(true);
  });
  it('kept: a two-word common name whose lead names the species', () => {
    expect(redirectIsThisSpecies('Date palm', LEAD['Date palm'], 'Phoenix dactylifera', [])).toBe(true);
  });
  it('kept: a genus page whose lead names an older name of this species', () => {
    expect(redirectIsThisSpecies('Serissa', LEAD.Serissa, 'Buchozia japonica', ['Serissa japonica (Thunb.) Thunb.'])).toBe(true);
  });
  it('dropped (guard): a genus of many species whose lead does not name this one', () => {
    expect(redirectIsThisSpecies('Kopsia', LEAD.Kopsia, 'Kopsia fruticosa', [])).toBe(false);
    expect(redirectIsThisSpecies('Crassula', LEAD.Crassula, 'Crassula deltoidea', [])).toBe(false);
    expect(redirectIsThisSpecies('Jeffersonia', LEAD.Jeffersonia, 'Jeffersonia diphylla', [])).toBe(false);
  });
  it('dropped (guard): another epithet in this species\' genus is another species, or this one lumped into it', () => {
    expect(redirectIsThisSpecies('Weingartia canigueralii', LEAD['Weingartia canigueralii'], 'Weingartia pulchra', ['Rebutia pulchra Cárdenas'])).toBe(false);
    expect(redirectIsThisSpecies('Mammillaria standleyi', LEAD['Mammillaria standleyi'], 'Mammillaria sonorensis', [])).toBe(false);
  });
  it('dropped (guard): no lead to read', () => {
    expect(redirectIsThisSpecies('Welwitschia', '', 'Welwitschia mirabilis', [])).toBe(false);
  });
});

/** Wikipedia's summary endpoint as it answers a title that redirects: the final title, and the lead. */
const wiki = (answers: Record<string, { title: string; extract: string }>) =>
  (async (url: string) => {
    const asked = decodeURIComponent(url.split('/page/summary/')[1] ?? '').replace(/_/g, ' ');
    const a = answers[asked];
    return a ? { status: 'ok', data: { ...a, type: 'standard', content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${a.title.replace(/ /g, '_')}` } } } } : { status: 'none' };
  }) as unknown as JsonFetcher;

describe('the build takes such a lead, and says it came under another title', () => {
  it('Welwitschia mirabilis is given the genus\'s article', async () => {
    const r = await summary(wiki({ 'Welwitschia mirabilis': { title: 'Welwitschia', extract: LEAD.Welwitschia } }), 'Welwitschia mirabilis', ['Welwitschia mirabilis'], { name: 'Welwitschia mirabilis', synonyms: [] });
    expect(r).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Welwitschia mirabilis to Welwitschia, whose lead is this species'", data: { title: 'Welwitschia' } }); // base: none
  });
  it('Kopsia fruticosa is still not given the genus\'s (guard)', async () => {
    const r = await summary(wiki({ 'Kopsia fruticosa': { title: 'Kopsia', extract: LEAD.Kopsia } }), 'Kopsia fruticosa', ['Kopsia fruticosa'], { name: 'Kopsia fruticosa', synonyms: [] });
    expect(r).toEqual({ status: 'none', detail: 'Wikipedia redirects Kopsia fruticosa to Kopsia' });
  });
});

describe('--fill summaries asks again for what its first run set aside', () => {
  const setAside = (name: string, to: string) => ({ name: { scientific: name, synonyms: [] as string[] }, ids: { gbif: 1 } as Record<string, unknown>, links: {} as Record<string, unknown>, upstream: { wikipedia: { status: 'none', at: '2026-10-12T00:00:00Z', detail: `Wikipedia redirects ${name} to ${to}` } } as Record<string, { status: string; at: string; detail?: string }>, summary: undefined as unknown });
  const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(f: string) => docs[f] as T, write: (f: string, d: unknown) => { docs[f] = d; } });
  it('takes back Welwitschia\'s, leaves Kopsia\'s aside, and records which', async () => {
    const docs: Record<string, unknown> = { 'w.json': setAside('Welwitschia mirabilis', 'Welwitschia'), 'k.json': setAside('Kopsia fruticosa', 'Kopsia') };
    const f = wiki({ 'Welwitschia mirabilis': { title: 'Welwitschia', extract: LEAD.Welwitschia }, 'Kopsia fruticosa': { title: 'Kopsia', extract: LEAD.Kopsia } });
    const c = await checkSummaries(store(docs) as never, f, () => '2026-10-13T00:00:00Z');
    expect(c).toMatchObject({ restored: 1, dropped: 0 }); // base: no second look
    const w = docs['w.json'] as ReturnType<typeof setAside>;
    expect(w.summary).toMatchObject({ title: 'Welwitschia', source: 'wikipedia', licence: 'CC BY-SA 4.0' });
    expect(w.ids.wikipedia).toBe('Welwitschia');
    expect(w.links.wikipedia).toBe('https://en.wikipedia.org/wiki/Welwitschia');
    expect(w.upstream.wikipedia).toEqual({ status: 'ok', at: '2026-10-13T00:00:00Z', detail: "Wikipedia redirects Welwitschia mirabilis to Welwitschia, whose lead is this species'" });
    expect((docs['k.json'] as ReturnType<typeof setAside>).summary).toBeUndefined();
  });
  it('offline it asks nothing and changes nothing (guard)', async () => {
    const docs: Record<string, unknown> = { 'w.json': setAside('Welwitschia mirabilis', 'Welwitschia') };
    const c = await checkSummaries(store(docs) as never, null);
    expect(c.restored).toBe(0);
    expect((docs['w.json'] as ReturnType<typeof setAside>).summary).toBeUndefined();
  });
});
