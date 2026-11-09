/**
 * Kew's predicted extinction risk (round eighty-seven, stage 2; the sources agent), read offline from the file Kew's
 * authors publish on Zenodo:
 *
 *   Bachman, S.P., Brown, M.J.M., Leão, T.C.C., Nic Lughadha, E. & Walker, B.E. (2024). Extinction risk predictions for
 *   the world's flowering plants to support their conservation. New Phytologist 242(2): 797-808 (online 4 March 2024),
 *   https://doi.org/10.1111/nph.19592. Data: "Predicted extinction risk for all Angiosperm (flowering plant) species",
 *   version 1.0, 1 February 2024, https://doi.org/10.5281/zenodo.10605228, CC BY 4.0 (read 9 November 2026).
 *
 * The file's columns, as the record defines them: plant_name_id (WCVP's), threatened (the mean probability of being
 * threatened), .lower and .upper (the 95% credible interval), predicted_threat (threatened or not threatened),
 * confidence (confident where the interval lies wholly on one side of the model's threshold, low_confidence where it
 * crosses it), category (the observed Red List category if assessed), observed_threat, combined, ipni_id, family, genus,
 * species, taxon_name.
 *
 * What is read, and what is not:
 * - `category`, `observed_threat` and `combined` are IUCN's, or made from IUCN's: never kept. IUCN's terms (CC BY-NC-SA,
 *   as POWO shows them) do not let the reference show a category. The one thing read from `category` is whether it holds
 *   one, so the page can say the Red List has assessed the species and send the reader to IUCN's page; the record asks
 *   that a published assessment be used before a prediction.
 * - The match is by IPNI id (`ipni_id` against the page's `ids.ipni`), not by `plant_name_id`: the file's ids are an
 *   earlier form of WCVP's, a number and its source database ("10-wcs", "1000003-az"), and one number stands for two names ("329046-az"
 *   and "329046-wcs"), so they are not the integer ids of Kew's file the pages are keyed by. Rule 3: never by name.
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Risk } from './schema';
import { BulkFileError } from './bulk-file-error';

/** The versions of the file this code knows: its Zenodo record, the day the record gives, and the md5 Zenodo states. */
/** `rows`: the rows below the header, counted on the file (round eighty-seven's review of stage 2, S5). */
export const RISK_VERSIONS: Record<string, { record: string; asOf: string; md5: string; rows?: number }> = {
  '1': { record: '10605228', asOf: '2024-02-01', md5: 'e6fbee92fe19b783345cda27fc18eddc', rows: 328_565 }
};
export const RISK_FILE = /^Angiosperm_extinction_risk_predictions_v(\d+)\.csv$/;
export const RISK_PAPER = { authors: 'Bachman et al.', year: 2024, title: "Extinction risk predictions for the world's flowering plants to support their conservation", journal: 'New Phytologist 242: 797-808', doi: '10.1111/nph.19592', data: '10.5281/zenodo.10605228' };

/** One row as the reference keeps it: no IUCN column, only whether `category` holds a category. */
export interface RiskRow {
  ipni: string;
  name: string;
  family: string;
  p: number;
  lo: number;
  hi: number;
  predicted: 'threatened' | 'not threatened';
  confident: boolean;
  assessed: boolean;
}

/** The file's header, by column name. Throws on a file without the columns the reference reads. */
export function riskHeader(line: string): Record<string, number> {
  const h = Object.fromEntries(line.replace(/^﻿/, '').split(',').map((k, i) => [k.trim(), i]));
  for (const k of ['threatened', '.lower', '.upper', 'predicted_threat', 'confidence', 'category', 'ipni_id', 'family', 'taxon_name']) if (h[k] === undefined) throw new BulkFileError(`Kew's risk file has no column ${k} (its header: ${line.slice(0, 120)})`);
  return h;
}

/** A row, or null where its figures do not read as figures (an empty or "NA" probability is not a prediction). */
export function riskRow(h: Record<string, number>, line: string): RiskRow | null {
  // The file is plain CSV with no quoted fields (read 9 November 2026: no row holds a comma inside a field).
  const c = line.split(',');
  const num = (k: string) => { const x = Number(c[h[k]]); return c[h[k]] !== '' && Number.isFinite(x) ? x : null; };
  const p = num('threatened'), lo = num('.lower'), hi = num('.upper');
  const pred = c[h.predicted_threat];
  if (p == null || lo == null || hi == null || (pred !== 'threatened' && pred !== 'not threatened')) return null;
  const cat = c[h.category];
  return { ipni: c[h.ipni_id], name: c[h.taxon_name], family: c[h.family], p, lo, hi, predicted: pred, confident: c[h.confidence] === 'confident', assessed: !!cat && cat !== 'NA' };
}

export class RiskIndex {
  readonly byIpni = new Map<string, RiskRow[]>();
  /** Every family the file holds a row of: a page of another family is outside what the model covers (flowering plants). */
  readonly families = new Set<string>();
  /**
   * The IPNI ids of the pages whose row holds no figures (round eighty-seven's review of stage 2, M2: nine Extinct in
   * the Wild species, Brugmansia's among them), and whether the row's `category` holds one: the page says the file holds
   * a row with no prediction in it, not that it holds none.
   */
  readonly blank = new Map<string, { assessed: boolean }>();
  rows = 0;
  constructor(readonly file: string, readonly version: string) {}
  get asOf(): string | undefined { return RISK_VERSIONS[this.version]?.asOf; }
  add(r: RiskRow): void {
    const a = this.byIpni.get(r.ipni);
    if (a) a.push(r); else this.byIpni.set(r.ipni, [r]);
  }
}

/** What a page gives the match: its IPNI id, its family (Kew's where Kew heads it) and its name. */
export interface RiskPage { ipni?: string | null; family?: string | null; name: string }

/** The page's field from the index. `today` is the day of this read. */
export function riskOf(idx: RiskIndex, page: RiskPage, today: string): Risk {
  const base = { read: today, file: idx.file, ...(idx.asOf ? { asOf: idx.asOf } : {}) };
  if (!page.ipni) return { status: 'undecided', ...base, detail: 'the page has no IPNI id, by which the file is read' };
  const rows = idx.byIpni.get(page.ipni) ?? [];
  if (rows.length > 1) return { status: 'undecided', ...base, detail: `the file holds ${rows.length} rows under IPNI id ${page.ipni}` };
  const blank = rows.length ? undefined : idx.blank.get(page.ipni);
  if (blank) return { status: 'none', ...base, detail: `the file's row under IPNI id ${page.ipni} holds no figures (no probability, no interval, no class)${blank.assessed ? '; the file marks the species as assessed by the IUCN Red List' : ''}` };
  if (!rows.length) {
    const outside = page.family && !idx.families.has(page.family);
    // Said as the file has it, true either way: a family the file does not hold is most often not a flowering plant's.
    return { status: 'none', ...base, detail: outside ? `the file holds no row of the family ${page.family} (the model covers flowering plants)` : `the file holds no row under IPNI id ${page.ipni}` };
  }
  const r = rows[0];
  return { status: 'ok', ...base, p: r.p, lo: r.lo, hi: r.hi, predicted: r.predicted, confident: r.confident, ...(r.assessed ? { assessed: true as const } : {}), ipni: r.ipni };
}

/** The newest version of the file in `dir`, or null with none there. */
export function riskFileIn(dir: string): { path: string; file: string; version: string } | null {
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).flatMap((f) => { const m = RISK_FILE.exec(f); return m ? [{ file: f, version: m[1] }] : []; }).sort((a, b) => Number(b.version) - Number(a.version));
  return found.length ? { path: `${dir}/${found[0].file}`, ...found[0] } : null;
}

/**
 * The file streamed from `dir`, keeping only the rows whose IPNI id a page has (`wanted`) and the set of families: about
 * 330,000 rows read, a few tens of thousands kept. Null when the file is not there (the pages say "not asked"). Throws
 * `BulkFileError` where it is there and not read whole: no header with the columns read, no rows, or (`whole`) not the
 * number of rows the version holds.
 */
export async function loadRisk(dir: string, wanted: ReadonlySet<string>, opts: { whole?: boolean } = {}): Promise<RiskIndex | null> {
  const f = riskFileIn(dir);
  if (!f) return null;
  const idx = new RiskIndex(f.file, f.version);
  const rl = createInterface({ input: createReadStream(f.path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let h: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!h) { h = riskHeader(line); continue; }
    if (!line) continue;
    idx.rows++;
    const c = line.split(',');
    const fam = c[h.family];
    if (fam && !idx.families.has(fam)) idx.families.add(fam);
    if (!wanted.has(c[h.ipni_id])) continue;
    const r = riskRow(h, line);
    if (r) idx.add(r);
    else { const cat = c[h.category]; idx.blank.set(c[h.ipni_id], { assessed: !!cat && cat !== 'NA' }); }
  }
  if (!h) throw new BulkFileError(`Kew's ${f.file} holds no header line`);
  if (!idx.rows) throw new BulkFileError(`Kew's ${f.file} holds no rows`);
  const known = RISK_VERSIONS[f.version]?.rows;
  if (opts.whole && known && idx.rows !== known) throw new BulkFileError(`Kew's ${f.file} gave ${idx.rows.toLocaleString('en-GB')} rows, not the ${known.toLocaleString('en-GB')} of version ${f.version}`);
  return idx;
}
