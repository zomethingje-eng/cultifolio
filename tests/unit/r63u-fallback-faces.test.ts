/**
 * Round sixty-three, agent U (U1): the fallback faces in theme.css are the ones scripts/dev/fallback-faces.mjs computes,
 * and every stack names them before the generic faces. On the base the monospace stack had none: Windows set the front
 * page's count in Consolas (0.550 em a letter against DM Mono's 0.600), it fitted beside the title, and when DM Mono came
 * it wrapped under it, a layout shift of 0.107 at 390 px (the review of round sixty-two, 11).
 *
 * Round eighty-seven (the owner's type): the faces stand in for Source Sans 3, Source Serif 4 (its italic alone, the
 * scientific names') and Source Code Pro; the promises are the same.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const css = readFileSync('src/lib/ui/theme.css', 'utf8');
const stack = (name: string) => (css.match(new RegExp(`--${name}: ([^;]+);`)) ?? [])[1] ?? '';
const fams = (s: string) => s.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));

describe('the fallback faces (round sixty-three, U1; the fonts of round eighty-seven)', () => {
  it('theme.css holds exactly the faces the script computes, in its order', () => {
    const out = execFileSync(process.execPath, ['scripts/dev/fallback-faces.mjs', '--css'], { encoding: 'utf8' }).trim().split('\n');
    const inCss = css.split('\n').filter((l) => /^@font-face \{ font-family: '(Source Sans 3|Source Serif 4|Source Code Pro) Fallback /.test(l));
    expect(inCss).toEqual(out);
  });
  it('the monospace stack names a tuned face for Windows, Apple and Linux before any generic face', () => {
    const f = fams(stack('mono'));
    expect(f[0]).toBe('Source Code Pro');
    for (const k of ['Consolas', 'Menlo', 'Liberation', 'DejaVu']) expect(f.indexOf(`Source Code Pro Fallback ${k}`)).toBeGreaterThan(0);
    const firstPlain = f.findIndex((x) => !x.startsWith('Source Code Pro'));
    expect(f.slice(firstPlain).some((x) => x.startsWith('Source Code Pro'))).toBe(false);
  });
  it('every family a stack names is declared, and every declared family is in its stack', () => {
    const declared = new Set([...css.matchAll(/@font-face \{ font-family: '([^']+ Fallback [^']+)'/g)].map((m) => m[1]));
    const named = new Set([...fams(stack('ui')), ...fams(stack('serif')), ...fams(stack('mono'))].filter((x) => x.includes(' Fallback ')));
    expect([...named].sort()).toEqual([...declared].sort());
  });
  it('a bold and an italic are their own local faces, scaled to the web font at that weight and style', () => {
    expect(css).toContain("font-family: 'Source Serif 4 Fallback Georgia'; font-style: italic; font-weight: 100 500; src: local('Georgia Italic')");
    expect(css).toContain("font-family: 'Source Serif 4 Fallback Georgia'; font-style: italic; font-weight: 600 900; src: local('Georgia Bold Italic')");
    expect(css).toContain("font-family: 'Source Sans 3 Fallback Segoe'; font-weight: 600; src: local('Segoe UI Semibold')");
    expect(css).toContain("font-family: 'Source Sans 3 Fallback Segoe'; font-style: italic; font-weight: 100 500; src: local('Segoe UI Italic')");
  });
  it('the serif, set only in italic, has no roman face to fall back to (its roman is never asked for)', () => {
    expect(css).not.toMatch(/font-family: 'Source Serif 4[^']*';(?! font-style: italic)/);
  });
  it("the Consolas face is scaled to Source Code Pro's advance: (600/1000) / (1126/2048) = 109.1297%", () => {
    expect(css).toMatch(/'Source Code Pro Fallback Consolas'; src: local\('Consolas'\); ascent-override: 90\.168%; descent-override: 25\.0161%; line-gap-override: 0%; size-adjust: 109\.1297%;/);
  });
  it('Source Sans 3 400 over Segoe UI: (418/1000) / (908/2048) = 94.2802%, with its ascent and descent over that', () => {
    expect(css).toContain("@font-face { font-family: 'Source Sans 3 Fallback Segoe'; font-weight: 100 500; src: local('Segoe UI'), local('SegoeUI'); ascent-override: 108.6124%; descent-override: 42.4267%; line-gap-override: 0%; size-adjust: 94.2802%; }");
  });
  it('no face of the fonts the look replaced is left (round eighty-seven)', () => {
    expect(css).not.toMatch(/font-family: '(Public Sans|Newsreader|DM Mono)|@fontsource/);
    expect(readFileSync('src/routes/+layout.svelte', 'utf8')).not.toMatch(/@fontsource/);
  });
});
