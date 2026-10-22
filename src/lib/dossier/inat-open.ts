/**
 * iNaturalist's wild photographs from its open data on AWS (round seventy-nine, agent P; the owner's decision 3), in place
 * of one API request a species. iNaturalist publishes, monthly, five tab-separated, gzipped files in the public bucket
 * `inaturalist-open-data` (https://inaturalist-open-data.s3.amazonaws.com/): `taxa.csv.gz`, `observations.csv.gz`,
 * `photos.csv.gz`, `observers.csv.gz` (and `observations_projects.csv.gz` and `projects.csv.gz`, not read). Their columns,
 * read from the files of 2026-09-27 themselves:
 *
 *   taxa          taxon_id, ancestry, rank_level, rank, name, active
 *   observations  observation_uuid, observer_id, latitude, longitude, positional_accuracy, taxon_id, quality_grade,
 *                 observed_on, anomaly_score
 *   photos        photo_uuid, photo_id, observation_uuid, observer_id, extension, license, width, height, position
 *   observers     observer_id, login, name
 *
 * What they hold and what they do not: a quality grade (research, needs_id, casual) and a licence per photograph, every
 * licence (CC0, CC BY, CC BY-SA and the NC and ND ones), the observer's login and name, iNaturalist's own taxon ids (the
 * API's), the photograph's id, file extension and size. No captive or cultivated flag (a captive observation is casual,
 * and casual is also an observation without a date or place), no numeric observation id (the observation's uuid), no
 * place name, and no votes or faves.
 *
 * The rule, the API's wild request (`wildUrl`) read from these files:
 *   - `quality_grade=research`: the observation's `quality_grade` is `research`. `captive=false` is then true of it:
 *     iNaturalist makes no captive observation research grade (help article 151000169936), so the files need no captive
 *     flag for the wild set;
 *   - `taxon_id=<id>` takes in the taxon's descendants: an observation counts for its taxon and for every taxon of its
 *     `ancestry` at species rank or below (`rank_level` 10 or less);
 *   - `photo_license=cc0,cc-by,cc-by-sa`: at least one of the observation's photographs is CC0, CC BY or CC BY-SA; only
 *     those photographs are kept (rule 4), in the observation's own order (`position`);
 *   - the author: iNaturalist's `attribution` as the API writes it, "(c) <name>, some rights reserved (CC BY)" with the
 *     observer's name or, where it has none, login, and "no rights reserved" for CC0 (`attributionOf`);
 *   - `per_page=24` observations: which 24, where a taxon has more, cannot be the API's, which orders by votes, which the
 *     files do not hold (and among equal votes, most of them none, in no stated order). The open data's rule, stated:
 *     the 24 whose open photographs iNaturalist received last (the highest photograph id), newest first.
 *
 * The reader writes, per taxon, the answer `inat.photos` reads (`{ results }` in the API's shape, a result's `id` the
 * observation's uuid, so a photograph's page is `https://www.inaturalist.org/observations/<uuid>`), and `heldWild` answers
 * the builder's wild request from it, so the builder's own filters (licence, author, placeholder, descendants Kew places
 * elsewhere) run unchanged. No image is fetched: the files give each photograph's address, which the page loads.
 */
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import type { JsonFetcher, FetchResult } from './fetch';
import { INAT, PLANTAE } from './sources/inat';

/** The bucket, whose `photos/<id>/<size>.<extension>` serves every openly licensed photograph. */
export const OPEN_DATA = 'https://inaturalist-open-data.s3.amazonaws.com';
/** The files' licences the wild set takes (rule 4), as the API writes them. */
export const OPEN_LICENCES: ReadonlyMap<string, string> = new Map([['CC0', 'cc0'], ['CC-BY', 'cc-by'], ['CC-BY-SA', 'cc-by-sa']]);
/** Observations a taxon's wild set holds: the builder's `per_page` for the wild set. */
export const WILD_PER_TAXON = 24;
/** The words a wild-photographs record carries when the open data answered it (the export's day follows). */
export const OPEN_WILD_RULE = "from iNaturalist's open data";
export const openWildDetail = (day: string) => `${OPEN_WILD_RULE} of ${day}: research-grade observations with an open-licence photograph, the ${WILD_PER_TAXON} whose photographs iNaturalist received last (the open data holds no votes)`;
/**
 * The words a wild-photographs record carries when iNaturalist's API answered it for a taxon of which the open data holds
 * more than the set's 24 observations (round eighty, agent V): the API's wild request (`wildUrl`), whose 24 are the ones it
 * puts first by votes. No "; " in them: a record's words are joined by it (`inat-kew-fill.ts`).
 */
export const MOST_VOTED_RULE = 'the observations iNaturalist puts first by votes';
export const mostVotedDetail = (day: string, n: number) => `from iNaturalist's API: research-grade observations not marked captive with an open-licence photograph, ${MOST_VOTED_RULE}, ${WILD_PER_TAXON} of them (the open data of ${day} holds ${n}, and no votes)`;

/** The API's `attribution` for a photograph, from its licence and the observer's name, or login where there is no name. */
export function attributionOf(licence: string, name: string | undefined, login: string | undefined): string {
  const who = (name ?? '').trim() || (login ?? '').trim();
  if (licence === 'cc0') return 'no rights reserved';
  const label = licence === 'cc-by' ? 'CC BY' : licence === 'cc-by-sa' ? 'CC BY-SA' : licence.toUpperCase();
  return `(c) ${who}, some rights reserved (${label})`;
}

/** A taxon of the files: what an observation of it counts for (itself and its ancestors at species rank or below). */
export interface OpenTaxon { name: string; rank: string; rankLevel: number; active: boolean; groups: number[] }

/**
 * Reads `taxa.csv`: every taxon under iNaturalist's plants (Plantae) at species rank or below, with the taxa at species
 * rank or below its observations count for. A taxon above species is not held: no wild set is its own.
 */
export async function readTaxa(lines: AsyncIterable<string[]>): Promise<Map<number, OpenTaxon>> {
  const rows: Array<{ id: number; up: number[]; t: Omit<OpenTaxon, 'groups'> }> = [];
  const level = new Map<number, number>();
  let col: Cols | null = null;
  for await (const batch of lines) {
    for (const line of batch) {
      if (!line) continue;
      const c = line.split('\t');
      if (!col) { col = columns(c, ['taxon_id', 'ancestry', 'rank_level', 'rank', 'name', 'active'], 'taxa'); continue; }
      const up = c[col.ancestry] ? c[col.ancestry].split('/').map(Number) : [];
      const id = Number(c[col.taxon_id]);
      if (id !== PLANTAE && !up.includes(PLANTAE)) continue;
      const rankLevel = Number(c[col.rank_level]);
      level.set(id, rankLevel);
      // A name is copied, so the file's text it was cut from is not held with it.
      if (rankLevel <= 10) rows.push({ id, up, t: { name: fresh(c[col.name]), rank: fresh(c[col.rank]), rankLevel, active: c[col.active] === 'true' } });
    }
  }
  const out = new Map<number, OpenTaxon>();
  for (const { id, up, t } of rows) out.set(id, { ...t, groups: [id, ...up.filter((x) => (level.get(x) ?? Infinity) <= 10)] });
  return out;
}
/** A string of its own, not a slice that keeps the text it was cut from. */
const fresh = (s: string): string => Buffer.from(s, 'utf8').toString('utf8');

type Cols = Record<string, number>;
/** The positions of the columns named, from a file's header; a column missing stops the reader, saying which. */
function columns(header: string[], names: readonly string[], file: string): Cols {
  const out: Cols = {};
  for (const n of names) {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`${file}: no column ${n} (the header is: ${header.join(', ')})`);
    out[n] = i;
  }
  return out;
}

/** One kept observation: its order key (its highest open photograph id) and its row, tab-separated. */
interface Kept { k: number; s: string }
/** A taxon's wild set as it is read: every qualifying observation counted, the `keep` latest kept. */
interface Group { n: number; rows: Kept[] }

export interface ReadCounts {
  observations: number;
  photos: number;
  /** Research-grade observations of a plant taxon at species rank or below. */
  plantResearch: number;
  /** …of which at least one photograph is CC0, CC BY or CC BY-SA. */
  plantResearchOpen: number;
  /** Candidate observations no photograph row named (every observation of the open data has one; counted to show it). */
  withoutPhotos: number;
  /** Taxa (species or below) with at least one qualifying observation, and the observations their sets keep. */
  taxaWithWild: number;
  kept: number;
  /** Photograph rows whose observation was not found: never read into the window near them, or not in the file. */
  unjoined: number;
  /** The farthest back, in observations, that a photograph's observation was found (the window's margin, measured). */
  farthest: number;
  /** Photograph rows held aside, waiting for their observation (0 at the end). */
  heldAside: number;
}

export interface WildSets {
  taxa: Map<number, OpenTaxon>;
  groups: Map<number, Group>;
  observers: Map<number, { login: string; name: string }>;
  counts: ReadCounts;
  keep: number;
  only?: ReadonlySet<number>;
}

/** Lines, a batch at a time, from a stream of bytes (a file, gunzipped or not). A carriage return is dropped. */
export async function* lineBatches(input: AsyncIterable<Buffer | string>): AsyncGenerator<string[]> {
  const dec = new StringDecoder('utf8');
  let rest = '';
  for await (const chunk of input) {
    const s = rest + (typeof chunk === 'string' ? chunk : dec.write(chunk));
    const parts = s.split('\n');
    rest = parts.pop() ?? '';
    if (parts.length) yield parts.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  }
  rest += dec.end();
  if (rest) yield [rest.endsWith('\r') ? rest.slice(0, -1) : rest];
}

/** A cursor over line batches that waits only when its batch is spent. */
class Cursor {
  private batch: string[] = [];
  private i = 0;
  private done = false;
  constructor(private it: AsyncIterator<string[]>) {}
  /** The next line, `undefined` at the end, or `null` when the next batch must be awaited (`fill`). */
  nextSync(): string | undefined | null {
    if (this.i < this.batch.length) return this.batch[this.i++];
    return this.done ? undefined : null;
  }
  async fill(): Promise<void> {
    const r = await this.it.next();
    if (r.done) { this.done = true; this.batch = []; } else this.batch = r.value;
    this.i = 0;
  }
}

/**
 * Streams the files once: `observations` and `photos` together, since iNaturalist writes the photographs nearly in the
 * order of their observations (measured on the files of 2026-09-27, below). The observations read are held in a window
 * of `window` (half a million by default); a photograph's observation is looked for in it, then read ahead for, at most a fifth
 * of the window; a photograph whose observation is not near is held aside until its observation is read. A photograph
 * left over at the end (its observation already out of the window, or not in the file) is counted (`unjoined`), and the
 * script stops rather than write a set that may lack a photograph. Then `observers`, for the kept observations' observers.
 *
 * `only`: the taxa whose sets are kept (all at species rank or below if not given); every plant taxon is counted either way.
 */
export async function readWild(src: { taxa: AsyncIterable<string[]>; observations: AsyncIterable<string[]>; photos: AsyncIterable<string[]>; observers: () => AsyncIterable<string[]> }, opts: { keep?: number; only?: ReadonlySet<number>; more?: { taxa: ReadonlySet<number>; keep: number }; window?: number; progress?: (c: ReadCounts) => void } = {}): Promise<WildSets> {
  const keep = opts.keep ?? WILD_PER_TAXON;
  // `more`: some taxa kept longer (the proof's, which compares whole sets), the rest at `keep`.
  const limit = (g: number) => (opts.more?.taxa.has(g) ? Math.max(keep, opts.more.keep) : keep);
  const windowSize = opts.window ?? 500_000;
  const ahead = Math.max(1, Math.floor(windowSize / 5));
  const taxa = await readTaxa(src.taxa);
  const groups = new Map<number, Group>();
  const counts: ReadCounts = { observations: 0, photos: 0, plantResearch: 0, plantResearchOpen: 0, withoutPhotos: 0, taxaWithWild: 0, kept: 0, unjoined: 0, farthest: 0, heldAside: 0 };
  const obs = new Cursor(src.observations[Symbol.asyncIterator]());
  let oc: Cols | null = null;
  let pc: Cols | null = null;
  // An observation read: a number (its place in the file) for one that is not a candidate, and for a candidate (research
  // grade, a plant taxon at species rank or below) its place, its fields, its open photographs, and whether a photograph
  // row named it. Rows are read by their tabs' places, not split: 306 million observations and 474 million photographs.
  type Cand = { seq: number; seen: boolean; key: string; taxon: number; observer: number; on: string; open: string[]; maxId: number };
  type Ob = number | Cand;
  const win = new Map<string, Ob>();
  const ring: string[] = [];
  let at = 0;
  const aside = new Map<string, string[]>();
  const finish = (o: Ob) => {
    if (typeof o === 'number') return;
    if (!o.seen) counts.withoutPhotos++;
    if (!o.open.length) return;
    counts.plantResearchOpen++;
    // Made afresh: a slice of the file's text would keep the whole of the text it was cut from.
    const row = fresh(`${o.key}\t${o.observer}\t${o.taxon}\t${o.on}\t${o.open.sort((a, b) => Number(a.split(',')[5]) - Number(b.split(',')[5])).join(';')}`);
    for (const g of taxa.get(o.taxon)!.groups) {
      let e = groups.get(g);
      if (!e) groups.set(g, (e = { n: 0, rows: [] }));
      e.n++;
      if (opts.only && !opts.only.has(g)) continue;
      e.rows.push({ k: o.maxId, s: row });
      if (e.rows.length >= limit(g) + 16) trim(e.rows, limit(g));
    }
  };
  const take = (o: Ob, line: string) => {
    if (typeof o === 'number') return;
    o.seen = true;
    const c = line.split('\t');
    const lic = OPEN_LICENCES.get(c[pc!.license]);
    if (!lic) return;
    const id = Number(c[pc!.photo_id]);
    o.open.push(`${id},${c[pc!.extension]},${lic},${c[pc!.width]},${c[pc!.height]},${c[pc!.position]}`);
    if (id > o.maxId) o.maxId = id;
  };
  // The last photograph's observation: the next row is most often of the same one (forgotten when it leaves the window).
  let lastU = '';
  let lastO: Ob | undefined;
  const tab = new Int32Array(64);
  /** The places of a line's tabs in `tab`; their number. */
  const tabsOf = (line: string): number => {
    let k = 0;
    for (let i = line.indexOf('\t'); i >= 0 && k < 64; i = line.indexOf('\t', i + 1)) tab[k++] = i;
    return k;
  };
  const from = (j: number) => (j === 0 ? 0 : tab[j - 1] + 1);
  const to = (j: number, k: number, line: string) => (j < k ? tab[j] : line.length);
  /** The next observation read into the window (the oldest finished when it is full), or undefined at the end. */
  const readObs = async (): Promise<[string, Ob] | undefined> => {
    for (;;) {
      const line = obs.nextSync();
      if (line === null) { await obs.fill(); continue; }
      if (line === undefined) return undefined;
      if (!line) continue;
      if (!oc) { oc = columns(line.split('\t'), ['observation_uuid', 'observer_id', 'taxon_id', 'quality_grade', 'observed_on'], 'observations'); continue; }
      const k = tabsOf(line);
      const seq = counts.observations++;
      // A slice of the file's text: the window holds the text of the observations in it, and no more.
      const uuid = line.slice(from(oc.observation_uuid), to(oc.observation_uuid, k, line));
      let o: Ob = seq;
      const q = from(oc.quality_grade);
      if (to(oc.quality_grade, k, line) - q === 8 && line.startsWith('research', q)) {
        let taxon = 0;
        const t0 = from(oc.taxon_id), t1 = to(oc.taxon_id, k, line);
        for (let i = t0; i < t1; i++) taxon = taxon * 10 + (line.charCodeAt(i) - 48);
        const t = t1 > t0 ? taxa.get(taxon) : undefined;
        if (t && t.groups.length) {
          o = { seq, seen: false, key: uuid, taxon, observer: Number(line.slice(from(oc.observer_id), to(oc.observer_id, k, line))), on: fresh(line.slice(from(oc.observed_on), to(oc.observed_on, k, line))), open: [], maxId: -1 };
          counts.plantResearch++;
        }
      }
      // The window's order is a ring of uuids beside the map: a map's oldest entry, deleted again and again, is found
      // more slowly each time (V8 keeps the holes), so the ring says which to finish.
      if (ring.length < windowSize) ring.push(uuid);
      else {
        const u0 = ring[at];
        ring[at] = uuid;
        at = (at + 1) % windowSize;
        const o0 = win.get(u0);
        if (o0 !== undefined) { win.delete(u0); finish(o0); if (o0 === lastO) lastO = undefined; }
      }
      win.set(uuid, o);
      const held = aside.get(uuid);
      if (held) { aside.delete(uuid); counts.heldAside -= held.length; for (const l of held) take(o, l); }
      return [uuid, o];
    }
  };
  for await (const batch of src.photos) {
    for (const line of batch) {
      if (!line) continue;
      if (!pc) { pc = columns(line.split('\t'), ['photo_id', 'observation_uuid', 'extension', 'license', 'width', 'height', 'position'], 'photos'); continue; }
      counts.photos++;
      // Only the observation's uuid is read of every row; the rest only of a candidate's photographs.
      const k = tabsOf(line);
      const u = line.slice(from(pc.observation_uuid), to(pc.observation_uuid, k, line));
      let o: Ob | undefined;
      if (lastO !== undefined && u === lastU) o = lastO;
      else {
        o = win.get(u);
        for (let i = 0; o === undefined && i < ahead; i++) {
          const r = await readObs();
          if (!r) break;
          if (r[0] === u) o = r[1];
        }
      }
      if (o === undefined) {
        const l = aside.get(u);
        if (l) l.push(fresh(line)); else aside.set(u, [fresh(line)]);
        counts.heldAside++;
        lastO = undefined;
        continue;
      }
      lastU = u;
      lastO = o;
      const age = counts.observations - 1 - (typeof o === 'number' ? o : o.seq);
      if (age > counts.farthest) counts.farthest = age;
      take(o, line);
    }
    if (opts.progress && counts.photos % 1_000_000 < batch.length) opts.progress(counts);
  }
  while (await readObs());
  for (const o of win.values()) finish(o);
  win.clear();
  for (const l of aside.values()) counts.unjoined += l.length;
  counts.heldAside = 0;
  const need = new Set<number>();
  for (const [g, e] of groups) {
    trim(e.rows, limit(g));
    if (e.n) counts.taxaWithWild++;
    counts.kept += e.rows.length;
    for (const r of e.rows) need.add(Number(r.s.split('\t')[1]));
  }
  const observers = new Map<number, { login: string; name: string }>();
  let uc: Cols | null = null;
  for await (const batch of src.observers()) {
    for (const line of batch) {
      if (!line) continue;
      const c = line.split('\t');
      if (!uc) { uc = columns(c, ['observer_id', 'login', 'name'], 'observers'); continue; }
      const id = Number(c[uc.observer_id]);
      if (need.has(id)) observers.set(id, { login: c[uc.login] ?? '', name: c[uc.name] ?? '' });
    }
  }
  return { taxa, groups, observers, counts, keep, ...(opts.only ? { only: opts.only } : {}) };
}

/** The `k`th tab-separated field of a line, without splitting the rest. */
function field(line: string, k: number): string {
  let from = 0;
  for (let i = 0; i < k; i++) { from = line.indexOf('\t', from) + 1; if (from === 0) return ''; }
  const to = line.indexOf('\t', from);
  return to < 0 ? line.slice(from) : line.slice(from, to);
}

/** Newest first by the highest open photograph id, then by uuid; the first `keep` kept. */
function trim(rows: Kept[], keep: number): void {
  rows.sort((a, b) => b.k - a.k || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  if (rows.length > keep) rows.length = keep;
}

/** An observation as the API gives it, with the fields `inat.photos` reads. */
export interface OpenObservation {
  id: string;
  uuid: string;
  observed_on?: string;
  quality_grade: 'research';
  taxon: { id: number; name?: string; rank?: string };
  user: { id: number; login?: string; name?: string };
  photos: Array<{ id: number; license_code: string; url: string; attribution: string; original_dimensions?: { width: number; height: number } }>;
}

/** A kept row as the API's observation. */
export function observationOf(row: string, taxa: ReadonlyMap<number, OpenTaxon>, observers: ReadonlyMap<number, { login: string; name: string }>): OpenObservation {
  const [uuid, observer, taxon, on, photos] = row.split('\t');
  const t = taxa.get(Number(taxon));
  const who = observers.get(Number(observer));
  return {
    id: uuid,
    uuid,
    ...(on ? { observed_on: on } : {}),
    quality_grade: 'research',
    taxon: { id: Number(taxon), ...(t ? { name: t.name, rank: t.rank } : {}) },
    user: { id: Number(observer), ...(who ? { login: who.login, name: who.name } : {}) },
    photos: photos.split(';').map((p) => {
      const [id, ext, lic, w, h] = p.split(',');
      const width = Number(w), height = Number(h);
      return {
        id: Number(id),
        license_code: lic,
        url: `${OPEN_DATA}/photos/${id}/square.${ext}`,
        attribution: attributionOf(lic, who?.name, who?.login),
        ...(width > 0 && height > 0 ? { original_dimensions: { width, height } } : {})
      };
    })
  };
}

/** The first line of the reader's file: what it was read from, by which rule. */
export interface OpenHeader { inatOpenWild: 1; day: string; keep: number; rule: string; read: string; files: Record<string, number>; counts: ReadCounts }

/**
 * The reader's file, a line a taxon: `{"t":<id>,"n":<qualifying observations>,"results":[…]}`, for every plant taxon at
 * species rank or below (with `only`, those taxa alone: a taxon not written is not held, and the builder asks the API).
 */
export function* wildLines(w: WildSets, header: Omit<OpenHeader, 'inatOpenWild' | 'keep' | 'rule' | 'counts'>, o: { taxa?: Iterable<number>; keep?: number } = {}): Generator<string> {
  const keep = o.keep ?? w.keep;
  yield JSON.stringify({ inatOpenWild: 1, ...header, keep, rule: openWildDetail(header.day), counts: w.counts } satisfies OpenHeader);
  const ids = [...(o.taxa ?? w.only ?? w.taxa.keys())].filter((id) => (w.taxa.get(id)?.rankLevel ?? Infinity) <= 10).sort((a, b) => a - b);
  for (const id of ids) {
    const g = w.groups.get(id);
    // A taxon iNaturalist has made inactive says so (round eighty, agent I): its set is none, and none is not an answer.
    const inactive = w.taxa.get(id)?.active === false;
    yield JSON.stringify({ t: id, n: g?.n ?? 0, ...(inactive ? { active: false } : {}), results: (g?.rows ?? []).slice(0, keep).map((r) => observationOf(r.s, w.taxa, w.observers)) });
  }
}

/**
 * The reader's file, opened for the build: each taxon's line found by its place in the file, read when asked (the file
 * is not held in memory).
 */
export interface OpenWildStore {
  header: OpenHeader;
  /** Whether the file holds this taxon (its set, or none). */
  holds(taxonId: number): boolean;
  /** The taxon's qualifying observations by the open data (its line's `n`), or undefined where the file does not hold it. */
  count(taxonId: number): number | undefined;
  /**
   * False where the file says iNaturalist has made the taxon inactive (round eighty, agent I: files written by this round's
   * reader on); undefined otherwise, which a file written before cannot tell from active. An inactive taxon's set is not
   * read from the file: an inactive id holds no observations, and "none" from it would be a false absence.
   */
  active(taxonId: number): false | undefined;
  get(taxonId: number): { n: number; results: OpenObservation[] } | undefined;
  detail: string;
  close(): void;
}

export function openWildStore(path: string): OpenWildStore {
  const fd = openSync(path, 'r');
  const size = statSync(path).size;
  const at = new Map<number, [number, number]>();
  const counted = new Map<number, number>();
  const inactive = new Set<number>();
  let header: OpenHeader | null = null;
  const buf = Buffer.alloc(1 << 20);
  let pos = 0;
  let carry: Buffer = Buffer.alloc(0);
  let lineStart = 0;
  while (pos < size) {
    const n = readSync(fd, buf, 0, buf.length, pos);
    if (n <= 0) break;
    const chunk = carry.length ? Buffer.concat([carry, buf.subarray(0, n)]) : buf.subarray(0, n);
    let from = 0;
    for (let i = chunk.indexOf(10); i >= 0; i = chunk.indexOf(10, from)) {
      const line = chunk.subarray(from, i);
      const start = lineStart + from;
      if (!header) header = JSON.parse(line.toString('utf8')) as OpenHeader;
      else {
        const m = /^\{"t":(\d+),(?:"n":(\d+),)?("active":false,)?/.exec(line.subarray(0, 60).toString('latin1'));
        if (m) { at.set(Number(m[1]), [start, line.length]); if (m[2] !== undefined) counted.set(Number(m[1]), Number(m[2])); if (m[3]) inactive.add(Number(m[1])); }
      }
      from = i + 1;
    }
    carry = Buffer.from(chunk.subarray(from));
    lineStart += from;
    pos += n;
  }
  if (!header || header.inatOpenWild !== 1) { closeSync(fd); throw new Error(`${path} is not the open-data reader's file`); }
  const h = header;
  return {
    header: h,
    detail: openWildDetail(h.day),
    holds: (id) => at.has(id),
    // `wildLines` writes every line as `{"t":<id>,"n":<count>,…`, so the count is read with its place.
    count: (id) => counted.get(id),
    active: (id) => (inactive.has(id) ? false : undefined),
    get(id) {
      const p = at.get(id);
      if (!p) return undefined;
      const b = Buffer.alloc(p[1]);
      readSync(fd, b, 0, p[1], p[0]);
      const o = JSON.parse(b.toString('utf8')) as { n: number; results: OpenObservation[] };
      return { n: o.n, results: o.results };
    },
    close: () => closeSync(fd)
  };
}

/**
 * Whether `--fill inat` asks a dossier's wild set (round seventy-nine): never when it is settled (answered, or answered
 * with none); from the open data whenever it holds the taxon, at no request and whatever GBIF's download gave; from the
 * API only in a fill that asks it (neither `--wild` nor `--cultivated`) and only where GBIF's download gave fewer than
 * six wild photographs, as before.
 */
export function wildToAsk(o: { held: boolean; settled: boolean; wildOnly: boolean; cultivatedOnly: boolean; wildFromGbif: number }): boolean {
  if (o.settled) return false;
  if (o.held) return true;
  return !o.wildOnly && !o.cultivatedOnly && o.wildFromGbif < 6;
}

/** The builder's wild request (`wildUrl`), read back: the taxon and the observations asked for, or null for any other request. */
export function wildAsk(url: string): { taxon: number; perPage: number } | null {
  if (!url.startsWith(`${INAT}/observations?`)) return null;
  const q = new URL(url).searchParams;
  const want: Record<string, string> = { photo_license: 'cc0,cc-by,cc-by-sa', photos: 'true', quality_grade: 'research', captive: 'false', order_by: 'votes' };
  for (const [k, v] of Object.entries(want)) if (q.get(k) !== v) return null;
  const known = new Set([...Object.keys(want), 'taxon_id', 'per_page']);
  for (const k of q.keys()) if (!known.has(k)) return null;
  const taxon = Number(q.get('taxon_id'));
  const perPage = Number(q.get('per_page'));
  return Number.isInteger(taxon) && taxon > 0 && Number.isInteger(perPage) && perPage > 0 ? { taxon, perPage } : null;
}

/**
 * A fetcher that answers the builder's wild request from the open data where the file holds the taxon, never counted
 * against iNaturalist's day (`day-budget.ts`) and never asked of iNaturalist; anything else, and a taxon the file does
 * not hold (one newer than the export), goes to `inner` as before. The answer carries the record's words
 * (`openWildDetail`), which `inat.photos` passes on.
 *
 * `mostVoted` (round eighty, agent V): the file answers only where its set is the taxon's whole qualifying set (its count
 * at most the observations asked for), which is then the set the API gives too, whatever its order. A taxon of which it
 * holds more goes to `inner`, the API, whose answer is the observations it puts first by votes, which the open data cannot
 * know; that answer carries `mostVotedDetail`. Without it (`--fill inat --wild`, which asks iNaturalist nothing, and
 * `--cultivated`), such a taxon is answered from the file: the observations whose photographs iNaturalist received last.
 */
export function heldWild(inner: JsonFetcher, store: OpenWildStore | null, said?: { held: number; mostVoted?: number }, opts: { mostVoted?: boolean } = {}): JsonFetcher {
  if (!store) return inner;
  return (async <T>(url: string, o?: Parameters<JsonFetcher>[1]): Promise<FetchResult<T>> => {
    const ask = wildAsk(url);
    // A taxon the file holds as inactive goes to `inner`, as a taxon it does not hold does (round eighty).
    const held = ask && ask.perPage <= store.header.keep && store.active(ask.taxon) !== false ? store.get(ask.taxon) : undefined;
    if (!ask || !held) return inner<T>(url, o);
    if (opts.mostVoted && held.n > ask.perPage) {
      const r = await inner<T>(url, o);
      if (r.status !== 'ok') return r;
      if (said) said.mostVoted = (said.mostVoted ?? 0) + 1;
      return { ...r, detail: mostVotedDetail(store.header.day, held.n) };
    }
    if (said) said.held++;
    return { status: 'ok', data: { total_results: held.n, results: held.results.slice(0, ask.perPage) } as T, detail: store.detail };
  }) as JsonFetcher;
}

/**
 * Whether the fill asks iNaturalist's API for a page's most-voted wild set (round eighty, agent V): only where its wild
 * record is the open data's (`OPEN_WILD_RULE`, answered or answered with none) and the open data holds more qualifying
 * observations of its taxon than the set's 24, so the record holds the 24 newest, not the most voted. Never a set the
 * API answered (its record is the most voted already), never a taxon of 24 or fewer (the open data's set is the whole set,
 * the API's too), and never without the file (the count is not known; nothing is asked).
 */
export function mostVotedToAsk(store: OpenWildStore | null, taxonId: number | undefined, row: { status?: string; detail?: string } | undefined, perPage = WILD_PER_TAXON): boolean {
  if (!store || !taxonId || !row || (row.status !== 'ok' && row.status !== 'none')) return false;
  if (!(row.detail ?? '').startsWith(OPEN_WILD_RULE)) return false;
  return (store.count(taxonId) ?? 0) > perPage;
}
