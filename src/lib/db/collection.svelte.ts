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
const yearOf = (d?: string | null): number | undefined => (d && /^\d{4}-/.test(d) ? Number(d.slice(0, 4)) : undefined);
import { Clock, hlcDecode, hlcEncode, hlcCompare, hlcAfter, hlcBefore, nowMs, clockOffsetMs } from '$core/hlc';

/** How far ahead of the corrected clock a held stamp may be for a local edit to its field to be stamped just past it (round fifty-one, 1). */
export const FOLLOW_HELD_MS = 86_400_000;
import { tag36 } from '$core/tag';
import { apply, diff, readChanges, isComplete, isHeld, REQUIRED_FIELDS, KINDS, FOLD_RULES, incomplete as incompleteRecords, key as recKey, type Change, type Kind, type Record_, type State, type Hold, hlcWall } from '$core/log';
import { nextAccession, DEFAULT_SCHEME, type NumberingScheme } from '$core/accession';
import { allChanges, appendChanges, appendChangesClaiming, onOtherTabWrite, deviceId, requestPersistence, getMeta, setMeta, putPhotoBlobs, getPhotoBlobs, deletePhotoBlobs, holdVault, readFold, writeFold, parkStamps, foldGen, lastArrival, arrivalsAfter, changesByKeys, type FoldSnapshot, type NumberKind, type VaultNotice } from './vault';
import { version as buildVersion } from '$app/environment';
import type { Accession, PlantEvent, Taxon, Location, Sowing, Provenance, Photo } from './types';
import { PROP_METHODS, accNo, sowNo, NUMBERING_SETTING } from './types';
import { slugify } from '$core/names';
import { mySpeciesOf, type MySpecies } from './species-list';

export { NUMBERING_SETTING };

const isScheme = (s: unknown): s is NumberingScheme => !!s && typeof s === 'object' && ((s as NumberingScheme).mode === 'year' || (s as NumberingScheme).mode === 'prefix') && typeof (s as NumberingScheme).width === 'number';

/** A short, deterministic tag for a string: two 32-bit FNV-1a hashes in base 36 (up to 14 characters, [a-z0-9]). */

const byDay = (a: { d: string; id: string }, b: { d: string; id: string }) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id);
const numberField = (c: Change): NumberKind | null => (c.kind === 'accession' && c.field === 'acc' ? 'accession' : c.kind === 'sowing' && c.field === 'no' ? 'sowing' : null);

class Collection {
  ready = $state(false);
  persisted = $state<boolean | null>(null);
  /** The last vault write that failed, as a sentence, or null once a write has succeeded again. Pages show it; the edit it describes was not stored and is not shown. */
  lastWriteError = $state<string | null>(null);
  /** The scheme this device kept in `meta` before the scheme was a synced setting; read only when the log has no setting record. */
  private metaScheme = $state<NumberingScheme | null>(null);
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
    return { now: nowMs(), except: this.device, arrival, parked: this.parkedStamps, onParked: (c) => this.notePark(c) };
  }
  private notePark(c: Change): void {
    this.parkedStamps.add(c.t);
    const k = recKey(c.kind, c.id);
    const list = this.parkedByRecord.get(k) ?? [];
    if (!list.some((x) => x.t === c.t)) { list.push(c); this.parkedByRecord.set(k, list); this.parkedByRecord = new Map(this.parkedByRecord); }
  }
  /** Parked changes for one record, latest per field, not yet applied or dismissed here. */
  parkedFor(kind: Kind, id: string): Change[] {
    const list = (this.parkedByRecord.get(recKey(kind, id)) ?? []).filter((c) => !this.parkedDone.has(c.t));
    const latest = new Map<string, Change>();
    for (const c of list) { const h = latest.get(c.field); if (!h || hlcCompare(c.t, h.t) > 0) latest.set(c.field, c); }
    return [...latest.values()];
  }
  /** Every record with parked changes still listed, named as well as the parked values allow: the sync page lists them, since a record created under a wrong clock has no page of its own to list them on (round fifty-two, 1). */
  parkedList(): Array<{ kind: Kind; id: string; label: string; fields: string[] }> {
    const out: Array<{ kind: Kind; id: string; label: string; fields: string[] }> = [];
    for (const [k, list] of this.parkedByRecord) {
      const live = list.filter((c) => !this.parkedDone.has(c.t));
      if (!live.length) continue;
      const kind = live[0].kind, id = live[0].id;
      const v = (f: string) => { const c = live.filter((x) => x.field === f).sort((a, b) => hlcCompare(b.t, a.t))[0]; return c ? String(c.value ?? '') : ''; };
      const rec = this.state.get(k);
      const label = kind === 'accession' ? [v('acc') || (rec?.acc as string) || '', v('taxonName') || (rec?.taxonName as string) || ''].filter(Boolean).join(' ') : kind === 'sowing' ? [v('no') || (rec?.no as string) || '', v('taxonName') || (rec?.taxonName as string) || ''].filter(Boolean).join(' ') : kind === 'location' ? v('name') || (rec?.name as string) || id : kind === 'event' ? `a log line (${v('t') || (rec?.t as string) || 'entry'}, ${v('d') || (rec?.d as string) || ''})` : `${kind} ${id}`;
      out.push({ kind, id, label: label || `${kind} ${id}`, fields: [...new Set(live.map((c) => c.field))] });
    }
    return out;
  }
  /** Records with parked changes still listed, for the sync page's count. */
  get parkedRecords(): number {
    let n = 0;
    for (const list of this.parkedByRecord.values()) if (list.some((c) => !this.parkedDone.has(c.t))) n++;
    return n;
  }
  /** Apply a record's parked changes as edits made now: the same values, stamped by the corrected clock, so every device takes them; the parked stamps stay parked. */
  async applyParked(kind: Kind, id: string): Promise<void> {
    const list = this.parkedFor(kind, id);
    if (!list.length) return;
    const fields: Record<string, unknown> = {};
    for (const c of list) if (c.field !== '_deleted') fields[c.field] = c.value;
    const removal = list.find((c) => c.field === '_deleted' && c.value === true);
    if (Object.keys(fields).length) await this.put(kind, id, fields);
    if (removal) await this.remove(kind, id);
    await this.dismissParked(kind, id);
  }
  async dismissParked(kind: Kind, id: string): Promise<void> {
    for (const c of this.parkedByRecord.get(recKey(kind, id)) ?? []) this.parkedDone.add(c.t);
    this.parkedByRecord = new Map(this.parkedByRecord);
    await setMeta('parkedDone', [...this.parkedDone]);
  }
  /** The engine parks changes by their batch's arrival before they reach the fold: noted here so the fold never folds them later. */
  async markParked(changes: Change[]): Promise<void> {
    for (const c of changes) this.notePark(c);
    // The parked set is an input to the fold: the stamps are stored and the snapshot dropped in one transaction, and the
    // other tabs are told to fold again, since one of them may have folded the change as ordinary a moment before
    // (round fifty-four, 2; round fifty-five, 2; the first reviewer's findings 6 and 7).
    for (const t of await parkStamps(changes.map((c) => c.t))) this.parkedStamps.add(t);
  }
  private async saveParked(): Promise<void> {
    // Parked by the fold itself (a stamp two days past the clock): the same on every fold of the log, so the snapshot stands; stored as a union with the other tabs' stamps.
    for (const t of await parkStamps([...this.parkedStamps], false)) this.parkedStamps.add(t);
  }
  /** The parked set as stored, merged into this tab's: another tab may have parked since this one read it (round fifty-five, 2). */
  private async rereadParked(): Promise<void> {
    for (const t of (await getMeta<string[]>('parked')) ?? []) this.parkedStamps.add(t);
    for (const t of (await getMeta<string[]>('parkedDone')) ?? []) this.parkedDone.add(t);
  }
  /** Photographs whose removal this device has seen: their upload record is not trusted until the server is asked (round fifty-two, 2). */
  private photosUnverified = new Set<string>();
  private async noteUnverified(ids: string[]): Promise<void> {
    for (const id of ids) this.photosUnverified.add(id);
    await setMeta('photosUnverified', [...this.photosUnverified]);
  }
  unverifiedPhotos(): string[] {
    return [...this.photosUnverified];
  }
  async verifiedPhotos(ids: string[]): Promise<void> {
    if (!ids.length) return;
    for (const id of ids) this.photosUnverified.delete(id);
    await setMeta('photosUnverified', [...this.photosUnverified]);
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
        const scheme = await getMeta<NumberingScheme>('scheme');
        if (isScheme(scheme)) this.metaScheme = scheme;
        await this.readLedger();
        // Two records under one number from before the ledger, or from a merge whose repair failed to store, were carried
        // across every reload: a merge and a pull repair duplicates, a load did not, and the plant's page answered to the
        // first of the two for good (round thirty-eight, R2-1). The same deterministic repair runs here, before the pages read.
        await this.repairNumbers();
        this.ready = true;
        // Plants an earlier build's import brought back nameless (a tombstone, then its `importedOn`) are removed again,
        // once: the removal is a change like any other, so it syncs, and after it nothing matches again (round sixteen, 5).
        // The repair judges a record's whole history: over the tail of a snapshot load it saw a tombstone and an
        // `importedOn` and not the real edit folded before them, and removed a plant the grower had revived, and the
        // removal synced (round fifty-four, 2; the second reviewer's finding 5). A record the tail touches with an
        // `importedOn` is read whole from the vault; a whole-log load has every change already.
        // Since round fifty-five this is a rule of the fold, not a repair written at load: an `importedOn` is not an edit, so
        // a removal followed only by one stays a removal on every device and every path, and no reading of the log writes
        // to it (FOLD_RULES 2; the first reviewer's finding 10). The removals written by earlier builds stay in the log, harmlessly.
        void changes;
        // The oldest shape gave a plant or a batch its number as its id and no `acc`/`no` field; readers have carried both
        // shapes since. A load writes the number as a field, once, as an ordinary change that syncs, so every record is
        // one shape and the dual paths can go (round forty-one, R4). `accNo`/`sowNo` keep reading either, for files in flight.
        // The written number is a machine's reading of the record, so it must never beat a person's: it is stamped just
        // below the record's oldest change, where any edit to the number, by anyone, before or after, outranks it; a record
        // whose log holds a number change already (held, or a `null` the fold shows as missing) is left alone, and so is an
        // incomplete one, which a later build may yet give its shape (round forty-nine, 1; round thirty-five, R1-1).
        const oneShape: Change[] = [];
        // Nor while a batch is set aside unread: it may hold the record's number, and a written number stamped below what
        // this build can see would still outrank it (round fifty-two, 4; the first reviewer's finding 11). The pass runs again at a later load.
        const syncMeta = await getMeta<{ quarantined?: unknown[] }>('sync');
        const batchesSetAside = !!syncMeta?.quarantined?.length;
        // A record whose log holds a number change, held or null, is left alone: the fold's own stamp map says which
        // (a load from the snapshot has not read every change, so the changes themselves are not scanned; round fifty-three, 1).
        // And a parked number change, which never reaches the stamp map: the previous build read the changes themselves
        // and left such a record alone; this one wrote a second number over it (round fifty-four, 2; both reviewers).
        const numbered = (k: string, field: string) => this.seen.has(k + '\0' + field) || this.seen.has(k + '\0held\0' + field) || (this.parkedByRecord.get(k) ?? []).some((c) => c.field === field);
        for (const r of this.state.values()) {
          const k = recKey(r.kind, r.id);
          if (r._deleted || !isComplete(r)) continue;
          const first = this.born.get(k);
          if (!first) continue;
          if (r.kind === 'accession' && r.acc == null && !numbered(k, 'acc')) oneShape.push({ t: hlcBefore(first, this.writer), kind: 'accession', id: r.id, field: 'acc', value: r.id });
          if (r.kind === 'sowing' && r.no == null && !numbered(k, 'no')) oneShape.push({ t: hlcBefore(first, this.writer), kind: 'sowing', id: r.id, field: 'no', value: r.id });
        }
        if (oneShape.length && !batchesSetAside) await this.commit(oneShape, 'local').catch(() => {});
        if (heard === 'replaced') { if (typeof location !== 'undefined') location.reload(); }
        else if (heard === 'refold') void this.rebuild().catch(() => {});
        else if (heard === 'written') void this.catchUp().catch(() => {});
        this.persisted = await requestPersistence();
      })();
    return this.loading;
  }

  /**
   * The accession numbering scheme: a synced setting record (so every device
   * mints and repairs numbers the same way), else what this device kept in
   * `meta` before the setting existed, else the default.
   */
  get scheme(): NumberingScheme {
    const r = this.state.get(recKey('setting', NUMBERING_SETTING));
    const s = r && !r._deleted ? r.scheme : null;
    return isScheme(s) ? s : (this.metaScheme ?? DEFAULT_SCHEME);
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
    return this.live<Accession>('accession').find((a) => a.acc === idOrNo);
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
    await this.rereadParked(); // after the counter: a park since then moves it, and the snapshot this rebuild writes is refused
    const seq = await lastArrival();
    const changes = await allChanges();
    this.foldAll(changes);
    await this.flushParked();
    await this.readParked();
    this.loaded = { from: 'log', changes: changes.length };
    this.lastSeq = seq;
    await this.readLedger();
    this.foldWrite = this.saveFold(seq, gen);
  }

  /* ---- the fold and its snapshot ----
   * The fold is from the whole log once; after that it is kept as a snapshot
   * in the vault and brought up to date from the changes that arrived after
   * it, in arrival order (round fifty-three, 1; the reviewers' finding 25).
   * The snapshot is wrong, and the log folded again, when: the fold's rules
   * or the build are not this one's; it is another device's; the clock
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
  private parkedDirty = false;
  private async flushParked(): Promise<void> {
    if (!this.parkedDirty) return;
    this.parkedDirty = false;
    await this.saveParked();
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
  }
  /** Fold `changes` onto the state that is: what comes back held goes in the inventory; what was held and is applied leaves it. */
  private applyHere(changes: Change[]): void {
    const parkedBefore = this.parkedStamps.size;
    const held = apply(this.state, changes, this.seen, this.hold());
    if (this.parkedStamps.size !== parkedBefore) this.parkedDirty = true; // written by the load or the commit that folded, and awaited there: a save let go of was a lost park (round fifty-four, 2)
    for (const c of changes) this.heldStamps.delete(c.t);
    for (const c of held) this.heldStamps.add(c.t);
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
    this.parkedDone = new Set();
    await this.rereadParked();
    const seq = await lastArrival(); // before anything is read: a change stored after this number is folded again next time, which is harmless; one stored before it is in what is read
    const had = await readFold().catch(() => undefined);
    const f = had?.fold;
    const usable = !!f && f.rules === FOLD_RULES && f.build === buildVersion && f.device === this.deviceId && f.offset === clockOffsetMs() && had.gen === gen && Array.isArray(f.records) && Array.isArray(f.seen) && Array.isArray(f.born) && Array.isArray(f.parents) && Array.isArray(f.held);
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
    await this.flushParked();
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
    await this.flushParked();
    await this.readParked();
    this.loaded = { from: 'snapshot', changes: tail.changes.length, snapshot: f.changes };
    this.lastSeq = tail.seq;
    // A tail that has grown long is folded into a fresh snapshot, under the number of the tail it folded: written under the
    // old one, every later load folded the same tail again and rewrote the whole snapshot (round fifty-five, 2; both reviewers).
    if (tail.changes.length >= FOLD_REFRESH) this.foldWrite = this.saveFold(tail.seq, gen, f.changes + tail.changes.length);
    return changes;
  }
  /** The parked changes, read back by their stamps so each record's Apply stands after any load (round fifty-four, 2): few, and never in the snapshot's records. */
  private async readParked(): Promise<void> {
    // Every parked stamp, dismissed ones too: the one-shape pass must see a parked number change whether or not its Apply
    // was dismissed (the lists filter the dismissed out themselves; round fifty-five, 2; the first reviewer's finding 9).
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
      return await writeFold({ rules: FOLD_RULES, build: buildVersion, device: this.deviceId, offset: clockOffsetMs(), seq, records, seen, born, parents, held: [...this.heldStamps], last, changes: folded }, gen);
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
  /** A removed plant, by its number: its record stays in the log, and it can be brought back (round twenty-six, 4). */
  removedAccession(no: string): Accession | undefined {
    for (const r of this.state.values()) if (r.kind === 'accession' && r._deleted && (r as unknown as Accession).acc === no.trim()) return r as unknown as Accession;
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
  private taxaLive = $derived.by(() => this.live<Taxon>('taxon').filter((t) => !t.removed));
  get taxa(): Taxon[] {
    return this.taxaLive;
  }
  taxon(id: string): Taxon | undefined {
    const r = this.state.get(recKey('taxon', id));
    return r && !r._deleted && isComplete(r) ? (r as unknown as Taxon) : undefined;
  }
  /** Keep a species on your list without a plant of it (or stop). Diffed like any other write, so sync carries it unchanged. */
  async follow(slug: string, name: string, gbifKey: number | null | undefined, on: boolean): Promise<void> {
    // A taxon record a v2 overlay marked removed is brought back by following it; otherwise it would be followed and listed nowhere.
    await this.put('taxon', slug, { name, gbifKey: gbifKey ?? null, followed: on || null, ...(on ? { removed: null } : {}) });
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
  /** The earliest stamp seen for each record: the day it was made on this device or imported, whatever its id looks like (a v2 import keeps its v2 ids). */
  private born = new Map<string, string>();
  /** The local day a record was made or imported: the import day written on the record when it came in a file (a v2 import stamps its changes with the v2 edit times, years back), else the day in its id, else its first change. */
  madeOn(kind: Kind, id: string): string | null {
    const k = recKey(kind, id);
    const imp = this.state.get(k)?.importedOn;
    if (typeof imp === 'string') return imp;
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
  conditions(id: string): { indoor: boolean | null; floorC: number | null; floorHeld: boolean; ppfd: number | null; lightHours: number | null; lat: number | null; lon: number | null; altM: number | null; from: Record<string, string> } {
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
    return { indoor: g('indoor') as boolean | null, floorC: g('floorC') as number | null, floorHeld: !!floorFrom?.floorHeld, ppfd: g('ppfd') as number | null, lightHours: g('lightHours') as number | null, lat: g('lat') as number | null, lon: g('lon') as number | null, altM: g('altM') as number | null, from };
  }
  /** Growing plants at a node (deep: including every node beneath it). A plant whose own place was removed counts at the nearest place above it. */
  plantsAt(id: string, deep = true): Accession[] {
    const ids = new Set(deep ? this.subtree(id) : [id]);
    return this.accessions.filter((a) => a.status === 'growing' && a.locationId && ids.has(this.placeOf(a.locationId) ?? ''));
  }
  /** Free-text locations still on plants, with counts, for one-click conversion. */
  get legacyLocations(): Array<{ text: string; n: number }> {
    const m = new Map<string, number>();
    for (const a of this.accessions) if (!a.locationId && a.location) m.set(a.location, (m.get(a.location) ?? 0) + 1);
    return [...m.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n);
  }
  /** A new place. Its identity is minted, never derived from the name: two shelves called "Shelf 1" in different rooms are two places. */
  async addLocation(l: Omit<Location, 'id'> & { id?: string }): Promise<Location> {
    if (l.parentId && !this.location(l.parentId)) throw new Error('That parent place does not exist.');
    const id = l.id ?? 'l' + this.eventId().slice(1);
    const rec: Location = { ...l, id };
    await this.put('location', id, rec as unknown as Record<string, unknown>);
    return rec;
  }
  /** Turn a free-text location into a node and move every plant that used the text. */
  async convertLegacyLocation(text: string, parentId: string | null = null): Promise<Location> {
    const loc = await this.addLocation({ name: text, parentId, type: 'shelf' });
    const changes: Change[] = [];
    for (const a of this.accessions) if (!a.locationId && a.location === text) changes.push({ t: this.tick(), kind: 'accession', id: a.id, field: 'locationId', value: loc.id });
    await this.commit(changes);
    return loc;
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
    return this.live<Sowing>('sowing').find((x) => x.no === idOrNo);
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
  /** A watering dated after today (a line typed ahead, a v2 import's date): not the last watering, and not "none recorded" either; said on its own (round fifty-four, 4). The earliest such date. */
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
  /** Growing plants not watered, or not recorded as watered, for `DUE_DAYS` days or more. Derived once per change and per day, not scanned on every read: Today, the chip and the list each read it per render (round fifty-two, 5). */
  // A plant whose watering is dated ahead of today is not due: one reading of it on every surface (round fifty-five, 5; the first reviewer's finding 5).
  private dueList = $derived.by(() => { void this.eventsByAcc; void day.current; return this.accessions.filter((a) => a.status === 'growing' && this.careDays(a) >= DUE_DAYS && !this.wateringAhead(a.id)); });
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
  /** Last time each plant was marked present at an audit (or acquired), for "not seen since". */
  /** The last day the plant was in front of the grower: its last audit, else the day its record was made (not the acquisition date it was given, which may be years back for a collection entered late). */
  lastSeen(acc: string): string | null {
    return this.sighting(acc).seen;
  }
  /** The last audit at which the plant was looked for and not found, if nothing since has put it in front of the grower. */
  missedAt(acc: string): string | null {
    return this.sighting(acc).missed;
  }
  /**
   * What the log says last about the plant being in front of the grower, read in the log's own order (date, then id,
   * newest first) rather than by comparing dates: a watering at 09:00 and an audit miss at 17:00 the same day are two
   * lines, and the later one is the answer (round twenty-four, 3). A line the grower did not write about this plant
   * (`auto`: a place removed, a rename, a place-wide watering, the number repair) is not a sighting, nor is an event
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
   * 'import' (a backup or v2 file: not an edit, but the server has never seen
   * it, so it is pushed too), 'server' (came down through sync: already there).
   */
  private async commit(changes: Change[], source: 'local' | 'import' | 'server' = 'local', requireKey?: string): Promise<void> {
    if (!changes.length) return;
    if (source === 'local') this.stampPast(changes);
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
        this.lastWriteError = null;
        await this.rebuild();
        if (source !== 'server') for (const fn of this.listeners) fn(changes);
        return;
      }
    } catch (e) {
      this.lastWriteError = e instanceof Error ? e.message : String(e);
      throw e;
    }
    this.lastWriteError = null;
    if (!changes.length) return;
    this.foldSome(changes);
    await this.flushParked();
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
  /** A local change to a field whose current stamp is ahead of this clock (made while a clock was fast) is stamped just past that stamp, so the edit wins the field without following the bad clock (round eight, 4). */
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
      // Nor past this device's own stamp from when its clock was wrong: a corrected device went on stamping just past
      // its year-ahead stamps, so every edit was held everywhere again (round fifty-two, 1). The edit is stamped now;
      // the old stamp is parked on the next rebuild.
      if (prev !== undefined && hlcWall(prev) > nowMs() + FOLLOW_HELD_MS) prev = undefined;
      if (prev !== undefined && hlcCompare(c.t, prev) <= 0) c.t = hlcAfter(prev, this.writer);
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
    if (kind === 'accession' || kind === 'sowing') {
      // The base goes out exactly when the notes do (round twenty-six, 2): a save that re-sends unchanged notes must not
      // record a base, and a real edit must carry one even when it equals the last one `diff` would have dropped. The base
      // is stamped right after the notes, by the same writer, which is how a reader pairs the two.
      const notesChange = changes.find((c) => c.field === 'notes');
      changes = changes.filter((c) => c.field !== 'notesBase');
      if (notesChange) {
        const base = 'notesBase' in fields ? (fields.notesBase as string | null) : this.notesStamp(kind, id);
        const at = changes.indexOf(notesChange);
        changes.splice(at + 1, 0, { t: this.tick(), kind, id, field: 'notesBase', value: base ?? null });
      }
    }
    return changes;
  }
  /** The stamp of a record's current `notes`, null when none: what an edit to them is based on. */
  notesStamp(kind: 'accession' | 'sowing', id: string): string | null {
    return this.seen.get(recKey(kind, id) + '\0notes') ?? null;
  }
  /** Whether a stamp was written by this device (any of its tabs). */
  isOwnStamp(t: string | null | undefined): boolean {
    return !!t && hlcDecode(t).device.startsWith(this.deviceId);
  }

  async remove(kind: Kind, id: string): Promise<void> {
    await this.commit([{ t: this.tick(), kind, id, field: '_deleted', value: true }]);
  }

  async restore(kind: Kind, id: string): Promise<void> {
    await this.commit([{ t: this.tick(), kind, id, field: '_deleted', value: false }]);
    // A plant brought back may share its number with one that arrived while it was removed (another device minted the
    // same number offline; the repair skips removed plants), so the repair runs again now (round twenty-nine, 3).
    if (kind === 'accession') await this.repairNumbers();
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
        if (i === 0 && wanted && issued.has(no)) throw new Error(`Accession number ${no} is already used. A number is never reused; pick another.`);
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
        made = this.stampPast(b.changes);
        return b;
      });
    } catch (e) {
      this.lastWriteError = e instanceof Error ? e.message : String(e);
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
    const back: Array<{ id: string; locationId: string | null; location: string | null }> = [];
    const lines: string[] = [];
    for (const id of ids) {
      const cur = this.state.get(recKey('accession', id));
      if (!cur || cur._deleted || (cur.locationId ?? null) === locationId) continue;
      back.push({ id, locationId: (cur.locationId as string | null) ?? null, location: (cur.location as string | null) ?? null });
      changes.push(...diff('accession', id, { locationId, location: locationId ? null : (cur.location ?? null) }, cur, this.tick));
      if (locationId) {
        const eid = this.eventId();
        lines.push(eid);
        changes.push(...diff('event', eid, { acc: id, d: localDate(), t: 'move', note: `to ${this.locationName(locationId)}` }, undefined, this.tick));
      }
    }
    if (changes.length) await this.commit(changes);
    const undo = async () => {
      const cs: Change[] = [];
      for (const b of back) {
        const cur = this.state.get(recKey('accession', b.id));
        if (!cur || cur._deleted || (cur.locationId ?? null) !== locationId) continue; // moved on since: left there
        cs.push(...diff('accession', b.id, { locationId: b.locationId, location: b.location }, cur, this.tick));
      }
      for (const eid of lines) if (this.state.get(recKey('event', eid))?._deleted !== true) cs.push({ t: this.tick(), kind: 'event', id: eid, field: '_deleted', value: true });
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

  /** The numbering scheme, as a synced setting record; `meta` is written too for a build of this device that still reads it there. */
  async setScheme(s: NumberingScheme): Promise<void> {
    await this.put('setting', NUMBERING_SETTING, { scheme: s });
    this.metaScheme = s;
    await setMeta('scheme', s);
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
  async ingest(incoming: Change[], source: 'import' | 'server' = 'import', opts: { repair?: boolean; requireKey?: string } = {}): Promise<void> {
    // Mended where an older build wrote a number for text; a change of a type its field never takes is left out and
    // said, and the rest are folded, rather than the file or the batch refused whole (round twenty-nine, 2).
    const { changes, dropped } = readChanges(incoming);
    if (dropped.length) console.warn(`${dropped.length} change${dropped.length === 1 ? '' : 's'} left out of this ${source === 'server' ? 'batch' : 'file'}:`, dropped.slice(0, 5));
    if (!changes.length) return;
    for (const c of changes) this.clock?.observe(c.t);
    const overwritten = this.textAboutToBeReplaced(changes); // a pull, a restore or an import alike: a backup file is the one channel two unsynced devices share
    await this.commit(changes, source, opts.requireKey);
    // Free text is the one field where last-writer-wins loses a grower's writing: two devices that edited a plant's
    // notes offline keep only one text. The other is not dropped silently: the device whose text lost writes what it
    // said on the plant's log, so both devices have it (round twenty-four, 1). Only this device's own text is logged,
    // by the device that held it, so the line is written once.
    if (overwritten.length) {
      const today = localDate();
      const lines: Change[] = [];
      for (const o of overwritten) {
        const now = this.state.get(recKey(o.kind, o.id))?.notes;
        if (now === o.old) continue; // held back, or the same text after all
        const eid = this.eventId();
        lines.push(...diff('event', eid, { id: eid, acc: o.id, d: today, t: 'note', note: `Notes replaced by an edit made ${o.how}; here they read: ${o.old}`, auto: true } as unknown as Record<string, unknown>, undefined, this.tick));
      }
      if (lines.length) await this.commit(lines, 'local').catch(() => undefined);
    }
    if (source === 'import') {
      // Records new to this device today count from today, whatever their changes are stamped: a collection kept in v2 since
      // 2019 is not "not seen for 2,400 days" on the day it arrives. The day goes on the record as a field, so it syncs and
      // every device counts the same way (round ten, 3).
      const today = localDate();
      const stamp: Change[] = [];
      const seenRec = new Set<string>();
      for (const c of changes) {
        if (c.kind !== 'accession' && c.kind !== 'sowing') continue;
        const k = recKey(c.kind, c.id);
        if (seenRec.has(k) || madeOn(c.id)) continue;
        seenRec.add(k);
        const r = this.state.get(k);
        if (r && !r._deleted && !r.importedOn) stamp.push({ t: this.tick(), kind: c.kind, id: c.id, field: 'importedOn', value: today }); // never a removed record: an edit after a removal undoes it (round fifteen, 1)
      }
      if (stamp.length) await this.commit(stamp, 'local');
    }
    if (opts.repair !== false) await this.repairNumbers();
  }

  /**
   * Incoming changes to a plant's or batch's `notes` that will win over a non-empty text this device wrote, and were made
   * without seeing it: the change's `notesBase` (the stamp of the text it was edited from, in the same commit) is not the
   * stamp of the text held here. An edit made in sight of this text replaced it knowingly and is not logged; a change from
   * a build before `notesBase` is taken as blind. Only this device's own text is logged, by this device: the other side logs
   * its own, and a tab of this device is not another device (round twenty-four, 1; round twenty-five, 2).
   */
  private textAboutToBeReplaced(changes: Change[]): Array<{ kind: 'accession' | 'sowing'; id: string; old: string; how: string }> {
    const out = new Map<string, { kind: 'accession' | 'sowing'; id: string; old: string; how: string }>();
    for (const c of changes) {
      if ((c.kind !== 'accession' && c.kind !== 'sowing') || c.field !== 'notes') continue;
      const k = recKey(c.kind, c.id);
      const prev = this.seen.get(k + '\0notes');
      const rec = this.state.get(k);
      const old = rec?.notes;
      if (!prev || !rec || rec._deleted || typeof old !== 'string' || !old.trim() || old === c.value) continue;
      if (hlcCompare(c.t, prev) <= 0 || !hlcDecode(prev).device.startsWith(this.deviceId) || hlcDecode(c.t).device.startsWith(this.deviceId)) continue;
      // The base that belongs to this edit: the same writer's next `notesBase` stamp after the notes, with no other notes
      // change of the record between (a restore carries the whole log, older bases included; round twenty-six, 2).
      const writer = hlcDecode(c.t).device;
      const base = changes.filter((b) => b.kind === c.kind && b.id === c.id && b.field === 'notesBase' && hlcDecode(b.t).device === writer && hlcCompare(b.t, c.t) > 0).sort((x, y) => hlcCompare(x.t, y.t))[0];
      const between = base && changes.some((b) => b.kind === c.kind && b.id === c.id && b.field === 'notes' && hlcCompare(b.t, c.t) > 0 && hlcCompare(b.t, base.t) < 0);
      if (base && !between && base.value === prev) continue; // edited from the text held here: seen, not lost
      if (!out.has(k)) out.set(k, { kind: c.kind, id: c.id, old, how: 'on another device' });
    }
    return [...out.values()];
  }
  /** The duplicate-number repair, once over the whole log: a pull calls it after its last batch, not after each (round twelve, 3). */
  async repairNumbers(): Promise<void> {
    try {
      await this.resolveDuplicateNumbers();
    } catch {
      /* commit() has recorded it in lastWriteError; the duplicate stays visible until a later ingest repairs it */
    }
  }

  /**
   * Two devices offline at once can each mint the same next number for
   * different plants. They are different records (different identities), so
   * nothing is lost; after a merge the one created later is given the next
   * free number and a note says so. Every device derives the same repair
   * from the same merged log: the same number (lowest free under the synced
   * scheme), the same note, and the same timestamps (one millisecond after the
   * record's latest change, tagged from the record's identity rather than
   * from this device's clock), so two devices that both run it write the
   * same changes and the log holds one note, not two.
   */
  async resolveDuplicateNumbers(): Promise<number> {
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
        const recs = byNo.get(no)!;
        if (recs.length < 2) continue;
        recs.sort((a, b) => a.id.localeCompare(b.id)); // earliest creation keeps the number
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
          const note = { acc: r.id, d: when.toISOString().slice(0, 10), t: 'note', note: `Renumbered from ${no} to ${fresh}: another ${kind === 'accession' ? 'plant' : 'batch'}, created earlier, had been given ${no} (on another device, or in a file merged in).` };
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
