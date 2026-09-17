/**
 * Bulk sources for a large corpus build. Per-species API calls are the wrong
 * shape at thousands of species; two downloads replace the two slowest legs:
 *
 *   WCVP  — Kew's World Checklist of Vascular Plants, one zip with
 *           wcvp_names.csv and wcvp_distribution.csv (pipe-delimited).
 *   GBIF  — one occurrence download (SIMPLE_CSV, tab-delimited) for every
 *           taxon key in the list, requested by scripts/gbif-download.ts.
 *
 * Nothing in buildDossier() changes: bulkFetcher() wraps the ordinary fetcher
 * and answers the distribution and occurrence URLs from the files, passing
 * everything else (backbone, photos, Wikipedia, literature) through. The
 * dossier records the same upstream names, so a reader cannot tell which
 * path built it, and neither can the tests.
 */
import type { JsonFetcher, FetchResult, FetchOptions } from './fetch';
import type { GbifDistribution, GbifOccurrence, OccPage, GbifSpecies } from './sources/gbif';

/* ------------------------------------------------------------------ WCVP */

export interface WcvpName {
  id: string;
  name: string; // taxon_name, e.g. "Tylecodon pearsonii"
  status: string; // Accepted | Synonym | Unplaced | ...
  acceptedId: string; // accepted_plant_name_id (self for accepted names)
  rank: string;
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
  return { id: r.plant_name_id, name: r.taxon_name, status: r.taxon_status, acceptedId: r.accepted_plant_name_id || r.plant_name_id, rank: r.taxon_rank, lifeform: r.lifeform_description || undefined, climate: r.climate_description || undefined };
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
export class WcvpIndex {
  private byName = new Map<string, WcvpName>(); // lower-cased taxon_name → row (accepted or synonym)
  private byId = new Map<string, WcvpName>();
  private dist = new Map<string, WcvpDist[]>(); // accepted plant_name_id → rows

  /** First pass: keep every row whose name is wanted, and every accepted row (small: ~350k) so synonyms can resolve. */
  addName(n: WcvpName, wanted: (name: string) => boolean): void {
    if (n.status === 'Accepted') this.byId.set(n.id, n);
    if (wanted(n.name)) {
      const k = n.name.toLowerCase();
      const prev = this.byName.get(k);
      // Prefer an accepted homonym over a synonym of the same spelling.
      if (!prev || (prev.status !== 'Accepted' && n.status === 'Accepted')) this.byName.set(k, n);
    }
  }
  /** The accepted ids the second pass must keep. */
  acceptedIds(): Set<string> {
    const s = new Set<string>();
    for (const n of this.byName.values()) s.add(n.acceptedId);
    return s;
  }
  addDist(d: WcvpDist): void {
    const arr = this.dist.get(d.id) ?? [];
    arr.push(d);
    this.dist.set(d.id, arr);
  }
  /** Resolve a name (as GBIF gives it, canonical) to its accepted WCVP record. */
  accepted(name: string): WcvpName | undefined {
    const n = this.byName.get(name.toLowerCase());
    if (!n) return undefined;
    return n.status === 'Accepted' ? n : (this.byId.get(n.acceptedId) ?? n);
  }
  /** Distribution rows in the shape gbif.distributions() returns, so build.ts needs no new branch. */
  distributions(name: string): GbifDistribution[] | null {
    const a = this.accepted(name);
    if (!a) return null;
    const rows = this.dist.get(a.id);
    if (!rows?.length) return null;
    return rows
      .filter((d) => !d.doubtful)
      .map((d) => ({ locationId: `TDWG:${d.l3}`, locality: d.area, establishmentMeans: d.introduced ? 'INTRODUCED' : d.extinct ? 'NATIVE (extinct)' : 'NATIVE', status: d.extinct ? 'extinct' : undefined, source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' }));
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
  const lat = Number(g.decimalLatitude), lon = Number(g.decimalLongitude);
  if (!g.decimalLatitude || !g.decimalLongitude || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return {
    key: Number(g.gbifID),
    decimalLatitude: lat,
    decimalLongitude: lon,
    year: g.year ? Number(g.year) : undefined,
    countryCode: g.countryCode || undefined,
    basisOfRecord: g.basisOfRecord || undefined,
    license: g.license || undefined,
    datasetKey: g.datasetKey || undefined,
    establishmentMeans: g.establishmentMeans || undefined,
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
 * most 900; a download can hold half a million for a weed. Each species keeps
 * the `cap` rows with the smallest id-hash: a uniform sample, decided row by
 * row so memory stays bounded while the file streams, and deterministic so a
 * rebuild finds the same habitat centre.
 */
export class OccIndex {
  private by = new Map<number, Array<GbifOccurrence & { h: number }>>();
  constructor(private cap = 4000) {}
  add(o: GbifOccurrence & { speciesKey?: number; taxonKey?: number }): void {
    const h = idHash(o.key);
    for (const k of new Set([o.speciesKey, o.taxonKey])) {
      if (!k) continue;
      const arr = this.by.get(k) ?? [];
      arr.push({ ...o, h });
      if (arr.length > this.cap * 2) this.trim(arr);
      this.by.set(k, arr);
    }
  }
  private trim(arr: Array<GbifOccurrence & { h: number }>): void {
    arr.sort((a, b) => a.h - b.h);
    arr.length = Math.min(arr.length, this.cap);
  }
  /** Finish: apply the cap to every species and put rows in id order. */
  seal(): void {
    for (const arr of this.by.values()) {
      this.trim(arr);
      arr.sort((a, b) => a.key - b.key);
    }
  }
  get(key: number): GbifOccurrence[] | undefined {
    return this.by.get(key);
  }
  get species(): number {
    return this.by.size;
  }
}

/* ------------------------------------------------------------------ the wrapping fetcher */

const RE_SPECIES = /\/species\/(\d+)$/;
const RE_DIST = /\/species\/(\d+)\/distributions/;
const RE_OCC = /\/occurrence\/search\?taxonKey=(\d+)&hasCoordinate=true/;

export interface BulkSources {
  wcvp?: WcvpIndex;
  occ?: OccIndex;
}

/**
 * Answer distribution and occurrence requests from the bulk files; pass the
 * rest through. When a file has nothing for a species the request falls
 * through to the API, so a name missing from the download still builds.
 */
export function bulkFetcher(base: JsonFetcher, src: BulkSources, stats = { wcvp: 0, occ: 0, through: 0 }): JsonFetcher & { stats: typeof stats } {
  const names = new Map<number, string>(); // key → canonical name, learned from /species/{key} on the way past
  const f = async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    let m: RegExpExecArray | null;
    if (src.wcvp && (m = RE_DIST.exec(url))) {
      const key = Number(m[1]);
      let name = names.get(key);
      if (!name) {
        const sp = await base<GbifSpecies>(url.replace(/\/distributions.*$/, ''));
        if (sp.status === 'ok') name = sp.data.canonicalName ?? sp.data.scientificName;
      }
      const rows = name ? src.wcvp.distributions(name) : null;
      if (rows) {
        stats.wcvp++;
        return { status: 'ok', data: { results: rows } as unknown as T };
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
      if (sp?.canonicalName) names.set(Number(m[1]), sp.canonicalName);
    }
    return r;
  };
  return Object.assign(f, { stats });
}
