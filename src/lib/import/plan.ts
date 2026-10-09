/**
 * What an import will do, worked out before anything is written (round sixty; the grower review's 2): the numbers each
 * plant will get, the places it goes to and the ones that would be made, and what was not read as given. The page shows
 * this as the review list; `commit.ts` then writes exactly it, through the collection's own add functions.
 */
import type { NumberingScheme } from '$core/accession';
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';
import { parseName } from '$core/names';
import { yearOf } from '$core/year';

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
  /** The import key of each plant this line still makes, in order (`keyLines`): one per plant, so `qty` is its length. */
  importKeys?: string[];
  /** The name as the sheet gave it, before the review changed it ("Use it", an edit): kept as the name as received when the name filed differs (round sixty-two; the records review, 2). */
  originalName?: string;
  /** Every plant this line makes is here already, by its import key: a first run added it (round sixty-two). */
  done?: boolean;
  /** How many of this line's plants are here already: the line offers only the rest. */
  partDone?: number;
  /** The record id a Cultifolio plants.csv gives in its id column: the same plant, when a live plant here has it. */
  recordId?: string | null;
}

export const blankRow = (key: string, line: number, name: string): ImportRow => ({ key, line, name, cultivar: null, fieldNumber: null, qty: 1, number: null, placePath: null, placeId: null, acquired: null, source: null, notes: null, price: null, nameKind: null, parentage: null, nameAsReceived: null, provenance: null, status: 'growing', lot: null, form: null, problems: [], drop: false, originalName: name });

/**
 * A line's cells as a key (round sixty-two; the records review, 1, the grower review, 3, A18, B6): each cell as the
 * import reads it (trimmed, the backup's guard apostrophe off), its spaces closed up and its case folded, the empty cells
 * at the end left off (a spreadsheet saving the sheet again may drop them), hashed (53 bits, cyrb53). Nothing of the
 * text is kept, and the same line always gives the same key, whatever its number, its name after the review, or where it
 * sits in the sheet.
 */
export function lineHash(cells: string[]): string {
  const norm = cells.map((c) => (c ?? '').replace(/^'(?='*\s*[=+\-@])/, '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase());
  while (norm.length && !norm[norm.length - 1]) norm.pop();
  const str = norm.join('\u001f');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'i' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The import key of every plant each line makes: the line's hash, then the plant's place among the plants that line and
 * the identical lines before it make ("i3k9…#1" to "#3" for a Qty of 3; a second identical line goes on at "#4"), so two
 * identical lines are two plants, and a line cut off after its first plant is known by its second.
 */
export function keyLines(lines: Array<{ cells: string[]; qty: number }>): string[][] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const h = lineHash(l.cells);
    const from = seen.get(h) ?? 0;
    seen.set(h, from + l.qty);
    return Array.from({ length: l.qty }, (_, i) => `${h}#${from + i + 1}`);
  });
}

/**
 * The lines a first run already added, by the import keys on the live plants here (`has`): a line whose every plant is
 * here is done, and left out; a line some of whose plants are here offers only the rest, under new numbers, its own
 * number having gone to the first (round sixty-two; the records review, 1, the grower review, 3, A18, B6).
 */
export function markImported(rows: ImportRow[], has: (key: string) => boolean, isHere: (recordId: string) => boolean = () => false): ImportRow[] {
  return rows.map((r) => {
    // A backup's own plants.csv read back into the collection that wrote it: each line names its plant's record.
    if (r.recordId && isHere(r.recordId)) return { ...r, done: true, drop: true };
    const keys = r.importKeys;
    if (!keys?.length) return r;
    const missing = keys.filter((k) => !has(k));
    if (!missing.length) return { ...r, done: true, drop: true };
    if (missing.length === keys.length) return r;
    return { ...r, importKeys: missing, qty: missing.length, partDone: keys.length - missing.length, number: has(keys[0]) ? null : r.number };
  });
}

/**
 * One pass of a sheet (round sixty-two; the records review, 5): the lines already here are left out and counted, the
 * lines that look already imported are kept (said, and overridable), and of the rest the first `max` are read; the
 * others wait for the next pass, which reads the same file again and finds these here.
 */
export function passOf(rows: ImportRow[], max: number): { rows: ImportRow[]; done: number; later: number } {
  const out: ImportRow[] = [];
  let done = 0, taken = 0, later = 0;
  for (const r of rows) {
    if (r.done) { done++; continue; }
    if (r.already && r.drop) { out.push(r); continue; }
    if (taken < max) { out.push(r); taken++; } else later++;
  }
  return { rows: out, done, later };
}

export interface NumberPlan {
  /** By row key: the numbers its plants will get, in order, and whether the sheet's own number was kept. */
  byRow: Map<string, { numbers: string[]; kept: boolean; given: string | null }>;
  /** Rows whose given number is taken (by a plant here, or earlier in the same file: `inFile` is that row's line): they get the next free one. */
  renumbered: Array<{ key: string; line: number; given: string; got: string; inFile?: number }>;
  /** The order the rows are written in: rows keeping their own number first, so a number minted for another row cannot take it. */
  order: string[];
  /**
   * The number the import numbered on from, when the sheet's numbers share one pattern that is not this collection's
   * scheme (`sheetPattern`) and a plant was numbered in it: the highest number of that pattern in the sheet or here,
   * before the first number it gave (round sixty-three; the fix pass, R2 5: it named the sheet's highest beside a line
   * that got one past this collection's). Null when no plant was numbered in the sheet's pattern: a renumbered line then
   * takes this collection's next number, as before.
   */
  onFrom: string | null;
  /** True when `onFrom` is a plant's number here, higher than any in the sheet; false when it is the sheet's own highest. */
  onFromHere: boolean;
  /** How many further plants of a line of several (Qty) were numbered in the sheet's pattern (the fix pass, R2 6). */
  extrasOn: number;
  /** Whether the sheet's numbers do not share one pattern, so a renumbered line took this collection's next number (said on the review). */
  mixed: boolean;
  /** Whether the sheet numbers as this collection does (a Cultifolio export, over several years too), so a renumbered line took this collection's next number by its own rule (the fix pass, R2 4). */
  own: boolean;
}

/** A number as a pattern: what comes before its last run of digits, and how many digits. */
const PATTERN = /^(.*?)(\d+)$/;
/** A run of digits padded with a leading zero ("0007"; a lone "0" is not padding). */
const padded = (digits: string) => digits.length > 1 && digits[0] === '0';
/** A number in a pattern, as the sheet writes it: zero-padded to the width, or unpadded when the width is 0. */
const inPattern = (prefix: string, width: number, n: number) => prefix + (width ? String(n).padStart(width, '0') : String(n));
/**
 * The pattern the sheet's own numbers share, when they share one (round sixty-three; the round-sixty grower review,
 * finding 10): the same prefix, and the same width of digits (0001 to 0300, A001 to A095) or, when no number is
 * zero-padded, digits of any width (1 to 300, A9 to A95), recorded as width 0 (the fix pass, R2 3: the commonest
 * spreadsheet numbering, and the grower review's own A9 to A95, were told they followed no pattern). A renumbered line in
 * a collection numbered 0001 to 0300 was given 2026-0009. A sheet that numbers as this collection does (2026-0001 under
 * the year scheme, over one year or several, GH-001 under a GH prefix of width 3) is not a pattern of its own: this
 * collection's rule numbers it, the year of a plant included, and 'own' says so (the fix pass, R2 4).
 */
export function sheetPattern(rows: ImportRow[], scheme: NumberingScheme): { prefix: string; width: number; top: number; last: string } | 'mixed' | 'own' | null {
  const nos = rows.map((r) => r.number?.trim()).filter((g): g is string => !!g);
  if (!nos.length) return null;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownRe = new RegExp(`^${scheme.mode === 'year' ? '\\d{4}' : esc(scheme.prefix ?? 'ACC')}-\\d{${scheme.width},}$`);
  if (nos.every((g) => ownRe.test(g))) return 'own';
  let prefix: string | null = null, top = -1, last = '';
  const widths = new Set<number>();
  let anyPadded = false;
  for (const g of nos) {
    const m = PATTERN.exec(g);
    if (!m) return 'mixed';
    if (prefix === null) prefix = m[1];
    else if (m[1] !== prefix) return 'mixed';
    widths.add(m[2].length);
    anyPadded ||= padded(m[2]);
    const n = Number(m[2]);
    if (n > top) { top = n; last = g; }
  }
  // Unpadded numbers carry on unpadded, whatever their widths; padded ones only at one width.
  if (anyPadded && widths.size > 1) return 'mixed';
  return { prefix: prefix!, width: anyPadded ? [...widths][0] : 0, top, last };
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
  // A line whose own number is taken is numbered on in the sheet's own pattern, when the sheet has one, past the sheet's
  // highest number and this collection's in that pattern; past the pattern's width, by this collection's rule (round sixty-three).
  const found = sheetPattern(rows, scheme);
  const pat = found !== null && typeof found === 'object' ? found : null;
  // In the pattern: the same prefix, and the same width (padded) or no zero padding (unpadded, width 0).
  const fits = (m: RegExpExecArray) => !!pat && m[1] === pat.prefix && (pat.width ? m[2].length === pat.width : !padded(m[2]));
  let patTop = pat ? pat.top : 0, hereTop = -1, startN: number | null = null;
  if (pat) for (const id of here) { const m = PATTERN.exec(id); if (m && fits(m)) hereTop = Math.max(hereTop, Number(m[2])); }
  if (pat) for (const id of used) { const m = PATTERN.exec(id); if (m && fits(m)) patTop = Math.max(patTop, Number(m[2])); }
  const nextInSheet = (): string | null => {
    if (!pat) return null;
    const from = patTop;
    let id: string;
    do {
      const n = String(++patTop);
      if (pat.width && n.length > pat.width) return null;
      id = inPattern(pat.prefix, pat.width, Number(n));
    } while (used.has(id) || isTaken(id));
    used.add(id);
    startN ??= from; // the number the import numbered on from: the highest in the pattern, here or in the sheet, before its first
    return id;
  };
  let extrasOn = 0;
  for (const r of live) {
    const year = yearOf(r.acquired) ?? r.numberYear ?? thisYear;
    const plan = byRow.get(r.key) ?? { numbers: [], kept: false, given: r.number?.trim() || null };
    // Every plant of a line that gave a number, kept or renumbered, is numbered in the sheet's pattern when it has one: a
    // kept line's further plants took this collection's scheme while a renumbered line's took the sheet's, two schemes in
    // one import (the fix pass, R2 6). A line with no number keeps this collection's rule.
    while (plan.numbers.length < r.qty) {
      const n = plan.given ? nextInSheet() : null;
      if (n && plan.numbers.length) extrasOn++;
      plan.numbers.push(n ?? next(year));
    }
    byRow.set(r.key, plan);
    if (plan.given && !plan.kept) {
      const earlier = keptBy.get(plan.given);
      renumbered.push({ key: r.key, line: r.line, given: plan.given, got: plan.numbers[0], ...(earlier !== undefined && !here.has(plan.given) && !isTaken(plan.given) ? { inFile: earlier } : {}) });
    }
  }
  const onFrom = pat && startN !== null ? inPattern(pat.prefix, pat.width, startN) : null;
  return { byRow, renumbered, order, onFrom, onFromHere: onFrom !== null && startN === hereTop && hereTop > pat!.top, extrasOn, mixed: found === 'mixed' && renumbered.length > 0, own: found === 'own' && renumbered.length > 0 };
}

/**
 * Rows whose number a plant here already holds under the same name: said as "looks already imported" (round sixty-one;
 * the grower review, 6). Since round sixty-two this is only that warning: the import keys (`markImported`) decide what a
 * first run added, and a line they settle is left alone. A plant with no import key (added by hand, or by an import
 * before round sixty-two) is the only evidence there is, so the line is skipped unless the grower adds it anyway. A plant
 * that carries another line's import key came from another line (a second sheet that starts its numbering again, "7
 * Lithops lesliei", or a line since edited), so the line is said and kept, under the next free number, for the grower to
 * drop if it is the same plant (A18). `held` lists the live plants that carry a number.
 */
export function markAlreadyImported(rows: ImportRow[], held: (no: string) => Array<{ taxonName: string; cultivar?: string | null; importKey?: string | null }>): ImportRow[] {
  return rows.map((r) => {
    const g = r.number?.trim();
    if (!g || r.done || r.partDone) return r;
    const p = parseName(r.name);
    const cv = (r.cultivar ?? p.cultivar ?? '').toLowerCase();
    const same = held(g).filter((a) => a.taxonName.toLowerCase() === p.scientific.toLowerCase() && (a.cultivar ?? '').toLowerCase() === cv);
    if (!same.length) return r;
    return { ...r, already: true, drop: same.some((a) => !a.importKey) };
  });
}

/**
 * A place path as written in a sheet: split on the app's own separator, " › " with its spaces, and nothing else (round
 * sixty-one; the records review, 7). A place may be called "Shelf >1 m" or "Front/back"; the sheet a backup writes joins a
 * path with " › ", and a ">" or "/" inside a name is the name's.
 */
export const splitPath = (p: string): string[] => p.split(' › ').map((s) => s.trim()).filter(Boolean);

/**
 * Where a place cell written with ">" or "/" steps down a path (round sixty-two; the grower review, 6, and the
 * verification grower review, 6). Outside brackets only: "Cold frame (N/S)" is one place. A ">" between letters or with
 * spaces on both sides ("Greenhouse > Bench 2", "Greenhouse>Bench 2"; not "Shelf >1 m"). A "/" with spaces on both sides
 * ("Greenhouse / Bench 2"); a "/" with none only between two words of three letters or more when the part before it
 * names a place here ("Greenhouse/Bench 2" with a Greenhouse here): "S/W window", "N/E bench", "Shelf 1/2" and a
 * "Front/back" that is no place here are each one place, and a slash made junk places of their halves ("S" with "W
 * window" inside). The parts, trimmed; one part when the cell is no path.
 */
function pathParts(cell: string, places: PlaceNode[]): string[] {
  const parts: string[] = [];
  let depth = 0, from = 0;
  const letter = (ch: string | undefined) => !!ch && /\p{L}/u.test(ch);
  const alnum = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth || (ch !== '>' && ch !== '/')) continue;
    const before = cell.slice(from, i), after = cell.slice(i + 1);
    const spaced = /\s$/.test(before) && /^\s/.test(after);
    const l = before.trimEnd().at(-1), r = after.trimStart()[0];
    let step: boolean;
    if (ch === '>') step = (letter(l) && letter(r)) || (spaced && alnum(l) && alnum(r));
    else if (spaced) step = alnum(l) && alnum(r);
    else {
      const wl = /\p{L}+$/u.exec(before)?.[0] ?? '', wr = /^\p{L}+/u.exec(after)?.[0] ?? '';
      step = Array.from(wl).length >= 3 && Array.from(wr).length >= 3 && 'id' in resolvePlace([...parts, before.trim()].join(' › '), places);
    }
    if (!step) continue;
    parts.push(before.trim());
    from = i + 1;
  }
  parts.push(cell.slice(from).trim());
  return parts.filter(Boolean);
}
/**
 * The sheet's place cells written with ">" or "/" for a path, as a keyboard writes one (round sixty-two; the grower
 * review, 6): asked once for the sheet, "Read > and / as a path". `paths` is how many cells have one; `yes` is the
 * default, yes when the first part names a place here or is the first part of another such cell, which a place called
 * "Front/back" is not.
 */
export function loosePaths(cells: Array<string | null>, places: PlaceNode[]): { paths: number; yes: boolean; example: string | null } {
  const firsts = new Map<string, number>();
  let paths = 0;
  let example: string | null = null;
  for (const c of new Set(cells.filter((x): x is string => !!x))) {
    if (places.some((p) => same(p.name.trim(), c.trim()))) continue; // a place here by that whole name is that place
    const parts = pathParts(c, places);
    if (parts.length < 2) continue;
    paths++;
    example ??= c;
    const first = parts[0].toLowerCase();
    firsts.set(first, (firsts.get(first) ?? 0) + 1);
  }
  const here = (n: string) => places.some((p) => p.parentId === null && same(p.name.trim(), n));
  const yes = [...firsts].some(([f, n]) => n > 1 || here(f));
  return { paths, yes, example };
}
/** A place cell read with ">" and "/" as a path: written the app's way, "Greenhouse › Bench 2". `places` are the places here, which a "/" with no spaces must start from. */
export const asPath = (p: string, places: PlaceNode[] = []): string => pathParts(p, places).join(' › ');
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

/**
 * "Use it": the reference's species put in place of the species part of the name as typed, and nothing else (round
 * sixty-two; the records review, 2). "Copiapoa cf. cinera" becomes "Copiapoa cf. cinerea", "Copiapoa cinera subsp.
 * haseltoniana (white spines)" becomes "Copiapoa cinerea subsp. haseltoniana (white spines)": the qualifier, the rank
 * and what follows it, the cultivar and the aside stay. The sheet's own text is kept apart (`originalName`) for the name
 * as received.
 */
export function useSpecies(typed: string, species: string): string {
  const p = parseName(typed);
  const [g, ...ep] = species.trim().split(/\s+/);
  const toks = p.scientific.split(' ');
  const tail = p.qualifier ? toks.slice(p.epithet ? 3 : 2) : toks.slice(p.epithet ? 2 : 1);
  const name = [g, p.qualifier, ...ep, ...tail].filter(Boolean).join(' ');
  return `${name}${p.cultivar ? ` '${p.cultivar}'` : ''}${p.aside ? ` (${p.aside})` : ''}`;
}
