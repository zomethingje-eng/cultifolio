/**
 * Round 72, A (the deep review): names and identifiers read over the whole live corpus (4c784c5dc7ca2448) against
 * Kew's WCVP. Every case FAILED on r72base unless it says "guard".
 *   - 227 pages cited an author who is not the author of the name they link (Ixora coccinea "Comm. ex Lam." beside
 *     Kew's 753844-1, Ixora coccinea L.), and 12 a backbone citation cut off after its parenthesis.
 *   - Echinocereus marksianus linked https://www.ipni.org/n/2782687-4, Kew's own number for a name IPNI does not hold.
 *   - Cochemiea matehualensis lost its POWO link, and its record said Kew's "(Backeb.) M.H.J.van der Meer" was another
 *     name: GBIF cites the basionym "(Backeb. ex Spine)".
 *   - 138 pages Kew holds by their name and author linked no POWO or IPNI, because their item carried none.
 */
import { describe, it, expect } from 'vitest';
import { fillKewLinks } from '$dossier/corpus-fills';
import { spellingKey } from '$dossier/epithet';
import { kewCitedNote } from '$lib/ui/ref/head';
import { kewLinks, kewIpni } from '$dossier/sources/gbif';
import { ownByAuthor, plainlyAnother } from '$dossier/authors';
import type { JsonFetcher } from '$dossier/fetch';

describe('the page says why the author is Kew\'s (F13: the field first)', () => {
  it('reads name.cited, and the old sentence only without it', () => {
    expect(kewCitedNote({}, { scientific: 'Ixora coccinea', authorship: 'L.', cited: { gbif: 'Comm. ex Lam.', kew: '103356' } })).toBe("GBIF's backbone cites this name as Ixora coccinea Comm. ex Lam.; the page cites it as Kew's World Checklist cites the entry it links.");
    expect(kewCitedNote({ 'gbif.species': { detail: "GBIF's key 1 is X y A.; Kew accepts X y B., and the name is cited as Kew accepts it" } }, { scientific: 'X y' })).toBe("GBIF's key 1 is X y A.; Kew accepts X y B., and the name is cited as Kew accepts it.");
  });
});

describe('spellingKey across all of Kew (pinned: seven joins of distinct epithets in 365,813 accepted species, none a page)', () => {
  it.each([
    ['lancea', 'lanceum'], ['itacolomiensis', 'itacolomiense'], ['bectauatensis', 'bectauatense'], ['aequatorialis', 'equatorialis'],
    ['coelestis', 'caelestis'], ['lacer', 'lacerus'], ['aemulans', 'emulans']
  ])('%s and %s share a key (Kew keeps the plants apart, but no page holds either)', (a, b) => {
    expect(spellingKey(a)).toBe(spellingKey(b));
  });
});

describe('an IPNI link is an IPNI number', () => {
  it('Echinocereus marksianus: Kew\'s 2782687-4 opens POWO, and IPNI keeps the item\'s 87937-2', () => {
    expect(kewLinks({ ipni: '87937-2', powo: 'urn:lsid:ipni.org:names:2782687-4' }, { ids: ['2782687-4'] })).toEqual({ ipni: '87937-2', powo: 'urn:lsid:ipni.org:names:2782687-4', changed: false });
  });
  it('with no item IPNI, no IPNI link at all', () => {
    expect(kewLinks({}, { ids: ['2782687-4'] })).toEqual({ ipni: undefined, powo: 'urn:lsid:ipni.org:names:2782687-4', changed: true });
  });
});

describe('the basionym\'s author either side of an "ex"', () => {
  const kew = [{ a: '(Backeb.) M.H.J.van der Meer' }];
  it('Cochemiea matehualensis "(Backeb. ex Spine)" is Kew\'s "(Backeb.) M.H.J.van der Meer"', () => {
    expect(ownByAuthor(kew, '(Backeb. ex Spine) ', (r) => r.a)).toEqual(kew);
    expect(plainlyAnother('(Backeb. ex Spine) ', '(Backeb.) M.H.J.van der Meer')).toBe(false);
  });
  it('another basionym author is still another name (guard)', () => {
    expect(ownByAuthor(kew, '(Spine) ', (r) => r.a)).toEqual([]);
  });
  it('a basionym cited by its author, and a name published directly, stay apart (guard: Ceropegia tanzaniensis "(Peckover)")', () => {
    expect(ownByAuthor([{ a: 'Peckover' }], '(Peckover) ', (r) => r.a)).toEqual([]);
  });
  it('B6: a citation with no one outside its brackets reads the basionym\'s people (B\'s case; the Peckover guard)', () => {
    expect(plainlyAnother('(Backeb. & Spine) ', '(Backeb.) M.H.J.van der Meer')).toBe(false); // r72base: true (no one outside the brackets)
    expect(plainlyAnother('(Peckover) ', 'Peckover')).toBe(true);
    expect(plainlyAnother('(Peckover) ', '(Frandsen & Aditya) R.Kr.Singh')).toBe(true);
    expect(plainlyAnother('Fisch. ex Steud., 1840', 'Baker')).toBe(true);
  });
});

describe('a page with no number is linked by Kew\'s', () => {
  it('--fill kew-links reads a dossier whose item gave no IPNI or POWO', async () => {
    const URL = 'https://api.gbif.org/v1/species?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=Echeveria%20purpusiorum&limit=50';
    const f = (async (url: string) => (url === URL ? { status: 'ok', data: { results: [{ key: 1, scientificName: 'Echeveria purpusiorum A.Berger', canonicalName: 'Echeveria purpusiorum', authorship: 'A.Berger', taxonomicStatus: 'ACCEPTED', family: 'Crassulaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:87066-2' }] } } : { status: 'refused', detail: url })) as unknown as JsonFetcher;
    const docs: Record<string, any> = { a: { key: 10755622, name: { scientific: 'Echeveria purpusiorum', authorship: 'A.Berger', family: 'Crassulaceae' }, ids: { gbif: 10755622 }, links: {}, upstream: { wikidata: { status: 'none', at: 'x' } } } };
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } };
    const c = await fillKewLinks(store, f, () => '2026-10-16T00:00:00Z');
    expect(c).toMatchObject({ read: 1, changed: 1 });
    expect(docs.a.links).toEqual({ ipni: 'https://www.ipni.org/n/87066-2', powo: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:87066-2' });
    expect(docs.a.upstream.wikidata.status).toBe('none');
  });
  it('kewIpni names each number it gives (the build cites the linked one)', async () => {
    const f = (async () => ({ status: 'ok', data: { results: [
      { key: 1, scientificName: 'Fragaria virginiana Duchesne', canonicalName: 'Fragaria virginiana', authorship: 'Duchesne', taxonomicStatus: 'SYNONYM', accepted: 'Fragaria virginiana subsp. virginiana', family: 'Rosaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:725144-1' },
      { key: 2, scientificName: 'Fragaria virginiana Mill.', canonicalName: 'Fragaria virginiana', authorship: 'Mill.', taxonomicStatus: 'ACCEPTED', family: 'Rosaceae', references: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:318974-2' }
    ] } })) as unknown as JsonFetcher;
    const r = await kewIpni(f, 'Fragaria virginiana', 'Duchesne', 'Rosaceae');
    expect(r.status === 'ok' && r.data.labels).toEqual({ '725144-1': 'Fragaria virginiana Duchesne', '318974-2': 'Fragaria virginiana Mill.' });
  });
});
