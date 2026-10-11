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

/**
 * A photograph's place in the order the lead is chosen by: iNaturalist's wild, then GBIF's, then iNaturalist's
 * cultivated, then Commons'. A Commons or GBIF file carries no cultivated flag, and reading the absence as wild let a
 * Commons file lead over every cultivated photograph of the dossier's own, though many are taken in botanic gardens; a
 * Commons file now leads only a dossier with no photograph from iNaturalist or GBIF (round sixty-nine; triage-68 K5,
 * S-B2, R46-16). A photograph with no source named is read by its flag, as before.
 */
export function leadRank(p: { src?: string; captive?: boolean }): number {
  if (p.src === 'commons') return 3;
  if (p.captive) return 2;
  return p.src === 'inat' ? 0 : 1;
}

/** The photograph to show first: by `leadRank`, the first of the best rank, and a still image over a GIF when there is one. */
export function heroOf<T extends { url: string; captive?: boolean; src?: string }>(photos: readonly T[]): T | undefined {
  const still = photos.filter((p) => !isGif(p.url));
  const pick = (xs: readonly T[]) => xs.reduce<T | undefined>((best, p) => (!best || leadRank(p) < leadRank(best) ? p : best), undefined);
  return pick(still) ?? pick(photos);
}
