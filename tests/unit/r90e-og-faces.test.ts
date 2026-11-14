/**
 * Round ninety: the link-preview image (static/app/og.png, drawn by scripts/dev/og.mjs from scripts/dev/og.html) in round
 * eighty-seven's type, from the files the site serves, and nothing in the project left reading the old faces' packages, so
 * the owner can remove them from package.json (@fontsource-variable/newsreader, @fontsource-variable/public-sans,
 * @fontsource/dm-mono).
 *
 * On 8df264e: FAILED. og.mjs read the three faces from node_modules/@fontsource…, og.html drew Newsreader, Public Sans and
 * DM Mono on a green bar, and the image was that drawing: every share of a cultifolio.com link showed the look round
 * eighty-seven replaced.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OLD = /@fontsource-variable\/newsreader|@fontsource-variable\/public-sans|@fontsource\/dm-mono/;

/** Every file under a folder with one of the extensions, the folder's own node_modules left out. */
function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p, ext));
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

describe('r90e: the link-preview image in the site\'s own faces', () => {
  it('og.mjs reads the fonts the site serves, not an npm package', () => {
    const js = readFileSync('scripts/dev/og.mjs', 'utf8');
    expect(js).not.toMatch(/@fontsource|node_modules/); // base: node_modules/@fontsource-variable/newsreader/…
    expect(js).toContain("'static/fonts/'");
    expect(statSync('static/fonts/source-sans-3/source-sans-3-latin-wght-normal.woff2').size).toBeGreaterThan(10_000);
  });

  it('og.html draws in Source Sans 3 alone, on the light theme\'s white and ink', () => {
    const html = readFileSync('scripts/dev/og.html', 'utf8').replace(/<!--[\s\S]*?-->/, '');
    expect([...html.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1])).toEqual(['Source Sans 3', 'Source Sans 3']);
    expect(html).not.toMatch(/Newsreader|Public Sans|DM Mono|FONT_SERIF|FONT_MONO/);
    const css = readFileSync('src/lib/ui/theme.css', 'utf8');
    for (const c of ['#ffffff', '#1b1d1c', '#1d5c45']) {
      expect(html, c).toContain(c);
      expect(css, c).toContain(c);
    }
  });

  it('the image is a 1200 × 630 PNG', () => {
    const png = readFileSync('static/app/og.png');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it('nothing in the project imports the old faces\' packages, so removing them from package.json breaks nothing', () => {
    const all = [...files('src', /\.(ts|js|svelte|css|html)$/), ...files('scripts', /\.(ts|js|mjs|cjs|html)$/), ...files('tests', /\.(ts|js|mjs)$/).filter((f) => !f.endsWith('r90e-og-faces.test.ts')), 'svelte.config.js', 'vite.config.ts'];
    const using = all.filter((f) => OLD.test(readFileSync(f, 'utf8')));
    expect(using).toEqual([]); // base: scripts/dev/og.mjs
  });
});
