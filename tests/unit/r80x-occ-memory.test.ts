/**
 * Round eighty, agent X: the occurrence sample holds the full list's download in the builder's heap.
 *
 * The full build's download is about 146 million records of 47,116 keys; the sample keeps up to 2,000 a key (2,500 while
 * it streams). On a random 500 of the list's keys, a key keeps 726 on average (GBIF's count API, 2026-10-21), so about
 * 34 million rows are held for the whole build. Round seventy-nine's sample held each row as a 15-element array, 241 bytes
 * of heap: about 8.3 GB, past the 8 GB the corpus step gives the builder, so the build would stop at the download's read.
 * The rows are now kept in typed arrays, at 80 bytes, and every answer the sample gives is the same.
 *
 * On r80base the first test fails (241 bytes a row); the second passes there too, being the old rule's own answers.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { OccIndex, idHash } from '$lib/dossier/bulk';
import type { GbifOccurrence } from '$lib/dossier/sources/gbif';

type In = GbifOccurrence & { speciesKey?: number; taxonKey?: number; acceptedTaxonKey?: number };

/** Round seventy-nine's sample of the records, as it was (`OccIndex`'s record half, unchanged), for the comparison. */
class OldSample {
  private by = new Map<number, Array<[number, number, number, number, number, string, string, string, string, string, number, number, number, number, number]>>();
  private worst = new Map<number, number>();
  private parts: Array<{ doi?: string; day?: string }> = [];
  private part = -1;
  doi?: string;
  day?: string;
  constructor(private cap: number, private wanted?: Set<number>) {}
  startPart(doi?: string, day?: string) { this.parts.push({ doi, day }); this.part = this.parts.length - 1; }
  add(o: In) {
    const h = idHash(o.key);
    for (const k of new Set([o.speciesKey, o.taxonKey, o.acceptedTaxonKey])) {
      if (!k || (this.wanted && !this.wanted.has(k)) || h >= (this.worst.get(k) ?? Infinity)) continue;
      const arr = this.by.get(k) ?? [];
      arr.push([h, o.key, o.decimalLatitude ?? NaN, o.decimalLongitude ?? NaN, o.year ?? 0, o.countryCode ?? '', o.basisOfRecord ?? '', o.license ?? '', o.datasetKey ?? '', o.establishmentMeans ?? '', o.coordinateUncertaintyInMeters ?? 0, o.coordDecimals ?? -1, o.coordinatePrecision ?? 0, o.taxonKey ?? 0, this.part]);
      if (arr.length > this.cap * 1.25) this.trim(k, arr);
      this.by.set(k, arr);
    }
  }
  private trim(k: number, arr: Array<[number, number, ...unknown[]]>) {
    arr.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let w = 0;
    for (let r = 0; r < arr.length; r++) if (!w || arr[r][1] !== arr[w - 1][1]) arr[w++] = arr[r];
    arr.length = w;
    if (arr.length > this.cap) { arr.length = this.cap; this.worst.set(k, arr[this.cap - 1][0]); }
  }
  seal() { for (const [k, arr] of this.by) { this.trim(k, arr as never); arr.sort((a, b) => a[1] - b[1]); } }
  get(key: number) {
    return this.by.get(key)?.map((r) => ({
      key: r[1], decimalLatitude: r[2], decimalLongitude: r[3], year: r[4] || undefined, countryCode: r[5] || undefined, basisOfRecord: r[6] || undefined, license: r[7] || undefined, datasetKey: r[8] || undefined, establishmentMeans: r[9] || undefined, coordinateUncertaintyInMeters: r[10] || undefined, coordDecimals: r[11] >= 0 ? r[11] : undefined, coordinatePrecision: r[12] || undefined,
      ...(r[13] ? { taxonKey: r[13] } : {}), downloadDoi: this.parts[r[14]]?.doi ?? this.doi, ...((this.parts[r[14]]?.day ?? this.day) ? { downloadDay: this.parts[r[14]]?.day ?? this.day } : {})
    }));
  }
  get species() { return this.by.size; }
  get kept() { let n = 0; for (const a of this.by.values()) n += a.length; return n; }
}

/** A reproducible stream of records: species, their subspecies and synonyms, repeats across parts, odd values. */
function records(n: number, seed: number): In[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const out: In[] = [];
  for (let i = 0; i < n; i++) {
    const sp = 100 + Math.floor(rnd() * 12);
    const kind = rnd();
    const id = rnd() < 0.05 && out.length ? out[Math.floor(rnd() * out.length)].key : 1 + Math.floor(rnd() * 6e9);
    out.push({
      key: id,
      decimalLatitude: Number((rnd() * 180 - 90).toFixed(Math.floor(rnd() * 7))),
      decimalLongitude: Number((rnd() * 360 - 180).toFixed(Math.floor(rnd() * 7))),
      coordDecimals: rnd() < 0.1 ? undefined : Math.floor(rnd() * 8),
      coordinatePrecision: rnd() < 0.8 ? undefined : pick([0.0001, 0.01, 1]),
      year: rnd() < 0.1 ? undefined : rnd() < 0.02 ? NaN : 1750 + Math.floor(rnd() * 277),
      countryCode: rnd() < 0.05 ? undefined : pick(['ZA', 'US', 'MX', 'NA', 'AU']),
      basisOfRecord: rnd() < 0.02 ? undefined : pick(['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN', 'LIVING_SPECIMEN', 'OCCURRENCE']),
      license: rnd() < 0.03 ? undefined : pick(['CC0_1_0', 'CC_BY_4_0', 'CC_BY_NC_4_0', 'http://creativecommons.org/licenses/by/4.0/legalcode']),
      datasetKey: pick(['50c9509d-22c7-4a22-a47d-8c48425ef4a7', '7a3679ef-5582-4aaa-81f0-8c2545cafc81', 'd415c253-4d61-4459-9d25-4015b9084fb0', undefined]),
      establishmentMeans: rnd() < 0.85 ? undefined : pick(['Introduced', 'Managed', 'Native', 'Introduced Cultivated']),
      coordinateUncertaintyInMeters: rnd() < 0.5 ? undefined : pick([1, 30, 1592, 2881.5, 25000]),
      speciesKey: sp,
      taxonKey: kind < 0.7 ? sp : kind < 0.85 ? sp * 1000 + 1 : rnd() < 0.5 ? NaN : sp * 1000 + 2,
      ...(kind > 0.7 ? { acceptedTaxonKey: kind < 0.85 ? sp * 1000 + 1 : sp } : {})
    });
  }
  return out;
}

describe('round eighty, X: the occurrence sample at the full list\'s size', () => {
  // 82 bytes alone, up to 120 measured while the whole suite runs beside it; 241 before, under any load.
  it('holds a kept row in at most 150 bytes of memory (round seventy-nine: 241)', () => {
    const { NODE_OPTIONS: _, ...env } = process.env;
    const r = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', 'scripts/dev/r80x-occ-memory.ts', '400', '500'], { encoding: 'utf8', env });
    expect(r.status, r.stderr).toBe(0);
    const m = JSON.parse(r.stdout.trim().split('\n').pop()!) as { kept: number; bytesPerRow: number };
    expect(m.kept).toBe(200_000);
    expect(m.bytesPerRow).toBeLessThanOrEqual(150);
  }, 60_000);

  it('gives every answer round seventy-nine\'s sample gave: the same records, in the same order, with every field', () => {
    for (const [cap, wanted, n, seed] of [[3, undefined, 400, 1], [50, new Set([100, 101, 102, 103, 104, 105, 106, 107, 101001, 103002]), 20_000, 2], [2000, undefined, 30_000, 3], [7, new Set([100, 100001, 100002]), 5_000, 4]] as const) {
      const a = new OccIndex(cap, wanted as Set<number> | undefined), b = new OldSample(cap, wanted as Set<number> | undefined);
      a.doi = b.doi = '10.15468/dl.whole';
      a.day = b.day = '2026-10-20';
      const recs = records(n, seed);
      // Two parts, the second repeating some of the first's records (a key asked in both).
      for (const [pi, part] of [recs.slice(0, n / 2), recs.slice(n / 2 - n / 10)].entries()) {
        a.startPart(`10.15468/dl.part${pi}`, `2026-10-2${pi}`); b.startPart(`10.15468/dl.part${pi}`, `2026-10-2${pi}`);
        for (const o of part) { a.add(o); b.add(o); }
      }
      a.seal(); b.seal();
      expect(a.species).toBe(b.species);
      expect(a.kept).toBe(b.kept);
      for (const k of [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 100001, 101001, 103002, 999]) expect(a.get(k), `key ${k}, cap ${cap}`).toEqual(b.get(k));
    }
    // A sample read with no part (a plain file) cites the download's own DOI and day.
    const a = new OccIndex(5), b = new OldSample(5);
    a.doi = b.doi = '10.15468/dl.plain';
    for (const o of records(200, 9)) { a.add(o); b.add(o); }
    a.seal(); b.seal();
    expect(a.get(100)).toEqual(b.get(100));
  });
});
