/**
 * Round sixty-eight: what round sixty-seven's online rebuild of 156 species taught (the owner's run). Wikidata answered
 * 141 of them with `maxlag` ("Waiting for wdqs1011: 9.2 seconds lagged."), the builder took that as the source failing,
 * and the iNaturalist taxon id that Wikidata carries went with it: iNaturalist's own name search found 83 of them under
 * no exact name, and 113 species came out with no photograph. Each case FAILED on round sixty-seven unless it says "guard".
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { crossIds, mwWait, MAXLAG_TRIES } from '$dossier/sources/wikimedia';
import { taxon } from '$dossier/sources/inat';
import { copiapoa } from '../../fixtures/upstream';

const opts = (fetcher: JsonFetcher, extra: Record<string, unknown> = {}) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-11T12:00:00Z'), ...extra });
const lagged = { error: { code: 'maxlag', info: 'Waiting for wdqs1011: 9.2 seconds lagged.' } };
const realSleep = mwWait.sleep;
beforeEach(() => { mwWait.tries = MAXLAG_TRIES; }); // as the corpus script sets it
afterEach(() => { mwWait.sleep = realSleep; mwWait.tries = 1; });

describe('Wikidata asked again after its maxlag, as MediaWiki asks', () => {
  it('a lag that clears is waited out, and the item read', async () => {
    const waits: number[] = [];
    mwWait.sleep = async (s) => { waits.push(s); };
    let n = 0;
    const base = fixtureFetcher(copiapoa());
    const f = (async (url: string) => (/list=search/.test(url) && n++ < 2 ? { status: 'ok', data: lagged } : base(url))) as unknown as JsonFetcher;
    const r = await crossIds(f, 'Copiapoa cinerea', 3943541);
    expect(r).toMatchObject({ status: 'ok', data: { wikidata: 'Q5168360', inat: 135254 } }); // base: error, "wikidata maxlag: …"
    expect(waits).toEqual([11, 11]); // the lag it named, and a second
  });
  it('a lag that does not clear is still a failure, said with its words, after the set number of asks (guard)', async () => {
    let asks = 0;
    mwWait.sleep = async () => {};
    const f = (async () => { asks++; return { status: 'ok', data: lagged }; }) as unknown as JsonFetcher;
    const r = await crossIds(f, 'Copiapoa cinerea', 3943541);
    expect(r).toEqual({ status: 'error', detail: 'wikidata maxlag: Waiting for wdqs1011: 9.2 seconds lagged.' });
    expect(asks).toBe(MAXLAG_TRIES);
  });
  it('in the Worker a lag is not waited out: one ask, and the failure said (guard)', async () => {
    mwWait.tries = 1;
    let asks = 0;
    const f = (async () => { asks++; return { status: 'ok', data: lagged }; }) as unknown as JsonFetcher;
    expect((await crossIds(f, 'Copiapoa cinerea', 3943541)).status).toBe('error');
    expect(asks).toBe(1);
  });
});

describe('when Wikidata does not answer, the previous build\'s identifiers stand', () => {
  it('iNaturalist is asked by the previous build\'s taxon id, so the photographs are found', async () => {
    mwWait.sleep = async () => {};
    const table = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(table)) if (k.startsWith('https://www.wikidata.org/')) table[k] = lagged;
    table['https://api.inaturalist.org/v1/taxa?q='] = { results: [] }; // iNaturalist's name search finds nothing exact
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table), { prevIds: { gbif: 3943541, wikidata: 'Q5168360', inat: 135254, wikipedia: 'Copiapoa cinerea' } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.ids.inat).toBe(135254);
    expect(r.dossier.photos.length).toBeGreaterThan(0); // base: none
    expect(r.dossier.upstream.wikidata).toMatchObject({ status: 'error' });
    expect(r.dossier.upstream.wikidata.detail).toMatch(/the previous build's identifiers are kept$/);
  });
  it('without a previous build the failure stands, and nothing is invented (guard)', async () => {
    mwWait.sleep = async () => {};
    const table = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(table)) if (k.startsWith('https://www.wikidata.org/')) table[k] = lagged;
    table['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    const r = await buildDossier('Copiapoa cinerea', opts(fixtureFetcher(table)));
    expect(r.ok && r.dossier.ids.inat).toBeFalsy();
  });
});

describe('iNaturalist\'s name search: a name it files under another', () => {
  const answer = (results: unknown[]) => (async () => ({ status: 'ok', data: { results } })) as unknown as JsonFetcher;
  it('is taken when the search says it matched exactly that name', async () => {
    const r = await taxon(answer([{ id: 1, name: 'Camphora officinarum', rank: 'species', matched_term: 'Cinnamomum camphora' }]), 'Cinnamomum camphora');
    expect(r).toEqual({ status: 'ok', data: { id: 1, name: 'Camphora officinarum', rank: 'species', matched_term: 'Cinnamomum camphora' }, detail: 'filed by iNaturalist as Camphora officinarum' }); // base: none
  });
  it('a neighbour the search ranked first, or two taxa claiming the name, is not (guard)', async () => {
    expect((await taxon(answer([{ id: 2, name: 'Albuca namaquensis', rank: 'species', matched_term: 'Albuca namaquensis' }]), 'Albuca nana')).status).toBe('none');
    expect((await taxon(answer([{ id: 3, name: 'A b', rank: 'species', matched_term: 'X y' }, { id: 4, name: 'C d', rank: 'species', matched_term: 'X y' }]), 'X y')).status).toBe('none');
  });
});
