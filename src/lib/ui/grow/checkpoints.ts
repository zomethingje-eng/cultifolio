/**
 * A batch's checkpoints and losses, read from its log (round eighty-seven, F5). The batch already records each count as a
 * `germinate` line (the total up or struck so far, whichever way the grower typed it), each loss as a `loss` line with a
 * count and a cause, and each potting as a `potup` line: this reads them as a table and writes nothing.
 *
 * A checkpoint is a count line with what was alive in the pot that day: the count, less what had been potted up and lost
 * on or before it, as the batch page's "in the pot" reading is. Losses are grouped by their cause as the grower wrote it,
 * case and spacing aside; a loss with no cause is said as not stated, never as none.
 */
import type { PlantEvent } from '$lib/db/types';

/** The causes the loss form offers as the grower types; any words are kept as typed. */
export const LOSS_CAUSES = ['damping-off', 'rot', 'dried out', 'mould', 'eaten', 'pests', 'etiolated', 'unknown'] as const;

export interface Checkpoint { id: string; d: string; up: number; potted: number; lost: number; alive: number; pct: number | null }

const nOf = (e: PlantEvent) => (typeof e.n === 'number' && Number.isFinite(e.n) && e.n >= 0 ? Math.floor(e.n) : 0);

/** Each count line, oldest first, with what had been potted and lost by its day and what was alive in the pot then. `count` is what went in, for the share. */
export function checkpointsOf(events: PlantEvent[], count: number | null | undefined): Checkpoint[] {
  const out: Checkpoint[] = [];
  const counts = events.filter((e) => e.t === 'germinate' && typeof e.d === 'string').sort((a, b) => a.d.localeCompare(b.d) || a.id.localeCompare(b.id));
  for (const c of counts) {
    const by = events.filter((e) => typeof e.d === 'string' && e.d <= c.d);
    const potted = by.filter((e) => e.t === 'potup').reduce((n, e) => n + nOf(e), 0);
    const lost = by.filter((e) => e.t === 'loss').reduce((n, e) => n + nOf(e), 0);
    // The total up by then is the highest count on or before the day: the count is cumulative, and a later lower one is a slip the page already refuses.
    const up = Math.max(...by.filter((e) => e.t === 'germinate').map(nOf));
    out.push({ id: c.id, d: c.d, up, potted, lost, alive: Math.max(0, up - potted - lost), pct: count && count > 0 ? Math.round((up / count) * 100) : null });
  }
  return out;
}

export interface LossCause { cause: string | null; n: number; lines: number; last: string }
const fold = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The batch's losses grouped by cause, the most lost first; the words of a cause are its first line's. */
export function lossesByCause(events: PlantEvent[]): LossCause[] {
  const by = new Map<string, LossCause>();
  // Oldest first, whatever order the caller holds them in (a record's lines come newest first), so a cause's words are its first line's.
  const lines = events.filter((e) => e.t === 'loss').sort((a, b) => String(a.d).localeCompare(String(b.d)) || a.id.localeCompare(b.id));
  for (const e of lines) {
    const raw = typeof e.cause === 'string' && e.cause.trim() ? e.cause.trim().slice(0, 120) : null;
    const k = raw ? fold(raw) : '';
    const was = by.get(k);
    if (was) { was.n += nOf(e); was.lines++; if (e.d > was.last) was.last = e.d; }
    else by.set(k, { cause: raw, n: nOf(e), lines: 1, last: e.d });
  }
  return [...by.values()].sort((a, b) => b.n - a.n || Number(a.cause == null) - Number(b.cause == null) || (a.cause ?? '').localeCompare(b.cause ?? ''));
}
