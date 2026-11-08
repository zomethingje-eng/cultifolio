/**
 * `--fill genus [--force]`: what one genus's record becomes, given the record on disk and Wikipedia's answer. Pure: the
 * step (`fillGenera` in scripts/build-dossiers.ts) reads and writes the files.
 *
 * Round eighty-six (final review S3): `--force` wrote every answer, so a request refused or not answered (a 429, the
 * network gone) wrote `status: 'refused'` over a genus's `ok` lead, and the genus page lost its quotation for a request
 * that said nothing about the article. Now an answer that is not Wikipedia's (`ok`, or `none`: no article, or a
 * disambiguation) leaves an earlier `ok` or `none` record as it is, and is counted, so the step's last line says how many
 * were not answered and how many kept their record; a genus with no settled record before is written `refused` as before,
 * which the step's next run asks again. Without `--force` a settled record is passed by unasked, as before.
 */
import type { SourceResult } from './fetch';
import type { GenusRecord } from './schema';

type Lead = { text: string; url: string; title: string; cut?: true; revision?: number; from: 'lead' };
/** What Wikipedia's answer does to one genus: `write` the record to write, if any; `keptOnFailure` when the earlier record stands. */
export type GenusStep = { outcome: 'ok' | 'none' | 'refused'; write?: GenusRecord; keptOnFailure?: boolean };

/** Whether a record on disk is settled (Wikipedia answered it: `ok` or `none`). A file that cannot be read is not. */
export function settledGenus(text: string | undefined): { status: 'ok' | 'none' } | undefined {
  if (text == null) return undefined;
  try {
    const prev = JSON.parse(text) as { status?: string };
    return prev.status === 'ok' || prev.status === 'none' ? { status: prev.status } : undefined;
  } catch {
    return undefined;
  }
}

/** Before asking: a settled record is passed by unless `--force`. */
export const genusPassedBy = (prev: string | undefined, force: boolean): boolean => !force && !!settledGenus(prev);

/** After asking: the record to write, or none when an earlier settled record stands over an answer that is not Wikipedia's. */
export function genusAnswer(g: string, slug: string, prev: string | undefined, r: SourceResult<Lead>, now: Date): GenusStep {
  const at = now.toISOString();
  if (r.status === 'ok') return { outcome: 'ok', write: { genus: g, slug, status: 'ok', summary: { text: r.data.text, source: 'wikipedia', url: r.data.url, licence: 'CC BY-SA 4.0', title: r.data.title, ...(r.data.cut ? { cut: true as const } : {}), ...(r.data.revision ? { revision: r.data.revision, read: at.slice(0, 10) } : {}), from: r.data.from }, at } };
  if (r.status === 'none') return { outcome: 'none', write: { genus: g, slug, status: 'none', at } };
  if (settledGenus(prev)) return { outcome: 'refused', keptOnFailure: true };
  return { outcome: 'refused', write: { genus: g, slug, status: 'refused', detail: `${r.status}: ${r.detail}`, at } };
}
