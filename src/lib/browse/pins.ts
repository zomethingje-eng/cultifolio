/**
 * Pinned views (round eighty-seven, C6): a grower pins a browse view, meaning its query, and the front page and the empty
 * search box show it, each pin with the species a reference update added to the view and took from it since it was
 * pinned or last seen ("+3 · −1 since 12 Nov").
 *
 * Kept in the collection's log, so a pin goes where the collection goes (sync, encrypted; a backup) and nowhere else, as
 * one record a pin of the kind every build already reads, `setting`, its id `pin-` and a hash of its query. No new kind:
 * a build before this one refuses a batch that holds a kind it does not know, whole (`changeError` in $core/log), so a pin
 * of a new kind written here would have stopped every older device's sync. A setting record's fields an older build does
 * not type pass its log as they are, it folds the record and shows nothing of it (it reads only the setting records it
 * knows by id: `numbering`, `numbers-kept…`) but for its backup page, whose merge preview counts any other setting record
 * as "the numbering scheme" (this build counts pins apart, as pinned views: $lib/backup/backup's `previewMerge`), and
 * the record keeps no field any build requires. tests/unit/
 * r87b-pins-log.test.ts holds this against round eighty-six's own log module.
 *
 * Validated on read (`pinOf`): a record whose fields are not a pin's (another version's shape, a damaged value) is not
 * shown and not counted, and is left in the log as it is. At most `PIN_MAX` are pinned here; past it a pin is refused
 * and said, and a log that holds more (two devices pinning at once) shows the latest `PIN_MAX`.
 *
 * The id is the hash of the view's query, so the same view pinned on two devices is the same record, not two pins, and a
 * view unpinned and pinned again is the record brought back.
 *
 * What changed since: a pin keeps the view's species as they were when it was made or last seen (`keys`, their page ids
 * written short: `encodeKeys`), and the page asks the reference for the view's species now (/browse/data?part=keys, the
 * view's query alone) and compares the two in the browser. A view of more than `PIN_FOLLOW_MAX` species keeps none, and
 * says it is too wide to follow, rather than a count it did not make.
 */
import type { Record_ } from '$core/log';
import { localDate } from '$core/dates';

/** A pin's record id begins so (kind `setting`). */
export const PIN_PREFIX = 'pin-';
/** How many pins a collection keeps: about fifty, as the plan says (C6). */
export const PIN_MAX = 50;
/** Past this many species a pin keeps no list of them, and says so: its record would be tens of kilobytes. */
export const PIN_FOLLOW_MAX = 3000;
/** The longest record of a pin's species a pin may hold (characters): PIN_FOLLOW_MAX species at most a few characters each. */
const KEYS_MAX = 40_000;

export interface Pin {
  id: string;
  /** The page pinned: /browse with its query, or a region's, a genus's or a family's page. */
  href: string;
  /** The browse query the page is (`/browse` reads it: "?r=NAM&f=apocynaceae"), without the order, the view or the page. */
  view: string;
  /** What the view holds, in its title's words. */
  label: string;
  /** The day it was pinned, and the day its species were last seen (ISO). */
  made: string;
  seen: string;
  /** How many species the view held when last seen. */
  n: number;
  /** Those species' page ids, written short (`encodeKeys`); null where the view held more than PIN_FOLLOW_MAX. */
  keys: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A page a pin may open: one of the browse pages, with a query of plain words, codes and numbers. */
const HREF = /^\/(?:browse|region\/[a-z0-9-]{1,90}|genus\/[a-z0-9-]{1,90}|family\/[a-z0-9-]{1,90})(?:\?[a-z]+=[A-Za-z0-9,-]{1,400}(?:&[a-z]+=[A-Za-z0-9,-]{1,400}){0,12})?$/;
const VIEW = /^(?:\?[a-z]+=[A-Za-z0-9,-]{1,400}(?:&[a-z]+=[A-Za-z0-9,-]{1,400}){0,12})?$/;
const CODE = /^[0-9A-Za-z_-]*(?:~[0-9A-Za-z_-]*)?$/;

/** A setting record read as a pin, or null where it is not one this version can show (validated on read). */
export function pinOf(r: Pick<Record_, 'id' | 'kind' | '_deleted'> & Record<string, unknown>): Pin | null {
  if (r.kind !== 'setting' || r._deleted || typeof r.id !== 'string' || !r.id.startsWith(PIN_PREFIX)) return null;
  const { href, view, label, made, seen, n, keys } = r;
  if (typeof href !== 'string' || href.length > 900 || !HREF.test(href)) return null;
  if (typeof view !== 'string' || view.length > 900 || !VIEW.test(view)) return null;
  if (typeof label !== 'string' || !label.trim() || label.length > 200) return null;
  if (typeof made !== 'string' || !DAY.test(made) || typeof seen !== 'string' || !DAY.test(seen)) return null;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
  if (keys !== null && keys !== undefined && (typeof keys !== 'string' || keys.length > KEYS_MAX || !CODE.test(keys))) return null;
  return { id: r.id, href, view, label: label.trim(), made, seen, n, keys: typeof keys === 'string' ? keys : null };
}

/**
 * The pins of a collection's records, latest first, at most PIN_MAX, each view once (two records of one view, from an
 * id another version made, are one pin: the earlier made). Records that are not pins are left out.
 */
export function pinsOf(records: Iterable<Pick<Record_, 'id' | 'kind' | '_deleted'> & Record<string, unknown>>): Pin[] {
  const byView = new Map<string, Pin>();
  for (const r of records) {
    const p = pinOf(r);
    if (!p) continue;
    const had = byView.get(p.view);
    if (!had || p.made < had.made || (p.made === had.made && p.id < had.id)) byView.set(p.view, p);
  }
  return [...byView.values()].sort((a, b) => (a.made < b.made ? 1 : a.made > b.made ? -1 : a.id < b.id ? -1 : 1)).slice(0, PIN_MAX);
}

/** FNV-1a over a string, from a seed. */
function fnv(s: string, h: number): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
/** A view's pin id: `pin-` and sixteen hex digits of its query's hash, so one view is one record on every device. */
export const pinIdOf = (view: string): string => `${PIN_PREFIX}${fnv(view, 0x811c9dc5).toString(16).padStart(8, '0')}${fnv(view, 0x050c5d1f).toString(16).padStart(8, '0')}`;

/* ---------- the species of a view, written short ---------- */

const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const AT = new Map([...ALPHA].map((c, i) => [c, i]));
/** One number as base-32 digits, most significant first, each but the last marked by its high bit (an alphabet of 64). */
function varint(n: number): string {
  const d: number[] = [];
  do { d.unshift(n & 31); n = Math.floor(n / 32); } while (n > 0);
  return d.map((x, i) => ALPHA[i < d.length - 1 ? x | 32 : x]).join('');
}
const run = (nums: number[]) => { const s = [...new Set(nums)].sort((a, b) => a - b); let prev = 0, out = ''; for (const x of s) { out += varint(x - prev); prev = x; } return out; };
function unrun(s: string): number[] | null {
  const out: number[] = [];
  let v = 0, prev = 0;
  for (const c of s) {
    const x = AT.get(c);
    if (x === undefined) return null;
    v = v * 32 + (x & 31);
    if (!(x & 32)) { prev += v; out.push(prev); v = 0; }
  }
  return v === 0 ? out : null;
}
/**
 * Page ids (`k<Kew's plant_name_id>`, `g<GBIF key>`) written short: Kew's numbers in order, each as its distance from
 * the one before in base-32 digits, then "~" and GBIF's the same way. About two to three characters a species.
 */
export function encodeKeys(keys: Iterable<string>): string {
  const k: number[] = [], g: number[] = [];
  for (const x of keys) { const m = /^([kg])([1-9]\d{0,9})$/.exec(x); if (m) (m[1] === 'k' ? k : g).push(Number(m[2])); }
  const gs = run(g);
  return run(k) + (gs ? `~${gs}` : '');
}
/** The page ids written by `encodeKeys`, or null where the text is not one. */
export function decodeKeys(s: string): string[] | null {
  if (!CODE.test(s)) return null;
  const [a, b = ''] = s.split('~');
  const k = unrun(a), g = unrun(b);
  if (!k || !g) return null;
  return [...k.map((x) => `k${x}`), ...g.map((x) => `g${x}`)];
}

/** What a pin's view gained and lost: the species now that it did not hold, and those it held that it does not now. */
export function changesOf(then: readonly string[], now: readonly string[]): { added: string[]; removed: string[] } {
  const a = new Set(then), b = new Set(now);
  return { added: now.filter((x) => !a.has(x)), removed: then.filter((x) => !b.has(x)) };
}

/* ---------- words ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A pin's day, short: "12 Nov", with the year where it is not this one. */
export function dayWords(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${iso.slice(0, 4) === today.slice(0, 4) ? '' : ` ${y}`}`;
}
/** What changed in a pinned view, in the pin's words: "+3 · −1 since 12 Nov", "no change since 12 Nov". */
export function sinceWords(c: { added: number; removed: number }, since: string, today: string): string {
  const day = dayWords(since, today);
  if (!c.added && !c.removed) return `no change since ${day}`;
  return `+${c.added.toLocaleString('en-GB')} · −${c.removed.toLocaleString('en-GB')} since ${day}`;
}
/** The words of a pin too wide to follow. */
/** A pinned view whose region the reference no longer holds (the review of stage 2's pages, 6), by its TDWG code. */
export const goneWords = (codes: readonly string[]): string => `${codes.length === 1 ? `its region ${codes[0]} is` : `its regions ${codes.slice(0, -1).join(', ')} and ${codes.at(-1)} are`} no longer in the reference, so the rest of the view is shown and not followed for changes`;
export const TOO_WIDE = `more than ${PIN_FOLLOW_MAX.toLocaleString('en-GB')} species: too many to follow for changes`;
/** The one line the front page and the search box say where nothing is pinned yet (C9: an explainer, not example cards). */
export const PIN_EXPLAINER = 'Pin a browse view to keep it here. Each pin then counts the species a reference update adds to it or takes from it.';
/** Today as an ISO day on the grower's own calendar (`localDate`, round eighty-four's rule for a day of the device's): a pin's day is theirs. */
export const todayIso = (): string => localDate();
