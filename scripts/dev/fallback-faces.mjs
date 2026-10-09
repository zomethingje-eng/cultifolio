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
// weighting). The local faces' figures are @capsizecss/metrics 4.3.0's tables, read from the package in /tmp (not a
// dependency), except DejaVu's, read from the files on Linux. The web fonts' are the files this site serves
// (@fontsource-variable/public-sans and /newsreader, the `wght` files, instanced at each weight with fontTools'
// varLib.instancer; @fontsource/dm-mono 400), weighted the same way; checked against capsize's own figures where it has
// them (Public Sans 400: 935, Newsreader 400: 857, Liberation Sans: 913 as Arial). The monospace faces need no
// average: every advance in them is one width (DM Mono 600/1000, Consolas 1126/2048, Menlo and DejaVu Sans Mono
// 1233/2048, Liberation Mono 1229/2048).
//
// Weights: a family with a bold face has two faces, `100 500` and `600 900`; the bold face is scaled to the web font's
// 600, the weight of the site's buttons, chips, tabs and serif titles (the 700 text is short capitals). Segoe UI has a
// semibold, so it has three. A local bold face and not the regular one emboldened: Safari and Firefox widen synthetic
// bold glyphs (a pixel or so each), Chromium does not, so a bold the browser makes is a different width in each.

const WEB = {
  sans: { name: 'Public Sans', upm: 2000, ascent: 1900, descent: 450, xw: { 400: 935, 600: 948, 700: 959 } },
  serif: { name: 'Newsreader', upm: 2000, ascent: 1470, descent: 530, xw: { 400: 857, 600: 900 }, xwi: { 400: 804, 600: 873 } },
  mono: { name: 'DM Mono', upm: 1000, ascent: 992, descent: 310, adv: 600 }
};

/** [family suffix, [[weight descriptor, style, web weight, locals, local xw, local upm]]] */
const SANS = [
  ['Segoe', [['100 500', 'normal', 400, ['Segoe UI', 'SegoeUI'], 908, 2048], ['600', 'normal', 600, ['Segoe UI Semibold', 'SegoeUI-Semibold'], 937, 2048], ['700 900', 'normal', 700, ['Segoe UI Bold', 'SegoeUI-Bold'], 973, 2048]]],
  ['Roboto', [['100 500', 'normal', 400, ['Roboto Regular', 'Roboto-Regular', 'Roboto'], 911, 2048], ['600 900', 'normal', 600, ['Roboto Bold', 'Roboto-Bold'], 926, 2048]]],
  ['Helvetica Neue', [['100 500', 'normal', 400, ['Helvetica Neue', 'HelveticaNeue'], 450, 1000], ['600 900', 'normal', 600, ['Helvetica Neue Bold', 'HelveticaNeue-Bold'], 480, 1000]]],
  ['Arial', [['100 500', 'normal', 400, ['Arial', 'ArialMT'], 913, 2048], ['600 900', 'normal', 600, ['Arial Bold', 'Arial-BoldMT'], 983, 2048]]],
  ['Liberation', [['100 500', 'normal', 400, ['Liberation Sans', 'LiberationSans'], 913, 2048], ['600 900', 'normal', 600, ['Liberation Sans Bold', 'LiberationSans-Bold'], 983, 2048]]],
  ['DejaVu', [['100 500', 'normal', 400, ['DejaVu Sans', 'DejaVuSans'], 1041, 2048], ['600 900', 'normal', 600, ['DejaVu Sans Bold', 'DejaVuSans-Bold'], 1176, 2048]]]
];
const four = (r, b, i, bi, upm) => [['100 500', 'normal', 400, ...r, upm], ['600 900', 'normal', 600, ...b, upm], ['100 500', 'italic', 400, ...i, upm], ['600 900', 'italic', 600, ...bi, upm]];
const SERIF = [
  ['Georgia', four([['Georgia'], 913], [['Georgia Bold', 'Georgia-Bold'], 1062], [['Georgia Italic', 'Georgia-Italic'], 931], [['Georgia Bold Italic', 'Georgia-BoldItalic'], 1082], 2048)],
  ['Times', four([['Times New Roman', 'TimesNewRomanPSMT'], 832], [['Times New Roman Bold', 'TimesNewRomanPS-BoldMT'], 886], [['Times New Roman Italic', 'TimesNewRomanPS-ItalicMT'], 836], [['Times New Roman Bold Italic', 'TimesNewRomanPS-BoldItalicMT'], 857], 2048)],
  ['Noto', four([['Noto Serif Regular', 'NotoSerif-Regular', 'Noto Serif'], 481], [['Noto Serif Bold', 'NotoSerif-Bold'], 512], [['Noto Serif Italic', 'NotoSerif-Italic'], 469], [['Noto Serif Bold Italic', 'NotoSerif-BoldItalic'], 517], 1000)],
  ['Liberation', four([['Liberation Serif', 'LiberationSerif'], 832], [['Liberation Serif Bold', 'LiberationSerif-Bold'], 886], [['Liberation Serif Italic', 'LiberationSerif-Italic'], 836], [['Liberation Serif Bold Italic', 'LiberationSerif-BoldItalic'], 857], 2048)],
  ['DejaVu', four([['DejaVu Serif', 'DejaVuSerif'], 1058], [['DejaVu Serif Bold', 'DejaVuSerif-Bold'], 1168], [['DejaVu Serif Italic', 'DejaVuSerif-Italic'], 1058], [['DejaVu Serif Bold Italic', 'DejaVuSerif-BoldItalic'], 1168], 2048)]
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
  const web = WEB.sans;
  face(`Public Sans Fallback ${suffix}`, w, st, locals, web, web.xw[ww] / web.upm, xw / upm, `(${web.xw[ww]}/${web.upm}) / (${xw}/${upm}), ${web.name} ${ww} over ${locals[0]}`);
}
for (const [suffix, faces] of SERIF) for (const [w, st, ww, locals, xw, upm] of faces) {
  const web = WEB.serif; const wx = (st === 'italic' ? web.xwi : web.xw)[ww];
  face(`Newsreader Fallback ${suffix}`, w, st, locals, web, wx / web.upm, xw / upm, `(${wx}/${web.upm}) / (${xw}/${upm}), ${web.name} ${st === 'italic' ? 'italic ' : ''}${ww} over ${locals[0]}`);
}
for (const [suffix, locals, adv, upm] of MONO) {
  const web = WEB.mono;
  face(`DM Mono Fallback ${suffix}`, '400', 'normal', locals, web, web.adv / web.upm, adv / upm, `(${web.adv}/${web.upm}) / (${adv}/${upm}), one advance each`);
}
if (process.argv.includes('--css')) console.log(css.join('\n'));
else console.log(notes.join('\n') + '\n\n' + css.join('\n'));
