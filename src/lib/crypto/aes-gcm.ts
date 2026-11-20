/**
 * AES-256-GCM, synchronous (round ninety-nine; docs/REVIEW-ROUND-99.md, D3). The vault seals and opens change values inside its
 * IndexedDB transactions, which end at the first wait on anything else; WebCrypto always waits, so the vault keeps this
 * one for those transactions and uses WebCrypto everywhere else. It is the standard AES-GCM (NIST SP 800-38D: a 96-bit
 * IV, a 128-bit tag appended to the ciphertext, as WebCrypto writes it), so either opens what the other sealed; the tests
 * hold it to NIST's vectors and to WebCrypto on random keys, IVs, AAD and lengths (tests/unit/r99a-aes-gcm.test.ts).
 *
 * Written for correctness, not speed: the values it handles inside transactions are small. Timing side channels are not
 * in its threat (data at rest on the grower's own device, read by no one while it runs).
 */

/* ---- AES ---- */
const SBOX = new Uint8Array(256);
const T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
{
  // The S-box from its definition (the multiplicative inverse in GF(2^8), then the affine map), not typed in by hand.
  const rotl8 = (x: number, s: number) => ((x << s) | (x >>> (8 - s))) & 0xff;
  let p = 1, q = 1;
  do {
    p = (p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0)) & 0xff; // p * 3
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; // q / 3
    SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) {
    const s = SBOX[i];
    const s2 = ((s << 1) ^ (s & 0x80 ? 0x1b : 0)) & 0xff;
    const s3 = s2 ^ s;
    const t = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0;
    T0[i] = t;
    T1[i] = ((t >>> 8) | (t << 24)) >>> 0;
    T2[i] = ((t >>> 16) | (t << 16)) >>> 0;
    T3[i] = ((t >>> 24) | (t << 8)) >>> 0;
  }
}
const subWord = (w: number) => ((SBOX[w >>> 24] << 24) | (SBOX[(w >>> 16) & 0xff] << 16) | (SBOX[(w >>> 8) & 0xff] << 8) | SBOX[w & 0xff]) >>> 0;

/** The 60 round-key words of a 256-bit key. */
function expandKey(key: Uint8Array): Uint32Array {
  if (key.length !== 32) throw new Error('AES-256 takes a key of 32 bytes');
  const w = new Uint32Array(60);
  for (let i = 0; i < 8; i++) w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
  let rcon = 1;
  for (let i = 8; i < 60; i++) {
    let t = w[i - 1];
    if (i % 8 === 0) {
      t = (subWord(((t << 8) | (t >>> 24)) >>> 0) ^ (rcon << 24)) >>> 0;
      rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1b : 0)) & 0xff;
    } else if (i % 8 === 4) t = subWord(t);
    w[i] = (w[i - 8] ^ t) >>> 0;
  }
  return w;
}

/** One block, in place: four big-endian words. */
function encryptBlock(w: Uint32Array, b: Uint32Array): void {
  let s0 = b[0] ^ w[0], s1 = b[1] ^ w[1], s2 = b[2] ^ w[2], s3 = b[3] ^ w[3];
  let k = 4;
  for (let r = 1; r < 14; r++) {
    const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 0xff] ^ T2[(s2 >>> 8) & 0xff] ^ T3[s3 & 0xff] ^ w[k];
    const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 0xff] ^ T2[(s3 >>> 8) & 0xff] ^ T3[s0 & 0xff] ^ w[k + 1];
    const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 0xff] ^ T2[(s0 >>> 8) & 0xff] ^ T3[s1 & 0xff] ^ w[k + 2];
    const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 0xff] ^ T2[(s1 >>> 8) & 0xff] ^ T3[s2 & 0xff] ^ w[k + 3];
    s0 = t0; s1 = t1; s2 = t2; s3 = t3; k += 4;
  }
  b[0] = (((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 0xff] << 16) | (SBOX[(s2 >>> 8) & 0xff] << 8) | SBOX[s3 & 0xff]) ^ w[k]) >>> 0;
  b[1] = (((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 0xff] << 16) | (SBOX[(s3 >>> 8) & 0xff] << 8) | SBOX[s0 & 0xff]) ^ w[k + 1]) >>> 0;
  b[2] = (((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 0xff] << 16) | (SBOX[(s0 >>> 8) & 0xff] << 8) | SBOX[s1 & 0xff]) ^ w[k + 2]) >>> 0;
  b[3] = (((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 0xff] << 16) | (SBOX[(s1 >>> 8) & 0xff] << 8) | SBOX[s2 & 0xff]) ^ w[k + 3]) >>> 0;
}

/* ---- GHASH ---- */
/** x := x · h in GF(2^128), GCM's bit order (the most significant bit of the first word first). */
function gmul(x: Uint32Array, h: Uint32Array): void {
  let z0 = 0, z1 = 0, z2 = 0, z3 = 0;
  let v0 = h[0], v1 = h[1], v2 = h[2], v3 = h[3];
  for (let i = 0; i < 128; i++) {
    if ((x[i >>> 5] >>> (31 - (i & 31))) & 1) { z0 ^= v0; z1 ^= v1; z2 ^= v2; z3 ^= v3; }
    const lsb = v3 & 1;
    v3 = (v3 >>> 1) | ((v2 & 1) << 31);
    v2 = (v2 >>> 1) | ((v1 & 1) << 31);
    v1 = (v1 >>> 1) | ((v0 & 1) << 31);
    v0 = v0 >>> 1;
    if (lsb) v0 ^= 0xe1000000;
  }
  x[0] = z0 >>> 0; x[1] = z1 >>> 0; x[2] = z2 >>> 0; x[3] = z3 >>> 0;
}
const word = (b: Uint8Array, i: number) => (i + 3 < b.length ? ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0 : (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0);
/** GHASH of the AAD and the ciphertext, each padded to whole blocks, then their lengths in bits. */
function ghash(h: Uint32Array, aad: Uint8Array, ct: Uint8Array): Uint32Array {
  const y = new Uint32Array(4);
  for (const data of [aad, ct]) {
    for (let i = 0; i < data.length; i += 16) {
      y[0] ^= word(data, i); y[1] ^= word(data, i + 4); y[2] ^= word(data, i + 8); y[3] ^= word(data, i + 12);
      gmul(y, h);
    }
  }
  const abits = aad.length * 8, cbits = ct.length * 8;
  y[0] ^= Math.floor(abits / 2 ** 32) >>> 0; y[1] ^= abits >>> 0; y[2] ^= Math.floor(cbits / 2 ** 32) >>> 0; y[3] ^= cbits >>> 0;
  gmul(y, h);
  return y;
}

/* ---- GCM ---- */
function setup(key: Uint8Array, iv: Uint8Array): { w: Uint32Array; h: Uint32Array; j0: Uint32Array } {
  if (iv.length !== 12) throw new Error('AES-GCM here takes a 12-byte IV');
  const w = expandKey(key);
  const h = new Uint32Array(4);
  encryptBlock(w, h);
  const j0 = new Uint32Array([word(iv, 0), word(iv, 4), word(iv, 8), 1]);
  return { w, h, j0 };
}
/** CTR from inc32(J0): the keystream XORed over `src` into a new array. */
function ctr(w: Uint32Array, j0: Uint32Array, src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  const c = new Uint32Array(4), ks = new Uint32Array(4);
  c.set(j0);
  for (let i = 0; i < src.length; i += 16) {
    c[3] = (c[3] + 1) >>> 0;
    ks.set(c);
    encryptBlock(w, ks);
    for (let j = 0; j < 16 && i + j < src.length; j++) out[i + j] = src[i + j] ^ ((ks[j >>> 2] >>> (24 - 8 * (j & 3))) & 0xff);
  }
  return out;
}
function tagOf(w: Uint32Array, h: Uint32Array, j0: Uint32Array, aad: Uint8Array, ct: Uint8Array): Uint8Array {
  const s = ghash(h, aad, ct);
  const e = new Uint32Array(j0);
  encryptBlock(w, e);
  const t = new Uint8Array(16);
  for (let i = 0; i < 4; i++) { const v = (s[i] ^ e[i]) >>> 0; t[4 * i] = v >>> 24; t[4 * i + 1] = (v >>> 16) & 0xff; t[4 * i + 2] = (v >>> 8) & 0xff; t[4 * i + 3] = v & 0xff; }
  return t;
}

/** Seal: the ciphertext with its 16-byte tag appended, as WebCrypto's AES-GCM writes it. */
export function gcmSeal(key: Uint8Array, iv: Uint8Array, plain: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Uint8Array {
  const { w, h, j0 } = setup(key, iv);
  const ct = ctr(w, j0, plain);
  const out = new Uint8Array(ct.length + 16);
  out.set(ct);
  out.set(tagOf(w, h, j0, aad, ct), ct.length);
  return out;
}

export class GcmOpenError extends Error {
  constructor() {
    super('the sealed data does not open under this key: it was changed, moved to another record, or sealed under another key');
    this.name = 'GcmOpenError';
  }
}

/** Open: the plaintext, or `GcmOpenError` when the tag does not match (nothing is returned of a forged or damaged value). */
export function gcmOpen(key: Uint8Array, iv: Uint8Array, sealed: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (sealed.length < 16) throw new GcmOpenError();
  const { w, h, j0 } = setup(key, iv);
  const ct = sealed.subarray(0, sealed.length - 16);
  const want = tagOf(w, h, j0, aad, ct);
  let d = 0;
  for (let i = 0; i < 16; i++) d |= want[i] ^ sealed[ct.length + i];
  if (d !== 0) throw new GcmOpenError();
  return ctr(w, j0, ct);
}
