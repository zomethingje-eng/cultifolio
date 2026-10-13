/**
 * Round seventy-b, A: what the owner's corpus step (`run1/owner-run.txt`) showed of round seventy's summary rule.
 *   - The rebuild of 118 lost four summaries; three should stand. Round seventy's A2 refused any binomial in one of the
 *     species' genera that was not its name, so Erythrina caffra lost "Erythrina afra" (its item's own sitelink, the
 *     2024 replacement of "caffr-" epithets) and Rhododendron kanehirae "Rhododendron kanehirai". A2 now refuses a
 *     binomial only when GBIF holds it as another species, or under a variety of this one (Drosera tomentosa).
 *     Sprekelia formosissima lost "Zephyranthes formosissima": Wikipedia's article is sitelinked to the genus Sprekelia's
 *     item, and the species item of that name states no basionym; Kew's names prove it (the same basionym).
 *   - `--fill summaries` counted 234 summaries not checked: one Wikidata batch that did not answer left every species
 *     with an item unchecked, and nothing was asked again.
 * Wikidata, GBIF and Kew as they stood on 2026-10-13. Each case marked "m70:" FAILED on the merged round seventy (tag
 * m70); a case marked "guard" passes on both.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { summary, mwWait } from '$dossier/sources/wikimedia';
import { checkSummaries } from '$dossier/corpus-fills';
import { spellingKey } from '$dossier/epithet';
import type { JsonFetcher } from '$dossier/fetch';
import { world, GENUS, SPECIES, type World } from './r70a-summary-world';

afterEach(() => { mwWait.tries = 1; });
const who = (name: string, item?: string, synonyms: string[] = []) => ({ name, synonyms, item });

describe('A2 narrowed: a binomial is refused only when GBIF holds it as another species', () => {
  it('Erythrina caffra keeps "Erythrina afra", its item\'s sitelink, which GBIF does not hold', async () => {
    const w: World = { items: { Q1955238: { sitelink: 'Erythrina afra', P171: ['Q1340386'], P105: [SPECIES], P225: ['Erythrina afra'] } }, wiki: { 'Erythrina afra': { title: 'Erythrina afra', extract: 'Erythrina afra, the coast coral tree, is a species of tree in the family Fabaceae.' } } };
    const r = await summary(world(w).f, 'Erythrina afra', ['Erythrina afra', 'Erythrina caffra'], who('Erythrina caffra', 'Q1955238', ['Erythrina fissa C.Presl', 'Corallodendron caffrum (Thunb.) Kuntze']));
    expect(r).toMatchObject({ status: 'ok', data: { title: 'Erythrina afra' } }); // m70: none
    // Proved by the item's sitelink; once C's spelling need is applied, "afra" is "caffra" spelt as the Code now asks, and
    // no proof is needed at all.
    if (r.status === 'ok' && r.detail) expect(r.detail).toBe("Wikipedia's article Erythrina afra, the English article of this species' Wikidata item (Q1955238)");
  });
  it('Drosera montana still does not take "Drosera tomentosa", which GBIF holds under a variety of it (guard)', async () => {
    const w: World = { items: { Q5308558: { sitelink: 'Drosera tomentosa', P171: ['Q266'], P105: [SPECIES], P225: ['Drosera montana'] } }, gbif: { 'Drosera tomentosa': { species: 'Drosera montana', status: 'SYNONYM', below: 'Drosera montana tomentosa' } }, wiki: { 'Drosera tomentosa': { title: 'Drosera tomentosa' } } };
    expect((await summary(world(w).f, 'Drosera tomentosa', ['Drosera tomentosa'], who('Drosera montana', 'Q5308558'))).status).toBe('none');
  });
  it('a binomial GBIF holds as another species is refused, though it is the item\'s sitelink (guard)', async () => {
    // A made item: Acer saccharinum's, sitelinked to "Acer saccharum", which GBIF holds as an accepted species of its own.
    const w: World = { items: { Q900020: { sitelink: 'Acer saccharum', P171: ['Q42292'], P105: [SPECIES], P225: ['Acer saccharinum'] } }, gbif: { 'Acer saccharum': { species: 'Acer saccharum', status: 'ACCEPTED' } }, wiki: { 'Acer saccharum': { title: 'Acer saccharum' } } };
    expect(await summary(world(w).f, 'Acer saccharum', ['Acer saccharum'], who('Acer saccharinum', 'Q900020'))).toEqual({ status: 'none', detail: "Wikipedia's article Acer saccharum is under a name that is neither this species' nor one of its older names" });
  });
  it('Rhododendron kanehirae keeps "Rhododendron kanehirai", its genitive spelt the other way (passes once C\'s spelling need is applied)', async () => {
    // GBIF holds Rhododendron kanehirai (5733624) and R. kanehirae (4936864) as two accepted species, so only the
    // spelling rule makes the title this species' name; the reference holds no kanehirai.
    const w: World = { items: { Q3024319: { sitelink: 'Rhododendron kanehirai', P171: ['Q189393'], P105: [SPECIES], P225: ['Rhododendron kanehirae'] } }, gbif: { 'Rhododendron kanehirai': { species: 'Rhododendron kanehirai', status: 'ACCEPTED' } }, wiki: { 'Rhododendron kanehirai': { title: 'Rhododendron kanehirai' } } };
    const r = await summary(world(w).f, 'Rhododendron kanehirai', ['Rhododendron kanehirai'], who('Rhododendron kanehirae', 'Q3024319'));
    expect(r).toMatchObject({ status: 'ok', data: { title: 'Rhododendron kanehirai' } }); // m70: none
  });
  it('a binomial GBIF holds as a synonym of this species is an older name: Huernia zebrina, read now as GBIF has it', async () => {
    // GBIF holds Huernia zebrina under Ceropegia zebrina subsp. zebrina, the autonym: the species itself.
    const w: World = { gbif: { 'Huernia zebrina': { species: 'Ceropegia zebrina', status: 'SYNONYM', below: 'Ceropegia zebrina zebrina' } }, wiki: { 'Ceropegia zebrina': { title: 'Huernia zebrina' } } };
    expect(await summary(world(w).f, 'Ceropegia zebrina', ['Ceropegia zebrina'], who('Ceropegia zebrina'))).toMatchObject({ status: 'ok', detail: 'Wikipedia redirects Ceropegia zebrina to Huernia zebrina, a name GBIF holds as a synonym of this species' }); // m70: none (no item, so no basionym)
  });
});

describe('the same type by Kew\'s names: Sprekelia formosissima and Zephyranthes formosissima', () => {
  const w = (kewRows: World['kew']): World => ({
    items: {
      Q6647381: { sitelink: 'Sprekelia formosissima', P171: ['Q159042'], P566: ['Q21870164'], P105: [SPECIES], P225: ['Sprekelia formosissima'] },
      // The genus Sprekelia's item, whose English sitelink Wikipedia has moved to the species' new name.
      Q159042: { sitelink: 'Zephyranthes formosissima', P171: ['Q5768271'], P105: [GENUS], P225: ['Sprekelia'] }
    },
    kew: kewRows,
    wiki: { 'Sprekelia formosissima': { title: 'Zephyranthes formosissima', extract: 'Zephyranthes formosissima, the Aztec lily, is a perennial bulb.' } }
  });
  it('Kew holds Sprekelia formosissima (L.) Herb. under Zephyranthes formosissima (L.) Z.H.Feng: one basionym, by L.', async () => {
    const r = await summary(world(w({ 'Sprekelia formosissima': [{ authorship: '(L.) Herb.', taxonomicStatus: 'SYNONYM', accepted: 'Zephyranthes formosissima (L.) Z.H.Feng' }] })).f, 'Sprekelia formosissima', ['Sprekelia formosissima'], who('Sprekelia formosissima', 'Q6647381'));
    expect(r).toMatchObject({ status: 'ok', detail: "Wikipedia redirects Sprekelia formosissima to Zephyranthes formosissima, a name of this species with the same type: Kew's WCVP holds Sprekelia formosissima (L.) Herb. under Zephyranthes formosissima (L.) Z.H.Feng, both from a basionym by L." }); // m70: none
  });
  it('a synonym at Kew by another basionym is a lump, and proves nothing (guard)', async () => {
    const r = await summary(world(w({ 'Sprekelia formosissima': [{ authorship: 'Herb.', taxonomicStatus: 'SYNONYM', accepted: 'Zephyranthes formosissima (L.) Z.H.Feng' }] })).f, 'Sprekelia formosissima', ['Sprekelia formosissima'], who('Sprekelia formosissima', 'Q6647381'));
    expect(r.status).toBe('none');
  });
  it('a name Kew holds twice, once accepted, proves nothing (guard: Agave vivipara L. and Arruda)', async () => {
    const r = await summary(world(w({ 'Sprekelia formosissima': [{ authorship: '(L.) Herb.', taxonomicStatus: 'SYNONYM', accepted: 'Zephyranthes formosissima (L.) Z.H.Feng' }, { authorship: '(L.) Herb.', taxonomicStatus: 'ACCEPTED' }] })).f, 'Sprekelia formosissima', ['Sprekelia formosissima'], who('Sprekelia formosissima', 'Q6647381'));
    expect(r.status).toBe('none');
  });
});

describe('Matteuccia struthiopteris: what the rule gives (guard)', () => {
  it('Kew holds Matteuccia as a synonym (of Onoclea), so no accepted genus and no count: the genus page is not taken', async () => {
    const w: World = {
      items: { Q1130386: { sitelink: 'Matteuccia struthiopteris', P171: ['Q304969'], P105: [SPECIES], P225: ['Matteuccia struthiopteris'] }, Q304969: { sitelink: 'Matteuccia', P171: ['Q139173'], P105: [GENUS], P225: ['Matteuccia'] } },
      wiki: { 'Matteuccia struthiopteris': { title: 'Matteuccia', extract: 'Matteuccia is a genus of ferns with one species, Matteuccia struthiopteris.' } }
    };
    expect(await summary(world(w).f, 'Matteuccia struthiopteris', ['Matteuccia struthiopteris'], who('Matteuccia struthiopteris', 'Q1130386'))).toEqual({ status: 'none', detail: 'Wikipedia redirects Matteuccia struthiopteris to Matteuccia' });
  });
});

/* ---------- --fill summaries: waits and partial batches ---------- */

type Doc = { name: { scientific: string; synonyms: string[] }; ids: Record<string, unknown>; links: Record<string, unknown>; summary?: { text: string; title: string; source: string; url: string; licence: string }; upstream: Record<string, { status: string; at: string; detail?: string }> };
const kept69 = (name: string, title: string, item: string): Doc => ({
  name: { scientific: name, synonyms: [] },
  ids: { gbif: 1, wikidata: item, wikipedia: title },
  links: { wikipedia: `https://en.wikipedia.org/wiki/${title}` },
  summary: { text: 'lead', title, source: 'wikipedia', url: `https://en.wikipedia.org/wiki/${title}`, licence: 'CC BY-SA 4.0' },
  // As round sixty-nine's fill left the 88 it took back.
  upstream: { wikipedia: { status: 'ok', at: '2026-10-12T01:59:00Z', detail: `Wikipedia redirects ${name} to ${title}, whose lead is this species'` } }
});
const store = (docs: Record<string, Doc>) => ({ files: () => Object.keys(docs), read: <T,>(f: string) => structuredClone(docs[f]) as T, write: (f: string, d: unknown) => { docs[f] = d as Doc; } });
const welw: World = {
  items: { Q156926: { sitelink: 'Welwitschia mirabilis', P171: ['Q15044266'], P105: [SPECIES], P225: ['Welwitschia mirabilis'] }, Q15044266: { sitelink: 'Welwitschia', P105: [GENUS], P225: ['Welwitschia'] } },
  genera: { Welwitschia: ['Welwitschia mirabilis'] },
  wiki: { 'Welwitschia mirabilis': { title: 'Welwitschia' } }
};

describe('--fill summaries asks again what a source did not answer, before it counts it not checked', () => {
  it('Wikidata lagged for the first pass: the 88 of round sixty-nine are read, and proved on the next', async () => {
    const { f: inner, asked } = world(welw);
    let lagged = true;
    const f = (async (url: string) => (lagged && url.includes('wikidata') ? { status: 'ok', data: { error: { code: 'maxlag', info: 'Waiting for wdqs1016: 7.6 seconds lagged.' } } } : inner(url))) as unknown as JsonFetcher;
    const { fillRounds } = await import('$dossier/summary-fill');
    const waited: number[] = [];
    fillRounds.sleep = async (ms: number) => { waited.push(ms); lagged = false; };
    mwWait.tries = 5; // as a corpus run sets it (`startCorpusRun`)
    const sleep = mwWait.sleep;
    mwWait.sleep = async () => {};
    try {
      const docs = { 'w.json': kept69('Welwitschia mirabilis', 'Welwitschia', 'Q156926') };
      const c = await checkSummaries(store(docs) as never, f, () => '2026-10-13T00:00:00Z');
      expect(waited).toEqual([600_000]); // m70: no wait
      expect(c).toMatchObject({ unchecked: 0, confirmed: 1, changed: 1 }); // m70: unchecked 1
      expect(docs['w.json'].upstream.wikipedia.detail).toBe("Wikipedia redirects Welwitschia mirabilis to Welwitschia, this species' genus (Q15044266), which holds one accepted species in Kew's WCVP");
      expect(asked.some((u) => u.includes('Q156926'))).toBe(true);
    } finally {
      mwWait.sleep = sleep;
    }
  });
  it('one batch of species\' items that does not answer leaves only its own fifty unchecked', async () => {
    // 51 species: the first fifty in one batch, Welwitschia mirabilis alone in the second.
    const docs: Record<string, Doc> = {};
    const items: World['items'] = { ...welw.items };
    for (let i = 0; i < 50; i++) {
      docs[`a${String(i).padStart(2, '0')}.json`] = kept69(`Aus bus${i}`, `Aus${i}`, `Q8000${String(i).padStart(2, '0')}`);
    }
    docs['zz.json'] = kept69('Welwitschia mirabilis', 'Welwitschia', 'Q156926');
    const { f: inner } = world({ ...welw, items });
    const f = (async (url: string) => (url.includes('ids=Q800000') ? { status: 'refused', detail: 'HTTP 429' } : inner(url))) as unknown as JsonFetcher;
    const c = await checkSummaries(store(docs) as never, f, () => '2026-10-13T00:00:00Z');
    expect(c.unchecked).toBe(50); // m70: 51
    expect(docs['zz.json'].upstream.wikipedia.detail).toContain("this species' genus (Q15044266)"); // m70: the lead's words kept
  });
});

describe('the spelling rule asked of C (round seventy-b): passes once C applies the need', () => {
  it('a genitive in -ai after a consonant is the one in -ae, and "caffr-" is "afr-"; nothing else moves', () => {
    expect(spellingKey('kanehirai')).toBe(spellingKey('kanehirae'));
    expect(spellingKey('shimadai')).toBe(spellingKey('shimadae'));
    expect(spellingKey('caffra')).toBe(spellingKey('afra'));
    expect(spellingKey('caffrum')).toBe(spellingKey('afrum'));
    expect(spellingKey('bihai')).not.toBe(spellingKey('bihae')); // h, or a vowel, before -ai: no genitive (Heliconia bihai)
    expect(spellingKey('ahuai')).not.toBe(spellingKey('ahuae'));
    expect(spellingKey('africana')).not.toBe(spellingKey('afra'));
  });
});
