/**
 * `--fill gbif-media-day --bulk <dir> [--dry-run]` (round eighty-six; review D's D5): GBIF's photographs read from a
 * download's files carry that download's day. The offline walk of round eighty-five wrote the `gbif.media` row with the
 * walk's own time and no word of the files ("read from GBIF on 2026-11-01" on credits read from the download of
 * 2026-10-21; 4,432 of 4,869 GBIF photographs in review D's sample have no day of their own, so the row's is said).
 *
 * A row is the files' when the page was last derived offline (its backbone row says "offline re-derivation") and the row
 * was written by that derivation (the same minute), or when `--fill gbif` wrote it ("from the GBIF download"); and only
 * when the files' day is not after the row was written (the download read then is the one named). Such a row keeps its
 * status and photographs, and gains `asOf`, the day GBIF made the download, and the words that say which download, so the
 * record and the credits say that day. Rows written by a build that asked GBIF's API, and rows that already say a day,
 * are left as they are. Pure: the step reads and writes the dossiers.
 */
import { mediaFileWords } from './sources/gbif';

type Row = { status: string; at: string; detail?: string; asOf?: string };
export type MediaDayPage = { key?: unknown; name: { scientific: string }; photos?: Array<{ src?: string; read?: string }>; upstream: Record<string, Row | undefined> };
export interface MediaDayCounts { read: number; changed: number; photographs: number; left: number; lines: string[] }

/** Whether the page's `gbif.media` row was written from the download's files, by the rule above. */
export function fromFiles(d: MediaDayPage): boolean {
  const m = d.upstream['gbif.media'], s = d.upstream['gbif.species'];
  if (!m || (m.status !== 'ok' && m.status !== 'none') || m.asOf) return false;
  if ((m.detail ?? '').startsWith('from the GBIF download')) return true;
  if (m.detail) return false;
  return !!s && /offline re-derivation/.test(s.detail ?? '') && s.at.slice(0, 16) === m.at.slice(0, 16);
}

/** One page: true when it changed (or, `dry`, would). */
export function mediaDay(d: MediaDayPage, from: { doi?: string; day: string }, c: MediaDayCounts, dry = false): boolean {
  c.read++;
  if (!fromFiles(d)) return false;
  const m = d.upstream['gbif.media']!;
  if (from.day > m.at.slice(0, 10)) { c.left++; c.lines.push(`${d.name.scientific} [${String(d.key)}]: left: its GBIF photographs were read on ${m.at.slice(0, 10)}, before the download of ${from.day} here`); return false; }
  const n = (d.photos ?? []).filter((p) => p.src === 'gbif' && !p.read).length;
  c.changed++;
  c.photographs += n;
  c.lines.push(`${d.name.scientific} [${String(d.key)}]: ${m.status === 'ok' ? `${n} GBIF photograph${n === 1 ? '' : 's'}` : 'no GBIF photograph'} ${dry ? 'would be' : ''}${dry ? ' ' : ''}said as of ${from.day}, not ${m.at.slice(0, 10)}`);
  if (dry) return true;
  const words = mediaFileWords(from.doi, from.day);
  d.upstream['gbif.media'] = { ...m, asOf: from.day, detail: m.detail ? (m.detail.includes(`, of ${from.day}`) ? m.detail : `${m.detail.replace(/^from the GBIF download(?: \S+)?/, words)}`) : words };
  return true;
}
