/**
 * `--fill summary-leads` (round eighty-six; outside review B's 5, the plan's B7), and `--fill summary-revisions` (round
 * eighty-five, the owner's decision 8) before it: every stored Wikipedia summary read again by the title it was quoted
 * from, twenty titles a request (`readLeads`), as the article's opening paragraph in plain text with the revision it was
 * read at, and the day (`summary.revision`, `summary.read`, `summary.from: 'lead'`), so the page quotes the article's own
 * words and links the very revision they were read at.
 *
 * Round eighty-five read Wikipedia's REST summary, which leaves out words in brackets: of the 36 summaries its fill found
 * "changed", 33 differed from the text stored only by brackets the REST text left out (the stored text was the batch's,
 * read from the same lead as here). Now the lead is read here as the build reads it.
 *
 *   - The article answers under the same title: the text is the opening paragraph read now (the same cut, `sentenceCut`),
 *     with its revision; where it differs from the text stored, the record says the summary was read again, and why it
 *     differs is counted (`leadChange`: brackets, parentheticals, other).
 *   - It answers under another title (moved), or with no article: the summary is left for `--fill summaries`, which reads
 *     the title's proof again (the redirect and same-type rules), and the line says so; nothing is guessed here.
 *   - It does not answer: left as it was, for the next run (rule 2).
 *
 * A summary already read so (`from: 'lead'`) is passed by, so a run that stops resumes; `again` reads every one. `dry`
 * reads and counts and writes nothing. Pure but for the fetcher.
 */
import type { JsonFetcher } from './fetch';
import { readLeads, SUMMARY_MAX, articleUrl, LEAD_TITLES, type Lead } from './sources/wikipedia';
import { sentenceCut, upToSentence } from '../core/text';

type Sum = { text: string; url: string; title: string; cut?: true; revision?: number; read?: string; from?: 'lead' };
export type RevisionPage = { key?: unknown; name: { scientific: string }; summary?: Sum; upstream?: Record<string, { status: string; at: string; detail?: string } | undefined> };
/** Why a stored text differs from the opening paragraph read now. */
export type LeadChange = 'brackets' | 'parentheticals' | 'other';
export interface RevisionCounts {
  read: number;
  same: number;
  refreshed: number;
  left: number;
  unanswered: number;
  lines: string[];
  /** The refreshed (or, in a dry run, the would-be refreshed) by why they differ (round eighty-six). */
  why?: Record<LeadChange, number>;
}

/** Whether a page's summary is still to be read: it has one, not yet read as the article's opening paragraph (or `again`). */
export const revisionWanted = (d: RevisionPage, again = false) => !!d.summary?.title && (again || d.summary.from !== 'lead');

const spaced = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Round brackets and what is in them, taken out, inner first. */
const unbracketed = (s: string) => { let t = s, u = ''; while (t !== u) { u = t; t = t.replace(/\s*\([^()]*\)/g, ''); } return spaced(t); };
/** The words alone: every mark that sets words apart (brackets, commas, dashes, quotes) taken out. */
const wordsOnly = (s: string) => spaced(s.replace(/[()[\],;:–—"“”‘’]/g, ' '));

/**
 * Why a stored summary differs from the opening paragraph read now (round eighty-six): `brackets` when the two are the
 * same once every round bracket and its words are taken out of both (the REST summary's dropped "(formerly Schefflera
 * actinophylla)"); `parentheticals` when they hold the same words, set apart by other marks (an aside between commas
 * in one and between dashes or brackets in the other, a quote mark); `other` when the words themselves differ (the
 * article was edited, or the text was cut at another place). Null when the texts are the same.
 */
export function leadChange(before: string, after: string): LeadChange | null {
  if (before === after) return null;
  if (unbracketed(before) === unbracketed(after)) return 'brackets';
  if (wordsOnly(before) === wordsOnly(after)) return 'parentheticals';
  return 'other';
}

/** The first round bracket the new text has and the stored one lacks, for the line that says what changed. */
function firstBracket(before: string, after: string): string | undefined {
  const had = new Set([...before.matchAll(/\([^()]*\)/g)].map((m) => m[0]));
  return [...after.matchAll(/\([^()]*\)/g)].map((m) => m[0]).find((b) => !had.has(b));
}

/** One page read against its title's lead (`readLeadsAll`). True when the page changed (or, dry, would). */
function apply(d: RevisionPage, lead: Lead, day: string, c: RevisionCounts, dry: boolean): boolean {
  const s = d.summary!;
  c.read++;
  if (lead.status !== 'ok' || lead.title !== s.title || !lead.revision || !lead.text || lead.disambiguation) {
    c.left++;
    c.lines.push(`${d.name.scientific} [${String(d.key)}]: Wikipedia ${lead.status !== 'ok' || !lead.text || lead.disambiguation ? `holds no lead under ${s.title}` : lead.title !== s.title ? `moves ${s.title} to ${lead.title}` : `gives no revision for ${s.title}`}: left for --fill summaries`);
    return false;
  }
  const kept = sentenceCut(upToSentence(lead.text, SUMMARY_MAX));
  const cut = lead.text.trim().length > SUMMARY_MAX || kept.cut;
  const why = leadChange(s.text, kept.text);
  if (!why && !!cut === !!s.cut) {
    if (s.revision === lead.revision && s.read === day && s.from === 'lead') return false;
    if (!dry) d.summary = { ...s, revision: lead.revision, read: day, from: 'lead' };
    c.same++;
    return true;
  }
  const w = why ?? 'other';
  c.why ??= { brackets: 0, parentheticals: 0, other: 0 };
  c.why[w]++;
  c.refreshed++;
  const bracket = w === 'brackets' ? firstBracket(s.text, kept.text) : undefined;
  c.lines.push(`${d.name.scientific} [${String(d.key)}]: ${dry ? 'would read' : 'read'} the opening paragraph of ${s.title} at revision ${lead.revision}: ${w}${bracket ? ` (the article's "${bracket.length > 80 ? `${bracket.slice(0, 77)}…)` : bracket}")` : ''}`);
  if (dry) return true;
  const { cut: _cut, ...rest } = s;
  d.summary = { ...rest, text: kept.text, ...(cut ? { cut: true as const } : {}), url: articleUrl(lead.title), revision: lead.revision, read: day, from: 'lead' };
  const row = d.upstream?.wikipedia;
  const said = `the opening paragraph read again at revision ${lead.revision} of ${day}, it differed (${w})`;
  if (d.upstream && row) d.upstream.wikipedia = { ...row, at: new Date(`${day}T00:00:00Z`).toISOString(), detail: [row.detail?.replace(/; the (?:lead|opening paragraph) read again at revision \d+ of \d{4}-\d{2}-\d{2}, it (?:had changed|differed \([a-z]+\))/g, ''), said].filter(Boolean).join('; ') };
  return true;
}

/**
 * Reads many pages' summaries again, `LEAD_TITLES` titles a request, in place (unless `dry`). `done` is told of each page
 * read and whether it changed, so the caller writes it. A request that does not answer leaves its pages as they were.
 */
export async function readLeadsAll(f: JsonFetcher, pages: readonly RevisionPage[], day: string, c: RevisionCounts, done: (d: RevisionPage, changed: boolean) => void, opts: { dry?: boolean } = {}): Promise<void> {
  const todo = pages.filter((d) => !!d.summary?.title);
  for (let i = 0; i < todo.length; ) {
    // Twenty distinct titles a request: two pages quoting one article share its answer.
    const part: RevisionPage[] = [];
    const titles = new Set<string>();
    while (i < todo.length && (titles.size < LEAD_TITLES || titles.has(todo[i].summary!.title))) { titles.add(todo[i].summary!.title); part.push(todo[i++]); }
    const r = await readLeads(f, [...titles]);
    for (const d of part) {
      const lead = r.status === 'ok' ? r.data.get(d.summary!.title) : undefined;
      if (!lead) { c.unanswered++; done(d, false); continue; }
      done(d, apply(d, lead, day, c, !!opts.dry));
    }
  }
}

/** Reads one page's summary again, in place. True when the page changed. */
export async function readRevision(f: JsonFetcher, d: RevisionPage, day: string, c: RevisionCounts): Promise<boolean> {
  let changed = false;
  await readLeadsAll(f, [d], day, c, (_, x) => { changed = x; });
  return changed;
}

/**
 * The summaries `--fill summary-leads` leaves for `--fill summaries` (round eighty-seven): every summary not read as its
 * article's opening paragraph (`from` not `'lead'`), as the fill leaves those whose title moved or holds no lead, and
 * those not yet read. One "<id> <name>\t<why>" a line, as `--keys` reads it. Read from the dossiers alone: the fill's own
 * lines are in its log only.
 */
export function summariesLeft(pages: Iterable<RevisionPage & { key: unknown }>): string[] {
  const out: string[] = [];
  for (const d of pages) if (revisionWanted(d)) out.push(`${String(d.key)} ${d.name.scientific}\tsummary of ${d.summary!.title} not read as its opening paragraph${d.summary!.revision ? `, revision ${d.summary!.revision} recorded before` : ''}`);
  return out.sort();
}
