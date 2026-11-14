/**
 * Round ninety-one (the owner's icon, 14 November 2026; docs/REVIEW-ROUND-91.md): the icon files the site serves and the
 * manifest that names them.
 *
 * - The manifest names each PNG at the size it is, the standard icons "any" and the maskable one "maskable", apart (a
 *   maskable icon given as "any" is shown uncropped with its padding; a standard one as "maskable", cropped through).
 * - The apple-touch icon is a 180 px PNG of its own (iOS took the 192 px icon before, scaled).
 * - No served icon carries the Content Credentials the handoff's files came with (round eighty-four's rule, r84u-icons:
 *   the console error, the weight), and the masters kept in docs/icon/ do, so the provenance stays on record.
 *
 * On 0812e7b: FAILED. The manifest gave no purpose to the standard icons, there was no apple-touch-icon.png, and
 * docs/icon/ was not there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const APP = 'static/app/';
type Icon = { src: string; sizes: string; type: string; purpose?: string };
const manifest = JSON.parse(readFileSync(APP + 'manifest.webmanifest', 'utf8')) as { theme_color: string; background_color: string; icons: Icon[] };

/** A PNG's chunk types and its width and height. */
function png(path: string): { types: string[]; size: string } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString(), path).toBe('PNG');
  const types: string[] = [];
  for (let i = 8; i < b.length; i += 12 + b.readUInt32BE(i)) types.push(b.toString('latin1', i + 4, i + 8));
  return { types, size: `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` };
}

describe('r91a: the icon files', () => {
  it('the manifest names each icon at its size, the standard ones "any" and the maskable one "maskable", apart', () => {
    expect(manifest.icons.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ['/icon-192.png', '192x192', 'any'],
      ['/icon-512.png', '512x512', 'any'],
      ['/icon-maskable-512.png', '512x512', 'maskable']
    ]);
    for (const i of manifest.icons) expect(png(APP + i.src.slice(1)).size, i.src).toBe(i.sizes);
    // What does not change: the manifest's colours.
    expect([manifest.theme_color, manifest.background_color]).toEqual(['#1d5c45', '#ffffff']);
  });

  it('the apple-touch icon is a 180 px PNG of its own', () => {
    expect(existsSync(APP + 'apple-touch-icon.png')).toBe(true);
    expect(png(APP + 'apple-touch-icon.png').size).toBe('180x180');
  });

  it('no served icon carries Content Credentials; the masters in docs/icon/ keep theirs', () => {
    for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) expect(png(APP + f).types, f).not.toContain('caBX');
    expect(readFileSync(APP + 'favicon.svg', 'utf8')).not.toMatch(/c2pa|<metadata/i);
    for (const f of ['cultifolio-icon-master.svg', 'icon-maskable-master.svg']) expect(readFileSync('docs/icon/' + f, 'utf8'), f).toMatch(/<c2pa:manifest>/);
    expect(png('docs/icon/icon-1024.png').types).toContain('caBX');
    expect(png('docs/icon/icon-1024.png').size).toBe('1024x1024');
  });
});
