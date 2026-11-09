/**
 * Attachments (round eighty-seven, t3; plan F9): a plant's papers, a CITES permit or certificate, a phytosanitary
 * certificate, an invoice, kept with the plant as a PDF, a JPEG or a PNG.
 *
 * Kept as photographs are, so every version of the app syncs, backs up, restores and keeps them, and none needs a new
 * record kind (a kind round eighty-six does not know refuses a whole sync batch):
 *
 * - The record is a `photo` record with `acc`, `d`, `bytes`, `sha`, `caption`, and three fields a photograph never has,
 *   `mime`, `fileName` and `doc`. It has no `w` and `h`, which a photograph cannot be shown without (`REQUIRED_FIELDS`), so
 *   a version that does not know attachments keeps it as a record waiting for fields, never shows it as a photograph or
 *   takes it for a plant's cover, and still syncs and backs up its bytes (it carries every photo record not removed,
 *   whole or waiting: round thirty-seven).
 * - The bytes go in the photo store under the record's id. Every version's backup reader refuses a photo entry that is
 *   not a JPEG, and an older version that synced an attachment writes it into its own backups as a photograph; so the
 *   file is stored behind a JPEG of one grey pixel (`ENVELOPE`, 159 bytes), whole and unchanged after it, and the
 *   thumbnail slot holds the envelope alone. Every reader takes both for JPEGs; this version reads the file after the
 *   envelope. The record's `sha` is of the stored bytes, envelope and file, so a pull checks them as it checks a
 *   photograph's.
 *
 * On the device the bytes are kept as a photograph's are: in the browser's own database, as they are. The vault is
 * encrypted for sync and on the server, not on the device (see /about/how#lock).
 */

/** A JPEG of one grey pixel, made once and fixed here: the bytes every attachment is stored behind. */
export const ENVELOPE = hexBytes(
  'ffd8ffe000104a46494600010100000100010000ffdb004300100b0c0e0c0a100e0d0e1211101318281a181616183123251d283a333d3c3933383740485c4e404457453738506d51575f626768673e4d71797064785c656763ffc0000b080001000101011100ffc40014000100000000000000000000000000000006ffc40014100100000000000000000000000000000000ffda0008010100003f0048ffd9'
);
function hexBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The largest file taken: 10 MB, under the sync server's 12 MB for a photograph with the envelope and the seal. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** A file name is kept to this many characters. */
export const FILE_NAME_MAX = 120;
/** A caption is kept to this many characters. */
export const CAPTION_MAX = 200;
/** At most this many attachments a plant: a plant's papers, not an archive. */
export const MAX_PER_PLANT = 30;
/**
 * The most the papers of a whole collection may hold, as their files: 300 MB (round eighty-seven, the stage 3 fixes; S2).
 * Ten megabytes a paper and thirty a plant bound one plant, not the collection, and three things bound the collection:
 * the sync vault holds 2 GB in all, photographs and the log included, and a log batch it refuses for room is a change
 * that does not sync (src/lib/server/sync.ts, MAX_BYTES); a restore, and the lock's way back by a backup file, read the
 * whole file into the phone's memory; and a phone's browser gives a tab a few hundred megabytes before it is closed.
 * 300 MB is under a sixth of the vault, leaving the rest to photographs and the log, and a backup carrying all of it
 * still opens on a phone. The Backup page shows what the papers hold of it, and warns from `PAPERS_WARN` of it.
 */
export const PAPERS_MAX_BYTES = 300 * 1024 * 1024;
/** The share of `PAPERS_MAX_BYTES` from which the Backup page warns. */
export const PAPERS_WARN = 0.8;
/** Why a paper of this size is refused, given what the collection's papers hold already, or null. */
export function papersFullError(held: number, size: number): string | null {
  if (held + size <= PAPERS_MAX_BYTES) return null;
  return `The papers of a collection are kept up to ${PAPERS_MAX_BYTES / 1048576} MB in all, and yours hold ${sizeWords(held)}: this ${sizeWords(size)} file would pass it. Remove a paper you no longer need first.`;
}

export const MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type Mime = (typeof MIMES)[number];
export const DOCS = ['cites', 'phyto', 'invoice', 'other'] as const;
export type Doc = (typeof DOCS)[number];
export const DOC_WORDS: Record<Doc, string> = { cites: 'CITES permit or certificate', phyto: 'Phytosanitary certificate', invoice: 'Invoice or receipt', other: 'Other paper' };
/** The file's extension when it is saved again. */
export const EXT: Record<Mime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** The type a file's own first bytes say, whatever its name or the browser's guess: a PDF, a JPEG or a PNG; null for anything else. */
export function sniff(b: Uint8Array): Mime | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'; // %PDF-
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  return null;
}

/** Why a file is not taken, in a sentence, or null. */
export function fileError(b: Uint8Array, name: string): string | null {
  if (!b.length) return `${name} is empty.`;
  if (b.length > MAX_ATTACHMENT_BYTES) return `${name} is ${(b.length / 1048576).toFixed(1)} MB; the most an attachment can be is ${MAX_ATTACHMENT_BYTES / 1048576} MB.`;
  if (!sniff(b)) return `${name} is not a PDF, a JPEG or a PNG.`;
  return null;
}

/** The bytes as stored: the envelope, then the file whole. */
export function wrap(file: Uint8Array): Uint8Array {
  const out = new Uint8Array(ENVELOPE.length + file.length);
  out.set(ENVELOPE, 0);
  out.set(file, ENVELOPE.length);
  return out;
}

/** The file from the stored bytes, or null when they do not start with the envelope (not an attachment, or damaged). */
export function unwrap(stored: Uint8Array): Uint8Array | null {
  if (stored.length <= ENVELOPE.length) return null;
  for (let i = 0; i < ENVELOPE.length; i++) if (stored[i] !== ENVELOPE[i]) return null;
  return stored.subarray(ENVELOPE.length);
}

/** A file name made safe to keep and show: no path, no control or format character, cut to `FILE_NAME_MAX`. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const out = Array.from(base.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim()).slice(0, FILE_NAME_MAX).join('');
  return out || 'attachment';
}

export interface Attachment {
  id: string;
  acc: string;
  d: string;
  mime: Mime;
  fileName: string;
  doc: Doc;
  caption: string | null;
  bytes: number;
  sha: string | null;
}

/**
 * The attachment a record is, validated on read, or null: a photo record not removed, with an `acc`, a day, a size, and a
 * type this version opens. A photograph (one with `w` and `h`) is never one, whatever else it carries. A `doc` this
 * version does not know is read as "other"; a name or a caption past its length is cut.
 */
export function attachmentOf(r: { kind?: string; id: string; _deleted?: boolean; [k: string]: unknown } | null | undefined): Attachment | null {
  if (!r || r.kind !== 'photo' || r._deleted) return null;
  if (r.w != null || r.h != null) return null;
  if (typeof r.mime !== 'string' || !(MIMES as readonly string[]).includes(r.mime)) return null;
  if (typeof r.acc !== 'string' || !r.acc || typeof r.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d)) return null;
  if (typeof r.bytes !== 'number' || !Number.isInteger(r.bytes) || r.bytes < 0 || r.bytes > MAX_ATTACHMENT_BYTES) return null;
  const doc = typeof r.doc === 'string' && (DOCS as readonly string[]).includes(r.doc) ? (r.doc as Doc) : 'other';
  const fileName = typeof r.fileName === 'string' && r.fileName.trim() ? cleanName(r.fileName) : `attachment.${EXT[r.mime as Mime]}`;
  const caption = typeof r.caption === 'string' && r.caption.trim() ? Array.from(r.caption).slice(0, CAPTION_MAX).join('') : null;
  return { id: r.id, acc: r.acc, d: r.d, mime: r.mime as Mime, fileName, doc, caption, bytes: r.bytes, sha: typeof r.sha === 'string' ? r.sha : null };
}

/** Whether a record is an attachment's, by its shape alone, as `attachmentOf` reads it: used to keep it out of the count of records waiting for a newer version. */
export const isAttachmentRecord = (r: { kind?: string; id: string; _deleted?: boolean; [k: string]: unknown }): boolean => attachmentOf(r) != null;

/** A size in words: "312 kB", "2.4 MB". */
export const sizeWords = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1048576).toFixed(1)} MB`);
