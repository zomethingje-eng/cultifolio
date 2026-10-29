/**
 * iNaturalist's address of a photograph whose file has no extension (round eighty-three, M; the live check of 29 October):
 * its photograph 1223631 (Aciphylla aurea, 2013) is `photos/1223631/square.` with nothing after the dot, and its other
 * sizes `medium.`, `large.`. The builder cut the size off by `/square\.(\w+)$/`, which needs a letter after the dot, so it
 * kept the whole address as the base and wrote `photos/1223631/square./large.jpg` (404). This module gives the base and
 * the extension as the address has them, and mends an address written the broken way.
 */

/** The address with the size cut off and the extension as written (empty when there is none), or null if not a size. */
export function inatBase(url: string): { base: string; ext: string } | null {
  const m = /^(.*\/photos\/\d+)\/(?:square|small|medium|large|original)\.(\w*)(?:\?.*)?$/.exec(url);
  return m ? { base: m[1], ext: m[2] } : null;
}

const BROKEN = /^(https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/\d+)\/(?:square|small|medium|large|original)\.\/(square|small|medium|large|original)\.\w+$/;

/** An address written the broken way (`…/square./large.jpg`) as the file is named (`…/large.`); any other as it is. */
export function mendInatUrl(url: string): string {
  const m = BROKEN.exec(url);
  return m ? `${m[1]}/${m[2]}.` : url;
}

/** A dossier's iNaturalist photographs mended in place; the count of addresses changed. */
export function mendInatPhotos(photos: Array<{ url?: string; thumb?: string }> | undefined): number {
  let n = 0;
  for (const p of photos ?? []) {
    for (const k of ['url', 'thumb'] as const) {
      const v = p[k];
      if (typeof v === 'string') { const w = mendInatUrl(v); if (w !== v) { p[k] = w; n++; } }
    }
  }
  return n;
}
