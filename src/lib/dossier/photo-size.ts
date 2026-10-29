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
  // A Commons thumbnail at Commons' own widths, never wider than the one the dossier keeps: the lead's 960 gives
  // 500w and 960w (round sixty-nine; triage-68 K4, R46-9). An original upload has no widths to offer, and gets none.
  const w = commonsWidth(url);
  if (w) {
    const ws = [...new Set(sizes.map((s) => Math.min(w, COMMONS_PX[s])))];
    return ws.length > 1 ? ws.map((x) => `${atCommonsWidth(url, x)} ${x}w`).join(', ') : undefined;
  }
  return undefined;
};
const WIDTH: Record<PhotoSize, number> = { square: 75, small: 240, medium: 500, large: 1024 };
export type PhotoSize = 'square' | 'small' | 'medium' | 'large';
const INAT = /^(https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/\d+\/)(square|small|medium|large|original)(\.\w*)$/; // an extension may be empty (iNaturalist's `medium.`; round eighty-three, M)
const GBIF = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/\d+x\//;
const PX: Record<PhotoSize, number> = { square: 120, small: 160, medium: 400, large: 1024 };

export function photoAt(url: string, size: PhotoSize): string {
  const m = INAT.exec(url);
  if (m) return `${m[1]}${size}${m[3]}`;
  if (GBIF.test(url)) return url.replace(/fit-in\/\d+x\//, `fit-in/${PX[size]}x/`);
  // A Commons thumbnail at the width the slot needs, from Commons' standard list, and never wider than the one kept:
  // 40- and 56-pixel rows fetched the 500-pixel tile (round sixty-nine; triage-68 K4, R46-9). An original is left as it is.
  const w = commonsWidth(url);
  return w ? atCommonsWidth(url, Math.min(w, COMMONS_PX[size])) : url;
}

/**
 * The widths Commons makes thumbnails at that a slot here asks for (all on Commons' standard list; it refuses others):
 * 120 for a row or a genus thumbnail, 250 for a front-page tile, 500 for a phone's lead or a gallery tile, 960 for the lead.
 */
const COMMONS_PX: Record<PhotoSize, number> = { square: 120, small: 250, medium: 500, large: 960 };
/** A Commons thumbnail's width, from its name (`…/thumb/a/ab/F.jpg/960px-F.jpg`); null for an original upload or another host. */
const commonsWidth = (url: string): number | null => (COMMONS_THUMB.test(url) ? Number(/\/(\d+)px-[^/?#]+$/.exec(url)![1]) : null);
/** The same thumbnail at another width: only the width in its last part changes, so Commons' own name for a long file is kept. */
const atCommonsWidth = (url: string, w: number): string => url.replace(/\/\d+px-([^/?#]+)$/, `/${w}px-$1`);

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
/** A Commons thumbnail: `…/commons/thumb/a/ab/File.jpg/960px-File.jpg`, made by Commons at the width its name says. */
const COMMONS_THUMB = /^https:\/\/upload\.wikimedia\.org\/[^?#]+\/thumb\/[^?#]+\/\d+px-[^/?#]+$/;
/**
 * The address a page loads a photograph from: its own when it is on one of the four hosts the about page names
 * (iNaturalist's two, Wikimedia Commons, GBIF's image cache), otherwise its thumbnail on GBIF's cache. A photograph that
 * reached GBIF from another dataset keeps that dataset's address as its original, and the species page fetched its
 * lead photograph from there: a host nobody was told about (round fifty-nine; outside review). A Commons photograph
 * is shown at the 960-pixel thumbnail the dossier keeps (800 until round sixty-eight; Commons now refuses widths off its list), never the original: an original is often several
 * megabytes, and a link preview's crawler drops an image that large (round sixty; the self-review, 13; A7). Its
 * smaller sizes come from `photoAt` and `srcsetOf`, at Commons' standard widths (round sixty-nine).
 */
export const shownAt = (p: { url: string; thumb?: string; width?: number | null }): string => {
  if (INAT.test(p.url) || GBIF.test(p.url)) return p.url;
  if (COMMONS.test(p.url)) return !COMMONS_THUMB.test(p.url) && !midWidth(p.width) && p.thumb && (COMMONS.test(p.thumb) || GBIF.test(p.thumb)) ? p.thumb : p.url;
  return p.thumb ?? p.url;
};

/**
 * An upload between 501 and 960 pixels wide, which Commons gives no smaller 960-pixel thumbnail of: it leads at its own
 * width, not stretched from its 500-pixel tile (Nepenthes dubia's lead; round sixty-nine; triage-68 K4, R46-9). It is no
 * larger than the 960 a wider file is shown at, and PNG, whose originals are heavy, is no longer taken (K1).
 */
const midWidth = (w: number | null | undefined): boolean => !!w && w > 500 && w <= 960;

/** A Commons original upload's address: `…/commons/a/ab/File.jpg`, with no width in it. */
const COMMONS_ORIGINAL_URL = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/;
/** Commons' thumbnail of an original at a width from its list, from the same path. */
const commonsThumbOf = (m: RegExpExecArray, w: number) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${w}px-${m[3]}`;

/**
 * A tile for a Commons original no wider than 500 pixels (round seventy, second pass; REVIEW-TRIAGE-69 C7, R47-9: 47
 * index tiles were originals, and a 40-pixel row loaded the whole file): Commons' largest width below the original's
 * own, 250 or 120, so `photoAt` gives every smaller slot a thumbnail of its size. An original of 120 pixels or less is
 * no larger than any slot and is kept; so is one whose width was not kept, which cannot be asked of Commons safely (it
 * refuses a width larger than the file).
 */
export function commonsTileOf(thumb: string, width?: number | null): string {
  const m = COMMONS_ORIGINAL_URL.exec(thumb);
  if (!m || !width) return thumb;
  const w = [500, 250, 120].find((x) => x < width);
  return w ? commonsThumbOf(m, w) : thumb;
}

/**
 * The address of a photograph for a slot, knowing its width: a Commons original wider than the slot is asked of Commons
 * at the slot's width, never loaded whole into a smaller slot (C7, R47-9); otherwise `photoAt` of what `shownAt` gives.
 * For the species page's lead, whose phone source asked `photoAt(shownAt(hero), 'medium')` of an original 501 to 960
 * pixels wide and so loaded the original into a 500-pixel slot.
 */
export function photoOf(p: { url: string; thumb?: string; width?: number | null }, size: PhotoSize): string {
  const m = COMMONS_ORIGINAL_URL.exec(p.url);
  if (m && p.width) return COMMONS_PX[size] < p.width ? commonsThumbOf(m, COMMONS_PX[size]) : p.url;
  return photoAt(shownAt(p), size);
}
