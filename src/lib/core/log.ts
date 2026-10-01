/**
 * The collection is an append-only log of field-level changes. State is a
 * fold over the log. Two devices merge by taking the union of their logs;
 * per field, the change with the greatest HLC wins. A delete is a change
 * that sets the record's `_deleted` field; a later edit to any field of that
 * record revives it (a record edited after its tombstone survives). Whether a
 * record is deleted is decided from the timestamps of its latest delete and
 * its latest edit, never from which arrived first, so two devices that
 * receive the same changes in different orders agree.
 *
 * This replaces v2's newest-record-wins merge, which could let two devices
 * agree on a state neither of them ever set.
 */
import { hlcCompare, isHlc, MAX_AHEAD_MS } from './hlc';

export const KINDS = ['accession', 'sowing', 'location', 'event', 'photo', 'taxon', 'setting'] as const;
export type Kind = (typeof KINDS)[number];

export interface Change {
  /** HLC string; unique per change across the vault. */
  t: string;
  kind: Kind;
  id: string;
  field: string;
  value: unknown; // JSON-serialisable; `undefined` never appears, use null
}

export type Record_ = { id: string; kind: Kind; _t: string; _deleted?: boolean; [k: string]: unknown };
export type State = Map<string, Record_>; // key = `${kind}:${id}`

export const key = (kind: Kind, id: string) => `${kind}:${id}`;

/** Field names the record itself owns, plus the fold's own bookkeeping names; a change may never set them. */
export const RESERVED_FIELDS = new Set(['id', 'kind', '_t', '_deleted=', '*']);

export function assertField(field: string): void {
  if (RESERVED_FIELDS.has(field)) throw new Error(`"${field}" is a reserved record field and cannot be set by a change`);
}

/**
 * Why a change cannot be applied, or null. Anything that comes from outside
 * (a pull, a backup) goes through here in full BEFORE the fold touches it, so
 * a bad batch is refused whole rather than half-applied.
 */
export function changeError(c: unknown, shapeOnly = false): string | null {
  if (!c || typeof c !== 'object') return 'not an object';
  const x = c as Record<string, unknown>;
  if (typeof x.t !== 'string' || !isHlc(x.t)) return `bad timestamp ${JSON.stringify(x.t)}`;
  if (!KINDS.includes(x.kind as Kind)) return `unknown kind ${JSON.stringify(x.kind)}`;
  if (typeof x.id !== 'string' || !x.id) return 'missing id';
  if (typeof x.field !== 'string' || !x.field) return 'missing field';
  if (RESERVED_FIELDS.has(x.field)) return `"${x.field}" is a reserved field`;
  if (x.value === undefined) return `no value for ${x.field}`;
  if (x.field in Object.prototype) return `"${x.field}" is not a field name a record can carry`; // __proto__, constructor and the rest: a record with one folds with a poisoned prototype (round twenty-nine, 10)
  if (shapeOnly) return null;
  const want = x.field === '_deleted' ? 'boolean' : Object.hasOwn(FIELD_TYPES[x.kind as Kind], x.field) ? FIELD_TYPES[x.kind as Kind][x.field] : undefined;
  if (want && x.value !== null && !valueIs(x.value, want)) return `${x.field} of a ${x.kind} must be a ${want}, not ${JSON.stringify(x.value)}`;
  // A field the record cannot be shown without takes no null: a plant whose name is set to nothing is not a plant with
  // no name, it is a change no build of this app writes (round thirty-three, 1).
  if (x.value === null && REQUIRED_FIELDS[x.kind as Kind].includes(x.field)) return `${x.field} of a ${x.kind} cannot be null`;
  return null;
}

/**
 * The value each known field may carry (null always allowed). A change from outside (a pull, a file) whose value has
 * another type is refused before the fold, since a batch date stored as a number would throw on the front page for good
 * (round twenty-eight, 0). A field this build does not know passes, so a newer build's records still sync to an older one.
 */
type ValueType = 'string' | 'number' | 'boolean' | 'object';
const valueIs = (v: unknown, t: ValueType) => (t === 'object' ? typeof v === 'object' && !Array.isArray(v) : typeof v === t);
const strings = (...f: string[]): Record<string, ValueType> => Object.fromEntries(f.map((x) => [x, 'string']));
/**
 * The words a few fields hold in this build (the type unions in db/types.ts, kept in step by a test). They guard the
 * entry points, the forms and the importer, and are NOT applied to a pulled or restored change: a word this build does
 * not know (a newer build's new status) folds as it is and is shown by its word, as an event's type always was, so it
 * is still there when this device upgrades. Round twenty-nine refused such a change on a pull and dropped it for good
 * on every device that had not upgraded (round thirty, 1).
 */
export const FIELD_ENUMS: Partial<Record<Kind, Record<string, readonly string[]>>> = {
  accession: { status: ['growing', 'archived', 'dead'], provenance: ['wild', 'f1', 'fn', 'veg', 'unknown'], nameKind: ['species', 'cultivar', 'hybrid'] },
  sowing: { status: ['active', 'done', 'failed'], method: ['seed', 'cutting', 'offset', 'leaf', 'division', 'bulbil', 'graft'], provenance: ['wild', 'f1', 'fn', 'veg', 'unknown'], nameKind: ['species', 'cultivar', 'hybrid'] },
  photo: { dFrom: ['exif', 'added'] },
  location: { type: ['room', 'shelf', 'bench', 'tray', 'windowsill', 'greenhouse', 'coldframe', 'garden', 'outdoor', 'other'] }
};
export const FIELD_TYPES: Record<Kind, Record<string, ValueType>> = {
  accession: { ...strings('acc', 'taxonName', 'nameAsReceived', 'cultivar', 'nameKind', 'parentage', 'fieldNumber', 'provenance', 'status', 'location', 'locationId', 'acquired', 'sourceFrom', 'sourceRef', 'sourceForm', 'price', 'notes', 'notesBase', 'sowingId', 'cover', 'importedOn'), taxonKey: 'number' },
  sowing: { ...strings('no', 'taxonName', 'cultivar', 'nameKind', 'parentage', 'method', 'parentAcc', 'sown', 'sourceFrom', 'sourceRef', 'fieldNumber', 'provenance', 'medium', 'container', 'treatment', 'locationId', 'status', 'notes', 'notesBase', 'importedOn'), taxonKey: 'number', count: 'number', bottomHeatC: 'number', covered: 'boolean' },
  location: { ...strings('name', 'parentId', 'type', 'notes'), indoor: 'boolean', floorC: 'number', ppfd: 'number', lightHours: 'number', lat: 'number', lon: 'number', altM: 'number', sort: 'number' },
  event: { ...strings('acc', 'd', 't', 'note', 'cause', 'used'), followUp: 'number', n: 'number', measures: 'object', auto: 'boolean' },
  photo: { ...strings('acc', 'sowing', 'd', 'dFrom', 'caption', 'sha'), w: 'number', h: 'number', bytes: 'number' },
  taxon: { ...strings('name', 'myNotes'), gbifKey: 'number', removed: 'boolean', followed: 'boolean' },
  setting: { scheme: 'object' }
};

/**
 * A change as an older build may have written it, put right where that is safe: a finite number in a field that takes
 * text (a v2 file's price of 12, written through before round twenty-eight) becomes its text. Nothing else is changed;
 * the same object comes back when there is nothing to mend (round twenty-nine, 2).
 */
/**
 * The v2 importer's method words before round twenty-eight: it wrote a label lower-cased with one trailing "s" cut
 * (`label.toLowerCase().replace(/s$/, '')`), so "Offsets / pups" was stored as "offsets / pup", which is the one
 * spelling the hand-written list of round thirty-three missed (round thirty-five, R1-1). The table is made by that
 * rule over the labels the v2 app had, and the labels themselves, so the test checks what was written.
 */
const V2_METHOD_LABELS: Array<[string, string]> = [['Seeds', 'seed'], ['Seed', 'seed'], ['Cuttings', 'cutting'], ['Stem cuttings', 'cutting'], ['Offsets / pups', 'offset'], ['Offsets', 'offset'], ['Leaf cuttings', 'leaf'], ['Division', 'division'], ['Divisions', 'division'], ['Bulbils / bulblets', 'bulbil'], ['Bulbils', 'bulbil'], ['Grafts', 'graft']];
export const OLD_METHODS: Record<string, string> = Object.fromEntries(V2_METHOD_LABELS.flatMap(([label, k]) => [[label.toLowerCase(), k], [label.toLowerCase().replace(/s$/, ''), k]]));
/** The provenance text the v2 importer passed through, by the app's word: only these, exactly. */
const OLD_PROVENANCE: Record<string, string> = { 'wild collected': 'wild', 'wild-collected': 'wild', 'habitat collected': 'wild', 'habitat-collected': 'wild', 'ex habitat': 'f1', 'raised from wild-collected seed': 'f1', 'seed-grown from wild-collected seed': 'f1', cultivated: 'fn', 'nursery grown': 'fn', 'nursery-grown': 'fn', vegetative: 'veg', 'vegetatively propagated': 'veg', 'not known': 'unknown', '?': 'unknown' };

export function mendChange(c: Change): Change {
  const want = Object.hasOwn(FIELD_TYPES[c.kind] ?? {}, c.field) ? FIELD_TYPES[c.kind][c.field] : undefined;
  if (want === 'string' && typeof c.value === 'number' && Number.isFinite(c.value)) return { ...c, value: String(c.value) };
  // And the other way: a count written as "3" by an old build folds as 3, rather than setting its batch aside on every
  // device for good, since no later build would read a string there either (round thirty-three, 1).
  if (want === 'number' && typeof c.value === 'string' && /^-?\d+(\.\d+)?$/.test(c.value.trim())) return { ...c, value: Number(c.value) };
  // Words the v2 importer wrote before round twenty-eight: a method as the label lower-cased with its last "s" cut
  // ("leaf cutting", "stem cutting"), a provenance as the file's own text ("Wild collected"). Those exact spellings are
  // mended to the words the app uses wherever the log is read, so old batches keep their method on every device (round
  // thirty, 1). Nothing else is touched: a word this build does not know ("tissue culture", "f2") folds as it is and
  // is shown by its word, so a newer build's word survives a pass through an older one (round thirty-three, 2); a guess
  // at a claim about wild origin was worse than the word itself.
  if (c.kind === 'sowing' && c.field === 'method' && typeof c.value === 'string' && !FIELD_ENUMS.sowing!.method.includes(c.value)) {
    const m = OLD_METHODS[c.value.trim().toLowerCase()];
    return m ? { ...c, value: m } : c;
  }
  if ((c.kind === 'sowing' || c.kind === 'accession') && c.field === 'provenance' && typeof c.value === 'string' && !FIELD_ENUMS.accession!.provenance.includes(c.value)) {
    const m = OLD_PROVENANCE[c.value.trim().toLowerCase()];
    return m ? { ...c, value: m } : c;
  }
  return c;
}

/**
 * The fields without which a record of the kind cannot be shown at all: a plant with no name, an event with no plant
 * or day. A change to one of these that cannot be read takes every change to that record in the same list with it,
 * so a new record is never made half (a live plant with no name threw on the plants page); a record already here keeps
 * what it had (round thirty, 1).
 */
export const REQUIRED_FIELDS: Record<Kind, readonly string[]> = {
  // The fields the types in db/types.ts do not mark optional: round thirty-three had narrowed this to what the pages
  // threw on, and a batch without its count folded live and walked past the pot guard (round thirty-five, R2-1).
  accession: ['taxonName', 'status'],
  sowing: ['taxonName', 'method', 'sown', 'count', 'status'],
  location: ['name'],
  event: ['acc', 'd', 't'],
  photo: ['d', 'w', 'h', 'bytes'],
  taxon: ['name'],
  setting: []
};

/**
 * Changes from outside (a file, a pull), mended where they can be and refused one at a time where they cannot: a
 * change whose value is of a type its field never takes is left out and named, and the rest are folded, so one stray
 * value in a backup or a batch no longer refuses the whole of it (round twenty-nine, 2). A list that is not a list is
 * still refused whole.
 */
export function readChanges(rows: unknown): { changes: Change[]; dropped: string[] } {
  if (!Array.isArray(rows)) throw new Error('changes is not a list');
  const kept: Change[] = [];
  const dropped: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c = r && typeof r === 'object' && typeof (r as Change).kind === 'string' && typeof (r as Change).field === 'string' ? mendChange(r as Change) : r;
    // Structure is still refused whole (a bad stamp, an unknown kind, a reserved name: the list is damaged or from
    // somewhere else); only a value that cannot be read is left out on its own. What that leaves of a record is the
    // fold's to judge: a record without the fields its kind needs is not live until a build that reads them arrives,
    // and a record whose later change is readable is whole again (round thirty-three, 1). Dropping every change to the
    // record here, as round thirty did, lost a plant whose name was corrected after a bad first value.
    const shape = changeError(c, true);
    if (shape) throw new Error(`change ${i}: ${shape}`);
    const e = changeError(c);
    if (e) dropped.push(`change ${i}: ${e}`);
    else kept.push(c as Change);
  }
  return { changes: kept, dropped };
}

/** Throws with the first problem found; returns the changes typed. */
export function validateChanges(changes: unknown): Change[] {
  if (!Array.isArray(changes)) throw new Error('changes is not a list');
  for (let i = 0; i < changes.length; i++) {
    const e = changeError(changes[i]);
    if (e) throw new Error(`change ${i}: ${e}`);
  }
  return changes as Change[];
}

/**
 * The fold's clock, when it has one. A change stamped more than MAX_AHEAD_MS
 * past `now` is HELD: left out of the fold (it stays in the log) and returned,
 * so a device whose clock is an hour fast cannot win every field it touches
 * on every other device until the hour has passed. Changes stamped by
 * `except` (this device) are never held: its own edits must show on its own
 * screen even when its clock has jumped back and its HLC runs ahead.
 */
export interface Hold {
  now: number;
  except?: string;
}

/** The wall-clock millisecond of an HLC string, without a full decode. */
export const hlcWall = (t: string) => Number(t.slice(0, 13));

/** Whether the fold with this clock would hold the change. */
export function isHeld(t: string, hold: Hold): boolean {
  if (hlcWall(t) <= hold.now + MAX_AHEAD_MS) return false;
  // A writer is the device plus a per-tab tag, so the device is a prefix of the writer; every tab of this device counts as "here".
  return !hold.except || !t.slice(t.lastIndexOf('-') + 1).startsWith(hold.except);
}

/** When a held change is due: the moment this device's clock reaches MAX_AHEAD_MS short of its stamp. */
export const dueAt = (t: string) => hlcWall(t) - MAX_AHEAD_MS;

/**
 * Fold changes into state. Idempotent and order-independent. With `hold`, a
 * change stamped too far ahead of the clock is skipped and returned instead
 * of applied; without it (the default), everything is applied and the result
 * is empty.
 */
export function apply(state: State, changes: Iterable<Change>, seen?: Map<string, string>, hold?: Hold): Change[] {
  const latest = seen ?? new Map<string, string>(); // `${key} ${field}` -> hlc (NUL: no field name can collide with the bookkeeping keys)
  const held: Change[] = [];
  for (const c of changes) {
    assertField(c.field);
    if (hold && isHeld(c.t, hold)) {
      held.push(c);
      continue;
    }
    const k = key(c.kind, c.id);
    const fk = k + ' ' + c.field;
    const prev = latest.get(fk);
    if (prev !== undefined && hlcCompare(c.t, prev) < 0) continue;
    let rec = state.get(k);
    if (!rec) {
      rec = { id: c.id, kind: c.kind, _t: c.t };
      state.set(k, rec);
    }
    // Two changes under one stamp should not exist (a stamp is minted once); if they do, the fold must still come out the
    // same in any order, so the tie goes to the greater value, not to whichever arrived first (round twelve, 3).
    if (prev !== undefined && hlcCompare(c.t, prev) === 0 && c.field !== '_deleted' && JSON.stringify(c.value ?? null) <= JSON.stringify(rec[c.field] ?? null)) continue;
    // The same for a removal under a repeated stamp: the tie goes to "removed", the same in any order (round thirteen, 8).
    if (prev !== undefined && hlcCompare(c.t, prev) === 0 && c.field === '_deleted' && (!c.value || latest.get(k + '\0_deleted=') === '1')) continue; // NUL, as every other bookkeeping key: a space here meant this lookup never matched (round twenty-nine, 10)
    latest.set(fk, c.t);
    if (c.field === '_deleted') latest.set(k + ' _deleted=', c.value ? '1' : '0');
    else {
      rec[c.field] = c.value;
      const e = latest.get(k + ' *');
      if (!e || hlcCompare(c.t, e) > 0) latest.set(k + ' *', c.t); // the latest edit to any ordinary field
    }
    if (hlcCompare(c.t, rec._t) > 0) rec._t = c.t;
    // Visibility is a function of two maxima, so it comes out the same whatever order the changes
    // arrived in: deleted iff the latest `_deleted` change says so and nothing was edited after it.
    const delT = latest.get(k + ' _deleted');
    const editT = latest.get(k + ' *');
    rec._deleted = latest.get(k + ' _deleted=') === '1' && !!delT && (!editT || hlcCompare(delT, editT) > 0);
  }
  return held;
}

/**
 * Records a round-ten-to-fourteen import brought back from the dead: a removal whose only later changes are the
 * `importedOn` stamp those builds put on every imported record, tombstones included. An edit after a removal undoes it,
 * so the record folds as live, with no name. These are the records a one-time repair removes again (round sixteen, 5).
 * A record edited in any other way after its removal is a real revival and is left alone.
 */
export function revivedByImport(changes: Iterable<Change>): Array<{ kind: Change['kind']; id: string }> {
  const seen = new Map<string, Change[]>();
  for (const c of changes) {
    const k = key(c.kind, c.id);
    let l = seen.get(k);
    if (!l) seen.set(k, (l = []));
    l.push(c);
  }
  const out: Array<{ kind: Change['kind']; id: string }> = [];
  for (const [, list] of seen) {
    list.sort((a, b) => hlcCompare(a.t, b.t));
    let removedAt: string | null = null;
    let onlyImportedOn = true;
    for (const c of list) {
      if (c.field === '_deleted') {
        removedAt = c.value ? c.t : null;
        onlyImportedOn = true;
      } else if (removedAt && c.field !== 'importedOn') onlyImportedOn = false;
    }
    const last = list[list.length - 1];
    if (removedAt && onlyImportedOn && last.field === 'importedOn') out.push({ kind: last.kind, id: last.id });
  }
  return out;
}

export function materialise(changes: Iterable<Change>): { state: State; seen: Map<string, string> } {
  const state: State = new Map();
  const seen = new Map<string, string>();
  apply(state, changes, seen);
  return { state, seen };
}

/**
 * Whether a record has every field its kind cannot be shown without. A record that lacks one is not live: it is a
 * record whose making this device has not read yet (a set-aside batch created it, a later batch touched it), and it
 * waits, counted, until a build that reads the batch completes it. One rule in the fold, so no path (a pull, a restore,
 * an import, or any order of those) can make a half plant that throws on the plants page (round thirty-three, 1).
 */
export function isComplete(rec: Record_): boolean {
  for (const f of REQUIRED_FIELDS[rec.kind] ?? []) if (rec[f] == null) return false;
  return true;
}

export function live<T extends Record_>(state: State, kind: Kind): T[] {
  const out: T[] = [];
  for (const r of state.values()) if (r.kind === kind && !r._deleted && isComplete(r)) out.push(r as T);
  return out;
}

/** The records that are not removed and not complete: waiting for changes this device cannot read yet. */
export function incomplete(state: State): Record_[] {
  const out: Record_[] = [];
  for (const r of state.values()) if (!r._deleted && !isComplete(r)) out.push(r);
  return out;
}

/** Diff a plain object against the current record into changes. */
export function diff(
  kind: Kind,
  id: string,
  next: Record<string, unknown>,
  current: Record_ | undefined,
  tick: () => string
): Change[] {
  const out: Change[] = [];
  for (const [field, value] of Object.entries(next)) {
    if (field.startsWith('_') || field === 'id' || field === 'kind') continue;
    const v = value === undefined ? null : value;
    if (current && JSON.stringify(current[field] ?? null) === JSON.stringify(v)) continue;
    out.push({ t: tick(), kind, id, field, value: v });
  }
  return out;
}
