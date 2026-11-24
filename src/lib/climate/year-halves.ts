/**
 * The year in two halves (round 118; SPECIES 19), the months the page's rules already read: the wet months and the rest
 * where `growingYear` reads a rainy season (a winter or summer one, not under 120 mm, not frozen), else the warmer six
 * months by mean temperature and the cooler six. Each half's figures are the median year's months averaged, its rain
 * summed; nothing is read that the table does not hold.
 */
type Month = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number };
type YearRead = { grow: string; fog: boolean; frozen: boolean; growMonths: number[] } | null;
export interface Half {
  /** "wet" and "dry", or "warmer" and "cooler". */
  kind: 'wet' | 'dry' | 'warmer' | 'cooler';
  /** Habitat months, 1 to 12, in calendar order. */
  months: number[];
  dayC: number;
  nightC: number;
  rainMm: number;
  rh: number | null;
  dli: number | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const opt = (xs: Array<number | undefined>) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? mean(v) : null; };

export function yearHalves(months: readonly Month[], year: YearRead): [Half, Half] | null {
  if (months.length !== 12) return null;
  let a: number[];
  let kinds: ['wet', 'dry'] | ['warmer', 'cooler'];
  if (year && (year.grow === 'winter' || year.grow === 'summer') && !year.fog && !year.frozen && year.growMonths.length && year.growMonths.length < 12) {
    a = [...year.growMonths].sort((x, y) => x - y);
    kinds = ['wet', 'dry'];
  } else {
    a = [...months.keys()].sort((x, y) => months[y].tmean - months[x].tmean || x - y).slice(0, 6).map((i) => i + 1).sort((x, y) => x - y);
    kinds = ['warmer', 'cooler'];
  }
  const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !a.includes(m));
  const half = (ms: number[], kind: Half['kind']): Half => {
    const xs = ms.map((m) => months[m - 1]);
    return { kind, months: ms, dayC: mean(xs.map((x) => x.tmax)), nightC: mean(xs.map((x) => x.tmin)), rainMm: xs.reduce((s, x) => s + x.precipMm, 0), rh: opt(xs.map((x) => x.rh)), dli: opt(xs.map((x) => x.dli)) };
  };
  return [half(a, kinds[0]), half(b, kinds[1])];
}
