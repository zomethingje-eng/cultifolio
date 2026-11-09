/**
 * The TDWG hierarchy for the browse pages (round eighty-seven, C1): levels 1 (continents), 2 (regions) and 3 (the
 * "botanical countries" Kew's checklist gives ranges in), the countries whose presets tick level-3 regions, and other
 * names of regions. It replaces `broadRegion` ($core/regions) for browsing: that folded each level-3 region into one of
 * about eighteen regions by its box's middle, which no source states; this is TDWG's own scheme (Brummitt 2001).
 *
 * Read on the server only: the file is 180 kB, and every page that shows a region gets its words from the server.
 * `tdwg-levels.json` is written by scripts/dev/r87-tdwg-levels.ts, which says what each part is from.
 */
import levels from './tdwg-levels.json';
import { slugify } from '$core/names';
import { unitName } from '$core/regions';
import { nameOrder } from './order';

export type Level = 1 | 2 | 3;
export interface Region {
  /** TDWG's code: "2" (level 1), "27" (level 2), "CPP" (level 3). */
  code: string;
  /** The name as Kew's checklist writes it (level 3) or TDWG's table (levels 1 and 2). */
  name: string;
  /** The name as a person reads it ("The Gambia" for Kew's "Gambia,  The"). */
  label: string;
  level: Level;
  /** The code of the region it is part of; null for a continent. */
  up: string | null;
  /** Its address under /region/. */
  slug: string;
}

export const TDWG_SOURCE = levels.source;
export const COUNTRIES_SOURCE = levels.countriesSource;
export const ALIASES_SOURCE = levels.aliasesSource;
/** The words a page says the regions are from, short. */
export const REGIONS_CITED = "Regions: TDWG's World Geographical Scheme for Recording Plant Distributions, 2nd edition (Brummitt 2001).";

const all: Region[] = [
  ...(levels.l1 as Array<[string, string]>).map(([code, name]) => ({ code, name, label: name, level: 1 as Level, up: null, slug: '' })),
  ...(levels.l2 as Array<[string, string, string]>).map(([code, name, up]) => ({ code, name, label: name, level: 2 as Level, up, slug: '' })),
  ...(levels.l3 as Array<[string, string, string]>).map(([code, name, up]) => ({ code, name, label: unitName(name).replace(/\s+/g, ' '), level: 3 as Level, up, slug: '' }))
];
// Addresses: a level-3 region's from its name; a level-1 or level-2 name that a level-3 region already has
// ("Mongolia" is both TDWG's region 37 and its one level-3 region) takes its level after it ("mongolia-l2").
const taken = new Set<string>();
for (const lv of [3, 2, 1] as const) for (const r of all.filter((x) => x.level === lv)) { const s = slugify(r.label); r.slug = taken.has(s) ? `${s}-l${lv}` : s; taken.add(r.slug); }

export const REGIONS: ReadonlyMap<string, Region> = new Map(all.map((r) => [r.code, r]));
const bySlug = new Map(all.map((r) => [r.slug, r]));
const kids = new Map<string, Region[]>();
for (const r of all) if (r.up) { const k = kids.get(r.up) ?? []; k.push(r); kids.set(r.up, k); }
for (const k of kids.values()) k.sort((a, b) => nameOrder(a.label, b.label));
export const CONTINENTS: readonly Region[] = all.filter((r) => r.level === 1);
export const LEVEL3: readonly Region[] = all.filter((r) => r.level === 3);

export const regionOf = (code: string): Region | undefined => REGIONS.get(code);
export const regionBySlug = (slug: string): Region | undefined => bySlug.get(slug);
export const childrenOf = (code: string): readonly Region[] => kids.get(code) ?? [];
/** The region and those above it, the continent first. */
export function lineOf(code: string): Region[] {
  const out: Region[] = [];
  for (let r = REGIONS.get(code); r; r = r.up ? REGIONS.get(r.up) : undefined) out.unshift(r);
  return out;
}
const l3Held = new Map<string, readonly string[]>();
/** The level-3 codes a region holds: itself for a level-3 region. */
export function level3Of(code: string): readonly string[] {
  let out = l3Held.get(code);
  if (!out) {
    const r = REGIONS.get(code);
    out = !r ? [] : r.level === 3 ? [r.code] : childrenOf(code).flatMap((c) => level3Of(c.code));
    l3Held.set(code, out);
  }
  return out;
}

/** A code as an address or a query gives it ("cpp", "27"), read as TDWG's, or undefined. */
export const codeOf = (s: string): string | undefined => { const c = s.trim().toUpperCase(); return REGIONS.has(c) ? c : undefined; };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bislands?\b/g, 'is').replace(/[^a-z0-9]+/g, ' ').trim();
const byIndexName = new Map<string, string>();
// Level 3 first, so a name that is both ("Mongolia") is the level-3 region, as Kew's checklist means it.
for (const lv of [3, 2, 1] as const) for (const r of all.filter((x) => x.level === lv)) if (!byIndexName.has(fold(r.name))) byIndexName.set(fold(r.name), r.code);
/**
 * The region an origin of the index names: a level-3 region as Kew writes it, or, for the few pages Kew gives only a
 * wider region ("Mexico", "Brazil", "Malesia", "Southern America"; $dossier/wide-origins), that level-2 or level-1
 * region, by its name. Undefined for a name that is none of TDWG's (the empty origin of round eighty-five's index).
 */
export const regionOfOrigin = (name: string): string | undefined => byIndexName.get(fold(name));

/* ---------- countries ---------- */

export interface Country {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  slug: string;
  /** What its preset ticks: the regions it holds alone and those it is the main country of, or, with neither, the regions it shares. */
  regions: readonly string[];
  /** The other level-3 regions it holds part of, not ticked. */
  also: readonly string[];
  /** Whether `regions` are regions it shares with other countries (it holds none alone and is the main country of none). */
  shared: boolean;
}
type CountryRow = { name: string; own: string[]; main: string[]; also: string[] };
export const COUNTRIES: ReadonlyMap<string, Country> = new Map(
  Object.entries(levels.countries as Record<string, CountryRow>).map(([iso, c]) => {
    const ticked = [...c.own, ...c.main];
    return [iso, { iso, name: c.name, slug: slugify(c.name), regions: ticked.length ? ticked.sort() : [...c.also], also: ticked.length ? c.also : [], shared: !ticked.length }];
  })
);
const countryBySet = new Map<string, Country>();
for (const c of COUNTRIES.values()) { const k = [...c.regions].sort().join(','); if (!countryBySet.has(k)) countryBySet.set(k, c); }
/** The country whose preset is exactly these level-3 codes, for a view's title ("Native to Mexico"). */
export const countryOfCodes = (codes: readonly string[]): Country | undefined => countryBySet.get([...new Set(codes)].sort().join(','));
/**
 * The countries most of whose preset regions are in this region, for its "Whole country" links: South Africa under
 * Southern Africa, though its preset holds the Marion and Prince Edward Islands of the Subantarctic Islands too. A
 * country that holds no region alone or as the main country (Croatia, in TDWG's Yugoslavia) is not offered.
 */
export function countriesIn(code: string): Country[] {
  const inside = new Set(level3Of(code));
  return [...COUNTRIES.values()].filter((c) => !c.shared && c.regions.filter((r) => inside.has(r)).length * 2 > c.regions.length).sort((a, b) => nameOrder(a.name, b.name));
}

/* ---------- other names ---------- */

/** An other name of one or more level-3 regions, and its source's letter (`ALIASES_SOURCE`). */
export interface Alias { name: string; regions: readonly string[]; from: string }
const ALIASES: Alias[] = (levels.aliases as Array<[string, string[], string]>).map(([name, regions, from]) => ({ name, regions, from }));
const aliasByFold = new Map<string, Alias>();
for (const a of ALIASES) aliasByFold.set(fold(a.name), a);
/** The words of a name, folded as the region search reads them. */
export const regionFold = fold;
/** The alias spelt as typed, folded, or undefined. */
export const aliasNamed = (typed: string): Alias | undefined => aliasByFold.get(fold(typed));
/** Every alias, for a search that reads them by their words. */
export const aliases = (): readonly Alias[] => ALIASES;
