import type { Photo } from './schema';

/** The iNaturalist photograph id in an address, for a photograph that reached the dossier twice: once from iNaturalist and once through GBIF. */
export const inatPhotoId = (url: string): string | null => /^https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/(\d+)\//.exec(url)?.[1] ?? null;

/**
 * One copy of each photograph: the same iNaturalist picture arrives from iNaturalist and again through GBIF, and
 * Gymnocalycium mihanovichii showed three of them twice (round thirty-five, R1-9). The iNaturalist record is kept, for
 * its cultivated flag and date; the first of two equal addresses otherwise.
 */
export function dedupePhotos(photos: Photo[]): Photo[] {
  const seen = new Map<string, number>();
  const out: Photo[] = [];
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

/** The photograph to show first: a wild one over a cultivated one, and a still image over a GIF when there is one. */
export function heroOf<T extends { url: string; captive?: boolean }>(photos: T[]): T | undefined {
  const wild = photos.filter((p) => !p.captive);
  return wild.find((p) => !isGif(p.url)) ?? photos.find((p) => !isGif(p.url)) ?? wild[0] ?? photos[0];
}
