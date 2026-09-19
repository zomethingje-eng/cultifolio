/** Wire limits, shared by the Worker and the client so a device never makes something the server will refuse. */
export const MAX_BATCH_BYTES = 16 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
/** Sealed-blob overhead: version, IV, GCM tag, and the photo pack's length word. */
export const SEAL_OVERHEAD = 1 + 12 + 16 + 4;
