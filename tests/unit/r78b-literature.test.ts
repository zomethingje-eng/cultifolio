/**
 * Round seventy-eight, agent B: literature off (the owner's decision 2). The build asks OpenAlex nothing; a page built
 * now records its papers as not asked, with why, and is never "none"; a previous build's papers are not carried into it;
 * a re-derivation, which asks nothing, carries what the page held, and the page still reads it as literature off; the
 * species page and the about page say it in one plain sentence. Each case FAILED on r78base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { carryRederivedRows } from '$dossier/rederive';
import * as openalex from '$dossier/sources/openalex';
import { welwitschia } from '../../fixtures/upstream';

const OFF = "not yet asked for this reference; a later fill takes the papers from OpenAlex's snapshot";
const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, now: () => new Date('2026-10-19T12:00:00Z') });

describe('the build asks OpenAlex nothing', () => {
  it('no request reaches api.openalex.org, and the record says why, as not asked, never none', async () => {
    const asked: string[] = [];
    const inner = fixtureFetcher(welwitschia());
    const f = (async (url: string, o?: Parameters<JsonFetcher>[1]) => { asked.push(url); return inner(url, o); }) as JsonFetcher;
    const r = await buildDossier('Welwitschia', opts(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(asked.filter((u) => u.includes('openalex'))).toEqual([]); // base: one search
    expect(r.dossier.upstream.openalex).toEqual({ status: 'skipped', at: '2026-10-19T12:00:00.000Z', detail: OFF }); // base: ok, with the fixture's paper
    expect(r.dossier.literature).toEqual([]);
    // guard: the fixture still answers the rest
    expect(r.dossier.summary?.source).toBe('wikipedia');
  });
  it('the words are one constant, read by the page', () => {
    expect((openalex as Record<string, unknown>).LITERATURE_OFF).toBe(OFF); // base: undefined
    const off = (openalex as unknown as { literatureOff: (u?: { status?: string; detail?: string }) => boolean }).literatureOff;
    expect(off({ status: 'skipped', detail: OFF })).toBe(true);
    // A re-derivation carries the row with the build that wrote it named first: still literature off.
    const prev = { upstream: { openalex: { status: 'skipped', at: '2026-10-19T12:00:00Z', detail: OFF } } };
    const d = { upstream: { openalex: { status: 'skipped', at: '2026-10-20T12:00:00Z', detail: OFF } } as Record<string, { status: string; at?: string; detail?: string }>, photos: [] };
    carryRederivedRows(prev, d, (u) => `carried from build of 2026-10-19 (rederive); that build: ${u.detail}`);
    expect(off(d.upstream.openalex)).toBe(true);
    // guard: a source that did not answer, or a plain skip, is not literature off
    expect(off({ status: 'skipped' })).toBe(false);
    expect(off({ status: 'refused', detail: 'api.openalex.org 429' })).toBe(false);
    expect(off({ status: 'ok' })).toBe(false);
  });
});

describe('a page built now: not checked, with why, in one sentence', () => {
  const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
  // Round eighty-two (the independent review's 23): no Papers section or tab while nothing is asked; the record of
  // sources says "not asked" with why (r82u-pages.spec.ts).
  it('the species page draws no Papers section while papers are not asked', () => {
    expect(page).toContain("const litOff = $derived(literatureOff(d.upstream['openalex']));");
    expect(page).toContain("{#if refused('openalex') && !papers.length && !litOff}");
    expect(page).not.toContain('Papers are not yet asked for this reference');
  });
  it('the builder no longer carries a previous build\'s papers into a page built now', () => {
    const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(script).not.toMatch(/carry\('openalex'/); // base: carried as for a refusal
    expect(script).not.toMatch(/await literature\(/); // base: --fill openalex asked OpenAlex once a species
  });
  it('the about page says the same, and no longer that literature is carried', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain("papers are not yet asked for this reference, and a later fill takes them from OpenAlex's free snapshot"); // base: "Recent literature comes from OpenAlex."
    expect(how).not.toContain('What is carried is exact: literature,');
  });
});
