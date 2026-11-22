/**
 * Round sixty-two, second pass, agent W: the words review's findings on the species page, the front page and the about
 * pages; a refusal said as one (the grower review's 2); the front page's search sentences (the search review's 3 and 18);
 * the phone chart's labels (V22) and the glance gauges' scales (the self-review's N10); the lapse sentence (the outside
 * triage's 3). Each test here failed on the second pass's base, apart from the ones marked as guards.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { climograph, type ClimoInput } from '$climate/climograph';
import { cultivationSheet } from '$core/sheet';
import { readDate } from '$lib/import/csv';
import { creditParts, photoCredit, detailSentence, OG_ALT } from '$lib/ui/ref/head';
import { notAnswered, climateDetail, UPSTREAM_WORD, UPSTREAM_NAME } from '$lib/ui/ref/upstream';
import { searchedSentence, leftOut } from '$lib/ui/ref/searched';

/** A source file without its comments, which quote old words as history. */
const code = (f: string) => readFileSync(f, 'utf8').replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');
const species = code('src/routes/species/[slug]/+page.svelte');
const home = code('src/routes/+page.svelte');

describe('a refusal is said as one on the species page (the grower review\'s 2, rule 2)', () => {
  it('each status in its own words', () => {
    expect(notAnswered('refused')).toBe('refused the request');
    expect(notAnswered('error')).toBe('did not answer');
    expect(notAnswered(undefined)).toBe('did not answer');
    expect(notAnswered('skipped')).toBe('was not asked');
    expect(UPSTREAM_WORD.refused).toBe('refused');
    expect(UPSTREAM_WORD.error).toBe('failed');
    expect(UPSTREAM_WORD.skipped).toBe('not asked');
  });
  it("an old dossier's climate reason is read by its source's own row", () => {
    const up = (st: string) => ({ 'gbif.occurrences': { status: st }, 'wcvp.distribution': { status: 'refused' } });
    expect(climateDetail('occurrence source did not answer', up('refused'))).toBe('occurrence source refused the request');
    expect(climateDetail('occurrence source did not answer', up('error'))).toBe('occurrence source did not answer');
    expect(climateDetail('distribution source did not answer, so the range could not be verified', up('ok'))).toBe('distribution source refused the request, so the range could not be verified');
    expect(climateDetail('no georeferenced record inside the range', up('refused'))).toBe('no georeferenced record inside the range');
    expect(detailSentence(climateDetail('occurrence source did not answer', up('refused')), 'x')).toBe('The occurrence source refused the request when this page was built.');
  });
  it('the build writes a refusal as a refusal', () => {
    const b = code('src/lib/dossier/build.ts');
    expect(b).toContain("`the occurrence source ${occ.status === 'refused' ? 'refused the request' : 'did not answer'} when this page was built`"); // a full clause since round sixty-three
    expect(b).not.toContain("detail: 'occurrence source did not answer'");
  });
  it('the species page and Provenance use these words, and name each source in plain words', () => {
    expect(species).not.toContain("'The occurrence source did not answer when this species page was built.");
    expect(species).toContain('The occurrence source ${notAnswered(up)} when this species page was built.');
    expect(species).toContain('sentence(climDetail,');
    expect(code('src/lib/ui/Provenance.svelte')).toContain("UPSTREAM_WORD as label");
    expect(UPSTREAM_NAME['gbif.occurrences']).toBe('GBIF occurrence records');
    expect(UPSTREAM_NAME['climate.extremes']).toMatch(/NASA POWER/);
  });
  it('Wikipedia and OpenAlex skipped by a build are "not asked", not "did not answer"', () => {
    expect(species).not.toContain('Wikipedia did not answer when this page was built');
    expect(species).not.toContain('OpenAlex did not answer when this page was built');
    // And what is said instead, whole (round sixty-seven; triage-66 P4, R45-13: an absence alone passed with the line gone).
    expect(species).toContain("<b>{d.upstream['wikipedia']?.status === 'skipped' ? 'Not asked.' : 'Not checked.'}</b> Wikipedia {notAnswered(d.upstream['wikipedia']?.status)} when this page was built. Not a statement that it has no article.");
    expect(species).toContain("<b>{d.upstream['openalex']?.status === 'skipped' ? 'Not asked.' : 'Not checked.'}</b> OpenAlex {notAnswered(d.upstream['openalex']?.status)} when this page was built. Not a statement that no paper names this species.");
    expect([notAnswered('skipped'), notAnswered('refused'), notAnswered('error')]).toEqual(['was not asked', 'refused the request', 'did not answer']);
  });
});

describe('the front page\'s search sentences (the search review\'s 3 and 18)', () => {
  const hit = [{ name: 'Copiapoa cinerea', family: 'Cactaceae' }];
  it('a name with its author matched: the author is said as left out, never "nothing matched"', () => {
    const s = searchedSentence('Copiapoa cinerea Phil.', { relaxed: { query: 'Copiapoa cinerea' } }, hit);
    expect(s).toBe('Searched for “Copiapoa cinerea”, leaving out “Phil.”.');
  });
  it('the retry on fewer words, when nothing matched as written, says so', () => {
    expect(searchedSentence('Copiapoa cinerea var. nonexista', { relaxed: { query: 'Copiapoa cinerea' } }, hit)).toBe('Nothing matched “Copiapoa cinerea var. nonexista” as written. Showing results for “Copiapoa cinerea”.');
    // An answer that marks the retry itself is taken at its word, either way.
    expect(searchedSentence('Copiapoa cinerea Phil.', { relaxed: { query: 'Copiapoa cinerea', retry: true } }, hit)).toMatch(/^Nothing matched/);
    expect(searchedSentence('Copiapoa cinerea var. nonexista', { relaxed: { query: 'Copiapoa cinerea', retry: false } }, hit)).toBe('Searched for “Copiapoa cinerea”, leaving out “var. nonexista”.');
  });
  it("an answer that names the words its reading left out (Q's `relaxed.left`) is that reading, in the server's words", () => {
    expect(searchedSentence('Copiapoa cinerea Phil.', { relaxed: { query: 'Copiapoa cinerea', left: 'Phil.' } }, [])).toBe('Searched for “Copiapoa cinerea”, leaving out “Phil.”.');
    expect(searchedSentence('Echeveria Lola', { relaxed: { query: 'Echeveria' } }, [{ name: 'Echeveria elegans', family: 'Crassulaceae' }])).toBe('Nothing matched “Echeveria Lola” as written. Showing results for “Echeveria”.');
  });
  it('a similar spelling is said as one, alone or after a relaxing', () => {
    expect(searchedSentence('Copiapoa cinereaa', { near: true }, hit)).toBe('No name in the reference is spelt “Copiapoa cinereaa”; these are similar spellings.');
    expect(searchedSentence('Copiapoa cinereaa Phil.', { relaxed: { query: 'Copiapoa cinereaa', retry: false }, near: true }, hit)).toBe('Searched for “Copiapoa cinereaa”, leaving out “Phil.”; no name is spelt that way, so these are similar spellings.');
  });
  it('an answer to the words as typed says nothing', () => {
    expect(searchedSentence('Copiapoa cinerea', [] as never, hit)).toBeNull();
    expect(searchedSentence('Copiapoa', { relaxed: null }, hit)).toBeNull();
  });
  it('the words left out are the typed ones the search did not use, in order', () => {
    expect(leftOut("Echeveria 'Perle von Nurnberg'", 'Echeveria')).toBe("'Perle von Nurnberg'");
    expect(leftOut('Mammillaria bombycina SB 1234', 'Mammillaria bombycina')).toBe('SB 1234');
  });
  it('the page draws the sentence from the answer, not "Nothing matched" for every relaxing', () => {
    expect(home).toContain('searchedSentence(q, relaxedFor, found)');
    expect(home).not.toContain('Nothing matched “{q.trim()}” as written.');
  });
});

describe('the phone chart\'s labels do not touch (V22, the self-review\'s N10)', () => {
  const s = (i: number) => Math.cos((i / 12) * 2 * Math.PI);
  const m = (i: number, d = 0) => ({ tmax: 22 + 4 * s(i) + d, tmin: 12 + 3 * s(i) + d, precipMm: 1, dli: 30, rh: 78 });
  const c: ClimoInput = { months: Array.from({ length: 12 }, (_, i) => m(i)), p10: Array.from({ length: 12 }, (_, i) => m(i, -2)), p90: Array.from({ length: 12 }, (_, i) => m(i, 2)), cells: 9, extremes: { minAbs: 3.4, maxP99: 31.2, years: 40 } };
  const box = (x0: number, x1: number, y: number) => ({ x0, x1, top: y - 10, bottom: y + 3 });
  const meet = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && b.x0 < a.x1 && a.top < b.bottom && b.top < a.bottom;
  for (const width of [350, 370, 720]) {
    it(`at ${width} px, "cold quarter" is clear of the record low's and the 99th-percentile day's labels`, () => {
      const g = climograph(c, width);
      const edge = g.left + g.plotW - 14;
      const q = box(g.temp.quarterLabel.x, g.temp.quarterLabel.x + 92, g.temp.quarterLabel.y);
      for (const e of [g.temp.minAbs!, g.temp.maxP99!]) expect(meet(q, box(edge - e.label.length * 6.2, edge, e.y + 3.5)), e.label).toBe(false);
      expect(q.x1).toBeLessThanOrEqual(g.left + g.plotW);
    });
  }
  it('at a phone width the label moves off the foot of the panel, where the record low sits', () => {
    const g = climograph(c, 350);
    expect(g.temp.quarterLabel.y).toBeLessThan(g.temp.top + g.temp.height - 5);
  });
  it('the chart is said in the labels\' words', () => {
    const g = climograph(c, 720);
    expect(g.alt).toMatch(/^Mean daily high from .*; mean nightly low from /);
    expect(g.alt).toContain("the three months around the coldest month's mean nightly low");
    expect(code('src/lib/ui/Climograph.svelte')).toContain("cold quarter: the three months around the coldest month's mean nightly low");
  });
});

describe('the glance row (the words review\'s 1, the self-review\'s N10)', () => {
  // Round 107's tidy: the glance row (Glance.svelte), drawn by no page since round 106, is gone with its two source tests.
  it("the year's rain is said as the twelve medians added, before \"Medians\" (the words review's 5b)", async () => {
    const { render } = await import('svelte/server');
    const { default: Climograph } = await import('$lib/ui/Climograph.svelte');
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22, tmin: 9 + (i % 3), precipMm: 1 }));
    const body = render(Climograph, { props: { climate: { months, p10: months, p90: months, cells: 1 } as never } }).body;
    expect(/<desc[^>]*>([^<]*)<\/desc>/.exec(body)![1]).toContain('of rain in the median year (the twelve monthly medians added). Medians across the range'); // round sixty-seven (N11)
  });
});

