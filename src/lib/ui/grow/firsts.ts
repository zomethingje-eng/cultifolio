/**
 * Firsts on Today (round sixty; the grower review's §3, the self-review's experience item 6): a plant's first flowering,
 * a batch's first germination count, a plant's first photograph, when it falls today or yesterday. A plain reading of
 * the log: the earliest line of its kind on that record is the one dated then. A photograph counts by the day its record
 * was made on, not the day the camera says it was taken, so an old picture added today is still the first one added
 * today. Nothing is written (rule 5).
 */
import type { PlantEvent } from '$lib/db/types';

export type FirstKind = 'flower' | 'germinate' | 'photo';
export interface First { kind: FirstKind; recId: string; d: string; n?: number | null }

const EVENT_KINDS: Array<'flower' | 'germinate'> = ['flower', 'germinate'];

export interface FirstsSource {
  /** A record's log lines, any order. */
  events(id: string): PlantEvent[];
  /** A plant's photographs: identity and the day the record was made on (null when not known). */
  photos?(id: string): Array<{ id: string; made: string | null }>;
}

/** `ids` are the plants' and the batches' identities to look at. */
export function firstsOf(ids: Iterable<string>, src: FirstsSource, today: string, yesterday: string): First[] {
  const out: First[] = [];
  const recent = (d: string) => d === today || d === yesterday;
  for (const id of ids) {
    const evs = src.events(id);
    for (const k of EVENT_KINDS) {
      let first: PlantEvent | null = null;
      for (const e of evs) if (e.t === k && e.d <= today && (!first || e.d < first.d || (e.d === first.d && e.id < first.id))) first = e;
      if (first && recent(first.d)) out.push({ kind: k, recId: id, d: first.d, ...(k === 'germinate' ? { n: first.n ?? null } : {}) });
    }
    const ph = src.photos?.(id) ?? [];
    if (ph.length && ph.every((p) => p.made)) {
      // Only when every photograph's day is known: one of unknown day might be the first.
      const first = ph.reduce((a, b) => ((b.made as string) < (a.made as string) ? b : a));
      if (recent(first.made as string)) out.push({ kind: 'photo', recId: id, d: first.made as string });
    }
  }
  return out.sort((a, b) => b.d.localeCompare(a.d) || a.kind.localeCompare(b.kind) || a.recId.localeCompare(b.recId));
}
