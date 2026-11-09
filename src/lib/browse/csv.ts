/**
 * A browse result as CSV (round eighty-seven, C4): every result, not one page; plain numbers (no thousands separator,
 * no unit in a cell), ISO dates, UTF-8 with a byte-order mark so a spreadsheet reads the names' accents, CRLF lines,
 * and a text cell that begins with = + - @ (or a tab or a carriage return) prefixed with ' so no spreadsheet runs it
 * as a formula. Numbers are never prefixed: they are written as numbers, which is what the guard keeps them apart from.
 *
 * Each column's meaning and source (rule 1) are in a second file, `sourcesCsv`, which the page links beside the first.
 */
import { keyAt, slugAt, type BrowseTable } from './table';
import { regionOfOrigin, regionOf } from './tdwg';
import { climateWordOf } from './climate-words';
import { KEW_DAY, GROWN_DAY } from './sources';
import { dayIso } from '$dossier/changed';
import { lowAt, type Prepared } from './engine';

export const BOM = '﻿';
const RISKY = /^[=+\-@\t\r]/;
/** One cell: a number as it is, text quoted where it must be and guarded against formulas, nothing for none. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = RISKY.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells: ReadonlyArray<string | number | null | undefined>) => cells.map(csvCell).join(',') + '\r\n';

const iso = (day: number) => (day > 0 ? dayIso(day) : null);
/** The code a page's origin is in TDWG's scheme: a level-3 region's letters, or a wider region's number. */
const codeOfOrigin = (name: string) => regionOfOrigin(name) ?? null;

export interface Column { head: string; meaning: string; source: string; asOf: string }
/** The columns, in order, each with what it is and where it is from. `built` is the reference's build day (ISO), or null. */
export function columns(built: string | null): Column[] {
  const b = built ?? 'not stated';
  return [
    { head: 'species', meaning: 'The name the page heads: the accepted name in Kew\'s checklist', source: "Kew, World Checklist of Vascular Plants (Govaerts et al.), CC BY 4.0", asOf: KEW_DAY },
    { head: 'page', meaning: 'The species page', source: 'Cultifolio', asOf: b },
    { head: 'kew_plant_name_id', meaning: "Kew's plant_name_id for the name; empty where the page is not one of Kew's names", source: "Kew, World Checklist of Vascular Plants", asOf: KEW_DAY },
    { head: 'gbif_key', meaning: "The page's own GBIF backbone key; empty where it has none", source: 'GBIF Backbone Taxonomy, CC BY 4.0', asOf: b },
    { head: 'family', meaning: 'The family', source: "Kew, World Checklist of Vascular Plants", asOf: KEW_DAY },
    { head: 'english_name', meaning: 'The English name the page heads with; empty where it holds none', source: 'The species page names its sources for each name', asOf: b },
    { head: 'native_to', meaning: "The regions Kew gives as native, as TDWG codes separated by ';': three letters for a level-3 region, a number for a wider region where Kew gives no finer one", source: "Kew, World Checklist of Vascular Plants; codes of TDWG's World Geographical Scheme for Recording Plant Distributions, 2nd edition (Brummitt 2001)", asOf: KEW_DAY },
    { head: 'native_to_names', meaning: "The same regions by name, separated by ';'", source: "As native_to", asOf: KEW_DAY },
    { head: 'habitat_climate', meaning: "Whether the page has a habitat climate: known; none (its records allow none); pending (still to be built); not asked (no GBIF key, so GBIF's records were not asked); not checked (a source refused)", source: "The species page, from CHELSA's monthly climate and NASA POWER's daily extremes at its wild records (GBIF, iNaturalist)", asOf: b },
    { head: 'record_low_c', meaning: "The record low of the habitat, in degrees Celsius to a tenth: the lowest night in NASA POWER's daily series at the habitat's typical spot, as the species page gives it. Empty where the page has none; the whole column is empty where this build of the index holds no record lows (one built before round eighty-seven's)", source: "NASA POWER daily (the species page's extremes; each page says its years and day read)", asOf: b },
    { head: 'grown', meaning: "iNaturalist's observations of the species marked captive or cultivated, a count; empty where the species list does not count the species (not a count of none)", source: 'iNaturalist, observations/species_counts?captive=true, as scripts/species-list.txt counts them', asOf: GROWN_DAY },
    { head: 'page_changed', meaning: 'The day the page last changed in substance', source: 'Cultifolio', asOf: b }
  ];
}

/** The result's CSV, the byte-order mark first. */
export function browseCsv(p: Prepared, rows: readonly number[], built: string | null): string {
  const t: BrowseTable = p.t;
  const out: string[] = [BOM + csvLine(columns(built).map((c) => c.head))];
  for (const i of rows) {
    const key = keyAt(t, i);
    const names = t.origin[i].map((o) => t.origins[o]);
    out.push(csvLine([
      t.name[i],
      `https://cultifolio.com/species/${slugAt(t, i)}`,
      /^k\d+$/.test(key) ? Number(key.slice(1)) : null,
      t.gbif[i] || null,
      t.family[i] >= 0 ? t.families[t.family[i]] : null,
      t.common[i] || null,
      names.map((n) => codeOfOrigin(n) ?? '').filter(Boolean).join(';') || null,
      names.map((n) => { const c = codeOfOrigin(n); return c ? regionOf(c)!.label : n; }).filter(Boolean).join(';') || null,
      climateWordOf(t.climate[i], t.gbif[i]),
      lowAt(p.lows, i),
      t.grown[i] >= 0 ? t.grown[i] : null,
      iso(t.changed[i])
    ]));
  }
  return out.join('');
}

/** The second file: each column of the first, what it is, its source and its day. */
export function sourcesCsv(built: string | null): string {
  return BOM + csvLine(['column', 'meaning', 'source', 'as_of']) + columns(built).map((c) => csvLine([c.head, c.meaning, c.source, c.asOf])).join('');
}
