/**
 * Round eighty-four, G (review W1): both maps draw the native regions' shapes, from two static files referenced like the
 * coastline, not their bounding boxes ("Cape Provinces" was a dashed box from the Atlantic to the Karoo, half of it sea);
 * a region with no shape is still its box; and the close-up says when the whole frame lies inside one region, rather than
 * painting the frame (Echeveria desmetiana's close-up was one green field).
 *
 * FAILS on r84base: `regions-drawn.ts` and the two files do not exist, and every region is a <rect>.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { worldSvg, regionSvg, regionOfBox, frameInside } from '../../src/lib/map/still';
import { REGION_AT, INSIDE } from '../../src/lib/map/regions-drawn';
import { TDWG3 } from '../../src/lib/dossier/tdwg';

const world = readFileSync('static/app/maps/regions110.svg', 'utf8');
const close = readFileSync('static/app/maps/regions50.svg', 'utf8');

describe('the maps draw the shapes', () => {
  it('every region with a shape is a path in both files, and a box names it', () => {
    const codes = Object.values(REGION_AT);
    expect(codes.length).toBe(366);
    for (const c of codes) {
      expect(world, c).toContain(`<path id="${c}" `);
      expect(close, c).toContain(`<path id="${c}" `);
      expect(regionOfBox(TDWG3[c])).toBe(c);
    }
    // Small enough to fetch once a day, as the coastline is: under 130 kB and 450 kB.
    expect(world.length).toBeLessThan(130_000);
    expect(close.length).toBeLessThan(450_000);
  });
  it('the world map: the Cape Provinces as their shape, once; Christmas Island, with none, as its box', () => {
    const svg = worldSvg([TDWG3.CPP, TDWG3.CPP, TDWG3.XMS], undefined, 'Native range');
    expect(svg.match(/<use class="range" href="\/maps\/regions110\.svg#CPP"\/>/g)?.length).toBe(1);
    expect(svg.match(/<rect class="range"/g)?.length).toBe(1);
  });
  it('the close-up: the shapes of its own file', () => {
    const svg = regionSvg([TDWG3.CPP], [[-33.9, 18.4], [-33.95, 18.5], [-34.0, 18.45]], undefined, 'Records');
    expect(svg).toContain('<use class="range" href="/maps/regions50.svg#CPP"/>');
    expect(svg).not.toContain('<rect class="range"');
  });
  it('a box the reference does not know is drawn as before', () => {
    expect(worldSvg([{ s: 1, w: 2, n: 3, e: 4 }])).toContain('<rect class="range" x="2" y="-3" width="2" height="2"/>');
  });
});

describe('the close-up says when its frame is inside one region', () => {
  // The region with the largest rectangle wholly inside its shape, and a few records in that rectangle's middle.
  const [code, rect] = Object.entries(INSIDE).map(([c, rs]) => [c, rs[0]] as const).sort((a, b) => (b[1][2] - b[1][0]) * (b[1][3] - b[1][1]) - (a[1][2] - a[1][0]) * (a[1][3] - a[1][1]))[0];
  const mid: [number, number] = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
  const box = TDWG3[code];
  it(`records in the middle of ${code}: "Inside", once, and no other name`, () => {
    const svg = regionSvg([box], [mid, [mid[0] + 0.1, mid[1]], [mid[0], mid[1] + 0.1]], undefined, 'Records', [{ name: 'Somewhere Large', box }]);
    expect(svg.match(/class="mlab mlab-in"[^>]*>Inside Somewhere Large</g)?.length).toBe(1);
  });
  it('a frame that reaches past the rectangle is not said to be inside', () => {
    expect(frameInside(box, rect[1] - 1, rect[2], rect[3], rect[0])).toBe(false);
    expect(frameInside(box, rect[1], rect[2], rect[3], rect[0])).toBe(true);
    expect(frameInside({ s: 1, w: 2, n: 3, e: 4 }, 2, 3, 4, 1)).toBe(false);
  });
});
