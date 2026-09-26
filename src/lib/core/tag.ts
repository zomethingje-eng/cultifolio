/** A short base-36 tag of a string (two FNV-1a passes), for writer tags that must be the same on every device. */
export function tag36(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36);
  };
  return fnv(0x811c9dc5) + fnv(0x050c5d1f);
}
