/**
 * What an import will do, worked out before anything is written (round sixty; the grower review's 2): the numbers each
 * plant will get, the places it goes to and the ones that would be made, and what was not read as given. The page shows
 * this as the review list; `commit.ts` then writes exactly it, through the collection's own add functions.
 */
import type { NumberingScheme } from '$core/accession';
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';
import { parseName } from '$core/names';

export interface ImportRow {
  /** Stable for the review list. */
  key: string;
  /** Where it came from: a line of the paste or a row of the sheet (1-based, the header counted), for "line 12". */
  line: number;
  name: string;
  cultivar: string | null;
  fieldNumber: string | null;
  qty: number;
  /** A number the sheet gave; kept when free. */
  number: string | null;
  /** A place by its path ("Greenhouse › Bench 2"), from a sheet; a paste names one place for all by id instead. */
  placePath: string | null;
  placeId: string | null;
  acquired: string | null;
  source: string | null;
  notes: string | null;
  price: string | null;
  nameKind: NameKind | null;
  parentage: string | null;
  nameAsReceived: string | null;
  provenance: Provenance | null;
  status: AccStatus;
  lot: string | null;
  form: string | null;
  /** What was not read as given, said on the row. */
  problems: string[];
  drop: boolean;
  /** The year an unread date names ("09/03/2024" left as written is still 2024): the plant is numbered for it, not for this year (round sixty-one; the grower review, 4). */
  numberYear?: number | null;
  /** The date text as the sheet gave it, when it was not read; it is in the notes too. */
  dateText?: string | null;
  /** Its number is held here by a plant of the same name: most likely a line a first, interrupted import already added (round sixty-one; the grower review, 6). */
  already?: boolean;
}

export const blankRow = (key: string, line: number, name: string): ImportRow => ({ key, line, name, cultivar: null, fieldNumber: null, qty: 1, number: null, placePath: null, placeId: null, acquired: null, source: null, notes: null, price: null, nameKind: null, parentage: null, nameAsReceived: null, provenance: null, status: 'growing', lot: null, form: null, problems: [], drop: false });

/** The year of a date at any precision the import reads: 2024-03-09, 2024-03 or 2024. */
const yearOf = (d: string | null): number | undefined => (d && /^\d{4}(?:-|$)/.test(d) ? Number(d.slice(0, 4)) : undefined);

export interface NumberPlan {
  /** By row key: the numbers its plants will get, in order, and whether the sheet's own number was kept. */
  byRow: Map<string, { numbers: string[]; kept: boolean; given: string | null }>;
  /** Rows whose given number is taken (by a plant here, or earlier in the same file: `inFile` is that row's line): they get the next free one. */
  renumbered: Array<{ key: string; line: number; given: string; got: string; inFile?: number }>;
  /** The order the rows are written in: rows keeping their own number first, so a number minted for another row cannot take it. */
  order: string[];
}

/**
 * The numbers an import gives, as the collection would mint them: a number the sheet gives is kept when no plant here has
 * ever had it and no earlier row keeps it; every other plant gets the next free number for its year (the date acquired,
 * or the year an unread date names, else this year), by the collection's own rule: one past the highest number of that
 * year. The highest is found once per year and then carried as the plan goes (round sixty-one; the records review, 16):
 * asking `nextAccession` again for each plant scanned every number each time, and 2,000 rows took seconds. A row of
 * several plants keeps its number on the first, as the add form does. The page plans once, and the plan is frozen while
 * the rows are written.
 */
export function planNumbers(rows: ImportRow[], taken: Iterable<string>, scheme: NumberingScheme, thisYear: number, isTaken: (no: string) => boolean = () => false): NumberPlan {
  const used = new Set(taken);
  const live = rows.filter((r) => !r.drop);
  const byRow = new Map<string, { numbers: string[]; kept: boolean; given: string | null }>();
  const renumbered: NumberPlan['renumbered'] = [];
  const keeps = new Set<string>();
  const keptBy = new Map<string, number>();
  const here = new Set(used);
  for (const r of live) {
    const g = r.number?.trim() || null;
    if (g && !used.has(g) && !isTaken(g)) { used.add(g); keeps.add(r.key); keptBy.set(g, r.line); byRow.set(r.key, { numbers: [g], kept: true, given: g }); }
  }
  const order = [...live.filter((r) => keeps.has(r.key)), ...live.filter((r) => !keeps.has(r.key))].map((r) => r.key);
  // The running highest number per prefix, as `nextAccession` finds it (the same prefix and width), read once.
  const top = new Map<string, number>();
  const next = (year: number): string => {
    const prefix = scheme.mode === 'year' ? String(year) : (scheme.prefix ?? 'ACC');
    let n = top.get(prefix);
    if (n === undefined) {
      n = 0;
      const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
      for (const id of used) { const m = re.exec(id); if (m) n = Math.max(n, Number(m[1])); }
    }
    let id: string;
    do id = `${prefix}-${String(++n).padStart(scheme.width, '0')}`;
    while (used.has(id) || isTaken(id));
    top.set(prefix, n);
    used.add(id);
    return id;
  };
  for (const r of live) {
    const year = yearOf(r.acquired) ?? r.numberYear ?? thisYear;
    const plan = byRow.get(r.key) ?? { numbers: [], kept: false, given: r.number?.trim() || null };
    while (plan.numbers.length < r.qty) plan.numbers.push(next(year));
    byRow.set(r.key, plan);
    if (plan.given && !plan.kept) {
      const earlier = keptBy.get(plan.given);
      renumbered.push({ key: r.key, line: r.line, given: plan.given, got: plan.numbers[0], ...(earlier !== undefined && !here.has(plan.given) && !isTaken(plan.given) ? { inFile: earlier } : {}) });
    }
  }
  return { byRow, renumbered, order };
}

/**
 * Rows whose number a plant here already holds under the same name: offered as "already imported" and dropped by
 * default, so a second run of an import that was cut off does not file the same plants again under new numbers (round
 * sixty-one; the grower review, 6). `held` lists the live plants that carry a number.
 */
export function markAlreadyImported(rows: ImportRow[], held: (no: string) => Array<{ taxonName: string; cultivar?: string | null }>): ImportRow[] {
  return rows.map((r) => {
    const g = r.number?.trim();
    if (!g) return r;
    const p = parseName(r.name);
    const cv = (r.cultivar ?? p.cultivar ?? '').toLowerCase();
    const same = held(g).some((a) => a.taxonName.toLowerCase() === p.scientific.toLowerCase() && (a.cultivar ?? '').toLowerCase() === cv);
    return same ? { ...r, already: true, drop: true } : r;
  });
}

/**
 * A place path as written in a sheet: split on the app's own separator, " › " with its spaces, and nothing else (round
 * sixty-one; the records review, 7). A place may be called "Shelf >1 m" or "Front/back"; the sheet a backup writes joins a
 * path with " › ", and a ">" or "/" inside a name is the name's.
 */
export const splitPath = (p: string): string[] => p.split(' › ').map((s) => s.trim()).filter(Boolean);
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export interface PlaceNode { id: string; name: string; parentId: string | null }
/**
 * Places by name, from the top of the tree down: "Greenhouse › Bench 2" is the Bench 2 inside the Greenhouse, not any
 * Bench 2. A path whose places are all here is that place; otherwise the part that is here and the names that would be
 * made under it, which are made only when the grower says so. A place whose whole name is the cell is that place, before
 * any split: a place here called "Shelf › 1 m" is found by its own name.
 */
export function resolvePlace(path: string, places: PlaceNode[]): { id: string } | { under: string | null; make: string[] } {
  const whole = path.trim();
  const named = places.filter((p) => same(p.name.trim(), whole));
  const pick = named.find((p) => p.parentId === null) ?? (named.length === 1 ? named[0] : undefined);
  if (pick) return { id: pick.id };
  const segs = splitPath(path);
  let parent: string | null = null;
  for (let i = 0; i < segs.length; i++) {
    const hit: PlaceNode | undefined = places.find((p) => p.parentId === parent && same(p.name, segs[i]));
    if (!hit) return { under: parent, make: segs.slice(i) };
    parent = hit.id;
  }
  return parent ? { id: parent } : { under: null, make: [] };
}

/** Every place an import would make, each path once, parents before children, as display paths. */
export function placesToMake(paths: string[], places: PlaceNode[]): string[][] {
  const out = new Map<string, string[]>();
  for (const p of paths) {
    const r = resolvePlace(p, places);
    if ('id' in r || !r.make.length) continue;
    const segs = splitPath(p);
    const have = segs.length - r.make.length;
    for (let i = have + 1; i <= segs.length; i++) {
      const sub = segs.slice(0, i);
      const k = sub.map((s) => s.toLowerCase()).join('\0');
      if (!out.has(k)) out.set(k, sub);
    }
  }
  return [...out.values()].sort((a, b) => a.length - b.length);
}
