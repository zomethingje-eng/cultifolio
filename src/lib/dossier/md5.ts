/**
 * MD5 of a string, as lowercase hex. Here for one purpose: GBIF's image cache takes a photograph by its occurrence and
 * the MD5 of its address (`image/cache/fit-in/400x/occurrence/<key>/media/<md5>`), and since 2026 refuses the bare
 * address form. The Worker has no MD5 in WebCrypto, so this is the algorithm as RFC 1321 gives it; the unit test holds
 * it to node's own.
 */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const n = bytes.length;
  const padded = new Uint8Array((((n + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[n] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, (n * 8) >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor((n * 8) / 0x100000000), true);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const w = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, true);
    let [A, B, C, D] = [a, b, c, d];
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (B & C) | (~B & D); g = i; }
      else if (i < 32) { f = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = B ^ C ^ D; g = (3 * i + 5) & 15; }
      else { f = C ^ (B | ~D); g = (7 * i) & 15; }
      const t = D;
      D = C;
      C = B;
      const x = (A + f + K[i] + w[g]) >>> 0;
      B = (B + ((x << S[i]) | (x >>> (32 - S[i])))) >>> 0;
      A = t;
    }
    a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  out.setUint32(0, a, true); out.setUint32(4, b, true); out.setUint32(8, c, true); out.setUint32(12, d, true);
  return [...new Uint8Array(out.buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

const OLD = /^https:\/\/api\.gbif\.org\/v1\/image\/cache\/fit-in\/400x\/(https?%3A%2F%2F.+)$/;

/** The thumbnail address GBIF's image cache answers: by the occurrence key and the address's MD5. */
export function gbifThumb(occurrenceKey: string | number, url: string): string {
  return `https://api.gbif.org/v1/image/cache/fit-in/400x/occurrence/${occurrenceKey}/media/${md5(url)}`;
}

/**
 * A thumbnail in the form GBIF no longer serves (the bare address, URL-encoded), turned into the occurrence form when
 * the photograph's id carries its occurrence key (`<key>:<n>`); anything else is left as it is. Applied where a dossier
 * or the index is read, so a corpus built before the change shows its photographs without a rebuild.
 */
export function mendGbifThumb(thumb: string, id: string, url: string): string {
  const m = OLD.exec(thumb);
  if (!m) return thumb;
  const key = /^(\d+):\d+$/.exec(id)?.[1];
  if (!key) return thumb;
  let decoded: string;
  try {
    decoded = decodeURIComponent(m[1]);
  } catch {
    return thumb;
  }
  return gbifThumb(key, decoded === url ? url : decoded);
}
