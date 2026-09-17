/**
 * The collection as reactive state: a fold over the change log, with the
 * write API every view uses. Loads once per page life; every write appends
 * to IndexedDB and to the in-memory state in the same call.
 */
import { SvelteMap } from 'svelte/reactivity';
import { Clock, hlcDecode } from '$core/hlc';
import { apply, diff, key as recKey, type Change, type Kind, type Record_, type State } from '$core/log';
import { nextAccession, DEFAULT_SCHEME, type NumberingScheme } from '$core/accession';
import { allChanges, appendChanges, deviceId, requestPersistence, getMeta, setMeta, putPhotoBlobs, getPhotoBlobs, deletePhotoBlobs } from './vault';
import type { Accession, PlantEvent, Taxon, Location, Sowing, Provenance, Photo } from './types';
import { PROP_METHODS } from './types';
import { slugify } from '$core/names';

class Collection {
  ready = $state(false);
  persisted = $state<boolean | null>(null);
  scheme = $state<NumberingScheme>(DEFAULT_SCHEME);
  private state: State = new SvelteMap<string, Record_>();
  private seen = new Map<string, string>();
  private clock: Clock | null = null;
  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loading)
      this.loading = (async () => {
        const dev = await deviceId();
        this.clock = new Clock(dev);
        const changes = await allChanges();
        apply(this.state, changes, this.seen);
        for (const c of changes) this.clock.observe(c.t);
        const scheme = await getMeta<NumberingScheme>('scheme');
        if (scheme) this.scheme = scheme;
        this.ready = true;
        this.persisted = await requestPersistence();
      })();
    return this.loading;
  }

  /* ---- reads ---- */
  get accessions(): Accession[] {
    return this.live<Accession>('accession').sort((a, b) => b.id.localeCompare(a.id));
  }
  accession(id: string): Accession | undefined {
    const r = this.state.get(recKey('accession', id));
    return r && !r._deleted ? (r as unknown as Accession) : undefined;
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
  /* ---- locations ---- */
  get locations(): Location[] {
    return this.live<Location>('location').sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  }
  location(id: string): Location | undefined {
    const r = this.state.get(recKey('location', id));
    return r && !r._deleted ? (r as unknown as Location) : undefined;
  }
  children(parentId: string | null): Location[] {
    return this.locations.filter((l) => (l.parentId ?? null) === parentId);
  }
  /** Root → node. */
  locationPath(id: string): Location[] {
    const out: Location[] = [];
    let cur = this.location(id);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId ? this.location(cur.parentId) : undefined;
    }
    return out;
  }
  locationName(id: string): string {
    return this.locationPath(id).map((l) => l.name).join(' › ');
  }
  /** Every node under `id`, including itself. */
  subtree(id: string): string[] {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const c of this.children(out[i])) out.push(c.id);
    return out;
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
  /** Growing plants at a node (deep: including every node beneath it). */
  plantsAt(id: string, deep = true): Accession[] {
    const ids = new Set(deep ? this.subtree(id) : [id]);
    return this.accessions.filter((a) => a.status === 'growing' && a.locationId && ids.has(a.locationId));
  }
  /** Free-text locations still on plants, with counts, for one-click conversion. */
  get legacyLocations(): Array<{ text: string; n: number }> {
    const m = new Map<string, number>();
    for (const a of this.accessions) if (!a.locationId && a.location) m.set(a.location, (m.get(a.location) ?? 0) + 1);
    return [...m.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n);
  }
  async addLocation(l: Omit<Location, 'id'> & { id?: string }): Promise<Location> {
    const id = l.id ?? 'l-' + slugify(l.name).slice(0, 24) + '-' + this.tick().slice(-6);
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
  /** Removing a node moves its plants and children up to its parent; nothing is orphaned. */
  async removeLocation(id: string): Promise<void> {
    const node = this.location(id);
    if (!node) return;
    const parent = node.parentId ?? null;
    const changes: Change[] = [];
    for (const c of this.children(id)) changes.push({ t: this.tick(), kind: 'location', id: c.id, field: 'parentId', value: parent });
    for (const a of this.accessions) if (a.locationId === id) changes.push({ t: this.tick(), kind: 'accession', id: a.id, field: 'locationId', value: parent });
    changes.push({ t: this.tick(), kind: 'location', id, field: '_deleted', value: true });
    await this.commit(changes);
  }

  /* ---- sowings ---- */
  get sowings(): Sowing[] {
    return this.live<Sowing>('sowing').sort((a, b) => b.sown.localeCompare(a.sown) || b.id.localeCompare(a.id));
  }
  sowing(id: string): Sowing | undefined {
    const r = this.state.get(recKey('sowing', id));
    return r && !r._deleted ? (r as unknown as Sowing) : undefined;
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
    return nextAccession(
      [...this.state.values()].filter((r) => r.kind === 'sowing').map((r) => r.id),
      { mode: 'prefix', prefix: `S${year}`, width: 3 }
    );
  }
  async addSowing(sw: Omit<Sowing, 'id' | 'status'> & { id?: string; status?: Sowing['status'] }): Promise<Sowing> {
    const id = sw.id ?? this.nextSowingNumber(Number(sw.sown.slice(0, 4)) || undefined);
    const rec: Sowing = { status: 'active', ...sw, id };
    await this.put('sowing', id, rec as unknown as Record<string, unknown>);
    // The parent plant's timeline records that material was taken.
    if (rec.parentAcc && this.accession(rec.parentAcc)) {
      const m = PROP_METHODS.find((x) => x.k === rec.method);
      await this.addEvent({ acc: rec.parentAcc, d: rec.sown, t: 'propagate', n: rec.count, note: `${rec.count} ${m?.unit ?? 'pieces'} → ${id}` });
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
    const taken = new Set([...this.state.values()].filter((r) => r.kind === 'accession').map((r) => r.id));
    const changes: Change[] = [];
    const made: Accession[] = [];
    for (let i = 0; i < n; i++) {
      const id = nextAccession(taken, this.scheme, Number(date.slice(0, 4)) || undefined);
      taken.add(id);
      const rec: Accession = {
        id,
        taxonName: s.taxonName,
        taxonKey: s.taxonKey ?? null,
        cultivar: s.cultivar ?? parent?.cultivar ?? null,
        nameKind: s.nameKind ?? parent?.nameKind ?? null,
        parentage: s.parentage ?? parent?.parentage ?? null,
        fieldNumber: veg ? (parent?.fieldNumber ?? null) : (s.sourceRef ?? null),
        provenance,
        status: 'growing',
        acquired: date,
        sourceFrom: veg ? (parent ? `own plant ${parent.id}` : null) : (s.sourceFrom ?? null),
        sourceRef: s.sourceRef ?? null,
        sourceForm: veg ? (m?.k === 'graft' ? 'graft' : 'cutting') : 'seedling',
        locationId: opts.locationId ?? s.locationId ?? null,
        sowingId: s.id,
        notes: null
      };
      changes.push(...diff('accession', id, rec as unknown as Record<string, unknown>, undefined, this.tick));
      const eid = this.eventId();
      changes.push(...diff('event', eid, { acc: id, d: date, t: 'acquire', note: `potted up from ${s.id}` }, undefined, this.tick));
      made.push(rec);
    }
    const pid = this.eventId();
    changes.push(...diff('event', pid, { acc: s.id, d: date, t: 'potup', n, note: [made.map((a) => a.id).join(', '), opts.note?.trim() || null].filter(Boolean).join(' · ') }, undefined, this.tick));
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
  /** A short id that is unique per change on every device: wall time and counter in base 36 plus a device tag. */
  private eventId(): string {
    const h = hlcDecode(this.tick());
    return 'e' + h.wall.toString(36) + h.count.toString(36).padStart(2, '0') + h.device.slice(0, 4);
  }

  private async commit(changes: Change[], local = true): Promise<void> {
    if (!changes.length) return;
    apply(this.state, changes, this.seen);
    // apply() mutates records in place; re-set a copy so the reactive map notices.
    for (const k of new Set(changes.map((c) => recKey(c.kind, c.id)))) {
      const r = this.state.get(k);
      if (r) this.state.set(k, { ...r });
    }
    await appendChanges(changes);
    if (local) for (const fn of this.listeners) fn(changes);
  }

  /** Called after every local write (not after an ingest); sync uses it to schedule a push. */
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
    return nextAccession(
      [...this.state.values()].filter((r) => r.kind === 'accession').map((r) => r.id),
      this.scheme
    );
  }

  async addAccession(a: Omit<Accession, 'id' | 'status'> & { id?: string; status?: Accession['status'] }): Promise<Accession> {
    const id = a.id ?? this.nextAccessionNumber();
    const rec: Accession = { status: 'growing', ...a, id };
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

  async setScheme(s: NumberingScheme): Promise<void> {
    this.scheme = s;
    await setMeta('scheme', s);
  }

  /** Bulk append of already-formed changes (imports, sync). */
  async ingest(changes: Change[]): Promise<void> {
    for (const c of changes) this.clock?.observe(c.t);
    await this.commit(changes, false);
  }

  /** Everything, for export and for sync. */
  async exportChanges(): Promise<Change[]> {
    return allChanges();
  }
}

export const collection = new Collection();
