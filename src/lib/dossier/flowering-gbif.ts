/**
 * Flowering by month from one GBIF download (round ninety-two; docs/PLAN-92.md): iNaturalist's research-grade
 * observations as iNaturalist shares them with GBIF (GBIF's dataset 50c9509d-…, "iNaturalist Research-grade
 * Observations"), Plantae, annotated "flowers" in Darwin Core's `reproductiveCondition`, counted by the month observed,
 * under the page's GBIF keys. It replaces, for every page, the count read from iNaturalist's API one request a page
 * (`flowering.ts`, round eighty-seven), which took eleven days and counted observations GBIF never receives:
 *
 *   - **What is counted.** iNaturalist shares with GBIF only observations licensed CC0, CC BY or CC BY-NC; research grade
 *     is wild by iNaturalist's rule (a captive observation is never research grade). An observation counts when one of
 *     its annotations, split on "|", is exactly "flowers" (iNaturalist's "Flowering", the value the API counted): never
 *     "flower buds" (another value, which moves a season earlier) and never "no flowers or fruits". A row with no month is
 *     left out, and counted in the fill's line.
 *   - **Under which keys.** GBIF's backbone keys, as the page's records are read (`extra-keys.ts`): a row is the page's
 *     when its taxon key, its accepted key or its species key is the page's own key (its synonyms' and its varieties'
 *     observations so included, as GBIF's taxonKey search includes them; a form under a variety under the page's key is
 *     not, the only rank lost), not a key given to another page (round eighty-six's infra keys), or one of the page's
 *     other keys and not one of that key's exceptions (read against the row's taxon key, as the build reads a record's).
 *     A row is counted once on a page, whichever keys reach it.
 *   - **Rule 2.** A page with no key to count under is not counted ("not asked: no GBIF key"), never none. A page with a
 *     key and no row is none, said with its source: the download holds every observation of the dataset that is
 *     annotated flowers, so the absence is the download's answer. A download not read whole writes nothing.
 *   - **One source.** The fill writes every page with a key, and takes the API's count off a page with none, so no page
 *     shows the two side by side (decision 2 of docs/PLAN-92.md). `--dry-run` writes no page: it compares the download's
 *     counts with the API's on every page the API read, for the review stop, before anything is overwritten.
 *
 * Pure: the build streams the file into `parseFloweringRows`, and the tests build tables from rows.
 */
import type { DossierStore } from './corpus-run';
import type { Flowering, FloweringGbif } from './schema';

/** GBIF's dataset of iNaturalist's research-grade observations. */
export const INAT_GBIF_DATASET = '50c9509d-22c7-4a22-a47d-8c48425ef4a7';

/** The value an observation's annotations must hold, exactly, to be counted. */
export const FLOWERS = 'flowers';

/**
 * The download's query (GBIF's SQL download, SQL_TSV_ZIP; accepted by GBIF's validation on 2026-11-15). The `LIKE` keeps
 * the file small; it also lets "no flowers or fruits" through, which `isFlowering` leaves out. `"month"` is quoted, as
 * GBIF's validator writes it. No comment lines: GBIF's parser refuses them.
 *
 * The keys are the GBIF Backbone's, the keys every page holds: in GBIF's SQL table the plain `taxonkey`, `kingdomkey` and
 * the rest are the Catalogue of Life's (letters and digits, docs/COLXR-87.md), and the backbone's are the
 * `occurrence.gbif_classification.*` columns, as `sqlQuery` reads them since round seventy-nine. The first download
 * (0008674-261110092616502, 15 November 2026) asked the plain columns, `kingdomkey = 6`, and held no row.
 */
const BB = 'occurrence.gbif_classification';
export const FLOWERING_SQL = `SELECT ${BB}.taxonkey AS taxonkey, ${BB}.acceptedtaxonkey AS acceptedtaxonkey, ${BB}.specieskey AS specieskey, "month", reproductivecondition, COUNT(*) AS n FROM occurrence WHERE datasetkey = '${INAT_GBIF_DATASET}' AND ${BB}.kingdomkey = '6' AND reproductivecondition LIKE '%${FLOWERS}%' GROUP BY ${BB}.taxonkey, ${BB}.acceptedtaxonkey, ${BB}.specieskey, "month", reproductivecondition`;

/** Whether a `reproductiveCondition` value holds the flowers annotation: one of its parts, split on "|", is exactly it. */
export const isFlowering = (cond: string | undefined): boolean => !!cond && cond.split('|').some((p) => p.trim().toLowerCase() === FLOWERS);

export interface FloweringRow { taxon?: number; accepted?: number; species?: number; month: number; n: number }

export interface FloweringTable {
  rows: FloweringRow[];
  /** Row indexes by each key column. */
  byKey: Map<number, number[]>;
  /** What was read: the lines, the rows taken, the observations taken, and those left out (and why). */
  read: { lines: number; rows: number; observations: number; notFlowers: number; noMonth: number; noKey: number; bad: number };
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s === '' || s === '\\N' || s === 'null') return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * The download's file, line by line (its header first: the columns are found by name, so their order may change).
 * Throws on a file whose header lacks a column the count needs: nothing is taken from it.
 */
export function parseFloweringRows(lines: Iterable<string>): FloweringTable {
  const t: FloweringTable = { rows: [], byKey: new Map(), read: { lines: 0, rows: 0, observations: 0, notFlowers: 0, noMonth: 0, noKey: 0, bad: 0 } };
  let col: Record<string, number> | undefined;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!col) {
      const h = line.split('\t').map((x) => x.trim().toLowerCase().replace(/^"|"$/g, ''));
      col = Object.fromEntries(h.map((x, i) => [x, i]));
      for (const need of ['taxonkey', 'acceptedtaxonkey', 'specieskey', 'month', 'reproductivecondition', 'n']) {
        if (!(need in col)) throw new Error(`the flowering download's header has no "${need}" column (it has: ${h.join(', ')}): not GBIF's answer to FLOWERING_SQL`);
      }
      continue;
    }
    if (!line) continue;
    t.read.lines++;
    const c = line.split('\t');
    const n = Number(c[col.n]);
    if (!Number.isInteger(n) || n < 0) { t.read.bad++; continue; }
    if (!isFlowering(c[col.reproductivecondition])) { t.read.notFlowers += n; continue; }
    const month = Number(c[col.month]);
    if (!Number.isInteger(month) || month < 1 || month > 12) { t.read.noMonth += n; continue; }
    const row: FloweringRow = { taxon: num(c[col.taxonkey]), accepted: num(c[col.acceptedtaxonkey]), species: num(c[col.specieskey]), month, n };
    if (!row.taxon && !row.accepted && !row.species) { t.read.noKey += n; continue; }
    const i = t.rows.push(row) - 1;
    for (const k of new Set([row.taxon, row.accepted, row.species])) {
      if (!k) continue;
      const l = t.byKey.get(k);
      if (l) l.push(i); else t.byKey.set(k, [i]);
    }
    t.read.rows++;
    t.read.observations += n;
  }
  if (!col) throw new Error('the flowering download is empty: not even a header');
  return t;
}

/** The keys a page counts under: its own (less the keys given to other pages), and its other keys with their exceptions. */
export interface PageKeys { own?: number; givenAway?: ReadonlySet<number>; extra: ReadonlyArray<{ key: number; except?: readonly number[] }> }

/** The page's twelve counts, January first, and the keys that gave a row. Each row once. */
export function countUnder(t: FloweringTable, k: PageKeys): { months: number[]; keys: number[] } {
  const months = Array(12).fill(0) as number[];
  const seen = new Set<number>();
  const gave = new Set<number>();
  const take = (key: number, ok: (r: FloweringRow) => boolean) => {
    for (const i of t.byKey.get(key) ?? []) {
      if (seen.has(i)) continue;
      const r = t.rows[i];
      if (!ok(r)) continue;
      seen.add(i);
      gave.add(key);
      months[r.month - 1] += r.n;
    }
  };
  const away = k.givenAway;
  if (k.own) take(k.own, (r) => !away || !((r.taxon && away.has(r.taxon)) || (r.accepted && away.has(r.accepted))));
  for (const x of k.extra) {
    const ex = x.except?.length ? new Set(x.except) : undefined;
    take(x.key, (r) => !ex || (r.taxon !== undefined && !ex.has(r.taxon)));
  }
  return { months, keys: [...gave].sort((a, b) => a - b) };
}

/** The download as the page cites it: GBIF's key for it, its DOI, and the day GBIF made it. */
export interface FloweringDownload { key: string; doi: string; made: string }

export type FloweringGbifPage = { key: string; name: { scientific: string }; ids: { gbif?: number; inat?: number }; flowering?: Flowering };

/** Whether a page's flowering is the download's (round ninety-two) or the API's (round eighty-seven). */
export const fromGbif = (f: Flowering | undefined): f is FloweringGbif => !!f && 'source' in f && f.source === 'gbif';

/** The comparison of one page the API read with what the download gives it (`--dry-run`). */
export interface Compared { page: string; name: string; api: number; gbif: number; ratio?: number; peakApi?: number; peakGbif?: number; tenthSame?: boolean; cosine?: number }

export interface FloweringGbifCounts {
  pages: number;
  counted: number;
  none: number;
  noKey: number;
  /** Pages whose API count was taken off: they have no key to count under. */
  apiDropped: number;
  /** Pages whose count was the download's already, from the same download: passed by. */
  same: number;
  compared: Compared[];
}

const peak = (m: number[]) => m.indexOf(Math.max(...m));
/** The months holding a tenth of the year's count or more. */
const tenths = (m: number[]) => { const t = m.reduce((a, n) => a + n, 0); return m.map((n) => t > 0 && n >= t / 10).join(''); };
const cosine = (a: number[], b: number[]) => { const d = a.reduce((s, x, i) => s + x * b[i], 0); const na = Math.hypot(...a), nb = Math.hypot(...b); return na && nb ? d / (na * nb) : 0; };
/** Months apart on the year's circle (December and January are one apart). */
export const monthsApart = (a: number, b: number) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

export function compare(page: string, name: string, api: number[], gbif: number[]): Compared {
  const ta = api.reduce((a, n) => a + n, 0), tg = gbif.reduce((a, n) => a + n, 0);
  const c: Compared = { page, name, api: ta, gbif: tg };
  if (ta > 0 && tg > 0) Object.assign(c, { ratio: tg / ta, peakApi: peak(api), peakGbif: peak(gbif), tenthSame: tenths(api) === tenths(gbif), cosine: cosine(api, gbif) });
  return c;
}

/**
 * Every page on the store: counted under its keys from the table, and written, unless `dryRun`. `keysOf` gives the
 * build's keys for the page. A page the API read is compared (always, so the dry run and the fill say the same figures).
 */
export function fillFloweringGbif(store: DossierStore, t: FloweringTable, dl: FloweringDownload, day: string, keysOf: (d: FloweringGbifPage) => PageKeys, opts: { dryRun?: boolean } = {}): FloweringGbifCounts {
  const c: FloweringGbifCounts = { pages: 0, counted: 0, none: 0, noKey: 0, apiDropped: 0, same: 0, compared: [] };
  for (const file of store.files()) {
    let d: FloweringGbifPage;
    try { d = store.read<FloweringGbifPage>(file); } catch { continue; }
    c.pages++;
    const k = keysOf(d);
    const prev = d.flowering;
    if (!k.own && !k.extra.length) {
      c.noKey++;
      if (prev) { c.apiDropped++; if (!opts.dryRun) { delete d.flowering; store.write(file, d); } }
      continue;
    }
    const { months, keys } = countUnder(t, k);
    if (months.every((n) => n === 0)) c.none++; else c.counted++;
    if (prev && !fromGbif(prev) && prev.months) c.compared.push(compare(d.key, d.name.scientific, prev.months, months));
    if (fromGbif(prev) && prev.doi === dl.doi && prev.months.join() === months.join() && prev.keys.join() === keys.join()) { c.same++; continue; }
    if (opts.dryRun) continue;
    d.flowering = { source: 'gbif', ...(k.own ? { key: k.own } : {}), keys, months, doi: dl.doi, made: dl.made, read: day };
    store.write(file, d);
  }
  return c;
}

/** Below this many observations from the API, a page is left out of the shape figures (too few to say a peak). */
export const COMPARE_MIN = 30;

/** The comparison's figures, for the review's `expect` lines. */
export function compareFigures(cs: readonly Compared[]) {
  const both = cs.filter((x) => x.ratio !== undefined);
  const big = both.filter((x) => x.api >= COMPARE_MIN);
  const ratios = both.map((x) => x.ratio!).sort((a, b) => a - b);
  const median = ratios.length ? (ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]) / 2) : 0;
  const within1 = big.filter((x) => monthsApart(x.peakApi!, x.peakGbif!) <= 1).length;
  const over100 = cs.filter((x) => x.api > 100);
  const lost = over100.filter((x) => x.gbif === 0).length;
  const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);
  return {
    compared: cs.length,
    both: both.length,
    median,
    peakWithin1: pct(within1, big.length),
    tenthSame: pct(big.filter((x) => x.tenthSame).length, big.length),
    big: big.length,
    over100: over100.length,
    lostOver100: pct(lost, over100.length),
    apiOnly: cs.filter((x) => x.api > 0 && x.gbif === 0).length,
    gbifOnly: cs.filter((x) => x.api === 0 && x.gbif > 0).length
  };
}

/**
 * The pages to look into before anything goes live (decision 2): the API counted 30 or more and the download none, or
 * their shapes are far apart (cosine under 0.8) — a synonym GBIF files under another key, or another plant.
 */
export const sharplyApart = (x: Compared) => x.api >= COMPARE_MIN && (x.gbif === 0 || (x.cosine !== undefined && x.cosine < 0.8));

const f1 = (x: number) => x.toFixed(1);

/** The fill's line (rule 6), and the comparison's, which the review's `expect` lines read. */
export function floweringGbifLine(c: FloweringGbifCounts, t: FloweringTable, dl: FloweringDownload, dryRun: boolean): string {
  const r = t.read;
  const k = compareFigures(c.compared);
  const apart = c.compared.filter(sharplyApart).length;
  return [
    `  the flowering download ${dl.key} (GBIF.org, ${dl.made}, https://doi.org/${dl.doi}): ${r.lines} rows read, ${r.rows} taken, ${r.observations} observations annotated flowers; left out: ${r.noMonth} with no month, ${r.notFlowers} annotated otherwise ("no flowers or fruits" and the like), ${r.noKey} with no key, ${r.bad} rows unreadable.`,
    `  ${c.pages} pages ${dryRun ? 'read (a dry run: nothing written)' : 'read'}: ${c.counted} counted, ${c.none} with no observation annotated flowers in the download, ${c.noKey} with no GBIF key, not counted${c.apiDropped ? ` (${c.apiDropped} of them held iNaturalist's API count, ${dryRun ? 'which the fill takes off' : 'taken off'})` : ''}; ${c.same} counted from this download before and passed by.`,
    `  compared with iNaturalist's API on the ${k.compared} pages it read: ${k.both} with counts from both, median ratio ${k.median.toFixed(2)}; of the ${k.big} with ${COMPARE_MIN} or more from the API, peak month within one month on ${f1(k.peakWithin1)}%, the months of a tenth of the year the same on ${f1(k.tenthSame)}%; of the ${k.over100} with over 100 from the API, ${f1(k.lostOver100)}% with none in the download; ${k.apiOnly} with some from the API and none from the download, ${k.gbifOnly} the other way; ${apart} sharply apart, listed.`
  ].join('\n');
}
