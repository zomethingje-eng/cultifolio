/**
 * The plants sheet's columns, one table (round eighty-seven, t3; plan F11): the backup's `plants.csv` and My plants'
 * "Download as a spreadsheet" are written from it, a column a field, in this order. A field added to a plant adds one
 * entry here, in its agent's own list below, and nothing else: the head, and how the cell is read from the record.
 *
 * Every field a grower sets or the app shows is a column. The log's bookkeeping is not (`notesBase`, `importKey`,
 * `importKeyBare`, `olderKind`, `olderKindOf`, `cover`): it says nothing a reader of the sheet can use, and the whole
 * log is in the backup's `changes.json`. The record's identity stays last, so two plants under one number are two rows
 * a reader and an import tell apart (round sixty; the data review's 12).
 *
 * The import reads the base columns back by their heads, but for `sowing` (src/lib/import/csv.ts); a column it does not take back is
 * marked `own`, and the import names it apart rather than adding it to each plant's notes.
 */
import { kindOf, accNo, sowNo, type Accession, type Sowing } from '$lib/db/types';
import { seasonOf } from '$core/season';
import { attachmentOf, DOC_WORDS } from '$lib/attach/attach';
import { isComplete, type Record_ } from '$core/log';
import { SHEET_COLUMNS, sheetCells } from '$core/identity';
import { linkId, howOf } from '$lib/db/lineage';

export interface PlantCtx {
  state: Map<string, Record_>;
  /** A place's full path, "Greenhouse › Bench 2". */
  loc: (id: string | null | undefined) => string;
  /** Photographs and papers by plant, read once for the sheet (`plantCtx`), not once a row. */
  photos: Map<string, number>;
  papers: Map<string, string[]>;
}
/** The sheet's context from the folded log: one pass over the records for the photographs and the papers. */
export function plantCtx(state: Map<string, Record_>, loc: PlantCtx['loc']): PlantCtx {
  const photos = new Map<string, number>(), papers = new Map<string, string[]>();
  for (const r of state.values()) {
    if (r.kind !== 'photo' || r._deleted || typeof r.acc !== 'string') continue;
    const x = attachmentOf(r);
    if (x) (papers.get(x.acc) ?? papers.set(x.acc, []).get(x.acc)!).push(`${DOC_WORDS[x.doc]}: ${x.fileName}`);
    else if (isComplete(r)) photos.set(r.acc, (photos.get(r.acc) ?? 0) + 1);
  }
  return { state, loc, photos, papers };
}
export interface PlantColumn {
  head: string;
  cell: (a: Accession & Record_, c: PlantCtx) => unknown;
  /** A column the import does not read back: named apart on import, never added to a plant's notes. */
  own?: true;
  /**
   * A column that restates what other columns hold (round eighty-seven, t1): the accession an item's number names, ITF2's
   * accession status, the name's qualifier and rank, the field number's code and number. The import reads the fields
   * from those other columns and lists these apart as restated (src/lib/import/csv.ts).
   */
  restated?: true;
}

/**
 * A lineage link's plant, for a sheet cell (round eighty-seven, F4): the number of the plant the id names, removed or not,
 * since a link stays when its plant goes; the id itself when this file holds no plant under it, so the cell is never
 * blank for a link the log has. Read through `linkId`, so a value that is no id is no cell.
 */
export const plantNoOf = (state: Map<string, Record_>, v: unknown, self?: string): string | null => {
  const id = linkId(v, self);
  if (!id) return null;
  const r = state.get(`accession:${id}`);
  return r && isComplete(r) ? accNo(r as unknown as Accession) : id;
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The columns the sheet has had since round sixty-one, in their order: the import reads them back by these heads. */
const BASE: PlantColumn[] = [
  { head: 'number', cell: (a) => accNo(a) },
  { head: 'species', cell: (a) => a.taxonName },
  { head: 'cultivar', cell: (a) => a.cultivar },
  { head: 'kind', cell: (a) => kindOf(a) },
  { head: 'parentage', cell: (a) => a.parentage },
  { head: 'name as received', cell: (a) => a.nameAsReceived },
  { head: 'field number', cell: (a) => a.fieldNumber },
  { head: 'provenance', cell: (a) => a.provenance },
  { head: 'status', cell: (a) => a.status },
  { head: 'location', cell: (a, c) => (a.locationId ? c.loc(a.locationId) : null) },
  { head: 'acquired', cell: (a) => a.acquired },
  { head: 'from', cell: (a) => a.sourceFrom },
  { head: 'lot or reference', cell: (a) => a.sourceRef },
  { head: 'form', cell: (a) => a.sourceForm },
  { head: 'price', cell: (a) => a.price },
  { head: 'sowing', cell: (a, c) => (a.sowingId ? sowNo((c.state.get(`sowing:${a.sowingId}`) as unknown as Sowing | undefined) ?? { id: a.sowingId }) : null) },
  { head: 'notes', cell: (a) => a.notes }
];

/** Fields of round eighty-five and before that the sheet did not carry (round eighty-seven, t3: "a CSV of every field"). */
const EARLIER: PlantColumn[] = [
  { head: 'GBIF key', cell: (a) => a.taxonKey, own: true },
  { head: 'water every (days)', cell: (a) => a.waterDays, own: true },
  { head: 'older name of', cell: (a) => a.olderOf, own: true }
];

/**
 * t1's fields (identity and provenance), round eighty-seven: ITF2's names where it has a field ($core/identity's
 * SHEET_COLUMNS, in that order), an item's accession by the number its holder carries. The row's cells are worked out
 * once a plant (`sheetCells`), not once a column.
 */
const T1_CELLS = new WeakMap<object, Array<string | null>>();
const t1Cells = (a: Accession & Record_, c: PlantCtx): Array<string | null> => {
  let cells = T1_CELLS.get(a);
  if (!cells) {
    const h = typeof a.itemOf === 'string' ? c.state.get(`accession:${a.itemOf}`) : undefined;
    cells = sheetCells(a as unknown as Record<string, unknown> & { taxonName: string }, h && isComplete(h) ? accNo(h as unknown as Accession) : null);
    T1_CELLS.set(a, cells);
  }
  return cells;
};
/** The columns of t1's that restate others (`restated`): the import reads them from the field number and the name. */
const T1_RESTATED: ReadonlySet<string> = new Set(['item of', 'accsta', 'cid', 'field code', 'idql', 'rkql']);
const T1: PlantColumn[] = SHEET_COLUMNS.map((head, i) => (T1_RESTATED.has(head) ? { head, cell: (a, c) => t1Cells(a, c)[i], restated: true as const } : { head, cell: (a, c) => t1Cells(a, c)[i] }));
/** t2's fields (lineage), round eighty-seven: the plant a plant was taken from, by its number, and how; the import reads both back. */
const T2: PlantColumn[] = [
  { head: 'taken from', cell: (a, c) => plantNoOf(c.state, a.motherAcc, a.id) },
  { head: 'taken as', cell: (a, c) => (plantNoOf(c.state, a.motherAcc, a.id) ? howOf(a.motherHow) : null) }
];

/** t3's: the growing season, and what the record holds of photographs and papers (round eighty-seven, t3). */
const T3: PlantColumn[] = [
  { head: 'growing season', cell: (a) => seasonOf(a)?.season ?? null, own: true },
  { head: 'rest months', cell: (a) => { const s = seasonOf(a); return s && s.rest.length ? s.rest.map((m) => MON[m - 1]).join(' ') : null; }, own: true },
  { head: 'season from', cell: (a) => seasonOf(a)?.from ?? null, own: true },
  { head: 'photographs', cell: (a, c) => c.photos.get(a.id) ?? null, own: true },
  { head: 'papers', cell: (a, c) => { const p = c.papers.get(a.id); return p?.length ? [...p].sort().join('; ') : null; }, own: true }
];

export const PLANT_COLUMNS: readonly PlantColumn[] = [...BASE, ...EARLIER, ...T1, ...T2, ...T3, { head: 'id', cell: (a) => a.id }];
/** The heads the import names apart: the record's links inside the collection that wrote it, and the columns it does not read back. */
export const OWN_HEADS: readonly string[] = ['sowing', 'id', ...PLANT_COLUMNS.filter((c) => c.own).map((c) => c.head)];
/** The heads the import lists apart as restating other columns (round eighty-seven, t1). */
export const RESTATED_HEADS: readonly string[] = PLANT_COLUMNS.filter((c) => c.restated).map((c) => c.head);
