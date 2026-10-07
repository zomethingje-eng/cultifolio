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
import { hlcCompare, isHlc, isPastStamp, MAX_AHEAD_MS } from './hlc';

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

/**
 * The version of the fold's rules: `apply`, the hold, the park, the required fields. A snapshot of the folded state
 * built under another number is not read; the log is folded again (round fifty-three, 1). Bump it with any change to
 * those rules, since a snapshot is a fold this build never ran; a test holds a hash of the fold's source and fails when
 * the source changes and this number does not (round fifty-seven). 3: an `importedOn` is an edit like any other, since
 * no build writes one. 4: without an arrival, a change is parked by the clock only when a server reading has confirmed
 * that clock; this device's own changes far past an unchecked clock are folded (round fifty-nine). 5: this device's own
 * changes are never parked by its clock, checked or not; and a snapshot records whether the clock was checked when it
 * was folded, so one folded unchecked is not read once the clock is (round sixty). 6: a stamp made past another
 * (`isPastStamp`) is never held or parked; this device's own changes are parked by the arrival of the batch that carried
 * them, as a peer's are (the engine learns it from the listing); a park judged by the clock alone is a reading, not
 * stored, and the snapshot carries it in its inventory to be judged again at the next load (round sixty-one).
 */
export const FOLD_RULES = 6;

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
  if (want && x.value !== null && !valueIs(x.value, want)) return `${x.field} of ${/^[aeiou]/.test(String(x.kind)) ? 'an' : 'a'} ${x.kind} must be ${want === 'figures' ? 'a set of finite numbers' : want === 'number' ? 'a finite number' : `a ${want}`}, not ${JSON.stringify(x.value)}`;
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
type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'figures';
// A number is a finite one: JSON carries no Infinity or NaN, so a form's "1e999" stored here reached the other devices as null (round fifty-eight).
/** A record of figures (an event's `measures`): every value a finite number, so a length of 1e308 inches is refused, not stored as Infinity here and sent as null (round fifty-nine). */
const figures = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as Record<string, unknown>).every((x) => typeof x === 'number' && Number.isFinite(x));
const valueIs = (v: unknown, t: ValueType) => (t === 'figures' ? figures(v) : t === 'object' ? typeof v === 'object' && !Array.isArray(v) : t === 'array' ? Array.isArray(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === t);
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
  accession: { ...strings('acc', 'taxonName', 'nameAsReceived', 'cultivar', 'nameKind', 'parentage', 'fieldNumber', 'provenance', 'status', 'locationId', 'acquired', 'sourceFrom', 'sourceRef', 'sourceForm', 'price', 'notes', 'notesBase', 'sowingId', 'cover'), taxonKey: 'number', waterDays: 'number' },
  sowing: { ...strings('no', 'taxonName', 'cultivar', 'nameKind', 'parentage', 'method', 'parentAcc', 'sown', 'sourceFrom', 'sourceRef', 'fieldNumber', 'provenance', 'medium', 'container', 'treatment', 'locationId', 'status', 'notes', 'notesBase'), taxonKey: 'number', count: 'number', bottomHeatC: 'number', covered: 'boolean' },
  location: { ...strings('name', 'parentId', 'type', 'notes'), indoor: 'boolean', floorC: 'number', floorHeld: 'boolean', ppfd: 'number', lightHours: 'number', lat: 'number', lon: 'number', altM: 'number', sort: 'number', waterDays: 'number', dryMonths: 'array' },
  event: { ...strings('acc', 'd', 't', 'note', 'cause', 'used'), followUp: 'number', n: 'number', measures: 'figures', auto: 'boolean', plants: 'array' },
  photo: { ...strings('acc', 'sowing', 'd', 'dFrom', 'caption', 'sha'), w: 'number', h: 'number', bytes: 'number' },
  taxon: { ...strings('name', 'myNotes', 'myNotesBase'), gbifKey: 'number', followed: 'boolean' },
  setting: { scheme: 'object' }
};

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
 * Changes from outside (a file, a pull), refused one at a time where they cannot be read: a
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
    const c = r;
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
  /** When the batch these changes came in reached the server, by the server's clock: a change stamped more than a day past it is a broken clock's, and is parked rather than held (round fifty-two, 1). Absent for a local commit or a load, where `now` stands in. */
  arrival?: number;
  /** Stamps parked before, by this device or by the arrival rule: never folded, whatever the clock says now. */
  parked?: Set<string>;
  /** Told of each change the fold parks. */
  onParked?: (c: Change) => void;
  /**
   * Whether `now` is a clock a server reading has confirmed (round fifty-nine). Without an arrival, a change is parked
   * by the clock only then: a device whose clock was set back two days judged its own changes against it, parked them,
   * and stored the verdict, so the grower's plants were gone and stayed gone after the clock was put right (the round
   * forty-one review, 1). Against an unconfirmed clock this device's own changes are folded, and a peer's far ahead is
   * held for this load only: nothing is stored, and everything is back once the clock is right.
   */
  clockChecked?: boolean;
}
/**
 * Past this far ahead of its arrival (or of the clock, for a change made here), a change is parked: kept in the log,
 * never folded on its own, shown on its record as from a device whose clock was wrong, with Apply. Held changes come
 * due and then overwrite real edits made meanwhile; a stamp a year ahead would do so in a year, silently, on every
 * device (round fifty-two, 1). Two days is far past any clock drift (a clock a day wrong is held and comes due) and short of any typo in a year.
 */
export const PARK_MS = 2 * 86_400_000;
/**
 * Whether the fold parks the change: already parked, or stamped more than two days past its arrival, or past a confirmed
 * clock when it is a peer's (round sixty: this device's own changes are never parked by its own clock). Never a stamp
 * made past another (`isPastStamp`): it is an edit placed after the field's stamp, not a clock running ahead, and it is
 * as far ahead as that stamp only because the stamp was (round sixty-one, decision 1). The flag is in the stamp, so the
 * writer and every peer judge it alike, with or without an arrival.
 */
export function isParked(t: string, hold: Hold): boolean {
  if (hold.parked?.has(t)) return true;
  if (isPastStamp(t)) return false;
  if (hold.arrival == null) {
    // Judged by this device's clock alone: only a clock a sync server has confirmed, and never this device's own
    // changes (round sixty; three reviews). Its own stamps say what its clock read when they were made; a clock set
    // back made them look years ahead and hid the grower's plants, for good, and a clock that was fast is undone by the
    // grower's next edit to the field (collection.stampPast), not by a reading.
    if (!hold.clockChecked) return false;
    if (hold.except && t.slice(t.lastIndexOf('-') + 1).startsWith(hold.except)) return false;
  }
  return hlcWall(t) > (hold.arrival ?? hold.now) + PARK_MS;
}

/** The wall-clock millisecond of an HLC string, without a full decode. */
export const hlcWall = (t: string) => Number(t.slice(0, 13));

/** Whether the fold with this clock would hold the change. Never a stamp made past another (round sixty-one; `isParked`): holding it until the clock reaches the stamp it was placed after would keep an edit made now off every other device for as long as that stamp is ahead. */
export function isHeld(t: string, hold: Hold): boolean {
  if (hlcWall(t) <= hold.now + MAX_AHEAD_MS) return false;
  if (isPastStamp(t)) return false;
  if (isParked(t, hold)) return false; // parked is not held: it never comes due
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
    if (hold && isParked(c.t, hold)) {
      hold.onParked?.(c);
      continue;
    }
    if (hold && isHeld(c.t, hold)) {
      held.push(c);
      // The held stamp is noted under its field, so a local edit to that field made meanwhile can be stamped past it
      // and keep the field when the held change comes due; the fold itself does not see it (round forty-nine, 1).
      const hk = key(c.kind, c.id) + '\0held\0' + c.field;
      const h = latest.get(hk);
      if (!h || hlcCompare(c.t, h) > 0) latest.set(hk, c.t);
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

/**
 * The records of a kind that are not removed, whole or waiting for a field. What a backup and a photo push go by: a
 * photograph whose record waits for its size still has pixels, and they are the grower's whether or not this build
 * can show the record yet (round thirty-seven, 1).
 */
export function known<T extends Record_>(state: State, kind: Kind): T[] {
  const out: T[] = [];
  for (const r of state.values()) if (r.kind === kind && !r._deleted) out.push(r as T);
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
