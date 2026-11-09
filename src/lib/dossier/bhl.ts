/**
 * The page where a name was published, on the Biodiversity Heritage Library (round eighty-seven, stage 2; links agent):
 * asked of BHL's OpenURL resolver (https://www.biodiversitylibrary.org/openurl, which needs no key; its help page,
 * https://www.biodiversitylibrary.org/openurlhelp, read 2026-11-09, gives the parameters `title`, `volume`, `spage`, `date`
 * and `format=json`) with exactly the citation Kew's file gives the page's name (`elsewhere.published`, kew-published.ts).
 *
 *   - Asked only for a citation the resolver can be given whole: a title, a plain volume number and page number
 *     ("16: 181"), or a page alone (": 293", a book), and a year alone ("(1962)"). Any other form ("5(9): 6",
 *     ", sér. 3, 6: 405", "(1862 publ. 1863)") is not asked, and the page shows the citation as text.
 *   - Taken only when BHL answers one citation, whose address is one BHL page, whose page number is the citation's
 *     ("Page 181"), whose volume is the citation's (where it has one), whose date names the citation's year, and whose
 *     title is the one Kew abbreviates (`titleAgrees`, round eighty-seven's review of stage 2, S2: BHL answered "Bot.
 *     Mag." 16: 181 (1902) with the Tokyo Botanical Magazine, which Kew cites as "Bot. Mag. (Tokyo)"). Anything else,
 *     none or several, is `none`, with why: no page is ever guessed (rule 3).
 *   - The title rule: each word of Kew's abbreviation outside its parentheses ("Bot.", "Mag.") is the start of a word
 *     of BHL's title, in order ("The botanical magazine"; letters only, without accents or case); each word inside
 *     them ("(Tokyo)") is the start of a word of BHL's title, publisher's place or authors; and where Kew's file also
 *     cites the same abbreviation with words in parentheses ("Bot. Mag. (Tokyo)") and the citation does not, BHL's
 *     title, place or authors holding those words is that other journal: not taken.
 *   - The fill (`--fill bhl`) asks one citation at a time, at least `BHL_GAP_MS` apart, under a day's allowance of its own
 *     (`BHL_DAY_BUDGET`, counted as iNaturalist's day is, `day-budget.ts`), a citation answered being passed by, so a run
 *     that stops resumes. A request not answered writes nothing: the citation is asked again by the next run.
 */
import type { JsonFetcher } from './fetch';
import type { DossierStore } from './corpus-run';
import type { Elsewhere } from './schema';

type Published = NonNullable<Elsewhere['published']>;

/** BHL publishes no rate; the fill keeps to one request a second, and four thousand a UTC day. */
export const BHL_GAP_MS = 1000;
export const BHL_DAY_BUDGET = 4000;
/** BHL's resolver can take half a minute to answer (measured 2026-11-09: over 30 s for "Sp. Pl." 1: 482). */
export const BHL_TIMEOUT_MS = 90_000;

/** The citation as BHL's resolver is asked it, or why it is not asked. */
export function bhlAsk(p: { place: string; volPage?: string; year?: string }): { title: string; volume?: string; page: string; year: string } | { not: string } {
  const title = p.place.trim();
  const y = /^\((\d{4})\)$/.exec((p.year ?? '').trim());
  if (!title) return { not: 'no title' };
  if (!y) return { not: `the year is not one year alone (${(p.year ?? '').trim() || 'none given'})` };
  const vp = p.volPage ?? '';
  const m = /^ (\d{1,4}): (\d{1,5})$/.exec(vp) ?? /^(): (\d{1,5})$/.exec(vp);
  if (!m) return { not: `the volume and page are not a plain volume and page (“${vp.trim()}”)` };
  return { title, ...(m[1] ? { volume: m[1] } : {}), page: m[2], year: y[1] };
}

/** The resolver's address for a citation. */
export function bhlUrl(a: { title: string; volume?: string; page: string; year: string }): string {
  const q = new URLSearchParams({ genre: a.volume ? 'journal' : 'book', title: a.title, ...(a.volume ? { volume: a.volume } : {}), spage: a.page, date: a.year, format: 'json' });
  return `https://www.biodiversitylibrary.org/openurl?${q.toString()}`;
}

type BhlAnswer = { Status?: number | string; Message?: string; citations?: Array<{ Url?: string; Volume?: string; SPage?: string; Date?: string; Title?: string; PublisherPlace?: string; Authors?: string[] }> };

/** Words as the title rule compares them: lower case, no accents, letters and digits only. */
const wordsOf = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Kew's abbreviation in its two parts: the words outside parentheses, and those inside them. */
function abbreviation(title: string): { main: string[]; within: string[]; bare: string } {
  const within = [...title.matchAll(/\(([^)]*)\)/g)].flatMap((m) => wordsOf(m[1]));
  const bare = title.replace(/\s*\([^)]*\)/g, '').trim();
  return { main: wordsOf(bare), within, bare };
}
/** Each word of `abbr` the start of a word of `words`, in order. */
const inOrder = (abbr: string[], words: string[]) => { let i = 0; for (const w of words) if (i < abbr.length && w.startsWith(abbr[i])) i++; return i === abbr.length; };
const among = (abbr: string[], words: string[]) => abbr.every((a) => words.some((w) => w.startsWith(a)));

/**
 * Whether BHL's title is the journal or book Kew's abbreviation names (the rule above). `places`: every citation's place
 * in Kew's file the corpus holds, for the same abbreviation with words in parentheses. Returns why not, or null.
 */
export function titleAgrees(kew: string, bhl: { Title?: string; PublisherPlace?: string; Authors?: string[] }, places: Iterable<string> = []): string | null {
  const title = (bhl.Title ?? '').trim();
  if (!title) return "BHL's answer gives no title";
  const k = abbreviation(kew);
  const tw = wordsOf(title), more = [...tw, ...wordsOf(bhl.PublisherPlace ?? ''), ...(bhl.Authors ?? []).flatMap(wordsOf)];
  if (!inOrder(k.main, tw)) return `BHL's title “${title}” is not “${k.bare}” word for word`;
  if (k.within.length && !among(k.within, more)) return `BHL's title “${title}” is not the one Kew writes “${kew}”`;
  if (!k.within.length) {
    for (const p of places) {
      const o = abbreviation(p);
      if (o.bare === k.bare && o.within.length && among(o.within, more)) return `BHL's title “${title}”${bhl.PublisherPlace ? ` (${bhl.PublisherPlace})` : ''} is the one Kew cites as “${p}”, not “${kew}”`;
    }
  }
  return null;
}

/**
 * What an answer gives for the citation: one page, or why none is taken; null when it is not an answer (not answered).
 * `a.title` is Kew's abbreviation as asked; `places`, Kew's other citations' places (`titleAgrees`).
 */
export function bhlPage(a: { title?: string; volume?: string; page: string; year: string }, data: unknown, places: Iterable<string> = []): { page: number } | { none: string } | null {
  const r = data as BhlAnswer | null;
  if (!r || typeof r !== 'object' || String(r.Status) !== '1' || !Array.isArray(r.citations)) return null;
  const cs = r.citations;
  if (!cs.length) return { none: "BHL's resolver found no page for the citation" };
  if (cs.length > 1) return { none: `BHL's resolver gave ${cs.length} citations, not one` };
  const c = cs[0];
  const m = /^https:\/\/www\.biodiversitylibrary\.org\/page\/(\d+)$/.exec(c.Url ?? '');
  if (!m) return { none: "BHL's answer is not one page" };
  if ((c.SPage ?? '').trim() !== `Page ${a.page}`) return { none: `BHL's page is numbered “${(c.SPage ?? '').trim() || 'nothing'}”, not page ${a.page}` };
  if (a.volume && (c.Volume ?? '').trim() !== a.volume) return { none: `BHL's page is in volume “${(c.Volume ?? '').trim() || 'none'}”, not ${a.volume}` };
  if (!new RegExp(`(^|\\D)${a.year}(\\D|$)`).test(c.Date ?? '')) return { none: `BHL dates its volume “${(c.Date ?? '').trim() || 'not at all'}”, not ${a.year}` };
  if (a.title !== undefined) { const why = titleAgrees(a.title, c, places); if (why) return { none: why }; }
  return { page: Number(m[1]) };
}

export type BhlPage = { key: string; name: { scientific: string }; elsewhere?: Elsewhere };
export interface BhlCounts { pages: number; asked: number; linked: number; none: number; unanswered: number; notAskable: number; before: number; held?: string }

/** Whether the fill asks a page's citation: it has one BHL can be asked, and no answer for it yet (or `again`). */
export function bhlWanted(d: Pick<BhlPage, 'elsewhere'>, again = false): boolean {
  const p = d.elsewhere?.published;
  return !!p && !('not' in bhlAsk(p)) && (again || !p.bhl);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every citation the fill wants, one at a time, each page written as it is answered. */
export async function fillBhl(store: DossierStore, f: JsonFetcher, day: string, opts: { again?: boolean; gapMs?: number; progress?: (c: BhlCounts) => void } = {}): Promise<BhlCounts> {
  const c: BhlCounts = { pages: 0, asked: 0, linked: 0, none: 0, unanswered: 0, notAskable: 0, before: 0 };
  let last = 0, failedRun = 0;
  // Every citation's place first, for the title rule's other journals of one abbreviation ("Bot. Mag. (Tokyo)").
  const places = new Set<string>();
  for (const file of store.files()) { try { const p = store.read<BhlPage>(file).elsewhere?.published?.place; if (p) places.add(p.trim()); } catch { /* read again below */ } }
  for (const file of store.files()) {
    let d: BhlPage;
    try { d = store.read<BhlPage>(file); } catch { continue; }
    const p = d.elsewhere?.published;
    if (!p) continue;
    c.pages++;
    const a = bhlAsk(p);
    if ('not' in a) { c.notAskable++; continue; }
    if (p.bhl && !opts.again) { c.before++; continue; }
    const wait = last + (opts.gapMs ?? BHL_GAP_MS) - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await f<unknown>(bhlUrl(a), { timeoutMs: BHL_TIMEOUT_MS });
    last = Date.now();
    if (r.status === 'refused' && /allowance|not asked/.test(r.detail ?? '')) { c.held = r.detail; break; }
    c.asked++;
    const got = r.status === 'ok' ? bhlPage(a, r.data, places) : null;
    if (!got) { c.unanswered++; if (++failedRun >= 5) { c.held = '5 requests in a row not answered'; break; } continue; }
    failedRun = 0;
    if ('page' in got) c.linked++; else c.none++;
    d.elsewhere = { ...d.elsewhere, published: { ...p, bhl: { ...got, read: day } } };
    store.write(file, d);
    opts.progress?.(c);
  }
  return c;
}

/** The fill's last line (rule 6). */
export function bhlLine(c: BhlCounts, day: string): string {
  return `  ${c.asked} citations asked of BHL on ${day}: ${c.linked} linked to the one page BHL gives for them, ${c.none} with no page taken (said why), ${c.unanswered} not answered; ${c.before} answered before and passed by; ${c.notAskable} not in a form BHL can be asked exactly, shown as text${c.held ? `; stopped: ${c.held}: run --fill bhl again (tomorrow, if the day's allowance is spent); it asks only what is left` : ''}.`;
}
