/**
 * Round-five probes of the derivations. Each `it` states what the code's own
 * comments or the page wording claim; a failing probe is a finding. Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-derivations.probe.test.ts
 */
import { describe, it, expect } from 'vitest';
import { habitatCluster, habitatCentre } from '$core/geo';
import { cultivationSheet, growingYear, coldFloor } from '$core/sheet';
import { careLine, generatedNote } from '$core/note';
import { firstSentences } from '$core/text';
import { cellOf, makeHeader, encodeCell } from '$lib/climate/grid';
import { makeClimateProvider } from '$lib/climate/provider';
import { memoryGridSource } from '$lib/climate/source';
import { climograph } from '$lib/climate/climograph';
import { WcvpIndex, OccIndex, parseOccRow, occHeader, MediaIndex, parseMediaRow, idHash } from '$dossier/bulk';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';
import { buildBundle } from '../../scripts/export-corpus-lib';
import { GBIF } from '$dossier/sources/gbif';

const NC = 'http://creativecommons.org/licenses/by-nc/4.0/legalcode';
const BY = 'http://creativecommons.org/licenses/by/4.0/legalcode';
const opts = (table: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ fetcher: fixtureFetcher(table), builtBy: 'node' as const, now: () => new Date('2026-09-20T12:00:00Z'), ...extra });
const mk = (tmean: number[], pr: number[], dli = 30) => tmean.map((t, i) => ({ tmax: t + 5, tmin: t - 5, tmean: t, precipMm: pr[i], dli, rh: 70 }));

/** A flat 12-month cell for the memory grid. */
function cellBuf(h: ReturnType<typeof makeHeader>, tmin: number, elev = 500, pr = 10) {
  const vals: Record<string, number> = { elev };
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    vals[`tasmax_${mm}`] = tmin + 12;
    vals[`tasmin_${mm}`] = tmin;
    vals[`tas_${mm}`] = tmin + 6;
    vals[`pr_${mm}`] = pr;
    vals[`rsds_${mm}`] = 20;
    vals[`hurs_${mm}`] = 60;
  }
  return encodeCell(h, vals);
}
/** A POWER series of `years` years with `frostNights` nights at `frostT`, the rest at 8 °C. */
function powerSeries(years: number, frostNights: number, frostT = -0.5) {
  const dates: string[] = [], tmin: number[] = [], tmax: number[] = [];
  let left = frostNights;
  for (let y = 1981; y < 1981 + years; y++)
    for (let d = 0; d < 365; d++) {
      dates.push(new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10));
      tmin.push(left-- > 0 ? frostT : 8);
      tmax.push(22);
    }
  return { cell: 'x', elevationM: 500, series: { dates, tmin, tmax, precip: [] } };
}

/* ------------------------------------------------------------------ geo */
describe('geo: the cell-centre snap', () => {
  it('never returns a restricted record’s own coordinate (how#marker: "a restricted record’s coordinates are never published")', () => {
    // Three CC BY-NC records given to two decimals, one of them sitting exactly on a tenth-degree cell centre; no open record.
    const nc: Array<[number, number]> = [
      [-24.85, -70.45],
      [-24.84, -70.44],
      [-24.86, -70.46]
    ];
    const c = habitatCluster(nc)!;
    const at = habitatCentre(c, []);
    expect(at.snapped).toBe('cell-centre');
    const hit = nc.some((p) => p[0] === at.lat && p[1] === at.lon);
    expect({ at, hit }).toEqual({ at: expect.anything(), hit: false });
  });
  it('the float guard: for how many tenth-degree centres does floor(x*10)/10+0.05 !== x?', () => {
    let bad = 0, n = 0;
    for (let i = -900; i <= 900; i++) {
      const x = +(i / 10 + 0.05).toFixed(3);
      n++;
      if (Math.floor(x * 10) / 10 + 0.05 !== x) bad++;
    }
    expect({ bad, n }).toEqual({ bad: 0, n });
  });
  it('the runner-up rule: two populations bridged by one stray record are one cluster and the marker lands on the stray', () => {
    const A: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => [0.5 + i / 100, 0.5 + i / 100]);
    const B: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => [0.5 + i / 100, 2.5 + i / 100]);
    const C: Array<[number, number]> = [[0.55, 1.55]];
    const all = [...A, ...B, ...C];
    const c = habitatCluster(all)!;
    const at = habitatCentre(c, all);
    expect({ n: c.n, share: c.share, dominant: c.dominant, marker: [at.lat, at.lon] }).toEqual({ n: 21, share: 1, dominant: true, marker: expect.not.arrayContaining([1.55]) });
  });
});

/* ------------------------------------------------------------------ provider */
describe('provider: envelope()', () => {
  const h = makeHeader();
  it('climate.at is the first record’s coordinate in the typical cell, restricted or not; the page prints it', async () => {
    // Three cells; the typical (median coldest night) one holds only a CC BY-NC record.
    const cells = new Map<string, ArrayBuffer>();
    const pts: Array<[number, number]> = [
      [-24.912, -70.437], // restricted, cold 5 (typical)
      [-24.7, -70.6], // open, cold 2
      [-24.5, -70.2] // open, cold 9
    ];
    cells.set(cellOf(h, ...pts[0]).id, cellBuf(h, 5));
    cells.set(cellOf(h, ...pts[1]).id, cellBuf(h, 2));
    cells.set(cellOf(h, ...pts[2]).id, cellBuf(h, 9));
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'refused', detail: 'x' }) as never, noExtremes: true });
    const c = await p.envelope(pts);
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.at).not.toEqual({ lat: -24.912, lon: -70.437 });
  });
  it('through buildDossier: a CC BY-NC record’s coordinate reaches the dossier as climate.at although occurrences.open excludes it', async () => {
    const fx = copiapoa();
    const key = 5384013;
    const cells = new Map<string, ArrayBuffer>();
    const rec = (k: number, lat: number, lon: number, lic: string) => ({ key: k, decimalLatitude: lat, decimalLongitude: lon, license: lic, basisOfRecord: 'HUMAN_OBSERVATION', datasetKey: 'ds' });
    const restricted = [-24.912, -70.437] as const;
    const rows = [rec(1, restricted[0], restricted[1], NC), rec(2, -24.7, -70.6, BY), rec(3, -24.5, -70.2, BY), rec(4, -24.3, -70.1, BY)];
    cells.set(cellOf(h, restricted[0], restricted[1]).id, cellBuf(h, 5));
    cells.set(cellOf(h, -24.7, -70.6).id, cellBuf(h, 2));
    cells.set(cellOf(h, -24.5, -70.2).id, cellBuf(h, 9));
    cells.set(cellOf(h, -24.3, -70.1).id, cellBuf(h, 12));
    fx[`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=${key}&hasCoordinate`] = { count: 4, endOfRecords: true, results: rows };
    const climate = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'refused', detail: 'x' }) as never, noExtremes: true });
    const r = await buildDossier('Copiapoa cinerea', opts(fx, { climate }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.dossier;
    expect(d.occurrences.open.some((p) => p[0] === restricted[0] && p[1] === restricted[1])).toBe(false);
    expect(d.climate.status).toBe('ok');
    if (d.climate.status !== 'ok') return;
    expect(d.climate.at).not.toEqual({ lat: restricted[0], lon: restricted[1] });
  });
  it('frost nights: 2 nights at −0.5 °C in 44 years are rounded to 0.0 a year and the sheet says "no frost recorded" beside an absolute minimum below zero', async () => {
    const cells = new Map([[cellOf(h, -24.9, -70.5).id, cellBuf(h, 5)]]);
    const ps = powerSeries(44, 2);
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'ok', data: {} }) as never, powerCache: { get: async () => ps, set: async () => {} } });
    const c = await p.at(-24.9, -70.5);
    if (c.status !== 'ok' || !c.extremes) throw new Error('no extremes');
    const { rows } = cultivationSheet({ scientific: 'Testus frigidus', family: 'Cactaceae', months: c.months, extremes: c.extremes, lat: -24.9 });
    const t = rows.find((r) => r.k === 'Temperature')!.s;
    // What the page glance card prints (src/routes/species/[slug]/+page.svelte:224) for the same figure:
    const { frostWording } = await import('$core/extremes');
    const glance = frostWording(c.extremes); // the page's own wording, from the count
    expect({ minAbs: c.extremes.minAbs, frostDaysPerYear: c.extremes.frostDaysPerYear, sheet: /no frost recorded/.test(t), glance }).toEqual({ minAbs: -0.5, frostDaysPerYear: expect.any(Number), sheet: false, glance: '2 frost nights in 44 years' });
  });
  it('a POWER series with no elevation gets no lapse and the provenance does not say so', async () => {
    const cells = new Map([[cellOf(h, -24.9, -70.5).id, cellBuf(h, 5, 3200)]]);
    const ps = { ...powerSeries(44, 0), elevationM: undefined };
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'ok', data: {} }) as never, powerCache: { get: async () => ps, set: async () => {} } });
    const c = await p.at(-24.9, -70.5);
    if (c.status !== 'ok') throw new Error();
    expect({ lapse: c.extremes?.lapseAppliedM, src: c.src.extremes }).toEqual({ lapse: 0, src: expect.stringMatching(/lapse/) });
  });
  it('typical cell: an even number of cells, tie at the interpolated median → the first read wins (documented nowhere)', async () => {
    const cells = new Map<string, ArrayBuffer>();
    const pts: Array<[number, number]> = [[-24.9, -70.5], [-24.7, -70.6], [-24.5, -70.2], [-24.3, -70.1]];
    [10, 0, 5, -5].forEach((t, i) => cells.set(cellOf(h, ...pts[i]).id, cellBuf(h, t)));
    const p = makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: async () => ({ status: 'refused', detail: 'x' }) as never, noExtremes: true });
    const c = await p.envelope(pts);
    if (c.status !== 'ok') throw new Error();
    // median coldest = 2.5; cells at 0 and 5 are equally near. Which one?
    expect(c.cell).toBe(cellOf(h, -24.7, -70.6).id);
  });
});

/* ------------------------------------------------------------------ sheet */
describe('sheet: sentences a grower reads as advice', () => {
  it('the Rain row prints an annual total range no cell has: sum of monthly 10th percentiles across cells with identical annual totals', () => {
    // Three cells, each exactly 120 mm a year, rain in different months.
    const a = mk(Array(12).fill(20), [60, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const b = mk(Array(12).fill(20), [0, 0, 0, 0, 60, 60, 0, 0, 0, 0, 0, 0]);
    const c = mk(Array(12).fill(20), [0, 0, 0, 0, 0, 0, 0, 0, 60, 60, 0, 0]);
    const q = (k: number, idx: number) => [a, b, c].map((y) => y[idx].precipMm).sort((x, y) => x - y)[k];
    const months = a.map((_, i) => ({ ...a[i], precipMm: q(1, i) }));
    const p10 = a.map((_, i) => ({ ...a[i], precipMm: q(0, i) + 0 * 0.2 * (q(1, i) - q(0, i)) }));
    const p90 = a.map((_, i) => ({ ...a[i], precipMm: q(1, i) + 0.8 * (q(2, i) - q(1, i)) }));
    const { rows } = cultivationSheet({ scientific: 'Testus', family: 'Cactaceae', months, p10, p90, lat: -25 });
    const rain = rows.find((r) => r.k === 'Rain')!.s;
    expect(rain).not.toMatch(/the year's total runs 0 mm to 288 mm/);
  });
  it('a wet season 0.3 °C cooler than the year is called a summer season "the warmer half of the year"', () => {
    // 6 °C of annual range (not flat); the wet months Jun–Aug average 18.8 against a yearly mean of 19.2.
    const tmean = [22, 22, 20, 18, 16, 18.8, 18.8, 18.8, 16, 18, 20, 22];
    const pr = [0, 0, 0, 0, 0, 100, 100, 100, 0, 0, 0, 0];
    const y = growingYear(mk(tmean, pr), -25)!;
    const { rows } = cultivationSheet({ scientific: 'Testus', family: 'Cactaceae', months: mk(tmean, pr), lat: -25 });
    const s = rows.find((r) => r.k === 'Its year')!.s;
    expect({ grow: y.grow, wetT: +y.wetT.toFixed(1), meanT: +y.meanT.toFixed(1), s }).toEqual({ grow: 'even', wetT: 18.8, meanT: 19.2, s: expect.stringMatching(/neither the cooler nor the warmer/) });
  });
  it('an equatorial habitat with a flat curve still has its rain months "shifted six months" for the reader', () => {
    const tmean = [24, 24, 24.5, 24.5, 24, 23.5, 23, 23, 23.5, 24, 24, 24];
    const pr = [10, 10, 150, 200, 150, 10, 10, 10, 10, 60, 60, 20];
    const { rows } = cultivationSheet({ scientific: 'Testus aequator', family: 'Cactaceae', months: mk(tmean, pr), lat: -0.5, readerLat: 51 });
    const yr = rows.find((r) => r.k === 'Its year')!;
    expect({ s: yr.s, short: yr.short }).toEqual({ s: expect.not.stringMatching(/shifted six months/), short: expect.not.stringMatching(/September to November/) });
  });
  it('a reader on the equator or with no bench is northern; a habitat at lat 0 is northern too', () => {
    const tmean = [22, 22, 20, 17, 14, 12, 12, 13, 15, 18, 20, 21];
    const pr = [0, 0, 0, 0, 80, 80, 80, 0, 0, 0, 0, 0];
    const at0 = cultivationSheet({ scientific: 'Testus', family: 'Cactaceae', months: mk(tmean, pr), lat: 0, readerLat: 0 }).rows.find((r) => r.k === 'Its year')!;
    const none = cultivationSheet({ scientific: 'Testus', family: 'Cactaceae', months: mk(tmean, pr), lat: -30, readerLat: null }).rows.find((r) => r.k === 'Its year')!;
    expect({ at0: at0.short, none: none.short }).toMatchInlineSnapshot(`
      {
        "at0": "Rain rule: a winter growing season, May to July at the habitat (not shifted).",
        "none": "Rain rule: a winter growing season, November to January in the northern hemisphere (May to July at the habitat, southern).",
      }
    `);
  });
  it('the label line prints a floor below zero with no source or caveat', () => {
    const months = mk([10, 10, 8, 5, 2, 0, 0, 1, 3, 6, 8, 10], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const line = careLine({ scientific: 'Testus andinus', family: 'Cactaceae', months, extremes: { minAbs: -12, minP01: -8.2, maxP99: 28, frostDaysPerYear: 40, years: 44 }, lat: -18 });
    expect(line).toMatchInlineSnapshot(`"rain spread, no season · hab. night -8.2 °C · sky 30–30 DLI"`);
  });
  it('the Temperature "why" says lapse-corrected whatever the provider did', () => {
    const months = mk(Array(12).fill(15), Array(12).fill(10));
    const { rows } = cultivationSheet({ scientific: 'Testus', family: 'Cactaceae', months, extremes: { minAbs: 2, minP01: 4, maxP99: 28, frostDaysPerYear: 0, years: 44 }, lat: -18 });
    expect(rows.find((r) => r.k === 'Temperature')!.why).not.toMatch(/lapse-corrected/);
  });
  it('coldFloor with an archetype minimum and no habitat figure', () => {
    const f = coldFloor(null, null, { arch: { key: 'orchid', lab: 'Orchid', minC: 13 }, tier: 'family', of: 'Orchidaceae', why: 'Orchidaceae, which is usually but not always one kind of plant' });
    expect(f?.s).toMatchInlineSnapshot(`"Cold floor: 13 °C, the archetype table's conventional minimum for a orchid (grouped by Orchidaceae, which is usually but not always one kind of plant); no habitat figure is on file for this species."`);
  });
});

/* ------------------------------------------------------------------ note */
describe('note: generatedNote', () => {
  it('the note for a fog-desert species, reader unknown', () => {
    const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], tmin = [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14];
    const pr = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5];
    const months = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i], dli: 45, rh: 78 }));
    const n = generatedNote({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', months, lat: -24.9 }, {});
    expect(n?.text).toMatchInlineSnapshot(`"Grouped as a cactus or succulent by the genus Copiapoa, which is reliably one kind of plant (archetype table). Rain rule: no rainy season to read (72 mm a year); the temperature rule's cooler six months are November to April in the northern hemisphere. Habitat rain 72 mm a year, wettest June at 13 mm, driest February at 3 mm (habitat calendar, southern hemisphere). Open sky over the habitat: 45 to 45 mol/m²/day. Cold floor 9.0 °C (coldest month's mean night, CHELSA)."`);
  });
});

/* ------------------------------------------------------------------ text */
describe('text: firstSentences', () => {
  it('"Sp. Pl. 1753." is not a sentence end', () => {
    const t = 'Aloe vera is a succulent plant species of the genus Aloe. It was described by L. in Sp. Pl. 1753. It grows in arid regions. It is widely cultivated. It is a fifth sentence.';
    const r = firstSentences(t, 2);
    expect(r.text).toBe('Aloe vera is a succulent plant species of the genus Aloe. It was described by L. in Sp. Pl. 1753.');
  });
  it('a citation with a journal abbreviation followed by a volume number', () => {
    const t = 'Copiapoa cinerea was described in Cact. Succ. J. 4: 12 in 1932. It is endemic to Chile. It forms clumps. It flowers in spring. Extra.';
    expect(firstSentences(t, 2).text).toBe('Copiapoa cinerea was described in Cact. Succ. J. 4: 12 in 1932. It is endemic to Chile.');
  });
  it('the other cases in the brief', () => {
    expect(firstSentences('Haworthia attenuata Haw. f. rubra is a form. Second. Third.', 1).text).toBe('Haworthia attenuata Haw. f. rubra is a form.');
    expect(firstSentences('It is known as "queen of the night". It flowers once. Third.', 1).text).toBe('It is known as "queen of the night".');
    expect(firstSentences('Trailing off... The rest. Third.', 1).text).toMatchInlineSnapshot(`"Trailing off..."`);
    expect(firstSentences('アロエ・ベラは多肉植物である。広く栽培される。', 1)).toMatchInlineSnapshot(`
      {
        "more": false,
        "text": "アロエ・ベラは多肉植物である。広く栽培される。",
      }
    `);
  });
  it('a German lead with "z. B."', () => {
    expect(firstSentences('Die Aloe vera ist eine Pflanzenart, die z. B. in Nordafrika wächst. Sie ist weit verbreitet. Dritter.', 1).text).toBe('Die Aloe vera ist eine Pflanzenart, die z. B. in Nordafrika wächst.');
  });
});

/* ------------------------------------------------------------------ climograph */
describe('climograph', () => {
  const flat = (t: number, pr: number) => Array.from({ length: 12 }, () => ({ tmax: t + 5, tmin: t - 5, precipMm: pr }));
  it('an equatorial flat year: alt text names one month as both coldest and warmest', () => {
    const g = climograph({ months: flat(25, 100), p10: flat(25, 100), p90: flat(25, 100), cells: 5, extremes: null });
    expect(g.alt).toMatchInlineSnapshot(`"A flat year: mean day about 30 °C and mean night about 20 °C in every month, so the cold quarter is shaded by rounding only. 1200 mm of rain a year, most in Jan. The 5 habitat cells agree to within rounding."`);
  });
  it('all-zero rain: the axis, the bars and the alt', () => {
    const g = climograph({ months: flat(25, 0), p10: flat(25, 0), p90: flat(25, 0), cells: 1 });
    expect({ dry: g.rain.dry, ticks: g.rain.ticks.map((t) => t.label), bars: g.rain.bars.filter((b) => b.h > 0).length, alt: g.alt }).toMatchInlineSnapshot(`
      {
        "alt": "A flat year: mean day about 30 °C and mean night about 20 °C in every month, so the cold quarter is shaded by rounding only. No month reaches a millimetre of rain.",
        "bars": 0,
        "dry": true,
        "ticks": [
          "0",
          "10",
        ],
      }
    `);
  });
  it('one 400 mm month: axis ticks', () => {
    const m = flat(25, 5);
    m[6].precipMm = 400;
    const g = climograph({ months: m, p10: m, p90: m, cells: 1 });
    expect(g.rain.ticks.map((t) => t.label)).toMatchInlineSnapshot(`
      [
        "0",
        "100",
        "200",
        "300",
        "400",
      ]
    `);
  });
  it('cold quarter wrapping the year: coldest in January → Dec–Feb in two rectangles', () => {
    const m = flat(20, 10);
    m[0].tmin = 2; // January coldest
    const g = climograph({ months: m, p10: m, p90: m, cells: 1 });
    expect({ ...g.temp.coldQuarter }).toMatchInlineSnapshot(`
      {
        "w": 55.7,
        "w2": 111.3,
        "wraps": true,
        "x": 652.3,
        "x2": 40,
      }
    `);
  });
  it('extremes far outside the monthly range stretch the axis', () => {
    const m = flat(20, 10);
    const g = climograph({ months: m, p10: m, p90: m, cells: 1, extremes: { minAbs: -25, maxP99: 44, years: 44 } });
    expect(g.temp.ticks.map((t) => t.label)).toMatchInlineSnapshot(`
      [
        "-40°",
        "-20°",
        "0°",
        "20°",
        "40°",
        "60°",
      ]
    `);
  });
  it('the alt says "nights from A to B" where B is the warmest-day month’s night, not the warmest night', () => {
    const m = flat(20, 10);
    m[6].tmax = 35; // warmest day in July
    m[9].tmin = 22; // warmest night in October
    const g = climograph({ months: m, p10: m, p90: m, cells: 1 });
    expect(g.alt).toMatch(/mean night from 15 °C in \w+ to 22 °C in \w+/);
  });
});

/* ------------------------------------------------------------------ bulk */
describe('bulk: WCVP homonyms and the occurrence sample', () => {
  it('a homonym with one Accepted row and one Synonym row is resolved to the Accepted row without consulting authorship', () => {
    const idx = new WcvpIndex();
    idx.addName({ id: '1', name: 'Aloe alba', status: 'Accepted', acceptedId: '1', rank: 'Species', authors: 'X' }, () => true);
    idx.addName({ id: '2', name: 'Aloe alba', status: 'Synonym', acceptedId: '3', rank: 'Species', authors: 'Y' }, () => true);
    idx.addName({ id: '3', name: 'Aloe other', status: 'Accepted', acceptedId: '3', rank: 'Species', authors: 'Z' }, () => true);
    // The backbone's usage is the one by author Y (a synonym of Aloe other):
    const got = idx.accepted('Aloe alba', 'Y');
    expect(got === 'ambiguous' ? 'ambiguous' : got?.name).toBe('Aloe other');
  });
  it('the per-species occurrence sample is the cap smallest id-hashes (unbiased, deterministic)', () => {
    const idx = new OccIndex(100);
    const ids = Array.from({ length: 5000 }, (_, i) => 1_000_000 + i * 7);
    for (const id of ids) idx.add({ key: id, decimalLatitude: -24, decimalLongitude: -70, speciesKey: 5 });
    idx.seal();
    const kept = new Set(idx.get(5)!.map((r) => r.key));
    const expected = new Set([...ids].sort((a, b) => idHash(a) - idHash(b)).slice(0, 100));
    expect(kept).toEqual(expected);
  });
  it('a wanted subspecies key whose species key is not wanted never gets photographs from the download', () => {
    const idx = new OccIndex(100, new Set([77]));
    idx.add({ key: 1, decimalLatitude: -24, decimalLongitude: -70, speciesKey: 5, taxonKey: 77, mediaType: 'StillImage', basisOfRecord: 'HUMAN_OBSERVATION' });
    expect({ records: idx.get(77)?.length, media: idx.withMedia.size }).toEqual({ records: 1, media: 1 });
  });
  it('the download path does not read degreeOfEstablishment, which the API path filters cultivated records by', () => {
    const h = occHeader('gbifID\tdecimalLatitude\tdecimalLongitude\tyear\tcountryCode\tbasisOfRecord\tlicense\tdatasetKey\testablishmentMeans\tdegreeOfEstablishment\tspeciesKey\ttaxonKey');
    const o = parseOccRow(h, '1\t-24.9\t-70.4\t2020\tCL\tHUMAN_OBSERVATION\tCC_BY_4_0\tds\t\tcultivated\t5\t5')!;
    expect(o.establishmentMeans).toMatch(/cultivated/); // carried in the one field the build's pattern tests
  });
  it('MediaIndex: an image row with no licence of its own is dropped even when the record’s dataset is CC0 (the API path falls back to the record licence)', () => {
    const mi = new MediaIndex(new Map([[1, 5]]));
    const h = ['gbifID', 'identifier', 'license', 'creator', 'type', 'format'];
    mi.add(parseMediaRow(h, '1\thttps://x/a.jpg\t\tsomeone\tStillImage\timage/jpeg')!);
    expect(mi.page(5)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ build: skipped sources and the page */
describe('build: a skipped photo source on the page', () => {
  it('--skip inat,commons,gbif.media leaves upstream skipped and photos empty; the hero then says "No openly licensed photograph on file"', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa(), { skip: ['inat', 'commons', 'gbif.media'] }));
    if (!r.ok) throw new Error();
    const d = r.dossier;
    // Mirror of src/routes/species/[slug]/+page.svelte:75-78,127
    const refused = (k: string) => ['refused', 'error', 'skipped'].includes(d.upstream[k]?.status ?? ''); // as the page now does
    const refusedPhotoSources = ['inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated', 'commons', 'gbif.media'].filter(refused);
    const hero = d.photos.length ? 'photo' : refusedPhotoSources.length ? 'not checked' : 'No openly licensed photograph on file';
    expect({ statuses: Object.fromEntries(['inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated', 'commons', 'gbif.media'].map((k) => [k, d.upstream[k]?.status])), hero }).toEqual({ statuses: expect.anything(), hero: 'not checked' });
  });
});

/* ------------------------------------------------------------------ export */
describe('export: what the README promises against what the CSV holds', () => {
  it('growing_season can be "cool", which the README does not list', async () => {
    const r = await buildDossier('Copiapoa cinerea', opts(copiapoa()));
    if (!r.ok) throw new Error();
    const d = JSON.parse(JSON.stringify(r.dossier));
    const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20], tmin = [16, 16, 15, 14, 12, 10, 9, 10, 11, 11, 13, 14];
    const pr = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5];
    const year = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: pr[i] }));
    d.climate = { status: 'ok', cells: 3, records: 3, cell: 'x', at: { lat: -24.9, lon: -70.4 }, months: year, p10: year, p90: year, src: { normals: 'x', envelope: 'x' } };
    const b = buildBundle({ index: [{ key: d.key, slug: d.slug, name: d.name.scientific, family: 'Cactaceae', origin: [], photos: 0, open: 0, climate: 'ok' }], dossiers: new Map([[d.key, d]]) }, { version: '1', homepage: 'h', repo: 'r' });
    const header = b.files['species.csv'].split('\n')[0].split(',');
    const line = b.files['species.csv'].split('\n')[1].split(',');
    const season = line[header.indexOf('growing_season')];
    const readme = /`summer`, `winter` or `even`/.test(b.files['README.md']);
    expect({ season, readmeListsOnlyThree: readme }).toEqual({ season: 'cool', readmeListsOnlyThree: false });
  });
});
