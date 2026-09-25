/**
 * Which of 256 buckets a species slug falls in: FNV-1a over the slug, low byte, two hex digits. A page that needs the
 * index entries for a grower's own species asks the server for their buckets, never their names, so the server learns
 * at most which two-digit buckets a device asked for (each holds about thirty-five species). The same function on
 * both sides, so the split is by rule, not by a table.
 */
export function bucketOf(slug: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193) >>> 0;
  return (h & 0xff).toString(16).padStart(2, '0');
}
export const BUCKET = /^[0-9a-f]{2}$/;
