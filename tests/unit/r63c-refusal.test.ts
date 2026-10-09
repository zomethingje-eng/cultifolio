/**
 * Round sixty-three, C4 (REVIEW-ROUND-61 section 9; review-60 visitor-words 16): the dossier builder writes a refused
 * climate's reason as a full clause, with its article and its time, and the page still reads the bare form of a
 * dossier built before.
 */
import { describe, it, expect } from 'vitest';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { detailSentence } from '$lib/ui/ref/head';
import { climateDetail } from '$lib/ui/ref/upstream';
import { refused, copiapoa } from '../../fixtures/upstream';

const opts = (table: Record<string, unknown>) => ({ fetcher: fixtureFetcher(table), builtBy: 'node' as const, now: () => new Date('2026-10-09T12:00:00Z') });
const detailOf = (c: { status: string; detail?: string }) => ('detail' in c ? c.detail : undefined);

describe("the builder's refusal details are full clauses", () => {
  it('a refused occurrence search: "the occurrence source refused the request when this page was built"', async () => {
    const r = await buildDossier('Refusia testii', opts(refused()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.climate.status).toBe('refused');
    const d = detailOf(r.dossier.climate);
    expect(d).toBe('the occurrence source refused the request when this page was built'); // base: "occurrence source refused the request"
    expect(r.dossier.upstream.climate.detail).toBe(d);
    // the page's sentence is the clause as written, capitalised and stopped, nothing added twice
    expect(detailSentence(climateDetail(d, r.dossier.upstream), 'x')).toBe('The occurrence source refused the request when this page was built.');
  });
  it('a failed distribution: "the distribution source did not answer when this page was built, so …"', async () => {
    const table = copiapoa() as Record<string, unknown>;
    for (const k of Object.keys(table)) if (/\/species\/\d+\/distributions$/.test(k)) table[k] = { __status: 'error', status: 'error', detail: '502' };
    const r = await buildDossier('Copiapoa cinerea', opts(table));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = detailOf(r.dossier.climate);
    expect(d).toBe('the distribution source did not answer when this page was built, so the range could not be verified');
    expect(detailSentence(d, 'x')).toBe('The distribution source did not answer when this page was built, so the range could not be verified.');
  });
  it("a dossier built before still reads the same: the bare form is given its article and time, and read by its source's row", () => {
    const up = { 'gbif.occurrences': { status: 'refused' } };
    expect(detailSentence(climateDetail('occurrence source did not answer', up), 'x')).toBe('The occurrence source refused the request when this page was built.');
    expect(detailSentence('occurrence source did not answer', 'x')).toBe('The occurrence source did not answer when this page was built.');
  });
});
