/**
 * The browse maps' arithmetic (round eighty-seven, C7): the frame a map shows, the steps of its colour scale, and the
 * files it draws from. Pure, for the server (the results map is drawn there) and the browser (the map picker).
 *
 * The maps draw from the site's own files and nothing else (plan C14): the world coastline (static/app/maps/land110.svg,
 * Natural Earth, public domain) and every level-3 region's world outline in one file (regions110.svg, round eighty-five,
 * each region a path by its code), referenced with <use> as the species page's world map references them, so the files
 * are fetched once and kept a day. Coordinates are degrees with y = -latitude, as those files are.
 */
export const LAND_FILE = '/maps/land110.svg';
export const REGIONS_FILE = '/maps/regions110.svg';

export interface Frame { x: number; y: number; w: number; h: number }
export const WORLD: Frame = { x: -180, y: -84, w: 360, h: 150 };
export const viewBoxOf = (f: Frame) => `${r1(f.x)} ${r1(f.y)} ${r1(f.w)} ${r1(f.h)}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The frame that holds every point given (longitude, latitude), padded by eight degrees and widened to the map's 12:5,
 * within the world's; the world where there is no point or the points span more than most of it. A results map fits all
 * its regions, so none is outside it (C9: "fit to all results").
 */
export function frameOf(points: ReadonlyArray<readonly [number, number]>, pad = 8): Frame {
  if (!points.length) return WORLD;
  let w = 180, e = -180, s = 90, n = -90;
  for (const [lon, lat] of points) { w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
  w -= pad; e += pad; s -= pad; n += pad;
  let W = e - w, H = n - s;
  const ratio = WORLD.w / WORLD.h;
  if (W / H < ratio) { const c = (w + e) / 2; W = H * ratio; w = c - W / 2; } else { const c = (s + n) / 2; H = W / ratio; s = c - H / 2; n = s + H; }
  if (W >= WORLD.w * 0.8 || H >= WORLD.h) return WORLD;
  w = Math.min(Math.max(w, WORLD.x), WORLD.x + WORLD.w - W);
  const top = Math.min(Math.max(-n, WORLD.y), WORLD.y + WORLD.h - H);
  return { x: w, y: top, w: W, h: H };
}

/** 1, 2, 5 times a power of ten, at or under x (x ≥ 1). */
const niceDown = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); return ([5, 2, 1].map((m) => m * p).find((v) => v <= x) ?? p); };
/**
 * The lower bounds of the colour scale's steps for counts up to `max`: at most five, from 1, about evenly apart on a
 * log scale and each a round number (1, 2, 5, 10, 20, 50…), so the legend's steps are the map's own (C9: "a stepped
 * legend matching the bins"). Up to five distinct counts, one step a count.
 */
export function stepsOf(max: number): number[] {
  if (max <= 5) return Array.from({ length: Math.max(1, max) }, (_, i) => i + 1);
  const out = new Set<number>([1]);
  for (let i = 1; i < 5; i++) out.add(niceDown(max ** (i / 5)));
  return [...out].sort((a, b) => a - b);
}
/** Which step a count falls in. */
export const stepOf = (n: number, steps: readonly number[]): number => { let k = 0; for (let i = 0; i < steps.length; i++) if (n >= steps[i]) k = i; return k; };
/** A step's words: "1", "2 to 4", "20 to 103". */
export function stepWords(steps: readonly number[], k: number, max: number): string {
  const lo = steps[k], hi = k + 1 < steps.length ? steps[k + 1] - 1 : max;
  const f = (n: number) => n.toLocaleString('en-GB');
  return lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`;
}
