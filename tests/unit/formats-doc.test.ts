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
import { MAX_NEW_VAULTS_PER_DAY, MAX_IP_BYTES_PER_DAY, MAX_BYTES, RATE } from '$lib/server/sync';
import { MAX_AHEAD_MS, hlcEncode } from '$core/hlc';
import { BUCKETS } from '$core/bucket';
import { B32 } from '$lib/sync/crypto';
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
  writer: says(/the (\d+)-character id of the device that made the change followed by a (\d+)-character tag/),
  idBytes: says(/take the (first|last) (\d+) bytes of the digest and map each byte b to ALPHABET\[b mod (\d+)\]/),
  excluded: says(/an alphabet without ([A-Z0-9, ]+?) or ([A-Z0-9]), in six groups of five/),
  ikm: says(/the UTF-8 bytes of that 30-character string, (not a decoding) of it/),
  photoOrder: says(/a reader should try the (named|plain) form first/),
  endian: says(/A photo decrypts to a 4-byte (big|little)-endian length, the full JPEG, then the thumbnail/),
  tag: Number(says(/\(a (\d+)-bit tag, appended as WebCrypto does\)/)[1]),
  nameHour: says(/the hour \(in ms, padded to 13 digits\) of the batch's (first|last) change/)[1],
  nameDevice: Number(says(/the pushing device's (\d+)-character id/)[1]),
  hold: says(/only up to (\w+) minutes ahead of its own/)[1],
  counter: says(/a (hex|decimal) counter of four digits/)[1],
  idBase: Number(says(/wall time as exactly (\d+) base-(\d+) digits/)[2]),
  idTimeDigits: Number(says(/wall time as exactly (\d+) base-(\d+) digits/)[1]),
  refused: says(/Different bytes under a held name without that match are refused \((\d+)\)/)[1],
  full: says(/a vault with no room left \((\d+) GB\) is (\d+) with/),
  buckets: Number(says(/into one of (\d+) buckets of roughly/)[1]),
  example: says(/"t": "(\d{13})-([0-9a-f]{4})-([a-z0-9]+)", "kind": "accession", "id": "([a-z0-9]+)"/)
};
const numberWords: Record<string, number> = { five: 5, twelve: 12 };

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
  const bytes = doc.idBytes[1] === 'first' ? digest.slice(0, Number(doc.idBytes[2])) : digest.slice(-Number(doc.idBytes[2]));
  expect(Number(doc.idBytes[2])).toBe(doc.idLen);
  let id = '';
  for (const b of bytes) id += doc.alphabet[b % Number(doc.idBytes[3])];
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
    const forms = doc.photoOrder[1] === 'named' ? [fill(doc.aadPhoto, d, 'photo', 'p1'), fill(doc.aadOldPhoto, d, 'photo')] : [fill(doc.aadOldPhoto, d, 'photo'), fill(doc.aadPhoto, d, 'photo', 'p1')];
    const got = await openFromTheDoc(d, forms[0], named); // the first form the page names must open a current photograph
    expect(got.length).toBe(packed.length);
    const len = new DataView(got.buffer, got.byteOffset).getUint32(0, doc.endian[1] === 'little');
    expect(len).toBe(full.length); // read the way the page says, the length is the JPEG's
    expect(doc.tag).toBe(128);
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
    expect(numberWords[doc.fpDigits] ?? Number(doc.fpDigits)).toBe(12);
    expect(doc.hourDigits).toBe(13);
    expect(Number(doc.writer[1])).toBe(12); // the device id
    expect(Number(doc.writer[2])).toBe(4); // the tab tag
    expect(doc.nameHour).toBe('last');
    expect(doc.nameDevice).toBe(12);
    // a real batch name from the engine's rule, checked against the page's layout
    const lastWall = 1789520000000 + 5 * 60_000;
    const name = `${String(Math.floor(lastWall / 3600_000) * 3600_000).padStart(13, '0')}-0000-abcdefghijkl-${mine.slice(0, 12)}`;
    expect(name).toMatch(new RegExp(`^\\d{${doc.hourDigits}}-0000-[a-z0-9]{${doc.nameDevice}}-[0-9a-f]{12}$`));
    expect(Number(name.split('-')[0]) % 3600_000).toBe(0);
    // the clock: a hex counter, and a peer's clock followed only five minutes ahead
    expect(doc.counter).toBe('hex');
    expect((numberWords[doc.hold] ?? Number(doc.hold)) * 60_000).toBe(MAX_AHEAD_MS);
    expect(hlcEncode({ wall: 1789520000000, count: 1, device: doc.example[3] })).toBe(`${doc.example[1]}-${doc.example[2]}-${doc.example[3]}`);
    expect(doc.example[3].length).toBe(16); // the example change's writer is app-shaped
    expect(doc.example[4].slice(1, 1 + doc.idTimeDigits)).toBe(parseInt(doc.example[1], 10).toString(doc.idBase)); // and its id carries the same time, as the page's id rule says
  });
  it('the limits and the id prefixes on the page are the code\'s', () => {
    expect(Number(doc.limits[1])).toBe(MAX_NEW_VAULTS_PER_DAY);
    expect(Number(doc.limits[2]) * 1024 * 1024 * 1024).toBe(MAX_IP_BYTES_PER_DAY);
    expect(Number(doc.limits[3])).toBe(RATE.sync.limit);
    expect(Number(doc.limits[4].replace(/,/g, ''))).toBe(RATE.syncobj.limit);
    expect(doc.ids.slice(1, 6)).toEqual(['r', 's', 'l', 'p', 'e']);
    expect(doc.idBase).toBe(36);
    expect(doc.idTimeDigits).toBe(8);
    expect(doc.refused).toBe('409');
    expect(Number(doc.full[1]) * 1024 * 1024 * 1024).toBe(MAX_BYTES);
    expect(doc.full[2]).toBe('507');
    expect(doc.buckets).toBe(BUCKETS);
    expect(doc.ikm[1]).toBe('not a decoding');
    // the key alphabet the page describes by exclusion is the code's
    const excluded = [...doc.excluded[1].split(/,\s*/), doc.excluded[2]];
    const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter((c) => !excluded.includes(c)).join('');
    expect(alphabet).toBe(B32);
    expect(doc.alphabet).toBe(B32);
  });
});
