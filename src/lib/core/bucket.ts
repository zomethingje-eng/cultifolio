/**
 * Which of 32 buckets a species slug falls in: FNV-1a over the slug, low five bits, two hex digits (00–1f). A page that
 * needs a grower's own species asks the server for their buckets, never their names or keys, so the server learns at
 * most which buckets a device asked for; each holds about 280 species, and a grower with a few dozen species asks for
 * most of them. The same function on both sides, so the split is by rule, not by a table.
 */
export const BUCKETS = 32;
export function bucketOf(slug: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193) >>> 0;
  return (h % BUCKETS).toString(16).padStart(2, '0');
}
export const BUCKET = /^(0[0-9a-f]|1[0-9a-f])$/;
