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
  const g = code('src/lib/ui/ref/Glance.svelte');
  it('is headed "Habitat figures"', () => {
    expect(g).toMatch(/<span class="gt">Habitat figures<\/span>/);
  });
  it('states each gauge\'s scale, beside it and in its text alternative', () => {
    expect(g).toContain('const RAIN_FULL = 1200;');
    expect(g).toContain('const DLI_FULL = 70;');
    expect(g).not.toMatch(/class="gauge" aria-hidden="true"/);
    expect(g.match(/class="gauge" role="img" aria-label="[^"]*on a bar from 0 to/g)).toHaveLength(2);
    expect(g.match(/class="gscale"/g)).toHaveLength(2);
    expect(how).toContain('full at 1,200 mm a year, and at 70 DLI for the brightest month');
  });
});

describe('the lapse sentence (the outside triage\'s 3, A3)', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22 + 4 * Math.cos((i / 12) * 2 * Math.PI), tmin: 12 + 3 * Math.cos((i / 12) * 2 * Math.PI), tmean: 17, precipMm: 2, dli: 30, rh: 78 }));
  const why = (lapseAppliedM: number | undefined) => cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months, lat: -25, extremes: { years: 40, minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, lapseAppliedM }, extremesStatus: 'ok' }).rows.find((r) => r.k === 'Temperature')!.why;
  it('a 0 is said as either, a correction by its size', () => {
    expect(why(0)).toContain('with a lapse correction of 0 m or none (the two are recorded alike)');
    expect(why(500)).toContain('lapse-corrected +500 m to its elevation');
    expect(why(-120)).toContain('lapse-corrected -120 m to its elevation');
    for (const v of [0, 500]) expect(why(v)).not.toContain('without lapse correction');
  });
  it('the Temperature card names the monthly means as the labels do', () => {
    const t = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months, lat: -25, extremesStatus: 'ok' }).rows.find((r) => r.k === 'Temperature')!;
    expect(t.s).toContain("the coldest month's mean nightly low 9.0 °C in July");
    expect(t.s).toContain("the warmest month's mean daily high 26.0 °C in January");
    expect(t.s).not.toMatch(/coldest night \d|warmest day \d/);
  });
});

describe('a credit says two licences disagree only when they do (the words review\'s 4)', () => {
  it('spaces or hyphens, the same licence agrees', () => {
    for (const a of ['Jane Doe, CC BY SA 4.0', 'Jane Doe, CC-BY-SA 4.0', 'Jane Doe (cc by sa)']) expect(creditParts({ attribution: a, licence: 'by-sa' }).disagree, a).toBe(false);
    expect(photoCredit({ attribution: 'Jane Doe, CC BY 4.0', licence: 'by' })).toBe('Jane Doe, CC BY 4.0');
    expect(creditParts({ attribution: 'Jane Doe, public domain', licence: 'cc0' }).disagree).toBe(false);
  });
  it('another licence still disagrees', () => {
    expect(photoCredit({ attribution: 'Jane Doe, CC BY SA 4.0', licence: 'by' })).toMatch(/the two licences disagree/);
    expect(creditParts({ attribution: 'Jane Doe, CC BY NC', licence: 'by' }).disagree).toBe(true);
  });
});

describe('the link-preview image\'s alt (the words review\'s 2)', () => {
  it('is the image\'s own words, on the front page and on a species page with no photograph', () => {
    expect(OG_ALT).toContain('Cactus, succulent and bulb species, and the plants most grown alongside them. Every figure names its source. Your own plants stay on your device, or sync encrypted.');
    expect(home).toContain('<meta property="og:image:alt" content={OG_ALT} />');
    expect(species).toContain('content={hero ? heroAlt : OG_ALT}');
  });
});

describe('the front page and the species page say what is so (the words review\'s 3, 11, 15)', () => {
  it('"where its records allow one", not "where the sources answered"; "encrypted", not "sealed"', () => {
    expect(home).not.toContain('where the sources answered');
    expect(home).toContain("with each one's habitat climate where its records allow one.");
    expect(home).toContain('Your records, encrypted before sync.');
  });
  it('the group is said once, as the table lists it', () => {
    expect(species).toContain('Grouped as {aLabel(sheet.arch.arch.lab)}, {sheet.arch.why}.');
  });
  it('the 404 says the held call with GBIF as its subject', () => {
    expect(code('src/routes/species/[slug]/+page.server.ts')).toContain("GBIF was not asked whether it is an older name for a species that is here: this site held its call to GBIF back for this minute");
  });
  it("the grower's placeholder fits a phone, the field number kept in the label (the grower review's 7)", () => {
    expect(home).toContain('placeholder="Search your plants by number or name…"');
    expect(home).toContain('aria-label="Search your plants by number, name or field number, and species (on this device)"');
  });
});

describe('/about/how (the words review\'s 16 to 20, 23, 25, 27; the outside triage\'s smaller notes)', () => {
  it('the common-names rule in order, and true of old dossiers', () => {
    expect(how).toContain('Names are put in order by a fixed rule: a name GBIF marks preferred first');
    expect(how).not.toContain('Last, after every other name, go');
    expect(how).toContain('each source a listed spelling names counts once, and a spelling that names none counts as one');
  });
  it('the rendered pages\' edge key holds the reference\'s version, as hooks.server.ts keys it', () => {
    expect(readFileSync('src/hooks.server.ts', 'utf8')).toMatch(/[?&]c=/);
    expect(how).toContain("keyed by the build, the reference's version, the address");
  });
  it('"Use my location" keeps three decimals, as Today stores them, and the browser\'s own way of finding it is said', () => {
    expect(readFileSync('src/routes/today/+page.svelte', 'utf8')).toMatch(/toFixed\(3\)/);
    expect(how).not.toContain('as you set them, unrounded');
    expect(how).toContain('"Use my location" keeps three decimals');
    expect(how).toContain('"Use my location" asks the browser for its position');
  });
  it('the glossary keeps "not asked" apart, and "held" has its threshold', () => {
    expect(how).toContain('Not asked: a source the build skipped, or a call this site held back');
    expect(how).not.toContain('(it refused, failed or was not asked)');
    expect(how).toContain('Held: a change dated more than five minutes ahead');
  });
  it('the labels page\'s picked plants, the sample with no Web Locks, the brief, no rounds', () => {
    expect(how).toContain('written when the page is left and read back only when that page is reloaded');
    expect(how).toContain('a browser without Web Locks cannot tell an open sample from a left one');
    expect(how).toContain('GBIF, Kew\'s WCVP, CHELSA, ETOPO, NASA POWER');
    expect(how).not.toContain('sent nowhere unless you turn on sync, and then encrypted with a key only you hold');
    expect(how).not.toMatch(/round sixty-two/);
  });
  it('the figure names are the labels\' everywhere', () => {
    expect(how).not.toMatch(/coldest mean night|mean night is nearest|in mean day and mean night/);
  });
});

describe('/about/formats (the words review\'s 21 to 23, the self-review\'s N10)', () => {
  it('the import\'s two-digit-year example is one the import reads that way', () => {
    expect(formats).toContain('(1/1/27 could be 1927 or 2027, so it is not read)');
    expect(readDate('1/1/27', '2026-10-09').why).toContain('could be 1927 or 2027');
    expect(readDate('15/06/27', '2026-10-09').why).toContain('year first or year last'); // why "15/06/27" was the wrong example
  });
  it('the pages that ask by hash group, the service worker, the verb', () => {
    expect(formats).toContain('A plant page, a batch page, Today, the labels, the plants list');
    expect(formats).toContain('The service worker keeps those answers under the corpus id');
    expect(formats).toContain('that the hash groups do not settle, go to /api/search?q=');
  });
  it('"log batch" in the sync section, never a bare "batch" for one', () => {
    const sync = formats.slice(formats.indexOf('One vault key per person'), formats.indexOf('The reference lookups your own pages make'));
    // Not the listing's JSON key (`{ batches: [...] }`), which is the wire's own word.
    expect(sync.match(/(?<![\w-]|[Ll]og |\{ )[Bb]atch(es)?\b/g) ?? []).toEqual([]);
  });
  it('no round a grower cannot see', () => {
    expect(formats).not.toMatch(/round sixty-(one|two)/);
  });
});

describe("the Climograph's description judges the coldest night's ties at one decimal (the outside triage's smaller notes, A35)", { timeout: 60_000 }, () => {
  it('a July at 9.0 °C and an August at 9.4 °C are not both "the coldest"', async () => {
    const { render } = await import('svelte/server');
    const { default: Climograph } = await import('$lib/ui/Climograph.svelte');
    const s = (i: number) => Math.cos((i / 12) * 2 * Math.PI);
    // Coldest nights July 9.04 and August 9.4: one month at one decimal, two at none (the base's "July and August").
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22 + 4 * s(i), tmin: i === 6 ? 9.04 : i === 7 ? 9.4 : 12 + 2 * s(i) + (i === 5 || i === 8 ? 1 : 0), precipMm: 1 }));
    const body = render(Climograph, { props: { climate: { months, p10: months, p90: months, cells: 1 } as never } }).body;
    const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(body)![1];
    expect(desc).toContain('coldest month July, mean nightly low 9.0 °C');
    expect(desc).not.toContain('July and August');
  });
  it("the year's rain is said as the twelve medians added, before \"Medians\" (the words review's 5b)", async () => {
    const { render } = await import('svelte/server');
    const { default: Climograph } = await import('$lib/ui/Climograph.svelte');
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22, tmin: 9 + (i % 3), precipMm: 1 }));
    const body = render(Climograph, { props: { climate: { months, p10: months, p90: months, cells: 1 } as never } }).body;
    expect(/<desc[^>]*>([^<]*)<\/desc>/.exec(body)![1]).toContain('of rain a year (the twelve monthly medians added). Medians across the range');
  });
});

describe('the glance row, drawn (the words review\'s 1, the self-review\'s N10)', { timeout: 60_000 }, () => {
  it('is headed "Habitat figures", and each bar says its scale to a screen reader and beside it', async () => {
    const { render } = await import('svelte/server');
    const { default: Glance } = await import('$lib/ui/ref/Glance.svelte');
    const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 22, tmin: 12 - (i === 6 ? 3 : 0), precipMm: 6, dli: 30 + i }));
    const body = render(Glance, { props: { months, extremes: { minP01: 6.5, minAbs: 4, years: 40 }, extremesStatus: 'ok', season: false } }).body;
    expect(body).toContain('>Habitat figures<');
    expect(body).not.toContain('In the wild');
    expect(body).toContain('aria-label="72 mm on a bar from 0 to 1,200 mm"');
    expect(body).toContain('aria-label="Highest month 41 DLI on a bar from 0 to 70 DLI"');
    expect(body).toContain('bar 0 to 1,200 mm');
    expect(body).toContain('bar 0 to 70 DLI');
  });
});
