/** Wire limits, shared by the Worker and the client so a device never makes something the server will refuse. */
export const MAX_BATCH_BYTES = 16 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
/** Sealed-blob overhead: version, IV, GCM tag, and the photo pack's length word. */
export const SEAL_OVERHEAD = 1 + 12 + 16 + 4;

/** How far behind its cursor a client re-reads (the server subtracts this from `since`), so a put that committed a little late is still seen. */
export const OVERLAP_MS = 60_000;

/** The push headers, named once for the device that sends them and the Worker that reads them (round twenty-three, 10). */
export const PUSH_HEADERS = { batch: 'x-batch', plain: 'x-batch-plain', device: 'x-device' } as const;
/**
 * The name the server files a batch under: the hour (in ms, 13 digits) of the batch's last change, a fixed counter,
 * the pushing device's id and twelve hex digits of the keyed fingerprint of the content.
 */
export const batchName = (lastWall: number, device: string, fingerprint: string) => `${String(Math.floor(lastWall / 3600_000) * 3600_000).padStart(13, '0')}-0000-${device || 'dev'}-${fingerprint.slice(0, 12)}`;
/** The `after` parameter of a listing page: `<arrival ms>:<batch key>`. */
export const listAfter = (at: number, key: string) => `${at}:${encodeURIComponent(key)}`;
