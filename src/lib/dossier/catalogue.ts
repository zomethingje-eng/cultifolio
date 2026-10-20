import type { IndexEntry } from '$dossier/index-entry';
import type { PageId } from '$core/page-id';
import { groupFor, unitName } from '$core/regions';
import { slugify, genusOf } from '$core/names';
import { worldSvg } from '$lib/map/still';
import tdwg from '$dossier/tdwg3.json';

/**
 * The catalogue's rows (genera, families or regions) for the front page and `/api/rows`, derived from the index once per
 * index load and grouping and kept, or written by the corpus build as a file per grouping (round fifty-three, 2): the front page used to carry every row to the browser in its HTML, 1,321 genera with
 * their thumbnails and subtitles, fifty kilobytes gzipped before anything could paint, when a phone shows ten. The page
 * now carries a window and the rest come from the API as the reader nears the end (round forty-seven, 1).
 */
export const BYS = ['genus', 'origin', 'family'] as const;
export type By = (typeof BYS)[number];
/**
 * The chips: every species, those with a habitat climate, those without, and (round seventy-five, the owner's decision)
 * the species of the most-grown genera, ranked by iNaturalist's observations of plants marked captive or cultivated. The
 * set of genera is given by the caller (`$lib/server/catalogue`, from `scripts/most-grown-genera.txt`); the corpus build
 * writes files for the first three only (`CHIPS`), and "grown" is derived from the index on the server.
 */
export type Chip = 'all' | 'climate' | 'noclimate' | 'grown';
export const byOf = (v: string | null): By => ((BYS as readonly string[]).includes(v ?? '') ? (v as By) : 'genus');
export const chipOf = (v: string | null): Chip => (v === 'climate' || v === 'noclimate' || v === 'grown' ? v : 'all');

export type Item = {
  /** The page's id (round seventy-eight). */
  key: PageId;
  /** The page's GBIF key, which a grower's plants are matched by (`IndexEntry.gbif`). */
  gbif?: number;
  slug: string;
  name: string;
  family?: string;
  common?: string;
  origin: string[];
  syn?: string[];
  thumb?: string;
  credit?: string;
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
  /**
   * Species whose habitat climate was refused by its source: not checked (rule 2). Pending ones are counted apart since round
   * sixty. A species without a GBIF key (round seventy-nine; `$core/no-gbif`), whose climate is stored as pending, is not
   * checked: GBIF's records were not asked.
   */
  notChecked?: number;
  /** Species whose habitat climate is still to be built (round sixty; the self-review, 14; A10). Absent in an older corpus's file: read as 0. */
  pending?: number;
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
/** A kept catalogue's key: the grouping and the chip, and under "grown" which set of genera, so two sets never share one. */
const setIds = new WeakMap<ReadonlySet<string>, number>();
let nextSetId = 0;
function keyOf(by: By, chip: Chip, grown?: ReadonlySet<string>): string {
  if (chip !== 'grown') return `${by}:${chip}`;
  if (!grown) return `${by}:grown:none`;
  let id = setIds.get(grown);
  if (id === undefined) setIds.set(grown, (id = nextSetId++));
  return `${by}:grown:${id}`;
}

export function catalogueOf(index: IndexEntry[], by: By, chip: Chip, grown?: ReadonlySet<string>): Catalogue {
  let perIndex = built.get(index);
  if (!perIndex) built.set(index, (perIndex = new Map()));
  const k = keyOf(by, chip, grown);
  const hit = perIndex.get(k);
  if (hit) return hit;
  const c = build(index, by, chip, grown);
  perIndex.set(k, c);
  return c;
}

/** What a catalogue file the build writes holds: the rows and their index, without the per-row species (round fifty-three, 2). */
export type CatalogueRows = Pick<Catalogue, 'rows' | 'letters' | 'letterAt' | 'total' | 'withClimate'>;
/** The chips the corpus build writes a file for: "grown" is derived on the server, from the index and the ranking's file. */
export const CHIPS: Chip[] = ['all', 'climate', 'noclimate'];
export const catalogueFile = (by: By, chip: Chip) => `catalogue/${by}-${chip}.json`;
/** The rows alone, as the file carries them. */
export const rowsOnly = (c: Catalogue): CatalogueRows => ({ rows: c.rows, letters: c.letters, letterAt: c.letterAt, total: c.total, withClimate: c.withClimate });

/** The group a species falls in under a grouping. */
const groupKey = (c: Item, by: By): string => (by === 'genus' ? genusOf(c.name) : by === 'family' ? (c.family ?? 'Family not stated') : groupFor(c.origin));
/** The species under a chip; under "grown", those of the genera given (none when no set is given). */
const shownUnder = (list: Item[], chip: Chip, grown?: ReadonlySet<string>) => (chip === 'climate' ? list.filter((c) => c.climate === 'ok') : chip === 'noclimate' ? list.filter((c) => c.climate !== 'ok') : chip === 'grown' ? list.filter((c) => !!grown?.has(genusOf(c.name))) : list);
/** One row's species, sorted, from the index alone: for the row the front page opens when the rows came from the build's file (round fifty-three, 2). */
export function rowItems(index: IndexEntry[], by: By, chip: Chip, id: string, grown?: ReadonlySet<string>): Item[] | undefined {
  return rowGroupsOf(index, by, chip, grown).get(id);
}
/** Every row's species under a grouping and a chip, by row id, each sorted by name: what `rowItems` looks up, and what the build writes as the row files (round seventy-six). */
export function rowGroupsOf(index: IndexEntry[], by: By, chip: Chip, grown?: ReadonlySet<string>): Map<string, Item[]> {
  // Grouped once per index, grouping and chip, then looked up: every opened row slugified the whole index on every
  // render, 11 to 22 ms at nine thousand species, on a page with no rate limit (round fifty-nine; the corpus review, 5).
  let byIndex = rowGroups.get(index);
  if (!byIndex) rowGroups.set(index, (byIndex = new Map()));
  const k = keyOf(by, chip, grown);
  let groups = byIndex.get(k);
  if (!groups) {
    groups = new Map();
    for (const c of shownUnder(catalogueItems(index), chip, grown)) {
      const g = slugify(groupKey(c, by));
      const xs = groups.get(g);
      if (xs) xs.push(c); else groups.set(g, [c]);
    }
    for (const xs of groups.values()) xs.sort((a, b) => a.name.localeCompare(b.name));
    byIndex.set(k, groups);
  }
  return groups;
}
const rowGroups = new WeakMap<IndexEntry[], Map<string, Map<string, Item[]>>>();

/** The rows as items, once per index: nine catalogues (three groupings by three chips) each held their own copy of every row, seventy megabytes at fifty thousand species (round fifty-one, 6). */
const items = new WeakMap<IndexEntry[], Item[]>();
export function catalogueItems(index: IndexEntry[]): Item[] {
  let list = items.get(index);
  if (!list) items.set(index, (list = index.map((e) => ({
    key: e.key,
    ...(e.gbif != null ? { gbif: e.gbif } : {}),
    slug: e.slug,
    name: e.name,
    family: e.family,
    common: e.common,
    origin: e.origin ?? [],
    syn: e.syn,
    thumb: e.thumb,
    credit: e.credit,
    alt: e.thumb ? e.name : undefined,
    photos: e.photos,
    open: e.open,
    climate: e.climate
  }))));
  return list;
}

function build(index: IndexEntry[], by: By, chip: Chip, grown?: ReadonlySet<string>): Catalogue {
  const list = catalogueItems(index);
  return catalogueFrom(shownUnder(list, chip, grown), by, index.length, list.filter((c) => c.climate === 'ok').length, list);
}

/**
 * A catalogue from the species it shows, in the index's order (round seventy-six): `total` and `withClimate` are the
 * whole reference's, whatever the chip, as `build` gives them. The Worker builds the "Most grown" chip's rows with it from
 * the build's row files, without the index.
 */
export function catalogueFrom(shown: Item[], by: By, total: number, withClimate: number, list: Item[] = shown): Catalogue {
  // The catalogue is browsed as closed groups, one open at a time (`?open=`): a genus is what a grower thinks in, so it is
  // the default; origin keeps its little map; family is for those who think that way.
  const keyOf = (c: Item): string => groupKey(c, by);
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
      // A refusal or a pending build is not an absence: counted apart from the species with no habitat climate (round fifty-two, 6),
      // and apart from each other, since "not checked" and "still to be built" are different facts (round sixty; A10).
      notChecked: sorted.filter((c) => c.climate === 'refused' || (c.climate === 'pending' && c.gbif == null)).length,
      pending: sorted.filter((c) => c.climate === 'pending' && c.gbif != null).length,
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
  return { rows, letters, letterAt, total, withClimate, itemsOf: (id) => sortedById.get(id), list };
}

/**
 * The species the front page's strip rotates through (round fifty-one, 6; written by the build as `featured.json` since
 * round seventy-six): one from each of the forty-eight genera with the most photographed species with a habitat climate,
 * the genus's most recorded. Eight or more photographs: a species photographed that often is photographed alive, not as a
 * pressed sheet.
 */
export function featuredPoolOf(list: readonly Item[]): Item[] {
  const byGenus = new Map<string, Item[]>();
  for (const c of list) if (c.thumb && c.climate === 'ok' && (c.photos ?? 0) >= 8) { const g = genusOf(c.name); const xs = byGenus.get(g); if (xs) xs.push(c); else byGenus.set(g, [c]); }
  const genera = [...byGenus.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return genera.slice(0, 48).map(([, xs]) => [...xs].sort((a, b) => b.open - a.open)[0]);
}
/** What the strip shows of each species, and all that `featured.json` keeps. */
export type Featured = { slug: string; name: string; thumb: string; credit?: string; common?: string; family?: string };
export const featuredOf = (c: Item): Featured => ({ slug: c.slug, name: c.name, thumb: c.thumb!, credit: c.credit, common: c.common, family: c.family });
