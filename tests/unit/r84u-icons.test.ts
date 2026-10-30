/**
 * Round eighty-four, agent U: W13, the console's one error and what the app's icons carry.
 *
 * Chromium logged "Error while trying to use the following icon from the Manifest: …/favicon.svg (Download error or
 * resource isn't a valid image)": the manifest listed the SVG, of no stated size and carrying a 5.8 kB C2PA manifest
 * ("Claude provided this file…"), beside the PNGs. The three PNGs carried C2PA too (a `caBX` chunk). Now the manifest
 * names the PNGs only (the page's own <link rel="icon"> keeps the SVG for the tab), the SVG is its drawing alone with a
 * size, and the PNGs carry no `caBX`: their header and pixel data are kept byte for byte.
 *
 * On r84base: the manifest named favicon.svg; every icon held a C2PA manifest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = 'static/app/';
/** A PNG's chunks, in order, with their bytes. */
function chunks(b: Buffer): Array<{ type: string; data: Buffer }> {
  expect(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  const out: Array<{ type: string; data: Buffer }> = [];
  for (let i = 8; i < b.length; ) {
    const n = b.readUInt32BE(i);
    out.push({ type: b.toString('latin1', i + 4, i + 8), data: b.subarray(i + 8, i + 8 + n) });
    i += 12 + n;
  }
  return out;
}

describe('the app\'s icons (W13)', () => {
  const manifest = JSON.parse(readFileSync(dir + 'manifest.webmanifest', 'utf8')) as { icons: Array<{ src: string; sizes: string; type: string }> };
  it('the manifest names PNGs of the size it states, and nothing that is not a raster of a stated size', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons) {
      expect(icon.type, icon.src).toBe('image/png');
      const c = chunks(readFileSync(dir + icon.src.slice(1)));
      const ihdr = c[0];
      expect(ihdr.type).toBe('IHDR');
      expect(`${ihdr.data.readUInt32BE(0)}x${ihdr.data.readUInt32BE(4)}`, icon.src).toBe(icon.sizes);
    }
    expect(manifest.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });
  it('no icon carries a C2PA manifest, and the PNGs\' pixels are the ones they had', () => {
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og.png']) {
      const now = chunks(readFileSync(dir + f));
      expect(now.map((c) => c.type).filter((t) => !['IHDR', 'IDAT', 'IEND', 'PLTE', 'tRNS', 'sRGB', 'gAMA', 'pHYs'].includes(t)), f).toEqual([]);
      // Against the base's file, where git has it: the header and the pixel data unchanged, byte for byte.
      let before: Buffer | null = null;
      try { before = execFileSync('git', ['show', `r84base:${dir}${f}`], { maxBuffer: 1 << 24 }); } catch { /* not a checkout with the base: the chunk test above stands */ }
      if (!before) continue;
      const was = chunks(before).filter((c) => c.type === 'IHDR' || c.type === 'IDAT');
      const is = now.filter((c) => c.type === 'IHDR' || c.type === 'IDAT');
      expect(Buffer.concat(is.map((c) => c.data)).equals(Buffer.concat(was.map((c) => c.data))), f).toBe(true);
    }
    const svg = readFileSync(dir + 'favicon.svg', 'utf8');
    expect(svg).not.toMatch(/c2pa|<metadata/i);
    expect(svg).toMatch(/^<svg [^>]*width="64" height="64"/);
    expect(svg.length).toBeLessThan(400);
  });
});
