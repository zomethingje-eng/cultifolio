/**
 * Round sixty-one, decisions 8 and 9 (the visitor and words review of round sixty, V-numbers): the figures' own names on
 * every surface, every tied month named, the share card's hemisphere, the refusal said as one, the title's promise, the
 * front page's feature only on the plain front page. Each failed on the base of round sixty-one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tiedMonths, monthNames, cultivationSheet } from '$core/sheet';
import { careLine } from '$core/note';
import { climograph } from '$climate/climograph';
import { climateCardSvg } from '$lib/share/card';
import { speciesTitle, detailSentence, type HeadInput } from '$lib/ui/ref/head';

const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20];
const tmin = [16, 16, 15, 14, 12, 10, 9, 9, 11, 11, 13, 14];
const rain = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5];
const cinerea = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: rain[i], dli: 30 + i, rh: 78 }));
const ex = { minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, years: 40 };
/** A source file without its comments, which quote the old words as history. */
const code = (f: string) => readFileSync(f, 'utf8').replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
type M = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number };
const card = (o: { south?: boolean; extremes?: typeof ex | null; cells?: number; months?: M[] } = {}) =>
  climateCardSvg({ name: 'Copiapoa cinerea', family: 'Cactaceae', origin: ['CLN'], slug: 'copiapoa-cinerea', cells: o.cells ?? 12, south: o.south, climate: { months: o.months ?? cinerea, p10: o.months ?? cinerea, p90: o.months ?? cinerea, cells: o.cells ?? 12, extremes: o.extremes === undefined ? ex : o.extremes } });

describe('every month that ties is named (V5)', () => {
  it('tiedMonths and monthNames', () => {
    expect(tiedMonths(tmax, true)).toEqual([0, 1]);
    expect(tiedMonths(tmin, false)).toEqual([6, 7]);
    expect(tiedMonths([1.04, 1.01, 2], false, (v) => v.toFixed(1))).toEqual([0, 1]); // a tie as printed
    expect(monthNames([0, 1])).toBe('January and February');
    expect(monthNames([0, 1, 2], 'short')).toBe('Jan, Feb and Mar');
    expect(monthNames([...Array(12).keys()])).toBe('every month');
  });
  it('the sheet names both months for the coldest night and the warmest day', () => {
    const t = cultivationSheet({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months: cinerea, lat: -28 }).rows.find((r) => r.k === 'Temperature')!.s;
    expect(t).toContain('coldest night 9.0 °C in July and August');
    expect(t).toContain('warmest day 22.0 °C in January and February');
    expect(t).toContain("the coldest month's mean night, July and August,");
  });
  it("the chart's reading names each end's months, and the cold quarter is centred on a run of tied months", () => {
    const g = climograph({ months: cinerea, p10: cinerea, p90: cinerea, cells: 12 });
    expect(g.alt).toContain('to 22 °C in Jan and Feb;');
    expect(g.alt).toContain('from 9 °C in Jul and Aug');
    // Jul and Aug tie: the quarter is Jun to Aug, centred on July, the run's first middle month, as before
    expect(g.alt).toContain('The cold quarter, Jun to Aug,');
    expect(g.alt).toContain('centred on the 2 months in a row that tie for it');
    const three = cinerea.map((m, i) => ({ ...m, tmin: [6, 7, 8].includes(i) ? 9 : m.tmin }));
    expect(climograph({ months: three, p10: three, p90: three, cells: 12 }).alt).toContain('The cold quarter, Jul to Sep,');
  });
  it('the share card names both months', () => {
    expect(card()).toContain('Jan and Feb · CHELSA');
    expect(card({ extremes: null })).toContain('Jul and Aug, not a floor · CHELSA');
  });
});

describe("the labels are the figures' own names, with the record low beside the floor (V1)", () => {
  it('the glance row, compare and the share card', () => {
    const glance = code('src/lib/ui/ref/Glance.svelte');
    const compare = code('src/routes/compare/+page.svelte');
    const svg = card();
    for (const lab of ['Cold floor (1 night in 100)', 'Warmest month, mean day', 'Rain a year', 'Open-sky light']) {
      expect(glance).toContain(lab);
      expect(compare).toContain(lab);
      expect(svg).toContain(lab.toUpperCase());
    }
    for (const src of [glance, compare, svg]) expect(src).not.toMatch(/Coldest nights|Warmest days|Rain in the wild|Light in the wild|COLDEST NIGHTS|WARMEST DAYS/);
    expect(glance).toMatch(/Record low \{tempN\(extremes\.minAbs/);
    expect(svg).toContain('record low 4.0 °C in 40 years · NASA POWER');
  });
  it('the card says "cell" for one, and draws no band legend without a band (V22)', () => {
    const one = card({ cells: 1, months: cinerea.map(({ dli: _d, ...m }) => m) });
    expect(one).toContain('habitat grid cell read');
    expect(one).not.toContain('10th–90th percentile across cells</text>');
    expect(one).toContain('one cell, so no spread');
  });
});

describe('the share card says whose months it draws (V6)', () => {
  it('southern and northern when given, and the species page gives it', () => {
    expect(card({ south: true })).toContain('habitat months, southern hemisphere');
    expect(card({ south: false })).toContain('habitat months, northern hemisphere');
    const page = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(page).toMatch(/<ShareCard input=\{\{[^]*?south: sheet\.year\?\.south/);
  });
});

describe('a refused or pending climate is said as such (V4, rule 2)', () => {
  for (const [st, said] of [['refused', 'not checked'], ['pending', 'pending']] as const) {
    it(`${st}: the Warmth card and its method`, () => {
      const r = cultivationSheet({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus: st, months: null }).rows.find((x) => x.k === 'Temperature')!;
      expect(r.s).toContain(`The habitat climate ${st === 'refused' ? 'was not checked' : 'is pending'}`);
      expect(`${r.s} ${r.why} ${r.short} ${r.plain?.lead}`).not.toMatch(/on file/);
      expect(r.short).toContain(`Habitat climate ${said}`);
    });
  }
  it("'none' keeps \"on file\"", () => {
    const r = cultivationSheet({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus: 'none', months: null }).rows.find((x) => x.k === 'Temperature')!;
    expect(r.s).toContain('No habitat figure is on file');
  });
  it('the label line says the convention has no source (V7)', () => {
    expect(careLine({ scientific: 'Tillandsia ionantha', family: 'Bromeliaceae', climateStatus: 'none', months: null })).toBe('group min 10 °C (convention, no source)');
  });
  it("a source's detail keeps its article and says when (V16)", () => {
    expect(detailSentence('occurrence source did not answer', 'x')).toBe('The occurrence source did not answer when this page was built.');
    expect(detailSentence(undefined, 'A source did not answer when this page was built')).toBe('A source did not answer when this page was built.');
    expect(detailSentence('fixture: no climate outside the Chilean test box', 'x')).toBe('Fixture: no climate outside the Chilean test box.');
  });
});

describe('the title promises cold nights only with the extremes, and says "and" (V13)', () => {
  const base: HeadInput = { name: { scientific: 'Copiapoa cinerea', family: 'Cactaceae' }, climate: { status: 'ok', months: cinerea, records: 10, extremes: { minP01: 6.5, years: 40 } }, native: 1, photos: 1, summary: false };
  it('with and without', () => {
    expect(speciesTitle(base)).toBe('Copiapoa cinerea: habitat rain, cold nights and light');
    expect(speciesTitle({ ...base, climate: { ...base.climate, extremes: null } })).toBe('Copiapoa cinerea: habitat rain and light');
    const dark = cinerea.map(({ dli: _d, ...m }) => m);
    expect(speciesTitle({ ...base, climate: { ...base.climate, months: dark } })).toBe('Copiapoa cinerea: habitat rain and cold nights');
    expect(speciesTitle({ ...base, climate: { ...base.climate, months: dark, extremes: null } })).toBe('Copiapoa cinerea: habitat rain');
  });
});

describe('the chart names CHELSA where it is seen, and says no "undated" (V3, V14)', () => {
  it('the caption and the edge labels', () => {
    const c = code('src/lib/ui/Climograph.svelte');
    const caption = c.slice(c.indexOf('<figcaption>'), c.indexOf('</figcaption>'));
    expect(caption.match(/CHELSA/g)?.length).toBe(3); // one per branch: band, no spread, one cell
    expect(c).not.toMatch(/undated/);
    const g = climograph({ months: cinerea, p10: cinerea, p90: cinerea, cells: 12, extremes: { minAbs: 4, maxP99: 29, years: 40 } });
    expect(g.temp.minAbs!.label).toBe('4.0° lowest night in 40 years, NASA POWER');
    expect(g.temp.maxP99!.label).not.toMatch(/undated/);
  });
});

describe('the front page (decision 9)', () => {
  const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;
  const load = async (u: string) => {
    const { load } = await import('../../src/routes/+page.server');
    return (await load({ url: new URL(u), request: new Request(u), cookies: { get: () => undefined }, platform: undefined, fetch: noStatic, locals: {}, setHeaders: () => {} } as never)) as { feature: unknown };
  };
  it('sends the feature for the plain front page only, not for a genus row, a grouping, a chip or a letter (corpus 10)', async () => {
    expect((await load('https://cultifolio.com/')).feature).toBeTruthy();
    for (const q of ['?by=genus&open=copiapoa', '?by=family', '?chip=climate', '?by=genus&from=C', '?by=genus&at=1']) expect((await load(`https://cultifolio.com/${q}`)).feature, q).toBeNull();
  });
  it('says the precise claim, puts the sample first, and the search and photographs before the feature', () => {
    const p = readFileSync('src/routes/+page.svelte', 'utf8');
    expect(p).toContain('Nothing about a species is written per page by a person or by AI, apart from credited quotations');
    expect(p).not.toContain('Nothing on a species page is written by a person or by AI.');
    const welcome = p.slice(p.indexOf('<p class="welcome" id="welcome">'), p.indexOf('</p>', p.indexOf('<p class="welcome" id="welcome">')));
    expect(welcome.indexOf('try-sample-home')).toBeGreaterThan(-1);
    expect(welcome.indexOf('try-sample-home')).toBeLessThan(welcome.indexOf('/plants/new'));
    const at = (t: string) => p.indexOf(t, p.indexOf('{:else}\n  <!-- While a search is typed'));
    expect(at('{@render featured()}')).toBeLessThan(at('<section class="feature"'));
    expect(at('class="searchbar" type="search" placeholder="Search the catalogue')).toBeLessThan(at('<section class="feature"'));
  });
});
