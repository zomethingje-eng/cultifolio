/**
 * Round eighty-seven, the review of the pipeline's changes (M2 and M3), the data fix.
 *
 * M3: `unchain`, `carriedRow` and `carriedDetail` split a carried row at every "; that build: ", so a row whose own words
 * held one ("words; that build: inner; more") lost what came before it the next time it was carried. A carried row is now
 * read as the builder writes it (`carriedParts`): the build that asked, then its words from the first "; that build: " to
 * the last "; this build: ", then what this build got. The rows of older rounds read as before.
 *
 * M2: a carried taxon's gbif.species and gbif.synonyms rows named the previous build's day ("carried from build of <the
 * day of the dossier on disk> …") before words that were the original online build's, when the build before had carried
 * them itself. They now name the build whose words they are, as `carriedDetail` does.
 *
 * On r87s1 (381aea9): the first two `it`s and the build's FAILED ("…; that build: inner; more"; "carried from build of
 * 2026-11-01 (offline re-derivation; …); that build: <the 2026-10-12 build's words>").
 */
import { describe, it, expect } from 'vitest';
import { unchain, askedDetail, carriedParts } from '$dossier/schema';
import { carriedRow, carriedDetail } from '$dossier/rederive';
import { recordedProof } from '$dossier/summary-fill';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const OWN = 'words; that build: inner; more';
const PROOF = "Wikipedia's article Mentha longifolia, the English article of this species' Wikidata item (Q123)";

describe('M3: the asking build\'s words are read whole', () => {
  it('a row whose own words hold "; that build: " keeps them through every carry', () => {
    const once = carriedRow({ status: 'ok', at: '2026-10-01T00:00:00Z', detail: OWN }, '2026-10-05T00:00:00Z');
    expect(once).toBe(`carried from build of 2026-10-01 (rederive); that build: ${OWN}`);
    expect(askedDetail(once)).toBe(OWN); // r87s1: "inner; more"
    const again = carriedRow({ status: 'ok', detail: once }, '2026-11-01T00:00:00Z');
    expect(again).toBe(once); // r87s1: "…; that build: inner; more"
    const refused = carriedDetail({ status: 'ok', detail: again }, '2026-11-08', 'refused (429)');
    expect(refused).toBe(`carried from build of 2026-10-01 (rederive); that build: ${OWN}; this build: refused (429)`);
    expect(askedDetail(refused)).toBe(OWN);
    expect(carriedParts(refused)).toEqual({ origin: 'carried from build of 2026-10-01 (rederive)', that: OWN, now: 'refused (429)' });
  });
  it('forty carries, alternating the two, stay bounded and keep the words', () => {
    for (const start of [OWN, PROOF]) {
      let u = { status: 'ok', at: '2026-10-01T00:00:00Z', detail: start };
      for (let i = 0; i < 40; i++) u = { ...u, detail: i % 3 === 0 ? carriedRow(u, '2026-11-02T00:00:00Z') : carriedDetail(u, '2026-11-02', i % 2 ? 'refused (429)' : 'skipped (not asked: offline)') };
      expect(askedDetail(u.detail)).toBe(start);
      expect(u.detail.length).toBeLessThan(start.length + 120);
    }
    expect(recordedProof({ status: 'ok', detail: carriedDetail({ status: 'ok', detail: PROOF, at: '2026-10-01T00:00:00Z' }, '2026-11-01', 'skipped') })).toBe("the English article of this species' Wikidata item (Q123)");
  });
  it('the rows of older rounds are read as before', () => {
    const nine = 'carried from build of 2026-09-30 (rederive); that build: carried from build of 2026-09-29 (rederive); that build: carried from build of 2026-09-28 (rederive); that build: carried from build of 2026-09-20; this build: refused 429';
    expect(unchain(nine)).toBe('carried from build of 2026-09-20; this build: refused 429');
    expect(unchain('carried from build of 2026-09-29 (rederive); that build: carried from build of 2026-09-01; that build: refused (429)')).toBe('carried from build of 2026-09-01; that build: refused (429)');
    expect(unchain('carried from build of 2026-10-22; this build: skipped')).toBe('carried from build of 2026-10-22; this build: skipped');
    expect(askedDetail('carried from build of 2026-10-22; this build: skipped')).toBeUndefined();
    // iNaturalist's carried rows (`carryInatRows`) and the backbone's origin, whose brackets hold a semicolon.
    expect(carriedParts('carried from build of 2026-10-01 (that build: 12 photographs); this build: skipped')).toEqual({ origin: 'carried from build of 2026-10-01 (that build: 12 photographs)', now: 'skipped' });
    expect(carriedParts('carried from build of 2026-10-12 (offline re-derivation; the backbone was not asked); that build: Kew cites it')).toEqual({ origin: 'carried from build of 2026-10-12 (offline re-derivation; the backbone was not asked)', that: 'Kew cites it' });
    expect(carriedParts('carried from build of 2026-11-02 as one snapshot; that build: GBIF occurrence download; this build: x')).toEqual({ origin: 'carried from build of 2026-11-02 as one snapshot', that: 'GBIF occurrence download', now: 'x' });
    expect(carriedParts('timed out')).toBeUndefined();
  });
});

describe('M2: a carried taxon\'s rows name the build whose words they are', () => {
  it('rows the build before carried keep their origin; rows it asked name it', async () => {
    const first = await buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(copiapoa()), builtBy: 'node', quick: true });
    if (!first.ok) throw new Error(first.reason);
    const prev = first.dossier;
    const table = copiapoa();
    for (const k of Object.keys(table)) if (/\/species\/\d+$|\/species\/\d+\/(synonyms|vernacularNames)|species\/match/.test(k)) table[k] = { __status: 'refused', status: 'refused', detail: 'offline' };
    // The build before (2026-11-01) was itself offline: its rows say the build of 2026-10-12 asked, and what it said.
    const species = { status: 'ok' as const, at: '2026-11-01T00:00:00Z', detail: 'carried from build of 2026-10-12 (offline re-derivation; the backbone was not asked); that build: names Kew\'s author' };
    const synonyms = { status: 'ok' as const, at: '2026-11-01T00:00:00Z', detail: 'carried from build of 2026-10-12 (offline re-derivation; the backbone was not asked); that build: truncated: the first 50 only' };
    const r = await buildDossier(prev.ids.gbif!, { fetcher: fixtureFetcher(table), builtBy: 'node', quick: true, taxon: { key: prev.ids.gbif!, name: prev.name, builtOn: '2026-11-01T00:00:00Z', species, synonyms } });
    if (!r.ok) throw new Error(r.reason);
    expect(r.dossier.upstream['gbif.species'].detail).toBe(species.detail); // r87s1: "carried from build of 2026-11-01 (…); that build: names Kew's author"
    expect(r.dossier.upstream['gbif.synonyms'].detail).toBe(synonyms.detail);
    // A row the build before asked itself: that build is named.
    const asked = await buildDossier(prev.ids.gbif!, { fetcher: fixtureFetcher(table), builtBy: 'node', quick: true, taxon: { key: prev.ids.gbif!, name: prev.name, builtOn: '2026-11-01T00:00:00Z', species: { status: 'ok', at: '2026-11-01T00:00:00Z', detail: 'names Kew\'s author' } } });
    if (!asked.ok) throw new Error(asked.reason);
    expect(asked.dossier.upstream['gbif.species'].detail).toBe('carried from build of 2026-11-01 (offline re-derivation; the backbone was not asked); that build: names Kew\'s author');
    expect(asked.dossier.upstream['gbif.synonyms'].detail).toBe('carried from build of 2026-11-01 (offline re-derivation; the backbone was not asked)');
  });
});
