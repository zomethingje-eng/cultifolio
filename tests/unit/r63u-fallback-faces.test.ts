/**
 * Round sixty-three, agent U (U1): the fallback faces in theme.css are the ones scripts/dev/fallback-faces.mjs computes,
 * and every stack names them before the generic faces. On the base the monospace stack had none: Windows set the front
 * page's count in Consolas (0.550 em a letter against DM Mono's 0.600), it fitted beside the title, and when DM Mono came
 * it wrapped under it, a layout shift of 0.107 at 390 px (the review of round sixty-two, 11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const css = readFileSync('src/lib/ui/theme.css', 'utf8');
const stack = (name: string) => (css.match(new RegExp(`--${name}: ([^;]+);`)) ?? [])[1] ?? '';
const fams = (s: string) => s.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));

describe('the fallback faces (round sixty-three, U1)', () => {
  it('theme.css holds exactly the faces the script computes, in its order', () => {
    const out = execFileSync(process.execPath, ['scripts/dev/fallback-faces.mjs', '--css'], { encoding: 'utf8' }).trim().split('\n');
    const inCss = css.split('\n').filter((l) => /^@font-face \{ font-family: '(Public Sans|Newsreader|DM Mono) Fallback /.test(l));
    expect(inCss).toEqual(out);
  });
  it('the monospace stack names a tuned face for Windows, Apple and Linux before any generic face', () => {
    const f = fams(stack('mono'));
    expect(f[0]).toBe('DM Mono');
    for (const k of ['Consolas', 'Menlo', 'Liberation', 'DejaVu']) expect(f.indexOf(`DM Mono Fallback ${k}`)).toBeGreaterThan(0);
    const firstPlain = f.findIndex((x) => !x.startsWith('DM Mono'));
    expect(f.slice(firstPlain).some((x) => x.startsWith('DM Mono'))).toBe(false);
  });
  it('every family a stack names is declared, and every declared family is in its stack', () => {
    const declared = new Set([...css.matchAll(/@font-face \{ font-family: '([^']+ Fallback [^']+)'/g)].map((m) => m[1]));
    const named = new Set([...fams(stack('ui')), ...fams(stack('serif')), ...fams(stack('mono'))].filter((x) => x.includes(' Fallback ')));
    expect([...named].sort()).toEqual([...declared].sort());
  });
  it('a bold and an italic of the serif are their own local faces, scaled to Newsreader at that weight and style', () => {
    expect(css).toContain("font-family: 'Newsreader Fallback Georgia'; font-style: italic; font-weight: 100 500; src: local('Georgia Italic')");
    expect(css).toContain("font-family: 'Newsreader Fallback Georgia'; font-weight: 600 900; src: local('Georgia Bold')");
    expect(css).toContain("font-family: 'Public Sans Fallback Segoe'; font-weight: 600; src: local('Segoe UI Semibold')");
  });
  it('the Consolas face is scaled to DM Mono\'s advance: (600/1000) / (1126/2048) = 109.1297%', () => {
    expect(css).toMatch(/'DM Mono Fallback Consolas'; src: local\('Consolas'\); ascent-override: 90\.901%; descent-override: 28\.4066%; line-gap-override: 0%; size-adjust: 109\.1297%;/);
  });
});
