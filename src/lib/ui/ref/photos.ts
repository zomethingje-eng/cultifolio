/**
 * The species page's photographs: which are shown, and what is said of the sources that gave none. Pure functions, so
 * the rules are tested apart from the page (round sixty-two).
 */

const COMMONS = /^https:\/\/upload\.wikimedia\.org\//;
const COMMONS_THUMB = /^https:\/\/upload\.wikimedia\.org\/[^?#]+\/thumb\/[^?#]+\/\d+px-[^/?#]+$/;
const GBIF_CACHE = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\//;

/**
 * A Commons photograph is shown at its thumbnail, never its original (often several megabytes, and dropped by a link
 * preview's crawler). One whose dossier keeps no thumbnail on Commons or GBIF's cache is not shown at all, rather than
 * loading the original (round sixty-two; outside review A35, A7 of the round before).
 */
export function showable(p: { url: string; thumb?: string | null }): boolean {
  if (!COMMONS.test(p.url) || COMMONS_THUMB.test(p.url)) return true;
  return !!p.thumb && (COMMONS.test(p.thumb) || GBIF_CACHE.test(p.thumb));
}

const SOURCE_NAME: Record<string, string> = { 'inat.taxon': 'iNaturalist', 'inat.photos.wild': 'iNaturalist', 'inat.photos.cultivated': 'iNaturalist', commons: 'Wikimedia Commons', 'gbif.media': 'GBIF media' };
const PHOTO_SOURCES = Object.keys(SOURCE_NAME);

type Up = Record<string, { status: string; detail?: string } | undefined>;

/**
 * The photograph sources that gave nothing, each said as what it did (rule 2): "refused" for a refusal, "did not answer"
 * for a failure, "was skipped" for a source this build did not ask. A skipped source is named only when the page has no
 * photographs: beside photographs, its earlier answer was carried over. Before round sixty-two every one of them was
 * said to have "did not answer", which is untrue of a source that was never asked (round sixty-two; outside review A35).
 */
export function photoSourceGaps(upstream: Up, photos: number): { names: string[]; clause: string; allSkipped: boolean; allUncredited: boolean } | null {
  const keys = PHOTO_SOURCES.filter((k) => { const st = upstream[k]?.status ?? ''; return st === 'refused' || st === 'error' || (st === 'skipped' && !photos); });
  if (!keys.length) return null;
  // One word per source name: iNaturalist has three keys, and the strongest of them is said (a refusal over a skip).
  const rank = { refused: 3, error: 2, skipped: 1 } as Record<string, number>;
  const by = new Map<string, string>();
  for (const k of keys) {
    const n = SOURCE_NAME[k], st = upstream[k]!.status;
    if ((rank[st] ?? 0) > (rank[by.get(n) ?? ''] ?? 0)) by.set(n, st);
  }
  const group = (st: string) => [...by].filter(([, s]) => s === st).map(([n]) => n);
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const parts = [
    group('refused').length ? `${list(group('refused'))} refused` : '',
    group('error').length ? `${list(group('error'))} did not answer` : '',
    group('skipped').length ? `${list(group('skipped'))} ${group('skipped').length === 1 ? 'was' : 'were'} skipped (not asked)` : ''
  ].filter(Boolean);
  return {
    names: [...by.keys()],
    clause: list(parts),
    allSkipped: keys.every((k) => upstream[k]?.status === 'skipped'),
    allUncredited: keys.every((k) => (upstream[k]?.detail ?? '').startsWith('no credited photograph'))
  };
}
