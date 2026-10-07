/**
 * A pasted list, one plant per line (round sixty; the grower review's 2 and §4, the self-review's experience item 4):
 *
 *   Copiapoa cinerea
 *   Haworthia truncata; Lime Green
 *   Gymnocalycium ragonesei; ; 2024-0031; club sale; LB 1427, two heads
 *
 * The name, then optionally the cultivar, the plant's number, where it came from and a note, separated by semicolons (or
 * tabs, which is what columns copied out of a spreadsheet arrive as). Bullets and numbering a list was typed with are
 * taken off; empty lines and lines starting with # are skipped. Nothing is guessed: what is left after the note is said
 * on the review list, never filed somewhere it might not belong. A line with no name comes back with an empty name and
 * is counted, never filed.
 */
export interface PastedLine {
  /** 1-based line in what was pasted, for "line 12". */
  line: number;
  name: string;
  cultivar: string | null;
  /** The plant number the line gives; kept when free, else the next free one (the review says which). */
  number: string | null;
  /** Where it came from, for this line only; blank: the one given for the whole list. */
  source: string | null;
  notes: string | null;
  /** What was not read as given, said on the review list. */
  problem?: string;
}

const cell = (s: string | undefined): string | null => (s ?? '').trim() || null;

export function parsePaste(text: string): PastedLine[] {
  const out: PastedLine[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  lines.forEach((raw, i) => {
    let s = raw.trim();
    if (!s || s.startsWith('#')) return;
    // "- Copiapoa", "• Copiapoa", "12. Copiapoa", "12) Copiapoa": the list's own marks, not the name.
    s = s.replace(/^(?:[-*•·–]\s+|\d{1,4}[.)]\s+)/, '');
    const parts = s.split(/[;\t]/).map((x) => x.trim()); // one separator per tab: an empty cell between two tabs is a column
    const name = (parts[0] ?? '').trim();
    // A line with something on it but no name is not a plant; it is kept here, nameless, so the review can say it was
    // left out, as the sheet's rows with no name are counted (round sixty-one; the records review, 11).
    if (!name) { if (parts.some((x) => x)) out.push({ line: i + 1, name: '', cultivar: null, number: null, source: null, notes: null, problem: 'this line has no name, so it was left out' }); return; }
    const cultivar = (parts[1] ?? '').trim().replace(/^['‘"]|['’"]$/g, '').trim() || null;
    const extra = parts.slice(5).filter((x) => x.trim());
    out.push({
      line: i + 1,
      name,
      cultivar,
      number: cell(parts[2]),
      source: cell(parts[3]),
      notes: cell(parts[4]),
      ...(extra.length ? { problem: `"${extra.join('; ')}" after the note was left out` } : {})
    });
  });
  return out;
}
