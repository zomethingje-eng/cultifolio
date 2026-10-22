/**
 * The regions' shapes for the range test (round eighty, A; review-w 5): a record is inside a WGSRPD level-3 region when it
 * lies in the region's shape, or within `SHAPE_BUFFER_DEG` of its edge (the shapes are simplified to about 2 km, and a
 * coastline or a border is not drawn closer than that); a region without a shape is tested by its bounding box, as every
 * region was before. Before, every region was its rectangle: Tanzania's (south -11.74, west 29.34, north -1.0, east 40.43)
 * holds Nairobi, so the snake plant's marker and climate came from Kenya, outside its range.
 *
 * The shapes (`scripts/tdwg3-shapes.json`) are made by `scripts/dev/r80a-tdwg-shapes.py` from Natural Earth's 1:10m states and
 * provinces (public domain, naturalearthdata.com), each placed in a region by TDWG's own tables of the scheme's second
 * edition; a region is given a shape only where every state or province of its countries was placed and the shape lies
 * within the region's box. TDWG's own polygons are not used: their metadata reserves the boundaries' rights to ESRI. Read
 * by the builder only; the Worker never loads them.
 */
import { TDWG3 } from './tdwg';
import { inBox } from '$core/geo';

/** A polygon: its rings, the first the outer, in thousandths of a degree, [lon, lat]. */
type Ring = Array<[number, number]>;
type Poly = Ring[];
/** The file's shape: `meta.source` says where the shapes come from; `shapes` is each region's polygons. */
export interface ShapesFile { meta: { source: string; regions?: number; boxOnly?: number }; shapes: Record<string, Poly[]> }
/** The file the builder reads (node only; `regionTester`). */
export const SHAPES_FILE = 'scripts/tdwg3-shapes.json';
/** How far outside a region's edge a record still counts as inside it, in degrees (about 5.5 km). */
export const SHAPE_BUFFER_DEG = 0.05;

/** The test of a record against a region, made from the shapes file: in its shape (or the buffer), else in its box. */
export interface RegionTester { inRegion(lat: number, lon: number, code: string): boolean; hasShape(code: string): boolean; source: string }
export function regionTester(file: ShapesFile, buffer = SHAPE_BUFFER_DEG): RegionTester {
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

/** Whether a record lies in a level-3 region: in its shape (or within the buffer of its edge), else in its box. */
function inRegion(lat: number, lon: number, code: string): boolean {
  const p = prepare(code);
  if (!p) { const b = TDWG3[code]; return !!b && inBox(lat, lon, b); }
  const b = p.box;
  if (lat < b.s - buffer || lat > b.n + buffer || lon < b.w - buffer - 1e-9 || lon > b.e + buffer) {
    // A region across the antimeridian (Fiji, the Aleutians) is drawn on both sides: try the point shifted a turn.
    if (!(b.w < -179 && b.e > 179)) return false;
  }
  for (const q of p.polys) {
    for (const x of [lon, lon + 360, lon - 360]) {
      if (lat < q.s - buffer || lat > q.n + buffer || x < q.w - buffer || x > q.e + buffer) continue;
      if (inside(x, lat, q.rings) || (buffer > 0 && near(x, lat, q.rings, buffer))) return true;
    }
  }
  return false;
}
  return { inRegion, hasShape: (code) => !!SHAPES[code]?.length, source: file.meta.source };
}

/**
 * How many of a dossier's openly licensed in-range records lie outside every native region's shape (round eighty, A):
 * the pages `--list-range-shapes` lists for a re-derivation. Restricted records are in no dossier, so a page whose only
 * such records are restricted is not found here; the next full build reads them all.
 */
export function outsideShapes(d: { distribution?: { native?: ReadonlyArray<{ code?: string }> }; occurrences?: { open?: ReadonlyArray<readonly [number, number, ...unknown[]]>; rangeTested?: boolean } }, t: RegionTester): number {
  const codes = (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));
  const open = d.occurrences?.open ?? [];
  if (!codes.length || !open.length || d.occurrences?.rangeTested === false || !codes.some((c) => t.hasShape(c))) return 0;
  return open.filter((p) => !codes.some((c) => t.inRegion(p[0], p[1], c))).length;
}

