/**
 * Reading a spreadsheet saved as CSV, on the device (round sixty; the grower review's 2, the product review's 4). Every
 * cell is read as text and stays text: nothing is evaluated, so "=SUM(A1:A3)" in a notes column is a note that reads
 * "=SUM(A1:A3)". The one thing undone is the apostrophe the backup's own sheet puts before a cell that a spreadsheet
 * would take for a formula ("'-5 °C"), so the plants.csv a backup writes reads back as it was.
 */

/**
 * The fields a row can fill. The first ten are the ones a grower's own sheet usually has; the rest are the backup's own
 * columns, so its sheet round-trips. Genus and Qty since round sixty-one (the grower review, 3): a sheet with the genus
 * and the species in two columns is very common, and "Qty 3" is three plants.
 */
export const FIELDS = ['number', 'name', 'genus', 'qty', 'cultivar', 'place', 'acquired', 'source', 'fieldNumber', 'notes', 'price', 'kind', 'parentage', 'nameAsReceived', 'provenance', 'status', 'lot', 'form'] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABEL: Record<Field, string> = {
  number: 'Number',
  name: 'Name',
  genus: 'Genus (put before the name)',
  qty: 'How many plants',
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
  name: ['species', 'name', 'taxon', 'taxonname', 'scientificname', 'botanicalname', 'latinname', 'plant', 'plantname', 'genusspecies', 'genusandspecies', 'speciesname', 'binomial'],
  genus: ['genus'],
  qty: ['qty', 'quantity', 'count', 'noofplants', 'numberofplants', 'plantcount', 'howmany', 'qnty', 'pots'],
  cultivar: ['cultivar', 'cv', 'variety'],
  place: ['location', 'place', 'where', 'bench', 'position', 'site'],
  acquired: ['acquired', 'dateacquired', 'acquireddate', 'date', 'purchased', 'datepurchased', 'bought', 'datebought', 'received', 'datereceived', 'obtained', 'dateacq', 'acqdate', 'acq', 'dateobtained'],
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
/** The backup's own columns that no field takes: the batch a plant came from and its record id. Said, not put in the notes. */
const OWN_LINKS = ['sowing', 'id'];
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

/** A sheet that cannot be read whole: an opening quote never closed. Said with the row, never read on (round sixty-one; the records review, 9). */
export class SheetError extends Error {}

/**
 * RFC 4180, forgiving: quoted cells with "" for a quote and line breaks inside, any of the three line endings, a byte
 * order mark at the start. Rows that are wholly empty are dropped. A quote opened and never closed would swallow every
 * row after it into one cell, so the read stops and says on which row it opened (round sixty-one; the records review, 9).
 */
export function parseCsv(text: string, delimiter: string = sniffDelimiter(text)): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  let openedOn = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') { q = true; openedOn = rows.length + 1; }
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (q) throw new SheetError(`a quote opened in row ${openedOn} is never closed, so the rest of the sheet would be read as one cell. Close the quote (or take it out) in your spreadsheet and save the CSV again`);
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * A cell as text: trimmed (a note keeps its own spaces and line breaks: `keep`), and the backup's guard apostrophe
 * before a formula-looking cell taken off again. Never evaluated. The ="0012" form is read only as the whole cell, before
 * any guard is taken off: a note that is literally ="0012" was written '="0012" and comes back as itself, and a value
 * that began with an apostrophe and a formula sign was written with a second one, of which only one is taken off
 * (round sixty-one; the records review, 6).
 */
export function cellText(raw: string | undefined, keep = false): string {
  if (raw == null) return '';
  const kept = /^="([^"]*)"$/.exec(raw.trim());
  if (kept) return kept[1];
  const s = raw.replace(/^'(?='*\s*[=+\-@\t\r＝＋－＠])/, '');
  return keep ? (s.trim() ? s : '') : s.trim();
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

/** One row of the sheet, read through the mapping: every mapped field as text ('' when the cell is empty or missing). Notes as written, spaces and line breaks kept. */
export function readRow(row: string[], m: Mapping): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const i = m[f];
    if (i === undefined || i < 0) continue;
    out[f] = cellText(row[i], f === 'notes');
  }
  return out;
}

/**
 * The columns no field takes, by index, with the name the review calls them by: listed before "Check names", and by
 * default added to each plant's notes as "Locality: Totoral, Chile" (round sixty-one; the grower review, 3). The
 * backup's own record id and batch number are listed apart: they are links inside the collection that wrote the sheet.
 */
export function unmappedColumns(rows: string[][], m: Mapping, header: boolean): { extra: Array<{ i: number; name: string }>; own: string[] } {
  const width = Math.max(0, ...rows.slice(0, 200).map((r) => r.length));
  const used = new Set(Object.values(m).filter((x): x is number => typeof x === 'number'));
  const extra: Array<{ i: number; name: string }> = [];
  const own: string[] = [];
  for (let i = 0; i < width; i++) {
    if (used.has(i)) continue;
    const head = header ? cellText(rows[0]?.[i]) : '';
    if (!rows.slice(header ? 1 : 0).some((r) => cellText(r[i]) !== '')) continue; // an empty column holds nothing to keep
    if (header && OWN_LINKS.includes(fold(head))) { own.push(head); continue; }
    extra.push({ i, name: head || `Column ${i + 1}` });
  }
  return { extra, own };
}

/** How a date like 09/03/2024 is read, one choice for the whole sheet: day first, month first, or left as written (round sixty-one; the grower review, 4). */
export type DateOrder = 'dmy' | 'mdy' | null;

const MONTHS: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n: number) => String(n).padStart(2, '0');

export interface ReadDate {
  /** YYYY-MM-DD, or YYYY-MM or YYYY when the cell says only that much; null when not read. */
  d: string | null;
  /** Why it was not read, said on the row. */
  why?: string;
  /** Day and month could be either way round, and the sheet's choice is to leave such dates. */
  ambiguous?: boolean;
  /** The year an unread cell names, when it names one: its plant is numbered for that year, not this one (a read date carries its own). */
  year?: number;
}

/**
 * A date cell, read at the precision it is written at, and only where it can be read one way (rule 3):
 * - 2024-03-09, 2024/3/9 and a timestamp's date part; "2009" (a year); "2017-08", "08/2017", "August 2017", "Feb 2022" (a
 *   month); "17-Feb-2017", "17 February 2017", "Feb 17, 2017" (a named month is never in doubt);
 * - 17.11.2007, 22/10/2023: a day over 12 says which number is the day; 09/09/2024 is the same either way;
 * - 09/03/2024 is the ninth of March in one country and the third of September in another: read by the sheet's one
 *   choice (`order`), or left (null), never guessed row by row;
 * - a two-digit year is read with a day-month order only ("30/09/09"): as 20YY, or 19YY when 20YY is still to come.
 *   With dashes ("24-03-09") it could be written year first, so it is left.
 * A date in the future or before 1900 is not read. What is not read is said, and the sheet's text goes to the notes.
 */
export function readDate(cell: string, today: string, order: DateOrder = null): ReadDate {
  const t = cell.trim();
  if (!t) return { d: null };
  const thisYear = Number(today.slice(0, 4));
  const yearIn = (() => { const ys = [...t.matchAll(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/g)].map((x) => Number(x[1])).filter((y) => y <= thisYear); return ys.length === 1 ? ys[0] : undefined; })();
  const not = (why: string, extra: Partial<ReadDate> = {}): ReadDate => ({ d: null, why, ...(yearIn ? { year: yearIn } : {}), ...extra });
  const check = (d: string, y: number): ReadDate => (d > today.slice(0, d.length) ? not(`${t} is in the future, so it was not read`) : y < 1900 ? not(`${t} is before 1900, so it was not read`) : { d });
  const full = (y: number, mo: number, da: number): ReadDate => {
    const dt = new Date(Date.UTC(y, mo - 1, da));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return not(`"${t}" is not a date, so it was not read`);
    return check(`${y}-${p2(mo)}-${p2(da)}`, y);
  };
  const month = (y: number, mo: number): ReadDate => (mo >= 1 && mo <= 12 ? check(`${y}-${p2(mo)}`, y) : not(`"${t}" is not a date, so it was not read`));
  const twoDigit = (yy: string): number => { const n = 2000 + Number(yy); return n <= thisYear ? n : n - 100; };
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t))) return full(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})$/.exec(t))) return check(m[1], +m[1]);
  if ((m = /^(\d{4})[-/.](\d{1,2})$/.exec(t))) return month(+m[1], +m[2]);
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(t))) return month(+m[2], +m[1]);
  // A named month: "August 2017", "17-Feb-2017", "Feb 17, 2017", "17th February 2017".
  const words = t.toLowerCase().replace(/,/g, ' ').split(/[\s\-/.]+/).filter(Boolean).map((w) => w.replace(/^(\d{1,2})(st|nd|rd|th)$/, '$1'));
  const mi = words.findIndex((w) => MONTHS[w] !== undefined);
  if (mi >= 0 && words.filter((w) => MONTHS[w] !== undefined).length === 1 && words.every((w, i) => i === mi || /^\d+$/.test(w))) {
    const mo = MONTHS[words[mi]];
    const nums = words.filter((_, i) => i !== mi);
    if (nums.length === 1 && /^\d{4}$/.test(nums[0])) return month(+nums[0], mo);
    if (nums.length === 2) {
      const [a, b] = nums;
      // Day then year ("17 Feb 2017", "Feb 17 2017", "17-Feb-17"), or year then day ("2017 Feb 17").
      if (/^\d{1,2}$/.test(a) && /^(\d{4}|\d{2})$/.test(b) && mi !== 2) return full(b.length === 4 ? +b : twoDigit(b), mo, +a);
      if (/^\d{4}$/.test(a) && /^\d{1,2}$/.test(b)) return full(+a, mo, +b);
    }
    return not(`the date "${t}" was not read`);
  }
  // Three numbers with one separator: day and month in some order, then the year.
  if ((m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})$/.exec(t))) {
    const a = +m[1], b = +m[3];
    if (m[4].length === 2 && m[2] === '-') return not(`"${t}" could be written year first or year last, so it was not read`);
    const y = m[4].length === 4 ? +m[4] : twoDigit(m[4]);
    if (a > 12 && b > 12) return not(`"${t}" is not a date, so it was not read`);
    if (a > 12 || a === b) return full(y, b, a);
    if (b > 12) return full(y, a, b);
    if (order === 'dmy') return full(y, b, a);
    if (order === 'mdy') return full(y, a, b);
    return not(`"${t}" could be ${a} ${MONTH_NAME[b - 1]} or ${b} ${MONTH_NAME[a - 1]}, so it was left as written`, { ambiguous: true, year: y });
  }
  return not(`the date "${t}" was not read`);
}

/** How many of the sheet's date cells read differently day first and month first: the choice is offered only when there is one. */
export function ambiguousDates(rows: string[][], m: Mapping, header: boolean, today: string): { n: number; first: string | null } {
  const i = m.acquired;
  if (i === undefined) return { n: 0, first: null };
  let n = 0;
  let first: string | null = null;
  rows.forEach((r, k) => {
    if (header && k === 0) return;
    const c = cellText(r[i]);
    if (c && readDate(c, today).ambiguous) { n++; first ??= c; }
  });
  return { n, first };
}
