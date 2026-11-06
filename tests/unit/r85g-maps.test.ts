/**
 * Round eighty-five, G: the maps (outside review A's performance and A20, reviews D9, W3, W4).
 *
 * - Each page draws its regions from one small file a region (`/maps/w/w-<code>.svg`, `/maps/r/r-<code>.svg`), so it fetches
 *   its own regions' shapes and no others: every page fetched both whole files, 554 kB, before.
 * - A small region's close-up is drawn finely, its islands kept (Isabela was a few straight lines, Fernandina a triangle).
 * - The close-up's names are placed where they are drawn, after the clamp, and never over another name, the scale bar or
 *   one of a few records ("ItalyYugoslavia", "20Spain km").
 * - A record the coast reach or an island took is drawn as a ring, and the map's key says what a ring is.
 *
 * FAILS on r85base: the hrefs are `/maps/regions110.svg#CPP`, there is no `mapPoints`, the per-region files do not
 * exist, two names clamped to one edge are both drawn over each other, and every record is a dot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { worldSvg, regionSvg, mapPoints } from '../../src/lib/map/still';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

/** The names the close-up writes, with where (as shares of the frame) and how wide each is drawn. */
function labels(svg: string) {
  return [...svg.matchAll(/<span class="mlab" style="left:([\d.]+)%;top:([\d.]+)%">([^<]+)<\/span>/g)].map((m) => {
    const x = +m[1] / 100, y = +m[2] / 100, hw = Math.min(0.45, m[3].length * 0.0125);
    return { name: m[3], box: [x - hw, y - 0.045, x + hw, y + 0.045] };
  });
}
const overlap = (a: number[], b: number[]) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

describe('one file a region', () => {
  it('a page asks for its own regions only, by the file of each', () => {
    const w = worldSvg([TDWG3.CPP, TDWG3.NAM], undefined, 'Range');
    expect([...w.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/maps/land110.svg#land', '/maps/w/w-CPP.svg#r', '/maps/w/w-NAM.svg#r']);
    const r = regionSvg([TDWG3.GAL], [[-0.7, -90.3], [-0.8, -91.1], [-0.4, -91.4]], undefined, 'Records');
    expect(r).toContain('<use class="range" href="/maps/r/r-GAL.svg#r"/>');
    expect(r).not.toContain('regions50');
  });
  it('a page of many regions: the world map from the one world file, the close-up only the regions its frame shows', () => {
    const many = Object.keys(TDWG3).slice(0, 40).map((c) => TDWG3[c]);
    const w = worldSvg(many, undefined, 'Range');
    expect(w).not.toContain('/maps/w/');
    expect((w.match(/href="\/maps\/regions110\.svg#/g) ?? []).length).toBeGreaterThan(30);
    const r = regionSvg([TDWG3.GAL, TDWG3.NZN, TDWG3.CPP], [[-0.7, -90.3], [-0.8, -91.1], [-0.4, -91.4]], undefined, 'Records');
    // Galápagos alone, twice: laid as land (an island the 1:50m coastline lacks is still land), then drawn as range.
    expect([...r.matchAll(/<use class="(\w+)" href="(\/maps\/r\/[^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual(['land /maps/r/r-GAL.svg#r', 'range /maps/r/r-GAL.svg#r']);
  });
  it('the files are small, and the Galápagos are drawn finely: Isabela, Fernandina and their islets', () => {
    const gal = readFileSync('static/app/maps/r/r-GAL.svg', 'utf8');
    expect(gal.length).toBeLessThan(10_000);
    // Rings: one "M" a ring. Natural Earth's provinces draw the archipelago's islands; at 0.08° only the large ones stayed.
    expect((gal.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(10);
    // Isabela's outline: far more than "a few straight segments".
    const isabela = gal.split('M').map((p) => p.split(' ').length).sort((a, b) => b - a)[0];
    expect(isabela).toBeGreaterThan(60);
    expect(existsSync('static/app/maps/regions50.svg')).toBe(false);
  });
});

describe('the close-up\'s names', () => {
  it('a long name clamped back from the frame\'s edge does not run into a short one (round eighty-four tested it unclamped)', () => {
    const pts: Array<[number, number]> = [[45, 10], [45.2, 10.3], [44.9, 10.1], [45.1, 10.2]];
    // The frame is 8.4° to 11.9° E; the long name's region reaches past its east edge, the short one's middle is at 10.15° E.
    const svg = regionSvg([], pts, undefined, 'Records', [{ name: 'Bosnia-Herzegovina Federation', box: { s: 44.6, w: 11.5, n: 45.6, e: 20 } }, { name: 'Ligur', box: { s: 45.0, w: 10.05, n: 45.2, e: 10.25 } }]);
    const ls = labels(svg);
    // Round eighty-six (review P's P1): a name is written only on its own region's land, so the long name, which fits in
    // the frame only clamped back west of its region's edge, is left out rather than written there.
    expect(ls.map((l) => l.name)).not.toContain('Bosnia-Herzegovina Federation');
    for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) expect(overlap(ls[i].box, ls[j].box), `${ls[i].name} over ${ls[j].name}`).toBe(false);
  });
  it('a name is not drawn over the scale bar, nor over one of a few records', () => {
    const pts: Array<[number, number]> = [[-27, -66], [-27.5, -65.5], [-26.6, -65.9]];
    // A region whose middle falls on the first record.
    const svg = regionSvg([TDWG3.AGW], pts, undefined, 'Records', [{ name: 'Argentina Northwest', box: { s: -28, w: -67, n: -26, e: -65 } }]);
    expect(svg).toContain('<path d="M-66 27h0"/>');
    for (const l of labels(svg)) {
      // The scale bar's words sit at the frame's foot, from 4% across.
      expect(overlap(l.box, [0.03, 0.8, 0.2, 0.98]), `${l.name} over the scale bar`).toBe(false);
    }
    // Wherever it is placed, it is not where it would cover the record at the region's middle: moved a line, or left out.
    const m = labels(svg)[0];
    if (m) expect(Math.abs((m.box[1] + m.box[3]) / 2 - 0.5)).toBeGreaterThan(0.04);
  });
});

describe('records off the drawn coast', () => {
  it('the coast reach\'s and the islands\' records are rings, and the key says so', () => {
    const o = { open: [[-36.85, 174.76, 2020, 'NZ', 'HUMAN_OBSERVATION', 'by'], [-35.47, 174.735, 2021, 'NZ', 'HUMAN_OBSERVATION', 'by'], [-35.408, 174.648, 2021, 'NZ', 'HUMAN_OBSERVATION', 'by']] as Array<[number, number, number, string, string, string]>, edge: { island: [1], coast: [2] } };
    const pts = mapPoints(o);
    expect(pts).toEqual([[-36.85, 174.76], [-35.47, 174.735, 1], [-35.408, 174.648, 1]]);
    const svg = regionSvg([TDWG3.NZN], pts, undefined, 'Records');
    expect((svg.match(/<circle cx=/g) ?? []).length).toBe(2);
    expect(svg).toContain('<g class="occ-sea"');
    expect(svg).toContain('○ 2 records off the drawn coast');
    // A dossier of today's corpus has no `edge`: every record is a dot, as before.
    expect(mapPoints({ open: o.open })).toEqual(o.open.map((p) => [p[0], p[1]]));
  });
});
