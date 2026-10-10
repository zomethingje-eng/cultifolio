/**
 * A photograph's generations and its pointer, read the same way by the Worker (sync.ts) and by the vault's counter object
 * (counters.ts), whose sweep of unnamed generations needs them too (round sixty-three; S1). This module imports nothing,
 * since counters.ts is bundled on its own by wrangler and cannot import sync.ts (which imports the framework).
 *
 *   vault/<id>/photo/<photoId>.bin       the name's first generation
 *   vault/<id>/photo/<photoId>.g<digits> a later generation (stored when a removed photograph is stored again)
 *   vault/<id>/photoref/<photoId>.json   the pointer: { g } naming the generation it holds, or { g: null, drop, at, was }
 *                                        with a removal's receipt. Absent: the first generation is the photograph.
 */

/**
 * A photograph's pointer as read: whether there is one and its etag, the key its bytes are under now (null: removed), and
 * the removal's receipt, with the generation that removal took (`was`: 'bin' or a `g…` suffix; null in a receipt
 * written before it was recorded).
 */
export type PhotoRef = { exists: boolean; etag: string | null; key: string | null; removed: { drop: string; at: number; was: string | null } | null; unreadable?: true; body?: Record<string, unknown> };
/**
 * A pointer that is there and could not be read as one (its body read failed, or it has a shape this code does not
 * know): it is not known what it names, so nothing may be taken as unnamed by it (round sixty-three; the server review
 * of the round, R3 2: the midnight sweep read such a pointer as naming nothing and removed a revived photograph's live
 * generation). `unnamedGenerations` throws this; the sweep keeps its mark and the Worker's touch logs it.
 */
export class PointerUnreadable extends Error {
  constructor(name: string) { super(`the pointer of ${name} could not be read`); this.name = 'PointerUnreadable'; }
}
/** A generation's suffix: `g` and base-36 digits, never `bin` (the first generation's). */
export const GEN = /^g[0-9a-z]{6,40}$/;
export const refKey = (name: string) => name.replace('/photo/', '/photoref/').replace(/\.bin$/, '.json');
export const genKey = (name: string, g: string) => name.replace(/\.bin$/, `.${g}`);
/**
 * Where a photograph's bytes are now (round sixty-two; decision 7). No pointer: the name's first generation, under the
 * name itself, which is where every photograph stored before round sixty-two lies, so those are read where they are and
 * nothing is moved (read-through).
 */
export async function photoRef(r2: R2Bucket, name: string): Promise<PhotoRef> {
  const o = await r2.get(refKey(name));
  if (!o) return { exists: false, etag: null, key: name, removed: null };
  type Ref = { g?: unknown; drop?: unknown; at?: unknown; was?: unknown };
  const p = await o.json<Ref>().catch(() => null);
  // `body`: the pointer as read, so the sweep can write it back under its own etag (round sixty-seven; triage-66 S3).
  const body = p && typeof p === 'object' ? (p as Record<string, unknown>) : undefined;
  // 'bin': the first generation, named by a claim on it (round sixty-two; the server review, 1).
  if (p && p.g === 'bin') return { exists: true, etag: o.etag ?? null, key: name, removed: null, body };
  if (p && typeof p.g === 'string' && GEN.test(p.g)) return { exists: true, etag: o.etag ?? null, key: genKey(name, p.g), removed: null, body };
  const was = typeof p?.was === 'string' && (p.was === 'bin' || GEN.test(p.was)) ? p.was : null;
  // A removal's receipt has `g: null`, a `drop` and an `at` (every receipt `point` has written). Anything else (a body
  // that could not be read, a shape this code does not know) is unreadable: read as removed with no proof, as before, so
  // a store moves it (its write is conditional on this etag), but flagged, so nothing is removed on its word (round
  // sixty-three; R3 2).
  const receiptShape = !!p && p.g == null && typeof p.drop === 'string' && typeof p.at === 'number';
  return { exists: true, etag: o.etag ?? null, key: null, removed: { drop: typeof p?.drop === 'string' ? p.drop : '', at: typeof p?.at === 'number' ? p.at : 0, was }, ...(receiptShape ? { body } : { unreadable: true as const }) };
}

/**
 * Write a pointer back as it was read, with a fresh `n`, only if it is still the one read (R2's conditional write): true
 * when written. Done before any unnamed generation is deleted (round sixty-seven; triage-66 S3, S-D2, R45-21): an upload
 * whose own pointer write stalled past its hold read the pointer before, so that write now fails its condition, and the
 * upload takes its generation off and asks its device to wait, where it landed after the delete and named bytes that
 * were gone. The fresh `n` matters: R2's etag is the MD5 of the body, so the same body written back keeps the same etag.
 */
export async function repoint(r2: R2Bucket, name: string, ref: PhotoRef): Promise<boolean> {
  if (!ref.exists || !ref.etag || !ref.body || ref.unreadable) return false;
  const body = JSON.stringify({ ...ref.body, n: crypto.randomUUID() });
  return (await r2.put(refKey(name), body, { httpMetadata: { contentType: 'application/json' }, onlyIf: { etagMatches: ref.etag } })) !== null;
}

/** How old a generation nothing names must be before it is taken for an upload cut off between its two writes: past the longest upload, as a lease is. */
export const STRAY_MS = 10 * 60_000;

/**
 * The generations of a photograph that its pointer does not name (round sixty-two; moved here in round sixty-three):
 * `old`, the keys of those at least `STRAY_MS` old, which may be removed; `young`, how many are younger, which may be an
 * upload between storing its bytes and moving the pointer to them, and are left. Null when the photograph has no pointer:
 * then its first generation is the photograph, and no other was ever stored. The first generation (`.bin`) is unnamed
 * too once the pointer names something else: a removal cut off after its receipt left it there, and an upload that
 * stalled past its hold can write it after one. Throws `PointerUnreadable` when the pointer is there and cannot be read.
 *
 * Round sixty-seven (triage-66 S4; IND-8, R45-21): the listing is paged by R2's cursor, at most `GEN_LIST_PAGES` pages,
 * and `complete` says whether it reached the end. It read one page of a hundred and ignored `truncated`, so a photograph
 * with more generations than that was taken as swept, its mark dropped, with strays left. `ref` is the pointer as read,
 * for `repoint`.
 */
export async function unnamedGenerations(r2: R2Bucket, name: string, now: number): Promise<{ old: string[]; young: number; complete: boolean; ref: PhotoRef } | null> {
  const ref = await photoRef(r2, name);
  if (!ref.exists) return null;
  if (ref.unreadable) throw new PointerUnreadable(name); // not known what it names: nothing is unnamed on its word (R3 2)
  const prefix = name.replace(/\.bin$/, '.');
  const out = { old: [] as string[], young: 0, complete: false, ref };
  let cursor: string | undefined;
  for (let page = 0; page < GEN_LIST_PAGES; page++) {
    const r = await r2.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const o of r.objects) {
      const g = o.key.slice(prefix.length);
      if (o.key === ref.key || !(GEN.test(g) || g === 'bin')) continue;
      if (now - o.uploaded.getTime() < STRAY_MS) out.young++;
      else out.old.push(o.key);
    }
    // A listing that says it goes on and gives no cursor cannot be followed: it is not complete.
    if (!r.truncated) { out.complete = true; break; }
    if (!r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}
/** Pages of a thousand generations one look at a photograph lists; past them, its mark stays for the next run (round sixty-seven; S4). */
export const GEN_LIST_PAGES = 5;

/**
 * A removed object's give-back receipt: its key and R2's `version`, which is unique per upload, so the same bytes
 * uploaded again under the same name are a new receipt (round sixty). An object read without a version (a bucket or a
 * stand-in that gives none) keeps the receipt of before, its etag and upload time.
 */
export function receipt(key: string, o: { etag?: string; version?: string; uploaded?: Date }): string {
  return o.version ? `${key}:v:${o.version}` : `${key}:${o.etag}:${o.uploaded?.getTime?.() ?? ''}`;
}
