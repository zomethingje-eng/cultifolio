/**
 * The WFO Plant List's reading of each page's name (round eighty-seven, stage 2; the sources agent), read offline from
 * World Flora Online's release on Zenodo:
 *
 *   World Flora Online Plant List June 2026 (release 2026-06, 21 June 2026), https://doi.org/10.5281/zenodo.20782718,
 *   CC0 1.0. The file read is `_DwC_backbone_R.zip` ("a single Darwin Core Archive file containing non deprecated
 *   names and taxa", 121,660,019 bytes, md5 0e4486945cd9f7af548ca87eb9a870ed), which the owner saves as
 *   bulk/wfo_backbone_2026-06.zip: the release is read from the file's name. Read 9 November 2026. WFO's releases
 *   come every June and December; the next is 2026-12.
 *
 * Its one member, classification.csv (952,821,772 bytes), is tab-separated with fields in double quotes where they hold
 * a space: taxonID (wfo-…), scientificNameID (urn:lsid:ipni.org:names:<IPNI id>, where WFO gives one), localID,
 * scientificName, taxonRank, parentNameUsageID, scientificNameAuthorship, family, …, taxonomicStatus (Accepted, Synonym
 * or Unchecked), acceptedNameUsageID, … 1,664,014 rows of release 2026-06: 454,635 Accepted, 1,026,257 Synonym and
 * 183,122 Unchecked.
 *
 * Streamed twice, never held: the first pass keeps the rows whose IPNI id, Kew id (`localID`) or exact name a page has;
 * the second the rows those synonyms are filed under, for the accepted name's words.
 *
 * The match (rule 3), round eighty-seven's review of stage 2 (B1): WFO often files the same name and authors under
 * another IPNI id than Kew's (Abies densa Griff.: Kew's 261506-1, WFO's wfo-0000511103 under 77200679-1, Accepted), and
 * the first match, which took a name's row only where WFO gave it no IPNI id, said "does not hold this name" of 2,526
 * pages whose name and authors WFO holds. Now, in order:
 *   1. the one row under the page's IPNI id;
 *   2. where WFO has several rows under it (a misspelt duplicate, Achillea chypeolata Sm. beside A. clypeolata Sm.),
 *      the one of them whose `localID` is the page's Kew id (plant_name_id), else the one spelt as the page with its
 *      authors, else not decided;
 *   3. else the one row of the exact name and the exact authors, whatever IPNI id WFO gives it, the two ids said where
 *      they differ; of several, the one carrying the page's Kew id, else not decided;
 *   4. else, where WFO holds the words only under other authors, or a row carries the page's Kew id with the same
 *      authors and other words, not decided, said with WFO's rows; else WFO does not hold the name.
 * `localID` alone never decides: read on the release 2026-06, 1,135,174 of its 1,664,014 rows hold a number there (and
 * 96,481 "wcvp-<id>", read as the same Kew id), and a
 * Taxonomic Expert Network's own numbers meet Kew's (the row with localID 518425, Kew's id of Utricularia inflata Walter, is
 * Nama glandulosa Peter). It confirms a row whose words, authors or IPNI id are already the page's.
 */
import { existsSync, readdirSync, createReadStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { NameAgreement } from './schema';
import { BulkFileError } from './bulk-file-error';

export const WFO_FILE = /^wfo_backbone_(\d{4}-\d{2})\.zip$/;
export const WFO_PLAIN = /^wfo_classification_(\d{4}-\d{2})\.csv$/;
/** `rows`: the rows of classification.csv below its header, counted on the release (a read that gives another number failed). */
export const WFO_RELEASES: Record<string, { record: string; published: string; md5: string; rows: number }> = {
  '2026-06': { record: '20782718', published: '2026-06-21', md5: '0e4486945cd9f7af548ca87eb9a870ed', rows: 1_664_014 }
};
const IPNI_LSID = 'urn:lsid:ipni.org:names:';

export interface WfoRow { id: string; ipni?: string; name: string; authors: string; rank: string; status: 'accepted' | 'synonym' | 'unchecked'; accepted?: string; localId?: string }

/** The columns this code reads: a header without one of them is not WFO's classification as this code knows it. */
export const WFO_COLUMNS = ['taxonID', 'scientificNameID', 'localID', 'scientificName', 'taxonRank', 'scientificNameAuthorship', 'taxonomicStatus', 'acceptedNameUsageID'] as const;

/** A field as WFO writes it: in double quotes where it holds a space, a doubled quote inside. */
const unquote = (s: string | undefined) => (s && s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s ?? '');

export function wfoHeader(line: string): Record<string, number> {
  const h = Object.fromEntries(line.replace(/^﻿/, '').split('\t').map((k, i) => [unquote(k), i]));
  const missing = WFO_COLUMNS.filter((k) => h[k] === undefined);
  if (missing.length) throw new BulkFileError(`WFO's classification.csv has no column ${missing.join(', ')} (its header: ${line.slice(0, 120)})`);
  return h;
}

export function wfoRow(h: Record<string, number>, line: string): WfoRow | null {
  const c = line.split('\t');
  const st = unquote(c[h.taxonomicStatus]);
  const status = st === 'Accepted' ? 'accepted' : st === 'Synonym' ? 'synonym' : st === 'Unchecked' ? 'unchecked' : null;
  if (!status) return null;
  const sid = unquote(c[h.scientificNameID]);
  const acc = unquote(c[h.acceptedNameUsageID]);
  const local = unquote(c[h.localID]);
  return { id: unquote(c[h.taxonID]), ...(sid.startsWith(IPNI_LSID) ? { ipni: sid.slice(IPNI_LSID.length) } : {}), name: unquote(c[h.scientificName]), authors: unquote(c[h.scientificNameAuthorship]), rank: unquote(c[h.taxonRank]), status, ...(acc ? { accepted: acc } : {}), ...(local ? { localId: local } : {}) };
}

/** A name's spelling as two lists compare it: one space, and Kew's hybrid sign and WFO's read alike. */
export const wfoKey = (s: string) => s.replace(/\s+/g, ' ').replace(/(^| )[x×] /g, '$1× ').trim();

export class WfoIndex {
  readonly byIpni = new Map<string, WfoRow[]>();
  readonly byName = new Map<string, WfoRow[]>();
  readonly byId = new Map<string, WfoRow>();
  readonly byLocal = new Map<string, WfoRow[]>();
  rows = 0;
  constructor(readonly file: string, readonly release: string) {}
  add(r: WfoRow): void {
    this.byId.set(r.id, r);
    if (r.ipni) { const a = this.byIpni.get(r.ipni); if (a) a.push(r); else this.byIpni.set(r.ipni, [r]); }
    if (r.localId) { const l = this.byLocal.get(r.localId); if (l) l.push(r); else this.byLocal.set(r.localId, [r]); }
    const k = wfoKey(r.name), b = this.byName.get(k);
    if (b) { if (!b.includes(r)) b.push(r); } else this.byName.set(k, [r]);
  }
}

export interface WfoPage { ipni?: string | null; name: string; authorship?: string | null; /** Kew's plant_name_id of the page's name (a `k` page's id). */ kew?: string | null }

/** Kew's id a `localID` gives: the number itself (the rows seeded from Kew's checklist), or "wcvp-<id>" (96,481 rows of 2026-06). */
export const kewIdOf = (local: string | undefined) => (local?.startsWith('wcvp-') ? local.slice(5) : local);
const full = (r: WfoRow) => `${r.name}${r.authors ? ` ${r.authors}` : ''}`;
/** WFO's IPNI id of a row against the page's, said where they differ. */
const idsWords = (r: WfoRow, page: WfoPage) => (r.ipni === (page.ipni ?? undefined) ? '' : `WFO files it under ${r.ipni ? `IPNI id ${r.ipni}` : 'no IPNI id'}, Kew under ${page.ipni ? `IPNI id ${page.ipni}` : 'none'}`);

/** The page's field from the index: WFO's row for the page's name, and what WFO makes of it (the rule is above). */
export function nameAgreementOf(idx: WfoIndex, page: WfoPage, today: string): NameAgreement {
  const base = { read: today, release: idx.release, file: idx.file };
  const byIpni = page.ipni ? idx.byIpni.get(page.ipni) ?? [] : [];
  const kewOf = (rows: WfoRow[]) => (page.kew ? rows.filter((r) => kewIdOf(r.localId) === page.kew) : []);
  let row: WfoRow | undefined;
  let by: 'ipni' | 'name' | 'kew';
  let detail = '';
  if (byIpni.length === 1) { row = byIpni[0]; by = 'ipni'; }
  else if (byIpni.length > 1) {
    const k = kewOf(byIpni);
    const exact = byIpni.filter((r) => wfoKey(r.name) === wfoKey(page.name) && !!page.authorship && r.authors === page.authorship);
    if (k.length === 1) {
      row = k[0]; by = 'kew';
      detail = `WFO's list holds ${byIpni.length} rows under IPNI id ${page.ipni}; the one taken carries Kew's id for the name (${page.kew})`;
    } else if (exact.length === 1) {
      row = exact[0]; by = 'ipni';
      detail = `WFO's list holds ${byIpni.length} rows under IPNI id ${page.ipni}; the one taken is spelt as the page, with its authors`;
    } else return { status: 'undecided', ...base, detail: `WFO's list holds ${byIpni.length} rows under IPNI id ${page.ipni} (${byIpni.map(full).join('; ')})` };
  } else {
    const spelt = idx.byName.get(wfoKey(page.name)) ?? [];
    let same = spelt.filter((r) => !!page.authorship && r.authors === page.authorship);
    if (same.length > 1) {
      const k = kewOf(same);
      if (k.length !== 1) return { status: 'undecided', ...base, detail: `WFO's list holds ${same.length} rows of ${page.name} ${page.authorship}, under ${same.map((r) => (r.ipni ? `IPNI id ${r.ipni}` : 'no IPNI id')).join(', ')}` };
      same = k;
    }
    if (same.length === 1) {
      row = same[0]; by = 'name';
      const ids = idsWords(row, page);
      detail = `matched by the exact name and authors${ids ? `: ${ids}` : ''}`;
    } else {
      // Not the page's name and authors: what WFO does hold, said, never "does not hold".
      const other = spelt.filter((r) => r.authors !== page.authorship);
      if (other.length) return { status: 'undecided', ...base, detail: `WFO's list holds ${page.name} only under other authors (${[...new Set(other.map((r) => r.authors || 'none given'))].join('; ')})${page.authorship ? `, not ${page.authorship}` : ', and the page gives none'}${page.ipni ? `, and nothing under IPNI id ${page.ipni}` : ''}` };
      const respelt = kewOf(page.kew ? [...(idx.byLocal.get(page.kew) ?? []), ...(idx.byLocal.get(`wcvp-${page.kew}`) ?? [])] : []).filter((r) => !!page.authorship && r.authors === page.authorship);
      if (respelt.length) return { status: 'undecided', ...base, detail: `WFO's row carrying Kew's id for the name (${page.kew}) spells it ${respelt.map((r) => `${full(r)}${r.ipni ? ` (IPNI id ${r.ipni})` : ''}`).join('; ')}` };
      return { status: 'none', ...base, detail: page.ipni ? `WFO's list holds no row under IPNI id ${page.ipni}, none of the name ${page.name}${page.kew ? `, and none carrying Kew's id ${page.kew} with these authors` : ''}` : `WFO's list holds no row of ${page.name}${page.authorship ? ` ${page.authorship}` : ''}` };
    }
  }
  const spelt = wfoKey(row.name) !== wfoKey(page.name) ? { spelt: full(row) } : {};
  const said = detail ? { detail } : {};
  if (row.status === 'accepted') return { status: 'ok', ...base, by, wfo: row.id, kind: 'accepted', ...spelt, ...said };
  if (row.status === 'unchecked') return { status: 'ok', ...base, by, wfo: row.id, kind: 'unchecked', ...spelt, ...said };
  const acc = row.accepted ? idx.byId.get(row.accepted) : undefined;
  if (!acc) return { status: 'undecided', ...base, by, wfo: row.id, detail: `WFO's list holds the name as a synonym of ${row.accepted ?? 'a name it does not give'}, whose row was not read` };
  return { status: 'ok', ...base, by, wfo: row.id, kind: 'synonym', of: full(acc), ofId: acc.id, ...spelt, ...said };
}

const hasCmd = (c: string) => { try { return spawnSync(c, ['--help'], { stdio: 'ignore' }).status !== null; } catch { return false; } };

/** The newest release in `dir`: the zip as Zenodo gives it (renamed), or its classification.csv taken out and renamed. */
export function wfoFileIn(dir: string): { path: string; file: string; release: string; zip: boolean } | null {
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).flatMap((f) => { const z = WFO_FILE.exec(f), p = WFO_PLAIN.exec(f); return z ? [{ file: f, release: z[1], zip: true }] : p ? [{ file: f, release: p[1], zip: false }] : []; }).sort((a, b) => b.release.localeCompare(a.release));
  return found.length ? { path: `${dir}/${found[0].file}`, ...found[0] } : null;
}

/**
 * classification.csv, line by line: out of the zip with unzip (Linux) or bsdtar (Windows 10+, macOS), as the GBIF download
 * is read. Throws `BulkFileError` where the extractor cannot be started or ends with an exit code other than 0 (a broken
 * or partial download, a zip without classification.csv): what it gave before failing is not a reading of the file.
 */
async function eachRow(f: { path: string; zip: boolean }, each: (line: string) => void): Promise<void> {
  let input: NodeJS.ReadableStream, exit: Promise<string | null> = Promise.resolve(null);
  if (f.zip) {
    const [cmd, args] = process.platform === 'win32' || !hasCmd('unzip') ? ['tar', ['-xOf', f.path, 'classification.csv']] : ['unzip', ['-p', f.path, 'classification.csv']];
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.setEncoding('utf8');
    input = child.stdout;
    exit = new Promise((res) => {
      child.on('error', (e) => res(`${cmd} could not be started (${e.message})`));
      child.on('close', (code, signal) => res(code === 0 ? null : `${cmd} ${args.join(' ')} ended with ${code === null ? `signal ${signal}` : `exit code ${code}`}`));
    });
  } else input = createReadStream(f.path, { encoding: 'utf8' });
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) if (line) each(line);
  const failed = await exit;
  if (failed) throw new BulkFileError(`WFO's ${f.path.replace(/^.*\//, '')} could not be read: ${failed}`);
}

/**
 * WFO's list from `dir`, keeping the rows of the pages' IPNI ids, names (`ipnis`, `names` as `wfoKey` spells them) and
 * Kew ids (`kews`, matched against `localID`), and the accepted rows those synonyms name. Null when no release is there
 * (the pages say "not asked"). Throws `BulkFileError` where the file is there and not read whole: the extractor failed,
 * the header lacks a column read, or the rows are none, or (with `whole`, as the build reads the publisher's file) not
 * the number the release is known to hold.
 */
export async function loadWfo(dir: string, ipnis: ReadonlySet<string>, names: ReadonlySet<string>, kews: ReadonlySet<string> = new Set(), opts: { whole?: boolean } = {}): Promise<WfoIndex | null> {
  const f = wfoFileIn(dir);
  if (!f) return null;
  const idx = new WfoIndex(f.file, f.release);
  let h: Record<string, number> | null = null;
  const wantAccepted = new Set<string>();
  await eachRow(f, (line) => {
    if (!h) { h = wfoHeader(line); return; }
    idx.rows++;
    const c = line.split('\t');
    const sid = unquote(c[h.scientificNameID]);
    if (!(sid.startsWith(IPNI_LSID) && ipnis.has(sid.slice(IPNI_LSID.length))) && !names.has(wfoKey(unquote(c[h.scientificName]))) && !kews.has(kewIdOf(unquote(c[h.localID])) ?? '')) return;
    const r = wfoRow(h, line);
    if (!r) return;
    idx.add(r);
    if (r.accepted) wantAccepted.add(r.accepted);
  });
  if (!h) throw new BulkFileError(`WFO's ${f.file} holds no header line`);
  if (!idx.rows) throw new BulkFileError(`WFO's ${f.file} holds no rows`);
  const known = WFO_RELEASES[f.release]?.rows;
  if (opts.whole && known && idx.rows !== known) throw new BulkFileError(`WFO's ${f.file} gave ${idx.rows.toLocaleString('en-GB')} rows, not the ${known.toLocaleString('en-GB')} of release ${f.release}`);
  for (const id of idx.byId.keys()) wantAccepted.delete(id);
  if (wantAccepted.size) {
    let h2: Record<string, number> | null = null;
    await eachRow(f, (line) => {
      if (!h2) { h2 = wfoHeader(line); return; }
      const id = unquote(line.slice(0, line.indexOf('\t')));
      if (!wantAccepted.has(id)) return;
      const r = wfoRow(h2, line);
      if (r) idx.byId.set(r.id, r);
    });
  }
  return idx;
}
