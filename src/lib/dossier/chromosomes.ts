/**
 * Chromosome counts (round eighty-seven, stage 2; the sources agent), read offline from ChromoDB's IAPT/IOPB set:
 *
 *   Simon, J., Bosch, M. & Blanché, C. (2026). ChromoDB Source Data: Chromosome counts from the IAPT/IOPB chromosome
 *   data series, version 3.1, 8 November 2026. Zenodo, https://doi.org/10.5281/zenodo.24057855 (all versions:
 *   10.5281/zenodo.17156033). CC BY 4.0, except the verbatim source excerpts of the antecedents file, which is not read.
 *   Read 9 November 2026.
 *
 * Version 2.0 (Zenodo 18343310, the one the round's brief named) is withdrawn: its records file has a row-alignment
 * error (names, counts and countries not linked to their count_id and biblio_id), its files are restricted, and its
 * authors say it must not be used. This code reads version 3.0 or later only (`CHROMO_VERSIONS`).
 *
 * Two files, semicolon-delimited UTF-8 with a byte-order mark, a few fields quoted (a remark holding a semicolon):
 * IOPB_IAPT_records_v3_1.csv (count_id; biblio_id; family; genus; original_taxon_name; accepted_taxon_name, WCVP's as of
 * October 2026, with authors; n_value; 2n-value; country; subseries; stage; POWO_ID, the IPNI id of the accepted name;
 * country_code; count_derivation; confidence_level; remarks) and IOPB_IAPT_biblio_v3_1.csv (biblio_id; authors;
 * authors_short; year; title; journal; volume_pages; source_url; DOI; citation_full; subseries; stage).
 *
 * The match (rule 3): a record is the page's when its POWO_ID is the page's IPNI id and its accepted name's words are
 * the page's name: the name alone, or the name followed by authors that are not a rank word or a hybrid sign. The
 * identifier decides; ChromoDB's authors are not compared with Kew's (round eighty-seven's review of stage 2, M3: on the
 * file of 8 November 2026, 69 pages take records whose accepted name ChromoDB writes with other authors than Kew's,
 * "Aquilegia glandulosa Fisch." under Kew's "Fisch. ex Link.", "Cardamine macrophylla Adamson" under Kew's "Willd.",
 * each under the page's IPNI id). A record under the page's IPNI id whose words are not the page's (another spelling,
 * "Atropa belladonna L." under Kew's Atropa bella-donna, or the species' autonym, "Acer sterculiaceum subsp.
 * sterculiaceum") is not taken, and the page is not decided, said with the record's name (S3: 77 pages, which said "no
 * count" before). A record without a POWO_ID (31, which the authors could not match unambiguously) is never taken;
 * neither is one whose name is only a synonym's words, since the dossier holds Kew's synonyms without their authors and
 * a homonym would pass. Never a fuzzy match. Counts the authors retracted ("Retracted
 * by the author(s)" in remarks) and numbers inferred from genome size or flow cytometry (count_derivation "INFERRED:
 * GS/FC") are not chromosome counts and are left out, counted.
 */
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Chromosomes } from './schema';
import { BulkFileError } from './bulk-file-error';

/** `rows`: the records file's rows below its header, counted on the file (a read that gives another number failed). */
export const CHROMO_VERSIONS: Record<string, { record: string; asOf: string; md5: { records: string; biblio: string }; rows?: number }> = {
  '3': { record: '24019842', asOf: '2026-11-06', md5: { records: 'b6fd97f2fa9f03a0548a962bcd708d4c', biblio: '5bbde9b9298b0877d05b7323be31f402' } },
  '3_1': { record: '24057855', asOf: '2026-11-08', md5: { records: 'e5ad7aae7d1ab864d92d7e8ca5b904bd', biblio: '462c7f9b934fa80bd055b741582da51a' }, rows: 32_063 }
};
/** The columns this code reads of each file (round eighty-seven's review of stage 2, S5): a header without one is not read. */
export const CHROMO_RECORD_COLUMNS = ['biblio_id', 'original_taxon_name', 'accepted_taxon_name', 'n_value', '2n-value', 'country', 'POWO_ID', 'count_derivation', 'remarks'] as const;
export const CHROMO_BIBLIO_COLUMNS = ['biblio_id', 'authors_short', 'year', 'journal', 'volume_pages', 'source_url', 'DOI'] as const;
export const CHROMO_RECORDS = /^IOPB_IAPT_records_v(\d+(?:_\d+)?)\.csv$/;
/** How many counts a page keeps: the rest are counted in `more`. */
export const CHROMO_KEEP = 12;

/** One line of a semicolon-delimited file, quoted fields read as CSV reads them ("" inside quotes is one quote). */
export function splitDelimited(line: string, sep = ';'): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const header = (line: string) => Object.fromEntries(splitDelimited(line.replace(/^\uFEFF/, '')).map((k, i) => [k.trim(), i]));
/** A file's header, by column name. Throws `BulkFileError` where a column read is not there (S5). */
export function chromoHeader(line: string, file: string, want: readonly string[]): Record<string, number> {
  const h = header(line);
  const missing = want.filter((k) => h[k] === undefined);
  if (missing.length) throw new BulkFileError(`ChromoDB's ${file} has no column ${missing.join(', ')} (its header: ${line.slice(0, 120)})`);
  return h;
}

export interface ChromoRecord { powo: string; accepted: string; original: string; n?: string; twoN?: string; biblio: string; country?: string; left?: 'retracted' | 'inferred' }
export interface ChromoRef { short: string; year: string; cite?: string; url?: string }

/** A records row: undefined for a row with no number at all. `left` marks the counts that are not to be shown. */
export function chromoRecord(h: Record<string, number>, line: string): ChromoRecord | undefined {
  const c = splitDelimited(line);
  const n = c[h.n_value]?.trim() || undefined, twoN = c[h['2n-value']]?.trim() || undefined;
  if (!n && !twoN) return undefined;
  const remarks = c[h.remarks] ?? '';
  const left = /^Retracted by the author/i.test(remarks) ? 'retracted' as const : /^INFERRED/i.test(c[h.count_derivation] ?? '') ? 'inferred' as const : undefined;
  return { powo: c[h.POWO_ID]?.trim() ?? '', accepted: c[h.accepted_taxon_name]?.trim() ?? '', original: c[h.original_taxon_name]?.trim() ?? '', ...(n ? { n } : {}), ...(twoN ? { twoN } : {}), biblio: c[h.biblio_id], ...(c[h.country]?.trim() ? { country: c[h.country].trim() } : {}), ...(left ? { left } : {}) };
}

export function chromoRef(h: Record<string, number>, line: string): [string, ChromoRef] {
  const c = splitDelimited(line);
  const doi = c[h.DOI]?.trim(), src = c[h.source_url]?.trim();
  const journal = c[h.journal]?.trim(), vp = c[h.volume_pages]?.trim();
  return [c[h.biblio_id], { short: c[h.authors_short]?.trim() ?? '', year: c[h.year]?.trim() ?? '', ...(journal || vp ? { cite: [journal, vp].filter(Boolean).join(' ') } : {}), ...(doi || src ? { url: /^https?:\/\//.test(doi ?? '') ? doi : src } : {}) }];
}

export class ChromoIndex {
  readonly byPowo = new Map<string, ChromoRecord[]>();
  readonly refs = new Map<string, ChromoRef>();
  rows = 0;
  constructor(readonly file: string, readonly version: string) {}
  get asOf(): string | undefined { return CHROMO_VERSIONS[this.version]?.asOf; }
  add(r: ChromoRecord): void {
    const a = this.byPowo.get(r.powo);
    if (a) a.push(r); else this.byPowo.set(r.powo, [r]);
  }
}

export interface ChromoPage { ipni?: string | null; name: string; authorship?: string | null }

/**
 * A published name's words without its authors: the genus, the hybrid sign, the epithets and the rank words, up to the
 * first word that is an author's ("Agave parryi Engelm. var. huachucensis (Baker) Little" reads "Agave parryi").
 */
export function wordsOf(name: string): string {
  const out: string[] = [];
  for (const w of name.trim().split(/\s+/)) {
    if (!out.length || w === '×' || w === 'x' || (out.length === 1 && (out[0] === '×' || out[0] === 'x'))) { out.push(w); continue; }
    if (/^(subsp\.|ssp\.|var\.|f\.|forma|subvar\.)$/.test(w) && out.length >= 2) { out.push(w); continue; }
    if (/^[a-zà-ÿ-]+$/.test(w)) { out.push(w); continue; }
    break;
  }
  return out.join(' ');
}

/** Whether a record's accepted name is the page's: the name alone, the name and Kew's authors, or the name and other authors (not compared). */
const sameName = (accepted: string, page: ChromoPage) => accepted === page.name || (!!page.authorship && accepted === `${page.name} ${page.authorship}`) || (accepted.startsWith(`${page.name} `) && !/^(subsp\.|var\.|f\.|ssp\.|×)/.test(accepted.slice(page.name.length + 1)));

export function chromosomesOf(idx: ChromoIndex, page: ChromoPage, today: string): Chromosomes {
  const base = { read: today, file: idx.file, version: idx.version.replace('_', '.'), ...(idx.asOf ? { asOf: idx.asOf } : {}) };
  if (!page.ipni) return { status: 'undecided', ...base, detail: 'the page has no IPNI id, by which the records are read' };
  const all = idx.byPowo.get(page.ipni) ?? [];
  const mine = all.filter((r) => sameName(r.accepted, page));
  if (!mine.length && all.length) {
    const names = [...new Set(all.map((r) => r.accepted))];
    return { status: 'undecided', ...base, detail: `the file holds ${all.length} record${all.length === 1 ? '' : 's'} under this page's IPNI id ${page.ipni}, named ${names.join('; ')}, not this page's name as Kew spells it: not taken` };
  }
  if (!mine.length) return { status: 'none', ...base, detail: `the file holds no count under IPNI id ${page.ipni}` };
  const shown = mine.filter((r) => !r.left);
  const left = mine.length - shown.length;
  if (!shown.length) return { status: 'none', ...base, left, detail: `the file's ${mine.length} record${mine.length === 1 ? ' is' : 's are'} retracted or inferred from genome size, not counts` };
  // One count a reference and number: a count made from material of several countries is one row a country in the file.
  const seen = new Set<string>();
  const counts: NonNullable<Chromosomes['counts']> = [];
  for (const r of shown) {
    const k = `${r.biblio}|${r.n ?? ''}|${r.twoN ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const ref = idx.refs.get(r.biblio);
    const nameOnly = wordsOf(r.original);
    counts.push({ ...(r.n ? { n: r.n } : {}), ...(r.twoN ? { twoN: r.twoN } : {}), ref: ref ? `${ref.short} ${ref.year}`.trim() : `reference ${r.biblio}`, ...(ref?.cite ? { cite: ref.cite } : {}), ...(ref?.url ? { url: ref.url } : {}), ...(nameOnly && nameOnly !== page.name ? { as: r.original } : {}), ...(r.country ? { country: r.country } : {}) });
  }
  const kept = counts.slice(0, CHROMO_KEEP);
  return { status: 'ok', ...base, counts: kept, ...(left ? { left } : {}), ...(counts.length > kept.length ? { more: counts.length - kept.length } : {}) };
}

/** The newest version of the records file in `dir` with its bibliography beside it, or null. */
export function chromoFilesIn(dir: string): { records: string; biblio: string; file: string; version: string } | null {
  if (!existsSync(dir)) return null;
  const names = readdirSync(dir);
  const found = names.flatMap((f) => { const m = CHROMO_RECORDS.exec(f); return m && Number(m[1].split('_')[0]) >= 3 && names.includes(`IOPB_IAPT_biblio_v${m[1]}.csv`) ? [{ file: f, version: m[1] }] : []; })
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
  return found.length ? { records: `${dir}/${found[0].file}`, biblio: `${dir}/IOPB_IAPT_biblio_v${found[0].version}.csv`, ...found[0] } : null;
}

async function eachLine(path: string, each: (line: string) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) if (line) each(line);
}

/**
 * Both files from `dir`, keeping the records whose POWO_ID a page has (`wanted`). Null when either is not there. Throws
 * `BulkFileError` where a file is there and not read whole (S5): a header without a column read, no rows, or (with
 * `whole`, as the build reads the publisher's file) not the number of records the version is known to hold.
 */
export async function loadChromosomes(dir: string, wanted: ReadonlySet<string>, opts: { whole?: boolean } = {}): Promise<ChromoIndex | null> {
  const f = chromoFilesIn(dir);
  if (!f) return null;
  const idx = new ChromoIndex(f.file, f.version);
  let h: Record<string, number> | null = null;
  await eachLine(f.records, (line) => {
    if (!h) { h = chromoHeader(line, f.file, CHROMO_RECORD_COLUMNS); return; }
    idx.rows++;
    const r = chromoRecord(h, line);
    if (r && r.powo && wanted.has(r.powo)) idx.add(r);
  });
  if (!idx.rows) throw new BulkFileError(`ChromoDB's ${f.file} holds no records`);
  const known = CHROMO_VERSIONS[f.version]?.rows;
  if (opts.whole && known && idx.rows !== known) throw new BulkFileError(`ChromoDB's ${f.file} gave ${idx.rows.toLocaleString('en-GB')} records, not the ${known.toLocaleString('en-GB')} of version ${f.version.replace('_', '.')}`);
  let hb: Record<string, number> | null = null;
  let refs = 0;
  const biblio = f.biblio.replace(/^.*\//, '');
  await eachLine(f.biblio, (line) => {
    if (!hb) { hb = chromoHeader(line, biblio, CHROMO_BIBLIO_COLUMNS); return; }
    const [id, ref] = chromoRef(hb, line);
    idx.refs.set(id, ref);
    refs++;
  });
  if (!refs) throw new BulkFileError(`ChromoDB's ${biblio} holds no references`);
  return idx;
}
