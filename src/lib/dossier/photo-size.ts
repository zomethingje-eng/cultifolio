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

const COMMONS = /^https:\/\/upload\.wikimedia\.org\//;
/** A Commons thumbnail: `…/commons/thumb/a/ab/File.jpg/800px-File.jpg`, made by Commons at the width its name says. */
const COMMONS_THUMB = /^https:\/\/upload\.wikimedia\.org\/[^?#]+\/thumb\/[^?#]+\/\d+px-[^/?#]+$/;
/**
 * The address a page loads a photograph from: its own when it is on one of the four hosts the about page names
 * (iNaturalist's two, Wikimedia Commons, GBIF's image cache), otherwise its thumbnail on GBIF's cache. A photograph that
 * reached GBIF from another dataset keeps that dataset's address as its original, and the species page fetched its
 * lead photograph from there: a host nobody was told about (round fifty-nine; outside review). A Commons photograph
 * is shown at the 800-pixel thumbnail the dossier keeps beside it, never the original: an original is often several
 * megabytes, and a link preview's crawler drops an image that large (round sixty; the self-review, 13; A7). Commons
 * makes its thumbnails at one width each, so the page asks for that one size (no srcset).
 */
export const shownAt = (p: { url: string; thumb?: string }): string => {
  if (INAT.test(p.url) || GBIF.test(p.url)) return p.url;
  if (COMMONS.test(p.url)) return !COMMONS_THUMB.test(p.url) && p.thumb && (COMMONS.test(p.thumb) || GBIF.test(p.thumb)) ? p.thumb : p.url;
  return p.thumb ?? p.url;
};
