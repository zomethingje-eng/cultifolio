/**
 * Round seventy, the owner's second run (on 70b): in the rebuild of 103, Pleiospilos simulans, Dorstenia conceptionis,
 * Avonia dinteri and Hibiscus acetosella lost their item, POWO, IPNI and WFO: "wikidata maxlag …; the previous identifiers
 * are not kept: the build that read them is not known". A lag is not an answer. The build now waits it out in rounds as
 * the fills do (the first lagged species of a spell; `lagSpell`), and when Wikidata still does not answer the previous
 * identifiers are kept, the record saying they come from an earlier build of a day not known. Each case FAILED on m70b
 * unless it says "guard".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { mwWait, MAXLAG_TRIES, lagSpell } from '$dossier/sources/wikimedia';
import { copiapoa } from '../../fixtures/upstream';

const lagged = { error: { code: 'maxlag', info: 'Waiting for wdqs1014: 8.0 seconds lagged.' } };
const prevIds = { gbif: 5384013, wikidata: 'Q5168360', inat: 135254, powo: 'urn:lsid:ipni.org:names:1', ipni: '1', wfo: 'wfo-1', wikipedia: 'Copiapoa cinerea' };
const opts = (fetcher: JsonFetcher, extra: Record<string, unknown> = {}) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-14T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'] as Array<'commons' | 'openalex' | 'wikipedia'>, ...extra });
/** Copiapoa cinerea's answers, with Wikidata lagged for its first `n` asks. */
function world(n: number, asked: string[] = []): JsonFetcher {
  const t = copiapoa() as Record<string, unknown>;
  t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
  const base = fixtureFetcher(t);
  let i = 0;
  return (async (url: string) => {
    if (url.startsWith('https://www.wikidata.org/')) { asked.push(url); if (i++ < n) return { status: 'ok', data: lagged }; }
    return base(url);
  }) as unknown as JsonFetcher;
}
const before = { sleep: mwWait.sleep, tries: mwWait.tries, patient: mwWait.patient };
const waited: number[] = [];
beforeEach(() => { waited.length = 0; mwWait.sleep = async (s: number) => { waited.push(s); }; });
afterEach(() => Object.assign(mwWait, before));

describe('the build waits Wikidata\'s lag out', () => {
  it('a corpus run\'s first lagged species waits in rounds, and finds its item', async () => {
    lagSpell(MAXLAG_TRIES);
    mwWait.tries = MAXLAG_TRIES;
    const r = await buildDossier('Copiapoa cinerea', opts(world(MAXLAG_TRIES + 3)));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream.wikidata.status).toBe('ok'); // m70b: error, after five asks
    expect(r.dossier.ids.wikidata).toBe('Q5168360');
    expect(waited).toContain(60);
  });
  it('after a species that stayed lagged through the rounds, the next asks as before: a spell is not waited out species by species', () => {
    const spell = lagSpell(MAXLAG_TRIES);
    spell.after({ status: 'error', detail: 'wikidata maxlag: Waiting for wdqs1014: 8.0 seconds lagged.' });
    expect(mwWait.patient).toBe(false);
    spell.after({ status: 'ok' });
    expect(mwWait.patient).toBe(true);
  });
});

describe('when Wikidata still does not answer, the identifiers stand', () => {
  it('Pleiospilos simulans\'s case: no day known, the identifiers are kept and the record says so', async () => {
    mwWait.tries = 1;
    const r = await buildDossier('Copiapoa cinerea', opts(world(Infinity), { prevIds }));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids).toMatchObject({ wikidata: 'Q5168360', ipni: '1', wfo: 'wfo-1' }); // m70b: all four dropped
    expect(r.dossier.links.wikidata).toBe('https://www.wikidata.org/wiki/Q5168360');
    expect(r.dossier.upstream.wikidata.detail).toMatch(/the identifiers of an earlier build, of a day not known, are kept since 2026-10-14$/); // r71: the day first kept (S-B9)
  });
  it('Conophytum tomasii\'s case, a day known within the limit, is as before (guard)', async () => {
    mwWait.tries = 1;
    const r = await buildDossier('Copiapoa cinerea', opts(world(Infinity), { prevIds, prevIdsOn: '2026-09-20' }));
    expect(r.ok && r.dossier.upstream.wikidata.detail).toMatch(/the identifiers of the build of 2026-09-20 are kept$/);
  });
});
