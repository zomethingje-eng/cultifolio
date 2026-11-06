/**
 * Round eighty-six, the maps agent: review P's P1. The close-up wrote each region's name at the middle of the region's
 * box clipped to the frame, so an L-shaped region cut by the frame was named on another region's land: Hoodia alstonii's
 * close-up wrote "Cape Provinces" across southern Namibia. Now a name is written only at a point inside its region's
 * drawn shape (`region-labels.ts`, from the close-up's own outlines, scripts/dev/r86m-label-rects.py), or not at all.
 *
 * On r86base (1b663ea): FAILED. Hoodia alstonii's "Cape Provinces" written at 18.63° E, 27.72° S and "Namibia" at
 * 17.17° E, 27.13° S, both inside Namibia's shape; the random frames wrote 810 of 1,810 names off their own region's land
 * (at sea, or on another region); `region-labels.ts` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { regionSvg, regionOfBox } from '../../src/lib/map/still';
import { LABEL_AT } from '../../src/lib/map/region-labels';
import { REGION_AT } from '../../src/lib/map/regions-drawn';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

/** A region's drawn close-up outline (static/app/maps/r/r-<code>.svg) as rings of [lon, lat]. */
const ringsRead = new Map<string, Array<Array<[number, number]>>>();
function rings(code: string): Array<Array<[number, number]>> {
  if (!ringsRead.has(code)) ringsRead.set(code, readRings(code));
  return ringsRead.get(code)!;
}
function readRings(code: string): Array<Array<[number, number]>> {
  const d = / d="([^"]+)"/.exec(readFileSync(`static/app/maps/r/r-${code}.svg`, 'utf8'))![1];
  return (d.match(/M[^M]*/g) ?? []).map((part) => {
    const body = part.slice(1).replace(/z$/, '').replace('h0', '');
    const [head, rel = ''] = body.split('l');
    const num = (s: string) => (s.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    let [x, y] = num(head);
    const ring: Array<[number, number]> = [[x, -y]];
    const r = num(rel);
    for (let i = 0; i + 1 < r.length; i += 2) { x += r[i]; y += r[i + 1]; ring.push([x, -y]); }
    return ring;
  });
}
/** Even-odd, as the outline is filled. */
function inShape(code: string, lon: number, lat: number): boolean {
  let c = false;
  for (const ring of rings(code)) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if (ay > lat !== by > lat && lon < ax + ((bx - ax) * (lat - ay)) / (by - ay)) c = !c;
  }
  return c;
}
/**
 * The names the close-up writes, each where it is drawn as a longitude and latitude (the inverse of the frame's shares),
 * with how far the markup's rounding (to a thousandth of the frame) may have moved it, in degrees.
 */
function named(svg: string): Array<{ name: string; lon: number; lat: number; dx: number; dy: number }> {
  const [w, mn, W, H] = /viewBox="([^"]+)"/.exec(svg)![1].split(' ').map(Number);
  const n = -mn;
  const k = Math.min(1.5 / W, 1 / H), ox = (1.5 - W * k) / 2, oy = (1 - H * k) / 2;
  return [...svg.matchAll(/<span class="mlab" style="left:([\d.]+)%;top:([\d.]+)%">([^<]+)<\/span>/g)].map((m) => ({ name: m[3], lon: w + ((+m[1] / 100) * 1.5 - ox) / k, lat: n - (+m[2] / 100 - oy) / k, dx: (0.0005 * 1.5) / k, dy: 0.0005 / k }));
}
/** Inside the shape where it is drawn, or, for an islet smaller than the markup's rounding, within that rounding of it. */
const onLand = (code: string, g: { lon: number; lat: number; dx: number; dy: number }) => inShape(code, g.lon, g.lat) || [-1, 0, 1].some((i) => [-1, 0, 1].some((j) => inShape(code, g.lon + i * g.dx, g.lat + j * g.dy)));

// Hoodia alstonii's ten open records and its marker, as the live dossier (k506502, read 5 November) holds them.
const HOODIA: Array<[number, number]> = [[-26.317, 15.467], [-27.09, 16.407], [-28.875, 17.375], [-28.125, 16.875], [-28.375, 17.375], [-28.375, 17.125], [-27.875, 16.875], [-29.125, 18.875], [-28.131, 16.998], [-28.276, 17.218]];

describe("review P's P1: a region's name is written on its own land", () => {
  it("Hoodia alstonii: the Cape Provinces' name inside the Cape Provinces, Namibia's inside Namibia", () => {
    const svg = regionSvg([TDWG3.CPP, TDWG3.NAM], HOODIA, { lat: -28.276, lon: 17.218 }, 'Records', [{ name: 'Cape Provinces', box: TDWG3.CPP }, { name: 'Namibia', box: TDWG3.NAM }], false, LABEL_AT);
    const got = named(svg);
    const code: Record<string, string> = { 'Cape Provinces': 'CPP', Namibia: 'NAM' };
    expect(got.map((g) => g.name).sort()).toEqual(['Cape Provinces', 'Namibia']); // both written: the fix does not just drop them
    for (const g of got) {
      expect(inShape(code[g.name], g.lon, g.lat), `${g.name} at ${g.lon.toFixed(2)}, ${g.lat.toFixed(2)}`).toBe(true);
      for (const other of Object.values(code).filter((c) => c !== code[g.name])) expect(inShape(other, g.lon, g.lat), `${g.name} on ${other}`).toBe(false);
    }
  });

  it('over random frames on every region, a name written is always inside its own shape (the concave ones too)', () => {
    let seed = 86;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let written = 0;
    const bad: string[] = [];
    for (const code of Object.values(REGION_AT)) {
      const box = TDWG3[code];
      if (!box || box.w > box.e) continue;
      for (let t = 0; t < 5; t++) {
        // Three records near a point of the box: a frame a few degrees across that the region's box may cut anywhere.
        const la = box.s + rnd() * (box.n - box.s), lo = box.w + rnd() * (box.e - box.w), sp = 0.3 + rnd() * 2;
        const pts: Array<[number, number]> = [[la, lo], [la + sp, lo + sp], [la - sp, lo + sp / 2]];
        for (const g of named(regionSvg([box], pts, undefined, 'Records', [{ name: code, box }], false, LABEL_AT))) {
          written++;
          if (!onLand(code, g)) bad.push(`${code} ${g.lon.toFixed(2)},${g.lat.toFixed(2)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(written).toBeGreaterThan(900); // most frames still name their region (1,397 of 1,815 frames here; on r86base the box middle wrote 1,810 names, 810 of them off their land)
  });

  it('without the table (a move inside the app before it has loaded) a region with a shape is not named; a box-only region is still named in its box', () => {
    const pts: Array<[number, number]> = HOODIA;
    expect(named(regionSvg([TDWG3.CPP, TDWG3.NAM], pts, undefined, 'Records', [{ name: 'Cape Provinces', box: TDWG3.CPP }]))).toEqual([]);
    const box = { s: -30, w: 15, n: -26, e: 19 }; // no region's box: drawn as a box
    expect(regionOfBox(box)).toBeUndefined();
    expect(named(regionSvg([box], pts, undefined, 'Records', [{ name: 'Somewhere', box }])).map((g) => g.name)).toEqual(['Somewhere']);
  });

  it('the table has every region the close-up draws, each rectangle inside its shape', () => {
    expect(Object.keys(LABEL_AT).sort()).toEqual([...new Set(Object.values(REGION_AT))].sort());
    for (const code of Object.keys(LABEL_AT)) for (const [s, w, n, e] of LABEL_AT[code]) {
      for (const [lon, lat] of [[w, s], [w, n], [e, s], [e, n], [(w + e) / 2, (s + n) / 2]]) expect(inShape(code, lon, lat), `${code} ${lon},${lat}`).toBe(true);
    }
  });
});
