/**
 * What an import will do, worked out before anything is written (round sixty; the grower review's 2): the numbers each
 * plant will get, the places it goes to and the ones that would be made, and what was not read as given. The page shows
 * this as the review list; `commit.ts` then writes exactly it, through the collection's own add functions.
 */
import { nextAccession, type NumberingScheme } from '$core/accession';
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';

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
}

export const blankRow = (key: string, line: number, name: string): ImportRow => ({ key, line, name, cultivar: null, fieldNumber: null, qty: 1, number: null, placePath: null, placeId: null, acquired: null, source: null, notes: null, price: null, nameKind: null, parentage: null, nameAsReceived: null, provenance: null, status: 'growing', lot: null, form: null, problems: [], drop: false });

const yearOf = (d: string | null): number | undefined => (d && /^\d{4}-/.test(d) ? Number(d.slice(0, 4)) : undefined);

export interface NumberPlan {
  /** By row key: the numbers its plants will get, in order, and whether the sheet's own number was kept. */
  byRow: Map<string, { numbers: string[]; kept: boolean; given: string | null }>;
  /** Rows whose given number is taken (by a plant here, or earlier in the same file): they get the next free one. */
  renumbered: Array<{ key: string; line: number; given: string; got: string }>;
  /** The order the rows are written in: rows keeping their own number first, so a number minted for another row cannot take it. */
  order: string[];
}

/**
 * The numbers an import gives, as the collection will mint them: a number the sheet gives is kept when no plant here has
 * ever had it and no earlier row keeps it; every other plant gets the next free number for its acquisition year, by the
 * collection's own rule (`nextAccession`). A row of several plants keeps its number on the first, as the add form does.
 */
export function planNumbers(rows: ImportRow[], taken: Iterable<string>, scheme: NumberingScheme, thisYear: number, isTaken: (no: string) => boolean = () => false): NumberPlan {
  const used = new Set(taken);
  const live = rows.filter((r) => !r.drop);
  const byRow = new Map<string, { numbers: string[]; kept: boolean; given: string | null }>();
  const renumbered: NumberPlan['renumbered'] = [];
  const keeps = new Set<string>();
  for (const r of live) {
    const g = r.number?.trim() || null;
    if (g && !used.has(g) && !isTaken(g)) { used.add(g); keeps.add(r.key); byRow.set(r.key, { numbers: [g], kept: true, given: g }); }
  }
  const order = [...live.filter((r) => keeps.has(r.key)), ...live.filter((r) => !keeps.has(r.key))].map((r) => r.key);
  for (const r of live) {
    const year = yearOf(r.acquired) ?? thisYear;
    const plan = byRow.get(r.key) ?? { numbers: [], kept: false, given: r.number?.trim() || null };
    while (plan.numbers.length < r.qty) {
      const n = nextAccession(used, scheme, year);
      used.add(n);
      plan.numbers.push(n);
    }
    byRow.set(r.key, plan);
    if (plan.given && !plan.kept) renumbered.push({ key: r.key, line: r.line, given: plan.given, got: plan.numbers[0] });
  }
  return { byRow, renumbered, order };
}

/** A place path as written in a sheet: "Greenhouse › Bench 2", "Greenhouse > Bench 2". */
export const splitPath = (p: string): string[] => p.split(/\s*[›>]\s*/).map((s) => s.trim()).filter(Boolean);
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export interface PlaceNode { id: string; name: string; parentId: string | null }
/**
 * Places by name, from the top of the tree down: "Greenhouse › Bench 2" is the Bench 2 inside the Greenhouse, not any
 * Bench 2. A path whose places are all here is that place; otherwise the part that is here and the names that would be
 * made under it, which are made only when the grower says so.
 */
export function resolvePlace(path: string, places: PlaceNode[]): { id: string } | { under: string | null; make: string[] } {
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
