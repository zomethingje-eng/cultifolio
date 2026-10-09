/** Wire limits, shared by the Worker and the client so a device never makes something the server will refuse. */
export const MAX_BATCH_BYTES = 16 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
/** Sealed-blob overhead: version, IV, GCM tag, and the photo pack's length word. */
export const SEAL_OVERHEAD = 1 + 12 + 16 + 4;

/** How far behind its cursor a client re-reads (the server subtracts this from `since`), so a put that committed a little late is still seen. */
/** How far ahead of this device's clock the pull cursor may be moved by a listing's arrival times (round thirty-eight, R1-5). */
export const CURSOR_SLACK_MS = 10 * 60 * 1000;
export const OVERLAP_MS = 60_000;

/** The push headers, named once for the device that sends them and the Worker that reads them (round twenty-three, 10). */
export const PUSH_HEADERS = { batch: 'x-batch', plain: 'x-batch-plain', device: 'x-device' } as const;
/** The proof a photograph's upload leaves with the server and its removal must repeat: the keyed fingerprint of `drop:<id>` under the vault's naming key, which only a key-holder can make (round fifty-one, 2). */
export const PHOTO_DROP_HEADER = 'x-photo-drop';
/** The header a photograph's removal may carry: when the device made it (ms), so an upload of the name after that is left alone (round sixty). Named here, beside the others both ends read, so the engine sends the name the Worker reads (round sixty-two, second pass; the self-review's N7). */
export const PHOTO_REMOVED_AT_HEADER = 'x-photo-removed-at';
/**
 * The name the server files a batch under: the hour (in ms, 13 digits) of the batch's last change, a fixed counter,
 * the pushing device's id and twelve hex digits of the keyed fingerprint of the content.
 */
export const batchName = (lastWall: number, device: string, fingerprint: string) => `${String(Math.floor(lastWall / 3600_000) * 3600_000).padStart(13, '0')}-0000-${device || 'dev'}-${fingerprint.slice(0, 12)}`;
/** What a batch name must look like to be stored, as `batchName` makes it: the hour, the fixed counter, the device and the twelve-digit fingerprint. The Worker refuses anything else. */
export const BATCH_NAME = /^\d{13}-0000-[a-z0-9]{1,16}-[0-9a-f]{12}$/;
/**
 * The plaintext a log batch seals: the format version, the pushing device and its changes. Version 2 when any change's
 * stamp carries the mark (the counter bit 0x800000, `isPastStamp` in $core/hlc, read here without the clock module so
 * the Worker's bundle does not take it; a test holds the two alike), version 1 otherwise (round sixty-two; B8). A build
 * of round sixty read the mark as a large counter and parked such a change where every later build folds it; it sets
 * aside any batch whose version is not 1, for a later build to read, so it waits rather than disagrees.
 *
 * `parked`: the stamps among `changes` the pushing device holds as parked (a change parked in an old vault and sent to a
 * new one, or a file's parked change merged in). A reader stores them as parked verdicts, as a backup's are, before it
 * folds the rest, so every device parks them alike and offers Apply; judged by this batch's arrival alone, a change
 * parked long ago is no longer far ahead, and it folded on the peers while its writer kept it parked. Such a batch is
 * version 2: a round-sixty-one build reads no `parked` and would fold them, so it sets the batch aside instead (round
 * sixty-two, second pass; the data review's 5).
 */
export const logBatch = <C extends { t: string }>(device: string, changes: C[], parked: readonly string[] = []) => (parked.length ? { v: 2, device, changes, parked: [...parked] } : { v: changes.some((c) => marked(c.t)) ? 2 : 1, device, changes });
/** The batch versions this build reads: a batch of any other is set aside, under its name, for a later build (round sixty-two). */
export const BATCH_VERSIONS: readonly number[] = [1, 2];
const marked = (t: string): boolean => {
  const end = t.indexOf('-', 14);
  return end > 14 && parseInt(t.slice(14, end), 16) >= 0x800000;
};
/** The header every sync request carries, which a page on another site cannot send without a preflight (round sixty-two; A31). */
export const SYNC_HEADER = 'x-cultifolio-sync';
/** The status each refusal answers with, named once so the formats page's figures are read from here (round twenty-six, 12). */
export const STATUS = { differentContent: 409, tooBig: 413, rateLimited: 429, ceilings: 503, full: 507 } as const;
/** The `after` parameter of a listing page: `<arrival ms>:<batch key>`. */
export const listAfter = (at: number, key: string) => `${at}:${encodeURIComponent(key)}`;
