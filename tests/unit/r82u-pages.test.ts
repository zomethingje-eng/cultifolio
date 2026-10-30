/**
 * Round eighty-two (U): the rules behind the pages' fixes, engine-free.
 *
 * - The thin-climate mark (the owner's decision on the independent review's 40): its line, 12 records or 5 cells.
 * - The world map's caption by what the page holds (the independent review's 21), and the regions' note (22).
 * - "author not stated" for a photograph whose source names no one (the reviews' 26 and 1), on the page and the tile.
 * - The lead photograph (13): the cultivated set's first, and never an upright one where a landscape one is there.
 * - The image handler's TypeError (the second review's lead): an action's update given a value that is not a function.
 * - The close-up map (12): the page's own regions named, a scale bar and a graticule.
 * - The about page true of each (rule 5), and "Popular genera" (the second review's 3).
 *
 * On r82base: FAILED (the modules `$core/few-records` and `$lib/ui/ref/range-words` do not exist, so the file does not
 * load; `shownAttribution` is not exported; `heroOf` led with the first wild photograph; the handler threw).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fewRecords, fewRecordsSentence, FEW_RECORDS, FEW_CELLS } from '../../src/lib/core/few-records';
import { rangeCaption, UNITS_NOTE } from '../../src/lib/ui/ref/range-words';
import { shownAttribution, tileCreditOf, tileCredit, photoCredit, creditParts } from '../../src/lib/ui/ref/head';
import { heroOf } from '../../src/lib/dossier/dedupe';
import { failedBeforeHydration } from '../../src/lib/ui/ref/failed';
import { regionSvg } from '../../src/lib/map/still';

describe('r82u: a climate read from few records is marked, with its counts', () => {
  it('the line is 12 records or 5 cells', () => {
    expect([FEW_RECORDS, FEW_CELLS]).toEqual([12, 5]);
    expect(fewRecords({ status: 'ok', records: 4, cells: 4 })).toEqual({ records: 4, cells: 4 }); // Peperomia graveolens's 4 records
    expect(fewRecords({ status: 'ok', records: 3, cells: 3 })).toEqual({ records: 3, cells: 3 }); // Iris zagrica
    expect(fewRecords({ status: 'ok', records: 11, cells: 9 })).not.toBeNull();
    expect(fewRecords({ status: 'ok', records: 40, cells: 4 })).toEqual({ records: 40, cells: 4 }); // many records in a handful of cells
    expect(fewRecords({ status: 'ok', records: 12, cells: 5 })).toBeNull(); // guard: at the line, no mark
    expect(fewRecords({ status: 'ok', records: 352, cells: 40 })).toBeNull();
    expect(fewRecords({ status: 'pending' })).toBeNull();
    expect(fewRecords(null)).toBeNull();
  });
  it('says the counts and the line, and gives no advice', () => {
    const s = fewRecordsSentence({ records: 1, cells: 1 });
    expect(s).toBe('From few records: this habitat climate is read from 1 record in 1 grid cell; a page says so under 12 records or 5 cells, and shows the figures as read.');
    expect(s).not.toMatch(/treat|indicative|should|careful/i);
  });
});

describe('r82u: the world map\'s caption says what the page holds', () => {
  it('Kew\'s range, a checklist\'s, regions reported present, or no range and why', () => {
    expect(rangeCaption({ native: [1], verified: true }, 'ok')).toBe('Native range as published by WCVP');
    expect(rangeCaption({ native: [1], verified: false }, 'ok')).toBe('Native range as a national checklist states it, not verified by WCVP');
    expect(rangeCaption({ native: [], reported: [1] }, 'ok')).toMatch(/^No verified native range/);
    // Albuca longifolia (g7570556): Kew holds the name only under another author, and the page has no range.
    expect(rangeCaption({ native: [], introduced: [] }, 'none')).toBe('No native range: WCVP publishes no distribution for this name');
    expect(rangeCaption({ native: [], introduced: [1] }, 'none')).toBe('No native range: WCVP lists no region where it is native');
    expect(rangeCaption({ native: [] }, 'refused')).toBe('Native range not checked: the distribution source refused the request when this page was built');
    expect(rangeCaption({ native: [] }, undefined)).toMatch(/^Native range not checked: the distribution source did not answer/);
    expect(rangeCaption({ native: [] }, 'ambiguous')).toMatch(/^No native range taken/);
  });
  it('the regions are said to be Kew\'s level-3 units, historical names and all', () => {
    expect(UNITS_NOTE).toMatch(/^regions are the level-3 units of the World Geographical Scheme for Recording Plant Distributions/);
    expect(UNITS_NOTE).toContain('historical names');
  });
});

describe('r82u: a photograph whose source names no author says so, never the licence alone', () => {
  const inatCc0 = { attribution: 'no rights reserved', licence: 'cc0' as const };
  it('on the species page: the hero, the gallery and compare', () => {
    expect(shownAttribution(inatCc0)).toBe('author not stated, no rights reserved');
    expect(creditParts(inatCc0).who).toBe('author not stated, no rights reserved');
    expect(photoCredit(inatCc0)).toBe('author not stated, no rights reserved · CC0');
    expect(shownAttribution({ attribution: 'CC0' })).toBe('author not stated, CC0');
    expect(shownAttribution({ attribution: ', Public domain, via Wikimedia Commons' })).toBe('author not stated, Public domain, via Wikimedia Commons');
    // guards: a named author is kept as written
    expect(shownAttribution({ attribution: 'grower1, no rights reserved (CC0)' })).toBe('grower1, no rights reserved (CC0)');
    expect(shownAttribution({ attribution: 'Daderot, CC0, via Wikimedia Commons' })).toBe('Daderot, CC0, via Wikimedia Commons');
  });
  it('on a tile: the index writes it, and an index written before is read so', () => {
    expect(tileCreditOf(inatCc0)).toBe('CC0, author not stated'); // base: "CC0"
    expect(tileCredit({ credit: 'CC0', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg' })).toBe('Photo: CC0, author not stated'); // the live index's 5,461
    expect(tileCredit({ credit: 'CC BY, Elisa' })).toBe('Photo: CC BY, Elisa'); // guard
    expect(tileCreditOf({ attribution: 'grower1, no rights reserved (CC0)', licence: 'cc0' })).toBe('CC0, grower1'); // guard
  });
});

describe('r82u: the lead photograph', () => {
  const inat = (id: string, captive: boolean, width = 1536, height = 2048) => ({ src: 'inat', id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, captive, width, height });
  const commons = (id: string, width: number, height: number) => ({ src: 'commons', id, url: `https://upload.wikimedia.org/${id}.jpg`, width, height });
  it('the cultivated set\'s first, where there is one', () => {
    expect(heroOf([inat('1', false, 2048, 1536), inat('2', true, 2048, 1536), inat('3', true, 2048, 1536)])?.id).toBe('2'); // base: 1
  });
  it('never an upright photograph where a landscape one is there: Echeveria elegans\'s eight upright ones and Commons\' four', () => {
    const elegans = [...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => inat(x, false)), commons('Stueber', 640, 480), commons('Sanja', 1024, 768)];
    expect(heroOf(elegans)?.id).toBe('Stueber'); // base: a
    expect(heroOf([inat('p', true), inat('w', false, 2048, 1536)])?.id).toBe('w'); // an upright cultivated one gives way to a landscape one
  });
  it('the order otherwise as before: the first of the best, and the first when every one is upright (guards)', () => {
    expect(heroOf([inat('a', false), inat('b', false)])?.id).toBe('a');
    expect(heroOf([commons('C', 600, 400), inat('w', false, 2048, 1536)])?.id).toBe('w');
    expect(heroOf([])).toBeUndefined();
  });
});

describe('r82u: an image handler never calls what is not a function', () => {
  it('an update with a value that is not a function keeps the failure\'s own function', () => {
    const heard: string[] = [];
    let onError: (() => void) | null = null;
    const img = { complete: false, naturalWidth: 0, getAttribute: () => 'x.jpg', addEventListener: (_: string, f: () => void) => { onError = f; } } as unknown as HTMLImageElement;
    const a = failedBeforeHydration(img, () => heard.push('failed'));
    a.update('k2735933' as never); // what compare's action passed on: its key (base: then "n is not a function")
    expect(() => onError!()).not.toThrow();
    expect(heard).toEqual(['failed']);
  });
  it('compare\'s action keeps its own key and passes nothing on', () => {
    const page = readFileSync('src/routes/compare/+page.svelte', 'utf8');
    expect(page).toContain('return { update(next: string) { k = next; } };');
    expect(page).not.toMatch(/return failedBeforeHydration\(img/);
  });
});

describe('r82u: the close-up map names the regions and has a scale and a graticule', () => {
  const box = { s: -29.5, w: -71.5, n: -24.5, e: -68.5 };
  it('the region\'s name, a scale bar in km and graticule lines', () => {
    const svg = regionSvg([box], [[-26, -70.6], [-26.1, -70.5], [-26.2, -70.7], [-26.3, -70.6]], { lat: -26.2, lon: -70.6 }, 'Records', [{ name: 'Chile North', box }]);
    expect(svg).toMatch(/<span class="mlab" style="left:[\d.]+%;top:[\d.]+%">Chile North<\/span>/);
    expect(svg).toMatch(/<span class="mscale"[^>]*>[\d,]+ km<\/span>/);
    expect(svg).toMatch(/<line class="grat"/);
    expect(svg).toMatch(/<line class="scale"/);
    expect(svg).toContain('aria-hidden="true"'); // the words are for the eye; the map is named
  });
  it('a region outside the frame is not named, and two names never overlap', () => {
    const far = { s: 40, w: 10, n: 45, e: 15 };
    const svg = regionSvg([box], [[-26, -70.6], [-26.1, -70.5], [-26.2, -70.7]], undefined, 'Records', [{ name: 'Chile North', box }, { name: 'Italy', box: far }, { name: 'Chile North again', box }]);
    expect(svg).not.toContain('Italy');
    expect(svg).not.toContain('Chile North again');
  });
});

describe('r82u: the about page is true of each change', () => {
  const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
  it('says "Popular genera", and no "Most grown" is left in any page', () => {
    expect(how).toContain('Its chip "Popular genera", off until chosen, narrows it to the popular genera.'); // base: “Most grown”
    expect(how).toContain('It is a measure of genera, not of species or of growers.');
    for (const f of ['src/routes/+page.svelte', 'src/routes/about/how/+page.svelte']) expect(readFileSync(f, 'utf8').replace(/"Most grown" until round eighty-two/, '')).not.toMatch(/Most grown/);
    expect(readFileSync('src/routes/+page.svelte', 'utf8')).toContain('>Popular genera<span class="sep0">');
  });
  it('says the few-records mark, its line and its count', () => {
    expect(how).toContain('A habitat climate read from fewer than 12 records, or from fewer than 5 grid cells, is marked "from few records" on the page\'s figures and in its climate section');
    expect(how).not.toContain('under a dozen the page says the evidence is thin');
  });
  it('says a page built now has no Papers section, and why its record says so', () => {
    expect(how).toContain('so a page built since has no Papers section, and its record of sources says OpenAlex was not asked, and why.');
  });
  it('names the regions\' scheme where the species page links it', () => {
    expect(how).toMatch(/<span id="regions">A range is in Kew's units, the level-3 regions of the World Geographical Scheme/);
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toContain('href="/about/how#regions"');
  });
});
