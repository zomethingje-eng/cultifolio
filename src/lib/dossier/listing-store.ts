/**
 * The dossiers as a listing command reads them (round eighty-four, G; review B11): a dossier that cannot be read is never
 * passed by in silence. Each listing (`--list-*`, `--check-ranges`, `--list-walk`) reads through this store, which names
 * every file it could not read; the command then says them and stops (exit 2) before it writes its list, so an operator
 * never takes an incomplete list for a whole one. Before, the listings caught the error and went on ("half-written"), while
 * `--index` refused: a page that could not be read dropped out of the repair it most needed.
 */
import type { DossierStore } from './corpus-run';

export interface ListingStore extends Pick<DossierStore, 'files' | 'read'> {
  /** The files that could not be read, each with why, in the order met. */
  readonly unread: string[];
}

export function listingStore(store: Pick<DossierStore, 'files' | 'read'>): ListingStore {
  const unread: string[] = [];
  return {
    files: () => store.files(),
    read<T>(file: string): T {
      try {
        return store.read<T>(file);
      } catch (e) {
        unread.push(`${file}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        throw e;
      }
    },
    unread
  };
}

/** Every dossier of a store, the unreadable ones named in the store and passed by here (the command stops after). */
export function* readEach<T>(store: ListingStore): Generator<T> {
  for (const f of store.files()) {
    let d: T;
    try { d = store.read<T>(f); } catch { continue; }
    yield d;
  }
}

/** What a listing says when it read every dossier but some: null when it read them all. */
export function unreadSentence(store: ListingStore, what: string): string | null {
  if (!store.unread.length) return null;
  const n = store.unread.length;
  return `  ${n} dossier${n === 1 ? '' : 's'} could not be read, so ${what} would not be whole; it is not written:\n${store.unread.slice(0, 20).map((u) => `    ${u}`).join('\n')}${n > 20 ? `\n    … and ${n - 20} more` : ''}\n  Rebuild or restore ${n === 1 ? 'it' : 'them'} (a backup's copy, or --keys with ${n === 1 ? 'its' : 'their'} ids), then run the same command again.`;
}
