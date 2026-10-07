/**
 * The collection as reactive state: a fold over the change log, with the
 * write API every view uses. Loads once per page life; every write goes to
 * IndexedDB first and to the in-memory state only once that has succeeded,
 * so the page never shows an edit the vault does not hold.
 */
import { SvelteMap } from 'svelte/reactivity';
import { localDate, madeOn, daysBetween } from '$core/dates';
import { today as day } from '$lib/ui/day.svelte';

/** Three weeks: the Due chip's "21+ days" and Today's "three weeks or more" both mean this many days, inclusive (round twenty-five, 2). */
export const DUE_DAYS = 21;
/** A load that folded this many changes on top of the snapshot writes a fresh one, so the next load reads little again (round fifty-three, 1). */
export const FOLD_REFRESH = 1000;
const yearOf = (d?: string | null): number | undefined => (d && /^\d{4}(?:-|$)/.test(d) ? Number(d.slice(0, 4)) : undefined);
import { Clock, hlcDecode, hlcEncode, hlcCompare, hlcAfter, hlcPast, isPastStamp, nowMs, clockOffsetMs, clockChecked, MAX_AHEAD_MS } from '$core/hlc';

/**
 * A failed write as a sentence the pages can show. Chromium's QuotaExceededError has an empty message, and the pages
 * show the notice only when there is text: a full device refused every write with nothing said (round sixty; the data
 * review's 5). Never empty.
 */
async function writeErrorText(e: unknown): Promise<string> {
  return (await storageErrorText(e)) ?? (e instanceof Error ? e.message || e.name || 'The change could not be saved.' : String(e) || 'The change could not be saved.');
}
/** How far ahead of the corrected clock a held stamp may be for a local edit to its field to be stamped just past it (round fifty-one, 1). */
export const FOLLOW_HELD_MS = 86_400_000;
import { tag36 } from '$core/tag';
import { storageErrorText } from './storage-error';
import { replacedNotes as replacedNotesIn, type ReplacedNotes } from '$core/notes';
import { apply, diff, readChanges, changeError, isComplete, isHeld, REQUIRED_FIELDS, KINDS, FOLD_RULES, key as recKey, type Change, type Kind, type Record_, type State, type Hold, hlcWall } from '$core/log';
import { nextAccession, DEFAULT_SCHEME, type NumberingScheme } from '$core/accession';
import { allChanges, appendChanges, appendChangesClaiming, onOtherTabWrite, deviceId, requestPersistence, getMeta, putPhotoBlobs, getPhotoBlobs, deletePhotoBlobs, holdVault, readFold, writeFold, touchFold, updateMeta, parkStamps, foldGen, lastArrival, arrivalsAfter, arrivalsOf, changesByKeys, changesOf, type FoldSnapshot, type NumberKind, type VaultNotice } from './vault';
import { version as buildVersion } from '$app/environment';
import type { Accession, PlantEvent, Taxon, Location, Sowing, Provenance, Photo } from './types';
import { PROP_METHODS, accNo, sowNo, NUMBERING_SETTING, EVENT_LABEL } from './types';
import { fieldWords } from '$lib/ui/held-words';
import { mySpeciesOf, type MySpecies } from './species-list';

export { NUMBERING_SETTING };

const isScheme = (s: unknown): s is NumberingScheme => !!s && typeof s === 'object' && ((s as NumberingScheme).mode === 'year' || (s as NumberingScheme).mode === 'prefix') && typeof (s as NumberingScheme).width === 'number';

/** A short, deterministic tag for a string: two 32-bit FNV-1a hashes in base 36 (up to 14 characters, [a-z0-9]). */

const byDay = (a: { d: string; id: string }, b: { d: string; id: string }) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id);
const numberField = (c: Change): NumberKind | null => (c.kind === 'accession' && c.field === 'acc' ? 'accession' : c.kind === 'sowing' && c.field === 'no' ? 'sowing' : null);

/** The records whose notes carry a base, and the two field names: a plant's and a batch's notes, a species' own notes. */
type NotesKind = 'accession' | 'sowing' | 'taxon';
const NOTES_PAIR: Record<string, [string, string]> = { accession: ['notes', 'notesBase'], sowing: ['notes', 'notesBase'], taxon: ['myNotes', 'myNotesBase'] };

class Collection {
  ready = $state(false);
  /**
   * When this device's last change is dated past its clock (the clock was set back): that change's time, for a line
   * under the top bar; null otherwise (round fifty-nine). Its own changes are all shown whatever the clock says, and a
   * peer's dated after the clock waits for it, so the line says to set the clock right and that nothing is lost.
   */
  clockBehindAt = $state<number | null>(null);
  /** Whether a sync server's reading has confirmed this device's clock lately (`clockChecked()`), for the clock line's wording (round sixty). */
  clockTrusted = $state(false);
  /** Read the clock line afresh: after a load, a catch-up or a rebuild. */
  private checkClock(): void {
    const t = this.ownLatest();
    const at = t ? hlcWall(t) : 0;
    this.clockBehindAt = at > nowMs() + MAX_AHEAD_MS ? at : null;
    this.clockTrusted = clockChecked();
  }
  persisted = $state<boolean | null>(null);
  /** The last vault write that failed, as a sentence, or null once a write has succeeded again. Pages show it; the edit it describes was not stored and is not shown. */
  lastWriteError = $state<string | null>(null);
  /** The scheme this device kept in `meta` before the scheme was a synced setting; read only when the log has no setting record. */
  private state: State = new SvelteMap<string, Record_>();
  /**
   * The same records by kind, so a list of plants is built from the plants and not from a scan of every record, and a
   * watering written does not rebuild the plant list: a derived that reads one kind's map re-runs only when that kind
   * changes (round fifty-three, 1; the first reviewer's finding 26). `state` stays the map a page reads one record from.
   */
  private kinds: Record<Kind, SvelteMap<string, Record_>> = Object.fromEntries(KINDS.map((k) => [k, new SvelteMap<string, Record_>()])) as Record<Kind, SvelteMap<string, Record_>>;
  private seen = new Map<string, string>();
  /** What the last load read: the snapshot's records and the changes folded after it, or the whole log. For the sync page and the tests. */
  loaded = $state<{ from: 'log' | 'snapshot'; changes: number; snapshot?: number }>({ from: 'log', changes: 0 });
  private clock: Clock | null = null;
  private loading: Promise<void> | null = null;
  /** Every `parentId` a place has had, by HLC, so a loop can be cut back to where the place was before the move. */
  private parentHist = new Map<string, Map<string, string | null>>();

  /**
   * Changes parked by the fold: stamped more than a day past their arrival (a broken clock's), kept in the log and never
   * folded on their own, listed on their record with Apply (round fifty-two, 1). The stamps are kept in meta so a parked
   * change stays parked at every later load, whatever the clock then says; the changes themselves are gathered per fold.
   */
  parkedStamps = new Set<string>();
  private parkedByRecord = $state(new Map<string, Change[]>());
  /** Stamps the person applied or dismissed here: not listed again. */
  private parkedDone = new Set<string>();
  private hold(arrival?: number): Hold {
    return { now: nowMs(), except: this.device, arrival, parked: this.parkedStamps, onParked: (c) => this.notePark(c), clockChecked: clockChecked() };
  }
  private notePark(c: Change): void {
    this.parkedStamps.add(c.t);
    const k = recKey(c.kind, c.id);
    const list = this.parkedByRecord.get(k) ?? [];
    if (!list.some((x) => x.t === c.t)) { list.push(c); this.parkedByRecord.set(k, list); this.parkedByRecord = new Map(this.parkedByRecord); }
  }
  /**
   * Whether a parked change is still one to offer: not applied or dismissed here, and not replaced since by an edit
   * stamped past it (round sixty-one). An edit made in sight of the field after the clock was put right is stamped past
   * the field's stamp (`hlcPast`) and folds; offering the parked text it replaced with "Apply" would offer to write the
   * grower's old text over what they have just written (the clock review's 6). Read from the record, so a list on screen
   * follows each fold of it.
   */
  private stillParked(c: Change): boolean {
    if (this.parkedDone.has(c.t)) return false;
    void this.state.get(recKey(c.kind, c.id)); // the record's reactive entry: a fold of it re-runs the lists that read this
    const cur = this.seen.get(recKey(c.kind, c.id) + '\0' + c.field);
    return cur === undefined || hlcCompare(cur, c.t) < 0;
  }
  /** Parked changes for one record, latest per field, not yet applied or dismissed here. */
  parkedFor(kind: Kind, id: string): Change[] {
    const list = (this.parkedByRecord.get(recKey(kind, id)) ?? []).filter((c) => this.stillParked(c));
    const latest = new Map<string, Change>();
    for (const c of list) { const h = latest.get(c.field); if (!h || hlcCompare(c.t, h.t) > 0) latest.set(c.field, c); }
    return [...latest.values()];
  }
  /** Every record with parked changes still listed, named as well as the parked values allow: the sync page lists them, since a record created under a wrong clock has no page of its own to list them on (round fifty-two, 1). */
  parkedList(): Array<{ kind: Kind; id: string; label: string; fields: string[] }> {
    const out: Array<{ kind: Kind; id: string; label: string; fields: string[] }> = [];
    for (const [k, list] of this.parkedByRecord) {
      const live = list.filter((c) => this.stillParked(c));
      if (!live.length) continue;
      const kind = live[0].kind, id = live[0].id;
      const v = (f: string) => { const c = live.filter((x) => x.field === f).sort((a, b) => hlcCompare(b.t, a.t))[0]; return c ? String(c.value ?? '') : ''; };
      const rec = this.state.get(k);
      const f = (name: string) => v(name) || (rec?.[name] != null ? String(rec[name]) : '');
      // Said as the grower knows the record, never by its internal id or its field keys (round sixty-one; the grower
      // review's 9): a photograph or a log line by its plant, a species' notes by the species.
      const plantWords = (accId: string) => { const r = accId ? this.state.get(recKey('accession', accId)) ?? this.state.get(recKey('sowing', accId)) : undefined; return r ? [r.kind === 'sowing' ? sowNo(r as unknown as Sowing) : accNo(r as unknown as Accession), String(r.taxonName ?? '')].filter(Boolean).join(' ') : ''; };
      const named = (pre: string, who: string, when: string) => `${pre}${who ? ` of ${who}` : ''}${when ? `, ${when}` : ''}`;
      const label = kind === 'accession' ? [f('acc'), f('taxonName')].filter(Boolean).join(' ') || 'A plant'
        : kind === 'sowing' ? [f('no'), f('taxonName')].filter(Boolean).join(' ') || 'A batch'
        : kind === 'location' ? f('name') || 'A place'
        : kind === 'event' ? named(`A log line (${EVENT_LABEL[f('t') as keyof typeof EVENT_LABEL] ?? (f('t') || 'an entry')})`, plantWords(f('acc')), f('d'))
        : kind === 'photo' ? named('A photograph', plantWords(f('acc') || f('sowing')), f('d') ? `taken ${f('d')}` : '')
        : kind === 'taxon' ? `Your notes on ${f('name') || 'a species'}`
        : kind === 'setting' ? 'The numbering scheme' : 'A record';
      out.push({ kind, id, label, fields: fieldWords(kind, live) });
    }
    return out;
  }
  /** Records with parked changes still listed, for the sync page's count. */
  get parkedRecords(): number {
    let n = 0;
    for (const list of this.parkedByRecord.values()) if (list.some((c) => this.stillParked(c))) n++;
    return n;
  }
  /** Apply a record's parked changes as edits made now: the same values, stamped by the corrected clock, so every device takes them; the parked stamps stay parked. */
  async applyParked(kind: Kind, id: string): Promise<void> {
    const list = this.parkedFor(kind, id);
    if (!list.length) return;
    const fields: Record<string, unknown> = {};
    for (const c of list) if (c.field !== '_deleted') fields[c.field] = c.value;
    // Applying a parked notes text is an edit made from the text on screen: its base is that text's stamp, not the base
    // the parked change carried, which the reading would take as an edit made blind (round sixty; the data review's 13).
    const pair = NOTES_PAIR[kind];
    if (pair) { delete fields[pair[1]]; if (pair[0] in fields) fields[pair[1]] = this.notesStamp(kind as NotesKind, id); }
    const removal = list.find((c) => c.field === '_deleted' && c.value === true);
    const back = list.find((c) => c.field === '_deleted' && c.value === false);
    if (Object.keys(fields).length) await this.put(kind, id, fields);
    if (removal) await this.remove(kind, id);
    // A parked restore is applied as a restore made now: Apply wrote nothing for it and dismissed it, and the plant stayed
    // removed on every peer while its writer showed it (round sixty-one; the clock review's 4, fuzz seed 1012).
    else if (back && this.state.get(recKey(kind, id))?._deleted) await this.restore(kind, id);
    await this.dismissParked(kind, id);
  }
  async dismissParked(kind: Kind, id: string): Promise<void> {
    const done = (this.parkedByRecord.get(recKey(kind, id)) ?? []).map((c) => c.t);
    for (const t of done) this.parkedDone.add(t);
    this.parkedByRecord = new Map(this.parkedByRecord);
    // Added to what is stored, not written over it: another tab's dismissals stand (round fifty-eight).
    const all = await updateMeta<string[]>('parkedDone', (had) => [...new Set([...(had ?? []), ...done])]);
    for (const t of all) this.parkedDone.add(t);
  }
  /** The engine parks changes by their batch's arrival before they reach the fold: noted here so the fold never folds them later. */
  async markParked(changes: Change[]): Promise<void> {
    for (const c of changes) this.notePark(c);
    // The parked set is an input to the fold: the stamps are stored and the snapshot dropped in one transaction, and the
    // other tabs are told to fold again, since one of them may have folded the change as ordinary a moment before
    // (round fifty-four, 2; round fifty-five, 2; the first reviewer's findings 6 and 7).
    for (const t of await parkStamps(changes.map((c) => c.t))) { this.parkedStamps.add(t); this.storedParked.add(t); }
  }
  /**
   * The parks that are stored: verdicts by arrival (a listing's, a batch's, a file's), the same on every fold of the log.
   * A park the fold judged by this device's clock alone is a reading of the log, not a fact about it, and is not stored
   * (rule 5; round sixty-one, the clock review's 8, open since round fifty-nine): it is kept for this load, carried in the
   * snapshot's inventory with the held changes, and judged again at the next load, so a clock found wrong later parks
   * nothing for good.
   */
  private storedParked = new Set<string>();
  /** The parked set as stored, merged into this tab's: another tab may have parked since this one read it (round fifty-five, 2). */
  private async rereadParked(): Promise<void> {
    for (const t of (await getMeta<string[]>('parked')) ?? []) { this.parkedStamps.add(t); this.storedParked.add(t); }
    for (const t of (await getMeta<string[]>('parkedDone')) ?? []) this.parkedDone.add(t);
  }
  /** Photographs whose removal this device has seen: their upload record is not trusted until the server is asked (round fifty-two, 2). */
  private photosUnverified = new Set<string>();
  private async noteUnverified(ids: string[]): Promise<void> {
    for (const id of ids) this.photosUnverified.add(id);
    const all = await updateMeta<string[]>('photosUnverified', (had) => [...new Set([...(had ?? []), ...ids])]); // another tab's notes stand (round fifty-eight)
    for (const id of all) this.photosUnverified.add(id);
  }
  unverifiedPhotos(): string[] {
    return [...this.photosUnverified];
  }
  async verifiedPhotos(ids: string[]): Promise<void> {
    if (!ids.length) return;
    for (const id of ids) this.photosUnverified.delete(id);
    const gone = new Set(ids);
    this.photosUnverified = new Set(await updateMeta<string[]>('photosUnverified', (had) => (had ?? []).filter((x) => !gone.has(x))));
  }

  load(): Promise<void> {
    if (!this.loading)
      this.loading = (async () => {
        const dev = await deviceId();
        this.deviceId = dev;
        // Each tab is its own writer: two tabs of one browser share the device but not a clock, and two clocks stamping the
        // same millisecond under one name would give two records one identity (round eight, 1). The tag is four base-36
        // characters on top of the twelve-character device, within the HLC's sixteen; the device alone still names this
        // machine to sync and to the hold rule (which matches the writer by that prefix).
        this.clock = new Clock(dev + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => (b % 36).toString(36)).join(''));
        this.photosUnverified = new Set((await getMeta<string[]>('photosUnverified')) ?? []);
        // The fold: from the snapshot of the last one and the changes that arrived since, or, without a snapshot this
        // build can use, from the whole log (round fifty-three, 1). Either way a change stamped far ahead of this clock
        // is held, not applied (round five, 4); one two days past it is parked (round fifty-two, 1).
        // The other tabs' notices are listened for before anything is read: a replace announced during the load must not
        // be missed by the tab that is loading (round fifty-four, 2). A notice that lands before `ready` is acted on after.
        let heard: VaultNotice | null = null;
        onOtherTabWrite((what) => {
          if (!this.ready) { if (what === 'replaced' || what === 'refold' || !heard) heard = what; return; }
          // Another tab replaced the whole collection from a file: this tab's fold is of a log that no longer exists, and a
          // note saved here would be diffed against records the new log does not have. The page reloads onto the new one.
          if (what === 'replaced') { if (typeof location !== 'undefined') location.reload(); return; }
          if (what === 'refold') { void this.rebuild().catch(() => {}); return; }
          if (what === 'written') void this.catchUp().catch(() => {});
        });
        const changes = await this.foldFromVault();
        await this.readLedger();
        // No reading of the log writes to it (round fifty-six, 3). Two records under one number are repaired where the log is
        // written anyway: after a merge (an import, a pull), when a removed plant comes back, and when the grower asks on the
        // record's page, which says the number is shared until then. A load used to write the repair (round thirty-eight,
        // R2-1); the page that answered to the first of the two for good now says so and offers the repair.
        this.ready = true;
        this.checkClock();
        void changes;
        // A plant or batch of the oldest shape has its number as its id and no `acc`/`no` field; `accNo`/`sowNo` read either,
        // which they must for files in flight. A load wrote the number as a field (round forty-one, R4); a reading of the log
        // does not write to it (round fifty-six, 3), and the reading rule is the one every page already used.
        if (heard === 'replaced') { if (typeof location !== 'undefined') location.reload(); }
        else if (heard === 'refold') void this.rebuild().catch(() => {});
        else if (heard === 'written') void this.catchUp().catch(() => {});
        this.persisted = await requestPersistence();
      })();
    return this.loading;
  }

  /**
   * The accession numbering scheme: a synced setting record (so every device
   * mints and repairs numbers the same way), else the default.
   */
  get scheme(): NumberingScheme {
    const r = this.state.get(recKey('setting', NUMBERING_SETTING));
    const s = r && !r._deleted ? r.scheme : null;
    return isScheme(s) ? s : DEFAULT_SCHEME;
  }

  /** Whether the log holds a record with this identity, live or deleted. */
  exists(kind: Kind, id: string): boolean {
    return this.state.has(recKey(kind, id));
  }

  /* ---- reads ---- */
  /**
   * The sorted lists, built once per change to the state rather than on every read (round forty-nine, 1): the plants
   * list, Today and the search each read `accessions` several times a keystroke, and each read scanned and sorted every
   * record. The arrays are shared: a reader that wants its own order copies first.
   */
  private accessionsSorted = $derived.by(() => this.live<Accession>('accession').sort((a, b) => accNo(b).localeCompare(accNo(a))));
  get accessions(): Accession[] {
    return this.accessionsSorted;
  }
  /** By identity, or, failing that, by the number people see (URLs and QR codes carry the identity; people type numbers). */
  accession(idOrNo: string): Accession | undefined {
    const r = this.state.get(recKey('accession', idOrNo));
    if (r && !r._deleted && isComplete(r)) return r as unknown as Accession;
    return this.live<Accession>('accession').find((a) => accNo(a) === idOrNo);
  }
  /** The vault's ledger of every number ever written on this device, read at load and after another tab writes: a replace from an older backup does not bring those numbers back into play. */
  private ledger: Record<NumberKind, Set<string>> = { accession: new Set(), sowing: new Set() };
  /** Every number ever given to a plant on this device, live, dead or replaced away: a number is never reused. */
  private takenNumbers(kind: NumberKind, withLedger = true): Set<string> {
    const out = new Set(withLedger ? this.ledger[kind] : []);
    for (const r of this.state.values()) if (r.kind === kind) out.add(kind === 'accession' ? accNo(r as unknown as Accession) : sowNo(r as unknown as Sowing));
    return out;
  }
  private async readLedger(): Promise<void> {
    for (const k of ['accession', 'sowing'] as NumberKind[]) {
      const v = await getMeta<string[]>(`issued:${k}`);
      this.ledger[k] = new Set(Array.isArray(v) ? v : []);
    }
  }
  /** Another tab of this browser wrote: fold in what this tab has not seen, so its list and its next number are current. */
  /** The fold, again, from the whole log: for the rare change the vault displaced under its stamp, which the incremental fold cannot undo. */
  /** Bumped by every rebuild: a catch-up that began before one must not apply what it read over the rebuilt fold (round eighteen, 3). */
  private foldGen = 0;
  async rebuild(): Promise<void> {
    this.foldGen++;
    const gen = await foldGen();
    // The parks as stored, and nothing this tab judged by its clock before: a rebuild follows a change of the clock in
    // force, and those are judged again by the fold below (round sixty-one; rule 5).
    this.parkedStamps = new Set();
    this.storedParked = new Set();
    await this.rereadParked(); // after the counter: a park since then moves it, and the snapshot this rebuild writes is refused
    const seq = await lastArrival();
    const changes = await allChanges();
    this.foldAll(changes);
    await this.readParked();
    this.loaded = { from: 'log', changes: changes.length };
    this.lastSeq = seq;
    await this.readLedger();
    this.checkClock();
    this.foldWrite = this.saveFold(seq, gen);
  }

  /* ---- the fold and its snapshot ----
   * The fold is from the whole log once; after that it is kept as a snapshot
   * in the vault and brought up to date from the changes that arrived after
   * it, in arrival order (round fifty-three, 1; the reviewers' finding 25).
   * The snapshot is wrong, and the log folded again, when: the fold's rules
   * are not this one's (a deploy that leaves them as they were keeps the
   * snapshot; a test holds the fold's source to the rules number, round
   * fifty-seven); it is another device's; the clock
   * correction has changed since (every hold was judged by the old clock);
   * the log was replaced, or a stored change displaced, or a stamp parked
   * (the vault drops it in that very transaction, and refuses a snapshot that
   * began before, and a load that finds the counter moved under it folds the
   * log instead; round fifty-four, 2). What the snapshot did not fold is
   * carried as an inventory, every stamp, not one per field: the held changes
   * are re-judged on each load and folded as they come due, and the parked
   * ones are read back so their Apply stands (round fifty-four, 2; both
   * reviewers). The snapshot is written after a load and after a rebuild, off
   * the page's path, against the counter it was read at.
   */
  /** Every stamp the fold holds (stamped too far ahead, not parked): re-judged at each load, folded when due. */
  private heldStamps = new Set<string>();
  /**
   * How many changes the fold is holding, for the pages that list records: a record that came from a device whose clock
   * runs ahead is in the log and not yet on screen, and the plants list, Today and a restore's report say so rather than
   * showing an empty list as if nothing were there (round sixty; the data review's 6, the second outside review's 3).
   */
  heldWaiting = $state(0);
  /** The field each held stamp would change (the fold's own key: record, NUL, field), so the count leaves out one an edit here has since been stamped past. */
  private heldField = new Map<string, string>();
  /**
   * The held changes still waiting to change something: not those a later edit has been stamped past (`FOLLOW_HELD_MS`),
   * which will never show, though they come due (round sixty-one; the clock review's 9: the notice said "it appears when
   * this device's date reaches it" of a change the grower had already overridden). One whose field is not known yet is
   * counted.
   */
  private stillWaiting(t: string): boolean {
    const fk = this.heldField.get(t);
    const cur = fk ? this.seen.get(fk) : undefined;
    return !cur || hlcCompare(cur, t) < 0;
  }
  /** Of these held stamps, the ones still waiting to change something: for the sync page's count, which keeps its own list. */
  stillHeld(stamps: string[]): string[] {
    return stamps.filter((t) => !this.parkedStamps.has(t) && this.stillWaiting(t));
  }
  private countHeld(): void {
    let n = 0;
    for (const t of this.heldStamps) if (this.stillWaiting(t)) n++;
    this.heldWaiting = n;
  }
  private clearFold(): void {
    this.state.clear();
    for (const m of Object.values(this.kinds)) m.clear();
    this.seen = new Map();
    this.applied = new Set();
    this.parentHist = new Map();
    this.born = new Map();
    this.parkedByRecord = new Map();
    this.heldStamps = new Set();
    this.heldField = new Map();
    this.heldWaiting = 0;
  }
  /** Fold `changes` onto the state that is: what comes back held goes in the inventory; what was held and is applied leaves it. */
  private applyHere(changes: Change[]): void {
    const held = apply(this.state, changes, this.seen, this.hold());
    for (const c of changes) { this.heldStamps.delete(c.t); this.heldField.delete(c.t); }
    for (const c of held) { this.heldStamps.add(c.t); this.heldField.set(c.t, recKey(c.kind, c.id) + '\0' + c.field); }
    this.countHeld();
    for (const c of changes) { this.applied.add(c.t); this.clock?.observe(c.t); }
    this.noteParents(changes);
  }
  /** The whole log, folded from nothing. */
  private foldAll(changes: Change[]): void {
    this.clearFold();
    this.applyHere(changes);
    for (const r of this.state.values()) this.kinds[r.kind].set(r.id, r);
    this.indexAll();
  }
  /** A few changes folded onto the fold that is: the records they touch are re-set as copies, so the reactive maps notice. */
  private foldSome(changes: Change[]): void {
    if (!changes.length) return;
    this.applyHere(changes);
    this.touched(changes);
  }
  /** After apply() mutated records in place: a copy of each touched record goes into both maps, so the reactive maps notice; the indexes follow. */
  private touched(changes: Change[]): void {
    const keys = new Set(changes.map((c) => recKey(c.kind, c.id)));
    for (const k of keys) {
      const r = this.state.get(k);
      if (!r) continue;
      const copy = { ...r };
      this.state.set(k, copy);
      this.kinds[r.kind].set(r.id, copy);
    }
    this.reindex(keys);
  }
  /** The held stamps now due (not parked, not already folded past), to be fetched and folded. */
  private dueNow(): string[] {
    const hold = this.hold();
    const out: string[] = [];
    for (const t of this.heldStamps) if (!isHeld(t, hold) && !this.parkedStamps.has(t)) out.push(t);
    return out;
  }
  /** The fold at load: from the snapshot and what arrived after it, or from the whole log. Returns the changes read, for the passes that look at them. */
  private async foldFromVault(): Promise<Change[]> {
    const gen = await foldGen();
    // The parked set after the counter: a park between the two moves the counter, and whatever this load builds is then refused as a snapshot (round fifty-five, 2; the first reviewer's finding 7).
    this.parkedStamps = new Set();
    this.storedParked = new Set();
    this.parkedDone = new Set();
    await this.rereadParked();
    const seq = await lastArrival(); // before anything is read: a change stored after this number is folded again next time, which is harmless; one stored before it is in what is read
    const had = await readFold().catch(() => undefined);
    const f = had?.fold;
    const usable = !!f && f.rules === FOLD_RULES && f.device === this.deviceId && f.offset === clockOffsetMs() && (f.checked ?? false) === clockChecked() && had.gen === gen && Array.isArray(f.records) && Array.isArray(f.seen) && Array.isArray(f.born) && Array.isArray(f.parents) && Array.isArray(f.held);
    if (f && usable) {
      try {
        const got = await this.fromFold(f, gen);
        if (got) return got;
      } catch (e) {
        console.warn('the fold snapshot could not be read; folding the log', e); // a damaged snapshot is a slower load, never a lost collection
      }
    }
    const changes = await allChanges();
    this.foldAll(changes);
    await this.readParked();
    this.loaded = { from: 'log', changes: changes.length };
    this.lastSeq = seq;
    this.foldWrite = this.saveFold(seq, gen);
    return changes;
  }
  /** The snapshot restored and brought up to date; null when the log changed under it (the counter moved), in which case nothing of it is kept. */
  private async fromFold(f: FoldSnapshot, gen: number): Promise<Change[] | null> {
    this.clearFold();
    for (const r of f.records as Record_[]) {
      // A record of a kind this build does not know, or one that is not a record, makes the snapshot unreadable as a whole:
      // the log is folded instead. Skipping it left the record out of a snapshot load and in a whole-log one (round fifty-five, 2; the second reviewer's finding 3).
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r._t !== 'string' || !(r.kind in this.kinds)) throw new Error(`the snapshot holds a record this build cannot read (${String(r?.kind)})`);
      this.state.set(recKey(r.kind, r.id), r);
      this.kinds[r.kind].set(r.id, r);
    }
    if (f.seen.length % 2 || f.born.length % 2 || f.seen.some((x) => typeof x !== 'string')) throw new Error('the snapshot\'s stamp map is not pairs of strings');
    for (let i = 0; i + 1 < f.seen.length; i += 2) this.seen.set(f.seen[i], f.seen[i + 1]);
    for (let i = 0; i + 1 < f.born.length; i += 2) this.born.set(f.born[i], f.born[i + 1]);
    for (const [id, hist] of f.parents) this.parentHist.set(id, new Map(hist));
    for (const t of f.held) this.heldStamps.add(t);
    if (f.last) this.clock?.observe(f.last);
    // The tail, with the counter as it is in the same transaction: a replace or a displaced change since the counter was
    // read means the rows after `seq` are another log's, and the snapshot is dropped on the floor (round fifty-four, 2).
    const tail = await arrivalsAfter(f.seq);
    if (tail.gen !== gen) { this.clearFold(); return null; }
    const due = this.dueNow();
    const changes = [...(due.length ? await changesByKeys(due) : []), ...tail.changes];
    this.indexAll();
    this.foldSome(changes);
    // The fields of the held changes the snapshot named, read back, so the count leaves out those already overridden
    // (round sixty-one): few, and read only when there are any.
    const unknown = [...this.heldStamps].filter((t) => !this.heldField.has(t));
    if (unknown.length) for (const c of await changesByKeys(unknown)) this.heldField.set(c.t, recKey(c.kind, c.id) + '\0' + c.field);
    this.countHeld();
    await this.readParked();
    this.loaded = { from: 'snapshot', changes: tail.changes.length, snapshot: f.changes };
    this.lastSeq = tail.seq;
    // A tail that has grown long is folded into a fresh snapshot, under the number of the tail it folded: written under the
    // old one, every later load folded the same tail again and rewrote the whole snapshot (round fifty-five, 2; both reviewers).
    if (tail.changes.length >= FOLD_REFRESH) this.foldWrite = this.saveFold(tail.seq, gen, f.changes + tail.changes.length);
    else void touchFold(FOLD_RULES); // this shell is open and reads these rules: an older one must not take the snapshot over (round fifty-nine)
    return changes;
  }
  /** The parked changes, read back by their stamps so each record's Apply stands after any load (round fifty-four, 2): few, and never in the snapshot's records. */
  private async readParked(): Promise<void> {
    // Every parked stamp, dismissed ones too: the record's parked list is read whole, and the lists filter the dismissed
    // out themselves (round fifty-five, 2; the first reviewer's finding 9).
    const want = [...this.parkedStamps];
    if (!want.length) return;
    for (const c of await changesByKeys(want)) this.notePark(c);
  }
  /** The last snapshot write, for the sync page's account and the tests; resolves false when the vault refused it or there was nothing to write. */
  private foldWrite: Promise<boolean> | null = null;
  get snapshotWritten(): Promise<boolean> {
    return this.foldWrite ?? Promise.resolve(false);
  }
  /** Write the fold as it is to the vault, against the arrival number and the counter read before it was built; refused by the vault if the log changed under it. */
  private async saveFold(seq: number, gen: number, folded = this.applied.size): Promise<boolean> {
    try {
      // Copies: the store clones at its put, after an await, and a fold in between mutates records in place (the second reviewer's finding 15).
      const records = [...this.state.values()].map((r) => ({ ...r }));
      const seen: string[] = [];
      for (const [k, v] of this.seen) seen.push(k, v);
      const born: string[] = [];
      for (const [k, v] of this.born) born.push(k, v);
      const parents: FoldSnapshot['parents'] = [...this.parentHist].map(([id, m]) => [id, [...m]]);
      // The newest stamp folded, not held: the clock observes it at the next load (a held stamp is far ahead and would be ignored).
      let last = '';
      for (const [k, v] of this.seen) if (!k.includes('\0held\0') && hlcCompare(v, last) > 0) last = v;
      // The inventory: the held stamps, and the ones this fold parked by its clock alone, which are not stored (rule 5) and
      // are judged again at the next load (round sixty-one).
      const held = [...this.heldStamps, ...[...this.parkedStamps].filter((t) => !this.storedParked.has(t))];
      return await writeFold({ rules: FOLD_RULES, build: buildVersion, device: this.deviceId, offset: clockOffsetMs(), checked: clockChecked(), seq, records, seen, born, parents, held, last, changes: folded }, gen);
    } catch {
      return false; // a snapshot that could not be written is a slower load next time, nothing more
    }
  }

  /**
   * Another tab of this browser wrote: the changes that arrived after the last this tab folded, in arrival order, so its
   * list and its next number are current. This tab's own writes move the frontier as they are stored (round fifty-four, 2),
   * so no set of every stamp in the log is needed to tell them apart.
   */
  private lastSeq = 0;
  private async catchUp(): Promise<void> {
    if (!this.ready) return;
    const gen = this.foldGen;
    const got = await arrivalsAfter(this.lastSeq);
    await this.readLedger();
    if (gen !== this.foldGen) return; // a rebuild landed meanwhile: it read the same log and more; what was read here would put a displaced change back
    this.lastSeq = Math.max(this.lastSeq, got.seq);
    const changes = got.changes.filter((c) => !this.applied.has(c.t));
    if (!changes.length) return;
    this.foldSome(changes);
    this.checkClock();
  }
  isNumberTaken(no: string): boolean {
    return this.takenNumbers('accession').has(no.trim());
  }
  /**
   * A record that is here, not removed, and not whole, by its number or id: which required fields it waits for (round
   * thirty-seven, R1-4). By `accNo`/`sowNo`, so a plant whose number is its id (the oldest shape) is found too; batches and
   * places as well as plants (round thirty-eight, R1-3).
   */
  waiting(kind: 'accession' | 'sowing' | 'location', idOrNo: string): { id: string; missing: string[] } | undefined {
    const want = idOrNo.trim();
    for (const r of this.state.values()) {
      if (r.kind !== kind || r._deleted || isComplete(r)) continue;
      const no = kind === 'accession' ? accNo(r as unknown as Accession) : kind === 'sowing' ? sowNo(r as unknown as Sowing) : null;
      if (r.id === want || no === want) return { id: r.id, missing: REQUIRED_FIELDS[kind].filter((f) => r[f] == null) };
    }
    return undefined;
  }
  /**
   * A removed plant, by its identity first, then by its number: its record stays in the log, and it can be brought back
   * (round twenty-six, 4). By identity first since round sixty-one (the records review's 2): a label's code carries the
   * identity, and looked up by number alone, the grower's own removed plant read as a stranger's label, and one whose
   * number another plant has since taken could not be brought back at all once the Undo had gone.
   */
  removedAccession(idOrNo: string): Accession | undefined {
    const x = idOrNo.trim();
    const own = this.state.get(recKey('accession', x));
    if (own && own._deleted) return own as unknown as Accession;
    for (const r of this.state.values()) if (r.kind === 'accession' && r._deleted && accNo(r as unknown as Accession) === x) return r as unknown as Accession;
    return undefined;
  }
  /** An identity for a new record: unique per change on every device (wall time, counter, device tag), never shown. */
  private newId(prefix: 'r' | 's'): string {
    return prefix + this.eventId().slice(1);
  }
  /**
   * Events and photographs grouped by plant, built once per change to the
   * state rather than once per plant per render: a list of a thousand plants
   * asks for each plant's last watering several times a keystroke, and a
   * scan of every record each time is seconds on a phone.
   */
  // Kept up to date per record touched rather than rebuilt from every event on every write (round fifty-three, 1): a
  // watering re-sorts one plant's lines, not a hundred thousand. The map is replaced (a shallow copy) so a derived that
  // reads it re-runs; the lists of plants not touched are shared with the map before.
  private eventsByAcc = $state.raw(new Map<string, PlantEvent[]>());
  private photosByAcc = $state.raw(new Map<string, Photo[]>());
  /** Which plant each event's and photo's record was filed under, so an edit that moves it is taken out of the old list. */
  private filedUnder = new Map<string, string>();
  private indexAll(): void {
    const ev = new Map<string, PlantEvent[]>();
    for (const e of this.live<PlantEvent>('event')) (ev.get(e.acc) ?? ev.set(e.acc, []).get(e.acc)!).push(e);
    for (const list of ev.values()) list.sort(byDay);
    const ph = new Map<string, Photo[]>();
    for (const p of this.live<Photo>('photo')) { const k = p.acc ?? ''; (ph.get(k) ?? ph.set(k, []).get(k)!).push(p); }
    for (const list of ph.values()) list.sort(byDay);
    this.filedUnder = new Map();
    for (const [acc, list] of ev) for (const e of list) this.filedUnder.set(recKey('event', e.id), acc);
    for (const [acc, list] of ph) for (const p of list) this.filedUnder.set(recKey('photo', p.id), acc);
    this.eventsByAcc = ev;
    this.photosByAcc = ph;
  }
  private reindex(keys: Set<string>): void {
    let ev: Map<string, PlantEvent[]> | null = null, ph: Map<string, Photo[]> | null = null;
    for (const k of keys) {
      const r = this.state.get(k);
      if (!r || (r.kind !== 'event' && r.kind !== 'photo')) continue;
      const map = r.kind === 'event' ? (ev ??= new Map(this.eventsByAcc)) : (ph ??= new Map(this.photosByAcc));
      const was = this.filedUnder.get(k);
      if (was !== undefined) {
        const list = (map.get(was) ?? []).filter((x) => x.id !== r.id);
        if (list.length) map.set(was, list as never); else map.delete(was);
        this.filedUnder.delete(k);
      }
      if (r._deleted || !isComplete(r)) continue;
      const acc = r.kind === 'event' ? String(r.acc) : String(r.acc ?? '');
      const list = [...(map.get(acc) ?? []), r as never];
      list.sort(byDay);
      map.set(acc, list as never);
      this.filedUnder.set(k, acc);
    }
    if (ev) this.eventsByAcc = ev;
    if (ph) this.photosByAcc = ph;
  }
  /** A plant's (or batch's) events, newest first. */
  events(acc: string): PlantEvent[] {
    return this.eventsByAcc.get(acc) ?? [];
  }
  private taxaLive = $derived.by(() => this.live<Taxon>('taxon'));
  get taxa(): Taxon[] {
    return this.taxaLive;
  }
  taxon(id: string): Taxon | undefined {
    const r = this.state.get(recKey('taxon', id));
    return r && !r._deleted && isComplete(r) ? (r as unknown as Taxon) : undefined;
  }
  /** Keep a species on your list without a plant of it (or stop). Diffed like any other write, so sync carries it unchanged. */
  async follow(slug: string, name: string, gbifKey: number | null | undefined, on: boolean): Promise<void> {
    await this.put('taxon', slug, { name, gbifKey: gbifKey ?? null, followed: on || null });
  }
  /** Your species: every kind you grow or follow, by slug. */
  get mySpecies(): Map<string, MySpecies> {
    return mySpeciesOf(this.live<Accession>('accession'), this.live<Taxon>('taxon'));
  }
  /* ---- locations ---- */
  private locationsSorted = $derived.by(() => this.live<Location>('location').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name)));
  get locations(): Location[] {
    return this.locationsSorted;
  }
  location(id: string): Location | undefined {
    const r = this.state.get(recKey('location', id));
    return r && !r._deleted && isComplete(r) ? (r as unknown as Location) : undefined;
  }
  /**
   * The tree as it is shown, derived from the log so every device draws the
   * same one: each live node's effective parent. A parent that was removed is
   * skipped to the nearest live ancestor. A loop (two devices moving places
   * into each other while offline, or a place whose parent is itself) is cut
   * at its lowest id: that node goes back under the parent it had before the
   * move when that place is still live and outside the loop; otherwise it
   * becomes a root and is flagged as needing a home, so the person can move it.
   */
  /** The shown tree, built once per change to the state: every place name on a list of plants walked it afresh (round forty-nine, 1). */
  private shownTree = $derived.by(() => this.buildTree());
  private tree(): { parent: Map<string, string | null>; needsHome: Set<string> } {
    return this.shownTree;
  }
  private buildTree(): { parent: Map<string, string | null>; needsHome: Set<string> } {
    const parent = new Map<string, string | null>();
    const needsHome = new Set<string>();
    const live = this.live<Location>('location');
    const liveIds = new Set(live.map((l) => l.id));
    const selfLoops: string[] = [];
    for (const l of live) {
      const r = this.rawParent(l);
      parent.set(l.id, r.parent);
      if (r.loop) selfLoops.push(l.id);
    }
    /** Does walking up from `from` reach `target`? (Bounded: a damaged chain cannot spin.) */
    const reaches = (from: string, target: string): boolean => {
      const seen = new Set<string>();
      let cur: string | null = from;
      while (cur && !seen.has(cur)) {
        if (cur === target) return true;
        seen.add(cur);
        cur = parent.get(cur) ?? null;
      }
      return false;
    };
    const cut = (root: string, loop: string[]) => {
      parent.set(root, null);
      const back = this.prevParent(root);
      if (back && liveIds.has(back) && !loop.includes(back) && !reaches(back, root)) parent.set(root, back);
      else needsHome.add(root);
    };
    for (const id of [...selfLoops].sort()) cut(id, [id]);
    const done = new Set<string>();
    // Walked in id order, so two interlocking loops are found and cut the same way on every device, whatever order the records entered memory (round fifty-two, 4; the first reviewer's finding 12).
    for (const l of [...live].sort((a, b) => a.id.localeCompare(b.id))) {
      if (done.has(l.id)) continue;
      const path: string[] = [];
      let cur: string | null = l.id;
      while (cur && !done.has(cur) && !path.includes(cur)) {
        path.push(cur);
        cur = parent.get(cur) ?? null;
      }
      if (cur && !done.has(cur)) {
        const loop = path.slice(path.indexOf(cur));
        cut([...loop].sort()[0], loop);
      }
      for (const p of path) done.add(p);
    }
    return { parent, needsHome };
  }
  /** A live node's parent by the raw chain (through removed nodes), and whether that chain comes back to the node itself. */
  private rawParent(l: Location): { parent: string | null; loop: boolean } {
    const seen = new Set<string>([l.id]);
    let cur = l.parentId ?? null;
    while (cur) {
      if (cur === l.id) return { parent: null, loop: true };
      const r = this.state.get(recKey('location', cur));
      if (!r) return { parent: null, loop: false };
      if (!r._deleted && isComplete(r)) return { parent: cur, loop: false }; // an incomplete place is walked past like a removed one (round thirty-five, R1-2)
      if (seen.has(cur)) return { parent: null, loop: false };
      seen.add(cur);
      cur = (r.parentId as string | null | undefined) ?? null;
    }
    return { parent: null, loop: false };
  }
  /** Remember every parentId a place has been given, so a cut loop can fall back to the previous one. Same on every device: it is read from the log, not from arrival order. */
  /** The earliest stamp seen for each record: the day it was made, for an id that does not carry it. */
  private born = new Map<string, string>();
  /** The local day a record was made: the day in its id, else its first change. */
  madeOn(kind: Kind, id: string): string | null {
    const k = recKey(kind, id);
    const fromId = madeOn(id);
    if (fromId) return fromId;
    const t = this.born.get(k);
    return t ? localDate(new Date(hlcWall(t))) : null;
  }
  private noteParents(changes: Iterable<Change>): void {
    for (const c of changes) {
      const k = recKey(c.kind, c.id);
      const b = this.born.get(k);
      if (!b || hlcCompare(c.t, b) < 0) this.born.set(k, c.t);
      if (c.kind !== 'location' || c.field !== 'parentId') continue;
      let m = this.parentHist.get(c.id);
      if (!m) this.parentHist.set(c.id, (m = new Map()));
      m.set(c.t, typeof c.value === 'string' ? c.value : null);
    }
  }
  /** The parent a place had before its latest move, or undefined when it has had only one. */
  private prevParent(id: string): string | null | undefined {
    const m = this.parentHist.get(id);
    if (!m || m.size < 2) return undefined;
    const ts = [...m.keys()].sort(hlcCompare);
    return m.get(ts[ts.length - 2]);
  }
  /** `id` itself when it is a live place, else its nearest live ancestor by the raw parent chain (through removed nodes), else null. */
  private nearestLive(id: string | null | undefined, from?: string): string | null {
    const seen = new Set<string>(from ? [from] : []);
    let cur = id ?? null;
    while (cur && !seen.has(cur)) {
      const r = this.state.get(recKey('location', cur));
      if (!r) return null;
      if (!r._deleted && isComplete(r)) return cur;
      seen.add(cur);
      cur = (r.parentId as string | null | undefined) ?? null;
    }
    return null;
  }
  /** Where a plant or sowing with this locationId is shown: the place itself, or, if it was removed, the nearest place above it. */
  placeOf(locationId: string | null | undefined): string | null {
    return this.nearestLive(locationId);
  }
  /** A place cut free from a loop, waiting to be put somewhere. */
  needsHome(id: string): boolean {
    return this.tree().needsHome.has(id);
  }
  children(parentId: string | null): Location[] {
    const { parent } = this.tree();
    return this.locations.filter((l) => (parent.get(l.id) ?? null) === parentId);
  }
  /** Root → node, along the shown tree; a removed node's path is that of the nearest place above it. */
  locationPath(id: string): Location[] {
    const { parent } = this.tree();
    const out: Location[] = [];
    let cur = this.location(this.placeOf(id) ?? '');
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      const p = parent.get(cur.id);
      cur = p ? this.location(p) : undefined;
    }
    return out;
  }
  locationName(id: string): string {
    return this.locationPath(id).map((l) => l.name).join(' › ');
  }
  /** Every node under `id`, including itself. Cycle-safe: a damaged log cannot make this spin. */
  subtree(id: string): string[] {
    const out = [id];
    const seen = new Set(out);
    for (let i = 0; i < out.length; i++)
      for (const c of this.children(out[i]))
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c.id);
        }
    return out;
  }
  /** Would putting `id` under `parentId` make a loop? (Its own descendant, or itself.) */
  wouldCycle(id: string, parentId: string | null | undefined): boolean {
    if (!parentId) return false;
    if (parentId === id) return true;
    return this.subtree(id).includes(parentId);
  }
  /** Move a node; refused when it would make a loop. */
  async moveLocation(id: string, parentId: string | null): Promise<void> {
    this.checkMove(id, parentId);
    await this.put('location', id, { parentId });
  }
  /** What a move must satisfy, for a caller that writes the new parent with the rest of an edit in one commit (round fifty-one, 3). */
  checkMove(id: string, parentId: string | null): void {
    if (this.wouldCycle(id, parentId)) throw new Error('A place cannot be put inside itself.');
    if (parentId && !this.location(parentId)) throw new Error('That parent place does not exist.');
  }
  /** Conditions as they apply at a node: the nearest ancestor's value wins for anything the node leaves null. */
  conditions(id: string): { indoor: boolean | null; floorC: number | null; floorHeld: boolean; ppfd: number | null; lightHours: number | null; lat: number | null; lon: number | null; altM: number | null; waterDays: number | null; dryMonths: number[] | null; from: Record<string, string> } {
    const path = this.locationPath(id).reverse(); // node first
    const pick = <K extends keyof Location>(k: K): { v: Location[K] | null; from: string } => {
      for (const l of path) if (l[k] != null) return { v: l[k], from: l.name };
      return { v: null, from: '' };
    };
    const from: Record<string, string> = {};
    const g = <K extends keyof Location>(k: K) => {
      const r = pick(k);
      if (r.from) from[k as string] = r.from;
      return r.v as Location[K] | null;
    };
    // The floor's kind comes from the place that supplied the floor, not from a nearer one that set only the kind.
    const floorFrom = path.find((l) => l.floorC != null);
    return { indoor: g('indoor') as boolean | null, floorC: g('floorC') as number | null, floorHeld: !!floorFrom?.floorHeld, ppfd: g('ppfd') as number | null, lightHours: g('lightHours') as number | null, lat: g('lat') as number | null, lon: g('lon') as number | null, altM: g('altM') as number | null, waterDays: g('waterDays') as number | null, dryMonths: g('dryMonths') as number[] | null, from };
  }
  /** Growing plants at a node (deep: including every node beneath it). A plant whose own place was removed counts at the nearest place above it. */
  plantsAt(id: string, deep = true): Accession[] {
    const ids = new Set(deep ? this.subtree(id) : [id]);
    return this.accessions.filter((a) => a.status === 'growing' && a.locationId && ids.has(this.placeOf(a.locationId) ?? ''));
  }
  /** A new place. Its identity is minted, never derived from the name: two shelves called "Shelf 1" in different rooms are two places. */
  async addLocation(l: Omit<Location, 'id'> & { id?: string }): Promise<Location> {
    if (l.parentId && !this.location(l.parentId)) throw new Error('That parent place does not exist.');
    const id = l.id ?? 'l' + this.eventId().slice(1);
    const rec: Location = { ...l, id };
    await this.put('location', id, rec as unknown as Record<string, unknown>);
    return rec;
  }
  /** Removing a node moves its plants, sowings and children up to its parent as shown (never the raw `parentId`, which in a cut loop points back into it); nothing is orphaned. */
  async removeLocation(id: string): Promise<{ plants: number; batches: number; places: number; to: string | null }> {
    const node = this.location(id);
    if (!node) return { plants: 0, batches: 0, places: 0, to: null };
    const parent = this.tree().parent.get(id) ?? null;
    const toName = parent ? this.locationName(parent) : null;
    const changes: Change[] = [];
    const out = { plants: 0, batches: 0, places: 0, to: toName };
    for (const c of this.children(id)) { changes.push({ t: this.tick(), kind: 'location', id: c.id, field: 'parentId', value: parent }); out.places++; }
    // Each growing plant moved up gets a Move line, so its timeline says where it went and why (round twenty-three, 2);
    // a dead or archived plant is refiled without a line. A plant is found through `placeOf`, so one filed under a place
    // already removed elsewhere (an offline move on another device) is carried up too, not left pointing at nothing
    // (round twenty-four, 4).
    const when = localDate();
    for (const a of this.accessions) if (a.locationId && this.placeOf(a.locationId) === id) {
      changes.push({ t: this.tick(), kind: 'accession', id: a.id, field: 'locationId', value: parent });
      if (a.status !== 'growing') continue;
      const eid = this.eventId();
      changes.push(...diff('event', eid, { id: eid, acc: a.id, d: when, t: 'move', note: parent ? `to ${toName} (${node.name} was removed)` : `${node.name} was removed; no place now`, auto: true } as unknown as Record<string, unknown>, undefined, this.tick));
      out.plants++;
    }
    for (const s of this.sowings) if (s.locationId && this.placeOf(s.locationId) === id) { changes.push({ t: this.tick(), kind: 'sowing', id: s.id, field: 'locationId', value: parent }); out.batches++; }
    changes.push({ t: this.tick(), kind: 'location', id, field: '_deleted', value: true });
    await this.commit(changes);
    return out;
  }

  /* ---- sowings ---- */
  private sowingsSorted = $derived.by(() => this.live<Sowing>('sowing').sort((a, b) => b.sown.localeCompare(a.sown) || b.id.localeCompare(a.id)));
  get sowings(): Sowing[] {
    return this.sowingsSorted;
  }
  sowing(idOrNo: string): Sowing | undefined {
    const r = this.state.get(recKey('sowing', idOrNo));
    if (r && !r._deleted && isComplete(r)) return r as unknown as Sowing;
    return this.live<Sowing>('sowing').find((x) => sowNo(x) === idOrNo);
  }
  /** Plants that were potted up from a sowing. */
  raisedFrom(sowingId: string): Accession[] {
    return this.accessions.filter((a) => a.sowingId === sowingId);
  }
  /** Sowings taken from a parent plant (cuttings, offsets…). */
  propagationsOf(acc: string): Sowing[] {
    return this.sowings.filter((s) => s.parentAcc === acc);
  }
  /** Derived counts for a sowing. Germination counts are cumulative ("seedlings up so far"), so the latest wins. */
  sowingStats(id: string): { germinated: number; potted: number; lost: number; remaining: number; overdrawn: number; rate: number | null; firstUp: string | null; daysToFirst: number | null; days: number } {
    const s = this.sowing(id);
    const ev = this.events(id); // newest first
    const germ = ev.filter((e) => e.t === 'germinate');
    const germinated = germ.length ? Math.max(...germ.map((e) => e.n ?? 0)) : 0;
    const potted = ev.filter((e) => e.t === 'potup').reduce((n, e) => n + (e.n ?? 0), 0);
    const lost = ev.filter((e) => e.t === 'loss').reduce((n, e) => n + (e.n ?? 0), 0);
    const up = germ.filter((e) => (e.n ?? 0) > 0); // a recorded 0 is a count, not a first strike (round twenty-five, 5)
    const firstUp = up.length ? up[up.length - 1].d : null;
    const dayMs = 86_400_000;
    const since = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / dayMs);
    return {
      germinated,
      potted,
      lost,
      remaining: Math.max(0, germinated - potted - lost),
      // Below zero after a merge: two devices potted the same last seedlings offline. Said on the page, not clamped away (round fifty-two, 3; the second reviewer's finding 1).
      overdrawn: Math.max(0, potted + lost - germinated),
      rate: s && s.count > 0 && germ.length ? germinated / s.count : null, // no count yet is not 0% (round twenty-eight, 3)
      firstUp,
      daysToFirst: s && firstUp ? since(s.sown, firstUp) : null,
      days: s ? since(s.sown, localDate()) : 0
    };
  }
  nextSowingNumber(year = new Date(nowMs()).getFullYear()): string {
    return nextAccession(this.takenNumbers('sowing'), { mode: 'prefix', prefix: `S${year}`, width: 3 });
  }
  async addSowing(sw: Omit<Sowing, 'id' | 'status'> & { id?: string; status?: Sowing['status'] }): Promise<Sowing> {
    const wanted = sw.no?.trim() || null;
    const id = sw.id ?? this.newId('s');
    const rec = await this.claim('sowing', (issued) => {
      const year = Number(sw.sown.slice(0, 4)) || new Date(nowMs()).getFullYear();
      const no = wanted ?? nextAccession(issued, { mode: 'prefix', prefix: `S${year}`, width: 3 });
      if (wanted && issued.has(no)) throw new Error(`Batch number ${no} is already used.`);
      const r: Sowing = { status: 'active', ...sw, id, no };
      const changes = diff('sowing', id, r as unknown as Record<string, unknown>, undefined, this.tick);
      // The parent plant's timeline records that material was taken, in the same commit as the batch: a page closed
      // between two commits left a batch with no line on its parent, or the line with no batch (round forty-nine, 1).
      if (r.parentAcc && this.accession(r.parentAcc)) {
        const m = PROP_METHODS.find((x) => x.k === r.method);
        changes.push(...diff('event', this.eventId(), { acc: r.parentAcc, d: r.sown, t: 'propagate', n: r.count, note: `${r.count} ${m?.unit ?? 'pieces'} → ${r.no}` }, undefined, this.tick));
      }
      return { changes, result: r };
    });
    return rec;
  }
  /**
   * Pot up n plants from a sowing: n new accessions carrying the batch as provenance, one potup
   * event on the sowing naming them, one acquire event each. All in one commit.
   */
  async potUp(sowingId: string, n: number, opts: { date?: string; locationId?: string | null; note?: string | null } = {}): Promise<Accession[]> {
    const s = this.sowing(sowingId);
    if (!s || n < 1) return [];
    const date = opts.date ?? localDate();
    const m = PROP_METHODS.find((x) => x.k === s.method);
    // A method this build does not know says nothing about what the plant is: not seed, so not a claim that the plant
    // was raised from the batch's seed (an offset batch from an old import potted up as "F1 from wild-collected seed":
    // round thirty-five, R1-1). Its plants carry an unknown provenance and no source form until a build that knows the word.
    const known = !!m;
    const veg = m?.veg ?? false;
    const parent = s.parentAcc ? this.accession(s.parentAcc) : undefined;
    // Seed keeps the provenance the seed carried; a wild-collected seed lot raises F1 plants. Vegetative material is 'veg'.
    const provenance: Provenance = !known ? 'unknown' : veg ? 'veg' : s.provenance === 'wild' ? 'f1' : s.provenance === 'f1' ? 'fn' : (s.provenance ?? 'unknown');
    return this.claim('accession', (taken) => {
    // The pot is read inside the claim, not before it: two submits in flight each saw the full pot and together potted twice (round fifty-two, 3).
    const room = this.sowingStats(sowingId).remaining;
    if (room < 1) throw new Error('Nothing left in the pot to pot up.');
    if (n > room) n = room;
    const changes: Change[] = [];
    const made: Accession[] = [];
    for (let i = 0; i < n; i++) {
      const no = nextAccession(taken, this.scheme, Number(date.slice(0, 4)) || undefined);
      taken.add(no);
      const id = this.newId('r');
      const rec: Accession = {
        id,
        acc: no,
        taxonName: s.taxonName,
        taxonKey: s.taxonKey ?? null,
        cultivar: s.cultivar ?? parent?.cultivar ?? null,
        nameKind: s.nameKind ?? parent?.nameKind ?? null,
        parentage: s.parentage ?? parent?.parentage ?? null,
        fieldNumber: veg ? (parent?.fieldNumber ?? null) : (s.fieldNumber ?? null), // the lot is not a field number: it stays in sourceRef below (round twenty-eight, 4)
        provenance,
        status: 'growing',
        acquired: date,
        sourceFrom: veg ? (parent ? `own plant ${accNo(parent)}` : null) : (s.sourceFrom ?? null),
        sourceRef: s.sourceRef ?? null,
        sourceForm: !known ? null : veg ? (m.k === 'graft' ? 'graft' : 'cutting') : 'seedling',
        locationId: opts.locationId ?? s.locationId ?? null,
        sowingId: s.id,
        notes: null
      };
      changes.push(...diff('accession', id, rec as unknown as Record<string, unknown>, undefined, this.tick));
      const eid = this.eventId();
      changes.push(...diff('event', eid, { acc: id, d: date, t: 'acquire', note: `potted up from ${sowNo(s)}` }, undefined, this.tick));
      made.push(rec);
    }
    const pid = this.eventId();
    changes.push(...diff('event', pid, { acc: s.id, d: date, t: 'potup', n, plants: made.map((a) => a.id), note: opts.note?.trim() || null }, undefined, this.tick));
    return { changes, result: made };
    });
  }

  /* ---- photos ---- */
  /** Photos of a plant, newest first. */
  photos(acc: string): Photo[] {
    return this.photosByAcc.get(acc) ?? [];
  }
  photosOfSowing(id: string): Photo[] {
    return this.live<Photo>('photo')
      .filter((p) => p.sowing === id)
      .sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id));
  }
  /** Whether a photograph's record is here and removed: its pixels are bytes nothing names. */
  photoRemoved(id: string): boolean {
    const r = this.state.get(recKey('photo', id));
    return !!r && !!r._deleted;
  }
  /** Photographs whose records are removed, with the wall-clock millisecond of the removal: their pixels are bytes nothing names, here and on the server (round forty-nine, 1). */
  removedPhotos(): Array<{ id: string; at: number }> {
    const out: Array<{ id: string; at: number }> = [];
    for (const r of this.state.values()) {
      if (r.kind !== 'photo' || !r._deleted) continue;
      const t = this.seen.get(recKey('photo', r.id) + '\0_deleted');
      out.push({ id: r.id, at: t ? hlcWall(t) : 0 });
    }
    return out;
  }
  /** Whether a photograph's record is here at all, whole or waiting for a field: its pixels have a record to belong to. */
  photoKnown(id: string): boolean {
    const r = this.state.get(recKey('photo', id));
    return !!r && !r._deleted;
  }
  /** Every photograph with a record here that is not removed, whole or waiting: the pixels sync carries (round thirty-seven, 1). */
  knownPhotos(): Array<{ id: string; sha?: string }> {
    const out: Array<{ id: string; sha?: string }> = [];
    for (const r of this.state.values()) if (r.kind === 'photo' && !r._deleted) out.push({ id: r.id, sha: typeof r.sha === 'string' ? r.sha : undefined });
    return out;
  }
  photo(id: string): Photo | undefined {
    const r = this.state.get(recKey('photo', id));
    return r && !r._deleted && isComplete(r) ? (r as unknown as Photo) : undefined;
  }
  /** The plant's face: its chosen cover, else its newest photo. */
  cover(acc: string): Photo | undefined {
    const a = this.accession(acc);
    if (a?.cover) {
      const p = this.photo(a.cover);
      if (p) return p;
    }
    return this.photos(acc)[0];
  }
  /** Photos of every plant of a species you own, newest first, each tagged with its plant. */
  photosOfTaxon(taxonName: string): Array<Photo & { plant: Accession }> {
    const mine = this.accessions.filter((a) => a.taxonName === taxonName);
    const out: Array<Photo & { plant: Accession }> = [];
    for (const a of mine) for (const p of this.photos(a.id)) out.push({ ...p, plant: a });
    return out.sort((a, b) => b.d.localeCompare(a.d));
  }
  /** Store the pixels first, then the record: a record without pixels is worse than pixels without a record. */
  async addPhoto(p: Omit<Photo, 'id'> & { blob: Blob; thumb: Blob }): Promise<Photo> {
    const id = 'p' + this.eventId().slice(1);
    const { blob, thumb, ...meta } = p;
    const rec: Photo = { ...meta, id };
    // Held as one unit: a vault reload between the pixels and the record would leave pixels no record names.
    await holdVault(async () => {
      await putPhotoBlobs({ id, blob, thumb });
      try {
        await this.put('photo', id, rec as unknown as Record<string, unknown>);
      } catch (e) {
        // The pixels went in and the record did not (a full device): without the record nothing could name or remove
        // them, so they come out again. The id is fresh, so this cannot touch an earlier photograph (round thirty, R1-2).
        await deletePhotoBlobs(id).catch(() => {});
        throw e;
      }
    });
    return rec;
  }
  /**
   * Remove a photograph and return the way back: the pixels are read before they are deleted and held by the returned
   * function, so an Undo within the toast's life puts the record, the cover and the pixels back (round twenty-nine, 1).
   */
  async removePhoto(id: string): Promise<() => Promise<void>> {
    const p = this.photo(id);
    const wasCover = !!p?.acc && this.accession(p.acc)?.cover === id;
    const blobs = await getPhotoBlobs(id);
    // The removal and the cover's clearing are one commit: between two, a plant could keep a removed photograph as its cover (round forty-nine, 1).
    const changes: Change[] = [{ t: this.tick(), kind: 'photo', id, field: '_deleted', value: true }];
    if (p?.acc && wasCover) changes.push(...diff('accession', p.acc, { cover: null }, this.state.get(recKey('accession', p.acc)), this.tick));
    await this.commit(changes);
    await deletePhotoBlobs(id);
    this.urls.delete(id);
    return async () => {
      if (blobs) await putPhotoBlobs(blobs);
      await this.restore('photo', id);
      // The cover goes back only if nothing has been chosen since: a cover picked between the removal and the Undo stands (round thirty, R2-3).
      if (p?.acc && wasCover && !this.accession(p.acc)?.cover) await this.put('accession', p.acc, { cover: id });
    };
  }
  async setCover(acc: string, photoId: string | null): Promise<void> {
    await this.put('accession', acc, { cover: photoId });
  }
  /** The pixels went (a removal folded from another device): the cached URLs would show them still (round forty-nine, 1). */
  forgetPhotoUrls(id: string): void {
    this.urls.delete(id);
  }
  /** Object URLs for a photo's pixels, cached for the page's life. */
  private urls = new Map<string, Promise<{ full: string; thumb: string } | null>>();
  photoUrls(id: string): Promise<{ full: string; thumb: string } | null> {
    let p = this.urls.get(id);
    if (!p) {
      p = getPhotoBlobs(id).then((b) => (b ? { full: URL.createObjectURL(b.blob), thumb: URL.createObjectURL(b.thumb) } : null));
      this.urls.set(id, p);
    }
    return p;
  }

  /**
   * The one watering figure every surface reads (the plant page, the plants list and its Due chip, the place card,
   * Today), so they cannot disagree (round twenty-five, R1-1): the last watering dated today or earlier (a future-dated
   * line is a typo, not a watering; round twenty-five, 1), as days ago; when nothing is logged, the days since the
   * record was made (not the acquisition date, which for a collection entered late is years back), so a plant entered
   * this week is not overdue. `lastWatered` is the date itself, null when none.
   */
  lastWatered(acc: string): string | null {
    const today = localDate();
    return this.events(acc).find((e) => e.t === 'water' && e.d <= today)?.d ?? null;
  }
  /** A watering dated after today (a line typed ahead): not the last watering, and not "none recorded" either; said on its own (round fifty-four, 4). The earliest such date. */
  wateringAhead(acc: string): string | null {
    const today = localDate();
    let out: string | null = null;
    for (const e of this.events(acc)) if (e.t === 'water' && e.d > today && (!out || e.d < out)) out = e.d;
    return out;
  }
  careDays(a: Accession): number {
    const w = this.lastWatered(a.id);
    return daysBetween(w ?? this.madeOn('accession', a.id) ?? a.acquired ?? localDate());
  }
  /** Growing plants not watered, or not recorded as watered, for their rhythm (`rhythm`, 21 days unless the grower set one) or more, outside a month their place is kept dry. Derived once per change and per day, not scanned on every read: Today, the chip and the list each read it per render (round fifty-two, 5). */
  // A plant whose watering is dated ahead of today is not due: one reading of it on every surface (round fifty-five, 5; the first reviewer's finding 5).
  private dueList = $derived.by(() => { void this.eventsByAcc; void day.current; return this.accessions.filter((a) => a.status === 'growing' && !this.keptDry(a) && this.careDays(a) >= this.rhythm(a) && !this.wateringAhead(a.id)); });
  /**
   * How often a plant is watered, in days, by the grower's own rule (round fifty-eight; the grower review): the plant's own
   * rhythm, else its place's, inherited down the tree, else 21. A fact about the grower's rhythm, not advice.
   */
  rhythm(a: Accession): number {
    if (typeof a.waterDays === 'number' && a.waterDays > 0) return a.waterDays;
    const c = a.locationId ? this.conditions(a.locationId) : null;
    return c && typeof c.waterDays === 'number' && c.waterDays > 0 ? c.waterDays : DUE_DAYS;
  }
  /** Whether the plant's place is kept dry this month by the grower's rule: then it is not due, and Today says so in one line. */
  keptDry(a: Accession): boolean {
    const c = a.locationId ? this.conditions(a.locationId) : null;
    return !!c?.dryMonths?.includes(Number(day.current.slice(5, 7)));
  }
  /** The words for a plant's watering, the same on the plant page, the plants list and Today: watered N days ago, dated ahead of today, or none recorded. */
  wateringWords(a: Accession): string {
    const w = this.lastWatered(a.id);
    const ahead = this.wateringAhead(a.id);
    if (w == null && ahead) return `watering dated ${ahead}, ahead of today`;
    if (w == null) return 'no watering recorded';
    const d = daysBetween(w);
    return d === 0 ? 'watered today' : `watered ${d} d ago`;
  }
  get due(): Accession[] {
    return this.dueList;
  }
  private dueIds = $derived(new Set(this.dueList.map((a) => a.id)));
  /** Whether a plant is due by its rhythm: the one reading Today, the lists, the place page and the plant page use (round fifty-eight). */
  isDue(a: Accession): boolean {
    return this.dueIds.has(a.id);
  }
  /** Last time each plant was marked present at an audit (or acquired), for "not seen since". */
  /** The last day the plant was in front of the grower: its last audit, else the day its record was made (not the acquisition date it was given, which may be years back for a collection entered late). */
  lastSeen(acc: string): string | null {
    return this.sighting(acc).seen;
  }
  /** The last audit at which the plant was looked for and not found, if nothing since has put it in front of the grower. */
  missedAt(acc: string): string | null {
    return this.sighting(acc).missed;
  }
  /** The places with an audit behind them: a plant there has an audit line (round fifty-eight). */
  private auditedPlaces = $derived.by(() => {
    const out = new Set<string | null>();
    for (const a of this.accessionsSorted) if (this.events(a.id).some((e) => e.t === 'audit')) out.add(a.locationId ?? null);
    return out;
  });
  /**
   * Why a growing plant is "unseen", or null: missed at the last audit, or not in front of the grower for ninety days in a
   * place that has been audited. Before a place's first audit the ninety days say nothing (every plant entered a season
   * ago would be flagged, and the line named an audit that never happened: round fifty-eight; the grower review). One
   * reading for Today, the front page and the place page.
   */
  unseenWhy(acc: string): 'missed' | 'stale' | null {
    if (this.missedAt(acc)) return 'missed';
    const a = this.accession(acc);
    if (!a || !this.auditedPlaces.has(a.locationId ?? null)) return null;
    const s = this.lastSeen(acc);
    return s != null && daysBetween(s) > 90 ? 'stale' : null;
  }
  /**
   * What the log says last about the plant being in front of the grower, read in the log's own order (date, then id,
   * newest first) rather than by comparing dates: a watering at 09:00 and an audit miss at 17:00 the same day are two
   * lines, and the later one is the answer (round twenty-four, 3). A line the grower did not write about this plant
   * (`auto`: a place removed, a rename, the number repair) is not a sighting, nor is an event
   * dated after today; the acquisition counts by the day its record was made, not the date it was given.
   */
  private sighting(acc: string): { seen: string | null; missed: string | null } {
    const today = localDate();
    let seen: string | null = null, missed: string | null = null;
    for (const e of this.events(acc)) {
      if (e.auto || (e.t === 'note' && e.note?.startsWith('Renumbered from '))) continue;
      const d = e.t === 'acquire' ? (this.madeOn('event', e.id) ?? e.d) : e.d;
      if (!d || d > today) continue;
      if (e.t === 'audit' && e.note === 'not seen') {
        if (!seen && !missed) missed = d;
        continue;
      }
      if (!seen) seen = d;
      if (missed) break;
    }
    return { seen, missed };
  }

  private live<T>(kind: Kind): T[] {
    const out: T[] = [];
    for (const r of this.kinds[kind].values()) if (!r._deleted && isComplete(r)) out.push(r as unknown as T);
    return out;
  }

  /** Records here that lack a field their kind cannot be shown without: made by a batch this build could not read, touched by a later one (round thirty-three, 1). */
  private incompleteN = $derived.by(() => { let n = 0; for (const m of Object.values(this.kinds)) for (const r of m.values()) if (!r._deleted && !isComplete(r)) n++; return n; });
  get incomplete(): number {
    return this.incompleteN; // derived, not a scan of every record on every render (round fifty-four, 2; the second reviewer's finding 27)
  }

  /* ---- writes ---- */
  private tick = () => {
    if (!this.clock) throw new Error('collection not loaded');
    return this.clock.tick();
  };
  /** A short id that is unique per change on every device: wall time and counter in base 36 plus the whole device id (older ids carried its first four characters, which two devices could share). */
  private eventId(): string {
    const h = hlcDecode(this.tick());
    return 'e' + h.wall.toString(36) + h.count.toString(36).padStart(2, '0') + h.device;
  }

  /**
   * `source`: 'local' (an edit here; listeners are told, sync will push),
   * 'import' (a backup file: not an edit, but the server has never seen
   * it, so it is pushed too), 'server' (came down through sync: already there).
   */
  private async commit(changes: Change[], source: 'local' | 'import' | 'server' = 'local', requireKey?: string): Promise<void> {
    if (!changes.length) return;
    const own = source !== 'server';
    // The grower's own writes are checked as a pull or a file is: a value of a type its field never takes (a form's
    // "1e999", which is Infinity) is refused here, with the reason, rather than stored and refused by every other device
    // (round fifty-eight; the client review).
    if (source === 'local') {
      const bad = changes.map((c) => changeError(c)).find((e) => e);
      if (bad) { this.lastWriteError = bad; throw new Error(bad); }
      this.stampPast(changes);
    }
    // The vault first. If it refuses (a full phone), nothing is applied, the page keeps showing what is stored, and the error is kept for the page to show.
    try {
      // Only what the vault kept is applied: a change it declined (another under the same stamp already stored and ranking
      // higher) is not shown here either, so the screen and the disk agree without a reload (round sixteen, 4).
      const stored = await appendChanges(changes, source === 'server', source === 'local', requireKey);
      changes = stored.kept;
      // The frontier moves over this write only when its rows follow the frontier with no gap: a gap is another tab's row
      // this tab has not folded, and moving past it lost that row until a reload (round fifty-five, 1; both reviewers' first
      // finding). Otherwise the catch-up reads from the frontier, folds the other tab's rows and skips this tab's own.
      if (stored.first && stored.first === this.lastSeq + 1) this.lastSeq = stored.seq;
      else if (stored.first > this.lastSeq + 1) queueMicrotask(() => void this.catchUp().catch(() => {}));
      // A photograph's removal seen from anywhere (here, a pull, a file) is noted at once, whatever the record folds to:
      // the server may drop the bytes on a peer's say-so, and a later revival (an Undo, an edit made offline elsewhere)
      // then needs the pixels sent again from whoever kept them. The engine checks each noted photograph against the
      // server before trusting its upload record (round fifty-two, 2).
      const removedIds = changes.filter((c) => c.kind === 'photo' && c.field === '_deleted' && c.value === true).map((c) => c.id);
      if (removedIds.length) await this.noteUnverified(removedIds);
      // A stored change displaced under its stamp (a higher-ranking one arrived) has no inverse in the incremental fold:
      // the fold is rebuilt from the log, so the displaced record leaves the screen and cannot be edited into a fragment
      // the disk does not have (round seventeen, 3). Other tabs rebuild on the 'refold' notice.
      if (stored.replaced.length) {
        if (own) this.lastWriteError = null;
        await this.rebuild();
        if (source !== 'server') for (const fn of this.listeners) fn(changes);
        return;
      }
    } catch (e) {
      // Said on the record pages as "this change was not saved" only when it was the grower's change, or their file's: a
      // batch from sync that could not be stored is the sync page's to report, and it is fetched again (round fifty-eight).
      if (own) this.lastWriteError = await writeErrorText(e);
      throw e;
    }
    if (own) this.lastWriteError = null;
    if (!changes.length) return;
    this.foldSome(changes);
    this.checkClock(); // the line under the top bar follows a write, not only a load (round sixty; the first outside review's 17)
    if (source !== 'server') for (const fn of this.listeners) fn(changes);
  }

  /** Called after every write the server has not seen (local edits and imports, not pulls); sync uses it to schedule a push. */
  private listeners = new Set<(changes: Change[]) => void>();
  onLocalChange(fn: (changes: Change[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** This machine: what sync names batches by and the hold rule matches; the same in every tab. */
  private deviceId = '';
  get device(): string {
    return this.deviceId;
  }
  /** This tab's writer id: the device plus a tag, what stamps carry. */
  get writer(): string {
    return this.clock?.device ?? '';
  }
  /** Every HLC folded into this tab's state, so a write announced by another tab is read once, not the whole log. */
  private applied = new Set<string>();
  /**
   * A local change to a field is stamped past the field's current stamp, so the edit always wins the field (round eight,
   * 4; round sixty), however far ahead that stamp is, and flagged as made past it (`hlcPast`, round sixty-one).
   *
   * The rule that makes the writer and its peers agree (round sixty-one, decision 1). A field's stamp far ahead is either
   * right (this clock was set back) or a fast clock's (this device's, or a peer's folded before its arrival was known).
   * This clock cannot tell which, so the edit is placed just past it and shows here at once. Every device then judges
   * every stamp by the same facts: a stamp read from a clock is parked when it is more than two days past the arrival of
   * the batch that carried it, on every device, this one included (the engine learns its own batches' arrivals from the
   * listing); a stamp made past another carries the flag in its counter and is never held or parked, since it says only
   * that the edit came after what it replaced, not what any clock read (`isPastStamp`). So the fast clock's old stamp
   * is parked everywhere alike, and the edit made after the clock was put right shows everywhere alike, though its stamp
   * is as far ahead as the one it was placed after; a later edit on any device is placed past it in turn. The edit-time
   * rebase of round sixty (`staleOwn`) is gone: it parked one stamp before the write, in its own transaction, and its
   * three faults went with it (the clock review's 1, 2, 5 and 6).
   */
  private stampPast(changes: Change[]): Change[] {
    const given = new Set<string>(); // the stamps given out in this commit: two fields bumped past stamps that differ only by writer must not land on one stamp (round twelve, 4)
    for (const c of changes) {
      const k = recKey(c.kind, c.id);
      let prev = this.seen.get(k + '\0' + c.field); // the fold's own key: record, NUL, field
      // Whether a record is deleted is decided against its latest edit to any field, so a removal must clear that too.
      if (c.field === '_deleted') { const e = this.seen.get(k + '\0*'); if (e !== undefined && (prev === undefined || hlcCompare(e, prev) > 0)) prev = e; }
      // A peer's change to this field that the fold is holding (stamped far ahead by a wrong clock) would take the field
      // when it comes due; an edit made here in the meantime is stamped past it instead, since the person saw the field as it is (round forty-nine, 1).
      // But only past one within a day of the corrected clock (a clock a few hours wrong): a stamp years ahead is a broken
      // clock's, not an edit to defer to, and stamping past it would carry the bad clock to this device and to every
      // device that then held this edit too (round fifty-one, 1). Such an edit is stamped at real time and shows
      // everywhere at once; the held change, when it comes due, is the last word then.
      const heldT = this.seen.get(k + '\0held\0' + c.field);
      if (heldT !== undefined && hlcWall(heldT) <= nowMs() + FOLLOW_HELD_MS && (prev === undefined || hlcCompare(heldT, prev) > 0)) prev = heldT;
      // The edit always takes the field (round sixty; three reviews: an edit stored and never shown). Rounds fifty-one and
      // fifty-two stamped at real time when the field's stamp was a day or more ahead, so that a corrected device would
      // not carry its old fast clock on; but a clock set BACK makes a right stamp look ahead too, and the edit was stored
      // under it and lost, silently, on every device. The two cannot be told apart by this clock alone, so the edit is
      // stamped just past the field's stamp, flagged (see above).
      if (prev !== undefined && hlcCompare(c.t, prev) <= 0) c.t = hlcPast(prev, this.writer);
      // A field left at real time keeps its stamp; only an actual collision moves: with a stamp given out in this commit, or with
      // one already in the fold (two commits bumped past the same held stamp, round thirteen, 7), since the store refuses a repeat.
      while (given.has(c.t) || this.applied.has(c.t)) c.t = hlcAfter(c.t, this.writer);
      given.add(c.t);
    }
    return changes;
  }

  /** Upsert any record kind from a plain object. Only changed fields are written. */
  async put(kind: Kind, id: string, fields: Record<string, unknown>): Promise<void> {
    await this.commit(this.putChanges(kind, id, fields));
  }
  /**
   * A record edit, the lines it stands for and the other records it touches, in one commit (round fifty-one, 3): the
   * plant edit form wrote the place, then the move line, then the rename note, then the acquired line, and a page closed
   * between any two left a move with no line or a line with no move. Each entry of `also` is another record's fields;
   * each of `events` a line on the timeline.
   */
  async putWith(kind: Kind, id: string, fields: Record<string, unknown>, events: Array<Omit<PlantEvent, 'id'>> = [], also: Array<{ kind: Kind; id: string; fields: Record<string, unknown> }> = []): Promise<void> {
    const changes = this.putChanges(kind, id, fields);
    for (const o of also) changes.push(...this.putChanges(o.kind, o.id, o.fields));
    for (const e of events) {
      const eid = this.eventId();
      changes.push(...diff('event', eid, { ...e, id: eid } as unknown as Record<string, unknown>, undefined, this.tick));
    }
    await this.commit(changes);
  }
  private putChanges(kind: Kind, id: string, fields: Record<string, unknown>): Change[] {
    const current = this.state.get(recKey(kind, id));
    // A notes edit says which text it was based on (the stamp of the notes it saw), so a device that receives it can tell
    // an edit made in sight of its text from one made blind to it, and log only the second (round twenty-five, 2). The
    // caller may say the base itself (an editor opened before a pull); otherwise it is the text on screen now.
    let changes = diff(kind, id, fields, current, this.tick);
    const pair = NOTES_PAIR[kind];
    if (pair) {
      // The base goes out exactly when the notes do (round twenty-six, 2): a save that re-sends unchanged notes must not
      // record a base, and a real edit must carry one even when it equals the last one `diff` would have dropped. The base
      // is stamped right after the notes, by the same writer, which is how a reader pairs the two. A species' own notes
      // carry one too since round fifty-nine (`myNotesBase`), so its replaced texts are read from the log as a plant's are.
      const [notesField, baseField] = pair;
      const notesChange = changes.find((c) => c.field === notesField);
      changes = changes.filter((c) => c.field !== baseField);
      if (notesChange) {
        const base = baseField in fields ? (fields[baseField] as string | null) : this.notesStamp(kind as NotesKind, id);
        const at = changes.indexOf(notesChange);
        changes.splice(at + 1, 0, { t: this.tick(), kind, id, field: baseField, value: base ?? null });
      }
    }
    return changes;
  }
  /** The stamp of a record's current notes (a species' `myNotes`), null when none: what an edit to them is based on. */
  notesStamp(kind: NotesKind, id: string): string | null {
    return this.seen.get(recKey(kind, id) + '\0' + NOTES_PAIR[kind][0]) ?? null;
  }
  /** The stamps the fold is holding now: a peer's changes, stamped ahead of this clock, in the log and not yet in the state. */
  heldList(): string[] {
    return [...this.heldStamps];
  }
  /** This device's latest stamp among the fields' current values, read from the fold, not the log: the clock check's reading (round fifty-eight; it read the whole log on every open). */
  ownLatest(): string {
    let best = '';
    const followed = this.heldWalls();
    // A stamp made past another's (`isPastStamp`) says nothing of this clock: it is as far ahead as the field it was placed after (round sixty-one).
    for (const t of this.seen.values()) if (typeof t === 'string' && t.length > 18 && t[13] === '-' && this.isOwnStamp(t) && !followed.has(hlcWall(t)) && !isPastStamp(t) && hlcCompare(t, best) > 0) best = t; // the map holds a removal's '1' and '0' beside the stamps
    return best;
  }
  /** The wall times of the stamps held now: an own stamp on one of them was given just past a held change (stampPast), and is not this clock running ahead. */
  heldWalls(): Set<number> {
    return new Set([...this.heldStamps].map(hlcWall));
  }
  /** Whether a stamp was written by this device (any of its tabs). */
  isOwnStamp(t: string | null | undefined): boolean {
    return !!t && hlcDecode(t).device.startsWith(this.deviceId);
  }

  async remove(kind: Kind, id: string): Promise<void> {
    await this.commit([{ t: this.tick(), kind, id, field: '_deleted', value: true }]);
  }

  /**
   * Bring a removed record back. A plant or batch may come back to a number another one took while it was removed (a
   * peer minted it offline; the repair skips removed records): the one coming back yields, and takes the next free number
   * with a line on its page saying so, since the one that held the number on, live, may already have its label printed
   * (round fifty-nine; the round forty-one review, 5). Returns the change of number, if there was one, for the page to say.
   */
  async restore(kind: Kind, id: string): Promise<{ from: string; to: string } | null> {
    const back: Change = { t: this.tick(), kind, id, field: '_deleted', value: false };
    const rec = this.state.get(recKey(kind, id));
    if ((kind !== 'accession' && kind !== 'sowing') || !rec) { await this.commit([back]); return null; }
    // A record coming back yields its number only to a record made while it was away: one that held the number before
    // the removal (two devices gave it out offline) is the duplicate the grower already had, which the record pages offer
    // to renumber with the keeper chosen by first stamp; renumbering the restored one here reversed that choice, without
    // being asked (round sixty; the first outside review's 14). One commit: the return, the number and its line.
    const from = kind === 'accession' ? accNo(rec as unknown as Accession) : sowNo(rec as unknown as Sowing);
    const removedAt = this.seen.get(recKey(kind, id) + '\0_deleted');
    // Whether the other record came while this one was removed is read from the order in which the two reached this
    // device: the removal's row and the other record's first change's (round sixty-one; the records review's 12). The
    // stamps of a peer's first change and of this device's removal are two clocks: a peer four minutes fast was judged to
    // have made its plant after the removal when it made it before, and the note said so. The order of arrival is one
    // device's and says what this device saw: the number was another plant's here while this one was away. A record whose
    // arrival is not known (stored before the order was kept) is not judged: both keep the number, and the record pages
    // say it is shared and offer to renumber.
    const others = this.withNumber(kind, from).filter((o) => o.id !== id);
    let madeSince = false;
    if (removedAt && others.length) {
      const firsts = others.map((o) => this.born.get(recKey(kind, o.id))).filter((b): b is string => !!b);
      try {
        const at = await arrivalsOf([removedAt, ...firsts]);
        const gone = at.get(removedAt);
        madeSince = gone !== undefined && firsts.some((b) => (at.get(b) ?? -1) > gone);
      } catch {
        madeSince = false; // the order could not be read: nothing is judged, and the number is left shared
      }
    }
    if (!madeSince) { await this.commit([back]); return null; }
    const yearIn = /^(\d{4})-/.exec(from)?.[1];
    const taken = this.takenNumbers(kind);
    const to = kind === 'accession' ? nextAccession(taken, this.scheme, yearIn ? Number(yearIn) : new Date(nowMs()).getFullYear()) : nextAccession(taken, { mode: 'prefix', prefix: `S${(rec as unknown as Sowing).sown.slice(0, 4)}`, width: 3 });
    const what = kind === 'accession' ? 'plant' : 'batch';
    const eid = this.eventId();
    const ev: PlantEvent = { id: eid, acc: id, d: localDate(), t: 'note', note: `Renumbered from ${from} to ${to} when it was brought back: another ${what} numbered ${from} reached this device while this one was removed.` };
    const changes = [back, ...diff(kind, id, kind === 'accession' ? { acc: to } : { no: to }, rec, this.tick), ...diff('event', eid, ev as unknown as Record<string, unknown>, undefined, this.tick)];
    await this.commit(changes);
    return { from, to };
  }

  /** The next number, for the year of `acquired` when given: a plant acquired on 31 December filed at 00:05 is a 2026 plant, and the form's preview and the number it gets agree (round twenty-five, 4). */
  nextAccessionNumber(scheme: NumberingScheme = this.scheme, acquired?: string | null): string {
    return nextAccession(this.takenNumbers('accession'), scheme, yearOf(acquired));
  }
  /** How many plant numbers this device has ever given, removed plants included: a number is never reused. */
  get numbersIssued(): number {
    return this.takenNumbers('accession').size;
  }

  /** A new plant. Its number is minted, or taken from `acc` when the grower brings one; a number already in use is refused, never overwritten. */
  async addAccession(a: Omit<Accession, 'id' | 'status'> & { id?: string; status?: Accession['status'] }): Promise<Accession> {
    return (await this.addAccessions(1, a))[0];
  }

  /**
   * Several plants of one kind in one commit: all land, with consecutive numbers, or none does, so a full phone partway
   * through cannot leave two of five saved under a notice that says nothing was (round sixteen, 14; the eighth
   * reviewer's atomic fix). The number is chosen inside the vault's own transaction (see `appendChangesClaiming`): two
   * tabs adding at once get two runs of numbers. A number the grower brings goes on the first plant only; the rest are minted
   * as usual, and the form says so (round seventeen, 12).
   */
  async addAccessions(n: number, a: Omit<Accession, 'id' | 'status'> & { id?: string; status?: Accession['status'] }): Promise<Accession[]> {
    const wanted = a.acc?.trim() || null;
    const ids = Array.from({ length: Math.max(1, n) }, (_, i) => (i === 0 && a.id ? a.id : this.newId('r')));
    return this.claim('accession', (issued) => {
      const taken = new Set(issued); // grows as each number is minted, so the next is chosen against the batch so far
      const changes: Change[] = [];
      const result: Accession[] = [];
      for (const [i, id] of ids.entries()) {
        const no = i === 0 && wanted ? wanted : nextAccession(taken, this.scheme, yearOf(a.acquired));
        if (i === 0 && wanted && issued.has(no)) throw new Error(`Plant number ${no} is already used. A number is never reused; pick another.`);
        taken.add(no);
        const r: Accession = { status: 'growing', ...a, id, acc: no };
        changes.push(...diff('accession', id, r as unknown as Record<string, unknown>, undefined, this.tick));
        if (r.acquired) changes.push(...diff('event', this.eventId(), { acc: id, d: r.acquired, t: 'acquire', note: r.sourceFrom ? `from ${r.sourceFrom}` : null }, undefined, this.tick));
        result.push(r);
      }
      return { changes, result };
    });
  }

  /** A write that mints numbers: the vault hands `build` every number ever issued here, `build` chooses outside it, and the changes are stored and applied as one commit. */
  /** Claims run one at a time in this tab: the build reads the fold, and a second claim must see the first's result (a pot-up reading the pot) before it builds (round fifty-two, 3). */
  private claimChain: Promise<unknown> = Promise.resolve();
  private claim<T>(kind: NumberKind, build: (issued: Set<string>) => { changes: Change[]; result: T }): Promise<T> {
    const run = this.claimChain.then(() => this.claimNow(kind, build));
    this.claimChain = run.catch(() => undefined);
    return run;
  }
  private async claimNow<T>(kind: NumberKind, build: (issued: Set<string>) => { changes: Change[]; result: T }): Promise<T> {
    let made: Change[] = [];
    let out: T;
    try {
      out = await appendChangesClaiming(kind, this.takenNumbers(kind), (issued) => {
        const b = build(issued);
        const bad = b.changes.map((c) => changeError(c)).find((e) => e); // checked as every local write is (round fifty-eight)
        if (bad) throw new Error(bad);
        made = this.stampPast(b.changes);
        return b;
      });
    } catch (e) {
      this.lastWriteError = await writeErrorText(e);
      throw e;
    }
    this.lastWriteError = null;
    for (const c of made) { const k = numberField(c); if (k && typeof c.value === 'string') this.ledger[k].add(c.value); }
    this.foldSome(made);
    for (const fn of this.listeners) fn(made);
    return out;
  }

  async addEvent(e: Omit<PlantEvent, 'id'> & { id?: string }): Promise<PlantEvent> {
    const id = e.id ?? this.eventId();
    const rec: PlantEvent = { ...e, id };
    await this.put('event', id, rec as unknown as Record<string, unknown>);
    return rec;
  }

  /**
   * An event and the record change it stands for, in one commit: a death is the event and the status, an archive is the
   * status and its line, and a page closed between two commits left one without the other (round forty-nine, 1).
   */
  async addEventWith(e: Omit<PlantEvent, 'id'>, kind: 'accession' | 'sowing', id: string, fields: Record<string, unknown>): Promise<PlantEvent> {
    const eid = this.eventId();
    const rec: PlantEvent = { ...e, id: eid };
    const changes = diff(kind, id, fields, this.state.get(recKey(kind, id)), this.tick);
    changes.push(...diff('event', eid, rec as unknown as Record<string, unknown>, undefined, this.tick));
    await this.commit(changes);
    return rec;
  }

  /**
   * Move plants to a place (or to none), each with its line on the timeline, in one commit (round forty-nine, 1 and 3):
   * a place's "Move plants here" moves a benchful at once, and a plant's own Move was two commits.
   */
  async movePlants(ids: string[], locationId: string | null): Promise<number> {
    return (await this.movePlantsUndoable(ids, locationId)).n;
  }
  /**
   * The same, with the way back: each plant's place as it was and the lines written, so one Undo puts the plants back
   * and removes exactly those lines, in one commit (round fifty-one, 4). A plant moved on since the move is left where it is.
   */
  async movePlantsUndoable(ids: string[], locationId: string | null): Promise<{ n: number; undo: () => Promise<void> }> {
    const changes: Change[] = [];
    const back: Array<{ id: string; locationId: string | null; line: string | null }> = [];
    for (const id of ids) {
      const cur = this.state.get(recKey('accession', id));
      if (!cur || cur._deleted || (cur.locationId ?? null) === locationId) continue;
      const line = locationId ? this.eventId() : null;
      back.push({ id, locationId: (cur.locationId as string | null) ?? null, line });
      changes.push(...diff('accession', id, { locationId }, cur, this.tick));
      if (line) changes.push(...diff('event', line, { acc: id, d: localDate(), t: 'move', note: `to ${this.locationName(locationId!)}` }, undefined, this.tick));
    }
    if (changes.length) await this.commit(changes);
    const undo = async () => {
      const cs: Change[] = [];
      for (const b of back) {
        const cur = this.state.get(recKey('accession', b.id));
        if (!cur || cur._deleted || (cur.locationId ?? null) !== locationId) continue; // moved on since: left there, and its line with it
        cs.push(...diff('accession', b.id, { locationId: b.locationId }, cur, this.tick));
        // Only the line of a plant put back goes: a plant moved on since keeps "to X", or its log skips a place it was in (round sixty-one; the records review, 14).
        if (b.line && this.state.get(recKey('event', b.line))?._deleted !== true) cs.push({ t: this.tick(), kind: 'event', id: b.line, field: '_deleted', value: true });
      }
      if (cs.length) await this.commit(cs);
    };
    return { n: back.length, undo };
  }

  /** One commit for many events (watering a whole bench): all land or none do. */
  async addEvents(list: Array<Omit<PlantEvent, 'id'>>): Promise<number> {
    return (await this.addEventsIds(list)).length;
  }
  /** The same, returning the ids written, so a place-wide action can be undone by removing exactly those lines (round twenty-six, 5). */
  async addEventsIds(list: Array<Omit<PlantEvent, 'id'>>): Promise<string[]> {
    const changes: Change[] = [];
    const ids: string[] = [];
    for (const e of list) {
      const id = this.eventId();
      ids.push(id);
      const rec = { ...e, id } as unknown as Record<string, unknown>;
      changes.push(...diff('event', id, rec, undefined, this.tick));
    }
    await this.commit(changes);
    return ids;
  }
  /** Remove several events in one commit: all go or none do. */
  async removeEvents(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.commit(ids.map((id) => ({ t: this.tick(), kind: 'event' as const, id, field: '_deleted', value: true })));
  }

  /** The numbering scheme, as a synced setting record. */
  async setScheme(s: NumberingScheme): Promise<void> {
    await this.put('setting', NUMBERING_SETTING, { scheme: s });
  }

  /**
   * Bulk append of already-formed changes. Say where they came from: an import
   * still has to be pushed; a sync pull does not. Everything is checked before
   * anything is stored, and stored before anything is applied: a bad batch or
   * a refused write throws and changes nothing in memory. It throws only for
   * the batch itself: the duplicate-number repair that follows is a separate
   * write, and if the vault refuses that one the batch stays stored and
   * applied, `lastWriteError` says so, and the repair runs again on the next
   * ingest.
   */
  async ingest(incoming: Change[], source: 'import' | 'server' = 'import', opts: { requireKey?: string } = {}): Promise<void> {
    // A change of a type its field never takes is left out and said, and the rest are folded, rather than the file or the
    // batch refused whole (round twenty-nine, 2).
    const { changes, dropped } = readChanges(incoming);
    if (dropped.length) console.warn(`${dropped.length} change${dropped.length === 1 ? '' : 's'} left out of this ${source === 'server' ? 'batch' : 'file'}:`, dropped.slice(0, 5));
    if (!changes.length) return;
    for (const c of changes) this.clock?.observe(c.t);
    await this.commit(changes, source, opts.requireKey);
    // A text of a plant's or batch's notes that this merge replaced unseen is not written anywhere: it stays in the log,
    // and the record's page reads it from there (`replacedNotes`; round fifty-eight, rule 5). Nor is a number two
    // records now share repaired here: a merge writes what arrived and nothing more, and the record's page says the
    // number is shared and offers "Renumber now" (round fifty-nine; the round forty-one and independent reviews).
  }

  /** The texts of a plant's or batch's notes an edit replaced without having seen them, read from the log (src/lib/core/notes.ts). */
  async replacedNotes(kind: NotesKind, id: string): Promise<ReplacedNotes[]> {
    // What the fold has not applied (a peer's change held for its clock, or parked) has replaced nothing on screen yet (round fifty-nine).
    const skip = new Set([...this.heldStamps, ...this.parkedStamps]);
    const [field, baseField] = NOTES_PAIR[kind];
    return replacedNotesIn(await changesOf(kind, id), { field, baseField, skip });
  }
  /**
   * Records sharing a number, by kind and number: a duplicate the merge's repair has not written yet (a write that failed,
   * or numbers from before the ledger). Read only; the record's page says so and offers the repair (round fifty-six, 3).
   */
  private sharedNumbers = $derived.by(() => {
    const out = new Map<string, string[]>();
    const add = (kind: string, no: string, id: string) => { const k = kind + '\0' + no; const xs = out.get(k); if (xs) xs.push(id); else out.set(k, [id]); };
    for (const a of this.accessionsSorted) add('accession', accNo(a), a.id);
    for (const s of this.sowingsSorted) add('sowing', sowNo(s), s.id);
    for (const [k, ids] of out) if (ids.length < 2) out.delete(k);
    return out;
  });
  /**
   * Every live record under a number people see, in the order the repair keeps them (the record made first, first): a
   * number two devices gave out offline names two records until the grower renumbers one, and a link or a typed number
   * must not pick one of them by load order (round sixty; three reviews).
   */
  withNumber(kind: 'accession' | 'sowing', no: string): Array<Accession | Sowing> {
    const ids = this.sharedNumbers.get(kind + '\0' + no);
    if (!ids) { const one = kind === 'accession' ? this.accession(no) : this.sowing(no); return one ? [one] : []; }
    return ids.map((x) => (kind === 'accession' ? this.accession(x) : this.sowing(x))).filter((r): r is Accession | Sowing => !!r).sort((a, b) => this.keeperOrder(kind, a, b));
  }
  /** The other live records with this record's number. */
  sharesNumber(kind: 'accession' | 'sowing', id: string): string[] {
    const r = kind === 'accession' ? this.accession(id) : this.sowing(id);
    if (!r) return [];
    const no = kind === 'accession' ? accNo(r as Accession) : sowNo(r as Sowing);
    return (this.sharedNumbers.get(kind + '\0' + no) ?? []).filter((x) => x !== r.id);
  }
  /**
   * The duplicate-number repair for one number: the record page's "Renumber now", the grower's own ask. True when nothing
   * under that number is shared any more; false when the repair's write was refused (commit() says why in `lastWriteError`).
   */
  async repairNumbers(only: { kind: 'accession' | 'sowing'; no: string }): Promise<boolean> {
    const scope = { accession: new Set<string>(), sowing: new Set<string>() };
    scope[only.kind].add(only.no);
    try {
      await this.resolveDuplicateNumbers(scope);
      return true;
    } catch {
      return false; /* the duplicate stays visible on its record's page, with the button, until a repair lands */
    }
  }
  /** Which record under a shared number keeps it: the one made first, by its first stamp, which every device reads the same from the same log; by id when the stamps tie (round fifty-eight). */
  private keeperOrder(kind: 'accession' | 'sowing', a: { id: string }, b: { id: string }): number {
    const ta = this.born.get(recKey(kind, a.id)), tb = this.born.get(recKey(kind, b.id));
    if (ta && tb && ta !== tb) return hlcCompare(ta, tb);
    return a.id.localeCompare(b.id);
  }
  /** Under this record's number: which record keeps it and which the repair renumbers, as the repair will choose. Null when the number is not shared. */
  numberPlan(kind: 'accession' | 'sowing', id: string): { keeper: string; renumbered: string[] } | null {
    const others = this.sharesNumber(kind, id);
    if (!others.length) return null;
    const recs = [id, ...others].map((x) => ({ id: x })).sort((a, b) => this.keeperOrder(kind, a, b));
    return { keeper: recs[0].id, renumbered: recs.slice(1).map((r) => r.id) };
  }

  /**
   * Two devices offline at once can each mint the same next number for
   * different plants. They are different records (different identities), so
   * nothing is lost; when the grower asks ("Renumber now" on the record's
   * page; a merge no longer repairs on its own, round fifty-nine) the one
   * recorded later is given the next free number and a note says so. Every
   * device derives the same repair
   * from the same merged log: the same number (lowest free under the synced
   * scheme), the same note, and the same timestamps (one millisecond after the
   * record's latest change, tagged from the record's identity rather than
   * from this device's clock), so two devices that both run it write the
   * same changes and the log holds one note, not two.
   */
  async resolveDuplicateNumbers(scope?: { accession: Set<string>; sowing: Set<string> }): Promise<number> {
    const changes: Change[] = [];
    let renumbered = 0;
    for (const kind of ['accession', 'sowing'] as const) {
      const byNo = new Map<string, Array<Accession | Sowing>>();
      for (const r of kind === 'accession' ? this.accessions : this.sowings) {
        const no = kind === 'accession' ? accNo(r as Accession) : sowNo(r as Sowing);
        byNo.set(no, [...(byNo.get(no) ?? []), r]);
      }
      // From the log alone, never this device's ledger: every device must derive the same repair from the same merged log (round eight, 5).
      const taken = this.takenNumbers(kind, false);
      for (const no of [...byNo.keys()].sort()) {
        if (scope && !scope[kind].has(no)) continue;
        const recs = byNo.get(no)!;
        if (recs.length < 2) continue;
        recs.sort((a, b) => this.keeperOrder(kind, a, b)); // the one made first keeps the number
        for (const r of recs.slice(1)) {
          const rec = this.state.get(recKey(kind, r.id))!;
          const base = hlcDecode(rec._t);
          const wall = base.wall + 1;
          const when = new Date(wall);
          // The year of the number being replaced, so a plant minted 2026-0007 is repaired to 2026-0008, not into its acquisition year (round fifteen, 14); the stamp's year when the number carries none.
          const yearIn = /^(\d{4})-/.exec(no)?.[1];
          const fresh = kind === 'accession' ? nextAccession(taken, this.scheme, yearIn ? Number(yearIn) : when.getUTCFullYear()) : nextAccession(taken, { mode: 'prefix', prefix: `S${(r as Sowing).sown.slice(0, 4)}`, width: 3 });
          taken.add(fresh);
          // The tag is a function of the record AND the number chosen, and no real device id starts with 'zz': two devices that
          // derive the same repair write identical changes (one in the log), and two that chose differently (one of them
          // repaired from a log still missing a batch) write distinct stamps, which the ordinary merge settles the same way
          // everywhere, instead of two values under one stamp (round twelve, 3).
          const device = ('zz' + tag36(kind + ':' + r.id + ':' + fresh)).slice(0, 16);
          const stamp = (count: number) => hlcEncode({ wall, count, device });
          // A repair already in the log (folded, or stored and held because its stamp is ahead of this clock) is not
          // minted again: the store would refuse the repeat stamp on every pull (round thirteen, 7).
          // The fold's own stamp map and the held inventory too: a snapshot load has not read the stamps it restored (the first reviewer's finding 11).
          if (this.applied.has(stamp(0)) || this.heldStamps.has(stamp(0)) || this.seen.get(recKey(kind, r.id) + '\0' + (kind === 'accession' ? 'acc' : 'no')) === stamp(0)) continue;
          changes.push({ t: stamp(0), kind, id: r.id, field: kind === 'accession' ? 'acc' : 'no', value: fresh });
          const eid = 'e' + wall.toString(36) + '00' + device;
          // The day is taken in UTC, not the reader's zone: two devices in different zones must write the identical note, or the one that arrives second wins by chance.
          const note = { acc: r.id, d: when.toISOString().slice(0, 10), t: 'note', note: `Renumbered from ${no} to ${fresh}: another ${kind === 'accession' ? 'plant' : 'batch'}, recorded first, had been given ${no} (on another device, or in a file merged in).` };
          let count = 1;
          for (const [field, value] of Object.entries(note)) changes.push({ t: stamp(count++), kind: 'event', id: eid, field, value });
          renumbered++;
        }
      }
    }
    if (changes.length) {
      for (const c of changes) this.clock?.observe(c.t);
      await this.commit(changes, 'local');
    }
    return renumbered;
  }

  /** Everything, for export and for sync. */
  async exportChanges(): Promise<Change[]> {
    return allChanges();
  }
}

export const collection = new Collection();
