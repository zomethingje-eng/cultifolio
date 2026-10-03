/**
 * Which bucket a species slug falls in: FNV-1a over the slug, taken modulo the bucket count, as hex digits. A page that
 * needs a grower's own species asks the server for their buckets, never their names or keys, so the server learns at
 * most which buckets a device asked for; each holds a few hundred species, and a grower with a few dozen species asks
 * for most of them. The same function on both sides, so the split is by rule, not by a table.
 *
 * The count scales with the corpus (round fifty-three, 2): thirty-two buckets of two hundred and eighty species was
 * right for nine thousand, and would be buckets of fifteen hundred at fifty thousand. The build chooses the count for
 * the corpus it writes (`bucketsFor`), the manifest carries it, `/api/corpus` announces it, and every device reads it
 * there before it asks for a bucket; a count a device has not read defaults to the thirty-two of every corpus before.
 */
export const BUCKETS = 32;
/** About this many species to a bucket: few enough to be one short request, many enough that a bucket says little. */
export const PER_BUCKET = 320;
/** The bucket count for a corpus of `n` species: a power of two from 32, so that no bucket holds much more than PER_BUCKET. */
export function bucketsFor(n: number): number {
  let b = BUCKETS;
  while (n / b > PER_BUCKET && b < 4096) b *= 2;
  return b;
}
/** The hex width of a bucket name under a count: two digits up to 256 buckets, three to 4096. */
export const bucketWidth = (buckets: number) => Math.max(2, (buckets - 1).toString(16).length);
export function bucketOf(slug: string, buckets = BUCKETS): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193) >>> 0;
  return (h % buckets).toString(16).padStart(bucketWidth(buckets), '0');
}
/** Every bucket name under a count, in order. */
export const bucketNames = (buckets: number) => Array.from({ length: buckets }, (_, i) => i.toString(16).padStart(bucketWidth(buckets), '0'));
/** Whether `b` names a bucket under the count: the right width of lowercase hex, below the count. */
export function isBucket(b: string, buckets = BUCKETS): boolean {
  if (!/^[0-9a-f]+$/.test(b) || b.length !== bucketWidth(buckets)) return false;
  return parseInt(b, 16) < buckets;
}
/** The thirty-two buckets of a corpus before the count scaled, as a pattern: the routes' message names it. */
export const BUCKET = /^(0[0-9a-f]|1[0-9a-f])$/;
