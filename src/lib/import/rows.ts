/** Pasted lines and sheet rows as the one shape the review list and the commit read (round sixty). */
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';
import { cellText, readDate, readRow, unmappedColumns, type DateOrder, type Mapping } from './csv';
import type { PastedLine } from './paste';
import { blankRow, type ImportRow } from './plan';

/** A paste: the same place and date acquired for every line; the source given for the list unless a line names its own. A line with no name is left out (the page counts it). */
export function rowsFromPaste(lines: PastedLine[], common: { placeId: string | null; acquired: string | null; source: string | null }): ImportRow[] {
  return lines.filter((l) => l.name).map((l) => ({
    ...blankRow(`p${l.line}`, l.line, l.name),
    cultivar: l.cultivar,
    number: l.number,
    notes: l.notes,
    placeId: common.placeId,
    acquired: common.acquired,
    source: l.source ?? common.source,
    problems: l.problem ? [l.problem] : []
  }));
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
  rows.forEach((cells, i) => {
    if (header && i === 0) return;
    if (head && cells.length && head.every((h, k) => h === cellText(cells[k]).toLowerCase())) { repeatedHeader++; return; }
    const v = readRow(cells, m);
    const genus = orNull(v.genus);
    let name = orNull(v.name);
    // "Copiapoa" and "cinerea" in two columns are "Copiapoa cinerea"; a Species cell that already starts with its genus is kept as it is.
    if (genus) name = !name ? genus : name.toLowerCase().startsWith(`${genus.toLowerCase()} `) || name.toLowerCase() === genus.toLowerCase() ? name : `${genus} ${name}`;
    if (!name) { noName++; return; }
    const r = blankRow(`s${i + 1}`, i + 1, name);
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
    const q = orNull(v.qty);
    if (q) {
      const n = /^\d+$/.test(q) ? Number(q) : NaN;
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
    if (kind) { if (KINDS.includes(kind as NameKind)) r.nameKind = kind as NameKind; else r.problems.push(`kind "${v.kind}" is not species, cultivar or hybrid; read from the name`); }
    const prov = orNull(v.provenance)?.toLowerCase();
    if (prov) { if (PROV.includes(prov as Provenance)) r.provenance = prov as Provenance; else r.problems.push(`provenance "${v.provenance}" was not read; kept in the notes`); }
    if (prov && !PROV.includes(prov as Provenance)) addNote(r, `Provenance: ${v.provenance}`);
    const st = orNull(v.status)?.toLowerCase();
    if (st) { if (STATUS.includes(st as AccStatus)) r.status = st as AccStatus; else r.problems.push(`status "${v.status}" was not read; added as growing`); }
    // Every column no field takes, in the notes as "Locality: Totoral, Chile": nothing in the sheet is dropped unseen.
    for (const c of extra) { const t = cellText(cells[c.i]); if (t) addNote(r, `${c.name}: ${t}`); }
    out.push(r);
  });
  return { rows: out, noName, repeatedHeader };
}
