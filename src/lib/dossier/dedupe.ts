import type { Photo } from './schema';

/** The iNaturalist photograph id in an address, for a photograph that reached the dossier twice: once from iNaturalist and once through GBIF. */
export const inatPhotoId = (url: string): string | null => /^https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/(\d+)\//.exec(url)?.[1] ?? null;

/**
 * One copy of each photograph: the same iNaturalist picture arrives from iNaturalist and again through GBIF, and
 * Gymnocalycium mihanovichii showed three of them twice (round thirty-five, R1-9). The iNaturalist record is kept, for
 * its cultivated flag and date; the first of two equal addresses otherwise.
 */
export function dedupePhotos(photos: Photo[]): Photo[] {
  return oneCopyEach(photos);
}

/** The same for any photograph-like list: `shownPhotos` reads it, so the index counts what the page shows (round seventy; REVIEW-TRIAGE-69 C4). */
export function oneCopyEach<P extends { url: string; src?: string }>(photos: readonly P[]): P[] {
  const seen = new Map<string, number>();
  const out: P[] = [];
  for (const p of photos) {
    const k = inatPhotoId(p.url) ?? p.url;
    const at = seen.get(k);
    if (at == null) { seen.set(k, out.length); out.push(p); }
    else if (p.src === 'inat' && out[at].src !== 'inat') out[at] = p;
  }
  return out;
}

/** Whether a photograph's address is an animated GIF: one such hero was four megabytes on the front page (round thirty-five, R2-7). */
export const isGif = (url: string): boolean => /\.gif(\?|$)/i.test(url);

/**
 * A photograph's place in the order the lead is chosen by: iNaturalist's wild, then GBIF's, then iNaturalist's
 * cultivated, then Commons'. A Commons or GBIF file carries no cultivated flag, and reading the absence as wild let a
 * Commons file lead over every cultivated photograph of the dossier's own, though many are taken in botanic gardens; a
 * Commons file now leads only a dossier with no photograph from iNaturalist or GBIF (round sixty-nine; triage-68 K5,
 * S-B2, R46-16). A photograph with no source named is read by its flag, as before.
 */
export function leadRank(p: { src?: string; captive?: boolean; url?: string; specimen?: boolean }): number {
  if (isSpecimenMedia(p)) return 4;
  if (p.src === 'commons') return 3;
  if (p.captive) return 2;
  return p.src === 'inat' ? 0 : 1;
}

/**
 * GBIF media of a preserved specimen: a herbarium sheet or a museum's fruit, which led Adenia goetzei, Ceropegia
 * stapeliiformis and Franklinia alatamaha over Commons photographs of the living plant (round seventy, second pass;
 * REVIEW-TRIAGE-69 C7, R47-10). Known by the flag a build sets from the record's basisOfRecord (`specimen`), and, in a
 * dossier built before, by the herbaria's own image hosts. It ranks below Commons, and is still shown.
 */
const HERBARIUM_HOSTS = /^https?:\/\/(?:oxalis\.br\.fgov\.be|collections\.nmnh\.si\.edu|specimens\.kew\.org|sweetgum\.nybg\.org|mediaphoto\.mnhn\.fr|herbarium\.bgbm\.org|[^/]*herbari[^/]*)\//i;
export const isSpecimenMedia = (p: { src?: string; url?: string; specimen?: boolean }): boolean => p.src === 'gbif' && (p.specimen === true || HERBARIUM_HOSTS.test(p.url ?? ''));

/**
 * The photograph to show first (round eighty-two; the independent review's 13: Echeveria elegans led with a cropped
 * flower stalk, an upright photograph cut to the hero's band). In this order, each set in the photographs' own order:
 *
 *   1. iNaturalist's cultivated set, the first of it where there is one: the plant as it is grown;
 *   2. the rest by `leadRank`, as before (iNaturalist's wild, GBIF's, Commons', a specimen last);
 *
 * and of those the first that is not upright (taller than wide, by the shape its source states), when there is one: the
 * hero is a 4:3 box on a desktop and a wide band on a phone, and an upright photograph is cut to its middle third there.
 * A photograph whose shape is not stated (GBIF's) keeps its place. A still image over a GIF when there is one.
 */
export function heroOf<T extends { url: string; captive?: boolean; src?: string; width?: number | null; height?: number | null; specimen?: boolean }>(photos: readonly T[]): T | undefined {
  const still = photos.filter((p) => !isGif(p.url));
  const pool = still.length ? still : photos;
  const rank = (p: T) => (p.captive === true && p.src === 'inat' ? -1 : leadRank(p));
  const ordered = pool.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
  const upright = (p: T) => !!p.width && !!p.height && p.height > p.width;
  return ordered.find((p) => !upright(p)) ?? ordered[0];
}
