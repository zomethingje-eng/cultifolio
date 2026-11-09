// Prints the fallback @font-face block of src/lib/ui/theme.css, with each face's arithmetic, so the faces can be checked
// and drawn again: `node scripts/dev/fallback-faces.mjs` (`--css` prints the block alone). Nothing imports this.
//
// Each local face the font stacks fall back to is declared again, scaled so that its average letter is as wide as the web
// font's at the weight it stands in for, and with the web font's ascent and descent, so text set in it before the web fonts
// arrive wraps at the same words and its lines are the same height (round sixty-three; review of round sixty-two, 11).
//
//   size-adjust      = (web xWidthAvg / web unitsPerEm) / (local xWidthAvg / local unitsPerEm)
//   ascent-override  = (web ascent / web unitsPerEm) / size-adjust
//   descent-override = (web |descent| / web unitsPerEm) / size-adjust
//   line-gap-override = 0 (every web font here has a line gap of 0)
//
// xWidthAvg is capsize's weighted average advance (letter frequencies of English text, @capsizecss/unpack's `latin`
// weighting). The local faces' figures are @capsizecss/metrics 4.3.0's tables, read from the package in a scratch folder
// (not a dependency), except Liberation's and DejaVu's, read from the files on Linux.
//
// Round eighty-seven (the owner's type, 8 November): the web fonts are Source Sans 3, Source Serif 4 and Source Code Pro,
// the files in static/fonts/ (@fontsource-variable/source-sans-3 5.3.1, @fontsource-variable/source-serif-4 5.3.1, the
// optical-size italic, and @fontsource/source-code-pro 5.3.1 at 400), instanced at each weight with fontTools'
// varLib.instancer and weighted the same way; capsize's own figures agree where it has them (Source Sans 3 400: 418,
// italic 408, 600: 431). Source Serif 4 is set only in italic, for the scientific names, and only its italic is served,
// so the serif's faces are italic alone. Its width changes with its optical size, which the browser sets to the text's
// size in px (449 at 12, 426 at 18, 418 at 20, 400 at 44); the faces are scaled to its instance at 18, within 2.5% of
// it at every running-text size from 14 to 21 px, where a name in a sentence decides where the line wraps. A display
// name (the species page's 44 px heading) is one short line in either face. The monospace faces need no average: every
// advance in them is one width (Source Code Pro 600/1000, Consolas 1126/2048, Menlo and DejaVu Sans Mono 1233/2048,
// Liberation Mono 1229/2048).
//
// Weights: a family with a bold face has two faces, `100 500` and `600 900`; the bold face is scaled to the web font's
// 600, the weight of the site's buttons, section heads and wordmark. Segoe UI has a semibold, so its roman has three.
// A local bold face and not the regular one emboldened: Safari and Firefox widen synthetic bold glyphs (a pixel or so
// each), Chromium does not, so a bold the browser makes is a different width in each. The sans has its italic too (it is
// served, round eighty-seven), each with its own local italic: Segoe UI's italic is 2% narrower than its roman.

const WEB = {
  sans: { name: 'Source Sans 3', upm: 1000, ascent: 1024, descent: 400, xw: { 400: 418, 600: 431, 700: 443 }, xwi: { 400: 408, 600: 419 } },
  serif: { name: 'Source Serif 4', upm: 1000, ascent: 1036, descent: 335, xwi: { 400: 426, 600: 443 } },
  mono: { name: 'Source Code Pro', upm: 1000, ascent: 984, descent: 273, adv: 600 }
};

/** [family suffix, [[weight descriptor, style, web weight, locals, local xw, local upm]]] */
const SANS = [
  ['Segoe', [['100 500', 'normal', 400, ['Segoe UI', 'SegoeUI'], 908, 2048], ['600', 'normal', 600, ['Segoe UI Semibold', 'SegoeUI-Semibold'], 937, 2048], ['700 900', 'normal', 700, ['Segoe UI Bold', 'SegoeUI-Bold'], 973, 2048],
    ['100 500', 'italic', 400, ['Segoe UI Italic', 'SegoeUI-Italic'], 888, 2048], ['600 900', 'italic', 600, ['Segoe UI Semibold Italic', 'SegoeUI-SemiboldItalic'], 927, 2048]]],
  ['Roboto', [['100 500', 'normal', 400, ['Roboto Regular', 'Roboto-Regular', 'Roboto'], 911, 2048], ['600 900', 'normal', 600, ['Roboto Bold', 'Roboto-Bold'], 926, 2048],
    ['100 500', 'italic', 400, ['Roboto Italic', 'Roboto-Italic'], 886, 2048], ['600 900', 'italic', 600, ['Roboto Bold Italic', 'Roboto-BoldItalic'], 900, 2048]]],
  ['Helvetica Neue', [['100 500', 'normal', 400, ['Helvetica Neue', 'HelveticaNeue'], 450, 1000], ['600 900', 'normal', 600, ['Helvetica Neue Bold', 'HelveticaNeue-Bold'], 480, 1000],
    ['100 500', 'italic', 400, ['Helvetica Neue Italic', 'HelveticaNeue-Italic'], 448, 1000], ['600 900', 'italic', 600, ['Helvetica Neue Bold Italic', 'HelveticaNeue-BoldItalic'], 481, 1000]]],
  ['Arial', [['100 500', 'normal', 400, ['Arial', 'ArialMT'], 913, 2048], ['600 900', 'normal', 600, ['Arial Bold', 'Arial-BoldMT'], 983, 2048],
    ['100 500', 'italic', 400, ['Arial Italic', 'Arial-ItalicMT'], 913, 2048], ['600 900', 'italic', 600, ['Arial Bold Italic', 'Arial-BoldItalicMT'], 983, 2048]]],
  ['Liberation', [['100 500', 'normal', 400, ['Liberation Sans', 'LiberationSans'], 913, 2048], ['600 900', 'normal', 600, ['Liberation Sans Bold', 'LiberationSans-Bold'], 983, 2048],
    ['100 500', 'italic', 400, ['Liberation Sans Italic', 'LiberationSans-Italic'], 913, 2048], ['600 900', 'italic', 600, ['Liberation Sans Bold Italic', 'LiberationSans-BoldItalic'], 983, 2048]]],
  ['DejaVu', [['100 500', 'normal', 400, ['DejaVu Sans', 'DejaVuSans'], 1041, 2048], ['600 900', 'normal', 600, ['DejaVu Sans Bold', 'DejaVuSans-Bold'], 1176, 2048],
    ['100 500', 'italic', 400, ['DejaVu Sans Oblique', 'DejaVuSans-Oblique'], 1041, 2048], ['600 900', 'italic', 600, ['DejaVu Sans Bold Oblique', 'DejaVuSans-BoldOblique'], 1176, 2048]]]
];
const two = (i, bi, upm) => [['100 500', 'italic', 400, ...i, upm], ['600 900', 'italic', 600, ...bi, upm]];
const SERIF = [
  ['Georgia', two([['Georgia Italic', 'Georgia-Italic'], 931], [['Georgia Bold Italic', 'Georgia-BoldItalic'], 1082], 2048)],
  ['Times', two([['Times New Roman Italic', 'TimesNewRomanPS-ItalicMT'], 836], [['Times New Roman Bold Italic', 'TimesNewRomanPS-BoldItalicMT'], 857], 2048)],
  ['Noto', two([['Noto Serif Italic', 'NotoSerif-Italic'], 469], [['Noto Serif Bold Italic', 'NotoSerif-BoldItalic'], 517], 1000)],
  ['Liberation', two([['Liberation Serif Italic', 'LiberationSerif-Italic'], 836], [['Liberation Serif Bold Italic', 'LiberationSerif-BoldItalic'], 857], 2048)],
  ['DejaVu', two([['DejaVu Serif Italic', 'DejaVuSerif-Italic'], 1058], [['DejaVu Serif Bold Italic', 'DejaVuSerif-BoldItalic'], 1168], 2048)]
];
/** [suffix, locals, advance, upm] */
const MONO = [
  ['Consolas', ['Consolas'], 1126, 2048],
  ['Menlo', ['Menlo Regular', 'Menlo-Regular', 'Menlo'], 1233, 2048],
  ['Liberation', ['Liberation Mono', 'LiberationMono'], 1229, 2048],
  ['DejaVu', ['DejaVu Sans Mono', 'DejaVuSansMono'], 1233, 2048]
];

const pct = (x) => `${(x * 100).toFixed(4).replace(/\.?0+$/, '')}%`;
const css = [];
const notes = [];
function face(family, weight, style, locals, web, webWidth, localWidth, why) {
  const s = webWidth / localWidth;
  const a = web.ascent / web.upm / s, d = web.descent / web.upm / s;
  notes.push(`${family} ${weight} ${style}: ${why}; size ${pct(s)}, ascent ${(web.ascent / web.upm).toFixed(4)} / ${s.toFixed(5)} = ${pct(a)}, descent ${(web.descent / web.upm).toFixed(4)} / ${s.toFixed(5)} = ${pct(d)}`);
  const w = weight === '400' ? '' : ` font-weight: ${weight};`;
  const st = style === 'normal' ? '' : ` font-style: ${style};`;
  css.push(`@font-face { font-family: '${family}';${st}${w} src: ${locals.map((l) => `local('${l}')`).join(', ')}; ascent-override: ${pct(a)}; descent-override: ${pct(d)}; line-gap-override: 0%; size-adjust: ${pct(s)}; }`);
}
for (const [suffix, faces] of SANS) for (const [w, st, ww, locals, xw, upm] of faces) {
  const web = WEB.sans; const wx = (st === 'italic' ? web.xwi : web.xw)[ww];
  face(`Source Sans 3 Fallback ${suffix}`, w, st, locals, web, wx / web.upm, xw / upm, `(${wx}/${web.upm}) / (${xw}/${upm}), ${web.name} ${st === 'italic' ? 'italic ' : ''}${ww} over ${locals[0]}`);
}
for (const [suffix, faces] of SERIF) for (const [w, st, ww, locals, xw, upm] of faces) {
  const web = WEB.serif; const wx = web.xwi[ww];
  face(`Source Serif 4 Fallback ${suffix}`, w, st, locals, web, wx / web.upm, xw / upm, `(${wx}/${web.upm}) / (${xw}/${upm}), ${web.name} italic ${ww} at optical size 18 over ${locals[0]}`);
}
for (const [suffix, locals, adv, upm] of MONO) {
  const web = WEB.mono;
  face(`Source Code Pro Fallback ${suffix}`, '400', 'normal', locals, web, web.adv / web.upm, adv / upm, `(${web.adv}/${web.upm}) / (${adv}/${upm}), one advance each`);
}
if (process.argv.includes('--css')) console.log(css.join('\n'));
else console.log(notes.join('\n') + '\n\n' + css.join('\n'));
