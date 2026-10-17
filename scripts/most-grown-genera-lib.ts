/**
 * The most-grown genera (round seventy-five, the owner's decision): each genus of the reference, ranked by iNaturalist's
 * observations of plants marked captive or cultivated (`captive=true`), the genus and every taxon under it, in Plantae.
 * The network-free part of `scripts/most-grown-genera.ts`, so its tests run on recorded answers.
 *
 * What is asked, and why it is the cheapest correct query (measured on 17 October 2026):
 *   - `/v1/observations/species_counts?captive=true&hrank=genus&lrank=genus` does answer per genus, but it counts only the
 *     observations identified to the genus itself (Rosa: 198,852, the same as `rank=genus`), not those of its species
 *     (Rosa and its descendants: 232,507). It is not the measure.
 *   - `/v1/observations/taxonomy?captive=true&taxon_id=47126` answers the whole tree of Plantae's captive observations in
 *     one request (about 80,000 taxa, 16 MB), each taxon with `descendant_obs_count`: the observations of the taxon and
 *     every taxon under it, which is the measure. Its `size` says how many taxa it holds, so a cut answer is told apart.
 *   - A genus the reference holds that the tree does not name is asked on its own, `/v1/observations?captive=true&
 *     taxon_id=<genus>&per_page=0`, read from `total_results`, so its count is an answer and never an absence.
 *   - The names are resolved against every active genus in Plantae, `/v1/taxa?taxon_id=47126&rank=genus&is_active=true`,
 *     paged by id (about 16,500 genera, 34 requests), so a homonym is seen even when one of the two has no captive record.
 */
import type { FetchResult } from '../src/lib/dossier/fetch';

export const PLANTAE = 47126;
export const API = 'https://api.inaturalist.org/v1';
export const TREE_URL = `${API}/observations/taxonomy?captive=true&taxon_id=${PLANTAE}`;
export const TAXA_PAGE = 500;
export const taxaUrl = (above: number) => `${API}/taxa?taxon_id=${PLANTAE}&rank=genus&is_active=true&per_page=${TAXA_PAGE}&order_by=id&order=asc&id_above=${above}`;
export const countUrl = (id: number) => `${API}/observations?captive=true&taxon_id=${id}&per_page=0`;
export const TERMS =
  "Counts read from iNaturalist's public API (https://api.inaturalist.org/v1/docs/) under iNaturalist's Terms of Use (https://www.inaturalist.org/pages/terms) and its API Recommended Practices (https://www.inaturalist.org/pages/api+recommended+practices), at one request every two seconds. They are counts of observations, facts and not a licensed work; no observation's photograph or text is taken. Credit: iNaturalist and its observers.";

export type TaxonRow = { id: number; name: string; rank: string; is_active: boolean; ancestor_ids?: number[] };
export type TaxaPage = { total_results: number; per_page?: number; results: TaxonRow[] };
export type TreeRow = { id: number; name: string; rank: string; is_active: boolean; descendant_obs_count: number };
export type Tree = { size: number; results: TreeRow[] };

export type Line =
  | { kind: 'genus'; name: string; id: number; count: number }
  | { kind: 'genus'; name: string; id: number | null; count: null; why: string }
  | { kind: 'refused'; name: string; why: string };

/** The active genera of Plantae, by name; each name with every id that carries it (two ids: a homonym). */
export function generaByName(rows: TaxonRow[]): Map<string, number[]> {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.rank !== 'genus' || !r.is_active) continue;
    if (r.ancestor_ids && !r.ancestor_ids.includes(PLANTAE)) continue;
    const ids = by.get(r.name);
    if (ids) { if (!ids.includes(r.id)) ids.push(r.id); } else by.set(r.name, [r.id]);
  }
  return by;
}

/** The tree's counts by taxon id, and the inactive genera it names (for a refusal's reason); null when the answer is cut. */
export function readTree(t: Tree | null): { counts: Map<number, number>; inactive: Map<string, number[]> } | null {
  if (!t || !Array.isArray(t.results) || t.results.length !== t.size) return null;
  const counts = new Map<number, number>();
  const inactive = new Map<string, number[]>();
  for (const r of t.results) {
    if (typeof r.descendant_obs_count === 'number') counts.set(r.id, r.descendant_obs_count);
    if (r.rank === 'genus' && !r.is_active) inactive.set(r.name, [...(inactive.get(r.name) ?? []), r.id]);
  }
  return { counts, inactive };
}

/**
 * Rule 3: a genus is taken only where iNaturalist holds exactly one active taxon of rank genus in Plantae with exactly
 * that name. Two or more is a homonym and none is no match; both are refused with their reason, never guessed.
 */
export function resolveGenus(name: string, byName: Map<string, number[]>, inactive: Map<string, number[]> = new Map()): { id: number } | { why: string } {
  const ids = byName.get(name) ?? [];
  if (ids.length === 1) return { id: ids[0] };
  if (ids.length > 1) return { why: `homonym: ${ids.length} active genera in Plantae are named ${name} (taxa ${ids.join(', ')})` };
  const old = inactive.get(name);
  return { why: old ? `no active genus in Plantae is named ${name}; iNaturalist holds it only as an inactive taxon (${old.join(', ')})` : `no active genus in Plantae is named ${name}` };
}

export type Fetch = <T>(url: string) => Promise<FetchResult<T>>;
export type Run = { fetchJson: Fetch; genera: string[]; log?: (s: string) => void };
export type Result = { lines: Line[]; names: number; tree: number | null; asked: number };

/** Every active genus of Plantae, paged by id; null when a page failed or the pages do not add up to the total. */
export async function allGenera(fetchJson: Fetch, log: (s: string) => void): Promise<{ rows: TaxonRow[]; asked: number } | null> {
  const rows: TaxonRow[] = [];
  let above = 0, total = -1, asked = 0;
  for (;;) {
    const r = await fetchJson<TaxaPage>(taxaUrl(above));
    asked++;
    if (r.status !== 'ok') { log(`  genera after id ${above}: ${r.status}${'detail' in r ? ` ${r.detail}` : ''}`); return null; }
    if (total < 0) total = r.data.total_results;
    rows.push(...r.data.results);
    log(`  ${rows.length} of ${total} genera`);
    if (r.data.results.length < TAXA_PAGE) break;
    above = r.data.results[r.data.results.length - 1].id;
  }
  if (rows.length !== total) { log(`  the pages gave ${rows.length} genera where the first said ${total}`); return null; }
  return { rows, asked };
}

/** The whole run, on whatever fetcher it is given: the names, the tree, then each genus the tree did not name. */
export async function mostGrown({ fetchJson, genera, log = () => {} }: Run): Promise<Result> {
  log('Reading every active genus in Plantae from iNaturalist…');
  const all = await allGenera(fetchJson, log);
  let asked = all?.asked ?? 0;
  log('Reading the tree of captive observations in Plantae…');
  const t = await fetchJson<Tree>(TREE_URL);
  asked++;
  const tree = t.status === 'ok' ? readTree(t.data) : null;
  if (!tree) log(`  the tree: ${t.status === 'ok' ? `cut (${t.data?.results?.length ?? 0} of ${t.data?.size} taxa)` : `${t.status}${'detail' in t ? ` ${t.detail}` : ''}`}; each genus is asked on its own`);
  const byName = all ? generaByName(all.rows) : null;
  const lines: Line[] = [];
  for (const name of [...new Set(genera)].sort()) {
    if (!byName) { lines.push({ kind: 'genus', name, id: null, count: null, why: "iNaturalist's list of genera was not read" }); continue; }
    const r = resolveGenus(name, byName, tree?.inactive);
    if ('why' in r) { lines.push({ kind: 'refused', name, why: r.why }); continue; }
    const n = tree?.counts.get(r.id);
    if (n !== undefined) { lines.push({ kind: 'genus', name, id: r.id, count: n }); continue; }
    // Not in the tree (no captive observation, or no tree): asked on its own, so a zero is an answer.
    const c = await fetchJson<{ total_results: number }>(countUrl(r.id));
    asked++;
    if (c.status === 'ok' && typeof c.data.total_results === 'number') lines.push({ kind: 'genus', name, id: r.id, count: c.data.total_results });
    else lines.push({ kind: 'genus', name, id: r.id, count: null, why: `the count did not answer (${c.status}${'detail' in c ? ` ${c.detail}` : ''})` });
  }
  return { lines, names: all?.rows.length ?? 0, tree: tree ? tree.counts.size : null, asked };
}

/** The file: a header, the day, the queries, the terms, the counted genera most observed first, those not checked, then the refused. */
export function formatList(r: Result, o: { day: string; species: number; genera: number }): string {
  const counted = r.lines.filter((l): l is Extract<Line, { count: number }> => l.kind === 'genus' && l.count !== null).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const unchecked = r.lines.filter((l): l is Extract<Line, { count: null }> => l.kind === 'genus' && l.count === null);
  const refused = r.lines.filter((l): l is Extract<Line, { kind: 'refused' }> => l.kind === 'refused');
  return [
    "# The genera of Cultifolio's species reference, ranked by iNaturalist's observations of plants marked captive or cultivated.",
    '# Written by scripts/most-grown-genera.ts; run it again to refresh it (npx tsx scripts/most-grown-genera.ts --index static/s/v2/index.json).',
    '# genus: the name, its iNaturalist taxon id, and the observations marked captive or cultivated of the genus and every taxon under it.',
    '# "not checked": the request for that genus failed or was not made; it is not a count of none.',
    '# refused: a genus of the reference for which no iNaturalist taxon was taken (rule 3: exactly one active genus in Plantae of exactly that name), and why.',
    `day\t${o.day}`,
    `index\t${o.species} species in ${o.genera} genera; ${counted.length} counted, ${unchecked.length} not checked, ${refused.length} refused`,
    `query\t${TREE_URL} (descendant_obs_count of each genus)`,
    `query\t${countUrl(0).replace('taxon_id=0', 'taxon_id=<genus>')} (total_results), for a genus the tree does not name`,
    `names\t${taxaUrl(0).replace('id_above=0', 'id_above=<last id>')} (${r.names} genera)`,
    `terms\t${TERMS}`,
    ...counted.map((l) => `genus\t${l.name}\t${l.id}\t${l.count}`),
    ...unchecked.map((l) => `genus\t${l.name}\t${l.id ?? '-'}\tnot checked\t${l.why}`),
    ...refused.map((l) => `refused\t${l.name}\t${l.why}`),
    ''
  ].join('\n');
}
