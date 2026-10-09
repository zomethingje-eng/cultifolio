/**
 * Small counting words for the private pages: "1 photo", "2 photos", never "1 photos"; "a, b and c". The backup page
 * said "40 plants · 1 photos" (round sixty; the grower review, 16).
 */

/** "0 photos", "1 photo", "40 photos", "2 propagation batches": the core's one helper (round sixty-two; decision 11). */
import { plural } from '$core/words';
export { plural };

/** Only when there are some: an empty string for none, so a list leaves it out. */
export const some = (n: number, one: string, many?: string): string => (n ? plural(n, one, many) : '');

/** "a", "a and b", "a, b and c"; empty parts are left out. */
export function listWords(parts: string[]): string {
  const xs = parts.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
