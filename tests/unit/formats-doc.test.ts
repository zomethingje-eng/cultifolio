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
import { B32, parseVaultKey } from '$lib/sync/crypto';
import { Manifest, LegacyChanges, photoPath, thumbPath, backupName, EXT } from '$lib/backup/format';
import { PUSH_HEADERS, batchName, listAfter, BATCH_NAME, logBatch, STATUS } from '$lib/sync/limits';
import { buildBackup } from '$lib/backup/backup';
import { unzipSync } from 'fflate';
import { KINDS, RESERVED_FIELDS } from '$core/log';
import { EVENT_LABEL } from '$lib/db/types';
import { BUCKETS, PER_BUCKET, bucketOf } from '$core/bucket';
import { VaultFull, parseAfter, BEARER, listBatches, batchKey, photoKey } from '$lib/server/sync';
import * as photoRoute from '../../src/routes/api/sync/photo/[id]/+server';
import * as logRoute from '../../src/routes/api/sync/log/+server';
import { apply } from '$core/log';
import { madeOn } from '$core/dates';
import { existsSync } from 'node:fs';
import { THUMB_EDGE, FULL_EDGE } from '$lib/photo/process';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const markup = readFileSync(new URL('../../src/routes/about/formats/+page.svelte', import.meta.url), 'utf8');
/** The field names the page lists for one record kind: every <code> after "<b>kind</b>:" up to the next bold kind. */
const pageFields = (kind: string): string[] => {
  const m = new RegExp(`<b>${kind}</b>[^:]*:([\\s\\S]*?)(?=<b>|</p>)`).exec(markup);
  if (!m) throw new Error(`/about/formats lists no fields for ${kind}`);
  return [...m[1].matchAll(/<code>([A-Za-z_]+)<\/code>/g)].map((x) => x[1]);
};
/** The record interfaces as `src/lib/db/types.ts` declares them: the field names, `id` aside, which the page describes once for every kind. */
const types = readFileSync(new URL('../../src/lib/db/types.ts', import.meta.url), 'utf8');
const codeFields = (name: string): string[] => {
  const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(types);
  if (!m) throw new Error(`no interface ${name}`);
  return [...m[1].matchAll(/^\s{2}(?:readonly )?([A-Za-z_]+)\??:/gm)].map((x) => x[1]).filter((f) => f !== 'id');
};
const namesSrc = readFileSync(new URL('../../src/lib/core/names.ts', import.meta.url), 'utf8');
const codeUnion = (name: string, src = types): string[] => {
  const m = new RegExp(`export type ${name} = ([^;]+);`).exec(src);
  if (!m) throw new Error(`no type ${name}`);
  return [...m[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]);
};
/** The fields of an interface in another source file (device.json's shape, the listing's reply). */
const fieldsIn = (file: string, name: string): string[] => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(src);
  if (!m) throw new Error(`no interface ${name} in ${file}`);
  return [...m[1].matchAll(/^\s{2}(?:readonly )?([A-Za-z_]+)\??:/gm)].map((x) => x[1]);
};
/** The page as a reader sees it: the Svelte markup with tags removed and entities decoded. */
const page = markup
  .replace(/<script[\s\S]*?<\/script>/, '')
  .replace(/\{`([^`]*)`\}/g, (_, t: string) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;')) // a Svelte template literal, as the page renders it: its angle brackets are text, not tags
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
  aadBatch: says(/A log batch's data likewise carries its name on the server \((\S+), the name without/),
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
  buckets: Number(says(/buckets of roughly three hundred species \((\d+) at the catalogue's present size/)[1]),
  perBucket: Number(says(/never past a few hundred species a bucket/) ? 320 : 0),
  example: says(/"t": "(\d{13})-([0-9a-f]{4})-([a-z0-9]+)", "kind": "accession", "id": "([a-z0-9]+)"/),
  nameLayout: says(/stored at vault\/<id>\/log\/(<hour>-0000-<device>-<fingerprint>)\.bin/)[1],
  storedAt: says(/stored at (vault\/<id>\/log\/<hour>-0000-<device>-<fingerprint>\.bin)/)[1],
  photoAt: says(/at (vault\/<vaultId>\/photo\/<photoId>\.bin)/)[1],
  endpoints: says(/The endpoints: POST (\/api\/sync\/vault) \{ id, token, create \}; GET (\/api\/sync\/log)\?vault=&since=<ms>.*?POST (\/api\/sync\/log)\?vault= with headers (X-Batch), (X-Batch-Plain), (X-Device); GET (\/api\/sync\/log)\/<hour>-0000-<device>-<fingerprint>\?vault=.*?(PUT\|GET\|HEAD\|DELETE) (\/api\/sync\/photo)\/<id>\?vault=/),
  manifestKeys: says(/manifest\.json \{ (format): "cultifolio-backup", (v): 1, (exported): [^,]*, (device), (app), (counts): \{ ([a-zA-Z, ]+) \}, (photosMissing): [^\]]*\], (scheme) \}/),
  tooBig: says(/A body larger than the limit is (\d+)/)[1],
  rateLimited: says(/past any of these the answer is (\d+) with Retry-After/)[1],
  ceilings: says(/past either the answer to a creation is (\d+) with a sentence/)[1],
  pairing: says(/and the (cultifolio:\/\/vault\?k=) prefix of the pairing link/)[1],
  writerTotal: Number(says(/(\d+) characters in all/)[1]),
  idRead: Number(says(/the app reads the time as the (\d+) characters after the prefix/)[1]),
  kinds: says(/kind is one of ([a-z, ]+?) \(what the app calls a propagation batch/)[1].split(/,\s*/).concat(says(/is a place\), ([a-z, ]+)\. A delete/)[1].split(/,\s*/)),
  reserved: says(/The fields (\w+), (\w+) and (\w+) belong to the record and cannot be set by a change \(nor can the names (\S+) and (\S+)\)/),
  eventTypes: says(/t \(([a-z, ]+)\), and as the type needs/)[1].split(/,\s*/),
  backupFile: says(/(cultifolio-YYYY-MM-DD\.cultifolio\.zip), an ordinary zip/)[1],
  backupPaths: says(/(photos\/<id>\.jpg) full-size JPEG, long edge (\d+) px (photos\/<id>\.t\.jpg) (\d+) px thumbnail (plants\.csv) one row per plant[^)]*\) (batches\.csv) one row per propagation batch[^)]*\) (events\.csv) one row per timeline entry[^)]*\) (device\.json) the exporting device's settings \{ (site): \{ lat, lon, name\? \} \(as entered, not rounded\), (units), (labels), (prefs) \}/),
  legacy: says(/older changes-only JSON export \(\{ "format": "(cultifolio-changes)", "v": (\d), "changes": \[\.\.\.\] \}\)/),
  listReply: says(/returns \{ batches: \[\{ (key), (at) \}\], (more), (next)\?: \{ at, key \} \}; the next page is &(after)=<at>:<key>/),
  bearer: says(/All but creation take (Authorization): (Bearer) <token>/),
  fullBody: says(/is 507 with \{ error: "(vault full)", (bytes), (limit) \}/),
  refusalFields: says(/is JSON with an (\w+); one the framework makes [^)]*\) is JSON with a (\w+), and a fetch of a batch or photograph that is not there is a plain-text (\d+)/),
  hash: says(/the species slug is hashed \((FNV-1a)\) into one of a number of buckets of roughly three hundred species \((\d+) at the catalogue's present size/),
  bucketRoutes: says(/the device asks (\/api\/sheets)\?b= or (\/api\/entries)\?b= for the buckets/),
  corpusRoute: says(/carries the corpus id from (\/api\/corpus)\)/)[1],
  dossierRoute: says(/served at (\/api\/dossier)\/<gbifKey>/)[1],
  provenance: says(/provenance \(([a-z0-9, ]+)\), status \(([a-z, ]+)\)/),
  nameKinds: says(/nameKind \(([a-z, ]+) or ([a-z]+)\)/),
  batchShape: says(/A log batch decrypts to \{ "v": (\d), "device": "\.\.\.", "changes": \[\.\.\.\] \}/),
  mergeRule: says(/keeping for each record and field the value with the (greatest|smallest) t/)[1],
  changesFile: says(/(changes\.json)\s+a JSON array of changes/)[1],
  dFrom: says(/dFrom \(([a-z]+) or ([a-z]+)\)/)
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
    // A batch sealed under its name, as the app seals them since round thirty-eight, opens under the page's named form.
    expect(doc.aadBatch[1]).toBe('vaultId|log|batchName');
    const named = await sealJson(app, 'log', { v: 1, device: 'abc', changes: [] }, '1700000000000-0000-abc-0123456789ab');
    const aad = doc.aadBatch[1].replace('vaultId', d.id).replace('batchName', '1700000000000-0000-abc-0123456789ab');
    expect(JSON.parse(new TextDecoder().decode(await openFromTheDoc(d, aad, named)))).toMatchObject({ v: 1 });
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
    // a batch name by the engine's rule, laid out as the page's template says: <hour>-0000-<device>-<fingerprint>
    const lastWall = 1789520000000 + 5 * 60_000;
    const parts = { hour: String(Math.floor(lastWall / 3600_000) * 3600_000).padStart(doc.hourDigits, '0'), device: 'abcdefabcdef', fingerprint: mine.slice(0, 12) };
    const name = doc.nameLayout.replace(/<(\w+)>/g, (_, k: string) => parts[k as keyof typeof parts]);
    expect(name).toBe(batchName(lastWall, parts.device, mine)); // the layout on the page is the one the engine writes (round twenty-three, 10: through the engine's own function)
    expect(batchName(Number(parts.hour) + 3599_999, parts.device, mine)).toBe(name); // any millisecond of the hour names the same batch
    expect(name).toMatch(new RegExp(`^\\d{${doc.hourDigits}}-0000-[a-z0-9]{${doc.nameDevice}}-[0-9a-f]{12}$`));
    expect(Number(name.split('-')[0]) % 3600_000).toBe(0);
    // the clock: a hex counter, and a peer's clock followed only five minutes ahead
    expect(doc.counter).toBe('hex');
    expect((numberWords[doc.hold] ?? Number(doc.hold)) * 60_000).toBe(MAX_AHEAD_MS);
    expect(hlcEncode({ wall: 1789520000000, count: 1, device: doc.example[3] })).toBe(`${doc.example[1]}-${doc.example[2]}-${doc.example[3]}`);
    expect(doc.example[3].length).toBe(doc.writerTotal); // the example change's writer is app-shaped
    expect(doc.writerTotal).toBe(16);
    expect(doc.example[3].slice(0, 12)).toMatch(/^[0-9a-f]{12}$/); // twelve hex digits of device id, as the app mints them
    expect(doc.idRead).toBe(8);
    const when = new Date(Number(doc.example[1]));
    expect(madeOn(doc.example[4])).toBe(`${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`); // the app reads the example id's time (the local day, as madeOn reports it)
    expect(parseInt(doc.example[4].slice(1, 1 + doc.idRead), 36)).toBe(Number(doc.example[1]));
    // the pairing-link prefix the page names is the one the parser strips
    expect(parseVaultKey(doc.pairing + newVaultKey().toLowerCase())).not.toBeNull();
    expect(parseVaultKey('cultifolio://vault?key=' + newVaultKey())).toBeNull();
    expect(doc.example[4].slice(1, 1 + doc.idTimeDigits)).toBe(parseInt(doc.example[1], 10).toString(doc.idBase)); // and its id carries the same time, as the page's id rule says
  });
  it('the limits and the id prefixes on the page are the code\'s', async () => {
    expect(Number(doc.limits[1])).toBe(MAX_NEW_VAULTS_PER_DAY);
    expect(Number(doc.limits[2]) * 1024 * 1024 * 1024).toBe(MAX_IP_BYTES_PER_DAY);
    expect(Number(doc.limits[3])).toBe(RATE.sync.limit);
    expect(Number(doc.limits[4].replace(/,/g, ''))).toBe(RATE.syncobj.limit);
    expect(doc.ids.slice(1, 6)).toEqual(['r', 's', 'l', 'p', 'e']);
    expect(doc.idBase).toBe(36);
    expect(doc.idTimeDigits).toBe(8);
    expect(Number(doc.refused)).toBe(STATUS.differentContent);
    expect(Number(doc.full[1]) * 1024 * 1024 * 1024).toBe(MAX_BYTES);
    expect(Number(doc.full[2])).toBe(STATUS.full);
    expect(doc.buckets).toBe(BUCKETS); // the count at the present size; the rule that scales it is bucketsFor (round fifty-three, 2)
    expect(doc.perBucket).toBe(PER_BUCKET);
    expect(Number(doc.tooBig)).toBe(STATUS.tooBig);
    expect(Number(doc.rateLimited)).toBe(STATUS.rateLimited);
    expect(Number(doc.ceilings)).toBe(STATUS.ceilings);
    // every endpoint the page names is a route file, and the batch route takes the methods named
    const e = doc.endpoints;
    for (const [path, file] of [[e[1], 'vault/+server.ts'], [e[2], 'log/+server.ts'], [e[7], 'log/[key]/+server.ts'], [e[9], 'photo/[id]/+server.ts']] as const) expect(existsSync(new URL(`../../src/routes/api/sync/${file}`, import.meta.url)), path).toBe(true);
    expect([e[4], e[5], e[6]].map((h) => h.toLowerCase())).toEqual([PUSH_HEADERS.batch, PUSH_HEADERS.plain, PUSH_HEADERS.device]);
    expect(e[8].split('|').sort()).toEqual(Object.keys(photoRoute).filter((k) => /^[A-Z]+$/.test(k)).sort()); // the methods the page names are the ones the route module exports
    expect(Object.keys(logRoute).filter((k) => /^[A-Z]+$/.test(k)).sort()).toEqual(['GET', 'POST']);
    for (const route of [doc.bucketRoutes[1], doc.bucketRoutes[2], doc.corpusRoute, doc.dossierRoute]) expect(existsSync(new URL(`../../src/routes${route}`, import.meta.url)), route).toBe(true);
    // the listing reply and its paging parameter, as the server parses it from what the device sends
    expect([doc.listReply[1], doc.listReply[2]].sort()).toEqual(fieldsIn('../../src/lib/server/sync.ts', 'BatchRef').sort()); // the entries' fields are BatchRef's
    expect([doc.listReply[3], doc.listReply[4]].sort()).toEqual([...(/Promise<\{ batches: BatchRef\[\]; (\w+): boolean; (\w+)\?: After \}>/.exec(readFileSync(new URL('../../src/lib/server/sync.ts', import.meta.url), 'utf8')) ?? []).slice(1, 3)].sort()); // and the reply's other two are listBatches's
    expect(typeof listBatches).toBe('function');
    expect(parseAfter(listAfter(1789520000000, 'k'))).toEqual({ at: 1789520000000, key: 'k' });
    expect(BEARER.test(`${doc.bearer[2]} ${'a'.repeat(64)}`)).toBe(true); // the scheme the page names is the one the Worker parses
    // the 507 body the page prints is the one the class sends
    const full = new VaultFull(1, 2).response();
    expect(full.status).toBe(507);
    expect(await full.json()).toEqual({ error: doc.fullBody[1], [doc.fullBody[2]]: 1, [doc.fullBody[3]]: 2 }); // the body the class sends is the page's, word and keys (round twenty-four, 7; round twenty-six, 12)
    // the batch's plaintext shape is the engine's, and its name passes the Worker's own pattern
    expect(Object.keys(logBatch('abc', []))).toEqual(['v', 'device', 'changes']);
    expect(logBatch('abc', []).v).toBe(Number(doc.batchShape[1]));
    expect(BATCH_NAME.test(batchName(1789520000000, 'abcdefabcdef', 'f'.repeat(64)))).toBe(true);
    expect(BATCH_NAME.test('1789520000000-0000-abcdefabcdef-' + 'f'.repeat(11))).toBe(false);
    // the record fields, by kind, are the interfaces' (round twenty-four, 7): nothing on the page the code lacks, nothing in the code the page leaves out
    for (const [kind, name] of [['accession', 'Accession'], ['event', 'PlantEvent'], ['photo', 'Photo'], ['location', 'Location'], ['sowing', 'Sowing'], ['taxon', 'Taxon']] as const) expect([...new Set(pageFields(kind))].sort(), kind).toEqual(codeFields(name).sort());
    expect(doc.provenance[1].split(/,\s*/)).toEqual(codeUnion('Provenance'));
    expect(doc.provenance[2].split(/,\s*/)).toEqual(codeUnion('AccStatus'));
    expect([...doc.nameKinds[1].split(/,\s*/), doc.nameKinds[2]]).toEqual(codeUnion('NameKind', namesSrc));
    expect([doc.dFrom[1], doc.dFrom[2]]).toEqual(codeUnion('PhotoDateFrom'));
    // the merge rule the page states is the one the fold applies: of two values for one field, the greater stamp wins whatever order they arrive in
    expect(doc.mergeRule).toBe('greatest');
    const st1 = new Map(), st2 = new Map();
    const c1 = { t: '1789520000000-0000-aaaaaaaaaaaa', kind: 'accession' as const, id: 'r1', field: 'notes', value: 'early' };
    const c2 = { t: '1789520000001-0000-aaaaaaaaaaaa', kind: 'accession' as const, id: 'r1', field: 'notes', value: 'late' };
    apply(st1, [c1, c2]); apply(st2, [c2, c1]);
    expect(st1.get('accession:r1')!.notes).toBe('late');
    expect(st2.get('accession:r1')!.notes).toBe('late');
    expect(doc.refusalFields.slice(1, 4)).toEqual(['error', 'message', '404']); // json() routes say `error`, SvelteKit's error() says `message`
    // the hash the page names is the one the bucket function computes
    expect(Number(doc.hash[2])).toBe(BUCKETS);
    const fnv1a = (s: string) => { let h = 0x811c9dc5; for (const c of enc.encode(s)) { h ^= c; h = Math.imul(h, 16777619) >>> 0; } return h; };
    expect(bucketOf('lithops-lesliei')).toBe((fnv1a('lithops-lesliei') & (BUCKETS - 1)).toString(16).padStart(2, '0'));
    // the manifest keys the page lists are the schema's, and the counts it lists are the summary's
    const m = doc.manifestKeys;
    const schemaKeys = Object.keys(Manifest.entries);
    expect([m[1], m[2], m[3], m[4], m[5], m[6], m[8], m[9]].sort()).toEqual(schemaKeys.sort()); // both ways: a key added to the schema must be on the page
    expect(m[7].split(/,\s*/).sort()).toEqual(['accessions', 'changes', 'events', 'locations', 'photoBytes', 'photos', 'sowings', 'taxa']);
    // the record kinds, the reserved names and the event types the page lists are the code's, no more and no fewer
    expect([...doc.kinds].sort()).toEqual([...KINDS].sort());
    expect(new Set(doc.reserved.slice(1, 6))).toEqual(RESERVED_FIELDS);
    expect([...doc.eventTypes].sort()).toEqual(Object.keys(EVENT_LABEL).sort());
    // the backup's file names are the ones the writer uses
    expect(doc.backupFile).toBe(backupName(new Date(2026, 0, 2)).replace('2026-01-02', 'YYYY-MM-DD'));
    expect(doc.backupFile.endsWith(EXT)).toBe(true);
    expect(doc.backupPaths[1].replace('<id>', 'p1')).toBe(photoPath('p1'));
    expect(Number(doc.backupPaths[2])).toBe(FULL_EDGE);
    expect(doc.backupPaths[3].replace('<id>', 'p1')).toBe(thumbPath('p1'));
    expect(Number(doc.backupPaths[4])).toBe(THUMB_EDGE);
    expect(doc.backupPaths.slice(9, 13).sort()).toEqual(fieldsIn('../../src/lib/backup/backup.ts', 'DeviceSettings').sort()); // device.json's keys are the interface's
    // the zip's entries are the ones the page lists, read back from a file the writer built (round twenty-six, 12)
    const built = await buildBackup({ changes: [{ t: '1789520000000-0000-abcdefabcdef0000', kind: 'photo', id: 'p1', field: 'd', value: '2026-01-02' }, { t: '1789520000001-0000-abcdefabcdef0000', kind: 'photo', id: 'p1', field: 'acc', value: 'r1' }, { t: '1789520000002-0000-abcdefabcdef0000', kind: 'photo', id: 'p1', field: 'w', value: 1 }, { t: '1789520000003-0000-abcdefabcdef0000', kind: 'photo', id: 'p1', field: 'h', value: 1 }, { t: '1789520000004-0000-abcdefabcdef0000', kind: 'photo', id: 'p1', field: 'bytes', value: 3 }], settings: { units: 'metric' }, readPhoto: async (id) => ({ id, full: new Uint8Array([0xff, 0xd8, 1]), thumb: new Uint8Array([0xff, 0xd8, 2]) }) });
    const entries = Object.keys(unzipSync(built.bytes)).sort();
    const expected = ['manifest.json', doc.changesFile, doc.backupPaths[1].replace('<id>', 'p1'), doc.backupPaths[3].replace('<id>', 'p1'), doc.backupPaths[5], doc.backupPaths[6], doc.backupPaths[7], doc.backupPaths[8]].sort();
    expect(entries).toEqual(expected);
    // the object keys the page names are the ones the Worker stores under
    expect(batchKey('V', '1789520000000-0000-abcdefabcdef-ffffffffffff')).toBe(doc.storedAt.replace('<id>', 'V').replace('<hour>-0000-<device>-<fingerprint>', '1789520000000-0000-abcdefabcdef-ffffffffffff'));
    expect(photoKey('V', 'p1234567')).toBe(doc.photoAt.replace('<vaultId>', 'V').replace('<photoId>', 'p1234567'));
    expect(LegacyChanges.entries.format.literal).toBe(doc.legacy[1]);
    expect(Number(doc.legacy[2])).toBe(1);
    // the key alphabet the page describes by exclusion is the code's
    const excluded = [...doc.excluded[1].split(/,\s*/), doc.excluded[2]];
    const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter((c) => !excluded.includes(c)).join('');
    expect(alphabet).toBe(B32);
    expect(doc.alphabet).toBe(B32);
  });
});

describe('the log refuses the words the types do not know (round twenty-nine, 13)', () => {
  it('FIELD_ENUMS is the unions in db/types.ts and core/names.ts, and FIELD_TYPES names every field of every interface', async () => {
    const { FIELD_ENUMS, FIELD_TYPES } = await import('$core/log');
    expect(FIELD_ENUMS.accession!.status).toEqual(codeUnion('AccStatus'));
    expect(FIELD_ENUMS.accession!.provenance).toEqual(codeUnion('Provenance'));
    expect(FIELD_ENUMS.sowing!.provenance).toEqual(codeUnion('Provenance'));
    expect(FIELD_ENUMS.accession!.nameKind).toEqual(codeUnion('NameKind', namesSrc));
    expect(FIELD_ENUMS.sowing!.nameKind).toEqual(codeUnion('NameKind', namesSrc));
    expect(FIELD_ENUMS.sowing!.status).toEqual(codeUnion('SowingStatus'));
    expect(FIELD_ENUMS.sowing!.method).toEqual(codeUnion('PropMethod'));
    expect(FIELD_ENUMS.photo!.dFrom).toEqual(codeUnion('PhotoDateFrom'));
    expect(FIELD_ENUMS.location!.type).toEqual(codeUnion('LocationKind'));
    for (const [kind, iface] of [['accession', 'Accession'], ['sowing', 'Sowing'], ['location', 'Location'], ['event', 'PlantEvent'], ['photo', 'Photo'], ['taxon', 'Taxon']] as const) expect(Object.keys(FIELD_TYPES[kind]).sort()).toEqual(codeFields(iface).sort());
  });
});
