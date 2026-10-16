/**
 * Where a page's range comes from, as a field the page reads (round seventy-two, B; FIX-BRIEF's shared shape
 * `distribution.via`), and the words the build, the fill and the page say of it. Pure: the page imports it.
 *
 *   - own:         Kew's entry of the page's own name and author (an Unplaced row's own range is `own` with `unplaced`).
 *   - kew-entry:   Kew's entry of the page's words by another author than the page cites (Ixora coccinea "Comm. ex Lam."
 *                  before the page cited Kew's L.; Diospyros kaki L.f., Kew's Thunb.).
 *   - synonym-of:  the page's own row, filed by Kew under the entry of another name (Ceropegia melanops under C. nigra).
 *   - older-name:  Kew holds no row of the page's name; the one entry its older names lead to.
 *   - spelling:    Kew's entry of the words spelt otherwise, by the same author (Cyphostemma congoense for congoensis;
 *                  Reicheocactus famatinensis for famatimensis).
 * Before round seventy-two the page read the range source's sentence, and only an older name was shown beside the map:
 * the 476 synonym ranges said so only in the folded record (self-review 72, B3).
 */
import { authorKey } from './authors';
import type { Reference } from './reference';

export type RangeKind = 'own' | 'older-name' | 'synonym-of' | 'kew-entry' | 'spelling';

export interface RangeVia {
  kind: RangeKind;
  /** Kew's name and author of the entry whose range is shown: "Ceropegia nigra N.E.Br.". */
  entry: string;
  /** The reference key, when that entry is another page's. */
  page?: string;
  /** The entry's words, without author: "Ceropegia nigra". */
  name?: string;
  /** synonym-of: the page's own row ("Ceropegia melanops H.Huber"); older-name: the older name that reached the entry. */
  row?: string;
  /** synonym-of: that row's status in Kew's file, lower case ("synonym", "illegitimate", "invalid"). */
  status?: string;
  /** own: Kew holds the name as Unplaced, and the range is the one Kew gives that name. */
  unplaced?: boolean;
  /** The day of Kew's files the range was read from (YYYY-MM-DD): absent for GBIF's copy. */
  file?: string;
}

/** "WCVP (Govaerts, RBG Kew)", with the day of Kew's files when read from them: never "via GBIF" for a file read (B1). */
export const wcvpBase = (file?: string) => `WCVP (Govaerts, RBG Kew)${file ? `, Kew's files of ${file}` : ''}`;

/** The synonym row's words: "Kew holds X as a synonym of Y; the range is Y's" (round seventy-one's words, unchanged). */
export const synonymWords = (v: RangeVia) => `Kew holds ${v.row} ${!v.status || /^synonym$/i.test(v.status) ? 'as a synonym of' : `(${v.status.toLowerCase()}) under`} ${v.entry}; the range is ${v.name ?? v.entry}'s`;

/** The range source a page states, from its `via`. */
export function viaSource(v: RangeVia): string {
  const base = wcvpBase(v.file);
  switch (v.kind) {
    case 'older-name': return `${base}: Kew's entry ${v.entry}, reached by ${v.row}`;
    case 'synonym-of': return `${base}: ${synonymWords(v)}`;
    case 'kew-entry': return `${base}: Kew's entry ${v.entry}`;
    case 'spelling': return `${base}: Kew's entry ${v.entry}, the name as Kew spells it`;
    default: return v.unplaced ? `${base}: Kew holds ${v.entry} as unplaced` : v.file ? base : `${base} via GBIF`;
  }
}

/** The `wcvp.distribution` record's words for a `via`, or undefined where the source says all there is. */
export function viaDetail(v: RangeVia, cited?: string): string | undefined {
  switch (v.kind) {
    case 'synonym-of': return synonymWords(v);
    case 'kew-entry': return `the range is Kew's entry ${v.entry}${cited?.trim() ? `; the name is cited ${cited.trim()}` : ''}`;
    case 'spelling': return `the range is Kew's entry ${v.entry}, the name as Kew spells it, by the same author`;
    case 'own': return v.unplaced ? `Kew holds ${v.entry} as unplaced (not placed under an accepted species); the range is the one Kew gives that name` : undefined;
    default: return undefined;
  }
}

/**
 * B2 after A1: a range of Kew's entry by another author is said only while the name the page cites is not that entry.
 * Where the page now cites Kew's citation (A's `name.cited`), the entry is the page's own name, and `via` is `own`.
 */
export function settleVia(v: RangeVia, scientific: string, authorship?: string): RangeVia {
  if (v.kind !== 'kew-entry') return v;
  const words = scientific.trim().toLowerCase();
  if (!v.entry.toLowerCase().startsWith(`${words} `)) return v;
  const author = v.entry.slice(words.length).trim();
  return authorKey(author) && authorKey(author) === authorKey(authorship) ? { kind: 'own', entry: v.entry, ...(v.name ? { name: v.name } : {}), ...(v.page ? { page: v.page } : {}), ...(v.file ? { file: v.file } : {}) } : v;
}

/** The reference key of the entry, when the entry is another page of the reference (Ceropegia nigra for C. melanops). */
export function withPage(v: RangeVia, key: number, reference?: Pick<Reference, 'keyOf'> | null): RangeVia {
  if (!reference || !v.name || v.kind === 'own' || v.kind === 'kew-entry') return v;
  const k = reference.keyOf(v.name);
  return k != null && k !== key ? { ...v, page: String(k) } : v;
}

/**
 * Applies `settleVia` to a dossier about to be written (the build, after A's citation is decided; the fill): the field,
 * the range source and the record's clause move together.
 */
export function settleRange(d: { name: { scientific: string; authorship?: string }; distribution: { via?: RangeVia; source: string }; upstream?: Record<string, { status: string; at: string; detail?: string; asOf?: string }> }): boolean {
  const v = d.distribution.via;
  if (!v) return false;
  const s = settleVia(v, d.name.scientific, d.name.authorship);
  if (s === v) return false;
  d.distribution.via = s;
  d.distribution.source = viaSource(s);
  const row = d.upstream?.['wcvp.distribution'];
  if (row?.detail) {
    const rest = row.detail.split('; ').filter((x) => !/^the range is Kew's entry |^the name is cited /.test(x)).join('; ');
    if (rest) row.detail = rest;
    else delete row.detail;
  }
  return true;
}

/**
 * The climate's reason as it should read (B4): the envelope reads only the in-range records placed to within 10 km, and a
 * dossier built before round seventy-two said "only 1 distinct land cell ... holds an in-range record" of Pachypodium
 * succulentum's 468 records, 467 of them placed worse (912 pages). Read by the species page and the plant page.
 */
export function climateReason(detail: string | undefined): string | undefined {
  if (!detail || !/^only \d+ distinct land cells? of the climate grid holds? an in-range record(?! placed)/.test(detail)) return detail;
  return detail.replace(/an in-range record(?! placed)/, 'an in-range record placed to within 10 km');
}

/**
 * The evidence line when no georeferenced record lies inside the stated range (B10): one stray record is not "the range
 * and the records disagree" (31 pages); two or more all outside it are.
 */
export function outsideOnly(outside: number | null | undefined): { tone: 'warn' | 'muted'; text: string } {
  if (!outside) return { tone: 'muted', text: 'No georeferenced records inside the stated native range.' };
  if (outside === 1) return { tone: 'muted', text: 'No georeferenced record lies inside the stated native range: the one georeferenced record read lies outside it, and is not used, so no map marker or climate is derived from it.' };
  return { tone: 'warn', text: `No georeferenced record lies inside the stated native range, and all ${outside} georeferenced records read lie outside it: the range and the records disagree. They are not used, and no map marker or climate is derived from them.` };
}

/** The builder's log clause for the same (B10): said for any page whose every record lies outside, one or more. */
export const outsideLog = (outside: number) => (outside === 1 ? ' — the one record lies outside the range' : ` — range disagrees with records: all ${outside} outside it`);

/**
 * The record of a homonym key `kewName` read and left as it is (round seventy-two, B9, D4): `--list-rebuild` lists a key
 * whose record lacks it, once, and never again after the build that reads it.
 */
export const HOMONYM_CHECKED = /homonym key checked:/;
export const homonymChecked = (label: string) => `homonym key checked: GBIF holds no one usage of ${label} under another key, so the key is left as it is`;
