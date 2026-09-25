/**
 * The right size of a photograph for where it is shown. iNaturalist keeps
 * every photo in fixed sizes (square 75, small 240, medium 500, large 1024,
 * original); GBIF's image cache resizes on request. A dossier stores the
 * large and the medium; a 48-pixel row thumbnail should not fetch 500 pixels,
 * and a phone's hero should not fetch the original. Any other host is left
 * as it is.
 */
export type PhotoSize = 'small' | 'medium' | 'large';
const INAT = /^(https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/\d+\/)(square|small|medium|large|original)(\.\w+)$/;
const GBIF = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/\d+x\//;
const PX: Record<PhotoSize, number> = { small: 160, medium: 400, large: 1024 };

export function photoAt(url: string, size: PhotoSize): string {
  const m = INAT.exec(url);
  if (m) return `${m[1]}${size}${m[3]}`;
  if (GBIF.test(url)) return url.replace(/fit-in\/\d+x\//, `fit-in/${PX[size]}x/`);
  return url;
}
