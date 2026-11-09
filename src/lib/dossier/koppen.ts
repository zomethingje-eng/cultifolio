/**
 * The habitat's Köppen–Geiger class, worked out from the page's own monthly figures (round eighty-seven, the stage-2
 * contract's `koppen`), by the thresholds of Peel, Finlayson and McMahon (2007), "Updated world map of the Köppen-Geiger
 * climate classification", Hydrology and Earth System Sciences 11, 1633–1644, https://doi.org/10.5194/hess-11-1633-2007,
 * Table 1 and section 2:
 *
 *   - B (arid) is tested first: MAP < 10 × Pthreshold; W (desert) if MAP < 5 × Pthreshold, else S (steppe); h if MAT ≥ 18,
 *     else k. Pthreshold is 2 × MAT where 70% of MAP falls in winter, 2 × MAT + 28 where 70% falls in summer, else
 *     2 × MAT + 14 (read here as "at least 70%").
 *   - A (tropical): Tcold ≥ 18; f if Pdry ≥ 60; m if Pdry ≥ 100 − MAP/25; else w.
 *   - C (temperate): Thot > 10 and 0 < Tcold < 18; D (cold): Thot > 10 and Tcold ≤ 0. Second letter s if Psdry < 40 and
 *     Psdry < Pwwet/3; w if Pwdry < Pswet/10; f otherwise. Where both s and w hold, w if the summer half's rain is more
 *     than the winter half's, else s (the paper's own rule, section 2, Herberton). Third letter a if Thot ≥ 22; b if
 *     Tmon10 ≥ 4; d (D only) if Tcold < −38; c otherwise (for C, 1 ≤ Tmon10 < 4; Tmon10 0 cannot reach C, whose Thot > 10).
 *   - E (polar): Thot < 10; T if Thot > 0, else F.
 *
 * Summer is the warmer of the six months October to March and April to September, winter the other. The temperature of a
 * month is its mean (`tmean`). MAT, MAP: the mean of the twelve months and their sum. The months read are the page's median
 * year (each month's median across the range's cells), the year the page shows, so the class is the median year's, not
 * a class of every cell. A warmest month of exactly 10 °C is on the paper's boundary of E ("< 10") and C or D ("> 10"):
 * no class, and the page says why.
 */

export interface KoppenFigures {
  /** The class letters ("Csb"); absent only on the paper's own boundary, `why` saying so. */
  cls?: string;
  why?: string;
  /** The figures the class came from, °C and mm, one decimal (rain whole). */
  mat: number;
  map: number;
  thot: number;
  tcold: number;
  tmon10: number;
  pdry: number;
  /** Which half is summer: 'AMJJAS' (April to September) or 'ONDJFM'. */
  summer: 'AMJJAS' | 'ONDJFM';
  psdry: number;
  pswet: number;
  pwdry: number;
  pwwet: number;
  /** The summer half's share of the year's rain, 0 to 1, four decimals. */
  summerShare: number;
  pth: number;
  /**
   * Which of the three thresholds Pthreshold took (round eighty-seven's review of stage 2): `summer` (+ 28, 70% or more
   * of the rain in summer), `winter` (+ 0, 70% or more in winter), `neither` (+ 14), by the unrounded shares. The page
   * says it from this, not from `summerShare` rounded, which could put a share of 69.6% at 70%. Absent in a record
   * written before: read from `summerShare`.
   */
  pthBy?: 'summer' | 'winter' | 'neither';
}

type Month = { tmean: number; precipMm: number };

const r1 = (x: number) => Math.round(x * 10) / 10;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const AMJJAS = [3, 4, 5, 6, 7, 8];
const ONDJFM = [9, 10, 11, 0, 1, 2];

/** The class of a year of twelve months; null for anything but twelve months with a mean temperature and rain each. */
export function koppenOf(months: ReadonlyArray<Month> | null | undefined): KoppenFigures | null {
  if (!months || months.length !== 12 || !months.every((m) => Number.isFinite(m?.tmean) && Number.isFinite(m?.precipMm))) return null;
  const t = months.map((m) => m.tmean), p = months.map((m) => m.precipMm);
  const mat = t.reduce((a, x) => a + x, 0) / 12;
  const map = p.reduce((a, x) => a + x, 0);
  const thot = Math.max(...t), tcold = Math.min(...t);
  const tmon10 = t.filter((x) => x > 10).length;
  const pdry = Math.min(...p);
  const mean = (ix: number[]) => ix.reduce((a, i) => a + t[i], 0) / ix.length;
  const summerIx = mean(AMJJAS) >= mean(ONDJFM) ? AMJJAS : ONDJFM;
  const winterIx = summerIx === AMJJAS ? ONDJFM : AMJJAS;
  const ps = summerIx.map((i) => p[i]), pw = winterIx.map((i) => p[i]);
  const psdry = Math.min(...ps), pswet = Math.max(...ps), pwdry = Math.min(...pw), pwwet = Math.max(...pw);
  const sumS = ps.reduce((a, x) => a + x, 0), sumW = pw.reduce((a, x) => a + x, 0);
  const summerShare = map > 0 ? sumS / map : 0;
  const winterShare = map > 0 ? sumW / map : 0;
  // The unrounded shares are tested; the page prints the share to as many places as show which side of 70% it is.
  const pthBy = winterShare >= 0.7 ? 'winter' as const : summerShare >= 0.7 ? 'summer' as const : 'neither' as const;
  const pth = pthBy === 'winter' ? 2 * mat : pthBy === 'summer' ? 2 * mat + 28 : 2 * mat + 14;
  const figures: KoppenFigures = { mat: r1(mat), map: Math.round(map), thot: r1(thot), tcold: r1(tcold), tmon10, pdry: Math.round(pdry), summer: summerIx === AMJJAS ? 'AMJJAS' : 'ONDJFM', psdry: Math.round(psdry), pswet: Math.round(pswet), pwdry: Math.round(pwdry), pwwet: Math.round(pwwet), summerShare: r4(summerShare), pth: r1(pth), pthBy };
  // B first: every arid place meets one of the other classes' temperature tests too (the paper, section 2).
  if (map < 10 * pth) return { ...figures, cls: `B${map < 5 * pth ? 'W' : 'S'}${mat >= 18 ? 'h' : 'k'}` };
  if (tcold >= 18) return { ...figures, cls: `A${pdry >= 60 ? 'f' : pdry >= 100 - map / 25 ? 'm' : 'w'}` };
  if (thot < 10) return { ...figures, cls: `E${thot > 0 ? 'T' : 'F'}` };
  if (thot === 10) return { ...figures, why: "the warmest month's mean is 10 °C exactly, on Peel and others' boundary between E (under 10 °C) and C or D (over 10 °C)" };
  const first = tcold > 0 ? 'C' : 'D';
  const s = psdry < 40 && psdry < pwwet / 3;
  const w = pwdry < pswet / 10;
  const second = s && w ? (sumS > sumW ? 'w' : 's') : s ? 's' : w ? 'w' : 'f';
  const third = thot >= 22 ? 'a' : tmon10 >= 4 ? 'b' : first === 'D' && tcold < -38 ? 'd' : 'c';
  return { ...figures, cls: `${first}${second}${third}` };
}

/** What each letter means, as Peel and others' Table 1 names it, by its place in the class. */
const FIRST: Record<string, string> = { A: 'tropical', B: 'arid', C: 'temperate', D: 'cold', E: 'polar' };
const SECOND: Record<string, Record<string, string>> = {
  A: { f: 'rainforest', m: 'monsoon', w: 'savannah' },
  B: { W: 'desert', S: 'steppe' },
  C: { s: 'dry summer', w: 'dry winter', f: 'without dry season' },
  D: { s: 'dry summer', w: 'dry winter', f: 'without dry season' },
  E: { T: 'tundra', F: 'frost' }
};
const THIRD: Record<string, Record<string, string>> = {
  B: { h: 'hot', k: 'cold' },
  C: { a: 'hot summer', b: 'warm summer', c: 'cold summer' },
  D: { a: 'hot summer', b: 'warm summer', c: 'cold summer', d: 'very cold winter' }
};

/** Each letter of a class with its meaning: [["C", "temperate"], ["s", "dry summer"], ["b", "warm summer"]]. */
export function koppenLetters(cls: string): Array<[string, string]> {
  const [a, b, c] = [...cls];
  const out: Array<[string, string]> = [];
  if (a && FIRST[a]) out.push([a, FIRST[a]]);
  if (b && SECOND[a]?.[b]) out.push([b, SECOND[a][b]]);
  if (c && THIRD[a]?.[c]) out.push([c, THIRD[a][c]]);
  return out;
}

/** The class in words: "temperate, dry summer, warm summer". */
export const koppenWords = (cls: string) => koppenLetters(cls).map(([, w]) => w).join(', ');

export const KOPPEN_CITED = 'Peel, Finlayson and McMahon (2007), Hydrology and Earth System Sciences 11, 1633–1644, Table 1';
export const KOPPEN_DOI = 'https://doi.org/10.5194/hess-11-1633-2007';

const n1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/^-/, '−');
/**
 * A share as a percentage, to as many places as show the side of a threshold the test found it on (`side`, of the
 * printed percentage): 72%, 69.6%, 69.96% against 70% (round eighty-seven's review of stage 2: the share was printed and
 * tested rounded to two places, so 69.6% read as 70%). Four places of the share are kept; where even they print the
 * other side, the words say it.
 */
export function shareWords(share: number, side: (pct: number) => boolean, near: string, from = 0): string {
  for (let d = from; d <= 2; d++) {
    const t = (share * 100).toFixed(d);
    if (side(Number(t))) return `${t}%`;
  }
  return near;
}
const at70 = (share: number, over: boolean, from = 0) => shareWords(share, (p) => (p >= 70) === over, over ? '70%' : 'just under 70%', from);
/** The places a share took to print (0 to 2), so the other half's share is printed to as many. */
const placesOf = (words: string) => /\.(\d+)%$/.exec(words)?.[1].length ?? 0;
const mm = (x: number) => `${Math.round(x)} mm`;
const c1 = (x: number) => `${n1(x)} °C`;

/**
 * Each letter of the class with the test that gave it, in the figures it came from (°C and mm, the units of the
 * thresholds), as the page shows them: [letter, meaning, test]. Fixed words around the page's figures; nothing generated.
 */
export function koppenReasons(k: KoppenFigures): Array<[string, string, string]> {
  if (!k.cls) return [];
  const [a, b, c] = [...k.cls];
  const letters = koppenLetters(k.cls);
  const meaning = (i: number) => letters[i]?.[1] ?? '';
  const out: Array<[string, string, string]> = [];
  const by = k.pthBy ?? (1 - k.summerShare >= 0.7 ? 'winter' : k.summerShare >= 0.7 ? 'summer' : 'neither');
  const s0 = at70(k.summerShare, by === 'summer'), w0 = at70(1 - k.summerShare, by === 'winter');
  const places = Math.max(placesOf(s0), placesOf(w0));
  const inSummer = at70(k.summerShare, by === 'summer', places), inWinter = at70(1 - k.summerShare, by === 'winter', places);
  const pthWords = `${n1(k.pth)} mm (2 × ${n1(k.mat)}${by === 'summer' ? ` + 28: ${inSummer} of the rain in summer, 70% or more` : by === 'winter' ? `: ${inWinter} of the rain in winter, 70% or more` : ` + 14: ${inSummer} of the rain in summer and ${inWinter} in winter, neither 70% or more`})`;
  if (a === 'B') {
    out.push(['B', meaning(0), `${mm(k.map)} a year, under 10 × ${pthWords}`]);
    out.push([b, meaning(1), b === 'W' ? `under 5 × ${n1(k.pth)} mm` : `5 × ${n1(k.pth)} mm or more`]);
    out.push([c, meaning(2), c === 'h' ? `the year's mean temperature ${c1(k.mat)}, 18 °C or more` : `the year's mean temperature ${c1(k.mat)}, under 18 °C`]);
    return out;
  }
  const notB = `not arid: ${mm(k.map)} a year, 10 × ${pthWords} or more`;
  if (a === 'A') {
    out.push(['A', meaning(0), `the coldest month ${c1(k.tcold)}, 18 °C or more; ${notB}`]);
    out.push([b, meaning(1), b === 'f' ? `the driest month ${mm(k.pdry)}, 60 mm or more` : b === 'm' ? `the driest month ${mm(k.pdry)}, under 60 mm but at least 100 − ${mm(k.map)} ÷ 25 = ${n1(100 - k.map / 25)} mm` : `the driest month ${mm(k.pdry)}, under 60 mm and under 100 − ${mm(k.map)} ÷ 25 = ${n1(100 - k.map / 25)} mm`]);
    return out;
  }
  if (a === 'E') {
    out.push(['E', meaning(0), `the warmest month ${c1(k.thot)}, under 10 °C; ${notB}`]);
    out.push([b, meaning(1), b === 'T' ? `the warmest month over 0 °C` : `the warmest month 0 °C or under`]);
    return out;
  }
  const half = k.summer === 'AMJJAS' ? 'April to September' : 'October to March';
  out.push([a, meaning(0), `${a === 'C' ? `the coldest month ${c1(k.tcold)}, over 0 and under 18 °C` : `the coldest month ${c1(k.tcold)}, 0 °C or under`}; the warmest ${c1(k.thot)}, over 10 °C; ${notB}`]);
  const s = k.psdry < 40 && k.psdry < k.pwwet / 3, w = k.pwdry < k.pswet / 10;
  const sWords = `the driest summer month (summer ${half}) ${mm(k.psdry)}, under 40 mm and under a third of the wettest winter month's ${mm(k.pwwet)}`;
  const wWords = `the driest winter month ${mm(k.pwdry)}, under a tenth of the wettest summer month's ${mm(k.pswet)} (summer ${half})`;
  out.push([b, meaning(1), b === 's' ? (w ? `${sWords}; the winter test holds too, and summer has the less rain (${shareWords(k.summerShare, (p) => p <= 50, 'half')})` : sWords) : b === 'w' ? (s ? `${wWords}; the summer test holds too, and summer has the more rain (${shareWords(k.summerShare, (p) => p > 50, 'just over half')})` : wWords) : `neither: the driest summer month ${mm(k.psdry)} against the wettest winter month's ${mm(k.pwwet)}, the driest winter month ${mm(k.pwdry)} against the wettest summer month's ${mm(k.pswet)} (summer ${half})`]);
  out.push([c, meaning(2), c === 'a' ? `the warmest month ${c1(k.thot)}, 22 °C or more` : c === 'b' ? `the warmest month under 22 °C, ${k.tmon10} months over 10 °C` : c === 'd' ? `the coldest month ${c1(k.tcold)}, under −38 °C` : `the warmest month under 22 °C, ${k.tmon10} month${k.tmon10 === 1 ? '' : 's'} over 10 °C`]);
  return out;
}
