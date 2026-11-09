/**
 * The browse engine (round eighty-seven, C1): one query over the browse table ($lib/browse/table), read from and written
 * to an address, so every view is a link that can be shared; every entrance page (/region, /genus, /family) is this
 * query with one part fixed (C2). Pure and server-side: the table never goes to the browser, the page carries its
 * answer (C1's performance note).
 *
 * Regions are TDWG's codes ($lib/browse/tdwg): a level-3 region ("CPP"), or a level-2 or level-1 one ("27", "2"), which
 * stands for every level-3 region in it. Ticked regions combine as any of them or all of them. A species is native to a
 * ticked region when one of its origins is that region, or is a wider region (a page Kew gives only "Mexico") lying
 * wholly inside it: Agave calodonta is native to Mexico, but not known to be native to Mexico Northeast, so a view of
 * Mexico Northeast leaves it out and says so (`wide`), never adds it by guess (rule 3). "Only here" is a species every
 * origin of which lies inside the ticked regions; an origin TDWG names nothing for is inside none.
 *
 * Every count beside a choice is what choosing it gives, worked out on the same rows the result is (`+N` for a region
 * that would add to an any-of view; for a ticked region, how many of the results are native to it).
 */
import { genusOf, withoutSign, slugify } from '$core/names';
import { slugAt, type BrowseTable } from './table';
import { nameOrder, collatedOrder } from './order';
import { regionOf, level3Of, lineOf, childrenOf, CONTINENTS, LEVEL3, COUNTRIES, REGIONS, regionOfOrigin, countriesIn, countryOfCodes, codeOf, type Region } from './tdwg';

/** 'low': the record low, coldest first, where the index holds it (round eighty-seven, stage 2; `lowsOf`). */
export type Sort = 'grown' | 'az' | 'low';
/** 'map': the results as a map of the regions they are native to (round eighty-seven, C7). */
export type View = 'tiles' | 'list' | 'map';
export interface BrowseQuery {
  /** Ticked regions, TDWG codes, in the order ticked. */
  r: string[];
  /** All of the ticked regions, not any. */
  all: boolean;
  /** A family's address (`slugify`), or ''. */
  f: string;
  /** A genus's address, or ''. */
  g: string;
  climate: boolean;
  grown: boolean;
  only: boolean;
  sort: Sort;
  view: View;
  /** The first result shown, a multiple of `PAGE`. */
  at: number;
  /** The region the rail is opened at (a code), or '': where to look, not a filter. */
  in: string;
  /** The rail shows every family ('f') or genus ('g'), not the first few. */
  more: '' | 'f' | 'g';
  /**
   * Region codes the address names in TDWG's shapes ("NAM", "27", "2", "NAM-OO") that the scheme here does not hold: a
   * pinned view's region a later reference no longer has (the review of stage 2's pages, 6). Left out of the view, as
   * anything not understood is, and kept here so the page and a pin can say so rather than show the wider view as if it
   * were the one asked for. Never written by `queryString`; the page's one spelling carries them as `gone=`.
   */
  gone?: string[];
}
export const PAGE = 48;
/** A genus has a page of its own when the reference holds two species of it or more (round eighty-seven, C2). */
export const GENUS_PAGE_MIN = 2;
export const EMPTY: BrowseQuery = { r: [], all: false, f: '', g: '', climate: false, grown: false, only: false, sort: 'grown', view: 'tiles', at: 0, in: '', more: '' };

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
/** A query as an address gives it; anything it does not understand is left out, never an error. */
/** A region code in one of TDWG's shapes: a continent (1 digit), a region (2), a level-3 region (3 letters), a level-4 unit. */
const CODE_SHAPE = /^(?:\d{1,2}|[A-Z]{3}(?:-[A-Z]{2})?)$/;
export function parseQuery(p: URLSearchParams): BrowseQuery {
  const asked = p.getAll('r').flatMap((x) => x.split(','));
  const r = [...new Set(asked.map((x) => codeOf(x)).filter((x): x is string => !!x))].slice(0, 40);
  // The codes in TDWG's shapes that the scheme does not hold, from `r` or from the page's own `gone=` (one address).
  const gone = [...new Set([...asked, ...p.getAll('gone').flatMap((x) => x.split(','))].map((x) => x.trim().toUpperCase()).filter((x) => CODE_SHAPE.test(x) && !codeOf(x)))].slice(0, 40);
  const at = Math.floor(Number(p.get('at')));
  const inn = codeOf(p.get('in') ?? '') ?? '';
  const f = (p.get('f') ?? '').toLowerCase(), g = (p.get('g') ?? '').toLowerCase();
  const more = p.get('more');
  return {
    r,
    all: p.get('m') === 'all' && r.length > 1,
    f: SLUG.test(f) ? f : '',
    g: SLUG.test(g) ? g : '',
    climate: p.get('climate') === '1',
    grown: p.get('grown') === '1',
    only: p.get('only') === '1' && r.length > 0,
    sort: p.get('sort') === 'az' ? 'az' : p.get('sort') === 'low' ? 'low' : 'grown',
    view: p.get('view') === 'list' ? 'list' : p.get('view') === 'map' ? 'map' : 'tiles',
    at: Number.isInteger(at) && at > 0 && at % PAGE === 0 && at <= 100_000 ? at : 0,
    in: inn && regionOf(inn)?.level !== 3 ? inn : '',
    more: more === 'f' || more === 'g' ? more : '',
    ...(gone.length ? { gone } : {})
  };
}
/** The address's query, in one order, with only what differs from no filter: the same view is always the same address. */
export function queryString(q: BrowseQuery, o: Partial<BrowseQuery> = {}): string {
  const x = { ...q, ...o };
  // A change of filter starts the results again (`at`), unless the change is the page itself.
  if (!('at' in o) && Object.keys(o).some((k) => k !== 'view' && k !== 'in' && k !== 'more')) x.at = 0;
  const p: string[] = [];
  if (x.r.length) p.push(`r=${x.r.join(',')}`);
  if (x.all && x.r.length > 1) p.push('m=all');
  if (x.f) p.push(`f=${x.f}`);
  if (x.g) p.push(`g=${x.g}`);
  if (x.climate) p.push('climate=1');
  if (x.grown) p.push('grown=1');
  if (x.only && x.r.length) p.push('only=1');
  if (x.sort !== 'grown') p.push(`sort=${x.sort}`);
  if (x.view !== 'tiles') p.push(`view=${x.view}`);
  if (x.at) p.push(`at=${x.at}`);
  if (x.in) p.push(`in=${x.in}`);
  if (x.more) p.push(`more=${x.more}`);
  return p.length ? `?${p.join('&')}` : '';
}
/** Whether a query filters at all (a filtered view is not for search engines; C2). */
export const filtered = (q: BrowseQuery): boolean => !!(q.r.length || q.f || q.g || q.climate || q.grown);

/* ---------- the record low, where the index holds it ---------- */

/**
 * The record low of each species, by place (°C; null where the species has none), or null where this index holds no
 * such column (round eighty-seven, stage 2: the derived agent's index field `low`, carried into the browse table as
 * `low`). An index built before it has none, and the pages then say "not in this index" and offer no order by it, never a
 * column of blanks read as "none" (rule 2). A column of another length than the table's is not read (a short column would
 * shift every place after it).
 */
export function lowsOf(t: BrowseTable): ReadonlyArray<number | null> | null {
  const x = (t as BrowseTable & { low?: unknown }).low;
  if (!Array.isArray(x) || x.length !== t.n) return null;
  // A table made from an index of before carries the column with no number in it (the derived agent's `browseTableOf`
  // writes null for an entry without `low`): that index holds no record lows, and is said so, not 48,375 blanks.
  if (!x.some((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return x as ReadonlyArray<number | null>;
}
/** One species' record low: a finite number, or null for none or anything else. */
export const lowAt = (lows: ReadonlyArray<number | null> | null, i: number): number | null => { const v = lows?.[i]; return typeof v === 'number' && Number.isFinite(v) ? v : null; };

/* ---------- the table prepared, once per table ---------- */

/** Each level-3 region's number in the sets below (TDWG's 369, in `LEVEL3`'s order). */
const L3_ID = new Map(LEVEL3.map((r, i) => [r.code, i]));
const L3_N = LEVEL3.length;
/** A set of level-3 regions, one byte each. */
type L3Set = Uint8Array;
const l3Set = (codes: Iterable<string>): L3Set => { const s = new Uint8Array(L3_N); for (const c of codes) for (const x of level3Of(c)) s[L3_ID.get(x)!] = 1; return s; };

export interface Prepared {
  t: BrowseTable;
  genera: string[];
  genus: Int32Array;
  genusBySlug: Map<string, number>;
  familyBySlug: Map<string, number>;
  /** Per origin name: its level-3 region's number, -1 for a wider region, -2 for a name TDWG has none for. */
  oid: Int16Array;
  /** Per origin name that is a wider region: the numbers of the level-3 regions it holds. */
  wideIds: Array<Int16Array | null>;
  /** The species with each level-3 region among their origins, by the region's number. */
  byL3: Int32Array[];
  /** The species with a wider origin, a few. */
  wideRows: Int32Array;
  /** Each species' place in the alphabet of names. */
  az: Int32Array;
  /** The record lows, where the index holds them (`lowsOf`); null where it does not. */
  lows: ReadonlyArray<number | null> | null;
  /**
   * How many species the species list counts iNaturalist's cultivated observations of (`grown` 0 or more; round
   * eighty-seven, the review of stage 1, S1). None: the "grown" filter and the "most grown" order have nothing to read,
   * and the pages say "not counted", never 0. Some: the rest are not counted, and said so.
   */
  grownCounted: number;
}
/** Whether the table counts cultivated observations at all, of every species, or of some. */
export const grownState = (p: Prepared): 'all' | 'some' | 'none' => (p.grownCounted === 0 ? 'none' : p.grownCounted === p.t.n ? 'all' : 'some');
const held = new WeakMap<BrowseTable, Prepared>();
export function prepared(t: BrowseTable): Prepared {
  let p = held.get(t);
  if (p) return p;
  const genera: string[] = [], gAt = new Map<string, number>();
  const genus = new Int32Array(t.n);
  for (let i = 0; i < t.n; i++) { const g = genusOf(t.name[i]); let k = gAt.get(g); if (k === undefined) { gAt.set(g, (k = genera.length)); genera.push(g); } genus[i] = k; }
  const oid = new Int16Array(t.origins.length);
  const wideIds: Array<Int16Array | null> = [];
  t.origins.forEach((o, k) => {
    const c = regionOfOrigin(o);
    const r = c ? regionOf(c) : undefined;
    oid[k] = !r ? -2 : r.level === 3 ? L3_ID.get(r.code)! : -1;
    wideIds.push(r && r.level < 3 ? Int16Array.from(level3Of(r.code).map((x) => L3_ID.get(x)!)) : null);
  });
  const lists: number[][] = Array.from({ length: L3_N }, () => []);
  const wideRows: number[] = [];
  for (let i = 0; i < t.n; i++) {
    let w = false;
    for (const o of t.origin[i]) { const id = oid[o]; if (id >= 0) lists[id].push(i); else if (id === -1) w = true; }
    if (w) wideRows.push(i);
  }
  // The alphabet past the hybrid sign, as a checklist orders names, in the browse pages' collator's order ($lib/browse/
  // order; round eighty-seven, stage 2): stage 1 compared the letters folded to plain lower case, so "Æ" filed after Z.
  const order = collatedOrder(t.name.map((x) => withoutSign(x)));
  const az = new Int32Array(t.n);
  order.forEach((i, k) => (az[i] = k));
  let grownCounted = 0;
  for (const g of t.grown) if (g >= 0) grownCounted++;
  p = {
    t, genera, genus,
    genusBySlug: new Map(genera.map((g, i) => [slugify(g), i])),
    familyBySlug: new Map(t.families.map((f, i) => [slugify(f), i])),
    oid, wideIds,
    byL3: lists.map((l) => Int32Array.from(l)),
    wideRows: Int32Array.from(wideRows),
    az,
    lows: lowsOf(t),
    grownCounted
  };
  held.set(t, p);
  return p;
}

/* ---------- regions ---------- */

/** The ticked regions as the engine reads them: each one's level-3 regions, and all of them together. */
interface Ticked { items: L3Set[]; union: L3Set; all: boolean; only: boolean }
const ticked = (codes: readonly string[], all: boolean, only: boolean): Ticked => ({ items: codes.map((c) => l3Set([c])), union: l3Set(codes), all, only });
const wideInside = (ids: Int16Array, s: L3Set) => { for (const x of ids) if (!s[x]) return false; return true; };
/** Whether a species is native somewhere in this set: an origin that is one of its regions, or wider and wholly inside it. */
function nativeTo(p: Prepared, i: number, s: L3Set): boolean {
  for (const o of p.t.origin[i]) { const id = p.oid[o]; if (id >= 0 ? s[id] : id === -1 && wideInside(p.wideIds[o]!, s)) return true; }
  return false;
}
/** Whether every origin of a species lies inside the set (and it has one). */
function onlyIn(p: Prepared, i: number, s: L3Set): boolean {
  const os = p.t.origin[i];
  if (!os.length) return false;
  for (const o of os) { const id = p.oid[o]; if (id >= 0 ? !s[id] : id === -2 || !wideInside(p.wideIds[o]!, s)) return false; }
  return true;
}
function regionMatch(p: Prepared, i: number, k: Ticked): boolean {
  if (!k.items.length) return true;
  if (k.all ? !k.items.every((s) => nativeTo(p, i, s)) : !nativeTo(p, i, k.union)) return false;
  return !k.only || onlyIn(p, i, k.union);
}
/** The species that may be native to some of these regions: those listing one of their level-3 regions, and those with a wider origin. */
function rowsOf(p: Prepared, codes: Iterable<string>, mark: Int32Array, stamp: number): number[] {
  const out: number[] = [];
  const add = (i: number) => { if (mark[i] !== stamp) { mark[i] = stamp; out.push(i); } };
  for (const c of codes) for (const x of level3Of(c)) for (const i of p.byL3[L3_ID.get(x)!]) add(i);
  for (const i of p.wideRows) add(i);
  return out;
}
/** Whether a region lies wholly inside the ticked ones without being one of them (a part of a ticked continent). */
const covered = (code: string, union: L3Set) => level3Of(code).every((x) => union[L3_ID.get(x)!]);
/**
 * The ticked regions once `code`, a part of a ticked wider region, is unticked: the wider region is replaced by its
 * other parts, down to `code`'s level ("Southern America" ticked, Brazil unticked: the other five regions of it).
 */
export function untickPart(r: readonly string[], code: string): string[] {
  const out: string[] = [];
  for (const c of r) {
    if (c === code) continue;
    if (!level3Of(c).includes(level3Of(code)[0]) || regionOf(c)!.level >= regionOf(code)!.level) { out.push(c); continue; }
    // Split `c` into its parts, and split again the part that holds `code`, until `code` is one of them.
    let parts = childrenOf(c).map((x) => x.code);
    for (;;) {
      const holder = parts.find((x) => x !== code && level3Of(x).includes(level3Of(code)[0]) && level3Of(code).every((y) => level3Of(x).includes(y)));
      if (!holder) break;
      parts = [...parts.filter((x) => x !== holder), ...childrenOf(holder).map((x) => x.code)];
    }
    out.push(...parts.filter((x) => x !== code));
  }
  return [...new Set(out)];
}

/* ---------- a query run ---------- */

const R = 1, F = 2, G = 4, C = 8, W = 16;
export interface Choice { slug: string; name: string; n: number; on: boolean }
export interface RegionChoice {
  code: string;
  label: string;
  /** Its level: a level-1 or level-2 region can be opened in the rail. */
  level: 1 | 2 | 3;
  on: boolean;
  /** What ticking it gives: the results then, or with `plus`, how many it adds to them. For a ticked region, how many of the results are native to it. */
  n: number;
  plus: boolean;
  /** The ticked regions a click on it gives. */
  next: string[];
}
export interface CountryChoice { iso: string; name: string; regions: readonly string[]; n: number; on: boolean }
export interface Fix { label: string; n: number; query: Partial<BrowseQuery> }
export interface BrowseAnswer {
  query: BrowseQuery;
  total: number;
  /** The places in the table of the results shown, in their order. */
  rows: number[];
  families: Choice[];
  familiesWith: number;
  genera: Choice[];
  generaWith: number;
  flags: { climate: number; grown: number; only: number };
  /**
   * The "grown" count's standing (round eighty-seven, S1): `none` where the table counts no species' cultivated
   * observations (the filter is not applied and the order is A to Z: there is nothing to narrow or order by, and a page
   * says "not counted"), `some` or `all` otherwise; `notCounted`, of the species the other filters give, those the
   * species list does not count, which "grown" leaves out and a page says it left out.
   */
  grown: { state: 'all' | 'some' | 'none'; notCounted: number; asked: boolean };
  /** The results under any of and all of the ticked regions. */
  modes: { any: number; all: number };
  rail: { line: Region[]; open: string; options: RegionChoice[]; ticked: RegionChoice[]; countries: CountryChoice[] };
  /** When nothing answers: each filter that, loosened alone, gives some, the most first. */
  fixes: Fix[];
  /** Species left out because Kew gives them only a wider region that holds a ticked one: by that region. */
  wide: Array<{ code: string; label: string; n: number }>;
}
const FAMILIES_SHOWN = 10, GENERA_SHOWN = 14;

/** The answer to a query: its count, its page of results, and the count of every choice the page offers. */
export function runQuery(p: Prepared, asked: BrowseQuery): BrowseAnswer {
  const t = p.t, n = t.n;
  // Nothing counted, nothing to filter by: the filter asked is not applied, and the answer's query says so (S1).
  const state = grownState(p);
  const q: BrowseQuery = state === 'none' && asked.grown ? { ...asked, grown: false } : asked;
  const fam = q.f ? p.familyBySlug.get(q.f) ?? -2 : -1;
  const gen = q.g ? p.genusBySlug.get(q.g) ?? -2 : -1;
  const k = ticked(q.r, q.all, q.only);
  // Each species' failed filters, as bits: the result is those with none; a choice's count those failing only its own.
  const fail = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    if (fam !== -1 && t.family[i] !== fam) m |= F;
    if (gen !== -1 && p.genus[i] !== gen) m |= G;
    if (q.climate && t.climate[i] !== 'o') m |= C;
    if (q.grown && !(t.grown[i] > 0)) m |= W;
    if (k.items.length && !regionMatch(p, i, k)) m |= R;
    fail[i] = m;
  }
  const result: number[] = [];
  for (let i = 0; i < n; i++) if (!fail[i]) result.push(i);
  const total = result.length;
  const without = (bit: number, also: (i: number) => boolean) => { let c = 0; for (let i = 0; i < n; i++) if (!(fail[i] & ~bit) && also(i)) c++; return c; };

  // Families and genera: each one's count with the other filters as they are.
  const fc = new Int32Array(t.families.length), gc = new Int32Array(p.genera.length);
  for (let i = 0; i < n; i++) {
    if (!(fail[i] & ~F) && t.family[i] >= 0) fc[t.family[i]]++;
    if (!(fail[i] & ~G)) gc[p.genus[i]]++;
  }
  const choices = (names: string[], counts: Int32Array, on: number, shown: number) => {
    const all = names.map((name, i) => ({ slug: slugify(name), name, n: counts[i], on: i === on })).filter((c) => c.n > 0 || c.on);
    all.sort((a, b) => b.n - a.n || nameOrder(a.name, b.name));
    const top = shown ? all.slice(0, shown) : all;
    const chosen = all.find((c) => c.on);
    if (chosen && !top.includes(chosen)) top.unshift(chosen);
    return { list: top, with: all.filter((c) => c.n > 0).length };
  };
  const fams = choices(t.families, fc, fam, q.more === 'f' ? 0 : FAMILIES_SHOWN);
  const gens = choices(p.genera, gc, gen, q.more === 'g' ? 0 : GENERA_SHOWN);

  const flags = {
    climate: q.climate ? total : without(C, (i) => t.climate[i] === 'o'),
    grown: q.grown ? total : without(W, (i) => t.grown[i] > 0),
    only: !k.items.length ? 0 : q.only ? total : without(R, (i) => regionMatch(p, i, { ...k, only: true }))
  };
  const grown = { state, notCounted: state === 'some' ? without(W, (i) => t.grown[i] < 0) : state === 'none' ? without(W, () => true) : 0, asked: asked.grown };
  const modes = !k.items.length || k.items.length < 2 ? { any: total, all: total } : {
    any: q.all ? without(R, (i) => regionMatch(p, i, { ...k, all: false })) : total,
    all: q.all ? total : without(R, (i) => regionMatch(p, i, { ...k, all: true }))
  };

  // The rail: the region it is opened at, its parts, and the ticked regions.
  const mark = new Int32Array(n);
  let stamp = 0;
  const open = q.in || (q.r.length ? regionOf(q.r[0])!.up ?? q.r[0] : '');
  const line = open ? lineOf(open) : [];
  const parts = open ? childrenOf(open) : CONTINENTS;
  const othersOk = (i: number) => !(fail[i] & ~R);
  const inResult = new Uint8Array(n);
  for (const i of result) inResult[i] = 1;
  const countWith = (codes: readonly string[]): number => {
    // The results once this region is ticked too (any of), or as one more region every result must be native to (all of).
    const k2 = ticked([...q.r, ...codes], q.all, q.only);
    const cands = q.r.length && q.all ? result : [...(q.r.length ? result : []), ...rowsOf(p, codes, mark, ++stamp)];
    let c = 0;
    const seen = new Uint8Array(n);
    for (const i of cands) if (!seen[i]) { seen[i] = 1; if (othersOk(i) && regionMatch(p, i, k2)) c++; }
    return c;
  };
  const shareOf = (code: string) => { const s = l3Set([code]); let c = 0; for (const i of result) if (nativeTo(p, i, s)) c++; return c; };
  const choiceOf = (r: Region): RegionChoice => {
    const on = q.r.includes(r.code);
    if (on) return { code: r.code, label: r.label, level: r.level, on, n: shareOf(r.code), plus: false, next: q.r.filter((c) => c !== r.code) };
    // A part of a ticked wider region is ticked with it: unticking it ticks the wider region's other parts instead.
    if (k.items.length && !q.all && covered(r.code, k.union)) return { code: r.code, label: r.label, level: r.level, on: true, n: shareOf(r.code), plus: false, next: untickPart(q.r, r.code) };
    const after = countWith([r.code]);
    const plus = q.r.length > 0 && !q.all;
    return { code: r.code, label: r.label, level: r.level, on, n: plus ? after - total : after, plus, next: [...q.r, r.code] };
  };
  const options = parts.map(choiceOf);
  const tickedChoices = q.r.filter((c) => !parts.some((x) => x.code === c)).map((c) => choiceOf(regionOf(c)!));
  const countries: CountryChoice[] = (open ? countriesIn(open) : []).map((c) => {
    const kc = ticked(c.regions, false, q.only);
    let m = 0;
    for (const i of rowsOf(p, c.regions, mark, ++stamp)) if (othersOk(i) && regionMatch(p, i, kc)) m++;
    return { iso: c.iso, name: c.name, regions: c.regions, n: m, on: countryOfCodes(q.r)?.iso === c.iso };
  });

  // Nothing answers: what loosening each filter alone would give.
  const fixes: Fix[] = [];
  if (!total) {
    if (q.only) fixes.push({ label: 'Native elsewhere too', n: without(R, (i) => regionMatch(p, i, { ...k, only: false })), query: { only: false } });
    if (q.all) fixes.push({ label: 'Any of the regions, not all', n: without(R, (i) => regionMatch(p, i, { ...k, all: false })), query: { all: false } });
    if (q.r.length) fixes.push({ label: 'Every region', n: without(R, () => true), query: { r: [], all: false, only: false } });
    if (q.r.length > 1) for (const c of q.r.slice(0, 4)) { const rest = q.r.filter((x) => x !== c); const k3 = ticked(rest, q.all && rest.length > 1, q.only); fixes.push({ label: `Without ${regionOf(c)!.label}`, n: without(R, (i) => regionMatch(p, i, k3)), query: { r: rest } }); }
    if (q.f) fixes.push({ label: 'Every family', n: without(F, () => true), query: { f: '' } });
    if (q.g) fixes.push({ label: 'Every genus', n: without(G, () => true), query: { g: '' } });
    if (q.climate) fixes.push({ label: 'With or without a habitat climate', n: without(C, () => true), query: { climate: false } });
    if (q.grown) fixes.push({ label: 'Grown or not', n: without(W, () => true), query: { grown: false } });
    fixes.sort((a, b) => b.n - a.n);
  }

  // Kew gives some species only a wider region: where one holds a ticked region, the species it leaves out are said.
  const wide = new Map<string, number>();
  if (k.items.length) for (const i of p.wideRows) {
    if (!othersOk(i) || inResult[i]) continue;
    for (const o of t.origin[i]) {
      const ids = p.wideIds[o];
      if (ids && !wideInside(ids, k.union) && [...ids].some((x) => k.union[x])) { const c = regionOfOrigin(t.origins[o])!; wide.set(c, (wide.get(c) ?? 0) + 1); }
    }
  }

  const sorted = sortRows(p, result, q.sort);
  const at = q.at < total ? q.at : 0;
  return {
    // An order by the record low of an index that holds none is the default order, and its links say so (no `sort`).
    query: { ...q, at, sort: q.sort === 'low' && !p.lows ? 'grown' : q.sort },
    total,
    rows: sorted.slice(at, at + PAGE),
    families: fams.list, familiesWith: fams.with,
    genera: gens.list, generaWith: gens.with,
    flags, modes, grown,
    rail: { line, open, options, ticked: tickedChoices, countries },
    fixes: fixes.filter((f) => f.n > 0).slice(0, 4),
    wide: [...wide].map(([code, n]) => ({ code, label: regionOf(code)!.label, n }))
  };
}

/** Every result of a query, in its order, for the CSV. */
export function allRows(p: Prepared, asked: BrowseQuery): number[] {
  const t = p.t;
  const q: BrowseQuery = p.grownCounted === 0 && asked.grown ? { ...asked, grown: false } : asked; // not counted: not applied (S1)
  const fam = q.f ? p.familyBySlug.get(q.f) ?? -2 : -1;
  const gen = q.g ? p.genusBySlug.get(q.g) ?? -2 : -1;
  const k = ticked(q.r, q.all, q.only);
  const out: number[] = [];
  for (let i = 0; i < t.n; i++) {
    if (fam !== -1 && t.family[i] !== fam) continue;
    if (gen !== -1 && p.genus[i] !== gen) continue;
    if (q.climate && t.climate[i] !== 'o') continue;
    if (q.grown && !(t.grown[i] > 0)) continue;
    if (k.items.length && !regionMatch(p, i, k)) continue;
    out.push(i);
  }
  return sortRows(p, out, q.sort);
}

/**
 * Rows in a view's order: A to Z; the record low, coldest first, the species with none after (A to Z among them); or
 * most grown. An address that asks for the record low of an index that holds none is given the default order, most
 * grown (or A to Z where nothing is counted), since the page offers no order by it then (`sortOf`).
 */
export function sortRows(p: Prepared, rows: number[], sort: Sort): number[] {
  const t = p.t;
  const s = sortOf(p, sort);
  if (s === 'az') return rows.sort((a, b) => p.az[a] - p.az[b]);
  if (s === 'low') {
    const L = p.lows;
    return rows.sort((a, b) => { const x = lowAt(L, a), y = lowAt(L, b); return x === null ? (y === null ? p.az[a] - p.az[b] : 1) : y === null ? -1 : x - y || p.az[a] - p.az[b]; });
  }
  return rows.sort((a, b) => t.grown[b] - t.grown[a] || p.az[a] - p.az[b]);
}
/** The order a view is in: "record low" only where the index holds it; "most grown" only where something is counted. */
export function sortOf(p: Prepared, sort: Sort): Sort {
  if (sort === 'low' && !p.lows) return p.grownCounted === 0 ? 'az' : 'grown';
  if (sort === 'grown' && p.grownCounted === 0) return 'az';
  return sort;
}

/**
 * How many of these species are native to each level-3 region (an origin that is the region; a wider origin is no
 * level-3 region's, as a ticked level-3 region reads it), and, for the species Kew gives a wider region, how many by that
 * region (round eighty-seven, C7: the results map, and the map picker's counts under a view's other filters).
 */
export function regionCounts(p: Prepared, rows: readonly number[]): { l3: Map<string, number>; wide: Map<string, number> } {
  const c = new Int32Array(L3_N);
  const wide = new Map<string, number>();
  const mark = new Int32Array(L3_N).fill(-1);
  for (const i of rows) {
    const wides = new Set<string>();
    for (const o of p.t.origin[i]) {
      const id = p.oid[o];
      if (id >= 0) { if (mark[id] !== i) { mark[id] = i; c[id]++; } }
      else if (id === -1) wides.add(regionOfOrigin(p.t.origins[o])!);
    }
    for (const w of wides) wide.set(w, (wide.get(w) ?? 0) + 1);
  }
  const l3 = new Map<string, number>();
  LEVEL3.forEach((r, k) => { if (c[k]) l3.set(r.code, c[k]); });
  return { l3, wide };
}
/** The origin names of the table that are native to a region as the engine reads it (one of its level-3 regions, or a wider region wholly inside it): what the collection lens matches a grower's species against, in the browser (C8). */
export function nativeNamesOf(p: Prepared, code: string): string[] {
  const s = l3Set([code]);
  const out: string[] = [];
  p.t.origins.forEach((name, o) => { const id = p.oid[o]; if (id >= 0 ? s[id] : id === -1 && wideInside(p.wideIds[o]!, s)) out.push(name); });
  return out;
}

/* ---------- words ---------- */

/** What a view holds, in a few words: "Apocynaceae native to Namibia". */
export function titleOf(p: Prepared, asked: BrowseQuery): string {
  const q: BrowseQuery = p.grownCounted === 0 && asked.grown ? { ...asked, grown: false } : asked; // not counted: not said (S1)
  const fam = q.f ? p.t.families[p.familyBySlug.get(q.f) ?? -1] : undefined;
  const gen = q.g ? p.genera[p.genusBySlug.get(q.g) ?? -1] : undefined;
  const what = gen ?? fam ?? (filtered(q) ? 'Species' : 'Every species in the reference');
  const country = q.r.length ? countryOfCodes(q.r) : undefined;
  const names = q.r.map((c) => regionOf(c)!.label);
  const where = !q.r.length ? '' : country && !q.all ? ` native to ${country.name}` : ` native to ${q.all ? 'all of ' : ''}${names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(q.all ? ' and ' : ' or ')}`;
  const extra = [q.only && q.r.length ? 'only there' : '', q.climate ? 'with a habitat climate' : '', q.grown ? 'grown, per iNaturalist' : ''].filter(Boolean);
  return `${what}${where}${extra.length ? `, ${extra.join(', ')}` : ''}`;
}
/** The filters a view has, each with the query that takes it off. */
export function pillsOf(p: Prepared, q: BrowseQuery): Array<{ label: string; query: Partial<BrowseQuery> }> {
  const out: Array<{ label: string; query: Partial<BrowseQuery> }> = [];
  const country = q.r.length > 1 ? countryOfCodes(q.r) : undefined;
  if (country) out.push({ label: `Native to ${country.name}`, query: { r: [], all: false, only: false } });
  else for (const c of q.r) { const rest = q.r.filter((x) => x !== c); out.push({ label: `Native to ${regionOf(c)!.label}`, query: { r: rest, ...(rest.length ? {} : { only: false }) } }); }
  if (q.all && q.r.length > 1) out.push({ label: 'All of these regions', query: { all: false } });
  if (q.only && q.r.length) out.push({ label: 'Only there', query: { only: false } });
  if (q.f) out.push({ label: `Family: ${p.t.families[p.familyBySlug.get(q.f) ?? -1] ?? q.f}`, query: { f: '' } });
  if (q.g) out.push({ label: `Genus: ${p.genera[p.genusBySlug.get(q.g) ?? -1] ?? q.g}`, query: { g: '' } });
  if (q.climate) out.push({ label: 'Habitat climate known', query: { climate: false } });
  if (q.grown) out.push({ label: 'Grown, per iNaturalist', query: { grown: false } });
  return out;
}
/** A species' native regions in a few words: "Cape Provinces, Namibia, +3". */
export function whereOf(p: Prepared, i: number, max = 2): string {
  const os = p.t.origin[i].map((o) => { const c = regionOfOrigin(p.t.origins[o]); return c ? regionOf(c)!.label : p.t.origins[o]; }).filter(Boolean);
  return os.length <= max + 1 ? os.join(', ') : `${os.slice(0, max).join(', ')}, +${os.length - max}`;
}
/** Every native region's name. */
export const originsOf = (p: Prepared, i: number): string[] => p.t.origin[i].map((o) => { const c = regionOfOrigin(p.t.origins[o]); return c ? regionOf(c)!.label : p.t.origins[o]; }).filter(Boolean);
export { slugAt };

/* ---------- counts over the whole reference, for the entrance pages' indexes ---------- */

const countsHeld = new WeakMap<Prepared, { regions: Map<string, number>; countries: Map<string, number>; unplaced: number; genusFamily: string[] }>();
/**
 * Each region's species (native to it: an origin in it, or a wider origin wholly inside it, as the engine reads a
 * ticked region), each country preset's, the species with no origin TDWG names (in no region's count), and each genus's
 * family (its species' most often). Once per table.
 */
export function wholeCounts(p: Prepared) {
  let out = countsHeld.get(p);
  if (out) return out;
  const t = p.t;
  // Every region by a number, and each origin name's regions: itself and those above it (a wider origin is in itself and
  // those above it, never in its parts). One pass over the species, each region counted once a species.
  const all = [...REGIONS.values()];
  const num = new Map(all.map((r, k) => [r.code, k]));
  const up = t.origins.map((name) => {
    const ids: number[] = [];
    for (let r = (() => { const c = regionOfOrigin(name); return c ? regionOf(c) : undefined; })(); r; r = r.up ? regionOf(r.up) : undefined) ids.push(num.get(r.code)!);
    return ids;
  });
  const counts = new Int32Array(all.length);
  const last = new Int32Array(all.length).fill(-1);
  let unplaced = 0;
  for (let i = 0; i < t.n; i++) {
    let any = false;
    for (const o of t.origin[i]) for (const k of up[o]) { any = true; if (last[k] !== i) { last[k] = i; counts[k]++; } }
    if (!any) unplaced++;
  }
  const regions = new Map<string, number>();
  all.forEach((r, k) => { if (counts[k]) regions.set(r.code, counts[k]); });
  const countries = new Map<string, number>();
  const mark = new Int32Array(t.n);
  let stamp = 0;
  for (const c of COUNTRIES.values()) {
    const s = l3Set(c.regions);
    let m = 0;
    for (const i of rowsOf(p, c.regions, mark, ++stamp)) if (nativeTo(p, i, s)) m++;
    countries.set(c.iso, m);
  }
  const byGenus = p.genera.map(() => new Map<number, number>());
  for (let i = 0; i < t.n; i++) if (t.family[i] >= 0) { const m = byGenus[p.genus[i]]; m.set(t.family[i], (m.get(t.family[i]) ?? 0) + 1); }
  const genusFamily = byGenus.map((m) => { let best = -1, n = 0; for (const [f, k] of m) if (k > n) { best = f; n = k; } return best >= 0 ? t.families[best] : ''; });
  out = { regions, countries, unplaced, genusFamily };
  countsHeld.set(p, out);
  return out;
}

/** The species of a genus or a family, by place. */
export function rowsWhere(p: Prepared, what: { genus?: number; family?: number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.t.n; i++) if ((what.genus === undefined || p.genus[i] === what.genus) && (what.family === undefined || p.t.family[i] === what.family)) out.push(i);
  return out;
}
/** The regions these species are native to, each with how many: level-3 regions, and the wider ones Kew gives a few, the most first. */
export function regionsOfRows(p: Prepared, rows: readonly number[]): Array<{ code: string; label: string; slug: string; n: number }> {
  const m = new Map<string, number>();
  for (const i of rows) for (const code of new Set(p.t.origin[i].map((o) => regionOfOrigin(p.t.origins[o])).filter((c): c is string => !!c))) m.set(code, (m.get(code) ?? 0) + 1);
  return [...m].map(([code, n]) => { const r = regionOf(code)!; return { code, label: r.label, slug: r.slug, n }; }).sort((a, b) => b.n - a.n || nameOrder(a.label, b.label));
}

const groupsHeld = new WeakMap<Prepared, { genus: Int32Array[]; family: Int32Array[] }>();
/** The species of each genus and each family, by place, made once a table. */
function groups(p: Prepared) {
  let g = groupsHeld.get(p);
  if (!g) {
    const ge: number[][] = p.genera.map(() => []), fa: number[][] = p.t.families.map(() => []);
    for (let i = 0; i < p.t.n; i++) { ge[p.genus[i]].push(i); if (p.t.family[i] >= 0) fa[p.t.family[i]].push(i); }
    groupsHeld.set(p, (g = { genus: ge.map((x) => Int32Array.from(x)), family: fa.map((x) => Int32Array.from(x)) }));
  }
  return g;
}
/** How many species of a genus or a family (by address) are native to any of these regions: the count of /browse?g=…&r=… without reading every species. */
export function countIn(p: Prepared, what: { g?: string; f?: string }, codes: readonly string[]): number {
  const rows = what.g ? groups(p).genus[p.genusBySlug.get(what.g) ?? -1] : what.f ? groups(p).family[p.familyBySlug.get(what.f) ?? -1] : undefined;
  if (!rows) return 0;
  const s = l3Set(codes);
  let n = 0;
  for (const i of rows) if (nativeTo(p, i, s)) n++;
  return n;
}

/** Whether a species is native only to these regions (the list's "only here" marker; the same rule as the filter). */
export const onlyHere = (p: Prepared, i: number, codes: readonly string[]): boolean => codes.length > 0 && onlyIn(p, i, l3Set(codes));
