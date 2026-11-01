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
 * within `COAST_DEG` (an islet Natural Earth does not draw, a record at sea).
 *
 * Round eighty-five (G; the owner's decisions 1 to 3; reviews D4, A3 to A6, B1): the border rule. A record strictly inside
 * a region's shape is that region's, native or not; the buffer, the coast reach and the islands admit only a record in no
 * region's shape, and only when its stated country, where it states one, is the region's. Aloe vera's record at Khor
 * Fakkan (Sharjah, GBIF country AE, 0.02° from Oman's Madha enclave) and Cordyline fruticosa's at Tweed Heads (inside New
 * South Wales, 0.03° from Queensland) were in by the buffer. Beyond every drawn coast's reach, a record on a minor island
 * Natural Earth draws, or stating the region's country within `ISLAND_DEG` of it (the Poor Knights), is in (`admit`
 * says which of the four reasons took each record, and the dossier counts them). TDWG's own polygons are not used: their metadata reserves the boundaries' rights
 * to ESRI. Read by the builder; the Worker never loads them (the maps draw one file a region, `static/app/maps/w/w-<code>.svg` and
 * `r/r-<code>.svg`, made from the same file by `scripts/dev/r84g-region-maps.py`).
 */
import { TDWG3 } from './tdwg';
import { inBox } from '$core/geo';

/** A polygon: its rings, the first the outer, in thousandths of a degree, [lon, lat]. */
type Ring = Array<[number, number]>;
type Poly = Ring[];
/**
 * The file's shape: `meta.source` says where the shapes come from; `shapes` is each region's polygons. Round eighty-five
 * (G): `islands`, Natural Earth's minor islands each placed in a region (the owner's decision 2), and `countries`, each
 * region's countries as GBIF states a record's (decision 1); a file of round eighty-four has neither.
 */
export interface ShapesFile { meta: { source: string; regions?: number; boxOnly?: number; rule?: string; islands?: string; simplified?: string }; shapes: Record<string, Poly[]>; islands?: Record<string, Poly[]>; countries?: Record<string, string[]>; places?: Record<string, string[]> }
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
 * Round eighty-five (G; the owner's decision 2): beyond the coast reach of every drawn coast, how near a region's shape a
 * record whose stated country is that region's still counts as on an island too small to draw (about 55 km): the Poor
 * Knights, 21 km off Northland, and the Three Kings. Within its region's own box (TDWG's extent) it counts too: Macauley
 * and Curtis Is., a degree south of the Kermadecs' one drawn island.
 */
export const ISLAND_DEG = 0.5;

/**
 * The shapes' rule: the version of the rules the shapes file was made by (`meta.rule`; round eighty-three's file has none).
 * A page derived with it says so (`occurrences.rangeRule`), and `--check-ranges` lists every page that was not.
 * Round eighty-five: the border rule, the islands, Morocco and Western Sahara parted, Darjeeling in the East Himalaya.
 */
export const RANGE_RULE = 'r85';

/**
 * Why a record counts for a native region (round eighty-five; outside review B's simplification 1, A23), the dossier
 * counting each: `strict`, inside its shape; `buffer`, in no region's shape and within `SHAPE_BUFFER_DEG` of its edge;
 * `coast`, in no shape, with its coast the nearest within `COAST_DEG`; `island`, beyond every drawn coast's reach, on a
 * minor island placed in it, or in its country and within `ISLAND_DEG` of it or in its box. The last three only where the
 * record's stated country, if it states one, is the region's (the owner's decision 1).
 */
export type Admission = 'strict' | 'buffer' | 'coast' | 'island';
export const ADMISSIONS: ReadonlyArray<Admission> = ['strict', 'buffer', 'coast', 'island'];

/** The test of a record against a region, made from the shapes file: in its shape (or the buffer), else in its box (and the buffer). */
export interface RegionTester {
  inRegion(lat: number, lon: number, code: string, country?: string | null): boolean;
  /**
   * Which of `codes` (a page's native regions) takes a record, and why; null when none does (round eighty-five). A record
   * strictly inside any other region's shape, or on another region's island, is that region's, native or not.
   */
  admit(lat: number, lon: number, codes: ReadonlyArray<string>, country?: string | null): { code: string; how: Admission } | null;
  /** The regions whose shape (or island) strictly holds a point: whose land it is. */
  landOf(lat: number, lon: number): string[];
  /**
   * How far a point lies from a region's shape or its islands, in degrees (0 inside; 0 inside the box of a region with no
   * shape), when within `max`; else Infinity. Read by `--check-ranges` (round eighty-five).
   */
  reach(lat: number, lon: number, code: string, max: number): number;
  hasShape(code: string): boolean;
  /**
   * The state or province a point lies in, and its country, as "name|ISO" (round eighty-five; outside review A5: a page
   * whose climate rests on few records says where its figures were read); one within the buffer where none holds it.
   */
  placeOf(lat: number, lon: number): string | undefined;
  /** The region's countries, as the file gives them (empty for a file before round eighty-five). */
  countriesOf(code: string): ReadonlyArray<string>;
  source: string;
  rule?: string;
}
/** A box grown by a buffer on every side (a box across 180° grows the same way). */
export function grownBox(b: { s: number; w: number; n: number; e: number }, d: number) {
  return { s: b.s - d, n: b.n + d, w: b.w - d < -180 ? b.w - d + 360 : b.w - d, e: b.e + d > 180 ? b.e + d - 360 : b.e + d };
}
type Prepared = { box: { s: number; w: number; n: number; e: number }; polys: Array<{ s: number; w: number; n: number; e: number; rings: Float64Array[] }> };
function prepareAll(ps: Poly[] | undefined): Prepared | null {
  if (!ps?.length) return null;
  const out: Prepared = { box: { s: 90, w: 180, n: -90, e: -180 }, polys: [] };
  for (const p of ps) {
    const rings = p.map((r) => Float64Array.from(r.flatMap(([x, y]) => [x / 1000, y / 1000])));
    let s = 90, w = 180, n = -90, e = -180;
    for (const r of rings) for (let i = 0; i < r.length; i += 2) { w = Math.min(w, r[i]); e = Math.max(e, r[i]); s = Math.min(s, r[i + 1]); n = Math.max(n, r[i + 1]); }
    out.polys.push({ s, w, n, e, rings });
    out.box = { s: Math.min(out.box.s, s), w: Math.min(out.box.w, w), n: Math.max(out.box.n, n), e: Math.max(out.box.e, e) };
  }
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
/** The longitudes to try a point at: itself, and a turn either way for a region drawn across the antimeridian. */
const turns = (lon: number) => [lon, lon + 360, lon - 360];

export function regionTester(file: ShapesFile, buffer = SHAPE_BUFFER_DEG, coast = COAST_DEG): RegionTester {
  const SHAPES = file.shapes;
  const ISLANDS = file.islands ?? {};
  const COUNTRIES = file.countries ?? {};
  const prepared = new Map<string, Prepared | null>();
  const prepare = (code: string) => { if (!prepared.has(code)) prepared.set(code, prepareAll(SHAPES[code])); return prepared.get(code)!; };
  const preparedIsles = new Map<string, Prepared | null>();
  const isles = (code: string) => { if (!preparedIsles.has(code)) preparedIsles.set(code, prepareAll(ISLANDS[code])); return preparedIsles.get(code)!; };

  /** Whether a point is within `d` degrees of a prepared shape (or strictly inside it, with `d` 0 or more): the least distance, or Infinity. */
  function distTo(p: Prepared, lat: number, lon: number, d: number): number {
    const dLon = d / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    let best = Infinity;
    for (const x of turns(lon)) {
      if (lat < p.box.s - d || lat > p.box.n + d || x < p.box.w - dLon || x > p.box.e + dLon) continue;
      for (const q of p.polys) {
        if (lat < q.s - d || lat > q.n + d || x < q.w - dLon || x > q.e + dLon) continue;
        if (inside(x, lat, q.rings)) return 0;
        if (d > 0) best = Math.min(best, dist(x, lat, q.rings));
      }
    }
    return best;
  }
  const strictlyIn = (p: Prepared | null, lat: number, lon: number) => {
    if (!p) return false;
    for (const x of turns(lon)) {
      if (lat < p.box.s || lat > p.box.n || x < p.box.w || x > p.box.e) continue;
      for (const q of p.polys) if (lat >= q.s && lat <= q.n && x >= q.w && x <= q.e && inside(x, lat, q.rings)) return true;
    }
    return false;
  };

  /** Every region with a shape, prepared, the first time a record lies outside its native shapes. */
  let all: Array<{ code: string; p: Prepared }> | null = null;
  const regions = () => (all ??= Object.keys(SHAPES).flatMap((code) => { const p = prepare(code); return p ? [{ code, p }] : []; }));
  let allIsles: Array<{ code: string; p: Prepared }> | null = null;
  const islandRegions = () => (allIsles ??= Object.keys(ISLANDS).flatMap((code) => { const p = isles(code); return p ? [{ code, p }] : []; }));

  function landOf(lat: number, lon: number): string[] {
    const out = new Set<string>();
    for (const { code, p } of regions()) if (strictlyIn(p, lat, lon)) out.add(code);
    for (const { code, p } of islandRegions()) if (strictlyIn(p, lat, lon)) out.add(code);
    return [...out];
  }

  /** The last point asked of `offCoast`, and its answer: a record is tested against each of its page's native regions in turn. */
  let lastAt = '', lastNearest: string | null = null;
  /** The region whose drawn coast is nearest a point in no region's shape, when that coast is within `coast` degrees. */
  function offCoast(lat: number, lon: number): string | null {
    const at = `${lat},${lon}`;
    if (at === lastAt) return lastNearest;
    let best = Infinity, nearest: string | null = null;
    if (coast > 0) for (const { code, p } of regions()) {
      const d = distTo(p, lat, lon, coast);
      if (d <= coast && d < best) { best = d; nearest = code; }
    }
    lastAt = at;
    lastNearest = nearest;
    return nearest;
  }

  function admit(lat: number, lon: number, codes: ReadonlyArray<string>, country?: string | null): { code: string; how: Admission } | null {
    // 1. Strictly inside a native region's shape.
    for (const code of codes) if (strictlyIn(prepare(code), lat, lon)) return { code, how: 'strict' };
    // On a minor island placed in a native region (Ile du Levant, France's): an island.
    for (const code of codes) if (strictlyIn(isles(code), lat, lon) && (!country || !COUNTRIES[code]?.length || COUNTRIES[code].includes(country))) return { code, how: 'island' };
    // 2. Strictly inside another region's shape, or on another region's minor island: that region's (decision 1).
    if (landOf(lat, lon).length) return null;
    // A native region with no shape (Cocos (Keeling) and Christmas Is., the South China Sea): its box, on no region's land.
    for (const code of codes) if (!prepare(code) && TDWG3[code] && inBox(lat, lon, TDWG3[code])) return { code, how: 'strict' };
    // The record's stated country, where it states one, must be the region's (decision 1). A file without countries
    // (round eighty-four's) tests no country.
    const ours = (code: string) => !country || !COUNTRIES[code]?.length || COUNTRIES[code].includes(country);
    // 3. The buffer of a native shape, or of a shapeless native region's box.
    for (const code of codes) {
      const p = prepare(code);
      if (!ours(code) || buffer <= 0) continue;
      if (p ? distTo(p, lat, lon, buffer) <= buffer : !!TDWG3[code] && inBox(lat, lon, grownBox(TDWG3[code], buffer))) return { code, how: 'buffer' };
    }
    // 4. The coast reach: the region whose drawn coast is nearest, when it is native.
    const near = offCoast(lat, lon);
    if (near) return codes.includes(near) && ours(near) ? { code: near, how: 'coast' } : null;
    // 5. Beyond every drawn coast's reach (decision 2): on a minor island placed in a native region; or stating a native
    //    region's country, within ISLAND_DEG of its shape or inside its box.
    for (const code of codes) {
      const p = isles(code);
      if (p && ours(code) && distTo(p, lat, lon, buffer) <= Math.max(buffer, 0)) return { code, how: 'island' };
    }
    if (country && coast > 0) {
      for (const code of codes) {
        if (!COUNTRIES[code]?.includes(country)) continue;
        const p = prepare(code), b = TDWG3[code];
        if ((p && distTo(p, lat, lon, ISLAND_DEG) <= ISLAND_DEG) || (b && inBox(lat, lon, b))) return { code, how: 'island' };
      }
    }
    return null;
  }

  function placeOf(lat: number, lon: number): string | undefined {
    const PLACES = file.places ?? {};
    let best = Infinity, at: string | undefined;
    for (const { code, p } of regions()) {
      const names = PLACES[code];
      if (!names) continue;
      const dLon = buffer / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      for (const x of turns(lon)) {
        if (lat < p.box.s - buffer || lat > p.box.n + buffer || x < p.box.w - dLon || x > p.box.e + dLon) continue;
        p.polys.forEach((q, i) => {
          if (!names[i] || lat < q.s - buffer || lat > q.n + buffer || x < q.w - dLon || x > q.e + dLon) return;
          const d = inside(x, lat, q.rings) ? 0 : dist(x, lat, q.rings);
          if (d <= buffer && d < best) { best = d; at = names[i]; }
        });
      }
    }
    return at;
  }

  function reach(lat: number, lon: number, code: string, max: number): number {
    const p = prepare(code), q = isles(code);
    if (!p && !q) return TDWG3[code] && inBox(lat, lon, grownBox(TDWG3[code], max)) ? (inBox(lat, lon, TDWG3[code]) ? 0 : max) : Infinity;
    const d = Math.min(p ? distTo(p, lat, lon, max) : Infinity, q ? distTo(q, lat, lon, max) : Infinity);
    return d <= max ? d : Infinity;
  }

  return {
    admit,
    landOf,
    reach,
    placeOf,
    inRegion: (lat, lon, code, country) => admit(lat, lon, [code], country) !== null,
    hasShape: (code) => !!SHAPES[code]?.length,
    countriesOf: (code) => COUNTRIES[code] ?? [],
    source: file.meta.source,
    ...(file.meta.rule ? { rule: file.meta.rule } : {})
  };
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
  return open.filter((p) => !t.admit(p[0], p[1], codes, typeof p[3] === 'string' ? p[3] : null)).length;
}

