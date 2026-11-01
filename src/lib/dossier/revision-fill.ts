/**
 * `--fill summary-revisions` (round eighty-five, the owner's decision 8): every stored Wikipedia summary read again, by
 * the title it was quoted from, so its record holds the article's revision (`summary.revision`) and the day it was read
 * (`summary.read`), and the page can link the very text it quotes.
 *
 *   - The article answers under the same title with the same lead: the revision and the day are recorded, the text kept.
 *   - It answers with another lead: the text is replaced by the lead read now (the same cut, `sentenceCut`), with its
 *     revision, and the record says the summary was refreshed.
 *   - It answers under another title (moved), or with no article: the summary is left for `--fill summaries`, which reads
 *     the title's proof again, and the line says so; nothing is guessed here.
 *   - It does not answer: left as it was, unstamped, for the next run (rule 2).
 *
 * A summary with a revision is passed by, so a run that stops resumes; `again` reads every one. Pure but for the fetcher.
 */
import type { JsonFetcher } from './fetch';
import { summary as wikiSummary } from './sources/wikipedia';

type Sum = { text: string; url: string; title: string; cut?: true; revision?: number; read?: string };
export type RevisionPage = { key?: unknown; name: { scientific: string }; summary?: Sum; upstream?: Record<string, { status: string; at: string; detail?: string } | undefined> };
export interface RevisionCounts { read: number; same: number; refreshed: number; left: number; unanswered: number; lines: string[] }

/** Whether a page's summary is still to be read: it has one, and no revision recorded (or `again`). */
export const revisionWanted = (d: RevisionPage, again = false) => !!d.summary?.title && (again || !d.summary.revision);

/** Reads one page's summary again, in place. True when the page changed. */
export async function readRevision(f: JsonFetcher, d: RevisionPage, day: string, c: RevisionCounts): Promise<boolean> {
  const s = d.summary;
  if (!s?.title) return false;
  // Asked by its own title, accepted only under it (a move is `--fill summaries`' to prove).
  const r = await wikiSummary(f, s.title, [s.title]);
  if (r.status === 'error' || r.status === 'refused' || r.status === 'skipped' || r.status === 'ambiguous') { c.unanswered++; return false; }
  c.read++;
  if (r.status !== 'ok' || r.data.title !== s.title || !r.data.revision) {
    c.left++;
    c.lines.push(`${d.name.scientific} [${String(d.key)}]: Wikipedia ${r.status !== 'ok' ? 'holds no lead under' : r.data.title !== s.title ? `moves ${s.title} to ${r.data.title}` : 'gives no revision for'} ${s.title}: left for --fill summaries`);
    return false;
  }
  const text = r.data.text, cut = r.data.cut;
  if (text === s.text && !!cut === !!s.cut) {
    if (s.revision === r.data.revision && s.read === day) return false;
    d.summary = { ...s, revision: r.data.revision, read: day };
    c.same++;
    return true;
  }
  const { cut: _cut, ...rest } = s;
  d.summary = { ...rest, text, ...(cut ? { cut: true as const } : {}), url: r.data.url || s.url, revision: r.data.revision, read: day };
  const row = d.upstream?.wikipedia;
  if (d.upstream && row) d.upstream.wikipedia = { ...row, at: new Date(`${day}T00:00:00Z`).toISOString(), detail: [row.detail?.replace(/; the lead read again at revision \d+ of \d{4}-\d{2}-\d{2}, it had changed/g, ''), `the lead read again at revision ${r.data.revision} of ${day}, it had changed`].filter(Boolean).join('; ') };
  c.refreshed++;
  c.lines.push(`${d.name.scientific} [${String(d.key)}]: the lead of ${s.title} changed: refreshed at revision ${r.data.revision}`);
  return true;
}
