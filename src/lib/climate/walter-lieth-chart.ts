/**
 * The Walter–Lieth diagram's geometry (round ninety-eight, docs/PLAN-98.md, 3): the climate diagram of Walter and Lieth
 * (Klimadiagramm-Weltatlas, 1960–1967) drawn from the same median year as the reading (`walterLieth`). One shared scale:
 * 10 °C on the left against 20 mm of rain on the right, so the rain curve below the temperature curve marks an arid month
 * and above it a humid one; rain over 100 mm is drawn at a tenth of the scale, as the diagram draws it. Pure: the
 * component draws what this returns, and the test reads it.
 */
export type WlMonth = { tmean: number; precipMm: number };
export type WlChart = {
  /** The plot's box in the SVG's units. */
  box: { x0: number; x1: number; y0: number; y1: number };
  /** The temperature axis's ticks (°C), each with its y, and the matching rain figure (mm) on the right. */
  ticks: Array<{ y: number; c: number; mm: number }>;
  /** Where the rain scale changes to a tenth (100 mm), when the year's rain reaches over it; else null. */
  compressAt: number | null;
  /** The two curves, as SVG points ("x,y x,y …"), one point a month at its middle. */
  temp: string;
  rain: string;
  /** The areas between them: arid (rain under the temperature curve) and humid (over it). */
  arid: string[];
  humid: string[];
  /** Each month's x, for its label. */
  monthX: number[];
};

const W = 360, H = 220;
const BOX = { x0: 44, x1: W - 44, y0: 26, y1: H - 26 };

/** Rain in mm on the diagram's scale, in °C units: half the millimetres up to 100, a tenth of the rest above. */
export const rainScaled = (mm: number) => (mm <= 100 ? mm / 2 : 50 + (mm - 100) / 20);

export function walterLiethChart(months: readonly WlMonth[] | null | undefined): WlChart | null {
  if (!months || months.length !== 12 || !months.every((m) => Number.isFinite(m?.tmean) && Number.isFinite(m?.precipMm))) return null;
  const t = months.map((m) => m.tmean);
  const r = months.map((m) => rainScaled(Math.max(0, m.precipMm)));
  const lo = Math.min(0, Math.floor(Math.min(...t) / 10) * 10);
  const hi = Math.max(30, Math.ceil(Math.max(...t, ...r) / 10) * 10);
  const y = (c: number) => BOX.y1 - ((c - lo) / (hi - lo)) * (BOX.y1 - BOX.y0);
  const step = (BOX.x1 - BOX.x0) / 12;
  const monthX = Array.from({ length: 12 }, (_, i) => BOX.x0 + step * (i + 0.5));
  const pts = (v: number[]) => v.map((c, i) => `${monthX[i].toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  // The areas between the curves, from January's middle to December's: each segment split where the curves cross.
  const arid: string[] = [], humid: string[] = [];
  let run: { wet: boolean; top: Array<[number, number]>; bottom: Array<[number, number]> } | null = null;
  const close = () => { if (run && run.top.length > 1) (run.wet ? humid : arid).push([...run.top, ...run.bottom.reverse()].map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')); run = null; };
  // At a crossing the curves are equal: the point belongs to the run ending and to the run beginning (`side`).
  const add = (x: number, tc: number, rc: number, side?: boolean) => {
    const wet = side ?? rc >= tc;
    if (run && run.wet !== wet) close();
    run ??= { wet, top: [], bottom: [] };
    run.top.push([x, y(Math.max(tc, rc))]);
    run.bottom.push([x, y(Math.min(tc, rc))]);
  };
  for (let i = 0; i < 12; i++) {
    add(monthX[i], t[i], r[i]);
    if (i === 11) break;
    const d0 = r[i] - t[i], d1 = r[i + 1] - t[i + 1];
    if (d0 * d1 < 0) {
      const f = d0 / (d0 - d1);
      const x = monthX[i] + f * step, c = t[i] + f * (t[i + 1] - t[i]);
      add(x, c, c, d0 >= 0);
      close();
      add(x, c, c, d1 >= 0);
    }
  }
  close();
  const ticks: WlChart['ticks'] = [];
  for (let c = lo; c <= hi; c += 10) ticks.push({ y: y(c), c, mm: c <= 50 ? Math.max(0, c * 2) : 100 + (c - 50) * 20 });
  return { box: BOX, ticks, compressAt: r.some((v) => v > 50) ? y(50) : null, temp: pts(t), rain: pts(r), arid: arid.filter((p) => p.split(' ').length > 2), humid: humid.filter((p) => p.split(' ').length > 2), monthX };
}

export const WL_SIZE = { w: W, h: H };
