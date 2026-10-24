/**
 * The corpus's dossiers under the ids the rule gives (round seventy-eight; ./page-ids.ts): each dossier whose id is not
 * the one it is stored under is written under its id and the old file removed, and every other page's reference to a
 * page by id moves with it (`distribution.via.page`, `photos[].shared`). Run by `--index` (every build ends with it), so
 * ids follow the rule, and a second run changes nothing.
 *
 * `--rekey` (this round's corpus step) reads a version 2 corpus (`s/v2/<GBIF key>.json`, `key` GBIF's) and writes it as
 * version 3 (`s/v3/<id>.json`) by the same rule, its references to other pages (GBIF keys before) read as those pages'
 * GBIF keys. Nothing else in a dossier changes: what the page shows is the same, and so is the day its substance last
 * changed (`changed.on`); its fingerprint is taken again, since the id is part of it.
 */
import { byId, gbifPage, isPageId, type PageId } from '../core/page-id';
import { pageIds, idWords, sharedKewEntries, type IdAnswer } from './page-ids';
import { substanceHash } from './changed';
import { DOSSIER_V } from './schema';

/** The dossiers of one directory, as the rekey reads and writes them. `files` are names like `k123.json`, `g456.json` (or `456.json` in a version 2 corpus). */
export interface RekeyStore {
  files(): string[];
  read(file: string): unknown;
  write(file: string, d: unknown): void;
  remove(file: string): void;
}

/** A dossier file of a version 3 corpus: its id and `.json`. */
export const DOSSIER_FILE = /^[kg][1-9][0-9]{0,9}\.json$/;
/** A dossier file of a version 2 corpus: GBIF's key and `.json`. */
export const V2_FILE = /^[1-9][0-9]{0,9}\.json$/;

type Slim = { file: string; gbif?: number; entry?: string; heldBy?: string; name: string; refs: boolean; key: unknown };
type Doc = {
  v?: number;
  key?: unknown;
  ids?: { gbif?: number };
  name?: { scientific?: string; kew?: { entry?: string; heldBy?: string } };
  distribution?: { via?: { page?: string } };
  photos?: Array<{ shared?: unknown[] }>;
  changed?: { on: string; h: string };
};

export interface RekeyReport {
  /** Pages read. */
  pages: number;
  /** Dossiers written under a new id (or, migrating, every one). */
  renamed: number;
  /** Other dossiers rewritten only because a page they name moved. */
  followed: number;
  /** Pages keyed by Kew's id, and by GBIF's with the reason, as `ids-gbif.txt` lists them. */
  kew: number;
  gbif: Array<{ id: PageId; name: string; why: string }>;
  /** Pages with no id the rule can give, left where they are (never today). */
  refused: Array<{ file: string; name: string; why: string }>;
  /** The Kew entries two pages or more hold after the rekey (`sharedKewEntries`, round eighty-two): none before an upload. */
  shared?: ReturnType<typeof sharedKewEntries>;
  /** Files that could not be read: the rekey then changes nothing, since an id given without them could be given twice. */
  unreadable: string[];
  /** Files that hold a GBIF key an earlier file holds too (a run stopped between writing a page and removing its old file): nothing is changed either. */
  twice: string[];
}

/**
 * Rekeys `to` (from itself, or, migrating, from `from`). `merges` are the owner's merges by GBIF key; `hash` is the
 * fingerprint's hash (the build passes node's sha1 as it does for the stamp).
 */
export function rekey(o: { to: RekeyStore; from?: RekeyStore; merges?: ReadonlyArray<{ from: number; into: number }>; hash?: (s: string) => string }): RekeyReport {
  const src = o.from ?? o.to;
  const migrating = !!o.from;
  const pattern = migrating ? V2_FILE : DOSSIER_FILE;
  const unreadable: string[] = [];
  const slim: Slim[] = [];
  for (const file of src.files()) {
    if (!pattern.test(file)) continue;
    let d: Doc;
    try { d = src.read(file) as Doc; } catch { unreadable.push(file); continue; }
    if (!d || typeof d !== 'object') { unreadable.push(file); continue; }
    const gbif = typeof d.ids?.gbif === 'number' ? d.ids.gbif : migrating && typeof d.key === 'number' ? d.key : undefined;
    const refs = !!d.distribution?.via?.page || !!d.photos?.some((p) => Array.isArray(p.shared) && p.shared.length);
    slim.push({ file, gbif, entry: d.name?.kew ? (d.name.kew.entry ?? '') : undefined, ...(d.name?.kew?.heldBy ? { heldBy: d.name.kew.heldBy } : {}), name: d.name?.scientific ?? '', refs, key: d.key });
  }
  // Two files of one GBIF key (a run stopped between writing a page and removing its old file) are one page twice: said,
  // and nothing is changed until one goes, since both would take one id.
  const seen = new Map<number, string>();
  const twice: string[] = [];
  for (const p of slim) {
    if (p.gbif == null) continue;
    const other = seen.get(p.gbif);
    if (other) twice.push(`${p.file} (GBIF key ${p.gbif}, which ${other} holds too)`);
    else seen.set(p.gbif, p.file);
  }
  // A file a run left unreadable stops the rekey: an id given without it could be given twice.
  if (unreadable.length || twice.length) return { pages: slim.length, renamed: 0, followed: 0, kew: 0, gbif: [], refused: [], unreadable, twice };
  const answers: IdAnswer[] = pageIds(slim, o.merges ?? []);
  const byGbif = new Map<number, PageId>();
  const byOld = new Map<string, PageId>();
  slim.forEach((p, i) => {
    const id = answers[i].id;
    if (!id) return;
    if (p.gbif != null) byGbif.set(p.gbif, id);
    if (isPageId(p.key)) byOld.set(p.key, id);
  });
  // A reference to another page: its old id (version 3), or its GBIF key (version 2's number, or a build's `via.page`).
  const moved = (x: unknown): unknown => {
    if (isPageId(x)) return byOld.get(x) ?? x;
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^[1-9][0-9]*$/.test(x) ? Number(x) : null;
    return n == null ? x : (byGbif.get(n) ?? gbifPage(n));
  };
  // One Kew entry, one page (round eighty-two): the entries two pages hold under their new ids, for the index to say.
  const shared = sharedKewEntries(slim.flatMap((p, i) => (answers[i].id ? [{ id: answers[i].id!, entry: p.entry, name: p.name }] : [])));
  const report: RekeyReport = { pages: slim.length, renamed: 0, followed: 0, kew: 0, gbif: [], refused: [], unreadable, twice, shared };
  // In place, every change is read before any is written, so a page that takes the file another page leaves never writes
  // over it before it is read; the old files no page now takes are removed last. Migrating, the two directories differ.
  const out: Array<{ file: string; old: string; d: Doc }> = [];
  slim.forEach((p, i) => {
    const a = answers[i];
    if (!a.id) { report.refused.push({ file: p.file, name: p.name, why: 'no Kew entry of its own and no GBIF key' }); return; }
    if (a.why === 'kew') report.kew++;
    else report.gbif.push({ id: a.id, name: p.name, why: idWords(a, p.entry) });
    const file = `${a.id}.json`;
    if (!migrating && file === p.file && p.key === a.id && !p.refs) return;
    const d = src.read(p.file) as Doc;
    const was = JSON.stringify(d);
    // The stamp stays current where it was: a new id is not a change of what the page shows.
    const current = !!d.changed && d.changed.h === substanceHash(d, o.hash);
    if (migrating) d.v = DOSSIER_V;
    d.key = a.id;
    const via = d.distribution?.via;
    if (via?.page) via.page = String(moved(via.page));
    // In the index's order (`byId`, as `sharedPhotos` writes it; round seventy-nine): a list kept in GBIF's order would be
    // sorted again by the next --index, a rewrite of a page whose content did not change.
    for (const ph of d.photos ?? []) if (Array.isArray(ph.shared)) { const m = ph.shared.map(moved); ph.shared = m.every(isPageId) ? (m as PageId[]).sort(byId) : m; }
    if (current) d.changed = { on: d.changed!.on, h: substanceHash(d, o.hash) };
    if (!migrating && file === p.file && JSON.stringify(d) === was) return;
    if (migrating) { o.to.write(file, d); report.renamed++; return; }
    out.push({ file, old: p.file, d });
  });
  const taken = new Set(out.map((x) => x.file));
  for (const x of out) {
    o.to.write(x.file, x.d);
    if (x.file !== x.old) report.renamed++;
    else report.followed++;
  }
  for (const x of out) if (x.file !== x.old && !taken.has(x.old)) o.to.remove(x.old);
  return report;
}

/** `ids-gbif.txt`: every page keyed by GBIF's key, with why, one a line (`<id>\t<name>\t<why>`). */
export const idsGbifLines = (r: RekeyReport) => r.gbif.map((x) => `${x.id}\t${x.name}\t${x.why}`).sort();
