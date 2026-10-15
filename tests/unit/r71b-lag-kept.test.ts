/**
 * Round 71, B (self-review 70 S-B9, S-B10): identifiers kept "of a day not known" (70c) were invisible to the audit and
 * to --list-rebuild, and were kept again by every lagged build, past the 90 days; a row carried by a re-derivation named
 * the carrying build's day, one to three days after the read (214 of 214 sampled live Wikidata rows), and `idsReadOn` read
 * that later day. Each case FAILED on r71base unless it says "guard".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { keptIds } from '$dossier/drops';
import { rebuildList } from '$dossier/corpus-fills';
import { idsReadOn, prevIdsFor } from '$dossier/corpus-run';
import { carriedOrigin } from '$dossier/rederive';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { mwWait } from '$dossier/sources/wikimedia';
import { copiapoa } from '../../fixtures/upstream';

const row = { status: 'error', at: '2026-10-14T10:00:00Z', detail: 'wikidata maxlag; the identifiers of an earlier build, of a day not known, are kept' };
const d = { key: 3706589, name: { scientific: 'Pleiospilos simulans', synonyms: [] }, distribution: { source: 'WCVP' }, ids: { wikidata: 'Q1', powo: 'urn:lsid:ipni.org:names:1-1' }, upstream: { wikidata: row }, built: '2026-10-14T10:00:00Z' };

describe('identifiers kept of a day not known', () => {
  it('are kept identifiers to the audit', () => expect(keptIds(row as never)).toBe(true));
  it('are listed by --list-rebuild, as identifiers kept from a build the record does not name', () => {
    const store = { files: () => ['3706589.json'], read: <T,>() => structuredClone(d) as T, write: () => {} };
    expect(rebuildList(store)).toEqual([expect.stringMatching(/^3706589 Pleiospilos simulans\t.*identifiers kept/)]);
  });
  it('are dated from the build that first kept them, and said to be of a day not known', () => {
    expect(prevIdsFor(d as never)).toMatchObject({ prevIdsOn: '2026-10-14', prevIdsDayUnknown: true }); // r71base: prevIdsOn undefined
    const later = { ...d, upstream: { wikidata: { ...row, detail: 'wikidata maxlag; the identifiers of an earlier build, of a day not known, are kept since 2026-06-01' } } };
    expect(prevIdsFor(later as never)).toMatchObject({ prevIdsOn: '2026-06-01', prevIdsDayUnknown: true });
  });
  it('a dated keep is read as before (guard)', () => {
    const dated = { ...d, upstream: { wikidata: { ...row, detail: 'wikidata maxlag; the identifiers of the build of 2026-10-01 are kept' } } };
    expect(prevIdsFor(dated as never)).toEqual({ prevIds: d.ids, prevIdsOn: '2026-10-01' });
  });
});

describe('a lagged build', () => {
  const lagged = { error: { code: 'maxlag', info: 'Waiting for wdqs1014: 8.0 seconds lagged.' } };
  const prevIds = { gbif: 5384013, wikidata: 'Q5168360', inat: 135254, powo: 'urn:lsid:ipni.org:names:1', ipni: '1', wfo: 'wfo-1', wikipedia: 'Copiapoa cinerea' };
  function world(): JsonFetcher {
    const t = copiapoa() as Record<string, unknown>;
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    const base = fixtureFetcher(t);
    return (async (url: string) => (url.startsWith('https://www.wikidata.org/') ? { status: 'ok', data: lagged } : base(url))) as unknown as JsonFetcher;
  }
  const opts = (extra: Record<string, unknown>) => ({ fetcher: world(), builtBy: 'node' as const, now: () => new Date('2026-10-14T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'] as Array<'commons' | 'openalex' | 'wikipedia'>, ...extra });
  const before = { sleep: mwWait.sleep, tries: mwWait.tries, patient: mwWait.patient };
  beforeEach(() => { mwWait.sleep = async () => {}; mwWait.tries = 1; });
  afterEach(() => Object.assign(mwWait, before));
  it('does not keep identifiers of a day not known kept since more than 90 days back', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts({ prevIds, prevIdsOn: '2026-06-01', prevIdsDayUnknown: true }));
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.wikidata).toBeUndefined(); // r71base: kept, "of the build of 2026-06-01"
    expect(r.dossier.upstream.wikidata.detail).toMatch(/not kept: kept since 2026-06-01, of a day not known, more than 90 days ago/);
  });
  it('keeps them within the 90 days, still of a day not known', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts({ prevIds, prevIdsOn: '2026-09-01', prevIdsDayUnknown: true }));
    expect(r.ok && r.dossier.upstream.wikidata.detail).toMatch(/of a day not known, are kept since 2026-09-01$/);
  });
});

describe('the day a carried row names', () => {
  it('is the read, not the re-derivation that carried it', () => {
    expect(carriedOrigin({ at: '2026-09-18T02:05:44Z' }, '2026-09-19T11:00:00Z', ' (rederive)')).toBe('carried from build of 2026-09-18 (rederive)');
    expect(carriedOrigin({}, '2026-09-19T11:00:00Z')).toBe('carried from build of 2026-09-19'); // guard: no time, the build
  });
  it('idsReadOn takes the earlier of the row\'s time and the day its note names (Lilium lancifolium, live)', () => {
    const lily = { ids: { wikidata: 'Q266317' }, built: '2026-10-09T18:32:42Z', upstream: { wikidata: { status: 'ok', at: '2026-09-18T02:05:44.455Z', detail: 'carried from build of 2026-09-19 (rederive)' } } };
    expect(idsReadOn(lily as never)).toBe('2026-09-18'); // r71base: 2026-09-19
  });
});
