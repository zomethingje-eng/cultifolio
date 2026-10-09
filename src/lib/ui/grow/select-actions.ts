/**
 * Select mode's Archive and its Undo as functions of the store, so the component and its test call the same code: the
 * test re-typed the component's steps, and with the Undo made a no-op every unit test still passed (round sixty-two; the
 * harness review, 6, the outside review's A25).
 */
import type { Kind } from '$core/log';
import type { PlantEvent } from '$lib/db/types';

/** What these functions ask of the collection: its records, their lines, and its one-commit write. */
export interface ArchiveStore {
  accession(id: string): { status: string } | null | undefined;
  events(acc: string): ReadonlyArray<{ id: string; t: string; note?: string | null }>;
  putWith(kind: Kind, id: string, fields: Record<string, unknown>, events?: Array<Omit<PlantEvent, 'id'>>, also?: Array<{ kind: Kind; id: string; fields: Record<string, unknown> }>): Promise<void>;
}
/** A plant archived, with the "Archived" line the archive wrote on it. */
export type Archived = { acc: string; line: string | null };

/**
 * Archive the growing plants given, the status and its line on each, in one commit: all are archived or none is. Returns
 * each plant with the line this commit wrote on it, found as the one that was not there before, so the Undo takes away
 * exactly those.
 */
export async function archivePlants(store: ArchiveStore, ids: string[], d: string): Promise<Archived[]> {
  if (!ids.length) return [];
  const before = new Set(ids.flatMap((id) => store.events(id).map((e) => e.id)));
  const [first, ...rest] = ids;
  await store.putWith('accession', first, { status: 'archived' }, ids.map((acc) => ({ acc, d, t: 'note' as const, note: 'Archived' })), rest.map((id) => ({ kind: 'accession' as const, id, fields: { status: 'archived' } })));
  return ids.map((acc) => ({ acc, line: store.events(acc).find((e) => !before.has(e.id) && e.t === 'note' && e.note === 'Archived')?.id ?? null }));
}

/**
 * Archive's Undo, one commit (round sixty-two; decision 1, the outside review's A25, the harness review, 6): the plants
 * still archived go back to growing, and only their own "Archived" lines go with them. A plant marked otherwise since
 * keeps its status and its line, and a line another device wrote is never touched, since only the ids this archive wrote
 * are named. Two commits left a plant growing with its "Archived" line when the second failed, and a sync landing between
 * them had its own lines on those plants removed. A failure throws, for the caller to say; nothing is half done.
 */
export async function undoArchive(store: ArchiveStore, done: Archived[]): Promise<{ back: number; lines: number }> {
  const back = done.filter((x) => store.accession(x.acc)?.status === 'archived');
  if (!back.length) return { back: 0, lines: 0 };
  const lines = back.map((x) => x.line).filter((l): l is string => !!l && store.events(back.find((b) => b.line === l)!.acc).some((e) => e.id === l));
  const [first, ...rest] = back;
  // A line goes as an entry of `also` with `_deleted`, in the same commit as the statuses (collection.putWith writes it as removeEvents does).
  await store.putWith('accession', first.acc, { status: 'growing' }, [], [
    ...rest.map((x) => ({ kind: 'accession' as const, id: x.acc, fields: { status: 'growing' } })),
    ...lines.map((id) => ({ kind: 'event' as const, id, fields: { _deleted: true } }))
  ]);
  return { back: back.length, lines: lines.length };
}
