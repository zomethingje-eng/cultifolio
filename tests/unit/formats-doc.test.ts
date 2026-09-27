/**
 * "Read your data without the app": a decoder written from /about/formats alone, not from the code, must open a batch
 * and a photograph (round eighteen, 1). Round twenty, 5: the test reads the page. Every constant the decoder needs (the
 * salt, the HKDF infos, the id alphabet and length, the associated-data shapes, the version byte, the batch name, the
 * limits) is parsed out of `+page.svelte`'s text, so a sentence on the page that no longer matches the code fails here,
 * whichever side moved. The decoding itself uses WebCrypto and nothing from src/lib/sync/crypto.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveKeys, sealJson, seal, newVaultKey, batchFingerprint, packPhoto } from '$lib/sync/crypto';
import { MAX_NEW_VAULTS_PER_DAY, MAX_IP_BYTES_PER_DAY, RATE } from '$lib/server/sync';
import { THUMB_EDGE } from '$lib/photo/process';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** The page as a reader sees it: the Svelte markup with tags removed and entities decoded. */
const page = readFileSync(new URL('../../src/routes/about/formats/+page.svelte', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ');

/** One phrase the page must carry, returned with its captures; the test fails naming the phrase when the page no longer says it. */
function says(re: RegExp): RegExpExecArray {
  const m = re.exec(page);
  if (!m) throw new Error(`/about/formats no longer says: ${re.source}`);
  return m;
}

/** What the page tells a reader, parsed. */
const doc = {
  symbols: Number(says(/One vault key per person: (\d+) symbols/)[1]),
  salt: says(/HKDF-SHA-256 with salt (\S+) derives three 32-byte keys/)[1],
  clean: says(/upper-cased with every character outside A–Z and 0–9 removed \(dashes, spaces, a line break, and the (\S+) prefix/),
  infoEnc: says(/AES-256-GCM key \(info (\w+)\)/)[1],
  infoAuth: says(/auth token \(info (\w+), sent as 64 hex digits/)[1],
  infoName: says(/HMAC-SHA-256 key for naming batches \(info (\w+)\)/)[1],
  idLen: Number(says(/The vault id is (\d+) symbols made from SHA-256 of the string/)[1]),
  idPrefix: says(/SHA-256 of the string (\S+) \+ the token's 64 hex digits/)[1],
  alphabet: says(/where the alphabet is ([A-Z0-9]{30})/)[1],
  version: Number(says(/one version byte \((\d)\)/)[1]),
  ivLen: Number(says(/a (\d+)-byte IV/)[1]),
  aad: says(/associated data the UTF-8 bytes of (\S+), where kind is (\w+) or (\w+)/),
  aadPhoto: says(/a photo's data also carries its id \((\S+)\)/)[1],
  aadOldPhoto: says(/builds before that binding carry (\S+) alone/)[1],
  hourDigits: Number(says(/the hour \(in ms, padded to (\d+) digits\)/)[1]),
  fpDigits: says(/the first (\w+) hex digits of HMAC-SHA-256, under the vault's naming key, of exactly the bytes JavaScript's JSON\.stringify\(changes\) gives/)[1],
  limits: says(/One address \(an IPv4 address, or an IPv6 \/64\) is bounded: (\d+) new vaults and (\d+) GB stored per day, (\d+) requests per ten minutes to open, list and push and ([\d,]+) to fetch or store/),
  photoSize: says(/its full JPEG plus its (\d+)-pixel thumbnail plus (\d+) bytes \(a 4-byte length, the version byte and the IV\) and the (\d+)-byte tag/),
  ids: says(/a kind prefix, (\w) for a plant, (\w) for a batch, (\w) for a place, (\w) for a photograph, (\w) for an event/),
  writer: says(/the (\d+)-character id of the device that made the change followed by a (\d+)-character tag/)
};
const words: Record<string, number> = { twelve: 12 };

/** The page, step by step, with the page's own constants. */
async function fromTheDoc(typed: string) {
  const cleaned = typed.toUpperCase().replace(new RegExp('^' + doc.clean[1].toUpperCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), '').replace(/[^A-Z0-9]/g, '');
  const ikm = enc.encode(cleaned);
  expect(ikm.length).toBe(doc.symbols);
  const root = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const salt = enc.encode(doc.salt);
  const bits = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, root, 256);
  const encRaw = new Uint8Array(await bits(doc.infoEnc));
  const token = hex(new Uint8Array(await bits(doc.infoAuth)));
  expect(token.length).toBe(64);
  const nameRaw = new Uint8Array(await bits(doc.infoName));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(doc.idPrefix + token)));
  let id = '';
  for (let i = 0; i < doc.idLen; i++) id += doc.alphabet[digest[i] % doc.alphabet.length];
  const aes = await crypto.subtle.importKey('raw', encRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const name = await crypto.subtle.importKey('raw', nameRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return { id, token, aes, name };
}

/** The associated-data string as the page writes it (`vaultId|kind`, `vaultId|photo|photoId`), filled in. */
const fill = (shape: string, k: { id: string }, kind: string, photoId?: string) => shape.replace('vaultId', k.id).replace('kind', kind).replace('photoId', photoId ?? '');

async function openFromTheDoc(k: { id: string; aes: CryptoKey }, ad: string, blob: Uint8Array): Promise<Uint8Array> {
  expect(blob[0]).toBe(doc.version);
  const iv = blob.slice(1, 1 + doc.ivLen) as Uint8Array<ArrayBuffer>;
  const ct = blob.slice(1 + doc.ivLen) as Uint8Array<ArrayBuffer>;
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(ad) }, k.aes, ct));
}

describe('/about/formats is enough to decrypt a vault, and says what the code does', () => {
  it('derives the same vault id and token as the app, and opens a batch the app sealed', async () => {
    const key = newVaultKey();
    const app = await deriveKeys(key);
    const d = await fromTheDoc(key);
    expect(d.id).toBe(app.id);
    expect(d.token).toBe(app.token);
    expect(doc.aad[2]).toBe('log');
    const blob = await sealJson(app, 'log', { v: 1, device: 'abc', changes: [{ t: '1789520000000-0000-abcdef', kind: 'accession', id: 'r1', field: 'notes', value: 'sulked all summer' }] });
    const text = new TextDecoder().decode(await openFromTheDoc(d, fill(doc.aad[1], d, 'log'), blob));
    expect(JSON.parse(text)).toMatchObject({ v: 1, device: 'abc' });
  });
  it('a key pasted from the pairing link, in lower case, with spaces and a line break, derives the same keys by the page\'s cleaning rule', async () => {
    const key = newVaultKey();
    const messy = `${doc.clean[1]}${key.toLowerCase().replace(/-/g, ' ')}\n`;
    expect((await fromTheDoc(messy)).id).toBe((await deriveKeys(key)).id);
  });
  it('opens a photograph by the named binding, and one from before the binding by the plain one, as the page says to', async () => {
    const key = newVaultKey();
    const app = await deriveKeys(key);
    const d = await fromTheDoc(key);
    expect(doc.aad[3]).toBe('photo');
    const full = new Uint8Array(3000).fill(1), thumb = new Uint8Array(300).fill(2);
    const packed = packPhoto(full, thumb);
    const named = await seal(app, 'photo', packed, 'p1');
    const plain = await seal(app, 'photo', packed); // an older build's photograph
    const got = await openFromTheDoc(d, fill(doc.aadPhoto, d, 'photo', 'p1'), named);
    expect(got.length).toBe(packed.length);
    await expect(openFromTheDoc(d, fill(doc.aadPhoto, d, 'photo', 'p1'), plain)).rejects.toThrow();
    expect((await openFromTheDoc(d, fill(doc.aadOldPhoto, d, 'photo'), plain)).length).toBe(packed.length);
    // "its full JPEG plus its thumbnail plus 17 bytes and the 16-byte tag"
    expect(Number(doc.photoSize[1])).toBe(THUMB_EDGE);
    expect(named.length).toBe(full.length + thumb.length + Number(doc.photoSize[2]) + Number(doc.photoSize[3]));
    expect(Number(doc.photoSize[2])).toBe(4 + 1 + doc.ivLen);
  });
  it('the batch name: the padded hour, the device, and the keyed fingerprint of exactly JSON.stringify(changes)', async () => {
    const key = newVaultKey();
    const app = await deriveKeys(key);
    const d = await fromTheDoc(key);
    const changes = [{ t: '1789520000000-0000-abcdefghijkl0az9', kind: 'accession', id: 'r1', field: 'notes', value: 'x' }];
    const mine = hex(new Uint8Array(await crypto.subtle.sign('HMAC', d.name, enc.encode(JSON.stringify(changes)))));
    expect(mine).toBe(await batchFingerprint(app, enc.encode(JSON.stringify(changes))));
    expect(words[doc.fpDigits] ?? Number(doc.fpDigits)).toBe(12);
    expect(doc.hourDigits).toBe(13);
    expect(Number(doc.writer[1]) + Number(doc.writer[2])).toBe(16); // the HLC's writer field
  });
  it('the limits and the id prefixes on the page are the code\'s', () => {
    expect(Number(doc.limits[1])).toBe(MAX_NEW_VAULTS_PER_DAY);
    expect(Number(doc.limits[2]) * 1024 * 1024 * 1024).toBe(MAX_IP_BYTES_PER_DAY);
    expect(Number(doc.limits[3])).toBe(RATE.sync.limit);
    expect(Number(doc.limits[4].replace(/,/g, ''))).toBe(RATE.syncobj.limit);
    expect(doc.ids.slice(1, 6)).toEqual(['r', 's', 'l', 'p', 'e']);
  });
});
