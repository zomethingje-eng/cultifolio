/**
 * The right size of a photograph for where it is shown. iNaturalist keeps
 * every photo in fixed sizes (square 75, small 240, medium 500, large 1024,
 * original); GBIF's image cache resizes on request. A dossier stores the
 * large and the medium; a 48-pixel row thumbnail should not fetch 500 pixels,
 * and a phone's hero should not fetch the original. Any other host is left
 * as it is. A `srcset` of these, with the box's `sizes`, lets the browser
 * take the size its pixel density needs (round thirty-three, R3-5).
 */
export const srcsetOf = (url: string, sizes: PhotoSize[]): string | undefined => {
  // The widths are the host's: iNaturalist's fixed sizes, or the pixels GBIF's cache is asked for; a host with no sizes
  // gets no srcset, since one address at two declared widths downloads the original either way (round thirty-five, R1-13).
  if (INAT.test(url)) return sizes.map((s) => `${photoAt(url, s)} ${WIDTH[s]}w`).join(', ');
  if (GBIF.test(url)) return sizes.map((s) => `${photoAt(url, s)} ${PX[s]}w`).join(', ');
  return undefined;
};
const WIDTH: Record<PhotoSize, number> = { square: 75, small: 240, medium: 500, large: 1024 };
export type PhotoSize = 'square' | 'small' | 'medium' | 'large';
const INAT = /^(https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/\d+\/)(square|small|medium|large|original)(\.\w+)$/;
const GBIF = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/\d+x\//;
const PX: Record<PhotoSize, number> = { square: 120, small: 160, medium: 400, large: 1024 };

export function photoAt(url: string, size: PhotoSize): string {
  const m = INAT.exec(url);
  if (m) return `${m[1]}${size}${m[3]}`;
  if (GBIF.test(url)) return url.replace(/fit-in\/\d+x\//, `fit-in/${PX[size]}x/`);
  return url;
}

/**
 * The origins a page's photographs come from, each once, for a `preconnect` in the head: the first-screen photograph is
 * on a third party's host, and the handshake to it (DNS, TCP, TLS) is paid before its first byte. Only the hosts the
 * reference's photographs are known to live on; any other address is left to the browser (round forty-two, 1).
 */
export const photoHosts = (urls: Array<string | null | undefined>): string[] => {
  const out: string[] = [];
  for (const u of urls) {
    if (!u || !(INAT.test(u) || GBIF.test(u))) continue;
    const o = new URL(u).origin;
    if (!out.includes(o)) out.push(o);
  }
  return out;
};
