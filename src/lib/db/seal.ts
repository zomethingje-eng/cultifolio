/**
 * The collection encrypted on the device (round ninety-nine; docs/REVIEW-ROUND-99.md). The data key in memory, its two wraps
 * (under the passcode, under each sync key), the codec the vault reads and writes through, the gate that holds every
 * vault read until the key is there, and the hand-over of the key to a reloaded tab.
 *
 * A record is sealed or plain, and every read takes either (D4): a vault part-way through being sealed or unsealed is
 * a whole vault. What is sealed (D2): a change's `value`, bound to its stamp, kind, id and field; a photograph's and its
 * thumbnail's bytes, bound to its id; the meta records in `SEALED_META`, bound to their key; the fold snapshot's records.
 *
 * The synchronous codec (`…Sync`) is for inside the vault's transactions (D3); the asynchronous one, WebCrypto, for
 * everywhere else. Both write the same bytes' format: a version byte (1), the 12-byte IV, the ciphertext with its tag.
 */
import { gcmSeal, gcmOpen } from '$lib/crypto/aes-gcm';
import type { Change } from '$core/log';

/** The meta record that holds the wraps (plain: it holds nothing that opens without the passcode or a sync key). */
export const SEAL_META = 'seal';
/** Set while the vault is being sealed or unsealed record by record; the next unlock carries on (D4). */
export const SEALING_META = 'sealing';
/** The meta records sealed with the rest: the sync record holds the sync key. */
export const SEALED_META = new Set(['sync']);
/** PBKDF2's rounds for the passcode's wrap: the lock's own (lock.svelte.ts, `ROUNDS`). */
export const WRAP_ROUNDS = 600_000;
/** The shortest passcode the collection is encrypted under (D8). */
export const SEAL_PASS_MIN = 8;

export interface SealRecord {
  v: 1;
  /** The data key under the passcode: PBKDF2-SHA-256's salt and rounds, and the sealed key (IV and ciphertext). */
  pass: { salt: string; rounds: number; x: string };
  /** The data key under each sync key this device synced with: HKDF-SHA-256's salt, and the sealed key. */
  keys: Array<{ salt: string; x: string }>;
}
export interface Sealing { to: 'on' | 'off' }

const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const VERSION = 1;

/* ---- the key in memory ---- */
let raw: Uint8Array | null = null;
let webKey: CryptoKey | null = null;
let waiters: Array<() => void> = [];

export const haveKey = (): boolean => raw !== null;
/** The key as bytes, for the hand-over to another tab of this app; null when this tab has none. */
export const keyBytes = (): Uint8Array | null => (raw ? raw.slice() : null);
export async function setKey(k: Uint8Array): Promise<void> {
  if (k.length !== 32) throw new Error('the data key is 32 bytes');
  webKey = await crypto.subtle.importKey('raw', k as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw = k.slice();
  const w = waiters;
  waiters = [];
  for (const f of w) f();
}
/** Forget the key in this tab (locked: D6). Reads wait again from here. */
export function forgetKey(): void {
  if (raw) raw.fill(0);
  raw = null;
  webKey = null;
}
/** Resolves once this tab holds the key. */
export function whenKey(): Promise<void> {
  return raw ? Promise.resolve() : new Promise((r) => waiters.push(r));
}
export const newDataKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

function need(): Uint8Array {
  if (!raw) throw new Error('the collection on this device is encrypted and this tab does not hold its key (it is locked)');
  return raw;
}
function needWeb(): CryptoKey {
  if (!webKey) throw new Error('the collection on this device is encrypted and this tab does not hold its key (it is locked)');
  return webKey;
}
const pack = (iv: Uint8Array, body: Uint8Array): Uint8Array => { const o = new Uint8Array(13 + body.length); o[0] = VERSION; o.set(iv, 1); o.set(body, 13); return o; };
function unpack(x: Uint8Array): { iv: Uint8Array; body: Uint8Array } {
  if (!(x instanceof Uint8Array) || x.length < 29 || x[0] !== VERSION) throw new Error('a sealed record of an unknown form');
  return { iv: x.subarray(1, 13), body: x.subarray(13) };
}
const sealSync = (plain: Uint8Array, aad: Uint8Array): Uint8Array => { const iv = crypto.getRandomValues(new Uint8Array(12)); return pack(iv, gcmSeal(need(), iv, plain, aad)); };
const openSync = (x: Uint8Array, aad: Uint8Array): Uint8Array => { const { iv, body } = unpack(x); return gcmOpen(need(), iv, body, aad); };
async function sealWeb(plain: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return pack(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource }, needWeb(), plain as BufferSource)));
}
async function openWeb(x: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const { iv, body } = unpack(x);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource }, needWeb(), body as BufferSource));
}

/* ---- changes ---- */
/** A change as the vault keeps it sealed: everything but its value, and the value sealed (`x`). */
export type SealedChange = Omit<Change, 'value'> & { x: Uint8Array };
export type StoredChange = Change | SealedChange;
export const isSealedChange = (r: unknown): r is SealedChange => !!r && typeof r === 'object' && (r as { x?: unknown }).x instanceof Uint8Array && !('value' in (r as object));
const changeAad = (c: { t: string; kind: string; id: string; field: string }) => enc.encode(`c\u0000${c.t}\u0000${c.kind}\u0000${c.id}\u0000${c.field}`);
const withX = (c: Change, x: Uint8Array): SealedChange => { const { value: _v, ...rest } = c; void _v; return { ...rest, x }; };
const withValue = (r: SealedChange, plain: Uint8Array): Change => { const { x: _x, ...rest } = r; void _x; return { ...rest, value: JSON.parse(dec.decode(plain)) } as Change; };

export const sealChangeSync = (c: Change): SealedChange => withX(c, sealSync(enc.encode(JSON.stringify(c.value ?? null)), changeAad(c)));
export function openChangeSync(r: StoredChange): Change {
  return isSealedChange(r) ? withValue(r, openSync(r.x, changeAad(r))) : r;
}
export async function sealChange(c: Change): Promise<SealedChange> {
  return withX(c, await sealWeb(enc.encode(JSON.stringify(c.value ?? null)), changeAad(c)));
}
export async function openChange(r: StoredChange): Promise<Change> {
  return isSealedChange(r) ? withValue(r, await openWeb(r.x, changeAad(r))) : r;
}
/** A page's worth of changes, opened in parallel, in their order. */
export async function openChanges(rs: StoredChange[]): Promise<Change[]> {
  if (!rs.some(isSealedChange)) return rs as Change[];
  const out = new Array<Change>(rs.length);
  for (let i = 0; i < rs.length; i += 2000) {
    const part = await Promise.all(rs.slice(i, i + 2000).map(openChange));
    for (let j = 0; j < part.length; j++) out[i + j] = part[j];
  }
  return out;
}

/* ---- meta records ---- */
/** A meta record kept sealed: its value as JSON, sealed and bound to its key. */
export interface SealedMeta { '#sealed': Uint8Array }
export const isSealedMeta = (v: unknown): v is SealedMeta => !!v && typeof v === 'object' && (v as Record<string, unknown>)['#sealed'] instanceof Uint8Array;
const metaAad = (k: string) => enc.encode(`m\u0000${k}`);
export function sealMetaSync(k: string, v: unknown): SealedMeta {
  return { '#sealed': sealSync(enc.encode(JSON.stringify(v ?? null)), metaAad(k)) };
}
export function openMetaSync(k: string, v: unknown): unknown {
  return isSealedMeta(v) ? JSON.parse(dec.decode(openSync(v['#sealed'], metaAad(k)))) : v;
}

/* ---- the fold snapshot's records ---- */
export async function sealJson(label: string, v: unknown): Promise<Uint8Array> {
  return sealWeb(enc.encode(JSON.stringify(v)), enc.encode(`j\u0000${label}`));
}
export async function openJson<T>(label: string, x: Uint8Array): Promise<T> {
  return JSON.parse(dec.decode(await openWeb(x, enc.encode(`j\u0000${label}`)))) as T;
}

/* ---- photographs ---- */
export async function sealBytes(id: string, part: 'full' | 'small', b: Uint8Array): Promise<Uint8Array> {
  return sealWeb(b, enc.encode(`p\u0000${id}\u0000${part}`));
}
export async function openBytes(id: string, part: 'full' | 'small', x: Uint8Array): Promise<Uint8Array> {
  return openWeb(x, enc.encode(`p\u0000${id}\u0000${part}`));
}

/* ---- the wraps ---- */
async function passKek(pass: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function syncKek(canonical: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(`cultifolio-sync-key:${canonical}`) as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: enc.encode('cultifolio-device-data-key') as BufferSource }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function wrapUnder(kek: CryptoKey, dek: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return b64(pack(iv, new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode('cultifolio-dek') as BufferSource }, kek, dek as BufferSource))));
}
async function unwrapUnder(kek: CryptoKey, x: string): Promise<Uint8Array | null> {
  try {
    const { iv, body } = unpack(unb64(x));
    const k = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode('cultifolio-dek') as BufferSource }, kek, body as BufferSource));
    return k.length === 32 ? k : null;
  } catch {
    return null;
  }
}
export async function wrapPass(dek: Uint8Array, pass: string, rounds = WRAP_ROUNDS): Promise<SealRecord['pass']> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), rounds, x: await wrapUnder(await passKek(pass, salt, rounds), dek) };
}
export async function wrapSyncKey(dek: Uint8Array, canonical: string): Promise<SealRecord['keys'][number]> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), x: await wrapUnder(await syncKek(canonical, salt), dek) };
}
/** The data key the passcode opens, or null. */
export async function unwrapPass(rec: SealRecord, pass: string): Promise<Uint8Array | null> {
  return unwrapUnder(await passKek(pass, unb64(rec.pass.salt), rec.pass.rounds), rec.pass.x);
}
/** The data key a sync key opens (any this device synced with), or null. */
export async function unwrapSyncKey(rec: SealRecord, canonical: string): Promise<Uint8Array | null> {
  for (const k of rec.keys) {
    const got = await unwrapUnder(await syncKek(canonical, unb64(k.salt)), k.x);
    if (got) return got;
  }
  return null;
}
/** A stored seal record, validated; null when there is none (the vault is plain). */
export function readSeal(v: unknown): SealRecord | null {
  const o = v as Partial<SealRecord> | null | undefined;
  if (!o || o.v !== 1 || !o.pass || typeof o.pass.salt !== 'string' || typeof o.pass.x !== 'string' || typeof o.pass.rounds !== 'number' || !Array.isArray(o.keys)) return null;
  return { v: 1, pass: o.pass, keys: o.keys.filter((k) => k && typeof k.salt === 'string' && typeof k.x === 'string') };
}

/* ---- the hand-over between tabs (D6) ---- */
const KEY_CHANNEL = 'cultifolio-key';
let chan: BroadcastChannel | null = null;
function channel(): BroadcastChannel | null {
  if (chan || typeof BroadcastChannel === 'undefined') return chan;
  chan = new BroadcastChannel(KEY_CHANNEL);
  chan.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as { need?: string } | null;
    // A tab that holds the key answers a reloaded tab of this app that asks for it. Same origin only (BroadcastChannel).
    if (m && typeof m.need === 'string' && raw) chan?.postMessage({ to: m.need, key: raw.slice() });
  });
  return chan;
}
/** Answer other tabs' asks from now on (called once the page starts). */
export const listenForKeyAsks = (): void => void channel();
/** Ask the other open tabs of this app for the key; resolves with it, or null after `ms` with no answer. */
export function askOtherTabs(ms = 700): Promise<Uint8Array | null> {
  const c = channel();
  if (!c) return Promise.resolve(null);
  const me = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (k: Uint8Array | null) => { clearTimeout(t); c.removeEventListener('message', on); resolve(k); };
    const on = (e: MessageEvent) => { const m = e.data as { to?: string; key?: unknown } | null; if (m?.to === me && m.key instanceof Uint8Array && m.key.length === 32) done(m.key); };
    const t = setTimeout(() => done(null), ms);
    c.addEventListener('message', on);
    c.postMessage({ need: me });
  });
}
