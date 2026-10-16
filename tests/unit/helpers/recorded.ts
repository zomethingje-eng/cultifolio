/**
 * Recorded upstream answers, keyed by the URL that was asked, looked up with `maxlag` taken out of both sides (round
 * seventy-two). The builder no longer sends `maxlag` on Wikidata's reads (the lag Wikidata reports is its query
 * service's, which no read of an item, a search or a label waits on), and the answers of rounds seventy and seventy-one
 * were recorded when it did: a lookup that ignores the parameter reads them as they are, before the change and after it.
 */
import type { JsonFetcher } from '$dossier/fetch';

/** The URL without `maxlag`. */
export const unlagged = (url: string) => url.replace(/&maxlag=-?\d+/g, '');

/** A fake fetcher over recorded answers ({ status, data } each); a URL with no answer is refused, never read as none. */
export function recordedFetcher(answers: Record<string, unknown>): JsonFetcher {
  const by = new Map(Object.entries(answers).map(([k, v]) => [unlagged(k), v]));
  return (async (url: string) => by.get(unlagged(url)) ?? { status: 'refused', detail: `no fixture: ${url}` }) as unknown as JsonFetcher;
}
