/**
 * The vault key and what it protects.
 *
 * One secret, the vault key, is made once on the first device: 30 symbols
 * from a 30-letter alphabet (about 147 bits of randomness, each symbol drawn
 * without bias) written in six groups of five, the shape of a 1Password
 * secret key, so it can be read out, typed, or scanned. From it:
 *
 *   enc   AES-256-GCM key for every batch of changes and every photo
 *   auth  a token the server checks, derived so the server never sees `enc`
 *   id    the vault's name on the server, derived from `auth`
 *
 * The server stores ciphertext under the id and a hash of the token. It cannot
 * read a plant name, and it cannot recover the key for someone who lost it;
 * the local copy and backups are what survive that.
 *
 * WebCrypto only, so the same code runs in the browser, in Node tests and in
 * the Worker (which needs none of the encryption, only the token hash).
 */

const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // 30 symbols: no I, L, O, U, 0, 1 (unambiguous to read out)
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KEY_GROUPS = 6; // 6 × 5 = 30 symbols from a 30-letter alphabet: log2(30^30) ≈ 147 bits

/** A new vault key: "A3KQ7-...-..." Six groups of five from an unambiguous alphabet, each symbol drawn without bias. */
export function newVaultKey(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let s = '';
  while (s.length < KEY_GROUPS * 5) {
    for (const b of random(16)) {
      if (b >= 240) continue; // 240 = 8 × 30: reject the tail so every symbol is equally likely
      s += B32[b % B32.length];
      if (s.length === KEY_GROUPS * 5) break;
    }
  }
  return s.match(/.{5}/g)!.join('-');
}

/** Normalise what a person typed or scanned: case, dashes, spaces, a pairing URL. Null unless it is the right shape. */
export function parseVaultKey(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/^CULTIFOLIO:\/\/VAULT\?K=/, '').replace(/[^A-Z0-9]/g, '');
  if (s.length !== KEY_GROUPS * 5) return null;
  for (const c of s) if (!B32.includes(c)) return null;
  return s.match(/.{5}/g)!.join('-');
}

export interface VaultKeys {
  key: string; // the human form
  id: string; // vault id on the server (26 chars)
  token: string; // bearer for the server (hex)
  enc: CryptoKey; // AES-GCM, non-extractable
}

async function hkdf(root: CryptoKey, info: string, bits: number): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cultifolio-vault-v1'), info: enc.encode(info) }, root, bits);
}

export async function deriveKeys(vaultKey: string): Promise<VaultKeys> {
  const key = parseVaultKey(vaultKey);
  if (!key) throw new Error('That is not a vault key: expected six groups of five letters and digits.');
  // The key is already 147 bits of randomness, so a stretching KDF adds nothing; HKDF splits it into purposes.
  const root = await crypto.subtle.importKey('raw', enc.encode(key.replace(/-/g, '')), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const encKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cultifolio-vault-v1'), info: enc.encode('enc') }, root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const auth = new Uint8Array(await hkdf(root, 'auth', 256));
  const token = hex(auth);
  const id = base32(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('id:' + token)))).slice(0, 26);
  return { key, id, token, enc: encKey };
}

/** What the server keeps: it can check a presented token against this without being able to produce one. */
export async function tokenHash(token: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('token:' + token))));
}

const V = 1;
/**
 * version(1) | iv(12) | ciphertext. Associated data binds the blob to its
 * vault and purpose, so a batch cannot be replayed as a photo or into another
 * vault; with `name` (a photo's id) it is bound to that object too, so the
 * server cannot hand out one photo under another's id.
 */
export async function seal(k: VaultKeys, kind: string, plain: Uint8Array, name?: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(k, kind, name) }, k.enc, plain as BufferSource));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = V;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

const aad = (k: VaultKeys, kind: string, name?: string) => enc.encode(name ? `${k.id}|${kind}|${name}` : `${k.id}|${kind}`);

/** Photos sealed before ids were bound open under the unnamed data; both are tried. */
export async function open(k: VaultKeys, kind: string, blob: Uint8Array, name?: string): Promise<Uint8Array> {
  if (blob.length < 14 || blob[0] !== V) throw new Error('not a sealed blob this version understands');
  for (const ad of name ? [aad(k, kind, name), aad(k, kind)] : [aad(k, kind)]) {
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(1, 13) as BufferSource, additionalData: ad }, k.enc, blob.subarray(13) as BufferSource));
    } catch {
      /* try the next binding */
    }
  }
  throw new Error('could not decrypt: wrong vault key, or the data was altered');
}

export const sha256hex = async (b: Uint8Array) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource)));

export const sealJson = (k: VaultKeys, kind: string, v: unknown) => seal(k, kind, enc.encode(JSON.stringify(v)));
export const openJson = async <T>(k: VaultKeys, kind: string, blob: Uint8Array): Promise<T> => JSON.parse(dec.decode(await open(k, kind, blob))) as T;

/** Pack a photo's two JPEGs into one blob: u32 length of the full image, then both. */
export function packPhoto(full: Uint8Array, thumb: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + full.length + thumb.length);
  new DataView(out.buffer).setUint32(0, full.length);
  out.set(full, 4);
  out.set(thumb, 4 + full.length);
  return out;
}
export function unpackPhoto(b: Uint8Array): { full: Uint8Array; thumb: Uint8Array } {
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0);
  return { full: b.subarray(4, 4 + n), thumb: b.subarray(4 + n) };
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function base32(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += B32[b[i] % B32.length];
  return s;
}

/** The pairing payload a QR code carries. */
export const pairingUrl = (key: string) => `cultifolio://vault?k=${key}`;
