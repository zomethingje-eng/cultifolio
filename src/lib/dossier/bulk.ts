/**
 * Bulk sources for a large corpus build. Per-species API calls are the wrong
 * shape at thousands of species; two downloads replace the two slowest legs:
 *
 *   WCVP  — Kew's World Checklist of Vascular Plants, one zip with
 *           wcvp_names.csv and wcvp_distribution.csv (pipe-delimited).
 *   GBIF  — one occurrence download (DWCA: occurrence.txt and multimedia.txt,
 *           tab-delimited) for every taxon key in the list, requested by
 *           scripts/bulk-fetch.ts. Records, and the photographs on them.
 *
 * Nothing in buildDossier() changes: bulkFetcher() wraps the ordinary fetcher
 * and answers the distribution and occurrence URLs from the files, passing
 * everything else (backbone, photos, Wikipedia, literature) through. The
 * dossier records the same upstream names, so a reader cannot tell which
 * path built it, and neither can the tests.
 */
import type { JsonFetcher, FetchResult, FetchOptions } from './fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { GbifDistribution, GbifOccurrence, OccPage, GbifSpecies } from './sources/gbif';

/* ------------------------------------------------------------------ WCVP */

export interface WcvpName {
  id: string;
  name: string; // taxon_name, e.g. "Tylecodon pearsonii"
  status: string; // Accepted | Synonym | Unplaced | ...
  acceptedId: string; // accepted_plant_name_id (self for accepted names)
  rank: string;
  /** taxon_authors, used to tell homonyms apart against the backbone's authorship. */
  authors?: string;
  lifeform?: string;
  climate?: string;
}

/** Kew's own one-line descriptions of a species, carried on the distribution answer. */
export interface KewDescription {
  lifeform?: string;
  climate?: string;
}

export interface WcvpDist {
  id: string; // plant_name_id
  l3: string; // area_code_l3
  area: string;
  introduced: boolean;
  extinct: boolean;
  doubtful: boolean;
}

/** Split one pipe-delimited WCVP line by a header. Quotes are not used in these files. */
export function wcvpRow(header: string[], line: string): Record<string, string> {
  const cells = line.split('|');
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) out[header[i]] = cells[i] ?? '';
  return out;
}

export const parseWcvpName = (h: string[], line: string): WcvpName => {
  const r = wcvpRow(h, line);
  return { id: r.plant_name_id, name: r.taxon_name, status: r.taxon_status, acceptedId: r.accepted_plant_name_id || r.plant_name_id, rank: r.taxon_rank, authors: r.taxon_authors || undefined, lifeform: r.lifeform_description || undefined, climate: r.climate_description || undefined };
};

export const parseWcvpDist = (h: string[], line: string): WcvpDist => {
  const r = wcvpRow(h, line);
  return { id: r.plant_name_id, l3: r.area_code_l3, area: r.area, introduced: r.introduced === '1', extinct: r.extinct === '1', doubtful: r.location_doubtful === '1' };
};

/**
 * The part of WCVP a build needs: for each wanted name, its accepted record and
 * that record's distribution. Built in two streaming passes by the script
 * (names first, then distributions filtered to the accepted ids), so the
 * 300 MB names file is never held in memory.
 */
/** Authorship, loosely: letters only, lower-cased, so "(Phil.) Britton & Rose" and "(Phil.)Britton&Rose" agree. */
const authorKey = (a?: string) => (a ?? '').toLowerCase().replace(/[^a-z]/g, '');

export class WcvpIndex {
  private byName = new Map<string, WcvpName[]>(); // lower-cased taxon_name → rows (several when homonyms)
  private byId = new Map<string, WcvpName>(); // every accepted row
  private acceptedByName: Map<string, WcvpName[]> | null = null; // built on first use from byId
  private dist = new Map<string, WcvpDist[]>(); // accepted plant_name_id → rows

  /** First pass: keep every row whose name is wanted, and every accepted row (small: ~350k) so synonyms can resolve. */
  addName(n: WcvpName, wanted: (name: string) => boolean): void {
    if (n.status === 'Accepted') this.byId.set(n.id, n);
    if (wanted(n.name)) {
      const k = n.name.toLowerCase();
      const arr = this.byName.get(k) ?? [];
      arr.push(n);
      this.byName.set(k, arr);
    }
  }
  /** The accepted ids the second pass must keep: those of every wanted name, and of every accepted name a wanted synonym points at. */
  acceptedIds(): Set<string> {
    const s = new Set<string>();
    for (const arr of this.byName.values()) for (const n of arr) s.add(n.acceptedId);
    return s;
  }
  addDist(d: WcvpDist): void {
    const arr = this.dist.get(d.id) ?? [];
    arr.push(d);
    this.dist.set(d.id, arr);
  }
  /**
   * Resolve a name (as GBIF gives it, canonical) to its accepted WCVP record.
   * A name WCVP holds twice (homonyms) is resolved by authorship when the caller
   * gives it; otherwise it is ambiguous and nothing is returned, so no range is
   * attached to the wrong plant. An accepted name outside the wanted genera (the
   * target of a synonym the backbone followed) is found among the accepted rows.
   */
  accepted(name: string, authorship?: string): WcvpName | 'ambiguous' | undefined {
    const k = name.toLowerCase();
    let rows = this.byName.get(k);
    if (!rows?.length) {
      if (!this.acceptedByName) {
        this.acceptedByName = new Map();
        for (const n of this.byId.values()) {
          const kk = n.name.toLowerCase();
          const arr = this.acceptedByName.get(kk) ?? [];
          arr.push(n);
          this.acceptedByName.set(kk, arr);
        }
      }
      rows = this.acceptedByName.get(k);
    }
    if (!rows?.length) return undefined;
    // Among homonyms the backbone's authorship decides first: Aloe alba X (accepted) and Aloe alba Y (a synonym of another
    // species) are two plants, and a caller asking for Y must not be given X's range because X is the accepted one.
    // Only when authorship matches nothing, or was not given, does the accepted row stand in.
    let pick = rows.length === 1 ? rows : [];
    if (rows.length > 1 && authorship) {
      const a = authorKey(authorship);
      const byAuthor = rows.filter((r) => authorKey(r.authors) === a);
      if (byAuthor.length === 1) pick = byAuthor;
    }
    if (pick.length !== 1) pick = rows.filter((r) => r.status === 'Accepted');
    if (pick.length !== 1) {
      const distinct = new Set(rows.map((r) => r.acceptedId));
      if (distinct.size > 1) return 'ambiguous';
      pick = [rows[0]];
    }
    const n = pick[0];
    return n.status === 'Accepted' ? n : (this.byId.get(n.acceptedId) ?? n);
  }
  /** Distribution rows in the shape gbif.distributions() returns, so build.ts needs no new branch; null when unknown or ambiguous. */
  distributions(name: string, authorship?: string): { rows: GbifDistribution[]; kew: KewDescription } | 'ambiguous' | null {
    const a = this.accepted(name, authorship);
    if (!a) return null;
    if (a === 'ambiguous') return 'ambiguous';
    const rows = this.dist.get(a.id);
    if (!rows?.length) return null;
    return {
      rows: rows
        .filter((d) => !d.doubtful)
        .map((d) => ({ locationId: `TDWG:${d.l3}`, locality: d.area, establishmentMeans: d.introduced ? 'INTRODUCED' : d.extinct ? 'EXTINCT' : 'NATIVE', status: d.extinct ? 'extinct' : undefined, source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' })),
      kew: { lifeform: a.lifeform, climate: a.climate }
    };
  }
  get size(): number {
    return this.byName.size;
  }
}

/* ------------------------------------------------------------------ GBIF occurrence download */

/** Read the SIMPLE_CSV header and give a row parser. Tab-delimited, no quoting. */
export function occHeader(line: string): string[] {
  return line.replace(/\r$/, '').split('\t');
}

export function parseOccRow(h: string[], line: string): GbifOccurrence & { speciesKey?: number; taxonKey?: number } | null {
  const c = line.replace(/\r$/, '').split('\t');
  if (c.length < h.length - 2) return null;
  const g: Record<string, string> = {};
  for (let i = 0; i < h.length; i++) g[h[i]] = c[i] ?? '';
  // A blank or whitespace coordinate is not 0,0: require a digit before trusting Number().
  if (!/\d/.test(g.decimalLatitude ?? '') || !/\d/.test(g.decimalLongitude ?? '')) return null;
  const lat = Number(g.decimalLatitude), lon = Number(g.decimalLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const unc = Number(g.coordinateUncertaintyInMeters);
  return {
    key: Number(g.gbifID),
    decimalLatitude: lat,
    decimalLongitude: lon,
    year: g.year ? Number(g.year) : undefined,
    countryCode: g.countryCode || undefined,
    basisOfRecord: g.basisOfRecord || undefined,
    license: g.license || undefined,
    datasetKey: g.datasetKey || undefined,
    // GBIF's two cultivation flags carried as one string: the build tests both with one pattern, and the API path sees both fields.
    establishmentMeans: [g.establishmentMeans, g.degreeOfEstablishment].filter(Boolean).join(' ') || undefined,
    coordinateUncertaintyInMeters: Number.isFinite(unc) && unc > 0 ? unc : undefined,
    mediaType: g.mediaType || undefined,
    speciesKey: g.speciesKey ? Number(g.speciesKey) : undefined,
    taxonKey: g.taxonKey ? Number(g.taxonKey) : undefined
  };
}

/** A stable hash of a gbifID into [0, 1), so the sample a rebuild keeps is the same sample. */
export function idHash(id: number): number {
  let x = (id ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Occurrences by species key, capped per species. The API path returns at
 * most 900; a download can hold a hundred thousand for one species. Each
 * species keeps the `cap` rows with the smallest id-hash: a uniform sample,
 * decided row by row so memory stays bounded while the file streams, and
 * deterministic so a rebuild finds the same habitat centre. Once a species
 * is full, a row is only admitted if its hash beats the current worst, so
 * the buffer never exceeds cap × 1.25 and admissions become rare quickly.
 *
 * Memory is the whole game: a download for 9,000 species is 28 M rows, so
 * only species in `wanted` (when given) are kept at all, and a kept row is a
 * flat array with its strings interned, about a tenth of an object per row.
 */
type Row = [h: number, key: number, lat: number, lon: number, year: number, cc: string, basis: string, lic: string, ds: string, est: string, unc: number];

export class OccIndex {
  private by = new Map<number, Row[]>();
  private worst = new Map<number, number>(); // per species, the largest hash still inside the cap (Infinity until full)
  private strings = new Map<string, string>();
  /** The download's DOI, when known: every record served carries it so the dossier can cite it. */
  doi?: string;
  /** gbifID → species key for observation records that carry images, a few dozen per species, so multimedia.txt can be read for them. */
  readonly withMedia = new Map<number, number>();
  private mediaCount = new Map<number, number>();
  static readonly MEDIA_PER_SPECIES = 40;
  constructor(private cap = 2000, private wanted?: Set<number>) {}
  private intern(s: string | undefined): string {
    if (!s) return '';
    let v = this.strings.get(s);
    if (!v) this.strings.set(s, (v = s));
    return v;
  }
  add(o: GbifOccurrence & { speciesKey?: number; taxonKey?: number }): void {
    const h = idHash(o.key);
    for (const k of new Set([o.speciesKey, o.taxonKey])) {
      if (!k) continue;
      if (this.wanted && !this.wanted.has(k)) continue;
      // Photographs: an observation (not a herbarium sheet) with still images, the first few dozen per species. A
      // record identified to a subspecies belongs to its species' page, so the owner is the species key when there is one.
      const owner = o.speciesKey ?? k;
      if (k === owner && /still/i.test(o.mediaType ?? '') && o.basisOfRecord === 'HUMAN_OBSERVATION' && (this.mediaCount.get(owner) ?? 0) < OccIndex.MEDIA_PER_SPECIES) {
        this.withMedia.set(o.key, owner);
        this.mediaCount.set(owner, (this.mediaCount.get(owner) ?? 0) + 1);
      }
      if (h >= (this.worst.get(k) ?? Infinity)) continue;
      const arr = this.by.get(k) ?? [];
      arr.push([h, o.key, o.decimalLatitude ?? NaN, o.decimalLongitude ?? NaN, o.year ?? 0, this.intern(o.countryCode), this.intern(o.basisOfRecord), this.intern(o.license), this.intern(o.datasetKey), this.intern(o.establishmentMeans), o.coordinateUncertaintyInMeters ?? 0]);
      if (arr.length > this.cap * 1.25) this.trim(k, arr);
      this.by.set(k, arr);
    }
  }
  private trim(k: number, arr: Row[]): void {
    arr.sort((a, b) => a[0] - b[0]);
    if (arr.length > this.cap) {
      arr.length = this.cap;
      this.worst.set(k, arr[this.cap - 1][0]);
    }
  }
  /** Finish: apply the cap to every species and put rows in id order. */
  seal(): void {
    for (const [k, arr] of this.by) {
      this.trim(k, arr);
      arr.sort((a, b) => a[1] - b[1]);
    }
  }
  get(key: number): GbifOccurrence[] | undefined {
    const arr = this.by.get(key);
    return arr?.map((r) => ({
      key: r[1],
      decimalLatitude: r[2],
      decimalLongitude: r[3],
      year: r[4] || undefined,
      countryCode: r[5] || undefined,
      basisOfRecord: r[6] || undefined,
      license: r[7] || undefined,
      datasetKey: r[8] || undefined,
      establishmentMeans: r[9] || undefined,
      coordinateUncertaintyInMeters: r[10] || undefined,
      downloadDoi: this.doi
    }));
  }
  get species(): number {
    return this.by.size;
  }
  /** Rows currently held, over every species. */
  get kept(): number {
    let n = 0;
    for (const a of this.by.values()) n += a.length;
    return n;
  }
}

/* ------------------------------------------------------------------ GBIF multimedia (DWCA downloads) */

export interface MediaRow {
  gbifID: number;
  identifier: string;
  license?: string;
  creator?: string;
  rightsHolder?: string;
  references?: string;
  type?: string;
  format?: string;
}

/** One multimedia.txt row by its header (tab-delimited, no quoting). */
export function parseMediaRow(h: string[], line: string): MediaRow | null {
  const c = line.replace(/\r$/, '').split('\t');
  const g: Record<string, string> = {};
  for (let i = 0; i < h.length; i++) g[h[i]] = c[i] ?? '';
  const id = Number(g.gbifID);
  if (!Number.isFinite(id) || !g.identifier) return null;
  return { gbifID: id, identifier: g.identifier, license: g.license || undefined, creator: g.creator || undefined, rightsHolder: g.rightsHolder || undefined, references: g.references || undefined, type: g.type || undefined, format: g.format || undefined };
}

/**
 * Photographs from the download's multimedia.txt: for the observation records
 * OccIndex marked as carrying images, the image rows with an open licence, up
 * to thirty a species. Served to the builder in the shape of GBIF's media
 * search, so the media adapter and the dossier cannot tell the paths apart.
 */
export class MediaIndex {
  private by = new Map<number, Array<{ gbifID: number; m: MediaRow }>>();
  static readonly CAP = 30;
  constructor(private ownerOf: Map<number, number>) {}
  add(m: MediaRow): void {
    const k = this.ownerOf.get(m.gbifID);
    if (!k) return;
    if (m.type && !/still/i.test(m.type)) return;
    if (m.format && !/^image\//i.test(m.format)) return;
    if (!isOpen(licenceTag(m.license))) return; // the per-photo licence decides; a CC-BY-NC image is not served
    const arr = this.by.get(k) ?? [];
    if (arr.length >= MediaIndex.CAP) return;
    arr.push({ gbifID: m.gbifID, m });
    this.by.set(k, arr);
  }
  /** As GBIF's occurrence search with mediaType=StillImage would answer: one occurrence per record, its media on it. */
  page(key: number): OccPage | undefined {
    const rows = this.by.get(key);
    if (!rows) return undefined;
    const byRec = new Map<number, GbifOccurrence>();
    for (const { gbifID, m } of rows) {
      const o = byRec.get(gbifID) ?? { key: gbifID, basisOfRecord: 'HUMAN_OBSERVATION', media: [] };
      o.media!.push({ type: 'StillImage', identifier: m.identifier, license: m.license, rightsHolder: m.rightsHolder, creator: m.creator, references: m.references });
      byRec.set(gbifID, o);
    }
    const results = [...byRec.values()];
    return { results, endOfRecords: true, count: results.length };
  }
  get species(): number {
    return this.by.size;
  }
}

/* ------------------------------------------------------------------ the wrapping fetcher */

const RE_SPECIES = /\/species\/(\d+)$/;
const RE_DIST = /\/species\/(\d+)\/distributions/;
const RE_OCC = /\/occurrence\/search\?taxonKey=(\d+)&hasCoordinate=true/;
const RE_MEDIA = /\/occurrence\/search\?taxonKey=(\d+)&mediaType=StillImage/;

export interface BulkSources {
  wcvp?: WcvpIndex;
  occ?: OccIndex;
  media?: MediaIndex;
}

/**
 * Answer distribution and occurrence requests from the bulk files; pass the
 * rest through. When a file has nothing for a species the request falls
 * through to the API, so a name missing from the download still builds.
 */
export function bulkFetcher(base: JsonFetcher, src: BulkSources, stats = { wcvp: 0, occ: 0, media: 0, through: 0 }): JsonFetcher & { stats: typeof stats } {
  const names = new Map<number, { name: string; authorship?: string }>(); // key → canonical name and authorship, learned from /species/{key} on the way past
  const f = async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    let m: RegExpExecArray | null;
    if (src.wcvp && (m = RE_DIST.exec(url))) {
      const key = Number(m[1]);
      let sp = names.get(key);
      if (!sp) {
        const r = await base<GbifSpecies>(url.replace(/\/distributions.*$/, ''));
        if (r.status === 'ok') names.set(key, (sp = { name: r.data.canonicalName ?? r.data.scientificName, authorship: r.data.authorship }));
      }
      const got = sp ? src.wcvp.distributions(sp.name, sp.authorship) : null;
      if (got === 'ambiguous') {
        // WCVP holds this name twice and neither authorship matches the backbone's: no range, and the dossier says why.
        stats.wcvp++;
        return { status: 'ok', data: { results: [], ambiguous: `WCVP lists ${sp!.name} more than once and the backbone's authorship (${sp!.authorship ?? 'none given'}) matches neither` } as unknown as T };
      }
      if (got) {
        stats.wcvp++;
        return { status: 'ok', data: { results: got.rows, kew: got.kew } as unknown as T };
      }
    } else if (src.media && (m = RE_MEDIA.exec(url))) {
      const page = src.media.page(Number(m[1]));
      if (page) {
        stats.media++;
        return { status: 'ok', data: page as unknown as T };
      }
    } else if (src.occ && (m = RE_OCC.exec(url))) {
      const key = Number(m[1]);
      const rows = src.occ.get(key);
      if (rows) {
        stats.occ++;
        const page: OccPage = { results: rows, endOfRecords: true, count: rows.length };
        return { status: 'ok', data: page as unknown as T };
      }
    }
    stats.through++;
    const r = await base<T>(url, opts);
    if ((m = RE_SPECIES.exec(url)) && r.status === 'ok') {
      const sp = r.data as unknown as GbifSpecies;
      if (sp?.canonicalName) names.set(Number(m[1]), { name: sp.canonicalName, authorship: sp.authorship });
    }
    return r;
  };
  return Object.assign(f, { stats });
}
