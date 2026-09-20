/**
 * The collection as reactive state: a fold over the change log, with the
 * write API every view uses. Loads once per page life; every write goes to
 * IndexedDB first and to the in-memory state only once that has succeeded,
 * so the page never shows an edit the vault does not hold.
 */
import { SvelteMap } from 'svelte/reactivity';
import { Clock, hlcDecode, hlcEncode, hlcCompare } from '$core/hlc';
import { apply, diff, validateChanges, key as recKey, type Change, type Kind, type Record_, type State } from '$core/log';
import { nextAccession, DEFAULT_SCHEME, type NumberingScheme } from '$core/accession';
import { allChanges, appendChanges, deviceId, requestPersistence, getMeta, setMeta, putPhotoBlobs, getPhotoBlobs, deletePhotoBlobs } from './vault';
import type { Accession, PlantEvent, Taxon, Location, Sowing, Provenance, Photo } from './types';
import { PROP_METHODS, accNo, sowNo, NUMBERING_SETTING } from './types';
import { slugify } from '$core/names';
import { mySpeciesOf, type MySpecies } from './species-list';

export { NUMBERING_SETTING };

const isScheme = (s: unknown): s is NumberingScheme => !!s && typeof s === 'object' && ((s as NumberingScheme).mode === 'year' || (s as NumberingScheme).mode === 'prefix') && typeof (s as NumberingScheme).width === 'number';

/** A short, deterministic tag for a string: two 32-bit FNV-1a hashes in base 36 (up to 14 characters, [a-z0-9]). */
function tag36(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36);
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

class Collection {
  ready = $state(false);
  persisted = $state<boolean | null>(null);
  /** The last vault write that failed, as a sentence, or null once a write has succeeded again. Pages show it; the edit it describes was not stored and is not shown. */
  lastWriteError = $state<string | null>(null);
  /** The scheme this device kept in `meta` before the scheme was a synced setting; read only when the log has no setting record. */
  private metaScheme = $state<NumberingScheme | null>(null);
  private state: State = new SvelteMap<string, Record_>();
  private seen = new Map<string, string>();
  private clock: Clock | null = null;
  private loading: Promise<void> | null = null;
  /** Every `parentId` a place has had, by HLC, so a loop can be cut back to where the place was before the move. */
  private parentHist = new Map<string, Map<string, string | null>>();

  load(): Promise<void> {
    if (!this.loading)
      this.loading = (async () => {
        const dev = await deviceId();
        this.clock = new Clock(dev);
        const changes = await allChanges();
        apply(this.state, changes, this.seen, { now: Date.now(), except: dev }); // a change stamped far ahead of this clock is held, not applied (round five, 4)
        this.noteParents(changes);
        for (const c of changes) this.clock.observe(c.t);
        const scheme = await getMeta<NumberingScheme>('scheme');
        if (isScheme(scheme)) this.metaScheme = scheme;
        this.ready = true;
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
  get accessions(): Accession[] {
    return this.live<Accession>('accession').sort((a, b) => accNo(b).localeCompare(accNo(a)));
  }
  /** By identity, or, failing that, by the number people see (URLs and QR codes carry the identity; people type numbers). */
  accession(idOrNo: string): Accession | undefined {
    const r = this.state.get(recKey('accession', idOrNo));
    if (r && !r._deleted) return r as unknown as Accession;
    return this.live<Accession>('accession').find((a) => a.acc === idOrNo);
  }
  /** Every number ever given to a plant on this device, live or dead: a number is never reused. */
  private takenNumbers(kind: 'accession' | 'sowing'): Set<string> {
    const out = new Set<string>();
    for (const r of this.state.values()) if (r.kind === kind) out.add(kind === 'accession' ? accNo(r as unknown as Accession) : sowNo(r as unknown as Sowing));
    return out;
  }
  isNumberTaken(no: string): boolean {
    return this.takenNumbers('accession').has(no.trim());
  }
  /** An identity for a new record: unique per change on every device (wall time, counter, device tag), never shown. */
  private newId(prefix: 'r' | 's'): string {
    return prefix + this.eventId().slice(1);
  }
  events(acc: string): PlantEvent[] {
    return this.live<PlantEvent>('event')
      .filter((e) => e.acc === acc)
      .sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id));
  }
  get taxa(): Taxon[] {
    return this.live<Taxon>('taxon').filter((t) => !t.removed);
  }
  taxon(id: string): Taxon | undefined {
    const r = this.state.get(recKey('taxon', id));
    return r && !r._deleted ? (r as unknown as Taxon) : undefined;
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
  get locations(): Location[] {
    return this.live<Location>('location').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  }
  location(id: string): Location | undefined {
    const r = this.state.get(recKey('location', id));
    return r && !r._deleted ? (r as unknown as Location) : undefined;
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
  private tree(): { parent: Map<string, string | null>; needsHome: Set<string> } {
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
    for (const id of selfLoops) cut(id, [id]);
    const done = new Set<string>();
    for (const l of live) {
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
      if (!r._deleted) return { parent: cur, loop: false };
      if (seen.has(cur)) return { parent: null, loop: false };
      seen.add(cur);
      cur = (r.parentId as string | null | undefined) ?? null;
    }
    return { parent: null, loop: false };
  }
  /** Remember every parentId a place has been given, so a cut loop can fall back to the previous one. Same on every device: it is read from the log, not from arrival order. */
  private noteParents(changes: Iterable<Change>): void {
    for (const c of changes) {
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
      if (!r._deleted) return cur;
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
    if (this.wouldCycle(id, parentId)) throw new Error('A place cannot be put inside itself.');
    if (parentId && !this.location(parentId)) throw new Error('That parent place does not exist.');
    await this.put('location', id, { parentId });
  }
  /** Conditions as they apply at a node: the nearest ancestor's value wins for anything the node leaves null. */
  conditions(id: string): { indoor: boolean | null; floorC: number | null; ppfd: number | null; lightHours: number | null; lat: number | null; lon: number | null; altM: number | null; from: Record<string, string> } {
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
    return { indoor: g('indoor') as boolean | null, floorC: g('floorC') as number | null, ppfd: g('ppfd') as number | null, lightHours: g('lightHours') as number | null, lat: g('lat') as number | null, lon: g('lon') as number | null, altM: g('altM') as number | null, from };
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
  async removeLocation(id: string): Promise<void> {
    const node = this.location(id);
    if (!node) return;
    const parent = this.tree().parent.get(id) ?? null;
    const changes: Change[] = [];
    for (const c of this.children(id)) changes.push({ t: this.tick(), kind: 'location', id: c.id, field: 'parentId', value: parent });
    for (const a of this.accessions) if (a.locationId === id) changes.push({ t: this.tick(), kind: 'accession', id: a.id, field: 'locationId', value: parent });
    for (const s of this.sowings) if (s.locationId === id) changes.push({ t: this.tick(), kind: 'sowing', id: s.id, field: 'locationId', value: parent });
    changes.push({ t: this.tick(), kind: 'location', id, field: '_deleted', value: true });
    await this.commit(changes);
  }

  /* ---- sowings ---- */
  get sowings(): Sowing[] {
    return this.live<Sowing>('sowing').sort((a, b) => b.sown.localeCompare(a.sown) || b.id.localeCompare(a.id));
  }
  sowing(idOrNo: string): Sowing | undefined {
    const r = this.state.get(recKey('sowing', idOrNo));
    if (r && !r._deleted) return r as unknown as Sowing;
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
  sowingStats(id: string): { germinated: number; potted: number; lost: number; remaining: number; rate: number | null; firstUp: string | null; daysToFirst: number | null; days: number } {
    const s = this.sowing(id);
    const ev = this.events(id); // newest first
    const germ = ev.filter((e) => e.t === 'germinate');
    const germinated = germ.length ? Math.max(...germ.map((e) => e.n ?? 0)) : 0;
    const potted = ev.filter((e) => e.t === 'potup').reduce((n, e) => n + (e.n ?? 0), 0);
    const lost = ev.filter((e) => e.t === 'loss').reduce((n, e) => n + (e.n ?? 0), 0);
    const firstUp = germ.length ? germ[germ.length - 1].d : null;
    const dayMs = 86_400_000;
    const since = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / dayMs);
    return {
      germinated,
      potted,
      lost,
      remaining: Math.max(0, germinated - potted - lost),
      rate: s && s.count > 0 ? germinated / s.count : null,
      firstUp,
      daysToFirst: s && firstUp ? since(s.sown, firstUp) : null,
      days: s ? since(s.sown, new Date().toISOString().slice(0, 10)) : 0
    };
  }
  nextSowingNumber(year = new Date().getFullYear()): string {
    return nextAccession(this.takenNumbers('sowing'), { mode: 'prefix', prefix: `S${year}`, width: 3 });
  }
  async addSowing(sw: Omit<Sowing, 'id' | 'status'> & { id?: string; status?: Sowing['status'] }): Promise<Sowing> {
    const no = sw.no?.trim() || this.nextSowingNumber(Number(sw.sown.slice(0, 4)) || undefined);
    if (sw.no && this.takenNumbers('sowing').has(no)) throw new Error(`Batch number ${no} is already used.`);
    const id = sw.id ?? this.newId('s');
    const rec: Sowing = { status: 'active', ...sw, id, no };
    await this.put('sowing', id, rec as unknown as Record<string, unknown>);
    // The parent plant's timeline records that material was taken.
    if (rec.parentAcc && this.accession(rec.parentAcc)) {
      const m = PROP_METHODS.find((x) => x.k === rec.method);
      await this.addEvent({ acc: rec.parentAcc, d: rec.sown, t: 'propagate', n: rec.count, note: `${rec.count} ${m?.unit ?? 'pieces'} → ${no}` });
    }
    return rec;
  }
  /**
   * Pot up n plants from a sowing: n new accessions carrying the batch as provenance, one potup
   * event on the sowing naming them, one acquire event each. All in one commit.
   */
  async potUp(sowingId: string, n: number, opts: { date?: string; locationId?: string | null; note?: string | null } = {}): Promise<Accession[]> {
    const s = this.sowing(sowingId);
    if (!s || n < 1) return [];
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const m = PROP_METHODS.find((x) => x.k === s.method);
    const veg = m?.veg ?? false;
    const parent = s.parentAcc ? this.accession(s.parentAcc) : undefined;
    // Seed keeps the provenance the seed carried; a wild-collected seed lot raises F1 plants. Vegetative material is 'veg'.
    const provenance: Provenance = veg ? 'veg' : s.provenance === 'wild' ? 'f1' : s.provenance === 'f1' ? 'fn' : (s.provenance ?? 'unknown');
    const taken = this.takenNumbers('accession');
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
        fieldNumber: veg ? (parent?.fieldNumber ?? null) : (s.sourceRef ?? null),
        provenance,
        status: 'growing',
        acquired: date,
        sourceFrom: veg ? (parent ? `own plant ${accNo(parent)}` : null) : (s.sourceFrom ?? null),
        sourceRef: s.sourceRef ?? null,
        sourceForm: veg ? (m?.k === 'graft' ? 'graft' : 'cutting') : 'seedling',
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
    changes.push(...diff('event', pid, { acc: s.id, d: date, t: 'potup', n, note: [made.map((a) => accNo(a)).join(', '), opts.note?.trim() || null].filter(Boolean).join(' · ') }, undefined, this.tick));
    await this.commit(changes);
    return made;
  }

  /* ---- photos ---- */
  /** Photos of a plant, newest first. */
  photos(acc: string): Photo[] {
    return this.live<Photo>('photo')
      .filter((p) => p.acc === acc)
      .sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id));
  }
  photosOfSowing(id: string): Photo[] {
    return this.live<Photo>('photo')
      .filter((p) => p.sowing === id)
      .sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id));
  }
  photo(id: string): Photo | undefined {
    const r = this.state.get(recKey('photo', id));
    return r && !r._deleted ? (r as unknown as Photo) : undefined;
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
    await putPhotoBlobs({ id, blob, thumb });
    const rec: Photo = { ...meta, id };
    await this.put('photo', id, rec as unknown as Record<string, unknown>);
    return rec;
  }
  async removePhoto(id: string): Promise<void> {
    const p = this.photo(id);
    await this.remove('photo', id);
    if (p?.acc) {
      const a = this.accession(p.acc);
      if (a?.cover === id) await this.put('accession', a.id, { cover: null });
    }
    await deletePhotoBlobs(id);
  }
  async setCover(acc: string, photoId: string | null): Promise<void> {
    await this.put('accession', acc, { cover: photoId });
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

  /** Last time each plant was marked present at an audit (or acquired), for "not seen since". */
  lastSeen(acc: string): string | null {
    const ev = this.events(acc).find((e) => e.t === 'audit' || e.t === 'acquire');
    return ev?.d ?? null;
  }

  private live<T>(kind: Kind): T[] {
    const out: T[] = [];
    for (const r of this.state.values()) if (r.kind === kind && !r._deleted) out.push(r as unknown as T);
    return out;
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
  private async commit(changes: Change[], source: 'local' | 'import' | 'server' = 'local'): Promise<void> {
    if (!changes.length) return;
    // The vault first. If it refuses (a full phone), nothing is applied, the page keeps showing what is stored, and the error is kept for the page to show.
    try {
      await appendChanges(changes, source === 'server');
    } catch (e) {
      this.lastWriteError = e instanceof Error ? e.message : String(e);
      throw e;
    }
    this.lastWriteError = null;
    apply(this.state, changes, this.seen, { now: Date.now(), except: this.device });
    this.noteParents(changes);
    // apply() mutates records in place; re-set a copy so the reactive map notices.
    for (const k of new Set(changes.map((c) => recKey(c.kind, c.id)))) {
      const r = this.state.get(k);
      if (r) this.state.set(k, { ...r });
    }
    if (source !== 'server') for (const fn of this.listeners) fn(changes);
  }

  /** Called after every write the server has not seen (local edits and imports, not pulls); sync uses it to schedule a push. */
  private listeners = new Set<(changes: Change[]) => void>();
  onLocalChange(fn: (changes: Change[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get device(): string {
    return this.clock?.device ?? '';
  }

  /** Upsert any record kind from a plain object. Only changed fields are written. */
  async put(kind: Kind, id: string, fields: Record<string, unknown>): Promise<void> {
    const current = this.state.get(recKey(kind, id));
    await this.commit(diff(kind, id, fields, current, this.tick));
  }

  async remove(kind: Kind, id: string): Promise<void> {
    await this.commit([{ t: this.tick(), kind, id, field: '_deleted', value: true }]);
  }

  async restore(kind: Kind, id: string): Promise<void> {
    await this.commit([{ t: this.tick(), kind, id, field: '_deleted', value: false }]);
  }

  nextAccessionNumber(): string {
    return nextAccession(this.takenNumbers('accession'), this.scheme);
  }

  /** A new plant. Its number is minted, or taken from `acc` when the grower brings one; a number already in use is refused, never overwritten. */
  async addAccession(a: Omit<Accession, 'id' | 'status'> & { id?: string; status?: Accession['status'] }): Promise<Accession> {
    const no = a.acc?.trim() || this.nextAccessionNumber();
    if (a.acc && this.takenNumbers('accession').has(no)) throw new Error(`Accession number ${no} is already used. A number is never reused; pick another.`);
    const id = a.id ?? this.newId('r');
    const rec: Accession = { status: 'growing', ...a, id, acc: no };
    await this.put('accession', id, rec as unknown as Record<string, unknown>);
    if (rec.acquired) await this.addEvent({ acc: id, d: rec.acquired, t: 'acquire', note: rec.sourceFrom ? `from ${rec.sourceFrom}` : null });
    return rec;
  }

  async addEvent(e: Omit<PlantEvent, 'id'> & { id?: string }): Promise<PlantEvent> {
    const id = e.id ?? this.eventId();
    const rec: PlantEvent = { ...e, id };
    await this.put('event', id, rec as unknown as Record<string, unknown>);
    return rec;
  }

  /** One commit for many events (watering a whole bench): all land or none do. */
  async addEvents(list: Array<Omit<PlantEvent, 'id'>>): Promise<number> {
    const changes: Change[] = [];
    for (const e of list) {
      const id = this.eventId();
      const rec = { ...e, id } as unknown as Record<string, unknown>;
      changes.push(...diff('event', id, rec, undefined, this.tick));
    }
    await this.commit(changes);
    return list.length;
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
  async ingest(changes: Change[], source: 'import' | 'server' = 'import'): Promise<void> {
    validateChanges(changes);
    for (const c of changes) this.clock?.observe(c.t);
    await this.commit(changes, source);
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
      const taken = this.takenNumbers(kind);
      for (const no of [...byNo.keys()].sort()) {
        const recs = byNo.get(no)!;
        if (recs.length < 2) continue;
        recs.sort((a, b) => a.id.localeCompare(b.id)); // earliest creation keeps the number
        for (const r of recs.slice(1)) {
          const rec = this.state.get(recKey(kind, r.id))!;
          const base = hlcDecode(rec._t);
          const wall = base.wall + 1;
          const when = new Date(wall);
          const fresh = kind === 'accession' ? nextAccession(taken, this.scheme, Number((r as Accession).acquired?.slice(0, 4)) || when.getUTCFullYear()) : nextAccession(taken, { mode: 'prefix', prefix: `S${(r as Sowing).sown.slice(0, 4)}`, width: 3 });
          taken.add(fresh);
          // The tag is a function of the record and no real device id starts with 'zz', so the stamps collide with nothing and are identical on every device.
          const device = ('zz' + tag36(kind + ':' + r.id)).slice(0, 16);
          const stamp = (count: number) => hlcEncode({ wall, count, device });
          changes.push({ t: stamp(0), kind, id: r.id, field: kind === 'accession' ? 'acc' : 'no', value: fresh });
          const eid = 'e' + wall.toString(36) + '00' + device;
          const note = { acc: r.id, d: when.toISOString().slice(0, 10), t: 'note', note: `Renumbered from ${no} to ${fresh}: another plant had been given ${no} on a device that was offline at the time.` };
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
