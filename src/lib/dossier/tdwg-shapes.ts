/**
 * The regions' shapes for the range test (round eighty, A; review-w 5): a record is inside a WGSRPD level-3 region when it
 * lies in the region's shape, or within `SHAPE_BUFFER_DEG` of its edge (the shapes are simplified to about 2 km, and a
 * coastline or a border is not drawn closer than that); a region without a shape is tested by its bounding box, as every
 * region was before. Before, every region was its rectangle: Tanzania's (south -11.74, west 29.34, north -1.0, east 40.43)
 * holds Nairobi, so the snake plant's marker and climate came from Kenya, outside its range.
 *
 * The shapes (`scripts/tdwg3-shapes.json`) are made by `scripts/dev/r80a-tdwg-shapes.py` from Natural Earth's 1:10m states and
 * provinces (public domain, naturalearthdata.com), each placed in a region by TDWG's own tables of the scheme's second
 * edition; a region is given a shape only where every state or province of its countries was placed. Round eighty-four
 * (G; review D2, A2): a remote island no longer keeps a whole region out (it goes to its own region, or is left out), so
 * 366 of the 369 regions have a shape, against 244; the other three are Cocos (Keeling) and Christmas Is., which Natural
 * Earth's states and provinces do not draw, and the South China Sea, whose Spratly Is. TDWG gives no country. A box is
 * tested with the same buffer as a shape, and a record in no region's shape counts for the region whose coast is nearest
 * within `COAST_DEG` (an islet Natural Earth does not draw, a record at sea). TDWG's own polygons are not used: their metadata reserves the boundaries' rights
 * to ESRI. Read by the builder; the Worker never loads them (the maps draw `static/app/maps/regions110.svg` and
 * `regions50.svg`, made from the same file by `scripts/dev/r84g-region-maps.py`).
 */
import { TDWG3 } from './tdwg';
import { inBox } from '$core/geo';

/** A polygon: its rings, the first the outer, in thousandths of a degree, [lon, lat]. */
type Ring = Array<[number, number]>;
type Poly = Ring[];
/** The file's shape: `meta.source` says where the shapes come from; `shapes` is each region's polygons. */
export interface ShapesFile { meta: { source: string; regions?: number; boxOnly?: number; rule?: string }; shapes: Record<string, Poly[]> }
/** The file the builder reads (node only; `regionTester`). */
export const SHAPES_FILE = 'scripts/tdwg3-shapes.json';
/** How far outside a region's edge a record still counts as inside it, in degrees (about 5.5 km). */
export const SHAPE_BUFFER_DEG = 0.05;
/**
 * Round eighty-four (G): how far off a region's drawn coast a record in no region's shape, at sea or on an islet Natural
 * Earth's provinces do not draw (the Iles d'Hyeres, the Frioul islands, the skerries of the Turku archipelago), still counts
 * as that region's, when that region's coast is the nearest: in degrees (about 17 km). A record on another region's land
 * is never one (Belgium is in no shape of France's, whatever its distance).
 */
export const COAST_DEG = 0.15;

/**
 * The shapes' rule: the version of the rules the shapes file was made by (`meta.rule`; round eighty-three's file has none).
 * A page derived with it says so (`occurrences.rangeRule`), and `--check-ranges` lists every page that was not.
 */
export const RANGE_RULE = 'r84';
/** The test of a record against a region, made from the shapes file: in its shape (or the buffer), else in its box (and the buffer). */
export interface RegionTester { inRegion(lat: number, lon: number, code: string): boolean; hasShape(code: string): boolean; source: string; rule?: string }
/** A box grown by a buffer on every side (a box across 180° grows the same way). */
export function grownBox(b: { s: number; w: number; n: number; e: number }, d: number) {
  return { s: b.s - d, n: b.n + d, w: b.w - d < -180 ? b.w - d + 360 : b.w - d, e: b.e + d > 180 ? b.e + d - 360 : b.e + d };
}
export function regionTester(file: ShapesFile, buffer = SHAPE_BUFFER_DEG, coast = COAST_DEG): RegionTester {
  const SHAPES = file.shapes;
type Prepared = { box: { s: number; w: number; n: number; e: number }; polys: Array<{ s: number; w: number; n: number; e: number; rings: Float64Array[] }> };
const prepared = new Map<string, Prepared | null>();
function prepare(code: string): Prepared | null {
  if (prepared.has(code)) return prepared.get(code)!;
  const ps = SHAPES[code];
  if (!ps?.length) { prepared.set(code, null); return null; }
  const out: Prepared = { box: { s: 90, w: 180, n: -90, e: -180 }, polys: [] };
  for (const p of ps) {
    const rings = p.map((r) => Float64Array.from(r.flatMap(([x, y]) => [x / 1000, y / 1000])));
    let s = 90, w = 180, n = -90, e = -180;
    for (const r of rings) for (let i = 0; i < r.length; i += 2) { w = Math.min(w, r[i]); e = Math.max(e, r[i]); s = Math.min(s, r[i + 1]); n = Math.max(n, r[i + 1]); }
    out.polys.push({ s, w, n, e, rings });
    out.box = { s: Math.min(out.box.s, s), w: Math.min(out.box.w, w), n: Math.max(out.box.n, n), e: Math.max(out.box.e, e) };
  }
  prepared.set(code, out);
  return out;
}


/** Even-odd test of a point against a polygon's rings (holes are rings too). */
function inside(lon: number, lat: number, rings: Float64Array[]): boolean {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}
/** Whether a point lies within `d` degrees of a polygon's edge, longitude scaled by the latitude's cosine. */
function near(lon: number, lat: number, rings: Float64Array[], d: number): boolean {
  const k = Math.cos((lat * Math.PI) / 180), d2 = d * d;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = (r[j] - lon) * k, ay = r[j + 1] - lat, bx = (r[i] - lon) * k, by = r[i + 1] - lat;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      if (px * px + py * py <= d2) return true;
    }
  }
  return false;
}

/** The least distance from a point to a polygon's edges, in degrees, longitude scaled by the latitude's cosine. */
function dist(lon: number, lat: number, rings: Float64Array[]): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = (r[j] - lon) * k, ay = r[j + 1] - lat, bx = (r[i] - lon) * k, by = r[i + 1] - lat;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      const px = ax + t * dx, py = ay + t * dy;
      best = Math.min(best, px * px + py * py);
    }
  }
  return Math.sqrt(best);
}
/** Every region with a shape, prepared, the first time a record lies off a coast (round eighty-four). */
let all: Array<{ code: string; p: Prepared }> | null = null;
const regions = () => (all ??= Object.keys(SHAPES).flatMap((code) => { const p = prepare(code); return p ? [{ code, p }] : []; }));
/** The last point asked of `offCoast`, and its answer: a record is tested against each of its page's native regions in turn. */
let lastAt = '', lastNearest: string | null = null;
/**
 * The region whose drawn coast is nearest a point in no region's shape, when that coast is within `coast` degrees; null
 * when the point is on some region's land, or no coast is that near.
 */
function offCoast(lat: number, lon: number): string | null {
  const at = `${lat},${lon}`;
  if (at === lastAt) return lastNearest;
  const dLon = coast / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const best = new Map<string, number>();
  for (const x0 of [lon, lon + 360, lon - 360]) {
    for (const { code, p } of regions()) {
      const b = p.box;
      if (lat < b.s - coast || lat > b.n + coast || x0 < b.w - dLon || x0 > b.e + dLon) continue;
      for (const q of p.polys) {
        if (lat < q.s - coast || lat > q.n + coast || x0 < q.w - dLon || x0 > q.e + dLon) continue;
        // On some region's land: not at sea, and no coast's.
        if (inside(x0, lat, q.rings)) { lastAt = at; lastNearest = null; return null; }
        const d = dist(x0, lat, q.rings);
        if (d <= coast && d < (best.get(code) ?? Infinity)) best.set(code, d);
      }
    }
  }
  lastAt = at;
  lastNearest = !best.size ? null : [...best].sort((a, b) => a[1] - b[1])[0][0];
  return lastNearest;
}

/**
 * Whether a record lies in a level-3 region: in its shape (or within the buffer of its edge); or, in no region's shape, off
 * this region's coast, the nearest, within `coast` (round eighty-four); else, for a region with no shape, in its box.
 */
function inRegion(lat: number, lon: number, code: string): boolean {
  const p = prepare(code);
  // A region without a shape: its box, with the shape's buffer (round eighty-four, A2: Indigofera taiwaniana's records at
  // Kenting, 21.927° N, were outside Taiwan's box, whose south edge is 21.928°, though Taiwan's tip is at 21.897°).
  if (!p) { const b = TDWG3[code]; return !!b && inBox(lat, lon, buffer > 0 ? grownBox(b, buffer) : b); }
  const b = p.box;
  // How far around the region a record is tested: the buffer, or the coast's reach; in longitude, scaled by the latitude.
  const mLat = Math.max(buffer, coast), mLon = mLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  if (lat < b.s - mLat || lat > b.n + mLat || lon < b.w - mLon - 1e-9 || lon > b.e + mLon) {
    // A region across the antimeridian (Fiji, the Aleutians) is drawn on both sides: try the point shifted a turn.
    if (!(b.w < -179 && b.e > 179)) return false;
  }
  let offshore = false;
  for (const q of p.polys) {
    for (const x of [lon, lon + 360, lon - 360]) {
      if (lat < q.s - mLat || lat > q.n + mLat || x < q.w - mLon || x > q.e + mLon) continue;
      if (inside(x, lat, q.rings) || (buffer > 0 && near(x, lat, q.rings, buffer))) return true;
      if (coast > buffer && !offshore && near(x, lat, q.rings, coast)) offshore = true;
    }
  }
  return offshore && offCoast(lat, lon) === code;
}
  return { inRegion, hasShape: (code) => !!SHAPES[code]?.length, source: file.meta.source, ...(file.meta.rule ? { rule: file.meta.rule } : {}) };
}

/**
 * How many of a dossier's openly licensed in-range records lie outside every native region's shape (round eighty, A):
 * the pages `--list-range-shapes` lists for a re-derivation. Restricted records are in no dossier, so a page whose only
 * such records are restricted is not found here (Aloe vera's, in Fujairah): round eighty-four derives every page again,
 * and `--check-ranges` tests each page's typical cell and its records' rule (`range-check.ts`).
 */
export function outsideShapes(d: { distribution?: { native?: ReadonlyArray<{ code?: string }> }; occurrences?: { open?: ReadonlyArray<readonly [number, number, ...unknown[]]>; rangeTested?: boolean } }, t: RegionTester): number {
  const codes = (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));
  const open = d.occurrences?.open ?? [];
  if (!codes.length || !open.length || d.occurrences?.rangeTested === false || !codes.some((c) => t.hasShape(c))) return 0;
  return open.filter((p) => !codes.some((c) => t.inRegion(p[0], p[1], c))).length;
}

