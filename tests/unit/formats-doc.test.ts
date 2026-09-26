/**
 * "Read your data without the app": a decoder written from /about/formats alone, not from the code, must open a batch
 * (round eighteen, 1). This test derives the keys exactly as the page describes them, with WebCrypto and nothing from
 * src/lib/sync/crypto.ts, and opens what the real code sealed. If the page and the code drift, this fails.
 */
import { describe, it, expect } from 'vitest';
import { deriveKeys, sealJson, newVaultKey } from '$lib/sync/crypto';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The page, step by step. */
async function fromTheDoc(vaultKey: string) {
  // "the 30 symbols as typed, upper case, with the dashes removed (the UTF-8 bytes of that 30-character string)"
  const ikm = enc.encode(vaultKey.toUpperCase().replace(/-/g, ''));
  expect(ikm.length).toBe(30);
  const root = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const salt = enc.encode('cultifolio-vault-v1');
  const bits = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, root, 256);
  // "three 32-byte keys": enc, auth (sent as 64 hex digits), name
  const encRaw = new Uint8Array(await bits('enc'));
  const token = hex(new Uint8Array(await bits('auth')));
  expect(token.length).toBe(64);
  // "26 symbols made from SHA-256 of the string id: + the token's 64 hex digits: the first 26 bytes, each mapped to ALPHABET[b mod 30]"
  const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('id:' + token)));
  let id = '';
  for (let i = 0; i < 26; i++) id += ALPHABET[digest[i] % 30];
  const aes = await crypto.subtle.importKey('raw', encRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  return { id, token, aes };
}

/** "one version byte (1), a 12-byte IV, then AES-GCM ciphertext … with associated data the UTF-8 bytes of vaultId|kind" */
async function openFromTheDoc(k: { id: string; aes: CryptoKey }, kind: string, blob: Uint8Array): Promise<string> {
  expect(blob[0]).toBe(1);
  const iv = blob.slice(1, 13) as Uint8Array<ArrayBuffer>;
  const ct = blob.slice(13) as Uint8Array<ArrayBuffer>;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${k.id}|${kind}`) }, k.aes, ct);
  return new TextDecoder().decode(plain);
}

describe('/about/formats is enough to decrypt a batch', () => {
  it('derives the same vault id and token as the app, and opens a batch the app sealed', async () => {
    const key = newVaultKey();
    const app = await deriveKeys(key);
    const doc = await fromTheDoc(key);
    expect(doc.id).toBe(app.id);
    expect(doc.token).toBe(app.token);
    const blob = await sealJson(app, 'log', { v: 1, device: 'abc', changes: [{ t: '1789520000000-0000-abcdef', kind: 'accession', id: 'r1', field: 'notes', value: 'sulked all summer' }] });
    const text = await openFromTheDoc(doc, 'log', blob);
    expect(JSON.parse(text)).toMatchObject({ v: 1, device: 'abc' });
  });
  it('a key typed in lower case with spaces derives the same keys as the same key typed cleanly (the page says "as typed, upper case, dashes removed")', async () => {
    const key = newVaultKey();
    const messy = key.toLowerCase().replace(/-/g, ' ');
    expect((await deriveKeys(messy)).id).toBe((await fromTheDoc(key)).id);
  });
});
