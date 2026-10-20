/**
 * The occurrence rules a record's coordinates alone decide (round seventy-nine, Q: the owner's decision 5, read against
 * CoordinateCleaner's tests on round seventy-seven's corpus with scripts/dev/r79q-*, which need R and are dev tools only).
 *
 * A record placed at a botanic garden, an arboretum, a herbarium or a zoo is a planted plant in a wild climate's
 * envelope, or a specimen placed at the address of the institution that keeps it, and says nothing of where the species
 * grows wild: it is left out of the range map, the marker and the habitat climate, and the record of the occurrence
 * source counts it. The places are Wikidata's (CC0), in scripts/institutions.txt, written by
 * scripts/institutions-fetch.ts; nothing is matched by name. The rule is CoordinateCleaner's institution test in
 * substance (Zizka et al. 2019, Methods Ecol. Evol. 10: 744); none of that package's code or data is used here.
 */
import { haversineKm } from '$core/geo';

export const INSTITUTION_KINDS = ['botanic garden', 'herbarium', 'zoo'] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];
export interface Place {
  id: string;
  kind: InstitutionKind;
  lat: number;
  lon: number;
}

/**
 * How near a place a record must lie to be counted at it, in metres. CoordinateCleaner's default is 100 m, but a
 * garden's coordinate on Wikidata is one point of grounds that often run to a kilometre, and the corpus's points are
 * written to three decimals, about a hundred metres. On round seventy-seven's corpus (round seventy-nine, Q), of the
 * kept points around Kirstenbosch (Wikidata's Q289277) 28 lay within 100 m of its point and 305 within 1 km, among them
 * Encephalartos villosus and Afrocarpus falcatus, whose wild stands lie far east of Cape Town; around the Missouri
 * Botanical Garden (Q1852803) 8 and 83, nearly all herbarium sheets placed at the herbarium. Across the corpus, 1,985
 * points of 1,063 species at 100 m, 20,701 of 2,651 at 1 km.
 */
export const INSTITUTION_RADIUS_M = 1000;

/** The places of scripts/institutions.txt (item, kind, latitude, longitude, tab-separated; `#` lines are its header). */
export function parsePlaces(text: string): Place[] {
  const out: Place[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const [id, kind, la, lo] = line.split('\t');
    const lat = Number(la), lon = Number(lo);
    if (!id || !(INSTITUTION_KINDS as readonly string[]).includes(kind) || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ id, kind: kind as InstitutionKind, lat, lon });
  }
  return out;
}

/** The places, held in cells a tenth of a degree square, so a record is tested against only the few around it. */
export class PlaceIndex {
  private cells = new Map<string, Place[]>();
  readonly size: number;
  constructor(places: readonly Place[], readonly radiusM = INSTITUTION_RADIUS_M) {
    for (const p of places) {
      const k = PlaceIndex.cellKey(Math.floor(p.lat * 10), Math.floor(p.lon * 10));
      const arr = this.cells.get(k) ?? [];
      arr.push(p);
      this.cells.set(k, arr);
    }
    this.size = places.length;
  }
  private static cellKey(row: number, col: number): string {
    return `${row}:${col}`;
  }
  /** The nearest place within the radius of a coordinate, or undefined. */
  near(lat: number, lon: number): Place | undefined {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const km = this.radiusM / 1000;
    const dLat = km / 111.2;
    // A degree of longitude shrinks towards the poles; near them every column is searched.
    const cos = Math.cos((Math.min(89.9, Math.abs(lat) + dLat) * Math.PI) / 180);
    const dLon = Math.min(180, km / (111.2 * cos));
    let best: Place | undefined, bestKm = Infinity;
    for (let r = Math.floor((lat - dLat) * 10); r <= Math.floor((lat + dLat) * 10); r++) {
      for (let c = Math.floor((lon - dLon) * 10); c <= Math.floor((lon + dLon) * 10); c++) {
        // Across the antimeridian the columns wrap.
        const cc = ((((c + 1800) % 3600) + 3600) % 3600) - 1800;
        for (const p of this.cells.get(PlaceIndex.cellKey(r, cc)) ?? []) {
          const d = haversineKm(lat, lon, p.lat, p.lon);
          if (d <= km && d < bestKm) {
            best = p;
            bestKm = d;
          }
        }
      }
    }
    return best;
  }
}

/** The words the record of the occurrence source adds for the records the rule left out ("" when it left none out). */
export function institutionWords(n: number, kinds: ReadonlyMap<InstitutionKind, number>, radiusM = INSTITUTION_RADIUS_M): string {
  if (!n) return '';
  const said = INSTITUTION_KINDS.filter((k) => kinds.get(k)).map((k) => `${kinds.get(k)} at ${k === 'botanic garden' ? 'a botanic garden or arboretum' : `a ${k}`}`);
  return `${n} record${n === 1 ? '' : 's'} within ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`} of a botanic garden, herbarium or zoo left out (${said.join(', ')}; Wikidata's list)`;
}

/** The records a page's record of the occurrence source says the rule left out (the count `institutionWords` writes), or 0. */
export function institutionsLeftOut(detail: string | undefined): number {
  const m = /(?:^|; )(\d+) records? within \d+(?:\.\d+)? (?:k?m) of a botanic garden, herbarium or zoo left out/.exec(detail ?? '');
  return m ? Number(m[1]) : 0;
}

/** True when a page's record of the occurrence source shows the institution rule was applied to it (left none, some, or said untested). */
function ruleSeen(detail: string | undefined): boolean {
  return /of a botanic garden, herbarium or zoo left out|not tested against botanic gardens, herbaria and zoos/.test(detail ?? '');
}

type Paged = { key: string; name: { scientific: string }; upstream: Record<string, { detail?: string } | undefined>; climate: { status: string; cells?: number } };

/**
 * The rule's effect across a build (round seventy-nine, Q), for the build's log: what it left out, and the habitat
 * climate of those species beside the page the build before wrote, where that page had no such rule. The climate can be
 * read only where the grid is (the owner's PC), so this is where its effect is measured; the records of the two builds
 * may differ for other reasons too (a newer download), which the words say.
 */
export class InstitutionEffect {
  records = 0;
  species = 0;
  withClimate = 0;
  /** Species whose page before (built without the rule) had a habitat climate, with its cells then and now. */
  compared = 0;
  cellsBefore = 0;
  cellsNow = 0;
  lost: string[] = [];
  add(d: Paged, prev?: Paged | null): void {
    const n = institutionsLeftOut(d.upstream['gbif.occurrences']?.detail);
    if (!n) return;
    this.records += n;
    this.species++;
    if (d.climate.status === 'ok') this.withClimate++;
    if (!prev || prev.climate.status !== 'ok' || ruleSeen(prev.upstream['gbif.occurrences']?.detail)) return;
    if (d.climate.status === 'ok') {
      this.compared++;
      this.cellsBefore += prev.climate.cells ?? 0;
      this.cellsNow += d.climate.cells ?? 0;
    } else this.lost.push(`${d.name.scientific} [${d.key}]: ${n} record${n === 1 ? '' : 's'} left out; climate ${d.climate.status}, ${prev.climate.cells ?? '?'} cell${prev.climate.cells === 1 ? '' : 's'} before`);
  }
  /** One paragraph for the log ("" when the rule left nothing out). */
  words(places: number, radiusM = INSTITUTION_RADIUS_M): string {
    if (!this.records) return '';
    const r = radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`;
    const cmp = this.compared || this.lost.length
      ? `; beside the pages the build before wrote without the rule (whose records may differ for other reasons too), ${this.compared} kept a habitat climate, on ${this.cellsNow} grid cells where they had ${this.cellsBefore}, and ${this.lost.length} lost it${this.lost.length ? ':\n' + this.lost.map((l) => `    ${l}`).join('\n') : ''}`
      : '; no page the build before wrote without the rule had a habitat climate to compare';
    return `  Institution rule (Wikidata's ${places} botanic gardens, herbaria and zoos, ${r}): ${this.records} record${this.records === 1 ? '' : 's'} of ${this.species} species left out; ${this.withClimate} of those species have a habitat climate${cmp}`;
  }
}
