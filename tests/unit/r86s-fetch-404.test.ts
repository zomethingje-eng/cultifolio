/**
 * Round eighty-six, the sources agent: the plan's A11 (`src/lib/dossier/fetch.ts:174`). The fetch layer read every 404 as
 * "none" unless a caller said `noneOn404: false`, and no caller did: a 404 from MediaWiki's API, Wikidata's query service,
 * iNaturalist's observation search or GBIF's occurrence search, which says the address has moved or failed and nothing
 * about the plant, was recorded as "nothing to report" (rule 2). Now a 404 is "none" only where the caller says it means
 * "no such record" (`BY_ID`): a GBIF usage, its synonyms, names or range, or an occurrence, by its key; an iNaturalist taxon
 * by its id; an IPNI record by its id; a Wikipedia article by its title. Every other 404 is an error, "did not answer".
 *
 * Each caller was read (the report lists them); the tests drive the fetch layer with a server that answers 404, through
 * the sources' own functions.
 *
 * On r86base (9cf3077): "a 404 from a search or an API is an error" FAILED (MediaWiki's API, iNaturalist's observation
 * search and GBIF's occurrence search each read `{ status: 'none' }`), and so did the credits fill's case (an iNaturalist
 * 404 read as an empty answer, `new Map()`, not as unanswered); `BY_ID` did not exist, so the third failed at its last line; its
 * "no such record" cases passed on the base too (guards).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fetchMod from '$dossier/fetch';
import { makeFetcher, resetPacing } from '$dossier/fetch';
import * as gbif from '$dossier/sources/gbif';
import { checkIds } from '$dossier/sources/inat';
import { readObservations, readFiles } from '$dossier/photo-read';

/** A server that answers 404 to every request, and records what was asked. */
function server404() {
  const asked: string[] = [];
  const impl = (async (url: string | URL | Request) => { asked.push(String(url)); return new Response('{"message":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  return { f: makeFetcher(impl), asked };
}

beforeEach(() => resetPacing());

describe('A11: a 404 is "none" only where it means "no such record"', () => {
  it('a 404 from a search or an API is an error, said "did not answer", never none', async () => {
    const { f } = server404();
    expect(await f('https://en.wikipedia.org/w/api.php?action=query&format=json&titles=Aloe%20vera')).toEqual({ status: 'error', detail: 'en.wikipedia.org 404' });
    expect(await f('https://api.inaturalist.org/v1/observations?taxon_id=1&per_page=1')).toEqual({ status: 'error', detail: 'api.inaturalist.org 404' });
    expect(await f('https://api.gbif.org/v1/occurrence/search?taxonKey=1&hasCoordinate=true')).toEqual({ status: 'error', detail: 'api.gbif.org 404' });
    expect(await f('https://query.wikidata.org/sparql?format=json&query=x')).toEqual({ status: 'error', detail: 'query.wikidata.org 404' });
  }, 20_000);

  it('the credits fill reads an iNaturalist 404 as unanswered (null), never as an answer that holds nothing', async () => {
    const { f } = server404();
    expect(await readObservations(f, ['12345'])).toBeNull();
    expect(await readFiles(f, ['File:Aloe vera.jpg'])).toBeNull();
  }, 20_000);

  it('a GBIF usage, an occurrence and an iNaturalist taxon by key: the 404 is "no such record" (guard)', async () => {
    const { f, asked } = server404();
    expect(await gbif.species(f, 99999999)).toEqual({ status: 'none' });
    expect(await gbif.occurrence(f, 1)).toEqual({ status: 'none' });
    expect((await gbif.vernacular(f, 99999999)).status).toBe('none');
    const ids = await checkIds(f, [424242]);
    expect(ids.status === 'ok' && ids.data.get(424242)).toEqual({ active: false });
    expect(asked).toHaveLength(4);
    // What says so: the one option the callers pass.
    expect((fetchMod as { BY_ID?: unknown }).BY_ID).toEqual({ noneOn404: true });
  }, 20_000);
});
