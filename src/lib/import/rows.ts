/** Pasted lines and sheet rows as the one shape the review list and the commit read (round sixty). */
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';
import { cellText, readDate, readRow, unmappedColumns, type DateOrder, type Field, type Mapping } from './csv';
import type { PastedLine } from './paste';
import { readPrice } from '$lib/ui/grow/spend';
import { blankRow, keyLines, keySheet, numberKey, type AltCells, type ImportRow } from './plan';

/**
 * A name cell as the reference and the collection read it (round sixty-two, second pass; the verification grower
 * review): compatibility forms folded (NFKC: full-width letters, a ligature, a no-break space) and the invisible format
 * characters a paste from a web page brings taken out (a soft hyphen, a zero-width space, a byte order mark), so
 * "Copia\u00adpoa cinerea" is Copiapoa cinerea and not "not in the reference". A zero-width joiner inside an emoji is kept.
 */
const INVISIBLE = /(?!\u200d(?=\p{Extended_Pictographic}))\p{Cf}/gu;
export const cleanName = (s: string): string => s.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
/** A row named by its cleaned name; when cleaning changed it, the text as received is kept (`recordOf` files it as the name as received). */
const named = (key: string, line: number, raw: string): ImportRow => {
  const name = cleanName(raw);
  const r = blankRow(key, line, name);
  if (name !== raw.trim()) r.originalName = raw.trim();
  return r;
};

/** A paste: the same place and date acquired for every line; the source given for the list unless a line names its own. A line with no name is left out (the page counts it). */
export function rowsFromPaste(lines: PastedLine[], common: { placeId: string | null; acquired: string | null; source: string | null }): ImportRow[] {
  const named_ = lines.filter((l) => cleanName(l.name));
  // Each line's own parts are what make it that line: the same list pasted again is the same plants (round sixty-two).
  const keys = keyLines(named_.map((l) => ({ cells: [l.name, l.cultivar ?? '', l.number ?? '', l.source ?? '', l.notes ?? ''], qty: 1 })));
  return named_.map((l, i) => ({
    ...named(`p${l.line}`, l.line, l.name),
    importKeys: keys[i],
    cultivar: l.cultivar,
    number: l.number,
    notes: l.notes,
    placeId: common.placeId,
    acquired: common.acquired,
    source: l.source ?? common.source,
    problems: l.problem ? [l.problem] : []
  }));
}

/**
 * A date as round sixty-seven's import key read it: a whole date by its year and its day and month in either order. It
 * gave 2024-01-05 and 2024-05-01 one key (round sixty-nine; triage-68 R1, the self-review's D1, IND-5, R46-20), so it
 * is kept only to find the plants round sixty-seven's imports filed (`legacyKey`), never to file a new one.
 */
function dateKey67(cell: string, read: string | null): string {
  const full = read && /^(\d{4})-(\d{2})-(\d{2})$/.exec(read);
  if (full) return `${full[1]}|${[full[2], full[3]].sort().join('|')}`;
  const loose = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(cell.trim());
  if (loose) return `${loose[3]}|${[loose[1].padStart(2, '0'), loose[2].padStart(2, '0')].sort().join('|')}`;
  return read ?? cell.trim();
}

/**
 * A date as the import key reads it (round sixty-nine; triage-68 R1): a date read is keyed by its exact day, so
 * 2024-01-05 and 2024-05-01 are two plants. Only a cell that is itself ambiguous (09/03/2024, which the grower may answer
 * day first in one run and month first, or not at all, in the next) is keyed by its year with day and month in either
 * order, marked "~" so no exact day can take its key. `others` are the keys a plant of the same line may have been filed
 * under: for an ambiguous cell, each exact reading; for an exact day whose day and month could swap, the "~" form, as a
 * spreadsheet saving the sheet again writes the ambiguous 09/03/2024 as 2024-03-09. `markImported` tries them after the
 * line's own key.
 * A date read at a lesser precision is that reading; one not read at all is its text.
 */
function dateKey(cell: string, read: string | null, today: string): { key: string; others: string[]; ambiguous: boolean; swaps: boolean } {
  const asked = readDate(cell, today, null);
  const two = (x: string) => x.padStart(2, '0');
  const sorted = (y: string | number, a: string, b: string) => `~${y}|${[two(a), two(b)].sort().join('|')}`;
  if (asked.ambiguous) {
    // Either reading, as a plant filed from the same line written 2024-03-09 or 2024-09-03 has it.
    const m = /^(\d{1,2})\D(\d{1,2})\D/.exec(cell.trim())!;
    const y = asked.year!;
    return { key: sorted(y, m[1], m[2]), others: [`${y}-${two(m[2])}-${two(m[1])}`, `${y}-${two(m[1])}-${two(m[2])}`], ambiguous: true, swaps: true };
  }
  const full = read && /^(\d{4})-(\d{2})-(\d{2})$/.exec(read);
  const swaps = !!full && full[2] !== full[3] && +full[2] <= 12 && +full[3] <= 12;
  return { key: read ?? cell.trim(), others: swaps ? [sorted(full![1], full![2], full![3])] : [], ambiguous: false, swaps };
}

/** A price as a number and its currency when it is a plain amount ("12.50" and "12.5" are one price), else its text (round sixty-nine; triage-68 R1, R46-20). */
function priceKey(text: string): string {
  const p = text ? readPrice(text) : null;
  return p ? `${p.v}${p.cur ? ` ${p.cur}` : ''}` : text;
}

/** A sheet line's fields as read, for its import keys: everything the plant is filed with. */
interface KeyParts { name: string; v: Partial<Record<Field, string>>; date: string; notes: string }

/**
 * A sheet line's import key cells: its fields as the import reads them through the mapping, in one fixed order, and not
 * the raw cells (round sixty-seven; triage-66 R3). A spreadsheet saving the sheet again rewrote 0012 as 12 and 12.50 as
 * 12.5: a number's digits lose their leading zeros, and a price is its amount (`priceKey`). The date is `dateKey`'s. The
 * notes are the notes the plant gets, the columns no field takes included ("Locality: Totoral"), so two plants told
 * apart only by such a column are two lines (round sixty-nine; triage-68 R1, the self-review's D1): the lines that
 * restate a keyed field ("Acquired (as written)", an unread Kind) are left out, as that field is keyed already. The
 * quantity is not a cell: it is how many keys the line makes (`keyLines`).
 */
function keyCells(p: KeyParts): string[] {
  const t = (f: Field) => (p.v[f] ?? '').trim();
  return [cleanName(p.name), t('cultivar'), numberKey(t('number')), t('place'), p.date, t('source'), t('fieldNumber'), p.notes, priceKey(t('price')), t('kind'), t('parentage'), t('nameAsReceived'), t('provenance'), t('status'), t('lot'), t('form')];
}
/** Round sixty-seven's key cells, for its plants only (`dateKey67`): the notes column alone, and the price as written. */
function keyCells67(name: string, v: Partial<Record<Field, string>>, acquired: string): string[] {
  const t = (f: Field) => (v[f] ?? '').trim();
  return [cleanName(name), t('cultivar'), numberKey(t('number')), t('place'), acquired, t('source'), t('fieldNumber'), t('notes'), t('price'), t('kind'), t('parentage'), t('nameAsReceived'), t('provenance'), t('status'), t('lot'), t('form')];
}

const PROV: Provenance[] = ['wild', 'f1', 'fn', 'veg', 'unknown'];
const STATUS: AccStatus[] = ['growing', 'archived', 'dead'];
const KINDS: NameKind[] = ['species', 'cultivar', 'hybrid'];
const orNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

/** What the grower chose for the whole sheet before "Check names" (round sixty-one; the grower review, 3 and 4). */
export interface SheetOpts {
  /** Dates like 09/03/2024: day first, month first, or left as written (null, the default: asking, never guessing). */
  dateOrder?: DateOrder;
  /** Columns no field takes, added to each plant's notes as "Column: value": all of them unless the grower says otherwise (`unmappedColumns`; [] for none). */
  extra?: Array<{ i: number; name: string }>;
}

/** Text added to a plant's notes, after what the notes column holds: one line each. */
const addNote = (r: ImportRow, line: string) => { r.notes = r.notes ? `${r.notes}${/\n$/.test(r.notes) ? '' : '\n'}${line}` : line; };
/** A whole number of plants, one to two hundred, as the add form takes. */
const QTY_MAX = 200;

/**
 * A sheet's rows through the mapping. A row with no name is left out and counted; a row that repeats the header (two
 * sheets pasted together) is left out and counted; a value a field cannot take is left empty and said on the row, and its
 * text kept in the notes, never guessed and never dropped (round sixty-one; the grower review, 3 and 4; the records
 * review, 10). Genus and Species in two columns make one name; "(white flower)" in a name is kept with the name as
 * received (`recordOf`); a Qty of 3 is three plants.
 */
export function rowsFromSheet(rows: string[][], m: Mapping, header: boolean, today: string, opts: SheetOpts = {}): { rows: ImportRow[]; noName: number; repeatedHeader: number } {
  const out: ImportRow[] = [];
  let noName = 0;
  let repeatedHeader = 0;
  const head = header ? (rows[0] ?? []).map((c) => cellText(c).toLowerCase()) : null;
  const extra = opts.extra ?? unmappedColumns(rows, m, header).extra;
  /** Each line's import key cells, and the other keys a plant of it may have been filed under (`keyCellsOf`). */
  const cellsOf: Array<{ cells: string[]; alts: AltCells[] }> = [];
  // A Cultifolio plants.csv names each plant's record in its id column: read back into the collection that wrote it, a
  // line whose plant is here is that plant (round sixty-two).
  const idCol = head ? head.findIndex((h) => h === 'id') : -1;
  rows.forEach((cells, i) => {
    if (header && i === 0) return;
    if (head && cells.length && head.every((h, k) => h === cellText(cells[k]).toLowerCase())) { repeatedHeader++; return; }
    const v = readRow(cells, m);
    const genus = orNull(v.genus);
    let name = orNull(v.name);
    // "Copiapoa" and "cinerea" in two columns are "Copiapoa cinerea"; a Species cell that already starts with its genus is kept as it is.
    if (genus) name = !name ? genus : name.toLowerCase().startsWith(`${genus.toLowerCase()} `) || name.toLowerCase() === genus.toLowerCase() ? name : `${genus} ${name}`;
    if (!name || !cleanName(name)) { noName++; return; }
    const r = named(`s${i + 1}`, i + 1, name);
    r.cultivar = orNull(v.cultivar);
    r.fieldNumber = orNull(v.fieldNumber);
    r.number = orNull(v.number);
    r.placePath = orNull(v.place);
    r.source = orNull(v.source);
    r.notes = v.notes && v.notes.trim() ? v.notes : null; // as written: a note's own spaces and line breaks are the grower's (round sixty-one; the records review, 6)
    r.price = orNull(v.price);
    r.parentage = orNull(v.parentage);
    r.nameAsReceived = orNull(v.nameAsReceived);
    r.lot = orNull(v.lot);
    r.form = orNull(v.form);
    if (idCol >= 0) r.recordId = orNull(cellText(cells[idCol]));
    const q = orNull(v.qty);
    if (q) {
      const n = /^\d+(?:\.0+)?$/.test(q) ? Number(q) : NaN; // "3.0": a number cell saved with decimals (round sixty-two; the records review, 14)
      if (n >= 1 && n <= QTY_MAX) r.qty = n;
      else { r.problems.push(`"${q}" was not read as a number of plants (1 to ${QTY_MAX}): one plant, and the text is in the notes`); addNote(r, `Qty: ${q}`); }
    }
    if (v.acquired) {
      const d = readDate(v.acquired, today, opts.dateOrder ?? null);
      r.acquired = d.d;
      if (!d.d) {
        // The text the sheet gave is kept, and the plant is numbered for the year it names, not this one (round sixty-one; the grower review, 4).
        r.dateText = v.acquired.trim();
        r.numberYear = d.year ?? null;
        addNote(r, `Acquired (as written): ${r.dateText}`);
        if (d.why) r.problems.push(`${d.why}; it is in the notes${d.year ? `, and the plant is numbered for ${d.year}` : ', and the plant is numbered for this year'}`);
      }
    }
    const kind = orNull(v.kind)?.toLowerCase();
    // An unread Kind or Status is kept in the notes, as Provenance is: said on the row and then lost, a sold plant arrived
    // as growing with no word of it (round sixty-two; the records review, 4).
    if (kind) { if (KINDS.includes(kind as NameKind)) r.nameKind = kind as NameKind; else { r.problems.push(`kind "${v.kind}" is not species, cultivar or hybrid; read from the name, and kept in the notes`); addNote(r, `Kind: ${v.kind}`); } }
    const prov = orNull(v.provenance)?.toLowerCase();
    if (prov) { if (PROV.includes(prov as Provenance)) r.provenance = prov as Provenance; else r.problems.push(`provenance "${v.provenance}" was not read; kept in the notes`); }
    if (prov && !PROV.includes(prov as Provenance)) addNote(r, `Provenance: ${v.provenance}`);
    const st = orNull(v.status)?.toLowerCase();
    if (st) { if (STATUS.includes(st as AccStatus)) r.status = st as AccStatus; else { r.problems.push(`status "${v.status}" was not read; added as growing, and kept in the notes`); addNote(r, `Status: ${v.status}`); } }
    // Every column no field takes, in the notes as "Locality: Totoral, Chile": nothing in the sheet is dropped unseen.
    const extras: string[] = [];
    for (const c of extra) { const t = cellText(cells[c.i]); if (t) { extras.push(`${c.name}: ${t}`); addNote(r, `${c.name}: ${t}`); } }
    out.push(r);
    cellsOf.push(keyCellsOf(name, v, r.acquired, extras, today));
  });
  // The plants each line makes, by the line's fields as read: what a second run of the same sheet finds here (round sixty-two;
  // round sixty-seven, triage-66 R3; round sixty-nine, triage-68 R1).
  const keys = keySheet(out.map((r, i) => ({ ...cellsOf[i], qty: r.qty })));
  out.forEach((r, i) => { r.importKeys = keys[i].keys; if (keys[i].alts.length) r.keyAlts = keys[i].alts; });
  return { rows: out, noName, repeatedHeader };
}

/**
 * A sheet line's key cells and the other cells a plant of it may have been filed under (round sixty-nine; triage-68 R1):
 * - the line with its date's other forms (`dateKey`);
 * - the line without the columns no field takes, taken only when no other line of the sheet shares it, so a column added
 *   to tick lines done does not make every line new, and Totoral inserted above Paposo is not taken for it;
 * - round sixty-seven's key (`keyCells67`), checked against the plant: its date acquired when that key gave two days one
 *   key, and its notes when another line shares the key, so an old key never takes another day's or another column's plant.
 */
function keyCellsOf(name: string, v: Partial<Record<Field, string>>, acquired: string | null, extras: string[], today: string): { cells: string[]; alts: AltCells[] } {
  const d = v.acquired ? dateKey(v.acquired, acquired, today) : { key: '', others: [], ambiguous: false, swaps: false };
  const notes = (n: string[]) => [v.notes ?? '', ...n].filter((x) => x.trim()).join('\n');
  const at = (date: string, n: string[]) => keyCells({ name, v, date, notes: notes(n) });
  const alts: AltCells[] = d.others.map((o) => ({ cells: at(o, extras) }));
  if (extras.length) for (const o of [d.key, ...d.others]) alts.push({ cells: at(o, []), onlyIfUnique: true });
  // Round sixty-seven's key gave 2024-01-05 and 2024-05-01 one key: a plant it filed is taken only on its own date.
  const dates = d.swaps && !d.ambiguous ? [acquired] : undefined;
  alts.push({ cells: keyCells67(name, v, v.acquired ? dateKey67(v.acquired, acquired) : ''), v67: true, ...(dates ? { dates } : {}), ...(extras.length ? { extras } : {}) });
  return { cells: at(d.key, extras), alts };
}
