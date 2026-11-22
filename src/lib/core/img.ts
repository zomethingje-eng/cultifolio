/**
 * The site's own copy of a photograph (round 109; the first hand-off's round 6): the path a copy of a source's address is
 * kept at in the site's photograph bucket (cultifolio-img), served from img.cultifolio.com. One pure function, the same for the copy step
 * (scripts/img-copy.ts) and, from round 111, the pages, so a path is never worked out two ways.
 *
 * - iNaturalist (its open-data bucket and static.inaturalist.org, one photo id across both): `inat/<photo id>/<size>.<ext>`,
 *   the extension the source's own, lower-cased, `jpg` where it gives none (`medium.`).
 * - GBIF's image cache of an occurrence's media: `gbif/<width>/<occurrence>/<media hash>.jpg`; another address on the
 *   cache, `gbif/<width>/h/<hash of the address>.jpg`.
 * - Wikimedia Commons: `commons/<two hex>/<hash of the address>.<ext>`. A Commons file name can hold characters a Windows
 *   file name cannot and run past its 260-character path, so the copy's name is a hash of the whole address (FNV-1a,
 *   64 bits: at four million copies the chance of two sharing one is about one in a million million).
 *
 * Every path ends in an image's extension: Cloudflare's cache keeps a file by its extension, and a `.txt` came back
 * DYNAMIC when the bucket was checked (22 November 2026). An address of any other host, or of a kind of file a page does
 * not show as a photograph, has no copy (null), and a page keeps its source's address.
 */
export const IMG_ORIGIN = 'https://img.cultifolio.com';

const INAT = /^https:\/\/(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/(\d+)\/(square|small|medium|large|original)\.(\w*)$/;
const GBIF_OCC = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/(\d+)x\/occurrence\/(\d+)\/media\/([0-9a-f]{32})$/;
const GBIF_ANY = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/(\d+)x\/(.+)$/;
const COMMONS = /^https:\/\/upload\.wikimedia\.org\/[^?#]+\.([A-Za-z]+)$/;
/** The kinds of file a copy is kept of: what the reference's photographs are (the corpus held jpg, jpeg, png, gif and one webp on 22 November 2026). */
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

/** FNV-1a, 64 bits, of the address's UTF-8 bytes, as 16 hex digits: the same in the browser, the Worker and Node. */
export function fnv64(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
}

/** The copy's path in the bucket (no leading slash), or null where a photograph at this address is not copied. */
export function imgKey(url: string): string | null {
  let m = INAT.exec(url);
  if (m) {
    const ext = (m[3] || 'jpg').toLowerCase();
    return IMAGE_EXT.has(ext) ? `inat/${m[1]}/${m[2]}.${ext}` : null;
  }
  m = GBIF_OCC.exec(url);
  if (m) return `gbif/${m[1]}/${m[2]}/${m[3]}.jpg`;
  m = GBIF_ANY.exec(url);
  if (m) return `gbif/${m[1]}/h/${fnv64(url)}.jpg`;
  m = COMMONS.exec(url);
  if (m) {
    const ext = m[1].toLowerCase();
    if (!IMAGE_EXT.has(ext)) return null;
    const h = fnv64(url);
    return `commons/${h.slice(0, 2)}/${h}.${ext}`;
  }
  return null;
}

/** The copy's address on img.cultifolio.com, or the source's own where it has none (for round 111's pages). */
export const imgUrl = (url: string): string => {
  const k = imgKey(url);
  return k ? `${IMG_ORIGIN}/${k}` : url;
};
