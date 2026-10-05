/** Pasted lines and sheet rows as the one shape the review list and the commit read (round sixty). */
import type { AccStatus, NameKind, Provenance } from '$lib/db/types';
import { readDate, readRow, type Mapping } from './csv';
import type { PastedLine } from './paste';
import { blankRow, type ImportRow } from './plan';

/** A paste: the same place and date acquired for every line; the source given for the list unless a line names its own. */
export function rowsFromPaste(lines: PastedLine[], common: { placeId: string | null; acquired: string | null; source: string | null }): ImportRow[] {
  return lines.map((l) => ({
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

/**
 * A sheet's rows through the mapping. A row with no name is left out and counted; a value a field cannot take (a date not
 * written year first, a status the app does not have) is left empty and said on the row, never guessed.
 */
export function rowsFromSheet(rows: string[][], m: Mapping, header: boolean, today: string): { rows: ImportRow[]; noName: number } {
  const out: ImportRow[] = [];
  let noName = 0;
  rows.forEach((cells, i) => {
    if (header && i === 0) return;
    const v = readRow(cells, m);
    const name = orNull(v.name);
    if (!name) { noName++; return; }
    const r = blankRow(`s${i + 1}`, i + 1, name);
    r.cultivar = orNull(v.cultivar);
    r.fieldNumber = orNull(v.fieldNumber);
    r.number = orNull(v.number);
    r.placePath = orNull(v.place);
    r.source = orNull(v.source);
    r.notes = orNull(v.notes);
    r.price = orNull(v.price);
    r.parentage = orNull(v.parentage);
    r.nameAsReceived = orNull(v.nameAsReceived);
    r.lot = orNull(v.lot);
    r.form = orNull(v.form);
    if (v.acquired) {
      const d = readDate(v.acquired, today);
      r.acquired = d.d;
      if (d.why) r.problems.push(d.why);
    }
    const kind = orNull(v.kind)?.toLowerCase();
    if (kind) { if (KINDS.includes(kind as NameKind)) r.nameKind = kind as NameKind; else r.problems.push(`kind "${v.kind}" is not species, cultivar or hybrid; read from the name`); }
    const prov = orNull(v.provenance)?.toLowerCase();
    if (prov) { if (PROV.includes(prov as Provenance)) r.provenance = prov as Provenance; else r.problems.push(`provenance "${v.provenance}" was not read; kept in the notes`); }
    if (prov && !PROV.includes(prov as Provenance)) r.notes = [r.notes, `Provenance: ${v.provenance}`].filter(Boolean).join('\n');
    const st = orNull(v.status)?.toLowerCase();
    if (st) { if (STATUS.includes(st as AccStatus)) r.status = st as AccStatus; else r.problems.push(`status "${v.status}" was not read; added as growing`); }
    out.push(r);
  });
  return { rows: out, noName };
}
