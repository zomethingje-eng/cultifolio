/**
 * Reading a spreadsheet saved as CSV, on the device (round sixty; the grower review's 2, the product review's 4). Every
 * cell is read as text and stays text: nothing is evaluated, so "=SUM(A1:A3)" in a notes column is a note that reads
 * "=SUM(A1:A3)". The one thing undone is the apostrophe the backup's own sheet puts before a cell that a spreadsheet
 * would take for a formula ("'-5 °C"), so the plants.csv a backup writes reads back as it was.
 */

/** The fields a row can fill. The first eight are the ones a grower's own sheet usually has; the rest are the backup's own columns, so its sheet round-trips. */
export const FIELDS = ['number', 'name', 'cultivar', 'place', 'acquired', 'source', 'fieldNumber', 'notes', 'price', 'kind', 'parentage', 'nameAsReceived', 'provenance', 'status', 'lot', 'form'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABEL: Record<Field, string> = {
  number: 'Number',
  name: 'Name',
  cultivar: 'Cultivar',
  place: 'Place',
  acquired: 'Acquired',
  source: 'Source (from)',
  fieldNumber: 'Field number',
  notes: 'Notes',
  price: 'Price',
  kind: 'Kind',
  parentage: 'Parentage',
  nameAsReceived: 'Name as received',
  provenance: 'Provenance',
  status: 'Status',
  lot: 'Lot or reference',
  form: 'Form'
};

/** Header words, folded (lower case, letters and digits only), for each field. The backup's own headers come first. */
const HEADS: Record<Field, string[]> = {
  number: ['number', 'no', 'nr', 'num', 'accession', 'accessionnumber', 'accessionno', 'accno', 'acc', 'plantnumber', 'plantno', 'label', 'labelnumber'],
  name: ['species', 'name', 'taxon', 'taxonname', 'scientificname', 'botanicalname', 'latinname', 'plant', 'plantname'],
  cultivar: ['cultivar', 'cv', 'variety'],
  place: ['location', 'place', 'where', 'bench', 'position', 'site'],
  acquired: ['acquired', 'dateacquired', 'acquireddate', 'date', 'purchased', 'datepurchased', 'bought', 'datebought', 'received', 'datereceived', 'obtained'],
  source: ['from', 'source', 'supplier', 'nursery', 'seller', 'vendor', 'boughtfrom', 'origin'],
  fieldNumber: ['fieldnumber', 'fieldno', 'fieldnr', 'fn', 'collectionnumber', 'collectorsnumber', 'field'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'remark', 'description'],
  price: ['price', 'cost', 'paid', 'pricepaid'],
  kind: ['kind'],
  parentage: ['parentage', 'parents', 'cross'],
  nameAsReceived: ['nameasreceived', 'receivedas'],
  provenance: ['provenance'],
  status: ['status'],
  lot: ['lotorreference', 'lot', 'reference', 'ref'],
  form: ['form']
};
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The field a header cell names, or null. */
export function fieldOfHeader(cell: string): Field | null {
  const f = fold(cell);
  if (!f) return null;
  for (const k of FIELDS) if (HEADS[k].includes(f)) return k;
  return null;
}

/** The separator the first line uses: a comma, a semicolon (a spreadsheet in a locale with decimal commas) or a tab. */
export function sniffDelimiter(text: string): ',' | ';' | '\t' {
  const first = text.replace(/^﻿/, '').split(/\r\n|\n|\r/, 1)[0] ?? '';
  const count = (d: string) => {
    let n = 0, q = false;
    for (const ch of first) {
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    return n;
  };
  const c = count(','), s = count(';'), t = count('\t');
  return t > c && t >= s ? '\t' : s > c ? ';' : ',';
}

/**
 * RFC 4180, forgiving: quoted cells with "" for a quote and line breaks inside, any of the three line endings, a byte
 * order mark at the start. Rows that are wholly empty are dropped.
 */
export function parseCsv(text: string, delimiter: string = sniffDelimiter(text)): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** A cell as text: trimmed, and the backup's guard apostrophe before a formula-looking cell taken off again. Never evaluated. */
export function cellText(raw: string | undefined): string {
  if (raw == null) return '';
  const s = raw.replace(/^'(?=\s*[=+\-@\t\r＝＋－＠])/, '');
  // The backup's text cells that look like numbers are written ="0012" so a spreadsheet keeps them as text (round sixty):
  // read back as the text inside. Only that exact shape, a quoted constant; never anything evaluated.
  const kept = /^="([^"]*)"$/.exec(s.trim());
  return kept ? kept[1] : s.trim();
}

export type Mapping = Partial<Record<Field, number>>;

/** Whether the first row is a header: two or more of its cells name a field, or one does and it names the plant's name. */
export function detectHeader(rows: string[][]): boolean {
  const first = rows[0] ?? [];
  const hits = first.map(fieldOfHeader).filter(Boolean);
  return hits.length >= 2 || hits.includes('name');
}

/** Columns to fields: by the header when there is one (the first column naming a field takes it), else the first column is the name. */
export function guessMapping(rows: string[][], header: boolean): Mapping {
  const m: Mapping = {};
  if (header) {
    (rows[0] ?? []).forEach((c, i) => {
      const f = fieldOfHeader(c);
      if (f && m[f] === undefined) m[f] = i;
    });
    return m;
  }
  m.name = 0;
  return m;
}

/** One row of the sheet, read through the mapping: every mapped field as text ('' when the cell is empty or missing). */
export function readRow(row: string[], m: Mapping): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const i = m[f];
    if (i === undefined || i < 0) continue;
    out[f] = cellText(row[i]);
  }
  return out;
}

/**
 * A date cell as YYYY-MM-DD, or null with the reason. Only unambiguous forms are read: 2024-03-09, 2024/3/9, and a
 * timestamp's date part. "09/03/2024" is the ninth of March in one country and the third of September in another, so it
 * is not guessed (rule 3); the review list says so and the grower types it.
 */
export function readDate(cell: string, today: string): { d: string | null; why?: string } {
  const t = cell.trim();
  if (!t) return { d: null };
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (!m) return { d: null, why: `the date "${t}" is not written year first (2024-03-09), so it was not read` };
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return { d: null, why: `${t} is not a date` };
  if (d > today) return { d: null, why: `${d} is in the future` };
  if (d < '1900-01-01') return { d: null, why: `${d} is before 1900` };
  return { d };
}
