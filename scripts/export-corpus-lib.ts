/**
 * The dataset bundle: a built corpus packaged so it can be published and used
 * without the app. One zip holding the species JSON as built, two flat CSVs
 * for people who want a spreadsheet, the index, and a README and LICENSE that
 * say what the numbers are, how they were derived and under what terms each
 * part may be reused.
 *
 * Nothing is recomputed here except the growing year, which the app derives
 * on the fly from the climate months and is worth having in the CSV.
 */
import { growingYear, span } from '../src/lib/core/sheet';

interface IndexRow {
  key: number;
  slug: string;
  name: string;
  family: string;
  origin: string[];
  photos: number;
  open: number;
  climate: string;
}

export interface Corpus {
  index: IndexRow[];
  /** key → dossier JSON as built (kept as parsed objects; written back verbatim) */
  dossiers: Map<number, Record<string, unknown>>;
  /** report.txt from the build, if present */
  report?: string;
}

export interface Bundle {
  files: Record<string, string>;
  species: number;
  withClimate: number;
}

const csvCell = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: unknown[]) => cells.map(csvCell).join(',') + '\n';

function get<T = unknown>(o: unknown, path: string): T | undefined {
  let cur: unknown = o;
  for (const k of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur as T;
}

/** Build every file of the bundle from a loaded corpus. Pure; the caller writes the zip. */
export function buildBundle(c: Corpus, opts: { version: string; homepage: string; repo: string; today?: string }): Bundle {
  const files: Record<string, string> = {};
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const rows = [...c.index].sort((a, b) => a.name.localeCompare(b.name));

  let speciesCsv = row(['key', 'gbif_id', 'inat_id', 'wikidata', 'scientific_name', 'authorship', 'family', 'genus', 'order', 'status', 'native_regions', 'introduced_regions', 'marker_lat', 'marker_lon', 'marker_records', 'marker_share', 'climate_status', 'climate_cells', 'climate_records', 'annual_precip_mm', 'growing_season', 'growing_months', 'coldest_month_tmin_c', 'extreme_min_p01_c', 'frost_days_per_year', 'in_range_records', 'photos', 'literature', 'built']);
  let climateCsv = row(['key', 'scientific_name', 'month', 'tmax_c', 'tmin_c', 'tmean_c', 'precip_mm', 'dli_mol_m2_day', 'rh_pct', 'tmin_p10_c', 'tmin_p90_c', 'tmax_p10_c', 'tmax_p90_c', 'precip_p10_mm', 'precip_p90_mm']);
  let withClimate = 0;
  const builds: string[] = [];

  for (const r of rows) {
    const d = c.dossiers.get(r.key);
    if (!d) continue;
    files[`species/${r.slug}.json`] = JSON.stringify(d);
    const built = get<string>(d, 'built');
    if (built) builds.push(built);
    type M = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number };
    const months = get<M[]>(d, 'climate.months');
    const p10 = get<M[]>(d, 'climate.p10'), p90 = get<M[]>(d, 'climate.p90');
    // Hemisphere for the growing year: the map marker's latitude first, then the typical climate cell's, the same
    // precedence as the species page (src/routes/species/[slug]/+page.svelte), so the export and the page agree.
    const lat = get<number>(d, 'centroid.lat') ?? get<number>(d, 'climate.at.lat');
    const year = months && months.length === 12 ? growingYear(months, lat) : null;
    if (months && months.length === 12) {
      withClimate++;
      months.forEach((m, i) => {
        climateCsv += row([r.key, r.name, i + 1, m.tmax, m.tmin, m.tmean, m.precipMm, m.dli, m.rh, p10?.[i]?.tmin, p90?.[i]?.tmin, p10?.[i]?.tmax, p90?.[i]?.tmax, p10?.[i]?.precipMm, p90?.[i]?.precipMm]);
      });
    }
    const native = (get<Array<{ name: string }>>(d, 'distribution.native') ?? []).map((x) => x.name).join('; ');
    const introduced = (get<Array<{ name: string }>>(d, 'distribution.introduced') ?? []).map((x) => x.name).join('; ');
    const ex = get<{ minP01?: number; frostDaysPerYear?: number }>(d, 'climate.extremes');
    speciesCsv += row([
      r.key,
      get(d, 'ids.gbif'),
      get(d, 'ids.inat'),
      get(d, 'ids.wikidata'),
      get(d, 'name.scientific') ?? r.name,
      get(d, 'name.authorship'),
      get(d, 'name.family') ?? r.family,
      get(d, 'name.genus'),
      get(d, 'name.order'),
      get(d, 'name.status'),
      native,
      introduced,
      get(d, 'centroid.lat'),
      get(d, 'centroid.lon'),
      get(d, 'centroid.n'),
      get(d, 'centroid.share'),
      get(d, 'climate.status') ?? r.climate,
      get(d, 'climate.cells'),
      get(d, 'climate.records'),
      year ? Math.round(year.annualMm) : '',
      year ? year.grow : '',
      year ? span(year.growMonths) : '',
      months && months.length === 12 ? Math.min(...months.map((m) => m.tmin)) : '',
      ex?.minP01,
      ex?.frostDaysPerYear,
      (get<number>(d, 'occurrences.nOpenInRange') ?? 0) + (get<number>(d, 'occurrences.nRestrictedInRange') ?? 0),
      (get<unknown[]>(d, 'photos') ?? []).length,
      (get<unknown[]>(d, 'literature') ?? []).length,
      built
    ]);
  }

  files['index.json'] = JSON.stringify(rows, null, 1);
  files['species.csv'] = '﻿' + speciesCsv;
  files['climate.csv'] = '﻿' + climateCsv;
  if (c.report) files['build-report.txt'] = c.report;
  builds.sort();
  const built = builds.length ? `${builds[0].slice(0, 10)} to ${builds[builds.length - 1].slice(0, 10)}` : 'unknown';

  files['README.md'] = `# Cultifolio species reference, dataset ${opts.version}

${rows.length} species, ${withClimate} with a habitat climate. Built ${built}; packaged ${today}.

This is the reference data behind ${opts.homepage}, packaged so it can be read, checked and reused without the app. Every figure in it was derived by the open-source build at ${opts.repo} from the public sources listed in LICENSE.md. Nothing in it was written by a person or a language model, and no figure the build could not derive was filled in: where a value is missing it is missing.

## What is here

\`species/<slug>.json\`
One file per species, exactly as the build wrote it: the accepted name and its synonyms (GBIF Backbone), native and introduced regions at TDWG level 3 (WCVP), the sampled in-range occurrence records, the map marker and how it was placed, the climate envelope (CHELSA V2.1 normals read at every distinct grid cell holding an in-range record: the median year and the 10th–90th percentile range; daily extremes from NASA POWER at the typical cell where they were usable), photo references with their licence and credit (links only; no image files are redistributed), literature references (OpenAlex), a Wikipedia summary, and an \`upstream\` section recording every request the build made, with its status, so a refusal can be told from an absence.

\`species.csv\`
One row per species: identifiers, name, family, regions, the map marker (the densest population of in-range records: latitude, longitude, how many records and what share), the climate status and how many distinct grid cells and records the climate envelope rests on, annual precipitation of the median year, the growing season read from the rain and temperature curves (\`summer\`, \`winter\`, \`even\`, or \`cool\` where under 120 mm a year the temperature rule named the cooler six months instead; \`even\` also covers a flat year with nothing to name; the months given in habitat time), the coldest month's mean minimum, the 1st-percentile daily minimum and frost days per year where extremes were usable, and counts. Empty cells are values the build could not derive.

\`climate.csv\`
Twelve rows per species with climate: the median year across every grid cell holding an in-range record (mean daily maximum, minimum and mean temperature in °C, precipitation in mm, daily light integral in mol/m²/day, relative humidity in %), and the 10th and 90th percentiles across those cells for night and day temperature and rainfall, month by month.

\`index.json\`
The list the app serves: key, slug, name, family, origin, photo count, count of open records and climate status.

\`build-report.txt\`
The build's own log for this corpus, when it was kept: which species were built, which sources refused and why.

## How the numbers were derived

The method is written up at ${opts.homepage}/about/how and is what the build implements. In short: names are matched to the GBIF Backbone; the native range comes from WCVP; occurrence records inside the native range, placed to within 10 km, are read against CHELSA V2.1 one grid cell each (a cell holding many records counts once), and the climate is the median and 10th–90th percentile of each month across those cells, requiring at least three cells; the map marker is the densest population's middle and decides nothing; the growing season is read from the median year: the wet season is the smallest set of months carrying 70% of annual rain (or, under 120 mm a year, the cooler six months, where they are cooler). Restricted-licence (CC BY-NC) records may inform the clustering but are never redistributed; every coordinate in \`species/*.json\` carries its own licence code.

## Citing

Cite the sources, not only this bundle: the figures are theirs. Each species file names the GBIF occurrence download it drew on (a DOI, under \`upstream\`), and the CHELSA, WCVP and NASA POWER citations are in LICENSE.md. For the derivation itself, cite the repository at ${opts.repo} and this dataset version.
`;

  files['LICENSE.md'] = `# Licence

## The derived figures

The habitat centres, growing seasons, cold floors, the CSV files, the index and the arrangement of this bundle are released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). Attribute "Cultifolio species reference, ${opts.repo}" and keep the source attributions below, which the figures rest on.

## The parts that keep their own licence

The bundle carries data from the sources below unchanged or lightly reshaped. Each keeps the licence it came under, and that licence governs reuse of that part.

| Part of the bundle | Source | Licence |
|---|---|---|
| \`name\`, \`ids\`, synonyms, vernacular names | GBIF Backbone Taxonomy | CC BY 4.0 |
| \`occurrences.open\` (coordinates; each row's last field is its own licence code: \`cc0\`, \`by\` or \`by-sa\`) | GBIF occurrence records, dataset-by-dataset; the download DOI is under \`upstream\` | CC0 1.0, CC BY 4.0 or CC BY-SA 4.0 per record, as coded. CC BY-NC records were used to find the marker and the envelope and are not included. |
| \`distribution\` (regions, boxes) | World Checklist of Vascular Plants, Royal Botanic Gardens, Kew (Govaerts et al.) | CC BY 4.0 |
| \`climate.months\`, \`climate.p10\`, \`climate.p90\` and \`climate.csv\` | CHELSA V2.1 (Karger et al.), read at every cell holding an in-range record | CC0 1.0 |
| \`climate.extremes\` | NASA POWER daily data | Public domain (United States Government) |
| \`summary.text\` | Wikipedia, the article named in \`summary.url\` | CC BY-SA 4.0. Reuse of the text carries share-alike. Delete the \`summary\` field for a bundle free of it. |
| \`photos\` (URL, credit, licence; no image files) | iNaturalist and Wikimedia Commons, per photo | The licence named on each record: CC0, CC BY or CC BY-SA. The image itself is the photographer's and is not redistributed here. |
| \`literature\` | OpenAlex | CC0 1.0 |

## Citations

GBIF.org. GBIF Backbone Taxonomy and occurrence downloads; each species file names its download DOI under \`upstream\`.

Govaerts R, Nic Lughadha E, Black N, Turner R, Paton A. The World Checklist of Vascular Plants, a continuously updated resource for exploring global plant diversity. Scientific Data 8, 215 (2021). Royal Botanic Gardens, Kew.

Karger DN, Conrad O, Böhner J, et al. Climatologies at high resolution for the earth's land surface areas. Scientific Data 4, 170122 (2017). CHELSA V2.1.

NASA POWER Project. Prediction Of Worldwide Energy Resources, daily data. NASA Langley Research Center.

Wikipedia contributors; iNaturalist contributors; Wikimedia Commons contributors; OpenAlex (Priem J, Piwowar H, Orr R, 2022).

## Warranty

None. The figures are derived from records of where plants have been found and what the climate is there; they are not tested horticultural limits, and the bundle says so wherever a figure could be mistaken for one.
`;

  return { files, species: rows.length, withClimate };
}
