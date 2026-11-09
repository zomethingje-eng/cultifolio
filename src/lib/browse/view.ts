/**
 * A browse view as the server sends it to the page (round eighty-seven; $lib/browse/load.server): every link worked out,
 * nothing of the table. Apart from the server module so the page imports its types alone.
 */
import type { BrowseQuery } from './engine';

/**
 * An entrance page's grown figure in words (round eighty-seven, the review of stage 1, S1): "not counted" where the
 * reference counts none, never 0; the count, and how many of the page's species are not counted, where it counts some.
 */
export const grownFigure = (f: { grown: number | null; grownNotCounted: number }, fmt: (n: number) => string): string =>
  f.grown === null ? 'not counted' : `${fmt(f.grown)}${f.grownNotCounted ? ` (${fmt(f.grownNotCounted)} not counted)` : ''}`;

export interface Link { label: string; href: string; n?: number; on?: boolean; plus?: boolean; /** The value a form sends for it (a family's or a genus's address). */ value?: string }
export interface ViewItem {
  slug: string;
  name: string;
  common?: string;
  family?: string;
  where: string;
  /** Native to the ticked regions and nowhere else. */
  only?: boolean;
  /** The habitat climate in the catalogue's words. */
  climate: string;
  /** The same in the list's column, whose head says "Habitat climate": known, none, pending, not asked, not checked. */
  climateCell: string;
  climateKnown: boolean;
  /** iNaturalist's observations marked captive or cultivated; null where the list does not count the species. */
  grown: number | null;
  /**
   * The record low, °C (round eighty-seven, stage 2: the index's `low`): null for a species with none; absent where the
   * index holds no record lows at all (`BrowseView.lows` false), which the list says as "not in this index".
   */
  low?: number | null;
  thumb?: string;
  credit?: string;
}
export interface BrowseView {
  base: string;
  query: BrowseQuery;
  qs: string;
  /** Region codes the address names that the scheme does not hold, left out of the view and said (`BrowseQuery.gone`). */
  gone?: string[];
  title: string;
  total: number;
  filtered: boolean;
  items: ViewItem[];
  photosRead: boolean;
  rail: {
    line: Link[];
    options: Array<Link & { code: string; level: number; open?: string }>;
    ticked: Array<Link & { code: string }>;
    countries: Link[];
    modes: { any: Link; all: Link } | null;
    families: Link[];
    familiesWith: number;
    moreFamilies?: string;
    genera: Link[];
    generaWith: number;
    moreGenera?: string;
    /** `uncounted`: the reference counts no species' cultivated observations; `notCounted`: of these, how many it does not count (S1). */
    flags: Array<Link & { key: 'climate' | 'grown' | 'only'; disabled?: boolean; uncounted?: boolean; notCounted?: number }>;
  };
  pills: Link[];
  clear?: string;
  fixes: Link[];
  wide: Link[];
  views: { tiles: string; list: string; map: string };
  /** "Most grown" is absent where nothing is counted (S1); "record low" where the index holds none. */
  sorts: { grown?: string; az: string; low?: string };
  /** Whether the index holds record lows (round eighty-seven, stage 2). */
  lows: boolean;
  /**
   * The results map (C7), on the map view only: each level-3 region the results are native to, with how many, the ones the
   * view is filtered by marked (every result is native there: they are off the colour scale), each other one a link that
   * narrows to the species native there as well; and the species Kew gives only a wider region, by that region.
   */
  map: { regions: Array<{ code: string; label: string; slug: string; n: number; /** Where the map writes it (lon, lat) and whether it is small (1: drawn with a ring to press). */ at: [number, number, number]; filtered: boolean; href?: string }>; wide: Array<{ label: string; n: number }> } | null;
  /** The view as a pin keeps it (C6): its browse query, the page it is, its title and its count. */
  pin: { view: string; href: string; label: string; n: number };
  /** What the map picker starts from (C7): the regions ticked, any or all, and the rest of the query, to which it adds its regions. */
  picker: { r: string[]; all: boolean; rest: string };
  /** The grown count's standing: none counted, some, or all; of these results' species, how many are not counted; whether the address asked for "grown". */
  grown: { state: 'all' | 'some' | 'none'; notCounted: number; asked: boolean };
  pages: { from: number; to: number; prev?: string; next?: string };
  csv: string;
  sources: string;
  built: string | null;
  /** A photograph of the view's species for its share image, with its credit, or none. */
  share: { src: string; alt: string } | null;
}

