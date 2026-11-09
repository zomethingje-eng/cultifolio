/**
 * Round eighty-seven, the data agent: items 2 and 3. At round eighty-six's second stop, 1,315 of the 1,355 summaries
 * quoted under another title than the page's name showed no proof: an offline walk carried the summary and replaced its
 * record with "carried from build of …; this build: skipped", so the proof words `recordedProof` reads were lost, and a
 * summary the next build could not prove offline was not carried by the rule (round seventy-one, A5) but kept by the
 * re-derivation all the same. Every carried row now keeps what the build that asked said ("that build: …"), as the Wikidata
 * row does, and `unchain` keeps both clauses. And a walk carried papers: Conophytum calculus subsp. vanzylii listed seven
 * from September against /about/how's "No page lists papers"; literature is off on every path now.
 *
 * On r86 (db5a68d): the carried detail lost the proof (`recordedProof` null), `unchain` kept only the last clause, and
 * `carryRederivedRows` carried an OpenAlex row.
 */
import { describe, it, expect } from 'vitest';
import { unchain, askedDetail } from '$dossier/schema';
import { carriedRow, carriedDetail, carryRederivedRows, literatureOff, NEVER_CARRIED } from '$dossier/rederive';
import { recordedProof, recordedTitles } from '$dossier/summary-fill';
import { LITERATURE_OFF } from '$dossier/sources/openalex';

const PROOF = "Wikipedia's article Lithops lesliei, the English article of this species' Wikidata item (Q2601467)";
const REDIRECT = "Wikipedia redirects Aloiampelos ciliaris to Aloe ciliaris, an older name of this species (Aloe ciliaris)";

describe("a carried row keeps the asking build's words", () => {
  it('a re-derivation carries a summary as the Wikidata row is carried: "(rederive); that build: <its proof>"', () => {
    const row = { status: 'ok', at: '2026-10-22T10:00:00Z', detail: PROOF };
    const d = carriedRow(row, '2026-11-01T00:00:00Z');
    expect(d).toBe(`carried from build of 2026-10-22 (rederive); that build: ${PROOF}`);
    expect(recordedProof({ status: 'ok', detail: d })).toBe("the English article of this species' Wikidata item (Q2601467)"); // r86: null
    // Carried again by the next walk: the same words, never a chain.
    expect(carriedRow({ status: 'ok', at: '2026-11-01T00:00:00Z', detail: d }, '2026-11-08T00:00:00Z')).toBe(d);
  });
  it('a build that was refused says both builds\' words; the proof is still read', () => {
    const d = carriedDetail({ status: 'ok', at: '2026-10-22T10:00:00Z', detail: REDIRECT }, '2026-11-01', 'refused (HTTP 429)');
    expect(d).toBe(`carried from build of 2026-10-22; that build: ${REDIRECT}; this build: refused (HTTP 429)`);
    expect(recordedProof({ status: 'ok', detail: d })).toBe('an older name of this species (Aloe ciliaris)');
    expect(recordedTitles({ detail: d })).toEqual({ asked: 'Aloiampelos ciliaris', got: 'Aloe ciliaris', redirect: true });
    // Carried once more: the asking build's day and words stay, this build's are the latest.
    const again = carriedDetail({ status: 'ok', detail: d }, '2026-11-08', 'skipped');
    expect(again).toBe(`carried from build of 2026-10-22; that build: ${REDIRECT}; this build: skipped`);
  });
  it("the range's snapshot keeps the records' download and the range's source", () => {
    const occ = { status: 'ok', at: '2026-11-02T00:00:00Z', detail: 'GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21' };
    const d = carriedDetail(occ, '2026-11-02T00:00:00Z', 'gbif.occurrences ok, wcvp.distribution skipped', 'carried from build of 2026-11-02 as one snapshot');
    expect(d).toBe('carried from build of 2026-11-02 as one snapshot; that build: GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21; this build: gbif.occurrences ok, wcvp.distribution skipped');
    expect(askedDetail(d)).toBe(occ.detail);
  });
  it('a row a walk before round eighty-seven carried holds no words of the asking build: undefined, never invented', () => {
    expect(askedDetail('carried from build of 2026-10-22; this build: skipped')).toBeUndefined();
    expect(recordedProof({ status: 'ok', detail: 'carried from build of 2026-10-22; this build: skipped' })).toBeNull();
    expect(askedDetail(PROOF)).toBe(PROOF);
  });
});

describe('unchain keeps the reason that build gave and what this build got', () => {
  it('both clauses, after the deepest origin', () => {
    expect(unchain(`carried from build of 2026-10-22; that build: ${PROOF}; this build: skipped`)).toBe(`carried from build of 2026-10-22; that build: ${PROOF}; this build: skipped`); // r86: "…; this build: skipped"
    expect(unchain(`carried from build of 2026-11-01 (rederive); that build: carried from build of 2026-10-22; that build: ${PROOF}; this build: skipped`)).toBe(`carried from build of 2026-10-22; that build: ${PROOF}; this build: skipped`);
  });
  it("round thirty-seven's cases stand", () => {
    const nine = 'carried from build of 2026-09-30 (rederive); that build: carried from build of 2026-09-29 (rederive); that build: carried from build of 2026-09-28 (rederive); that build: carried from build of 2026-09-20; this build: refused 429';
    expect(unchain(nine)).toBe('carried from build of 2026-09-20; this build: refused 429');
    expect(unchain('carried from build of 2026-09-30 (rederive); that build: OpenAlex 429')).toBe('carried from build of 2026-09-30 (rederive); that build: OpenAlex 429');
    expect(unchain('carried from build of 2026-09-20')).toBe('carried from build of 2026-09-20');
  });
});

describe('literature is off on every path, offline included (item 3)', () => {
  it("a re-derivation carries no OpenAlex row and no paper (Conophytum calculus subsp. vanzylii's seven)", () => {
    const prev = { upstream: { openalex: { status: 'ok', at: '2026-09-12T00:00:00Z', detail: '7 works' }, wikidata: { status: 'ok', at: '2026-10-22T00:00:00Z', detail: 'Q1' } } };
    const d = { upstream: { openalex: { status: 'skipped', at: '2026-11-08T00:00:00Z', detail: LITERATURE_OFF }, wikidata: { status: 'skipped', at: '2026-11-08T00:00:00Z' } } as Record<string, { status: string; at?: string; detail?: string }>, photos: [], literature: [{ title: 'A paper' }] as unknown[] };
    carryRederivedRows(prev, d, (u) => carriedRow(u, '2026-10-22'));
    expect(NEVER_CARRIED.has('openalex')).toBe(true);
    expect(d.upstream.openalex).toEqual({ status: 'skipped', at: '2026-11-08T00:00:00Z', detail: LITERATURE_OFF }); // r86: the September row
    expect(d.upstream.wikidata.detail).toBe('carried from build of 2026-10-22 (rederive); that build: Q1');
    literatureOff(d, '2026-11-08T00:00:00Z');
    expect(d.literature).toEqual([]);
    expect(d.upstream.openalex.detail).toBe(LITERATURE_OFF);
  });
});
