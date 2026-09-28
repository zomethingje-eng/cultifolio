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
/** What a batch name must look like to be stored: the HLC-shaped hour and counter, the device, and the optional twelve-digit fingerprint (older names carry a full HLC and no fingerprint). The Worker refuses anything else. */
export const BATCH_NAME = /^\d{13}-[0-9a-f]{4,6}-[a-z0-9]{1,16}(-[0-9a-f]{12})?$/;
/** The plaintext a log batch seals: the format version, the pushing device and its changes. */
export const logBatch = <C>(device: string, changes: C[]) => ({ v: 1, device, changes });
/** The status each refusal answers with, named once so the formats page's figures are read from here (round twenty-six, 12). */
export const STATUS = { differentContent: 409, tooBig: 413, rateLimited: 429, ceilings: 503, full: 507 } as const;
/** The `after` parameter of a listing page: `<arrival ms>:<batch key>`. */
export const listAfter = (at: number, key: string) => `${at}:${encodeURIComponent(key)}`;
