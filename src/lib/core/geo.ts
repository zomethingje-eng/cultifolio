/**
 * Geography helpers for the dossier builder: distance, boxes, and the
 * densest-cluster centroid that replaces a naive median.
 *
 * The median of a scattered range is a place the plant has never been. So the
 * builder finds the densest cluster of occurrence points on a coarse grid and
 * takes the median of that cluster; if no cluster clearly dominates, it
 * reports no centroid rather than an invented one.
 */

export interface Box {
  s: number;
  w: number;
  n: number;
  e: number;
}

export function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371,
    r = Math.PI / 180;
  const dLa = (la2 - la1) * r,
    dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function inBox(lat: number, lon: number, b: Box): boolean {
  if (lat < b.s || lat > b.n) return false;
  if (b.w <= b.e) return lon >= b.w && lon <= b.e;
  return lon >= b.w || lon <= b.e; // antimeridian
}

export function within(inner: Box, outer: Box): boolean {
  return inner.s >= outer.s && inner.n <= outer.n && inner.w >= outer.w && inner.e <= outer.e;
}

export function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export interface Cluster {
  lat: number;
  lon: number;
  n: number;
  /** Share of all points that fell in the winning cluster. */
  share: number;
  /** Whether the cluster clearly dominates (share ≥ 0.5, or ≥ 2× the runner-up). */
  dominant: boolean;
  /** Grid size in degrees at which dominance was found. */
  cell: number;
  /** The cluster's points, so a caller can refine within it. */
  points: Array<[number, number]>;
}

/** Circular median of longitudes: unwrap onto [0, 360) when the set straddles the antimeridian, so Fiji's median is near 180, not 0. */
export function medianLon(lons: number[]): number {
  const straddles = lons.some((x) => x > 90) && lons.some((x) => x < -90);
  if (!straddles) return median(lons);
  const m = median(lons.map((x) => (x < 0 ? x + 360 : x)));
  return m > 180 ? m - 360 : m;
}

/**
 * Points are [lat, lon]. cell is the grid size in degrees. Longitude bins wrap
 * at ±180 so a population astride the antimeridian is one cluster. The
 * runner-up is the largest window sharing no bin with the winner: overlapping
 * windows contain the same points and are not a rival population.
 */
export function densestCluster(points: Array<[number, number]>, cell = 1): Cluster | null {
  if (!points.length) return null;
  const nLon = Math.round(360 / cell);
  const bins = new Map<string, Array<[number, number]>>();
  const key = (i: number, j: number) => `${i}:${((j % nLon) + nLon) % nLon}`;
  for (const p of points) {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
    let b = bins.get(k);
    if (!b) bins.set(k, (b = []));
    b.push(p);
  }
  // Grow each bin by its 8 neighbours so a cluster straddling a grid line still counts as one.
  const windows: Array<{ bins: string[]; pts: Array<[number, number]>; core: Array<[number, number]> }> = [];
  for (const k of bins.keys()) {
    const [i, j] = k.split(':').map(Number);
    const used: string[] = [];
    const grown: Array<[number, number]> = [];
    let core: Array<[number, number]> = [];
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const kk = key(i + di, j + dj);
        const b = bins.get(kk);
        if (b) {
          used.push(kk);
          grown.push(...b);
          if (b.length > core.length) core = b;
        }
      }
    windows.push({ bins: used, pts: grown, core });
  }
  windows.sort((a, b) => b.pts.length - a.pts.length);
  const best = windows[0];
  const bestBins = new Set(best.bins);
  const rival = windows.find((w) => !w.bins.some((b) => bestBins.has(b)));
  const second = rival ? rival.pts.length : 0;
  const share = best.pts.length / points.length;
  const dominant = share >= 0.5 || best.pts.length >= 2 * Math.max(1, second);
  // The window's middle is its median, unless that median falls in a bin much emptier than the window's fullest:
  // two populations a bin apart with one stray record between them are one window, and the median of all their
  // records lands on the stray. Then the fullest bin's median is the middle, which is a population.
  let lat = median(best.pts.map((p) => p[0])), lon = medianLon(best.pts.map((p) => p[1]));
  const medBin = bins.get(key(Math.floor(lat / cell), Math.floor(lon / cell)));
  if ((medBin?.length ?? 0) * 2 < best.core.length) (lat = median(best.core.map((p) => p[0]))), (lon = medianLon(best.core.map((p) => p[1])));
  return {
    lat,
    lon,
    n: best.pts.length,
    share,
    dominant,
    cell,
    points: best.pts
  };
}

/** The point nearest a target: a place the plant has actually been recorded. */
export function nearestPoint(points: Array<[number, number]>, lat: number, lon: number): [number, number] {
  let best = points[0],
    bd = Infinity;
  for (const p of points) {
    const d = haversineKm(lat, lon, p[0], p[1]);
    if (d < bd) (bd = d), (best = p);
  }
  return best;
}

/**
 * A broad but coherent range (a species spread evenly over 3–5°) never has
 * one 1° cell that dominates, and it is not "scattered". So the test is run
 * at increasing grid sizes and the first scale with a dominant cluster wins;
 * only a range with no dominant cluster even at 4° is called disjunct.
 */
export function habitatCluster(points: Array<[number, number]>, scales = [1, 2, 4]): Cluster | null {
  let last: Cluster | null = null;
  for (const cell of scales) {
    const c = densestCluster(points, cell);
    if (!c) return null;
    last = c;
    if (c.dominant) return c;
  }
  return last;
}

/**
 * Where to sample climate for a cluster. The median of a broad cluster can be
 * a place no record is (the median of eastern South Africa is the Lesotho
 * highlands). So: within the winning cluster find the densest 1° sub-cluster,
 * then snap to the nearest record that may be republished (an open licence),
 * so the centre is a place the plant has been recorded AND a coordinate the
 * dossier is allowed to carry. When no open record lies in the cluster, the
 * centre is the middle of the 1° sub-cluster, rounded to a tenth of a
 * degree (about 10 km): a grid point, not anyone's record, and close enough
 * that the climate cell is still the population's. `how` says which.
 */
export function habitatCentre(c: Cluster, openPoints: Array<[number, number]>): { lat: number; lon: number; refined: boolean; snapped: 'open-record' | 'cell-centre' } {
  let lat = c.lat,
    lon = c.lon,
    refined = false;
  if (c.cell > 1 && c.points.length > 2) {
    const sub = densestCluster(c.points, 1);
    if (sub) (lat = sub.lat), (lon = sub.lon), (refined = true);
  }
  const inCluster = new Set(c.points.map((p) => `${p[0]},${p[1]}`));
  const candidates = openPoints.filter((p) => inCluster.has(`${p[0]},${p[1]}`));
  if (candidates.length) {
    const p = nearestPoint(candidates, lat, lon);
    return { lat: p[0], lon: p[1], refined, snapped: 'open-record' };
  }
  // The centre of the tenth-degree cell, never its corner: a record given to 0.1° sits on the corner, so
  // the centre is a coordinate no record has, whatever precision the restricted records carry.
  const open = new Set(openPoints.map((p) => `${p[0]},${p[1]}`));
  // Compared and returned at three decimals: floor(x·10)/10 + 0.05 is −24.85000000000001 in floating point, and an
  // exact comparison let a restricted record given to two decimals sit on the "centre" unnoticed.
  let cl = +(Math.floor(lat * 10) / 10 + 0.05).toFixed(3);
  const cn = +(Math.floor(lon * 10) / 10 + 0.05).toFixed(3);
  const onIt = (a: number, b: number) => c.points.some((p) => !open.has(`${p[0]},${p[1]}`) && +p[0].toFixed(3) === a && +p[1].toFixed(3) === b);
  if (onIt(cl, cn)) cl = +(cl + 0.01).toFixed(3);
  return { lat: cl, lon: cn, refined, snapped: 'cell-centre' };
}
