/** A short base-36 tag of a string (two FNV-1a passes), for writer tags that must be the same on every device. */
export function tag36(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36);
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}

/**
 * How many characters of `idTag` a code carries. Measured with the qrcode library the labels page draws with (tests/unit/
 * r87s3-label-items.test.ts): `https://cultifolio.com/plants/2026-0012` alone is a version 3 code (29 modules a side) at
 * error correction M; any tag after a # makes it version 4 (33) at M, 0.27 mm a module in the 9 mm a 12 mm tape prints,
 * under two dots of a 180 dpi tape printer. At error correction L a six-character tag keeps version 3 (0.31 mm, 2.2
 * dots), for a number as long as CACT-00012/AB too, and eight do not; so the 12 mm tape's code is drawn at L and the
 * tag is six characters. Six base-36 characters are about two thousand million values: the chance that a label's tag is
 * also another plant's in a collection of five thousand is about one in four hundred thousand.
 */
export const ID_TAG_LEN = 6;
/**
 * A plant's identity tag: the first characters of a hash of its record identity, not of the identity itself. A record's
 * identity begins with the time it was made (`newId`), so the plants of one import, written in one millisecond, share
 * their first nine characters, and plants made within the same 46 seconds their first six: a prefix of the identity
 * would not tell them apart (round eighty-seven, the stage 3 fixes; review B1).
 */
export const idTag = (id: string, n: number = ID_TAG_LEN): string => tag36(`label:${id}`).slice(0, n);
/** Whether a tag read from a code is this record's. */
export const tagIs = (tag: string, id: string): boolean => idTag(id, tag.length) === tag;
