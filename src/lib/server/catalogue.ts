import type { IndexEntry } from '$lib/server/dossiers';
import { groupFor, unitName } from '$core/regions';
import { slugify, genusOf } from '$core/names';
import { worldSvg } from '$lib/map/still';
import tdwg from '$dossier/tdwg3.json';

/**
 * The catalogue's rows (genera, families or regions) for the front page and `/api/rows`, derived from the index once per
 * index load and grouping and kept: the front page used to carry every row to the browser in its HTML, 1,321 genera with
 * their thumbnails and subtitles, fifty kilobytes gzipped before anything could paint, when a phone shows ten. The page
 * now carries a window and the rest come from the API as the reader nears the end (round forty-seven, 1).
 */
export const BYS = ['genus', 'origin', 'family'] as const;
export type By = (typeof BYS)[number];
export type Chip = 'all' | 'climate' | 'noclimate';
export const byOf = (v: string | null): By => ((BYS as readonly string[]).includes(v ?? '') ? (v as By) : 'genus');
export const chipOf = (v: string | null): Chip => (v === 'climate' || v === 'noclimate' ? v : 'all');

export type Item = {
  key: number;
  slug: string;
  name: string;
  family?: string;
  common?: string;
  origin: string[];
  syn?: string[];
  thumb?: string;
  alt?: string;
  photos?: number;
  open: number;
  climate?: string;
};
export type Row = {
  id: string;
  label: string;
  sub: string;
  count: number;
  withClimate: number;
  thumb?: string;
  alt?: string;
  map?: string;
  letter: string;
};
export type Catalogue = {
  rows: Row[];
  letters: string[];
  /** The index of the first row of each letter, for the letter index and `?from=`. */
  letterAt: Record<string, number>;
  total: number;
  withClimate: number;
  /** A row's species, sorted, for the one row the page opens. */
  itemsOf: (id: string) => Item[] | undefined;
  /** The whole list, for the featured strip. */
  list: Item[];
};

type Box = [string, string, number, number, number, number];
const boxByName = new Map((tdwg as Box[]).map((r) => [r[1], { s: r[2], w: r[3], n: r[4], e: r[5] }]));

const built = new WeakMap<IndexEntry[], Map<string, Catalogue>>();

export function catalogueOf(index: IndexEntry[], by: By, chip: Chip): Catalogue {
  let perIndex = built.get(index);
  if (!perIndex) built.set(index, (perIndex = new Map()));
  const k = `${by}:${chip}`;
  const hit = perIndex.get(k);
  if (hit) return hit;
  const c = build(index, by, chip);
  perIndex.set(k, c);
  return c;
}

/** The rows as items, once per index: nine catalogues (three groupings by three chips) each held their own copy of every row, seventy megabytes at fifty thousand species (round fifty-one, 6). */
const items = new WeakMap<IndexEntry[], Item[]>();
function itemsOf(index: IndexEntry[]): Item[] {
  let list = items.get(index);
  if (!list) items.set(index, (list = index.map((e) => ({
    key: e.key,
    slug: e.slug,
    name: e.name,
    family: e.family,
    common: e.common,
    origin: e.origin ?? [],
    syn: e.syn,
    thumb: e.thumb,
    alt: e.thumb ? e.name : undefined,
    photos: e.photos,
    open: e.open,
    climate: e.climate
  }))));
  return list;
}

function build(index: IndexEntry[], by: By, chip: Chip): Catalogue {
  const list = itemsOf(index);
  const shown = chip === 'climate' ? list.filter((c) => c.climate === 'ok') : chip === 'noclimate' ? list.filter((c) => c.climate !== 'ok') : list;
  // The catalogue is browsed as closed groups, one open at a time (`?open=`): a genus is what a grower thinks in, so it is
  // the default; origin keeps its little map; family is for those who think that way.
  const keyOf = (c: Item): string => (by === 'genus' ? genusOf(c.name) : by === 'family' ? (c.family ?? 'Family not stated') : groupFor(c.origin));
  const groups = new Map<string, Item[]>();
  for (const c of shown) {
    const k = keyOf(c);
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]); // appended, not copied: a genus of three hundred species was copied three hundred times (round fifty-one, 6)
  }
  const groupMap = (items: Item[]) => {
    const boxes = [...new Set(items.flatMap((c) => c.origin))].map((u) => boxByName.get(u)).filter((b): b is { s: number; w: number; n: number; e: number } => !!b);
    return worldSvg(boxes, undefined, 'Where this group grows');
  };
  const commonest = (xs: string[]): string | undefined => {
    const t = new Map<string, number>();
    for (const x of xs) t.set(x, (t.get(x) ?? 0) + 1);
    return [...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const sortedById = new Map<string, Item[]>();
  const rows: Row[] = [...groups.entries()].map(([label, items]) => {
    const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
    const id = slugify(label);
    sortedById.set(id, sorted);
    const hero = sorted.find((c) => c.thumb && c.climate === 'ok') ?? sorted.find((c) => c.thumb);
    const genera = new Set(sorted.map((c) => genusOf(c.name))).size;
    const sub =
      by === 'genus'
        ? (commonest(sorted.map((c) => c.family).filter((f): f is string => !!f)) ?? '')
        : by === 'family'
          ? `${genera} ${genera === 1 ? 'genus' : 'genera'}`
          : (() => {
              // The region's own commonest units, not every unit its species also reach: a maple native from Florida to the Yukon
              // belongs under Eastern North America without putting the Yukon in that row's subtitle.
              const t = new Map<string, number>();
              for (const c of sorted) for (const u of c.origin) if (groupFor([u]) === label) t.set(u, (t.get(u) ?? 0) + 1);
              const top = [...t.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => unitName(u));
              return top.slice(0, 6).join(', ') + (top.length > 6 ? ' …' : '');
            })();
    return {
      id,
      label,
      sub,
      count: sorted.length,
      withClimate: sorted.filter((c) => c.climate === 'ok').length,
      thumb: by === 'origin' ? undefined : hero?.thumb,
      alt: hero?.name,
      map: by === 'origin' ? groupMap(sorted) : undefined,
      letter: by === 'origin' ? '' : /^[A-Za-z]/.test(label) ? label[0].toUpperCase() : '#'
    };
  });
  const unplaced = (r: Row) => (r.label === 'Origin not stated' || r.label === 'Family not stated' ? 1 : 0);
  rows.sort((a, b) => unplaced(a) - unplaced(b) || (by === 'origin' ? b.count - a.count : a.label.localeCompare(b.label)));
  const letters = [...new Set(rows.map((r) => r.letter).filter(Boolean))];
  const letterAt: Record<string, number> = {};
  rows.forEach((r, i) => { if (r.letter && !(r.letter in letterAt)) letterAt[r.letter] = i; });
  return { rows, letters, letterAt, total: index.length, withClimate: list.filter((c) => c.climate === 'ok').length, itemsOf: (id) => sortedById.get(id), list };
}
