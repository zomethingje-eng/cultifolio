/**
 * Round sixty-three, C1 (REVIEW-TRIAGE-61's deferred list): the year's rain as the median of the range's cells' own
 * yearly totals, stored by the climate build and shown under its own name; a dossier built before keeps the sum of the
 * monthly medians, labelled as that.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { fixtureFetcher } from '$dossier/fetch';
import { parseDossier } from '$dossier/schema';
import { yearRain } from '$climate/year-rain';
import { climograph } from '$climate/climograph';
import { speciesDescription } from '$lib/ui/ref/head';
import { buildBundle, type Corpus } from '../../scripts/export-corpus-lib';

const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
const code = (f: string) => readFileSync(f, 'utf8').replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A cell whose whole year's rain falls in one month: three such cells, each in another month, have monthly medians of nothing. */
function oneWetMonth(wet: number, mm: number): Record<string, number> {
  const v: Record<string, number> = { elev: 300 };
  for (let m = 1; m <= 12; m++) {
    const k = String(m).padStart(2, '0');
    v[`tasmax_${k}`] = 25;
    v[`tasmin_${k}`] = 12;
    v[`tas_${k}`] = 18.5;
    v[`pr_${k}`] = m === wet ? mm : 0;
    v[`rsds_${k}`] = 20;
    v[`hurs_${k}`] = 60;
    v[`vpd_${k}`] = 900;
    v[`sfcWind_${k}`] = 3;
  }
  return v;
}

describe('the climate build keeps the median of the cells\' own years', () => {
  const lat = -24.877, lon = -70.504;
  it('a range whose cells each have a wet month of their own: the median year adds to nothing, the cells\' median year to 60 mm', async () => {
    const cells = new Map<string, ArrayBuffer>();
    const points: Array<[number, number]> = [];
    [[1, 60], [2, 60], [3, 60]].forEach(([wet, mm], k) => {
      const c = cellOf(h, lat, lon - k * h.cell);
      cells.set(c.id, encodeCell(h, oneWetMonth(wet, mm)));
      points.push([lat, lon - k * h.cell]);
    });
    const c = await makeClimateProvider({ grid: memoryGridSource(h, cells), fetcher: fixtureFetcher({}), noExtremes: true }).envelope(points);
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    expect(c.months.reduce((a, m) => a + m.precipMm, 0)).toBe(0); // the sum of monthly medians: a year no cell has
    expect(c.annualRain?.p50).toBeCloseTo(60, 0); // base: undefined
    expect(c.annualRain?.p10).toBeCloseTo(60, 0);
    expect(yearRain(c.months, c.annualRain)).toEqual({ mm: c.annualRain!.p50, cells: true });
    // and the dossier schema keeps it
    const ok = { status: 'ok', cells: 3, records: 3, cell: 'x', at: { lat, lon }, months: c.months, p10: c.p10, p90: c.p90, annualRain: c.annualRain, src: c.src };
    const parsed = parseDossier({ ...JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384013.json', 'utf8')), climate: ok });
    expect(parsed.climate.status === 'ok' && parsed.climate.annualRain?.p50).toBeCloseTo(60, 0);
  });
  it('a dossier built before has no median: the twelve monthly medians are added, and said to be', () => {
    const months = Array.from({ length: 12 }, () => ({ precipMm: 10 }));
    expect(yearRain(months, undefined)).toEqual({ mm: 120, cells: false });
    expect(yearRain(months, { p10: 50, p90: 200 } as never)).toEqual({ mm: 120, cells: false });
    expect(yearRain(months, { p50: 140 })).toEqual({ mm: 140, cells: true });
  });
});

describe('each place the year\'s rain is shown names which figure it is', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ tmax: 25, tmin: 10 + (i % 3), tmean: 17, precipMm: i < 3 ? 40 : 5, dli: 30 }));
  const head = (annualRain?: { p50?: number }) => speciesDescription({ name: { scientific: 'Aloe testii' }, climate: { status: 'ok', months, records: 40, extremes: null, annualRain }, native: 1, photos: 0, summary: false });
  it('the link preview: the median when the dossier has it, the old label when not', () => {
    expect(head({ p50: 214 })).toContain('214 mm of rain a year (median across the range, CHELSA)'); // base: 165 mm, sum of monthly medians
    expect(head()).toContain('165 mm of rain a year (sum of monthly medians, CHELSA)');
  });
  it('the glance card, the compare row and the species page carry both names and the median', () => {
    const glance = code('src/lib/ui/ref/Glance.svelte');
    expect(glance).toContain("'Rain a year (median across the range)'");
    expect(glance).toContain("'Rain a year (sum of monthly medians)'");
    expect(glance).toContain('yearRain(months, annualRain)');
    const compare = code('src/routes/compare/+page.svelte');
    expect(compare).toContain("'Rain a year (median across the range)'");
    expect(compare).toContain("'Rain a year (sum of monthly medians)'");
    expect(compare).toMatch(/cols\.every\(\(c\) => !c\.rainYr \|\| c\.rainYr\.cells\)/); // one kind of figure across the row
    const species = code('src/routes/species/[slug]/+page.svelte');
    expect(species).toContain("annualRain={d.climate.status === 'ok' ? (d.climate.annualRain ?? null) : null}");
    expect(species).toContain('annualRain: d.climate.annualRain ?? null');
  });
  it("the chart's alternative names its total as the bars' own", () => {
    const g = climograph({ months, p10: months, p90: months, cells: 3 });
    expect(g.alt).toContain('165 mm of rain a year (the twelve monthly medians added)');
  });
  it('the export carries the cells\' percentiles and median after the columns it had', () => {
    const index = JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8'));
    const dossiers = new Map<number, Record<string, unknown>>();
    for (const r of index) dossiers.set(r.key, JSON.parse(readFileSync(`fixtures/dossiers/s/v2/${r.key}.json`, 'utf8')));
    const cin = dossiers.get(5384013) as { climate: Record<string, unknown> };
    cin.climate = { ...cin.climate, annualRain: { p10: 50, p90: 90, p50: 70 } };
    const b = buildBundle({ index, dossiers } as Corpus, { version: 't', homepage: 'https://x.test', repo: 'https://x.test/r', today: '2026-10-09' });
    const lines = b.files['species.csv'].replace(/^﻿/, '').trim().split('\n');
    const head = lines[0].split(',');
    expect(head.slice(-4)).toEqual(['built', 'annual_precip_cells_p10_mm', 'annual_precip_cells_median_mm', 'annual_precip_cells_p90_mm']);
    const row = Object.fromEntries(lines.find((l) => l.includes('Copiapoa cinerea'))!.split(',').map((v, i) => [head[i], v]));
    expect([row.annual_precip_cells_p10_mm, row.annual_precip_cells_median_mm, row.annual_precip_cells_p90_mm]).toEqual(['50', '70', '90']);
    expect(b.files['LICENSE.md']).toContain('`climate.annualRain`');
  });
});
