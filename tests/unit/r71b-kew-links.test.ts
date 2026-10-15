/**
 * Round 71, B (self-review 70 S-B5, triage-70 "IPNI and POWO links"): a page linked its Wikidata item's numbers, and of the
 * 594 dossiers whose IPNI and POWO numbers disagreed, five linked IPNI to another author's invalid or illegitimate name
 * (Colchicum neapolitanum Orph. ex Nyman for (Ten.) Ten.), and Mammillaria magnifica linked POWO to Sencke's unplaced
 * name. The page now links Kew's number for the name and author. Kew's rows as GBIF's copy of WCVP gives them, cut to the
 * fields read; each case FAILED on r71base (no `kewLinks`, no `fillKewLinks`, the build linked the item's) unless "guard".
 */
import { describe, it, expect } from 'vitest';
import { kewLinks, kewIpni, type KewIds } from '$dossier/sources/gbif';
import { fillKewLinks } from '$dossier/corpus-fills';
import type { JsonFetcher } from '$dossier/fetch';

const KEW = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=';
const row = (name: string, authorship: string, status: string, ipni: string) => ({ key: 1, scientificName: `${name} ${authorship}`, canonicalName: name, authorship, taxonomicStatus: status, family: 'X', references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}` });
const WORLD: Record<string, unknown[]> = {
  'Colchicum neapolitanum': [row('Colchicum neapolitanum', '(Ten.) Ten.', 'ACCEPTED', '533347-1'), row('Colchicum neapolitanum', 'Orph. ex Nyman', 'SYNONYM', '533346-1')],
  'Mammillaria magnifica': [row('Mammillaria magnifica', 'Franc.G.Buchenau', 'ACCEPTED', '151220-2'), row('Mammillaria magnifica', 'Sencke', 'DOUBTFUL', '30022308-2')],
  'Kalanchoe pinnata': [row('Kalanchoe pinnata', '(Lam.) Pers.', 'ACCEPTED', '274438-1')],
  'Bisnaga glaucescens': []
};
const f = (async (url: string) => {
  if (!url.startsWith(KEW)) return { status: 'refused', detail: url };
  const name = decodeURIComponent(url.slice(KEW.length).replace(/&limit=50$/, ''));
  return { status: 'ok', data: { results: WORLD[name] ?? [] } };
}) as unknown as JsonFetcher;
const kew = async (name: string, authorship: string) => { const r = await kewIpni(f, name, authorship, 'X'); if (r.status !== 'ok') throw new Error('no answer'); return r.data as KewIds; };

describe('the IPNI and POWO links are Kew\'s number for the name and author', () => {
  it('Colchicum neapolitanum (Ten.) Ten.: not the item\'s IPNI of Orph. ex Nyman\'s name', async () => {
    expect(kewLinks({ ipni: '533346-1', powo: 'urn:lsid:ipni.org:names:533347-1' }, await kew('Colchicum neapolitanum', '(Ten.) Ten.'))).toEqual({ ipni: '533347-1', powo: 'urn:lsid:ipni.org:names:533347-1', changed: true });
  });
  it('Mammillaria magnifica F.G.Buchenau: not the item\'s POWO of Sencke\'s', async () => {
    expect(kewLinks({ ipni: '151220-2', powo: 'urn:lsid:ipni.org:names:30022308-2' }, await kew('Mammillaria magnifica', 'F.G.Buchenau'))).toMatchObject({ ipni: '151220-2', powo: 'urn:lsid:ipni.org:names:151220-2', changed: true });
  });
  it('Kalanchoe pinnata: not IPNI\'s suppressed duplicate 164558-3', async () => {
    expect(kewLinks({ ipni: '164558-3', powo: 'urn:lsid:ipni.org:names:274438-1' }, await kew('Kalanchoe pinnata', '(Lam.) Pers.'))).toMatchObject({ ipni: '274438-1', changed: true });
  });
  it('a name Kew does not hold keeps the item\'s numbers (guard)', async () => {
    expect(kewLinks({ ipni: '1-1', powo: 'urn:lsid:ipni.org:names:1-1' }, await kew('Bisnaga glaucescens', '(DC.) Britton & Rose'))).toEqual({ ipni: '1-1', powo: 'urn:lsid:ipni.org:names:1-1', changed: false });
  });
  it('an item whose numbers are Kew\'s changes nothing (guard)', async () => {
    expect(kewLinks({ ipni: '533347-1', powo: 'urn:lsid:ipni.org:names:533347-1' }, await kew('Colchicum neapolitanum', '(Ten.) Ten.'))).toMatchObject({ changed: false });
  });
});

describe('--fill kew-links', () => {
  it('relinks stored dossiers, says so, and passes by what it read', async () => {
    const docs: Record<string, any> = {
      a: { key: 2739938, name: { scientific: 'Colchicum neapolitanum', authorship: '(Ten.) Ten.', family: 'X' }, ids: { ipni: '533346-1', powo: 'urn:lsid:ipni.org:names:533347-1' }, links: { ipni: 'https://www.ipni.org/n/533346-1' }, upstream: { wikidata: { status: 'ok', at: 'x', detail: 'found by its GBIF key' } } },
      b: { key: 3, name: { scientific: 'Kalanchoe pinnata', authorship: '(Lam.) Pers.', family: 'X' }, ids: { ipni: '274438-1', powo: 'urn:lsid:ipni.org:names:274438-1' }, links: {}, upstream: { wikidata: { status: 'ok', at: 'x' } } }
    };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    const c = await fillKewLinks(store, f, () => '2026-10-16T00:00:00Z');
    expect(c).toMatchObject({ read: 2, changed: 1 });
    expect(docs.a.links.ipni).toBe('https://www.ipni.org/n/533347-1');
    expect(docs.a.upstream.wikidata.detail).toMatch(/IPNI and POWO linked by Kew's number for Colchicum neapolitanum \(Ten\.\) Ten\. \(the item's: IPNI 533346-1, POWO 533347-1; 2026-10-16\)$/);
    expect(c.lines).toEqual(['Colchicum neapolitanum [2739938]: IPNI 533346-1, POWO 533347-1 → IPNI 533347-1, POWO 533347-1']);
    const again = await fillKewLinks(store, f, undefined, { read: ['2739938', '3'], save: () => {}, clear: () => {} });
    expect(again).toMatchObject({ read: 0, before: 2 });
  });
  it('stops on a refusal and keeps what it read (guard of the resume)', async () => {
    const no = (async () => ({ status: 'refused', detail: 'api.gbif.org 429' })) as unknown as JsonFetcher;
    const docs: Record<string, any> = { a: { key: 1, name: { scientific: 'Kalanchoe pinnata' }, ids: { ipni: '1' }, links: {}, upstream: {} } };
    const saved: string[][] = [];
    const c = await fillKewLinks({ files: () => ['a'], read: <T,>(k: string) => docs[k] as T, write: () => {} }, no, undefined, { save: (r) => saved.push(r), clear: () => {} });
    expect(c.failed).toMatch(/429/);
    expect(saved).toEqual([[]]);
  });
});

describe('the build links Kew\'s number', () => {
  it('an item found by its GBIF key, carrying another author\'s IPNI, is linked by Kew\'s', async () => {
    const { buildDossier } = await import('$dossier/build');
    const { fixtureFetcher } = await import('$dossier/fetch');
    const { copiapoa } = await import('../../fixtures/upstream');
    const t = copiapoa() as Record<string, unknown>;
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    t['https://www.wikidata.org/w/api.php?action=wbgetentities'] = { entities: { Q5168360: { claims: { P3151: [{ mainsnak: { datavalue: { value: '135254' } } }], P961: [{ mainsnak: { datavalue: { value: '9-9' } } }], P5037: [{ mainsnak: { datavalue: { value: 'urn:lsid:ipni.org:names:9-9' } } }] }, sitelinks: { enwiki: { title: 'Copiapoa cinerea' } } } } };
    t[`${KEW}Copiapoa%20cinerea`] = { results: [row('Copiapoa cinerea', '(Phil.) Britton & Rose', 'ACCEPTED', '1-1'), row('Copiapoa cinerea', 'Hort.', 'SYNONYM', '9-9')] };
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(t), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'] });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.links.ipni).toBe('https://www.ipni.org/n/1-1'); // r71base: 9-9, the item's
    expect(r.dossier.links.powo).toBe('https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1-1');
    expect(r.dossier.upstream.wikidata.detail).toMatch(/IPNI and POWO linked by Kew's number for Copiapoa cinerea \(Phil\.\) Britton & Rose \(the item's: IPNI 9-9, POWO 9-9\)/);
  });
});
