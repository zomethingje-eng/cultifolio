/**
 * Round eighty-four, agent E: the species page and the climate's words.
 *
 * 1. Each cause of extremes set aside is worded as itself (D1, S1, A3, B2), on the glance card, the sheet, a plant's page
 *    and the share card, from the live dossiers' climates (29 October 2026): Eulychnia acida and Nephelium lappaceum set
 *    aside by round eighty-three's warm-night check (corrections of -432 m and +8 m), Echinopsis thelegona and Solanum
 *    lycopersicum by their corrections (-1,257 m, -1,129 m), and round eighty's record-low case. On r84base every one read
 *    "the weather cell's ground is too far off". FAILED on r84base.
 * 2. The chart at a phone's width (P1): its labels fit the plot at 268 px; its months are initials there. FAILED on r84base
 *    (the full labels, 270 px wide, in a 216 px plot).
 * 3. The glance grid (W3): the four figures alone in their grid, the season card under them; the bar never shorter than its
 *    figure (A13). The phone's habitat line (decision 3). FAILED on r84base.
 * 4. Words a reader sees: no repository path and the merged page's key named apart (A6e, S7); the maps tied to their
 *    captions (B8). FAILED on r84base.
 * 5. Photographs: the lead's size floor (A6h), the first row across observers (W2), the licence said once (W2, A13).
 *    FAILED on r84base.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lapseCause, causeTag, causeShort, lapseSetAside } from '$core/lapse';
import { cultivationSheet, extremesWhyTag, extremesWhyShort, growingYear } from '$core/sheet';
import { climateCardSvg, subLines } from '$lib/share/card';
import { climograph } from '$climate/climograph';
import { sheetOf } from '$dossier/sheet';
import { parseDossier } from '$dossier/schema';
import { kewKeysSentence } from '$core/no-gbif';
import { extraWhy } from '$dossier/extra-keys';
import { readerWords, describedBy } from '$lib/ui/ref/words';
import { heroOf, spreadByObserver } from '$dossier/dedupe';
import { creditParts, withoutLicence } from '$lib/ui/ref/head';
import { worldSvg } from '$lib/map/still';

type Clim = { months: Array<{ tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number }>; p10: never[]; p90: never[]; cells: number; extremesLapse: { years: number; minAbs: number; minP01: number; maxP99: number; frostDaysPerYear: number; lapseAppliedM?: number }; annualRain?: { p50?: number }; at: { lat: number } };
const LIVE = JSON.parse(readFileSync('tests/unit/fixtures/r84e-lapse-climates.json', 'utf8')) as Record<string, { key: string; climate: Clim }>;
const c = (slug: string) => LIVE[slug].climate;
const OLD = /too far off|too far above or below/;

describe('1. each cause of extremes set aside, worded as itself', () => {
  it('the causes, read from the live dossiers', () => {
    expect(lapseCause({ months: c('eulychnia-acida').months, extremes: c('eulychnia-acida').extremesLapse })).toEqual({ kind: 'warm-night', minP01: 7.5, coldest: 6.8 });
    expect(lapseCause({ months: c('nephelium-lappaceum').months, extremes: c('nephelium-lappaceum').extremesLapse })?.kind).toBe('warm-night');
    expect(lapseCause({ months: c('echinopsis-thelegona').months, extremes: c('echinopsis-thelegona').extremesLapse })).toEqual({ kind: 'elevation', m: -1257 });
    expect(lapseCause({ months: c('solanum-lycopersicum').months, extremes: c('solanum-lycopersicum').extremesLapse })).toEqual({ kind: 'elevation', m: -1129 });
    // Round eighty's record-low case (Ruellia simplex's figures, review A's 3)
    const months = Array.from({ length: 12 }, (_, i) => ({ tmin: i === 6 ? 16.6 : 20 }));
    expect(lapseCause({ months, extremes: { minAbs: 17.8, minP01: 18, lapseAppliedM: 40 } })?.kind).toBe('record-low');
  });
  it('the glance card and the share card: the warm night as two sources that disagree, the elevation as the cell\'s height, in the reader\'s units', () => {
    const e = c('eulychnia-acida');
    const cause = lapseCause({ months: e.months, extremes: e.extremesLapse });
    expect(extremesWhyTag('lapse', cause)).toBe('extremes set aside: two sources disagree');
    const t = c('echinopsis-thelegona');
    const tc = lapseCause({ months: t.months, extremes: t.extremesLapse });
    expect(extremesWhyTag('lapse', tc)).toBe('extremes set aside: weather cell 1,257 m higher');
    expect(extremesWhyTag('lapse', tc, 'us')).toBe('extremes set aside: weather cell 4,124 ft higher');
    expect(causeTag(null)).toBe('extremes set aside');
    for (const slug of Object.keys(LIVE)) expect(extremesWhyTag('lapse', lapseCause({ months: c(slug).months, extremes: c(slug).extremesLapse }))).not.toMatch(OLD);
  });
  it('the sheet: the cold row names the cause, and the warm night is said as a check, not a proof (decision 7)', () => {
    const e = c('eulychnia-acida');
    const sheet = cultivationSheet({ scientific: 'Eulychnia acida', months: e.months, extremes: null, extremesStatus: 'lapse', extremesLapse: e.extremesLapse, lat: -30 });
    const row = sheet.rows.find((r) => r.k === 'Temperature')!;
    expect(row.s).toContain('The daily extremes were read and set aside: the 1-in-100 night, 7.5 °C, is warmer than the coldest month\'s mean nightly low across the range, 6.8 °C.');
    expect(row.s).toContain('This is a check that two sources disagree, not proof that either is wrong.');
    expect(row.plain!.lead).toBe("Coldest month, mean nightly low 6.8 °C, not a cold floor: the weather cell's coldest nights run warmer than the habitat's coldest month, so the two sources disagree and its extremes are set aside.");
    expect(JSON.stringify(sheet.rows)).not.toMatch(OLD);
    const t = c('echinopsis-thelegona');
    const us = cultivationSheet({ scientific: 'Echinopsis thelegona', months: t.months, extremes: null, extremesStatus: 'lapse', extremesLapse: t.extremesLapse, lat: -24, units: 'us' });
    expect(us.floor!.plain.lead).toContain('a weather cell 4,124 ft (1,257 m) higher than the typical spot');
    // A sheet built before (no series kept): only that they were set aside, and where to read why.
    expect(cultivationSheet({ scientific: 'x', months: e.months, extremesStatus: 'lapse', lat: -30 }).floor!.plain.lead).toContain('set aside (the species page says why)');
  });
  it("a plant's page and the record-low words", () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ tmin: i === 6 ? 16.6 : 20 }));
    const rl = lapseCause({ months, extremes: { minAbs: 17.8, minP01: 18 } });
    expect(extremesWhyShort('lapse', rl)).toBe("the weather cell's record low is warmer than the habitat's coldest month's nights, so the two sources disagree and its extremes are set aside");
    expect(lapseSetAside({ months, extremes: { minAbs: 17.8 } }, 'us')).toContain('the record low, 64.0 °F, is warmer than the coldest month\'s mean nightly low across the range, 61.9 °F');
    expect(extremesWhyShort('lapse', null)).toContain('the species page says why');
  });
  it('the share card names the cause and keeps its small print inside the card', () => {
    const t = c('echinopsis-thelegona');
    const svg = climateCardSvg({ name: 'Echinopsis thelegona', origin: ['Argentina Northwest'], slug: 'echinopsis-thelegona', cells: 3, climate: { months: t.months, p10: t.months, p90: t.months, cells: 3, extremes: null }, extremesStatus: 'lapse', extremesLapse: t.extremesLapse, units: 'us' });
    expect(svg).toContain('extremes set aside: weather cell 4,124 ft higher');
    const subs = [...svg.matchAll(/<text x="58" y="\d+" font-family="system-ui, sans-serif" font-size="12" fill="#4a5650">([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(subs.length).toBeGreaterThanOrEqual(5);
    for (const t of subs) expect(t.length).toBeLessThanOrEqual(62); // the card's 400 px of 12 px type
    expect(subLines('Jul, not a floor; extremes set aside: weather cell 1,257 m higher · CHELSA')).toEqual(['Jul, not a floor;', 'extremes set aside: weather cell 1,257 m higher · CHELSA']);
  });
  it("a plant's sheet carries the series set aside, so its page can name the cause", () => {
    const base = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));
    const e = c('eulychnia-acida');
    const d = parseDossier({ ...base, climate: { ...base.climate, months: e.months, extremes: e.extremesLapse, extremesStatus: 'ok' } });
    const s = sheetOf(d);
    expect(s.climate.status === 'ok' && s.climate.extremesStatus).toBe('lapse');
    expect(s.climate.status === 'ok' && s.climate.extremesLapse).toEqual({ minAbs: 4.3, minP01: 7.5, lapseAppliedM: -432 });
  });
});

describe("2. the chart at a phone's width", () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 20 + 8 * Math.cos(i / 2), tmin: 5 + 6 * Math.cos(i / 2), precipMm: 40 + i, dli: 20 + i, rh: 60 }));
  const input = { months, p10: months, p90: months, cells: 40, extremes: { minAbs: -24.1, maxP99: 30, years: 44 } };
  it('at 268 px (a 320 px phone) the extremes\' labels fit the plot, and the months are initials', () => {
    const g = climograph(input, 268);
    expect(g.temp.minAbs!.label).toBe('-24.1° lowest night');
    expect(g.temp.maxP99!.label).toBe('30.0° hot day, 1 in 100');
    for (const l of [g.temp.minAbs!.label, g.temp.maxP99!.label]) expect(l.length * 6.2).toBeLessThan(g.plotW - 14);
    expect(g.months[0]).toBe('J');
  });
  it('at a desktop width the labels name their years and source, as before (guard)', () => {
    const g = climograph(input, 940);
    expect(g.temp.minAbs!.label).toBe('-24.1° lowest night in 44 years, NASA POWER');
    expect(g.months[0]).toBe('Jan');
  });
  it('the component draws at the shown width down to 260 px, 720 only before it is known', () => {
    expect(readFileSync('src/lib/ui/Climograph.svelte', 'utf8')).toContain('shown === 0 ? 720 : Math.max(260, Math.min(shown - 20, 960))');
  });
});

describe('3. the glance grid and the phone\'s line', () => {
  const months = c('eulychnia-acida').months;
  const year = growingYear(months as never, -30);
  it('the four figures alone in their grid, the season card under it; the cause linked to its notice', async () => {
    const { render } = await import('svelte/server');
    const { default: Glance } = await import('$lib/ui/ref/Glance.svelte');
    const body = render(Glance, { props: { months, year, extremesStatus: 'lapse', extremesLapse: c('eulychnia-acida').extremesLapse, whyHref: '#lapsecell', seasonLead: 'Wet winters.', seasonRule: 'rain rule, CHELSA', readerLat: 40 } }).body.replace(/<!--[^]*?-->/g, '');
    const grid = body.slice(body.indexOf('gcards'), body.indexOf('gseason'));
    expect(grid.match(/class="card[ "]/g)?.length).toBe(4);
    expect(grid).not.toContain('season');
    expect(body).toMatch(/<a href="#lapsecell"[^>]*>extremes set aside: two sources disagree<\/a>/);
    expect(body).toMatch(/<span class="src[^"]*">CHELSA<\/span> <a class="how[^"]*" href="\/about\/how#year">How the rain rule reads it<\/a>/);
    expect(body).not.toMatch(/class="src[^"]*">rain rule/);
  });
  it('a year of 1,235 mm is drawn on a bar to 2,000 mm, not 1,200', async () => {
    const { render } = await import('svelte/server');
    const { default: Glance } = await import('$lib/ui/ref/Glance.svelte');
    const body = render(Glance, { props: { months, annualRain: { p50: 1235 }, season: false } }).body;
    expect(body).toContain('bar 0 to 2,000 mm');
  });
  it("the phone's line: the four figures, each qualified and sourced", async () => {
    const { render } = await import('svelte/server');
    const { default: HabitatLine } = await import('$lib/ui/ref/HabitatLine.svelte');
    const text = render(HabitatLine, { props: { months, year, units: 'metric', annualRain: { p50: 157.5 }, readerLat: 40, few: { records: 3, cells: 3 } } }).body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('Coldest month 6.8 °C mean nightly low, not a floor CHELSA');
    expect(text).toContain('Rain 158 mm a year, median across the range CHELSA');
    expect(text).toContain('Open-sky light 20–57 DLI lowest to highest month CHELSA');
    expect(text).toContain('Season Wet winters Nov–Feb, your months CHELSA');
    expect(text).toContain('from 3 records');
  });
});

describe('4. words a reader sees', () => {
  it('a merged page\'s key, said without the repository, as the build now writes it and as the live corpus has it', () => {
    expect(extraWhy({ kewLabel: 'x', how: 'merged' })).toBe('the key of a page merged into this one');
    expect(readerWords("2000 records of GBIF's key 7281739, Bisnaga hamatacantha (the key of a page merged here by the owner's decision (scripts/merged-pages.txt)): the GBIF download")).toBe("2000 records of GBIF's key 7281739, Bisnaga hamatacantha (the key of a page merged into this one): the GBIF download");
    expect(readerWords('read from scripts (scripts/extra-keys.txt) today')).toBe('read from scripts today');
  });
  it("the merged key is not said to come from Kew's synonymy (Echeveria desmetiana, S7)", () => {
    const t = kewKeysSentence([{ key: 4202274, name: 'Echeveria desmetiana', n: 26 }, { key: 7530398, name: 'Echeveria peacockii', n: 0, slug: 'echeveria-peacockii' }]);
    expect(t).toBe("This species has no GBIF key of its own. Its records are GBIF's under the key of the name Kew's World Checklist holds as this plant: 4202274 (Echeveria desmetiana, 26 records); and under the key of a page merged into this one: 7530398 (Echeveria peacockii, 0 records). No name was matched to GBIF; the first are read from Kew's synonymy, the merged page's from the reference's own merge.");
  });
  it('each map is tied to its caption', () => {
    expect(describedBy(worldSvg([], undefined, 'Native range of X'), 'range-caption')).toMatch(/^<svg class="map map-world"[^>]* aria-label="Native range of X" aria-describedby="range-caption">/);
    expect(describedBy('<div class="mapwrap"><svg class="map map-region">', 'records-caption')).toBe('<div class="mapwrap"><svg class="map map-region" aria-describedby="records-caption">');
    expect(describedBy('<svg aria-describedby="a">', 'b')).toBe('<svg aria-describedby="a">');
  });
});

describe('5. the photographs', () => {
  const p = (id: string, o: Record<string, unknown> = {}) => ({ id, url: `https://x/${id}.jpg`, src: 'inat', attribution: '(c) A, some rights reserved (CC BY)', ...o });
  it('the lead is never a photograph its source states smaller than the box (Lithops lesliei, 374 by 318 px)', () => {
    expect(heroOf([p('small', { width: 374, height: 318 }), p('big', { width: 2048, height: 1536 })])!.id).toBe('big');
    expect(heroOf([p('small', { width: 374, height: 318 }), p('upright', { width: 1536, height: 2048 })])!.id).toBe('upright');
    expect(heroOf([p('small', { width: 374, height: 318 })])!.id).toBe('small');
    expect(heroOf([p('unstated'), p('big', { width: 2048, height: 1536 })])!.id).toBe('unstated'); // a size not stated keeps its place
  });
  it("the first row takes one photograph from each observer before a second from any (W2: Echeveria elegans's three and three)", () => {
    const xs = ['J1', 'J2', 'J3', 'O1', 'O2', 'O3', 'K1', 'L1'].map((id) => p(id, { attribution: `(c) ${id[0]}, some rights reserved (CC BY)` }));
    expect(spreadByObserver(xs, 6).map((x) => x.id)).toEqual(['J1', 'O1', 'K1', 'L1', 'J2', 'J3', 'O2', 'O3']);
  });
  it("the credit says the licence once (W2, A13)", () => {
    expect(withoutLicence('(c) Oleksandr Shynder, some rights reserved (CC BY)')).toBe('(c) Oleksandr Shynder');
    expect(withoutLicence('pmallard, no rights reserved (CC0)')).toBe('pmallard');
    expect(withoutLicence('Alejandro Gómez Maya, CC BY, iNaturalist via GBIF')).toBe('Alejandro Gómez Maya, iNaturalist via GBIF');
    expect(creditParts({ attribution: '(c) Oleksandr Shynder, some rights reserved (CC BY)', licence: 'by' }).whoAlone).toBe('(c) Oleksandr Shynder');
    // A line naming another licence than the source's keeps its words: the page says the two disagree.
    expect(creditParts({ attribution: '(c) X, some rights reserved (CC BY-SA)', licence: 'by' }).whoAlone).toBe('(c) X, some rights reserved (CC BY-SA)');
  });
});
