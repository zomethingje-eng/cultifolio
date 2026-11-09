/**
 * The four sourced facts of round eighty-seven's stage 2 (the sources agent), written on each page by `--fill sources
 * --bulk <dir>` and by the walk after it builds a page: Kew's predicted extinction risk (`risk.ts`), CITES Appendix status
 * (`cites.ts`), chromosome counts from ChromoDB (`chromosomes.ts`) and the WFO Plant List's reading of the name (`wfo.ts`).
 * Offline: every file is in bulk/ (the CITES table in the repo).
 *
 * Rule 2: a file not on disk is "not asked" on the page (`skipped`, said why), never "none"; a page that held the fact
 * from an earlier read keeps it, with its own file and day (a figure carried is still the figure read, from the file
 * named). The day a figure was read (`read`) stays the day it was first read from that file: reading the same file again
 * and finding the same answer does not move it, so a walk that changes nothing moves no page's day of change.
 * Rule 6: `sourcesLines` is what the build prints, one line a source: the file, its date, its rows, the matches.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Dossier } from './schema';
import { loadRisk, riskOf, riskFileIn, RISK_VERSIONS, type RiskIndex } from './risk';
import { loadChromosomes, chromosomesOf, chromoFilesIn, CHROMO_VERSIONS, type ChromoIndex } from './chromosomes';
import { loadWfo, nameAgreementOf, wfoFileIn, wfoKey, WFO_RELEASES, type WfoIndex } from './wfo';
import { loadCitesTable, CitesIndex, citesOf, CITES_TABLE, CITES_TABLE_FILE } from './cites';
import type { DossierStore } from './corpus-run';

export const SOURCE_FIELDS = ['risk', 'cites', 'chromosomes', 'nameAgreement'] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];

/** What the four read of a page, from its dossier: Kew's names where Kew heads it, its IPNI id, Kew's family and life form. */
export interface SourcePage { name: string; authorship?: string; ipni?: string; family?: string; synonyms: string[]; lifeform?: string; /** Kew's plant_name_id of the heading (a `k` page's id; round eighty-seven's review of stage 2, B1). */ kew?: string; /** For each of `synonyms`, Kew's authors of it in the plant (`name.kew.by`; S1). */ synonymAuthors?: string[][] }
type DossierLike = Pick<Dossier, 'name' | 'ids'> & { key?: string; distribution?: { kew?: { lifeform?: string } } | null };
export function sourcePage(d: DossierLike): SourcePage {
  const kew = d.name.kew;
  const family = kew?.accepted?.family ?? d.name.family;
  const id = /^k(\d+)$/.exec(d.key ?? '')?.[1];
  return { name: d.name.scientific, ...(d.name.authorship ? { authorship: d.name.authorship } : {}), ...(d.ids.ipni ? { ipni: d.ids.ipni } : {}), ...(family ? { family } : {}), synonyms: kew?.synonyms ?? [], ...(kew?.by ? { synonymAuthors: kew.by } : {}), ...(d.distribution?.kew?.lifeform ? { lifeform: d.distribution.kew.lifeform } : {}), ...(id ? { kew: id } : {}) };
}

export interface LoadedSources {
  dir: string;
  risk: RiskIndex | null;
  chromo: ChromoIndex | null;
  wfo: WfoIndex | null;
  cites: CitesIndex;
  /** Each file's md5 against the one its publisher states: true, false, or undefined for a version this code does not know. */
  md5: Partial<Record<'risk' | 'chromo' | 'wfo', boolean | undefined>>;
  /**
   * A file that is there and could not be read whole, and why (round eighty-seven's review of stage 2, S5): an archive
   * the extractor failed on, a header without a column read, no rows, or not the rows its version holds. Every page is
   * "not asked", with this reason, and the build prints it.
   */
  failed: Partial<Record<'risk' | 'chromo' | 'wfo', string>>;
}

export async function md5File(path: string): Promise<string> {
  const h = createHash('md5');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/**
 * The four sources for these pages, from `dir` (the CITES table from the repo, or `citesTable`). Never throws on a missing
 * file. `headings`: every page's accepted name in the corpus, for CITES's homonym rule (`cites.ts`, S1); the pages'
 * own names where not given.
 */
export async function loadSources(dir: string, pages: readonly SourcePage[], opts: { citesTable?: string; checkMd5?: boolean; headings?: Iterable<string> } = {}): Promise<LoadedSources> {
  const ipnis = new Set(pages.flatMap((p) => (p.ipni ? [p.ipni] : [])));
  const names = new Set(pages.map((p) => wfoKey(p.name)));
  const kews = new Set(pages.flatMap((p) => (p.kew ? [p.kew] : [])));
  // Each read on its own: a file that fails is "not asked" with why, and the others are read (S5). With `checkMd5` (the
  // build's read of the publishers' files), each file must also hold the rows its version is known to hold.
  const whole = opts.checkMd5 !== false;
  const failed: LoadedSources['failed'] = {};
  const tried = async <T>(k: keyof LoadedSources['failed'], read: () => Promise<T | null>): Promise<T | null> => {
    try { return await read(); } catch (e) { failed[k] = e instanceof Error ? e.message : String(e); return null; }
  };
  const [risk, chromo, wfo] = await Promise.all([tried('risk', () => loadRisk(dir, ipnis, { whole })), tried('chromo', () => loadChromosomes(dir, ipnis, { whole })), tried('wfo', () => loadWfo(dir, ipnis, names, kews, { whole }))]);
  const md5: LoadedSources['md5'] = {};
  if (opts.checkMd5 !== false) {
    const rf = riskFileIn(dir), cf = chromoFilesIn(dir), wf = wfoFileIn(dir);
    if (risk && rf) { const want = RISK_VERSIONS[rf.version]?.md5; md5.risk = want ? (await md5File(rf.path)) === want : undefined; }
    if (chromo && cf) { const want = CHROMO_VERSIONS[cf.version]?.md5; md5.chromo = want ? (await md5File(cf.records)) === want.records && (await md5File(cf.biblio)) === want.biblio : undefined; }
    if (wfo && wf?.zip) { const want = WFO_RELEASES[wf.release]?.md5; md5.wfo = want ? (await md5File(wf.path)) === want : undefined; }
  }
  return { dir, risk, chromo, wfo, cites: new CitesIndex(loadCitesTable(opts.citesTable ?? CITES_TABLE_FILE), opts.headings ?? pages.map((p) => p.name)), md5, failed };
}

const notAsked = (today: string, what: string): { status: 'skipped'; read: string; detail: string } => ({ status: 'skipped', read: today, detail: `not asked: ${what}` });

/** A value with its objects' keys in order, so two reads that wrote the same fields in another order agree. */
const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
/** The same answer, read again: everything but the day it was read. */
const sameAnswer = (a: unknown, b: unknown) => {
  if (!a || !b) return false;
  const { read: _a, ...x } = a as Record<string, unknown>;
  const { read: _b, ...y } = b as Record<string, unknown>;
  return JSON.stringify(canon(x)) === JSON.stringify(canon(y));
};

/** The four fields of one dossier from what was loaded. Returns the fields that changed (the day of a same answer kept). */
export function applySources<D extends DossierLike & Partial<Pick<Dossier, SourceField>>>(d: D, s: LoadedSources, today: string): SourceField[] {
  const p = sourcePage(d);
  const fresh: Record<SourceField, Dossier[SourceField] | null> = {
    risk: s.risk ? riskOf(s.risk, p, today) : null,
    chromosomes: s.chromo ? chromosomesOf(s.chromo, p, today) : null,
    nameAgreement: s.wfo ? nameAgreementOf(s.wfo, p, today) : null,
    cites: citesOf(s.cites, p, today)
  };
  const missing: Record<SourceField, string> = {
    risk: `Kew's file of predicted extinction risk (Angiosperm_extinction_risk_predictions_v<N>.csv) was not in ${s.dir} when this page was read`,
    chromosomes: `ChromoDB's IAPT/IOPB files (IOPB_IAPT_records_v<N>.csv and its bibliography) were not in ${s.dir} when this page was read`,
    nameAgreement: `WFO's Plant List (wfo_backbone_<YYYY-MM>.zip) was not in ${s.dir} when this page was read`,
    cites: ''
  };
  const failedOf: Partial<Record<SourceField, string>> = { risk: s.failed?.risk, chromosomes: s.failed?.chromo, nameAgreement: s.failed?.wfo };
  const changed: SourceField[] = [];
  for (const k of SOURCE_FIELDS) {
    const before = d[k] as Dossier[SourceField] | undefined;
    let next = fresh[k];
    // A file there but not read whole: "not asked", with why, on every page (S5), never "none" and never an earlier read
    // passed off as this one's.
    const why = failedOf[k];
    if (why) next = notAsked(before?.status === 'skipped' && before.detail === `not asked: the file could not be read: ${why}` ? before.read : today, `the file could not be read: ${why}`);
    // A file not here: a fact read before stays, with its own file and day; else "not asked".
    if (!next) next = before && before.status !== 'skipped' ? before : notAsked(before?.status === 'skipped' ? before.read : today, missing[k]);
    // The CITES table not checked yet: a status read from a checked table before stays, as a missing file's does.
    if (k === 'cites' && next.status === 'skipped' && before && before.status !== 'skipped') next = before;
    if (before && sameAnswer(before, next)) next = { ...next, read: before.read };
    if (JSON.stringify(before) !== JSON.stringify(next)) { (d as Record<string, unknown>)[k] = next; changed.push(k); }
  }
  return changed;
}

/** A build that wrote a page afresh keeps the four fields its dossier before held, for the fill after it to read again (or to keep, without the files). */
export function carrySources(prev: Partial<Pick<Dossier, SourceField>> | null | undefined, d: Partial<Pick<Dossier, SourceField>>): void {
  if (!prev) return;
  for (const k of SOURCE_FIELDS) if (prev[k] && !d[k]) (d as Record<string, unknown>)[k] = prev[k];
}

export type SourceCounts = Record<SourceField, Record<'ok' | 'none' | 'undecided' | 'skipped', number>> & { read: number; written: number };
export const emptyCounts = (): SourceCounts => ({ read: 0, written: 0, ...Object.fromEntries(SOURCE_FIELDS.map((k) => [k, { ok: 0, none: 0, undecided: 0, skipped: 0 }])) }) as SourceCounts;
export function countInto(c: SourceCounts, d: Partial<Pick<Dossier, SourceField>>): void {
  for (const k of SOURCE_FIELDS) { const st = d[k]?.status; if (st) c[k][st]++; }
}

/** `--fill sources` over a store: every page (or those `keys` names) read, given the four fields, written where they changed. */
export function fillSources(store: DossierStore, s: LoadedSources, today: string, keep?: (file: string) => boolean): SourceCounts {
  const c = emptyCounts();
  for (const f of store.files()) {
    if (keep && !keep(f)) continue;
    let d: Dossier;
    try { d = store.read<Dossier>(f); } catch { continue; }
    c.read++;
    if (applySources(d, s, today).length) { store.write(f, d); c.written++; }
    countInto(c, d);
  }
  return c;
}

const n = (x: number) => x.toLocaleString('en-GB');
const pages = (x: number) => `${n(x)} page${x === 1 ? '' : 's'}`;
/** The pages that keep what an earlier read gave, the file not being here now. */
const kept = (c: Record<'ok' | 'none' | 'undecided' | 'skipped', number>) => c.ok + c.none + c.undecided;
const notAskedTail = (c: Record<'ok' | 'none' | 'undecided' | 'skipped', number>) => `not asked (${pages(c.skipped)} say so${kept(c) ? `; what an earlier read gave kept on ${pages(kept(c))}` : ''})`;
const md5Words = (ok: boolean | undefined) => (ok === true ? 'md5 as its publisher gives it' : ok === false ? 'md5 NOT the one its publisher gives: read the owner\'s step again' : 'md5 not known to this code');

/** The build's lines, one a source (rule 6): the file, its date, its rows, and what the pages read of it. */
export function sourcesLines(s: LoadedSources, c: SourceCounts): string[] {
  const of = (k: SourceField) => c[k];
  const lines: string[] = [];
  const r = of('risk');
  const failedLine = (what: string, k: keyof LoadedSources['failed'], c: Record<'ok' | 'none' | 'undecided' | 'skipped', number>) => `${what}: COULD NOT BE READ: ${s.failed[k]}: every page not asked (${pages(c.skipped)} say so)`;
  if (s.failed?.risk) lines.push(failedLine("Kew's predicted extinction risk", 'risk', r)); else lines.push(s.risk ? `Kew's predicted extinction risk: ${s.dir}/${s.risk.file} (version ${s.risk.version}, ${s.risk.asOf ?? 'a date this code does not know'}; ${md5Words(s.md5.risk)}), ${n(s.risk.rows)} rows read: ${pages(r.ok)} matched by IPNI id, ${n(r.none)} with no row, ${n(r.undecided)} not decided (no IPNI id, or two rows)` : `Kew's predicted extinction risk: no Angiosperm_extinction_risk_predictions_v<N>.csv in ${s.dir}: ${notAskedTail(r)}`);
  const ch = of('chromosomes');
  if (s.failed?.chromo) lines.push(failedLine("ChromoDB's chromosome counts", 'chromo', ch)); else lines.push(s.chromo ? `ChromoDB's chromosome counts: ${s.dir}/${s.chromo.file} (version ${s.chromo.version.replace('_', '.')}, ${s.chromo.asOf ?? 'a date this code does not know'}; ${md5Words(s.md5.chromo)}), ${n(s.chromo.rows)} records read: ${pages(ch.ok)} with counts by IPNI id and name, ${n(ch.none)} with none, ${n(ch.undecided)} not decided (no IPNI id, or records under it with the name spelt otherwise)` : `ChromoDB's chromosome counts: no IOPB_IAPT_records_v<N>.csv with its bibliography in ${s.dir}: ${notAskedTail(ch)}`);
  const w = of('nameAgreement');
  if (s.failed?.wfo) lines.push(failedLine('WFO Plant List', 'wfo', w)); else lines.push(s.wfo ? `WFO Plant List: ${s.dir}/${s.wfo.file} (release ${s.wfo.release}; ${md5Words(s.md5.wfo)}), ${n(s.wfo.rows)} rows read: ${pages(w.ok)}' names found (by IPNI id, or the exact name and authors under another IPNI id, or Kew's id between several), ${n(w.none)} not in WFO's list, ${n(w.undecided)} not decided (several rows, or the name under other authors only)` : `WFO Plant List: no wfo_backbone_<YYYY-MM>.zip in ${s.dir}: ${notAskedTail(w)}`);
  const ci = of('cites');
  const t = s.cites.table;
  lines.push(t.checked ? `CITES Appendices: ${CITES_TABLE} (${t.rows.length} plant listings; the Appendices valid from ${t.validFrom}, checked ${t.checked.day} against md5 ${t.checked.md5}): ${pages(ci.ok)} listed, ${n(ci.none)} not listed, ${n(ci.undecided)} not decided by their names` : `CITES Appendices: ${CITES_TABLE} (${t.rows.length} plant listings) is not yet checked against the Appendices valid from ${t.validFrom ?? '?'}: ${notAskedTail(ci)}; the owner's step is in docs/STAGE2-OWNER-87.md`);
  return lines;
}
